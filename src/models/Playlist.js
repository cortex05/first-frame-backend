import mongoose from 'mongoose';
import { QuestionSchema } from './Case.js';

/**
 * A question set shared by everyone in an account. Any user in the account
 * can create one; only its creator or an account admin can change it.
 */
const PlaylistSchema = new mongoose.Schema(
  {
    account: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Account',
      required: true,
      immutable: true,
      index: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      immutable: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 80,
    },
    questions: {
      type: [QuestionSchema],
      default: [],
    },
  },
  {
    collection: 'playlists',
    timestamps: true,
    versionKey: false,
  }
);

PlaylistSchema.index({ account: 1, title: 1 }, { unique: true });

const Playlist = mongoose.models.Playlist || mongoose.model('Playlist', PlaylistSchema);

export default Playlist;
