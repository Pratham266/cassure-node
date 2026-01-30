import express from 'express';
import {
  uploadStatement,
  getStatements,
  getStatementById,
  deleteStatement
} from '../controllers/statementController.js';
import { protect } from '../middleware/auth.js';
import { upload, validatePageCount } from '../middleware/fileUpload.js';

const router = express.Router();

router.use(protect);

router.post('/upload', upload.single('statement'), validatePageCount, uploadStatement);
router.get('/', getStatements);
router.get('/:id', getStatementById);
router.delete('/:id', deleteStatement);

export default router;
