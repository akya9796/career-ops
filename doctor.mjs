#!/usr/bin/env node

import { existsSync } from 'fs';
import { join } from 'path';

const required = [
  'cv.md',
  'master/master-cv.pdf',
  'config/profile.yml',
  'config/scoring.yml',
  'config/portals.yml',
  'prompts/scoring.md',
  'prompts/cv-tailoring.md',
  'prompts/cover-letter.md',
  'prompts/interview-prep.md',
  'src/cv/master-cv.mjs',
  'src/scoring/scoring-engine.mjs',
  'src/scoring/score-batch.mjs',
  'src/config/app-config.mjs',
  'src/jobs/discover-jobs.mjs',
  'src/cv/generate-tailored-cv.mjs',
  'src/cover_letters/generate-cover-letter.mjs',
  'src/interview/generate-interview-prep.mjs',
  'src/applications/generate-batch.mjs',
  'src/applications/refresh-pipeline.mjs',
  'src/applications/refresh-once.mjs',
  'src/dashboard/server.mjs',
  'src/dashboard/assets/dashboard.css',
  'src/dashboard/assets/dashboard.js',
  'src/applications/apply-queue.mjs',
  'src/applications/apply-assist.mjs',
];

const missing = required.filter(path => !existsSync(join(process.cwd(), path)));
const json = process.argv.includes('--json');

if (json) {
  console.log(JSON.stringify({ ok: missing.length === 0, missing }, null, 2));
  process.exit(missing.length === 0 ? 0 : 1);
}

console.log('AI Job Application Assistant doctor');
if (missing.length === 0) {
  console.log('OK: required files are present.');
  process.exit(0);
}

console.log('Missing required files:');
for (const file of missing) console.log(`- ${file}`);
process.exit(1);
