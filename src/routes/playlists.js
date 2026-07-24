import express from 'express';
import {
  createPlaylist,
  deletePlaylist,
  getPlaylistById,
  listPlaylists,
  updatePlaylist,
} from '../controllers/playlistController.js';
import authenticate from '../middleware/authHandler.js';

const router = express.Router();

router.use(authenticate);

router.get('/', listPlaylists);
router.get('/:playlistId', getPlaylistById);
router.post('/', createPlaylist);
router.patch('/:playlistId', updatePlaylist);
router.delete('/:playlistId', deletePlaylist);

export default router;
