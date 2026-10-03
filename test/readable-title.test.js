// public/features/roles.js readableTitle: role abbreviations in posted titles are written out
// for display (user request 2026-10-03: no abbreviations that are not self-explanatory).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readableTitle } from '../public/features/roles.js';

const CASES = [
  ['RE / RS - Foundations, Search', 'Research Engineer / Research Scientist - Foundations, Search'],
  ['RE/RS, Data Understanding - Foundations', 'Research Engineer / Research Scientist, Data Understanding - Foundations'],
  ['Full-Stack SWE, Data Acquisition (Foundations)', 'Full-Stack Software Engineer, Data Acquisition (Foundations)'],
  ['Engineering Manager, MLE', 'Engineering Manager, Machine Learning Engineering'],
  ['Senior TPM, Mathematical Software & Algorithms', 'Senior Technical Program Manager, Mathematical Software & Algorithms'],
  ['TPM Manager, Infrastructure', 'Manager, Technical Program Management, Infrastructure'],
  ['Technical Program Manager (TPM) - Defense', 'Technical Program Manager - Defense'],
  ['Forward Deployed Engineer, Air Defense (FDE)', 'Forward Deployed Engineer, Air Defense'],
  ['Strategy & Operations, FDE', 'Strategy & Operations, Forward Deployed Engineering'],
  ['Recruiter, Go-To-Market (GTM)', 'Recruiter, Go-To-Market'],
  ['AWS GTM Partnership Lead, Enterprise', 'AWS Go-to-Market Partnership Lead, Enterprise'],
  ['Sr. Staff BD Account Executive - Autonomy Specialist, Japan (R5096)', 'Senior Staff Business Development Account Executive - Autonomy Specialist, Japan (R5096)'],
  ['Multinational Digital Infrastructure - Full Stack SW Eng. (US)', 'Multinational Digital Infrastructure - Full Stack Software Engineer (US)'],
  // Left alone: plain titles, country/location parentheses, domain terms that are the company's own.
  ['Senior Software Engineer (US)', 'Senior Software Engineer (US)'],
  ['Antenna RF Engineer, EW', 'Antenna RF Engineer, EW'],
  ['Research Engineer, RL Engineering', 'Research Engineer, RL Engineering'],
];

test('readableTitle writes out role abbreviations and drops repeated initials', () => {
  for (const [posted, want] of CASES) assert.equal(readableTitle(posted), want, posted);
});

test('readableTitle is idempotent', () => {
  for (const [posted] of CASES) assert.equal(readableTitle(readableTitle(posted)), readableTitle(posted), posted);
});
