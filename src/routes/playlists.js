import express from 'express';
import {
  createPlaylist,
  deletePlaylist,
  getPlaylistById,
  listPlaylists,
  updatePlaylist,
} from '../controllers/playlistController.js';

const router = express.Router();

router.get('/', listPlaylists);
router.get('/:playlistId', getPlaylistById);
router.post('/', createPlaylist);
router.patch('/:playlistId', updatePlaylist);
router.delete('/:playlistId', deletePlaylist);

export default router;
