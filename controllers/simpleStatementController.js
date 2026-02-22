import fs from 'fs';
import crypto from 'crypto';
import FormData from 'form-data';
import fetch from 'node-fetch';
import moment from 'moment';
import Statement from '../models/Statement.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const RESULTS_DIR = join(__dirname, '..', 'uploads', 'results');

if (!fs.existsSync(RESULTS_DIR)) {
  fs.mkdirSync(RESULTS_DIR, { recursive: true });
}

// Simple stateless upload - Proxy to Python Scraper with Streaming support
export const uploadAndProcess = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    console.log(`📄 Streaming Process: ${req.file.originalname}`);

    // Create FormData for Python service
    const formData = new FormData();
    formData.append('file', fs.createReadStream(req.file.path));
    if (req.body.bankName) formData.append('bank_name', req.body.bankName);
    if (req.body.password) formData.append('password', req.body.password);

    const pythonServiceUrl = process.env.PYTHON_SERVICE_URL;
    const pythonApiKey = process.env.PYTHON_API_KEY;

    console.log(`🚀 Forwarding to Python Scraper (Streaming): ${pythonServiceUrl}`);

    const response = await fetch(pythonServiceUrl, {
      method: 'POST',
      headers: {
        'X-API-KEY': pythonApiKey,
        ...formData.getHeaders()
      },
      body: formData
    });

    if (!response.ok) {
      let errorText = await response.text();
      throw new Error(`Python service error: ${response.status} ${response.statusText} - ${errorText}`);
    }

    // Set headers for streaming NDJSON to frontend
    res.setHeader('Content-Type', 'application/x-ndjson');
    res.setHeader('Transfer-Encoding', 'chunked');

    const reader = response.body;
    let buffer = '';

    const allTransactions = [];
    let streamMetadata = { pageCount: 0, bankName: req.body.bankName };

    reader.on('data', (chunk) => {
      buffer += chunk.toString();
      let lines = buffer.split('\n');
      buffer = lines.pop(); // Keep last incomplete line in buffer

      for (let line of lines) {
        if (!line.trim()) continue;
        try {
          let data = JSON.parse(line);

          if (data.type === 'metadata') {
            streamMetadata.pageCount = data.documentmetadata?.page_count || 0;
            if (data.bank) streamMetadata.bankName = data.bank;
          }

          // Perform normalization if it's page data
          if (data.type === 'page_data' && data.transactions) {
            data.transactions = data.transactions.map(txn => {
              // Date Normalization
              if (txn.date) {
                const parsed = moment(txn.date, [
                  'DD-MM-YYYY', 'YYYY-MM-DD', 'MM-DD-YYYY',
                  'DD/MM/YYYY', 'DD/MM/YY', 'DD-MM-YY', 'D-M-YYYY', 'D-M-YY',
                  'DD-MMM-YYYY', 'DD-MMM-YY', 'DD/MMM/YYYY',
                  'DD MMM YYYY hh:mm A', 'DD MMM YYYY', 'DD MMM YY',
                  moment.ISO_8601
                ]);
                if (parsed.isValid()) txn.date = parsed.format('DD-MM-YYYY');
              }
              // Amount Normalization 
              if (txn.amount !== undefined && txn.amount !== null) {
                let amountVal = parseFloat(String(txn.amount).replace(/,/g, ''));
                if (!isNaN(amountVal)) {
                  txn.amount = txn.type === 'DEBIT' ? -Math.abs(amountVal) : Math.abs(amountVal);
                }
              }
              // Balance Normalization
              if (txn.balance !== undefined && txn.balance !== null) {
                let balanceVal = parseFloat(String(txn.balance).replace(/,/g, ''));
                if (!isNaN(balanceVal)) txn.balance = balanceVal;
              }
              return txn;
            });
            // Accumulate for accuracy calculation at the end
            allTransactions.push(...data.transactions);
          }

          // Write normalized data back to client stream
          res.write(JSON.stringify(data) + '\n');
        } catch (e) {
          console.error('Error parsing NDJSON chunk:', e);
        }
      }
    });

    reader.on('end', async () => {
      if (buffer.trim()) {
        try {
          let data = JSON.parse(buffer);
          if (data.type === 'page_data' && data.transactions) {
            allTransactions.push(...data.transactions);
          }
          res.write(JSON.stringify(data) + '\n');
        } catch (e) { }
      }

      let accuracyResult = { isAccurate: true };
      let processingStatus = 'completed';
      let errorMessage = '';

      // CALCULATE ACCURACY at the end of the stream
      if (allTransactions.length > 0) {
        // Check if transactions are in descending order and reverse them if so
        if (allTransactions.length > 1) {
          const firstDate = moment(allTransactions[0].date, 'DD-MM-YYYY');
          const lastDate = moment(allTransactions[allTransactions.length - 1].date, 'DD-MM-YYYY');

          if (firstDate.isValid() && lastDate.isValid() && firstDate.isAfter(lastDate)) {
            console.log("🔄 Transactions detected in descending order, reversing for accuracy calculation...");
            allTransactions.reverse();
          }
        }

        const opBal = typeof allTransactions[0].balance === 'number' ? allTransactions[0].balance : 0;
        const clBal = typeof allTransactions[allTransactions.length - 1].balance === 'number' ? allTransactions[allTransactions.length - 1].balance : 0;
        let runningTotal = opBal;

        // Skip index 0 as it's the opening balance anchor
        for (let i = 1; i < allTransactions.length; i++) {
          runningTotal += (typeof allTransactions[i].amount === 'number' ? allTransactions[i].amount : 0);
        }

        accuracyResult = {
          openingBalance: opBal,
          closingBalance: clBal,
          calculatedClosingBalance: parseFloat(runningTotal.toFixed(2)),
          isAccurate: Math.abs(runningTotal - clBal) < 0.1
        };

        console.log(`📊 Accuracy calculated: ${accuracyResult.isAccurate ? 'PASS' : 'FAIL'}`);

        // Send accuracy as the final record in the stream
        res.write(JSON.stringify({ type: 'accuracy', accuracy: accuracyResult }) + '\n');
      } else {
        // NO DATA FOUND CASE
        processingStatus = 'failed';
        errorMessage = 'No transactions found in this statement';
        accuracyResult.isAccurate = false;

        // Send error back to frontend in the stream
        res.write(JSON.stringify({
          type: 'error',
          message: 'No transactions found. Please ensure you have selected the correct bank and the PDF is not a scanned image.'
        }) + '\n');
      }

      // LOG ACTIVITY TO DATABASE (without storing transactions)
      try {
        await Statement.create({
          userId: req.user.id,
          fileName: req.file.originalname,
          pageCount: streamMetadata.pageCount || 0,
          bankName: streamMetadata.bankName || 'Unknown',
          processingStatus: processingStatus,
          transactionCount: allTransactions.length,
          isAccurate: accuracyResult.isAccurate,
          errorMessage: errorMessage
        });
        console.log(`📝 Activity logged (${processingStatus}): ${req.file.originalname}`);
      } catch (logError) {
        console.error('Failed to log statement activity:', logError);
      }

      res.end();
      console.log(`✅ Streaming complete for: ${req.file.originalname}`);
    });

    reader.on('error', (err) => {
      console.error('Stream reader error:', err);
      if (!res.headersSent) {
        res.status(500).json({ success: false, message: 'Streaming error', error: err.message });
      } else {
        res.end();
      }
    });

  } catch (error) {
    console.error('❌ Error in uploadAndProcess stream:', error);

    // LOG FAILURE TO DATABASE
    try {
      if (req.file) {
        await Statement.create({
          userId: req.user.id,
          fileName: req.file.originalname,
          bankName: req.body.bankName || 'Unknown',
          processingStatus: 'failed',
          errorMessage: error.message,
          isAccurate: false
        });
      }
    } catch (logError) {
      console.error('Failed to log failed statement:', logError);
    }

    if (!res.headersSent) {
      res.status(500).json({ success: false, message: 'Processing failed', error: error.message });
    }
  } finally {
    if (req.file && fs.existsSync(req.file.path)) {
      try { fs.unlinkSync(req.file.path); } catch (e) { console.error('Error deleting temp upload file:', e); }
    }
  }
};

// Get Dashboard Data
export const getDashboardStats = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const stats = await Statement.find({ userId: req.user.id })
      .sort({ uploadDate: -1 })
      .skip(skip)
      .limit(limit);

    const totalStatements = await Statement.countDocuments({ userId: req.user.id });
    const inaccurateStatements = await Statement.countDocuments({
      userId: req.user.id,
      isAccurate: false
    });

    // Average accuracy (mocked or calculated based on records)
    const accuracyRate = totalStatements > 0
      ? (((totalStatements - inaccurateStatements) / totalStatements) * 100).toFixed(1) + '%'
      : '100%';

    res.status(200).json({
      success: true,
      data: stats,
      pagination: {
        total: totalStatements,
        page,
        limit,
        pages: Math.ceil(totalStatements / limit)
      },
      summary: {
        totalStatements,
        inaccurateStatements,
        accuracyRate
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch dashboard stats', error: error.message });
  }
};
