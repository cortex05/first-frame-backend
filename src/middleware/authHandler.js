import jwt from "jsonwebtoken";
import User from "../models/User.js";
import { createAppError } from "../utils/error.js";

const authenticate = async (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');

  if(!token) {
    throw createAppError('No token provided', 401);
  }

  let decoded;
  
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    throw createAppError('Invalid token', 401);
  }

  const user = await User.findById(decoded.id).select('-password');
  if(!user) {
    throw createAppError('User not found', 404);
  }
  req.user = user;
  next();
};

export default authenticate;