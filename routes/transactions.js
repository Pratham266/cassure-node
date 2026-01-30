import express from 'express';
import {
  getTransactions,
  getTransactionById,
  exportTransactions
} from '../controllers/transactionController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

router.use(protect);

router.get('/', getTransactions);
router.get('/export', exportTransactions);
router.get('/:id', getTransactionById);

export default router;
