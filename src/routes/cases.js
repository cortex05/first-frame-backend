import express from 'express';

import { createCase, updateCase } from '../controllers/caseController.js';
import authenticate from '../middleware/authHandler.js';

const router = express.Router();

router.post('/', authenticate, createCase);
router.put('/:id', authenticate, updateCase);

export default router;