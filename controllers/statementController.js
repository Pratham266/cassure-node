import Statement from '../models/Statement.js';
import Transaction from '../models/Transaction.js';
import fs from 'fs';
import FormData from 'form-data';
import fetch from 'node-fetch';


export const uploadStatement = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
    }

    // Create statement record
    const statement = await Statement.create({
      userId: req.user.id,
      fileName: req.file.originalname,
      pageCount: req.pageCount,
      processingStatus: 'processing'
    });

    // Process document with Google Document AI (async)
    processDocumentAsync(statement._id, req.file.path, req.user.id);

    res.status(202).json({
      success: true,
      message: 'Statement uploaded successfully and is being processed',
      statementId: statement._id,
      status: 'processing'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error uploading statement',
      error: error.message
    });
  }
};

// Async processing function
async function processDocumentAsync(statementId, filePath, userId) {
  try {
    console.log(`🚀 Processing statement ${statementId} with Python Scraper`);

    const formData = new FormData();
    formData.append('file', fs.createReadStream(filePath));
    
    // Call Python Scraper Service
    const pythonServiceUrl = process.env.PYTHON_SERVICE_URL || 'http://127.0.0.1:8000/parse';
    const pythonApiKey = process.env.PYTHON_API_KEY;

    const response = await fetch(pythonServiceUrl, {
      method: 'POST',
      headers: {
        'X-API-KEY': pythonApiKey,
        ...formData.getHeaders()
      },
      body: formData
    });

    if (!response.ok) {
        throw new Error(`Python service error: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();
    
    // Adapt result to schema if necessary. Assuming Python returns matching structure or we map it.
    // The previous documentAIService returned: { rows: transactions, metadata, columns }
    // If Python returns the same structure, we candestructure.
    // If Python returns 'data' wrapper, handle that.
    // For now, assuming direct compatibility as per "exactly formatted data".
    
    // Fallback/Safety check for structure
    const transactions = result.transactions || result.rows || [];
    const metadata = result.metadata || {};
    // const columns = result.columns || [];

    // Update statement with metadata
    await Statement.findByIdAndUpdate(statementId, {
      processingStatus: 'completed',
      maskedAccountNumber: metadata.accountNumber,
      bankName: metadata.bankName,
      statementPeriod: metadata.statementPeriod,
      transactionCount: transactions.length
    });

    // Save transactions
    const transactionDocs = transactions.map(txn => ({
      ...txn,
      statementId,
      userId
    }));

    if (transactionDocs.length > 0) {
      await Transaction.insertMany(transactionDocs);
    }

    console.log(`✅ Processed statement ${statementId}: ${transactions.length} transactions`);
  } catch (error) {
    console.error(`❌ Error processing statement ${statementId}:`, error);
    
    // Update statement with error
    await Statement.findByIdAndUpdate(statementId, {
      processingStatus: 'failed',
      errorMessage: error.message
    });
  } finally {
      // Clean up file
      if (fs.existsSync(filePath)) {
          try {
              fs.unlinkSync(filePath);
          } catch (e) { console.error('Error deleting file', e); }
      }
  }
}

export const getStatements = async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    
    const statements = await Statement.find({ userId: req.user.id })
      .sort({ uploadDate: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .select('-__v');

    const count = await Statement.countDocuments({ userId: req.user.id });

    res.status(200).json({
      success: true,
      statements,
      totalPages: Math.ceil(count / limit),
      currentPage: page,
      total: count
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching statements',
      error: error.message
    });
  }
};

export const getStatementById = async (req, res) => {
  try {
    const statement = await Statement.findOne({
      _id: req.params.id,
      userId: req.user.id
    });

    if (!statement) {
      return res.status(404).json({
        success: false,
        message: 'Statement not found'
      });
    }

    res.status(200).json({
      success: true,
      statement
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching statement',
      error: error.message
    });
  }
};

export const deleteStatement = async (req, res) => {
  try {
    const statement = await Statement.findOne({
      _id: req.params.id,
      userId: req.user.id
    });

    if (!statement) {
      return res.status(404).json({
        success: false,
        message: 'Statement not found'
      });
    }

    // Delete associated transactions
    await Transaction.deleteMany({ statementId: statement._id });
    
    // Delete statement
    await statement.deleteOne();

    res.status(200).json({
      success: true,
      message: 'Statement and associated transactions deleted'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error deleting statement',
      error: error.message
    });
  }
};
