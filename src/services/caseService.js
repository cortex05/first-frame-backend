import mongoose from 'mongoose';
import Case from '../models/Case.js';
import { CRIME_TYPES } from '../types.js';
import { createAppError } from '../utils/error.js';

export const listCases = async (ownerId) => {
  if (!ownerId || !mongoose.Types.ObjectId.isValid(ownerId)) {
    throw createAppError('Authenticated user is required', 401);
  }

  const cases = await Case.find({ owner: ownerId }).sort({ createdOn: -1 });
  return cases;
};

export const createCase = async (casePayload, ownerId) => {
  if (!ownerId || !mongoose.Types.ObjectId.isValid(ownerId)) {
    throw createAppError('Authenticated user is required', 401);
  }

  const {
    clientName,
    attorney,
    crimeType,
    studentNumber,
    questions = [],
  } = casePayload || {};

  if (!clientName || !attorney || !crimeType) {
    throw createAppError('clientName, attorney, and crimeType are required', 400);
  }

  if (!CRIME_TYPES.includes(crimeType)) {
    throw createAppError('Invalid crimeType', 400);
  }

  const parsedStudentNumber = Number(studentNumber);
  if (!Number.isInteger(parsedStudentNumber) || parsedStudentNumber < 1) {
    throw createAppError('studentNumber must be an integer greater than 0', 400);
  }

  if (!Array.isArray(questions)) {
    throw createAppError('questions must be an array', 400);
  }

  const createdCase = await Case.create({
    owner: ownerId,
    clientName: String(clientName).trim(),
    attorney: String(attorney).trim(),
    crimeType,
    studentNumber: parsedStudentNumber,
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
    'clientName',
    'attorney',
    'crimeType',
    'studentNumber',
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

  if (update.clientName !== undefined) {
    if (typeof update.clientName !== 'string' || !update.clientName.trim()) {
      throw createAppError('clientName must be a non-empty string', 400);
    }
    update.clientName = update.clientName.trim();
  }

  if (update.attorney !== undefined) {
    if (typeof update.attorney !== 'string' || !update.attorney.trim()) {
      throw createAppError('attorney must be a non-empty string', 400);
    }
    update.attorney = update.attorney.trim();
  }

  if (update.crimeType !== undefined && !CRIME_TYPES.includes(update.crimeType)) {
    throw createAppError('Invalid crimeType', 400);
  }

  if (update.studentNumber !== undefined) {
    const parsedStudentNumber = Number(update.studentNumber);
    if (!Number.isInteger(parsedStudentNumber) || parsedStudentNumber < 1) {
      throw createAppError('studentNumber must be an integer greater than 0', 400);
    }
    update.studentNumber = parsedStudentNumber;
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
