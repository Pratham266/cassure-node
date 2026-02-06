import express from 'express';
import { uploadAndProcess, getResultById } from '../controllers/simpleStatementController.js';
import { protect } from '../middleware/auth.js';
import { upload, validatePageCount } from '../middleware/fileUpload.js';

const router = express.Router();

router.use(protect);

// Upload and process (returns resultId)
router.post('/process', upload.single('statement'), validatePageCount, uploadAndProcess);

// Retrieve and cleanup (one-time access)
router.get('/result/:id', getResultById);

export default router;
