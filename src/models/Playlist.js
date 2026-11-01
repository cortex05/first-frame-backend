import mongoose from 'mongoose';
import { QuestionSchema, maxItems } from './Case.js';
import { QUESTIONS_MAX } from '../types.js';

/**
 * A question set shared by everyone in an account. Any user in the account
 * can create one; only an account admin can change or delete it (spec 022).
 */
const PlaylistSchema = new mongoose.Schema(
  {
    account: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Account',
      required: true,
      immutable: true,
      // Indexed through { account, title } below, which leads with it.
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
      validate: maxItems(QUESTIONS_MAX, 'questions'),
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
