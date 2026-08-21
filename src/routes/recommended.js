import express from 'express';

import {
  createRecommended,
  deleteRecommended,
  getRecommendedById,
  listRecommended,
  lookupRecommended,
  updateRecommended,
} from '../controllers/recommendedController.js';
import authenticate from '../middleware/authHandler.js';
import requireAdmin from '../middleware/adminHandler.js';

const router = express.Router();

router.use(authenticate);

// Reads are open to every authenticated user; writes are administrator-only.
router.get('/', listRecommended);
// Declared before ':recommendedId' so 'lookup' is not read as an id.
router.get('/lookup', lookupRecommended);
router.get('/:recommendedId', getRecommendedById);
router.post('/', requireAdmin, createRecommended);
router.patch('/:recommendedId', requireAdmin, updateRecommended);
router.delete('/:recommendedId', requireAdmin, deleteRecommended);

export default router;
