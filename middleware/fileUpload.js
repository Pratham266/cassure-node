import multer from 'multer';
import path from 'path';
import fs from 'fs';
import pdfParse from 'pdf-parse';

// Configure storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = './uploads/temp';
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `statement-${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

// File filter - only PDFs
const fileFilter = (req, file, cb) => {
  if (file.mimetype === 'application/pdf') {
    cb(null, true);
  } else {
    cb(new Error('Only PDF files are allowed'), false);
  }
};

// Multer configuration
export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024 // 10MB
  }
});

import { exec } from 'child_process';
import util from 'util';
const execPromise = util.promisify(exec);

// Middleware to validate page count and handle password protection
export const validatePageCount = async (req, res, next) => {
  if (!req.file) {
    return res.status(400).json({
      success: false,
      message: 'No file uploaded'
    });
  }

  try {
    let dataBuffer = fs.readFileSync(req.file.path);
    let pageCount = 0;

    try {
      // Try processing as standard PDF first
      const pdfData = await pdfParse(dataBuffer);
      pageCount = pdfData.numpages;
    } catch (parseError) {
      // Check if error is due to password protection
      if (parseError.message.includes('Password found') || 
          parseError.message.includes('No password given') ||
          parseError.name === 'PasswordException') {
        
        // If no password provided in request
        if (!req.body.password) {
          console.log('🔒 PDF is password protected and no password provided in request.');
          fs.unlinkSync(req.file.path);
          return res.status(422).json({
            success: false,
            code: 'PASSWORD_REQUIRED',
            message: 'This PDF is password protected. Please provide a password.'
          });
        }

        // If password IS provided, we skip Node-side validation and let Python handle it
        console.log('� PDF is password protected. Skipping Node.js page count validation and forwarding to Python.');
        req.pageCount = 0; // Unknown
        next();
        return; 
      } else {
        throw parseError; // Re-throw other errors
      }
    }
    

    // Attach page count to request
    req.pageCount = pageCount;
    next();
  } catch (error) {
    // Clean up file on error
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    console.error('PDF Validation Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Error validating PDF',
      error: error.message
    });
  }
};
