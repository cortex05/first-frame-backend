import Playlist from '../models/Playlist.js';
import {
  assertValidObjectId,
  canWritePlaylist,
  playlistScopeFilter,
} from '../policies/accountScope.js';
import { createAppError, isDuplicateKeyError } from '../utils/error.js';

const LIST_FIELDS = '_id title createdBy createdAt updatedAt';
const DETAIL_FIELDS = '_id title createdBy questions createdAt updatedAt';
const DUPLICATE_TITLE = 'Playlist title already exists in this account.';

const validateTitle = (title) => {
  if (typeof title !== 'string' || !title.trim()) {
    throw createAppError('Title must be a non-empty string.', 400);
  }
  return title.trim();
};

const validateQuestions = (questions) => {
  if (!Array.isArray(questions)) {
    throw createAppError('Questions must be an array.', 400);
  }
  return questions;
};

/**
 * Loads a playlist the caller may change. Another account's playlist is a 404;
 * a playlist in the caller's account that they neither created nor administer
 * is a 403 -- they can already see it, so there is nothing to hide.
 */
const findWritablePlaylist = async (playlistId, auth) => {
  assertValidObjectId(playlistId, 'playlist id');

  const playlist = await Playlist.findOne({ _id: playlistId, ...playlistScopeFilter(auth) });
  if (!playlist) {
    throw createAppError('Playlist not found.', 404);
  }
  if (!canWritePlaylist(auth, playlist)) {
    throw createAppError('Only the playlist creator or an account admin can change it.', 403);
  }
  return playlist;
};

export const listPlaylists = async (auth) =>
  Playlist.find(playlistScopeFilter(auth)).select(LIST_FIELDS).sort({ updatedAt: -1 });

export const getPlaylist = async (playlistId, auth) => {
  assertValidObjectId(playlistId, 'playlist id');

  const playlist = await Playlist.findOne({ _id: playlistId, ...playlistScopeFilter(auth) }).select(
    DETAIL_FIELDS
  );
  if (!playlist) {
    throw createAppError('Playlist not found.', 404);
  }
  return playlist;
};

export const createPlaylist = async (auth, { title, questions = [] } = {}) => {
  const trimmedTitle = typeof title === 'string' ? title.trim() : '';
  if (!trimmedTitle) {
    throw createAppError('Title is required.', 400);
  }
  validateQuestions(questions);

  try {
    return await Playlist.create({
      account: auth.accountId,
      createdBy: auth.userId,
      title: trimmedTitle,
      questions,
    });
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      throw createAppError(DUPLICATE_TITLE, 409);
    }
    throw error;
  }
};

export const updatePlaylist = async (playlistId, auth, { title, questions } = {}) => {
  const update = {};
  if (title !== undefined) {
    update.title = validateTitle(title);
  }
  if (questions !== undefined) {
    update.questions = validateQuestions(questions);
  }
  if (!Object.keys(update).length) {
    throw createAppError('At least one updatable field is required.', 400);
  }

  const playlist = await findWritablePlaylist(playlistId, auth);

  try {
    return await Playlist.findOneAndUpdate(
      { _id: playlist._id },
      { $set: update },
      { returnDocument: 'after', runValidators: true }
    );
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      throw createAppError(DUPLICATE_TITLE, 409);
    }
    throw error;
  }
};

export const deletePlaylist = async (playlistId, auth) => {
  const playlist = await findWritablePlaylist(playlistId, auth);
  await Playlist.deleteOne({ _id: playlist._id });
};
