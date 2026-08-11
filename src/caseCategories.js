/**
 * Case classification catalog.
 *
 * A case category is ONE value, not a (caseType, charge) pair. The pair used to
 * be stored as two independent strings that had to agree with each other, which
 * meant every layer re-validated the relationship and an invalid combination was
 * always representable. Here the relationship is baked into the id, so it isn't.
 *
 * MIRRORED FILE -- first-frame and first-frame-back are separate repos that
 * deploy independently, so each keeps its own copy. The two files are meant to
 * be byte-identical; edit one and copy it across, then bump CATALOG_VERSION.
 * This file has no imports and no dependencies precisely so that copy is safe.
 *
 * Drift is not silent. Ids are canonical lowercase slugs, so there is no casing
 * or formatting mismatch to get wrong; the only possible divergence is one side
 * knowing a category the other doesn't, which surfaces as a clean 400
 * ("Invalid case category") rather than as corrupt data.
 *
 * Ids are derived from the labels below and are stable as long as the labels are.
 * Renaming a label changes its id and orphans stored cases, so a rename needs a
 * migration -- treat this list as append-mostly.
 */

/** Bump when the catalog changes, so both copies can be compared at a glance. */
export const CATALOG_VERSION = '2026-08-11';

const CATALOG = {
  Criminal: [
    'Assault',
    'Battery',
    'Murder',
    'Theft',
    'Burglary',
    'Robbery',
    'Arson',
    'Fraud',
    'Drug Possession',
    'DWI',
    'Domestic Violence',
    'Kidnapping',
    'Weapons Charges',
    'Hit and Run',
  ],
  Civil: [
    'Personal Injury',
    'Breach of contract',
    'Property Damage',
    'Medical Malpractice',
    'Weapons Charges',
  ],
  Family: [
    'Divorce',
    'Child Custody',
    'Child Support',
    'Adoption',
    'Guardianship',
    'Paternity',
  ],
  Probate: ['Will Contests', 'Estate Administration', 'Trust Disputes'],
  Juvenile: [
    'Juvenile Delinquency',
    'Child in Need of Services',
    'Juvenile Assault',
  ],
  Traffic: [
    'Speeding',
    'Reckless Driving',
    'Driving Without Insurance',
    'DWI/DUI',
    'Traffic Violations',
  ],
  'Business/Commercial': [
    'Partnership Disputes',
    'Intellectual Property',
    'Shareholder litigation',
    'Regulatory Compliance',
    'Unfair Competition',
  ],
  Employment: [
    'Wrongful Termination',
    'Workplace Discrimination',
    'Workplace Harassment',
    'Wage and Hour Disputes',
  ],
  Property: ['Eviction', 'Boundary Disputes', 'Eminent Domain', 'Quiet Title'],
  Tax: ['Tax Evasion', 'Tax Fraud', 'IRS Audits', 'Tax Appeals'],
  Bankruptcy: ['Chapter 7', 'Chapter 11', 'Chapter 13', 'Debt Relief'],
};

export const slugify = (value) =>
  String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

/** Every valid classification, flattened: { id, area, matter }. */
export const CASE_CATEGORIES = Object.entries(CATALOG).flatMap(([area, matters]) =>
  matters.map((matter) => ({
    id: `${slugify(area)}.${slugify(matter)}`,
    area,
    matter,
  })),
);

export const CASE_CATEGORY_IDS = CASE_CATEGORIES.map((category) => category.id);

const BY_ID = new Map(CASE_CATEGORIES.map((category) => [category.id, category]));

/** Categories grouped by area, for rendering a grouped <select>. */
export const CASE_CATEGORIES_BY_AREA = CASE_CATEGORIES.reduce((groups, category) => {
  (groups[category.area] ||= []).push(category);
  return groups;
}, {});

export const getCaseCategory = (id) => BY_ID.get(id) || null;

export const isCaseCategoryId = (id) => BY_ID.has(id);

/** Display string for a stored id, e.g. "Criminal — Assault". */
export const caseCategoryLabel = (id) => {
  const category = BY_ID.get(id);
  return category ? `${category.area} — ${category.matter}` : '—';
};

/**
 * Maps a legacy (caseType, charge) pair onto a category id. Used by the
 * migration script; also handles cases still sitting in a client's
 * localStorage after the schema change.
 */
export const legacyPairToCategoryId = (caseType, charge) => {
  if (!caseType || !charge) return null;
  const id = `${slugify(caseType)}.${slugify(charge)}`;
  return BY_ID.has(id) ? id : null;
};
