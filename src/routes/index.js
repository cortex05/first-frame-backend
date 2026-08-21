import express from 'express';
import authRouter from './auth.js';
import playlistsRouter from './playlists.js';
import casesRouter from './cases.js';
import recommendedRouter from './recommended.js';

const router = express.Router();

router.use('/auth', authRouter);
router.use('/playlists', playlistsRouter);
router.use('/cases', casesRouter);
router.use('/recommended', recommendedRouter);

export default router;