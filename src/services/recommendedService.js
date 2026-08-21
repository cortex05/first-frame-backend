import mongoose from 'mongoose';

import Recommended from '../models/Recommended.js';
import { chargeForCategoryId, resolveCharge } from '../charges.js';
import { isCaseCategoryId } from '../caseCategories.js';
import { createAppError } from '../utils/error.js';

const LIST_FIELDS = '_id charge createdBy createdAt updatedAt';
const DETAIL_FIELDS = '_id charge questions createdBy createdAt updatedAt';

const assertValidId = (value, label) => {
  if (!value || !mongoose.Types.ObjectId.isValid(value)) {
    throw createAppError(`Valid ${label} is required`, 400);
  }
};

/**
 * Turns a lookup into the charge to match on. Callers may pass the charge
 * directly, or a case category id -- the charge is derivable from the id, so the
 * frontend can hand over the case's stored category without unpacking it first.
 */
const chargeFromLookup = ({ charge, category } = {}) => {
  if (charge !== undefined && charge !== null && String(charge).trim() !== '') {
    const resolved = resolveCharge(charge);
    if (!resolved) {
      throw createAppError('Invalid charge', 400);
    }
    return resolved;
  }

  if (category !== undefined && category !== null && String(category).trim() !== '') {
    const normalized = String(category).trim();
    if (!isCaseCategoryId(normalized)) {
      throw createAppError('Invalid case category', 400);
    }
    return chargeForCategoryId(normalized);
  }

  throw createAppError('charge or category is required', 400);
};

/**
 * Every recommended set. Readable by any authenticated user -- these are not
 * scoped to an owner. Bounded by the catalog, so at most one per charge.
 */
export const listRecommended = async () =>
  // Questions are excluded here for the same reason the playlist list excludes
  // them: a browse view only needs the headings.
  Recommended.find({}).select(LIST_FIELDS).sort({ charge: 1 });

/**
 * The single set covering a charge, or null. A charge with nothing curated yet
 * is an ordinary state rather than an error, so this is not a 404.
 */
export const findRecommendedForCharge = async (lookup) => {
  const charge = chargeFromLookup(lookup);

  return Recommended.findOne({ charge }).select(DETAIL_FIELDS);
};

export const getRecommendedById = async (recommendedId) => {
  assertValidId(recommendedId, 'recommended id');

  const recommended = await Recommended.findById(recommendedId).select(DETAIL_FIELDS);

  if (!recommended) {
    throw createAppError('Recommended not found', 404);
  }

  return recommended;
};

export const createRecommended = async (payload, createdBy) => {
  if (!createdBy || !mongoose.Types.ObjectId.isValid(createdBy)) {
    throw createAppError('Authenticated user is required', 401);
  }

  const { charge, questions = [] } = payload || {};

  if (typeof charge !== 'string' || !charge.trim()) {
    throw createAppError('charge is required', 400);
  }

  const resolvedCharge = resolveCharge(charge);
  if (!resolvedCharge) {
    throw createAppError('Invalid charge', 400);
  }

  if (!Array.isArray(questions)) {
    throw createAppError('questions must be an array', 400);
  }

  try {
    return await Recommended.create({
      createdBy,
      charge: resolvedCharge,
      questions,
    });
  } catch (error) {
    if (error?.code === 11000) {
      throw createAppError('A recommended set for this charge already exists', 409);
    }
    throw error;
  }
};

/**
 * Any administrator may edit any recommended set -- they are shared content, so
 * they are not scoped to whoever happened to author them. `createdBy` stays as
 * the original attribution.
 */
export const updateRecommended = async (recommendedId, payload) => {
  assertValidId(recommendedId, 'recommended id');

  const { charge, questions } = payload || {};
  const update = {};

  if (charge !== undefined) {
    if (typeof charge !== 'string' || !charge.trim()) {
      throw createAppError('charge must be a non-empty string', 400);
    }

    const resolvedCharge = resolveCharge(charge);
    if (!resolvedCharge) {
      throw createAppError('Invalid charge', 400);
    }

    update.charge = resolvedCharge;
  }

  if (questions !== undefined) {
    if (!Array.isArray(questions)) {
      throw createAppError('questions must be an array', 400);
    }
    update.questions = questions;
  }

  if (!Object.keys(update).length) {
    throw createAppError('At least one updatable field is required', 400);
  }

  let updated;

  try {
    updated = await Recommended.findByIdAndUpdate(
      recommendedId,
      { $set: update },
      { new: true, runValidators: true }
    ).select(DETAIL_FIELDS);
  } catch (error) {
    if (error?.code === 11000) {
      throw createAppError('A recommended set for this charge already exists', 409);
    }
    throw error;
  }

  if (!updated) {
    throw createAppError('Recommended not found', 404);
  }

  return updated;
};

export const deleteRecommended = async (recommendedId) => {
  assertValidId(recommendedId, 'recommended id');

  const deleted = await Recommended.findByIdAndDelete(recommendedId);

  if (!deleted) {
    throw createAppError('Recommended not found', 404);
  }

  return deleted;
};
