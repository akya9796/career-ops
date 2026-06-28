import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { pathToFileURL } from 'url';
import { parseMasterCv } from './master-cv.mjs';
import { requireLatestJob } from '../jobs/latest-job.mjs';

function readJobText(path) {
  if (!path || !existsSync(path)) throw new Error(`Job file not found: ${path}`);
  const raw = readFileSync(path, 'utf-8');
  if (path.endsWith('.json')) {
    try {
      return JSON.parse(raw).description || raw;
    } catch {
      return raw;
    }
  }
  return raw;
}

function relevanceScore(text, jobLower) {
  return String(text || '').toLowerCase().split(/[^a-z0-9+#.]+/).filter(token => token.length > 2 && jobLower.includes(token)).length;
}

export function generateTailoredCv({ cvPath = 'cv.md', jobPath, output = 'data/cv_versions/tailored-cv.md' } = {}) {
  if (!existsSync(cvPath)) throw new Error(`CV not found: ${cvPath}`);
  const cvText = readFileSync(cvPath, 'utf-8');
  const jobText = readJobText(jobPath);
  const parsed = parseMasterCv(cvText, cvPath);
  const jobLower = jobText.toLowerCase();
  const bullets = parsed.facts
    .filter(fact => fact.section_type.endsWith('_bullet'))
    .map(fact => ({ ...fact, relevance: relevanceScore(fact.text, jobLower) }))
    .sort((a, b) => b.relevance - a.relevance)
    .slice(0, 14);
  const skills = parsed.skills.filter(skill => jobLower.includes(skill.toLowerCase()));
  const markdown = [
    '# Akash Kotkar',
    '',
    '> Tailored CV generated from cv.md only. No unsupported facts added.',
    '',
    '## Relevant Summary',
    '',
    parsed.facts.find(fact => fact.section_type === 'summary')?.text || '',
    '',
    '## Most Relevant CV Facts',
    '',
    ...bullets.map(fact => `- ${fact.text} _(source: ${fact.source}:${fact.line_start})_`),
    '',
    '## Matching Skills',
    '',
    ...(skills.length ? skills.map(skill => `- ${skill}`) : ['- No direct skill keyword matches found.']),
    '',
    '## Full Source CV',
    '',
    cvText.trim(),
    '',
  ].join('\n');
  mkdirSync(dirname(resolve(output)), { recursive: true });
  writeFileSync(output, markdown);
  return { output, selected_facts: bullets.length, matching_skills: skills.length };
}

function defaultPdfPath(markdownPath) {
  return markdownPath.replace(/\.[^.\\/]+$/, '') + '.pdf';
}

async function main() {
  const args = process.argv.slice(2);
  let cvPath = 'cv.md';
  let jobPath = '';
  let output = 'data/cv_versions/tailored-cv.md';
  let pdf = '';
  let latest = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--cv' && args[i + 1]) cvPath = args[++i];
    else if (args[i] === '--job' && args[i + 1]) jobPath = args[++i];
    else if (args[i] === '--output' && args[i + 1]) output = args[++i];
    else if (args[i] === '--latest') latest = true;
    else if (args[i] === '--pdf') {
      if (args[i + 1] && !args[i + 1].startsWith('--')) pdf = args[++i];
      else pdf = defaultPdfPath(output);
    }
  }
  try {
    if (!jobPath && latest) jobPath = requireLatestJob().jobPath;
    const result = generateTailoredCv({ cvPath, jobPath, output });
    result.job_file = jobPath;
    if (pdf) {
      const { renderMarkdownFileToPdf } = await import('../pdf/render-markdown-pdf.mjs');
      result.pdf = await renderMarkdownFileToPdf(output, pdf);
    }
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
