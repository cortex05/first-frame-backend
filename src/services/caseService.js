import mongoose from 'mongoose';
import Case from '../models/Case.js';
import { CRIME_TYPES } from '../types.js';
import { createAppError } from '../utils/error.js';

export const createCase = async (casePayload, ownerId) => {
  if (!ownerId || !mongoose.Types.ObjectId.isValid(ownerId)) {
    throw createAppError('Authenticated user is required', 401);
  }

  const {
    name,
    author,
    crimeType,
    location,
    studentNumber,
    caseDate,
    questions = [],
  } = casePayload || {};

  if (!name || !author || !crimeType || !location) {
    throw createAppError('name, author, crimeType, and location are required', 400);
  }

  if (!CRIME_TYPES.includes(crimeType)) {
    throw createAppError('Invalid crimeType', 400);
  }

  const parsedStudentNumber = Number(studentNumber);
  if (!Number.isInteger(parsedStudentNumber) || parsedStudentNumber < 1) {
    throw createAppError('studentNumber must be an integer greater than 0', 400);
  }

  const parsedCaseDate = caseDate ? new Date(caseDate) : null;
  if (!parsedCaseDate || Number.isNaN(parsedCaseDate.getTime())) {
    throw createAppError('caseDate must be a valid ISO date', 400);
  }

  if (!Array.isArray(questions)) {
    throw createAppError('questions must be an array', 400);
  }

  const createdCase = await Case.create({
    owner: ownerId,
    name: String(name).trim(),
    author: String(author).trim(),
    crimeType,
    location: String(location).trim(),
    studentNumber: parsedStudentNumber,
    caseDate: parsedCaseDate,
    questions,
  });

  return createdCase;
};
