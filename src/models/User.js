import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
  },
  password: {
    type: String,
    required: true,
  },
  isAdmin: {
    type: Boolean,
    default: false,
  },
  favorites: {
    type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Playlist' }],
    default: [],
  }, 
  cases: {
    type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Case' }],
    default: [],
  }
}, { timestamps: true});

const User = mongoose.model('User', userSchema);
export default User;