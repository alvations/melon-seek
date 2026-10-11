// A small, made-up sample in the documented layout of the US Department of Labor's FY2026
// disclosure files, for tests and dry runs of scripts/alt-data/dol-disclosure.js.
//
// Layout sources (fetched 2026-10-11 through the freshness capture probe, run 38136777427):
//   LCA_Record_Layout_FY2026_Q3.pdf and PERM_Record_Layout_FY2026_Q3.pdf
//   (https://www.dol.gov/sites/dolgov/files/ETA/oflc/pdfs/FY26Q3/), and the first 512 KB of
//   LCA_Disclosure_Data_FY2026_Q3.xlsx (run 38137141996): one sheet "A1:CT1032736", the 98
//   columns below in this order, every text cell a shared string, dates as serial numbers,
//   wages as numbers (EMPLOYER_NAME is column T, WAGE_RATE_OF_PAY_FROM column BV).
// Every value below is invented. The people's names are placeholders that tests check never
// reach the output.
import { toExcelDate } from './xlsx.js';

export const LCA_COLUMNS_FY2026 = Object.freeze([
  'CASE_NUMBER', 'CASE_STATUS', 'RECEIVED_DATE', 'DECISION_DATE', 'ORIGINAL_CERT_DATE', 'VISA_CLASS', 'JOB_TITLE', 'SOC_CODE',
  'SOC_TITLE', 'FULL_TIME_POSITION', 'BEGIN_DATE', 'END_DATE', 'TOTAL_WORKER_POSITIONS', 'NEW_EMPLOYMENT', 'CONTINUED_EMPLOYMENT',
  'CHANGE_PREVIOUS_EMPLOYMENT', 'NEW_CONCURRENT_EMPLOYMENT', 'CHANGE_EMPLOYER', 'AMENDED_PETITION', 'EMPLOYER_NAME', 'TRADE_NAME_DBA',
  'EMPLOYER_ADDRESS1', 'EMPLOYER_ADDRESS2', 'EMPLOYER_CITY', 'EMPLOYER_STATE', 'EMPLOYER_POSTAL_CODE', 'EMPLOYER_COUNTRY',
  'EMPLOYER_PROVINCE', 'EMPLOYER_PHONE', 'EMPLOYER_PHONE_EXT', 'EMPLOYER_FEIN', 'NAICS_CODE', 'EMPLOYER_POC_LAST_NAME',
  'EMPLOYER_POC_FIRST_NAME', 'EMPLOYER_POC_MIDDLE_NAME', 'EMPLOYER_POC_JOB_TITLE', 'EMPLOYER_POC_ADDRESS1', 'EMPLOYER_POC_ADDRESS2',
  'EMPLOYER_POC_CITY', 'EMPLOYER_POC_STATE', 'EMPLOYER_POC_POSTAL_CODE', 'EMPLOYER_POC_COUNTRY', 'EMPLOYER_POC_PROVINCE',
  'EMPLOYER_POC_PHONE', 'EMPLOYER_POC_PHONE_EXT', 'EMPLOYER_POC_EMAIL', 'AGENT_REPRESENTING_EMPLOYER', 'AGENT_ATTORNEY_LAST_NAME',
  'AGENT_ATTORNEY_FIRST_NAME', 'AGENT_ATTORNEY_MIDDLE_NAME', 'AGENT_ATTORNEY_ADDRESS1', 'AGENT_ATTORNEY_ADDRESS2', 'AGENT_ATTORNEY_CITY',
  'AGENT_ATTORNEY_STATE', 'AGENT_ATTORNEY_POSTAL_CODE', 'AGENT_ATTORNEY_COUNTRY', 'AGENT_ATTORNEY_PROVINCE', 'AGENT_ATTORNEY_PHONE',
  'AGENT_ATTORNEY_PHONE_EXT', 'AGENT_ATTORNEY_EMAIL_ADDRESS', 'LAWFIRM_NAME_BUSINESS_NAME', 'LAWFIRM_BUSINESS_FEIN',
  'STATE_OF_HIGHEST_COURT', 'NAME_OF_HIGHEST_STATE_COURT', 'WORKSITE_WORKERS', 'SECONDARY_ENTITY', 'SECONDARY_ENTITY_BUSINESS_NAME',
  'WORKSITE_ADDRESS1', 'WORKSITE_ADDRESS2', 'WORKSITE_CITY', 'WORKSITE_COUNTY', 'WORKSITE_STATE', 'WORKSITE_POSTAL_CODE',
  'WAGE_RATE_OF_PAY_FROM', 'WAGE_RATE_OF_PAY_TO', 'WAGE_UNIT_OF_PAY', 'PREVAILING_WAGE', 'PW_UNIT_OF_PAY', 'PW_TRACKING_NUMBER',
  'PW_WAGE_LEVEL', 'PW_OES_YEAR', 'PW_OTHER_SOURCE', 'PW_OTHER_YEAR', 'PW_SURVEY_PUBLISHER', 'PW_SURVEY_NAME', 'TOTAL_WORKSITE_LOCATIONS',
  'AGREE_TO_LC_STATEMENT', 'H-1B_DEPENDENT', 'WILLFUL_VIOLATOR', 'SUPPORT_H1B', 'STATUTORY_BASIS', 'APPENDIX_A_ATTACHED',
  'PUBLIC_DISCLOSURE', 'PREPARER_LAST_NAME', 'PREPARER_FIRST_NAME', 'PREPARER_MIDDLE_INITIAL', 'PREPARER_BUSINESS_NAME', 'PREPARER_EMAIL',
]);

