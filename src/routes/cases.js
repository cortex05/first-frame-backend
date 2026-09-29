import express from 'express';

import {
  archiveCase,
  createCase,
  listCases,
  setCaseOwners,
  setStudentDetails,
  startCase,
  updateCase,
} from '../controllers/caseController.js';
import authenticate from '../middleware/authHandler.js';
import requireAccountAdmin from '../middleware/accountRoleHandler.js';

const router = express.Router();

router.get('/', authenticate, listCases);
router.post('/', authenticate, requireAccountAdmin, createCase);
router.put('/:id', authenticate, updateCase);
router.put('/:id/owners', authenticate, requireAccountAdmin, setCaseOwners);
router.post('/:id/start', authenticate, startCase);
// Admins and owners alike: details are viewer notes, not case settings.
router.put('/:id/students/:number/details', authenticate, setStudentDetails);
router.post('/:id/archive', authenticate, archiveCase);

export default router;
