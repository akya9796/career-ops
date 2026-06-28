import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { pathToFileURL } from 'url';
import { parseMasterCv } from '../cv/master-cv.mjs';
import { requireLatestJob } from '../jobs/latest-job.mjs';

function readJob(path) {
  if (!path || !existsSync(path)) throw new Error(`Job file not found: ${path}`);
  const raw = readFileSync(path, 'utf-8');
  if (path.endsWith('.json')) {
    try {
      const job = JSON.parse(raw);
      return { text: job.description || raw, title: job.title || 'Role', company: job.company || 'Company' };
    } catch {
      return { text: raw, title: 'Role', company: 'Company' };
    }
  }
  return { text: raw, title: 'Role', company: 'Company' };
}

export function generateInterviewPrep({ cvPath = 'cv.md', jobPath, output = 'data/generated/interview-prep.md' } = {}) {
  const cvText = readFileSync(cvPath, 'utf-8');
  const parsed = parseMasterCv(cvText, cvPath);
  const job = readJob(jobPath);
  const jobLower = job.text.toLowerCase();
  const facts = parsed.facts
    .filter(fact => fact.section_type.endsWith('_bullet'))
    .filter(fact => fact.text.toLowerCase().split(/[^a-z0-9]+/).some(token => token.length > 3 && jobLower.includes(token)))
    .slice(0, 8);
  const notes = [
    `# Interview Prep - ${job.company} - ${job.title}`,
    '',
    '## Likely Questions',
    '',
    '- Walk me through your experience with API-driven workflows.',
    '- How have you handled bulk data ingestion or data validation issues?',
    '- Describe a time you coordinated between product, engineering, and QA.',
    '- How do you approach root-cause analysis for production issues?',
    '- What documentation do you create for functional or technical delivery?',
    '',
    '## CV-Backed Talking Points',
    '',
    ...(facts.length ? facts.map(fact => `- ${fact.text} _(source: ${fact.source}:${fact.line_start})_`) : ['- No direct keyword-backed talking points found. Review cv.md manually.']),
    '',
    '## Preparation Gaps',
    '',
    '- Review any job requirements that are not explicitly present in cv.md.',
    '- Do not claim tools, domains, authorization, degrees, or certifications unless they appear in cv.md.',
    '',
  ].join('\n');
  mkdirSync(dirname(resolve(output)), { recursive: true });
  writeFileSync(output, notes);
  return { output, selected_facts: facts.length };
}

function main() {
  const args = process.argv.slice(2);
  let cvPath = 'cv.md';
  let jobPath = '';
  let output = 'data/generated/interview-prep.md';
  let latest = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--cv' && args[i + 1]) cvPath = args[++i];
    else if (args[i] === '--job' && args[i + 1]) jobPath = args[++i];
    else if (args[i] === '--output' && args[i + 1]) output = args[++i];
    else if (args[i] === '--latest') latest = true;
  }
  try {
    if (!jobPath && latest) jobPath = requireLatestJob().jobPath;
    const result = generateInterviewPrep({ cvPath, jobPath, output });
    result.job_file = jobPath;
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
