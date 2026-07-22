import express from 'express';
import authRouter from './auth.js';
import playlistsRouter from './playlists.js';

const router = express.Router();

router.use('/auth', authRouter);
router.use('/playlists', playlistsRouter);

export default router;