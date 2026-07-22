import mongoose from 'mongoose';
import { QuestionSchema } from './Case.js';

const PlaylistSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
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

PlaylistSchema.index({ userId: 1, title: 1 }, { unique: true });

const Playlist = mongoose.model('Playlist', PlaylistSchema);

export default Playlist;
