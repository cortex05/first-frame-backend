import express from 'express';
import authRouter from './auth.js';
import accountRouter from './account.js';
import playlistsRouter from './playlists.js';
import casesRouter from './cases.js';
import archivedCasesRouter from './archivedCases.js';
import recommendedRouter from './recommended.js';

const router = express.Router();

router.use('/auth', authRouter);
router.use('/account', accountRouter);
router.use('/playlists', playlistsRouter);
router.use('/cases', casesRouter);
router.use('/archived-cases', archivedCasesRouter);
router.use('/recommended', recommendedRouter);

export default router;
