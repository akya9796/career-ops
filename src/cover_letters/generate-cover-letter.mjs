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
      return { text: job.description || raw, title: job.title || 'the role', company: job.company || 'your company' };
    } catch {
      return { text: raw, title: 'the role', company: 'your company' };
    }
  }
  return { text: raw, title: 'the role', company: 'your company' };
}

export function generateCoverLetter({ cvPath = 'cv.md', jobPath, output = 'data/generated/cover-letter.md' } = {}) {
  if (!existsSync(cvPath)) throw new Error(`CV not found: ${cvPath}`);
  const cvText = readFileSync(cvPath, 'utf-8');
  const parsed = parseMasterCv(cvText, cvPath);
  const job = readJob(jobPath);
  const jobLower = job.text.toLowerCase();
  const relevant = parsed.facts
    .filter(fact => fact.section_type.endsWith('_bullet'))
    .filter(fact => fact.text.toLowerCase().split(/[^a-z0-9]+/).some(token => token.length > 3 && jobLower.includes(token)))
    .slice(0, 4);
  const letter = [
    `# Cover Letter - ${job.company} - ${job.title}`,
    '',
    'Dear Hiring Team,',
    '',
    `I am applying for ${job.title}. My CV shows experience across product definition, business analysis, API-driven workflows, bulk data ingestion, and functional system analysis.`,
    '',
    relevant.length
      ? 'The most relevant CV-backed points for this role are:'
      : 'The available CV facts should be reviewed against the job description before sending this letter.',
    '',
    ...relevant.map(fact => `- ${fact.text} _(source: ${fact.source}:${fact.line_start})_`),
    '',
    `I would welcome the opportunity to discuss how this experience could support ${job.company}.`,
    '',
    'Kind regards,',
    '',
    'Akash Kotkar',
    '',
    '## Safety Check',
    '',
    '- Generated only from cv.md and job facts.',
    '- No unsupported work authorization, certifications, degrees, employers, or achievements were added.',
    '',
  ].join('\n');
  mkdirSync(dirname(resolve(output)), { recursive: true });
  writeFileSync(output, letter);
  return { output, selected_facts: relevant.length };
}

function defaultPdfPath(markdownPath) {
  return markdownPath.replace(/\.[^.\\/]+$/, '') + '.pdf';
}

async function main() {
  const args = process.argv.slice(2);
  let cvPath = 'cv.md';
  let jobPath = '';
  let output = 'data/generated/cover-letter.md';
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
    const result = generateCoverLetter({ cvPath, jobPath, output });
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
