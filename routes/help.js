import express from 'express';
import { submitHelp } from '../controllers/helpController.js';

const router = express.Router();

router.post('/', submitHelp);

export default router;