/** A subset of the 137 FY2026 PERM columns, in the layout's order (the script reads by name). */
export const PERM_COLUMNS_FY2026_SUBSET = Object.freeze([
  'CASE_NUMBER', 'CASE_STATUS', 'RECEIVED_DATE', 'DECISION_DATE', 'OCCUPATION_TYPE', 'EMP_BUSINESS_NAME', 'EMP_TRADE_NAME',
  'EMP_CITY', 'EMP_STATE', 'EMP_FEIN', 'EMP_NAICS', 'EMP_NUM_PAYROLL', 'EMP_POC_LAST_NAME', 'EMP_POC_FIRST_NAME', 'EMP_POC_EMAIL',
  'ATTY_AG_LAST_NAME', 'ATTY_AG_FIRST_NAME', 'ATTY_AG_EMAIL', 'ATTY_AG_LAW_FIRM_NAME', 'JOB_OPP_PWD_NUMBER', 'PWD_SOC_CODE',
  'PWD_SOC_TITLE', 'JOB_TITLE', 'JOB_OPP_PWD_ATTACHED', 'JOB_OPP_WAGE_FROM', 'JOB_OPP_WAGE_TO', 'JOB_OPP_WAGE_PER',
  'JOB_OPP_WAGE_CONDITIONS', 'PRIMARY_WORKSITE_TYPE', 'PRIMARY_WORKSITE_ADDR1', 'PRIMARY_WORKSITE_CITY', 'PRIMARY_WORKSITE_COUNTY',
  'PRIMARY_WORKSITE_STATE', 'PRIMARY_WORKSITE_POSTAL_CODE', 'PRIMARY_WORKSITE_BLS_AREA', 'IS_MULTIPLE_LOCATIONS',
  'OTHER_REQ_IS_FULLTIME_EMP', 'DECL_PREP_LAST_NAME', 'DECL_PREP_FIRST_NAME', 'DECL_PREP_EMAIL',
]);

/** Placeholder personal values: tests assert none of them reaches a summary or CSV. */
export const PERSONAL_MARKERS = Object.freeze(['Placeholder-Contact', 'placeholder.contact@example.com', 'Placeholder-Attorney', 'placeholder.attorney@example.com', 'Placeholder-Preparer']);

