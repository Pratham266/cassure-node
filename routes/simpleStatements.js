import express from 'express';
import { uploadAndProcess, getDashboardStats } from '../controllers/simpleStatementController.js';
import { protect } from '../middleware/auth.js';
import { upload, validatePageCount } from '../middleware/fileUpload.js';

const router = express.Router();

router.use(protect);

// Get Dashboard Statistics
router.get('/stats', getDashboardStats);

// Upload and process (returns streaming NDJSON)
router.post('/process', upload.single('statement'), validatePageCount, uploadAndProcess);

export default router;
