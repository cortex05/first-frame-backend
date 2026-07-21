import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
  },
  password: {
    type: String,
    required: true,
  },
  favorites: {
    type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Favorites' }],
    default: [],
  }, 
  cases: {
    type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Cases' }],
    default: [],
  }
}, { timestamps: true});

const User = mongoose.model('User', userSchema);
export default User;