const d = toExcelDate;
// [status, visa, title, soc, socTitle, fullTime, workers, employer, city, state, from, to, unit, pw, pwUnit, pwLevel, decision]
const LCA_ROWS = [
  ['Certified', 'H-1B', 'Software Development Engineer II', '15-1252.00', 'Software Developers', 'Y', 1, 'Amazon.com Services LLC', 'SEATTLE', 'WA', 165000, 210000, 'Year', 150000, 'Year', 'II', '2026-01-15'],
  ['Certified', 'H-1B', 'Software Development Engineer II', '15-1252.00', 'Software Developers', 'Y', 1, 'AMAZON.COM SERVICES, LLC', 'Seattle', 'WA', 155000, 200000, 'Year', 150000, 'Year', 'II', '2026-02-02'],
  ['Certified', 'H-1B', 'SOFTWARE DEVELOPMENT ENGINEER II', '15-1252.00', 'Software Developers', 'Y', 1, 'Amazon.com Services LLC', 'BELLEVUE', 'WA', 160000, 205000, 'Year', 148000, 'Year', 'II', '2026-03-10'],
  ['Certified', 'H-1B', 'Sr. Software Development Engineer', '15-1252.00', 'Software Developers', 'Y', 2, 'Amazon Web Services, Inc.', 'Arlington', 'VA', 190000, 240000, 'Year', 170000, 'Year', 'III', '2026-04-01'],
  ['Certified', 'H-1B', 'Software Dev Engineer I', '15-1252.00', 'Software Developers', 'Y', 1, 'Amazon Development Center U.S., Inc.', 'Sunnyvale', 'CA', 135000, 175000, 'Year', 130000, 'Year', 'I', '2026-05-20'],
  ['Certified', 'H-1B', 'Applied Scientist II', '15-2051.00', 'Data Scientists', 'Y', 1, 'Amazon.com Services LLC', 'Seattle', 'WA', 170000, 230000, 'Year', 140000, 'Year', 'II', '2026-01-28'],
  ['Certified', 'E-3 Australian', 'Data Engineer', '15-1243.00', 'Database Architects', 'Y', 1, 'Amazon Web Services, Inc.', 'Seattle', 'WA', 64.9, 85, 'Hour', 60, 'Hour', 'II', '2026-06-11'],
  ['Certified', 'H-1B', 'Solutions Architect', '15-1299.08', 'Computer Systems Engineers/Architects', 'Y', 1, 'Amazon Web Services, Inc.', 'New York', 'NY', 14000, null, 'Month', 12000, 'Month', 'II', '2026-02-14'],
  ['Withdrawn', 'H-1B', 'Software Development Engineer II', '15-1252.00', 'Software Developers', 'Y', 1, 'Amazon.com Services LLC', 'Seattle', 'WA', 150000, 200000, 'Year', 150000, 'Year', 'II', '2026-03-03'],
  ['Certified', 'H-1B', 'Software Development Engineer II', '15-1252.00', 'Software Developers', 'N', 1, 'Amazon.com Services LLC', 'Seattle', 'WA', 80000, null, 'Year', 75000, 'Year', 'II', '2026-03-04'],
  ['Certified', 'H-1B', 'Software Engineer', '15-1252.00', 'Software Developers', 'Y', 1, 'Meta Platforms, Inc.', 'MENLO PARK', 'CA', 180000, 220000, 'Year', 160000, 'Year', 'II', '2026-01-09'],
  ['Certified', 'H-1B', 'Software Engineer', '15-1252.00', 'Software Developers', 'Y', 1, 'META PLATFORMS, INC.', 'New York', 'NY', 190000, 230000, 'Year', 165000, 'Year', 'III', '2026-02-19'],
  ['Certified', 'H-1B', 'Software Engineer', '15-1252.00', 'Software Developers', 'Y', 1, 'Meta Platforms, Inc.', 'Menlo Park', 'CA', 200000, 240000, 'Year', 160000, 'Year', 'III', '2026-04-22'],
  ['Certified', 'H-1B', 'Research Scientist', '15-2051.00', 'Data Scientists', 'Y', 1, 'Meta Platforms Technologies, LLC', 'Redmond', 'WA', 210000, 260000, 'Year', 170000, 'Year', 'IV', '2026-05-05'],
  ['Denied', 'H-1B', 'Data Scientist', '15-2051.00', 'Data Scientists', 'Y', 1, 'Meta Platforms, Inc.', 'Menlo Park', 'CA', 150000, 190000, 'Year', 140000, 'Year', 'II', '2026-06-01'],
  ['Certified', 'H-1B', 'Software Engineer', '15-1252.00', 'Software Developers', 'Y', 1, 'Amazon Hose & Rubber Co.', 'Chicago', 'IL', 70000, null, 'Year', 65000, 'Year', 'I', '2026-01-20'],
  ['Certified', 'H-1B', 'Analyst', '13-1111.00', 'Management Analysts', 'Y', 1, 'Meta Systems Consulting Inc', 'Austin', 'TX', 72000, null, 'Year', 70000, 'Year', 'I', '2026-01-21'],
  ['Certified', 'H-1B', 'Software Engineer', '15-1252.00', 'Software Developers', 'Y', 1, 'Example Widgets Inc', 'Boston', 'MA', 120000, 150000, 'Year', 110000, 'Year', 'II', '2026-01-22'],
];

