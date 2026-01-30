import express from 'express';
import { uploadAndProcess } from '../controllers/simpleStatementController.js';
import { protect } from '../middleware/auth.js';
import { upload, validatePageCount } from '../middleware/fileUpload.js';

const router = express.Router();

router.use(protect);

// Single endpoint - upload and get results immediately
router.post('/process', upload.single('statement'), validatePageCount, uploadAndProcess);

export default router;
