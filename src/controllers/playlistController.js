import {
  createPlaylist as createPlaylistService,
  deletePlaylist as deletePlaylistService,
  getPlaylist as getPlaylistService,
  listPlaylists as listPlaylistsService,
  updatePlaylist as updatePlaylistService,
} from '../services/playlistService.js';

// Response bodies ({ playlists } / { playlist } / { message }) are unchanged
// from before accounts, so the frontend's playlist code did not have to move.

export async function listPlaylists(req, res) {
  const playlists = await listPlaylistsService(req.auth);
  return res.status(200).json({ playlists });
}

export async function getPlaylistById(req, res) {
  const playlist = await getPlaylistService(req.params.playlistId, req.auth);
  return res.status(200).json({ playlist });
}

export async function createPlaylist(req, res) {
  const { title, questions } = req.body ?? {};
  const playlist = await createPlaylistService(req.auth, { title, questions });
  return res.status(201).json({ playlist });
}

export async function updatePlaylist(req, res) {
  const { title, questions } = req.body ?? {};
  const playlist = await updatePlaylistService(req.params.playlistId, req.auth, { title, questions });
  return res.status(200).json({ playlist });
}

export async function deletePlaylist(req, res) {
  await deletePlaylistService(req.params.playlistId, req.auth);
  return res.status(200).json({ message: 'Playlist deleted.' });
}
