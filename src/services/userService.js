import mongoose from "mongoose";
import User from "../models/User.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import{ createAppError } from "../utils/error.js";

export const register = async (username, email, password, isAdmin) => {
  const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : email;

  if (!username || !normalizedEmail || !password) {
    throw createAppError("Username, email, and password are required", 400);
  }

  const existingUser = await User.findOne({ email: normalizedEmail });
  if (existingUser) {
    throw createAppError("User already exists", 400);
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const newUser = await User.create({
    username,
    email: normalizedEmail,
    password: hashedPassword,
    isAdmin,
  });

  const { password: _, ...userWithoutPassword } = newUser.toObject();
  return userWithoutPassword;
};

export const login = async (email, password) => {
  const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : email;
  const user = await User.findOne({ email: normalizedEmail });

  if (!user) {
    throw createAppError("Invalid email or password", 401);
  }
  const isPasswordValid = await bcrypt.compare(password, user.password);
  if (!isPasswordValid) {
    throw createAppError("Invalid email or password", 401);
  }

  const token = jwt.sign(
    { id: user._id, isAdmin: user.isAdmin },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRATION }
  );

  return { token, userId: user._id, username: user.username };
}