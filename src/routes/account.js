import express from 'express';

import {
  createUser,
  getAccount,
  listUsers,
  updateAccount,
  updateUser,
} from '../controllers/accountController.js';
import authenticate from '../middleware/authHandler.js';
import requireAccountAdmin from '../middleware/accountRoleHandler.js';

const router = express.Router();

router.use(authenticate);

// Reads are open to everyone in the account; writes are account-admin only.
router.get('/', getAccount);
router.get('/users', listUsers);
router.patch('/', requireAccountAdmin, updateAccount);
router.post('/users', requireAccountAdmin, createUser);
router.patch('/users/:userId', requireAccountAdmin, updateUser);

export default router;
