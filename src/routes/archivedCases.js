import express from 'express';

import { getArchivedCase, listArchivedCases } from '../controllers/archivedCaseController.js';
import authenticate from '../middleware/authHandler.js';

const router = express.Router();

router.use(authenticate);

// Read-only by design: there is no route to change or delete an archived case.
router.get('/', listArchivedCases);
router.get('/:archivedCaseId', getArchivedCase);

export default router;
