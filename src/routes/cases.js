import express from 'express';

import { createCase } from '../controllers/caseController.js';
import authenticate from '../middleware/authHandler.js';

const router = express.Router();

router.post('/', authenticate, createCase);

export default router;