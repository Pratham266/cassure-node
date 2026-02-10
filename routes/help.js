import express from 'express';
import { submitHelp } from '../controllers/helpController.js';

import { protect } from '../middleware/auth.js';

const router = express.Router();

router.post('/', protect, submitHelp);

export default router;
