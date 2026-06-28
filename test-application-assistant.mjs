#!/usr/bin/env node

import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { resolve } from 'path';
import { tmpdir } from 'os';
import { parseMasterCv } from './src/cv/master-cv.mjs';
import { scoreJob } from './src/scoring/scoring-engine.mjs';
import { extractJobFacts } from './src/jobs/extract-job.mjs';
import { generateTailoredCv } from './src/cv/generate-tailored-cv.mjs';
import { generateCoverLetter } from './src/cover_letters/generate-cover-letter.mjs';
import { generateInterviewPrep } from './src/interview/generate-interview-prep.mjs';

const temp = mkdtempSync(join(tmpdir(), 'application-assistant-'));

try {
  const cvPath = join(temp, 'cv.md');
  const jobPath = join(temp, 'job.txt');
  writeFileSync(cvPath, `# Akash Kotkar

## Summary

Technical Product Analyst with experience in API-driven workflows.

## Work Experience

- Led functional evolution of bulk data ingestion workflow (Excel -> CSV -> API).
- Conducted API testing for client classification and data extraction.

## Skills

REST, SOAP, JSON, XML, Jira, Confluence
`);
  writeFileSync(jobPath, `Job Title: Technical Business Analyst
Company: ExampleCo
Location: France

We need API analysis, REST, JSON, XML, Jira, functional specifications, and stakeholder coordination.`);

  const parsed = parseMasterCv(readFileSync(cvPath, 'utf-8'), cvPath);
  assert.equal(parsed.sections.some(section => section.type === 'skills'), true);
  assert.equal(parsed.facts.some(fact => fact.line_start > 0), true);

  const job = extractJobFacts(readFileSync(jobPath, 'utf-8'), jobPath);
  assert.equal(job.title, 'Technical Business Analyst');
  assert.equal(job.company, 'ExampleCo');
  assert.equal(job.skills.includes('api'), true);

  const result = scoreJob({
    jobText: readFileSync(jobPath, 'utf-8'),
    profile: parsed,
    scoringConfig: {
      recommendations: { apply: 72, maybe: 55 },
      dimensions: {
        skill_overlap: { weight: 10, positive_keywords: ['REST', 'JSON', 'XML', 'Jira', 'Python'] },
        product_analysis_fit: { weight: 5, positive_keywords: ['API analysis', 'functional specifications'] },
      },
      risk_level: { risk_keywords: ['native german'] },
    },
  });
  assert.equal(result.overall_score > 0, true);
  assert.equal(['Apply', 'Maybe', 'Skip'].includes(result.recommendation), true);

  const tailored = generateTailoredCv({ cvPath, jobPath, output: join(temp, 'tailored.md') });
  assert.equal(tailored.selected_facts > 0, true);

  const cover = generateCoverLetter({ cvPath, jobPath, output: join(temp, 'cover.md') });
  assert.equal(cover.selected_facts > 0, true);

  const interview = generateInterviewPrep({ cvPath, jobPath, output: join(temp, 'interview.md') });
  assert.equal(interview.selected_facts > 0, true);

  const profilePath = join(temp, 'profile.json');
  const configPath = join(temp, 'scoring.json');
  writeFileSync(profilePath, JSON.stringify(parsed, null, 2));
  writeFileSync(configPath, JSON.stringify({
    recommendations: { apply: 72, maybe: 55 },
    dimensions: {
      skill_overlap: { weight: 10, positive_keywords: ['REST', 'JSON', 'XML', 'Jira', 'API analysis'] },
    },
    risk_level: { risk_keywords: [] },
  }, null, 2));

  const localScore = JSON.parse(execFileSync(process.execPath, [
    'src/scoring/scoring-engine.mjs',
    '--job', jobPath,
    '--profile', profilePath,
    '--config', configPath,
  ], { encoding: 'utf-8' }));
  assert.equal(localScore.overall_score > 0, true);
  assert.equal(localScore.job_file, jobPath);

  const urlText = `Job Title: API Product Owner
Company: UrlCo
Location: Remote Europe

This role needs REST, JSON, XML, API analysis, Jira, and stakeholder coordination.`;
  const dataUrl = `data:text/plain,${encodeURIComponent(urlText)}`;
  const urlScore = JSON.parse(execFileSync(process.execPath, [
    'src/scoring/scoring-engine.mjs',
    '--url', dataUrl,
    '--profile', profilePath,
    '--config', configPath,
  ], { encoding: 'utf-8' }));
  assert.equal(urlScore.overall_score > 0, true);
  assert.equal(urlScore.job_file.includes('data/jobs/'), true);
  assert.match(readFileSync(urlScore.job_file, 'utf-8'), /UrlCo/);

  const missingInput = spawnSync(process.execPath, [
    'src/scoring/scoring-engine.mjs',
    '--profile', profilePath,
    '--config', configPath,
  ], { encoding: 'utf-8' });
  assert.notEqual(missingInput.status, 0);
  assert.match(missingInput.stderr, /Provide either --job <file> or --url <job-url>/);

  const explicitCliCv = JSON.parse(execFileSync(process.execPath, [
    'src/cv/generate-tailored-cv.mjs',
    '--cv', cvPath,
    '--job', jobPath,
    '--output', join(temp, 'explicit-cli-tailored.md'),
  ], { encoding: 'utf-8' }));
  assert.equal(explicitCliCv.job_file, jobPath);
  assert.equal(explicitCliCv.selected_facts > 0, true);

  const latestRoot = join(temp, 'latest');
  const latestJobs = join(latestRoot, 'jobs');
  const latestApplications = join(latestRoot, 'applications');
  mkdirSync(latestJobs, { recursive: true });
  mkdirSync(latestApplications, { recursive: true });
  const latestEnv = {
    ...process.env,
    APPLICATION_ASSISTANT_JOBS_DIR: latestJobs,
    APPLICATION_ASSISTANT_APPLICATIONS_DIR: latestApplications,
  };
  const latestScore = JSON.parse(execFileSync(process.execPath, [
    'src/scoring/scoring-engine.mjs',
    '--url', dataUrl,
    '--profile', profilePath,
    '--config', configPath,
  ], { encoding: 'utf-8', env: latestEnv }));
  assert.match(latestScore.job_file, /urlco-api-product-owner\.json$/);

  const latestCv = JSON.parse(execFileSync(process.execPath, [
    'src/cv/generate-tailored-cv.mjs',
    '--cv', cvPath,
    '--latest',
    '--output', join(temp, 'latest-tailored.md'),
  ], { encoding: 'utf-8', env: latestEnv }));
  assert.equal(resolve(latestCv.job_file), resolve(latestScore.job_file));

  const latestCover = JSON.parse(execFileSync(process.execPath, [
    'src/cover_letters/generate-cover-letter.mjs',
    '--cv', cvPath,
    '--latest',
    '--output', join(temp, 'latest-cover.md'),
  ], { encoding: 'utf-8', env: latestEnv }));
  assert.equal(resolve(latestCover.job_file), resolve(latestScore.job_file));

  const latestInterview = JSON.parse(execFileSync(process.execPath, [
    'src/interview/generate-interview-prep.mjs',
    '--cv', cvPath,
    '--latest',
    '--output', join(temp, 'latest-interview.md'),
  ], { encoding: 'utf-8', env: latestEnv }));
  assert.equal(resolve(latestInterview.job_file), resolve(latestScore.job_file));

  const emptyLatestRoot = join(temp, 'empty-latest');
  const emptyLatestEnv = {
    ...process.env,
    APPLICATION_ASSISTANT_JOBS_DIR: join(emptyLatestRoot, 'jobs'),
    APPLICATION_ASSISTANT_APPLICATIONS_DIR: join(emptyLatestRoot, 'applications'),
  };
  mkdirSync(emptyLatestEnv.APPLICATION_ASSISTANT_JOBS_DIR, { recursive: true });
  mkdirSync(emptyLatestEnv.APPLICATION_ASSISTANT_APPLICATIONS_DIR, { recursive: true });
  const missingLatest = spawnSync(process.execPath, [
    'src/cv/generate-tailored-cv.mjs',
    '--cv', cvPath,
    '--latest',
    '--output', join(temp, 'missing-latest.md'),
  ], { encoding: 'utf-8', env: emptyLatestEnv });
  assert.notEqual(missingLatest.status, 0);
  assert.match(missingLatest.stderr, /No latest job found\. First run: npm run score:job -- --url <job_url>/);

  console.log('application assistant tests passed');
} finally {
  rmSync(temp, { recursive: true, force: true });
}
