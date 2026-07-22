import mongoose from 'mongoose';
import Playlist from '../models/Playlist.js';

function validateObjectId(value) {
  return mongoose.Types.ObjectId.isValid(value);
}

export async function listPlaylists(req, res, next) {
  try {
    const userId = req.user.id;

    if (!validateObjectId(userId)) {
      return res.status(400).json({ message: 'Valid userId is required.' });
    }

    const playlists = await Playlist.find({ userId })
      .select('_id title createdAt updatedAt')
      .sort({ updatedAt: -1 });

    return res.status(200).json({ playlists });
  } catch (error) {
    return next(error);
  }
}

export async function getPlaylistById(req, res, next) {
  try {
    const userId = req.user.id;
    const { playlistId } = req.params;

    if (!validateObjectId(userId) || !validateObjectId(playlistId)) {
      return res.status(400).json({ message: 'Valid userId and playlistId are required.' });
    }

    const playlist = await Playlist.findOne({ _id: playlistId, userId }).select(
      '_id title questions createdAt updatedAt'
    );

    if (!playlist) {
      return res.status(404).json({ message: 'Playlist not found.' });
    }

    return res.status(200).json({ playlist });
  } catch (error) {
    return next(error);
  }
}

export async function createPlaylist(req, res, next) {
  try {
    const { title, questions = [] } = req.body;
    const userId = req.user.id;

    if (!validateObjectId(userId)) {
      return res.status(400).json({ message: 'Valid userId is required.' });
    }

    if (typeof title !== 'string' || !title.trim()) {
      return res.status(400).json({ message: 'Title is required.' });
    }

    if (!Array.isArray(questions)) {
      return res.status(400).json({ message: 'Questions must be an array.' });
    }

    const playlist = await Playlist.create({
      userId,
      title: title.trim(),
      questions,
    });

    return res.status(201).json({ playlist });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ message: 'Playlist title already exists for this user.' });
    }

    return next(error);
  }
}

export async function updatePlaylist(req, res, next) {
  try {
    const userId = req.user.id;
    const { playlistId } = req.params;
    const { title, questions } = req.body;

    if (!validateObjectId(userId) || !validateObjectId(playlistId)) {
      return res.status(400).json({ message: 'Valid userId and playlistId are required.' });
    }

    const update = {};

    if (title !== undefined) {
      if (typeof title !== 'string' || !title.trim()) {
        return res.status(400).json({ message: 'Title must be a non-empty string.' });
      }
      update.title = title.trim();
    }

    if (questions !== undefined) {
      if (!Array.isArray(questions)) {
        return res.status(400).json({ message: 'Questions must be an array.' });
      }
      update.questions = questions;
    }

    if (!Object.keys(update).length) {
      return res.status(400).json({ message: 'At least one updatable field is required.' });
    }

    const playlist = await Playlist.findOneAndUpdate(
      { _id: playlistId, userId },
      { $set: update },
      { new: true, runValidators: true }
    );

    if (!playlist) {
      return res.status(404).json({ message: 'Playlist not found.' });
    }

    return res.status(200).json({ playlist });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ message: 'Playlist title already exists for this user.' });
    }

    return next(error);
  }
}

export async function deletePlaylist(req, res, next) {
  try {
    const userId = req.user.id;
    const { playlistId } = req.params;

    if (!validateObjectId(userId) || !validateObjectId(playlistId)) {
      return res.status(400).json({ message: 'Valid userId and playlistId are required.' });
    }

    const deleted = await Playlist.findOneAndDelete({ _id: playlistId, userId });

    if (!deleted) {
      return res.status(404).json({ message: 'Playlist not found.' });
    }

    return res.status(200).json({ message: 'Playlist deleted.' });
  } catch (error) {
    return next(error);
  }
}
