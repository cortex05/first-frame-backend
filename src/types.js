export const CRIME_TYPES = ['DWI', 'Homicide', 'Theft', 'Assault', 'Divorce', 'Custody'];
export const QUESTION_TYPES = ['TRUE_FALSE', 'MULTIPLE_CHOICE'];
export const CASE_TYPES = [
  'criminal',
  'civil',
  'family',
  'probate',
  'juvenile',
  'traffic',
  'business/commercial',
  'employment',
  'property',
  'tax',
  'bankruptcy',
];

export const CHARGES_BY_CASE_TYPE = {
  criminal: ['Assault', 'Battery', 'Murder', 'Theft', 'Burglary', 'Robbery', 'Arson', 'Fraud', 'Drug Possession', 'DWI', 'Domestic Violence', 'Kidnapping', 'Weapons Charges', 'Hit and Run'],
  civil: ['Personal Injury', 'Breach of contract', 'Property Damage', 'Medical Malpractice', 'Weapons Charges'],
  family: ['Divorce', 'Child Custody', 'Child Support', 'Adoption', 'Guardianship', 'Paternity'],
  probate: ['Will Contests', 'Estate Administration', 'Trust Disputes'],
  juvenile: ['Juvenile Delinquency', 'Child in Need of Services', 'Juvenile Assault'],
  traffic: ['Speeding', 'Reckless Driving', 'Driving Without Insurance', 'DWI/DUI', 'Traffic Violations'],
  'business/commercial': ['Partnership Disputes', 'Intellectual Property', 'Shareholder litigation', 'Regulatory Compliance', 'Unfair Competition'],
  employment: ['Wrongful Termination', 'Workplace Discrimination', 'Workplace Harassment', 'Wage and Hour Disputes'],
  property: ['Eviction', 'Boundary Disputes', 'Eminent Domain', 'Quiet Title'],
  tax: ['Tax Evasion', 'Tax Fraud', 'IRS Audits', 'Tax Appeals'],
  bankruptcy: ['Chapter 7', 'Chapter 11', 'Chapter 13', 'Debt Relief'],
};