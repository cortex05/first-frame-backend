import express from 'express';

import {
  archiveCase,
  createCase,
  listCases,
  setCaseOwners,
  updateCase,
} from '../controllers/caseController.js';
import authenticate from '../middleware/authHandler.js';
import requireAccountAdmin from '../middleware/accountRoleHandler.js';

const router = express.Router();

router.get('/', authenticate, listCases);
router.post('/', authenticate, requireAccountAdmin, createCase);
router.put('/:id', authenticate, updateCase);
router.put('/:id/owners', authenticate, requireAccountAdmin, setCaseOwners);
router.post('/:id/archive', authenticate, archiveCase);

export default router;