/** LCA sample rows (header first), in the FY2026 column order. */
export function sampleLcaRows() {
  const header = [...LCA_COLUMNS_FY2026];
  const at = (name) => header.indexOf(name);
  const rows = [header];
  LCA_ROWS.forEach((r, i) => {
    const row = new Array(header.length).fill(null);
    const [status, visa, title, soc, socTitle, fullTime, workers, employer, city, state, from, to, unit, pw, pwUnit, pwLevel, decision] = r;
    const set = (name, v) => { row[at(name)] = v; };
    set('CASE_NUMBER', `I-200-26${String(i).padStart(3, '0')}-000000`); set('CASE_STATUS', status);
    set('RECEIVED_DATE', d('2025-12-01')); set('DECISION_DATE', d(decision)); set('VISA_CLASS', visa);
    set('JOB_TITLE', title); set('SOC_CODE', soc); set('SOC_TITLE', socTitle); set('FULL_TIME_POSITION', fullTime);
    set('BEGIN_DATE', d('2026-07-01')); set('END_DATE', d('2029-06-30')); set('TOTAL_WORKER_POSITIONS', workers);
    set('EMPLOYER_NAME', employer); set('EMPLOYER_CITY', 'SEATTLE'); set('EMPLOYER_STATE', 'WA'); set('EMPLOYER_FEIN', '00-0000000');
    set('EMPLOYER_POC_LAST_NAME', PERSONAL_MARKERS[0]); set('EMPLOYER_POC_EMAIL', PERSONAL_MARKERS[1]);
    set('AGENT_ATTORNEY_LAST_NAME', PERSONAL_MARKERS[2]); set('AGENT_ATTORNEY_EMAIL_ADDRESS', PERSONAL_MARKERS[3]);
    set('PREPARER_LAST_NAME', PERSONAL_MARKERS[4]);
    set('WORKSITE_WORKERS', workers); set('SECONDARY_ENTITY', 'N'); set('WORKSITE_CITY', city); set('WORKSITE_STATE', state);
    set('WAGE_RATE_OF_PAY_FROM', from); set('WAGE_RATE_OF_PAY_TO', to); set('WAGE_UNIT_OF_PAY', unit);
    set('PREVAILING_WAGE', pw); set('PW_UNIT_OF_PAY', pwUnit); set('PW_WAGE_LEVEL', pwLevel); set('TOTAL_WORKSITE_LOCATIONS', 1);
    rows.push(row);
  });
  return rows;
}

// [status, title, soc, socTitle, employer, city, state, from, to, unit, fullTime, decision]
const PERM_ROWS = [
  ['Certified', 'Software Development Engineer II', '15-1252.00', 'Software Developers', 'Amazon.com Services LLC', 'Seattle', 'WA', 150000, 200000, 'Year', 'Y', '2026-02-10'],
  ['Certified', 'Software Development Engineer II', '15-1252.00', 'Software Developers', 'Amazon.com Services LLC', 'Seattle', 'WA', 160000, 210000, 'Year', 'Y', '2026-03-12'],
  ['Certified', 'Software Development Engineer II', '15-1252.00', 'Software Developers', 'Amazon.com Services LLC', 'Seattle', 'WA', 155000, 205000, 'Year', 'Y', '2026-04-14'],
  ['Certified-Expired', 'Software Engineer', '15-1252.00', 'Software Developers', 'Meta Platforms, Inc.', 'Menlo Park', 'CA', 185000, 225000, 'Year', 'Y', '2026-01-30'],
  ['Denied', 'Software Engineer', '15-1252.00', 'Software Developers', 'Meta Platforms, Inc.', 'Menlo Park', 'CA', 185000, 225000, 'Year', 'Y', '2026-05-30'],
];

/** PERM sample rows (header first), a subset of the FY2026 columns in order. */
export function samplePermRows() {
  const header = [...PERM_COLUMNS_FY2026_SUBSET];
  const at = (name) => header.indexOf(name);
  const rows = [header];
  PERM_ROWS.forEach((r, i) => {
    const row = new Array(header.length).fill(null);
    const [status, title, soc, socTitle, employer, city, state, from, to, unit, fullTime, decision] = r;
    const set = (name, v) => { row[at(name)] = v; };
    set('CASE_NUMBER', `G-100-26${String(i).padStart(3, '0')}-000000`); set('CASE_STATUS', status);
    set('RECEIVED_DATE', d('2025-11-03')); set('DECISION_DATE', d(decision)); set('OCCUPATION_TYPE', 'Professional occupation');
    set('EMP_BUSINESS_NAME', employer); set('EMP_POC_LAST_NAME', PERSONAL_MARKERS[0]); set('EMP_POC_EMAIL', PERSONAL_MARKERS[1]);
    set('ATTY_AG_LAST_NAME', PERSONAL_MARKERS[2]); set('ATTY_AG_EMAIL', PERSONAL_MARKERS[3]); set('DECL_PREP_LAST_NAME', PERSONAL_MARKERS[4]);
    set('PWD_SOC_CODE', soc); set('PWD_SOC_TITLE', socTitle); set('JOB_TITLE', title);
    set('JOB_OPP_WAGE_FROM', from); set('JOB_OPP_WAGE_TO', to); set('JOB_OPP_WAGE_PER', unit);
    set('PRIMARY_WORKSITE_CITY', city); set('PRIMARY_WORKSITE_STATE', state); set('OTHER_REQ_IS_FULLTIME_EMP', fullTime);
    rows.push(row);
  });
  return rows;
}
