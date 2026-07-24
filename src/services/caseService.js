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

export const updateCase = async (caseId, casePayload, ownerId) => {
  if (!ownerId || !mongoose.Types.ObjectId.isValid(ownerId)) {
    throw createAppError('Authenticated user is required', 401);
  }

  if (!caseId || !mongoose.Types.ObjectId.isValid(caseId)) {
    throw createAppError('Valid case id is required', 400);
  }

  const allowedFields = [
    'name',
    'author',
    'crimeType',
    'location',
    'studentNumber',
    'caseDate',
    'students',
    'questions',
    'chartData',
    'answers',
    'seated',
  ];

  const update = {};

  for (const field of allowedFields) {
    if (Object.prototype.hasOwnProperty.call(casePayload || {}, field)) {
      update[field] = casePayload[field];
    }
  }

  if (!Object.keys(update).length) {
    throw createAppError('No updatable fields provided', 400);
  }

  if (update.name !== undefined) {
    if (typeof update.name !== 'string' || !update.name.trim()) {
      throw createAppError('name must be a non-empty string', 400);
    }
    update.name = update.name.trim();
  }

  if (update.author !== undefined) {
    if (typeof update.author !== 'string' || !update.author.trim()) {
      throw createAppError('author must be a non-empty string', 400);
    }
    update.author = update.author.trim();
  }

  if (update.crimeType !== undefined && !CRIME_TYPES.includes(update.crimeType)) {
    throw createAppError('Invalid crimeType', 400);
  }

  if (update.location !== undefined) {
    if (typeof update.location !== 'string' || !update.location.trim()) {
      throw createAppError('location must be a non-empty string', 400);
    }
    update.location = update.location.trim();
  }

  if (update.studentNumber !== undefined) {
    const parsedStudentNumber = Number(update.studentNumber);
    if (!Number.isInteger(parsedStudentNumber) || parsedStudentNumber < 1) {
      throw createAppError('studentNumber must be an integer greater than 0', 400);
    }
    update.studentNumber = parsedStudentNumber;
  }

  if (update.caseDate !== undefined) {
    const parsedCaseDate = update.caseDate ? new Date(update.caseDate) : null;
    if (!parsedCaseDate || Number.isNaN(parsedCaseDate.getTime())) {
      throw createAppError('caseDate must be a valid ISO date', 400);
    }
    update.caseDate = parsedCaseDate;
  }

  if (update.students !== undefined && !Array.isArray(update.students)) {
    throw createAppError('students must be an array', 400);
  }

  if (update.questions !== undefined && !Array.isArray(update.questions)) {
    throw createAppError('questions must be an array', 400);
  }

  const updatedCase = await Case.findOneAndUpdate(
    { _id: caseId, owner: ownerId },
    { $set: update },
    { new: true, runValidators: true }
  );

  if (!updatedCase) {
    throw createAppError('Case not found', 404);
  }

  return updatedCase;
};
