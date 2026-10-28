import express from 'express';

import {
  archiveCase,
  createCase,
  listCases,
  saveIndividualRound,
  saveQuestionAnswers,
  saveSeating,
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
// Admins and owners alike. Each writes only its own part of the case, so two
// people running the same case don't overwrite each other.
router.put('/:id/questions/:questionId/answers', authenticate, saveQuestionAnswers);
router.put('/:id/seating', authenticate, saveSeating);
router.put('/:id/individual-round', authenticate, saveIndividualRound);
router.post('/:id/archive', authenticate, archiveCase);

export default router;
