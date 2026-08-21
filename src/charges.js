/**
 * Charges, derived from the case catalog.
 *
 * A charge is the "matter" half of a case category -- 'Assault', 'Divorce',
 * 'Chapter 7'. Recommended question sets are keyed by charge rather than by a
 * full category id, so the same curated set covers a charge no matter which
 * area a case files it under ('Weapons Charges' is both Criminal and Civil).
 *
 * Derived here rather than added to ./caseCategories.js on purpose: that file is
 * byte-mirrored into the frontend repo and has no imports, so it stays as-is.
 */

import { CASE_CATEGORIES, getCaseCategory } from './caseCategories.js';

/** Every distinct charge in the catalog, alphabetical. */
export const CASE_CHARGES = [
  ...new Set(CASE_CATEGORIES.map((category) => category.matter)),
].sort((a, b) => a.localeCompare(b));

const BY_NORMALIZED = new Map(
  CASE_CHARGES.map((charge) => [charge.trim().toLowerCase(), charge])
);

/**
 * Resolves loose input onto its canonical catalog spelling, or null if the
 * value is not a charge. Matching ignores surrounding space and casing so a
 * client sending 'dwi' still lands on 'DWI'.
 */
export const resolveCharge = (value) =>
  typeof value === 'string' ? BY_NORMALIZED.get(value.trim().toLowerCase()) ?? null : null;

export const isCharge = (value) => resolveCharge(value) !== null;

/** The charge a stored case category id implies, e.g. 'criminal.assault' -> 'Assault'. */
export const chargeForCategoryId = (categoryId) =>
  getCaseCategory(String(categoryId ?? '').trim())?.matter ?? null;
