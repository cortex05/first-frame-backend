import express from 'express';

import { listTransactions } from '../controllers/transactionController.js';
import requireAccountAdmin from '../middleware/accountRoleHandler.js';
import authenticate from '../middleware/authHandler.js';

const router = express.Router();

router.use(authenticate);

// Read-only by design: transactions change only as a side effect of creating,
// starting and archiving a case.
router.get('/', requireAccountAdmin, listTransactions);

export default router;
