import fs from 'fs';
import FormData from 'form-data';
import fetch from 'node-fetch';
import moment from 'moment';

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
    // Pass bank_name if provided in the body, otherwise it might be handled by logic or defaulted
    if (req.body.bankName) {
      formData.append('bank_name', req.body.bankName);
    }
    if (req.body.password) {
      formData.append('password', req.body.password);
    }
    
    // Call Python Scraper Service
    const pythonServiceUrl = process.env.PYTHON_SERVICE_URL ;
    const pythonApiKey = process.env.PYTHON_API_KEY;

    console.log(`🚀 Forwarding to Python Scraper: ${pythonServiceUrl}`);

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

    const result = await response.json();
    console.log('✅ Received response from Python Scraper');

    // NORMALIZE DATES (User Request: Date formatting moved to Node.js)
    if (result.transactions && Array.isArray(result.transactions)) {
       result.transactions = result.transactions.map(txn => {
         if (txn.date) {
            // Attempt to parse with multiple formats
            const parsed = moment(txn.date, [
              'DD-MM-YYYY', 'YYYY-MM-DD', 'MM-DD-YYYY', 
              'DD/MM/YY', 'DD-MM-YY', 'D-M-YYYY', 'D-M-YY',
              moment.ISO_8601
            ]);
            
            if (parsed.isValid()) {
               txn.date = parsed.format('DD-MM-YYYY');
            }
         }
         // NORMALIZE AMOUNT AND BALANCE (User Request: Convert to number, apply sign)
         if (txn.amount !== undefined && txn.amount !== null) {
            // Remove commas and convert to float
            let amountStr = String(txn.amount).replace(/,/g, '');
            let amountVal = parseFloat(amountStr);

            if (!isNaN(amountVal)) {
                 if (txn.type === 'DEBIT') {
                    txn.amount = -Math.abs(amountVal); // Ensure it's negative
                 } else if (txn.type === 'CREDIT') {
                    txn.amount = Math.abs(amountVal);  // Ensure it's positive
                 } else {
                    txn.amount = amountVal;
                 }
            }
         }

         if (txn.balance !== undefined && txn.balance !== null) {
            // Remove commas and convert to float
            let balanceStr = String(txn.balance).replace(/,/g, '');
            let balanceVal = parseFloat(balanceStr);
            if (!isNaN(balanceVal)) {
                txn.balance = balanceVal;
            }
         }
         return txn;
       });
    }

    // CALCULATE ACCURACY (User Request: OpBal + Txns = ClBal?)
    let accuracy = {
        openingBalance: 0,
        closingBalance: 0,
        calculatedClosingBalance: 0,
        isAccurate: false
    };

    if (result.transactions && result.transactions.length > 0) {
        // User requested: OPBAL => transaction[0].balance
        // NOTE: transaction[0].balance is technically the Closing Balance of the 1st transaction.
        // But per user instruction, we treat it as the anchor point.
        // Logic: verification from first txn to last txn.
        // We will sum amounts from index 1 to end and see if they match the change in balance.
        
        const firstTxn = result.transactions[0];
        const lastTxn = result.transactions[result.transactions.length - 1];

        // Ensure we have numbers
        const opBal = typeof firstTxn.balance === 'number' ? firstTxn.balance : 0;
        const clBal = typeof lastTxn.balance === 'number' ? lastTxn.balance : 0;
        
        // Sum of amounts from index 1 to end
        // Current Logic: Balance[0] + Sum(Amounts[1..n]) should equal Balance[n]
        let runningTotal = opBal;
        
        for (let i = 1; i < result.transactions.length; i++) {
             const amt = typeof result.transactions[i].amount === 'number' ? result.transactions[i].amount : 0;
             runningTotal += amt;
        }

        accuracy.openingBalance = opBal;
        accuracy.closingBalance = clBal;
        accuracy.calculatedClosingBalance = parseFloat(runningTotal.toFixed(2));
        
        // Check with small tolerance for float precision
        accuracy.isAccurate = Math.abs(accuracy.calculatedClosingBalance - clBal) < 0.1; 
    }
    
    // Add accuracy object to result
    result.Accuracy = accuracy;

    // Return the extracted data directly
    res.status(200).json({
      success: true,
      message: 'Statement processed successfully',
      data: result // Directly return the structured JSON from Python
    });

  } catch (error) {
    console.error('❌ Error processing statement:', error);
    res.status(500).json({
      success: false,
      message: 'Error processing statement',
      error: error.message
    });
  } finally {
    // Clean up file
    if (req.file && fs.existsSync(req.file.path)) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (cleanupError) {
        console.error('Error deleting temp file:', cleanupError);
      }
    }
  }
};
