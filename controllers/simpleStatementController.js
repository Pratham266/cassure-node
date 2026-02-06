import fs from 'fs';
import crypto from 'crypto';
import FormData from 'form-data';
import fetch from 'node-fetch';
import moment from 'moment';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const RESULTS_DIR = join(__dirname, '..', 'uploads', 'results');

if (!fs.existsSync(RESULTS_DIR)) {
  fs.mkdirSync(RESULTS_DIR, { recursive: true });
}

// Simple stateless upload - Proxy to Python Scraper
export const uploadAndProcess = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
    }

    console.log(`📄 Processing: ${req.file.originalname}`);

    // Create FormData for Python service
    const formData = new FormData();
    formData.append('file', fs.createReadStream(req.file.path));
    if (req.body.bankName) {
      formData.append('bank_name', req.body.bankName);
    }
    if (req.body.password) {
      formData.append('password', req.body.password);
    }
    
    // Call Python Scraper Service
    const pythonServiceUrl = process.env.PYTHON_SERVICE_URL;
    const pythonBaseUrl = pythonServiceUrl.replace('/parse', '');
    const pythonApiKey = process.env.PYTHON_API_KEY;

    console.log(`🚀 Forwarding to Python Scraper: ${pythonServiceUrl}`);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 300000); // 5 minute timeout

    const response = await fetch(pythonServiceUrl, {
      method: 'POST',
      headers: {
        'X-API-KEY': pythonApiKey,
        ...formData.getHeaders()
      },
      body: formData,
      signal: controller.signal
    }).finally(() => clearTimeout(timeout));

    if (!response.ok) {
        let errorText = await response.text();
        throw new Error(`Python service error: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const initialResult = await response.json();
    const pythonFileId = initialResult.file_id;
    console.log(`✅ Python processing complete. Requesting result file: ${pythonFileId}`);

    // Fetch the actual result file from Python
    const fileResponse = await fetch(`${pythonBaseUrl}/results/${pythonFileId}`, {
      headers: { 'X-API-KEY': pythonApiKey }
    });

    if (!fileResponse.ok) {
      throw new Error(`Failed to fetch result file from Python service: ${fileResponse.statusText}`);
    }

    const result = await fileResponse.json();

    // Trigger cleanup in Python immediately
    fetch(`${pythonBaseUrl}/results/${pythonFileId}`, {
      method: 'DELETE',
      headers: { 'X-API-KEY': pythonApiKey }
    }).catch(err => console.error('Error triggering Python cleanup:', err));

    // NORMALIZE DATES, AMOUNTS, AND BALANCE
    if (result.transactions && Array.isArray(result.transactions)) {
       result.transactions = result.transactions.map(txn => {
         // Date Normalization
         if (txn.date) {
            const parsed = moment(txn.date, [
              'DD-MM-YYYY', 'YYYY-MM-DD', 'MM-DD-YYYY', 
              'DD/MM/YY', 'DD-MM-YY', 'D-M-YYYY', 'D-M-YY',
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
    }

    // Check if transactions are in descending order and reverse them if so
    if (result.transactions && result.transactions.length > 1) {
      const firstDate = moment(result.transactions[0].date, 'DD-MM-YYYY');
      const lastDate = moment(result.transactions[result.transactions.length - 1].date, 'DD-MM-YYYY');
      
      if (firstDate.isAfter(lastDate)) {
        console.log("🔄 Transactions detected in descending order, reversing for accuracy calculation...");
        result.transactions.reverse();
      }
    }

    // CALCULATE ACCURACY
    let accuracy = { openingBalance: 0, closingBalance: 0, calculatedClosingBalance: 0, isAccurate: false };
    if (result.transactions && result.transactions.length > 0) {      
      const opBal = typeof result.transactions[0].balance === 'number' ? result.transactions[0].balance : 0;
      const clBal = typeof result.transactions[result.transactions.length - 1].balance === 'number' ? result.transactions[result.transactions.length - 1].balance : 0;
      let runningTotal = opBal;
      console.log("opening balance",opBal)
      for (let i = 1; i < result.transactions.length; i++) {
        runningTotal += (typeof result.transactions[i].amount === 'number' ? result.transactions[i].amount : 0);
      }
     
        accuracy = { 
          openingBalance: opBal, 
          closingBalance: clBal, 
          calculatedClosingBalance: parseFloat(runningTotal),
          isAccurate: Math.abs(runningTotal - clBal) < 0.1 
        };
    }
    result.Accuracy = accuracy;

    // Save locally for one-time frontend retrieval
    const localId = crypto.randomUUID();
    const localPath = join(RESULTS_DIR, `${localId}.json`);
    fs.writeFileSync(localPath, JSON.stringify({ ...result, fileName: req.file.originalname, bank: req.body.bankName || 'Unknown Bank' }));

    console.log(`💾 Result saved locally with ID: ${localId}`);

    res.status(200).json({
      success: true,
      resultId: localId
    });

  } catch (error) {
    console.error('❌ Error processing statement:', error);
    res.status(500).json({
      success: false,
      message: 'Error processing statement',
      error: error.message
    });
  } finally {
    if (req.file && fs.existsSync(req.file.path)) {
      try { fs.unlinkSync(req.file.path); } catch (e) { console.error('Error deleting temp file:', e); }
    }
  }
};

// Get stored result by ID and delete after sending
export const getResultById = async (req, res) => {
  try {
    const localPath = join(RESULTS_DIR, `${req.params.id}.json`);

    if (!fs.existsSync(localPath)) {
      return res.status(404).json({
        success: false,
        message: 'Result not found or already retrieved'
      });
    }

    const data = JSON.parse(fs.readFileSync(localPath, 'utf8'));


    try {
      if (fs.existsSync(localPath)) {
        fs.unlinkSync(localPath);
        console.log(`🗑️ Local result file deleted: ${req.params.id}`);
      }
    } catch (e) {
      console.error('Error deleting local result file:', e);
    }
   
    

    // Send response
    res.status(200).json({
      success: true,
      data: data
    });

  } catch (error) {
    console.error('❌ Error fetching result:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching result',
      error: error.message
    });
  }
};
