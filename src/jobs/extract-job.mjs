import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { basename, dirname, resolve } from 'path';
import { pathToFileURL } from 'url';

function slugify(value) {
  return String(value || 'job').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'job';
}

function firstMatch(text, patterns) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  return '';
}

function htmlToText(value) {
  return String(value || '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|div|li|h1|h2|h3|section|article)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function outputPathForFacts(facts, fallback = 'job') {
  const dir = process.env.APPLICATION_ASSISTANT_JOBS_DIR || 'data/jobs';
  return `${dir}/${slugify(facts.company || fallback)}-${slugify(facts.title || 'job')}.json`;
}

export function extractJobFacts(text, source = '') {
  const normalized = String(text || '').replace(/\r\n/g, '\n').trim();
  const title = firstMatch(normalized, [
    /^#\s+(.+)$/m,
    /^Role:\s*(.+)$/im,
    /^Job Title:\s*(.+)$/im,
    /^Title:\s*(.+)$/im,
  ]);
  const company = firstMatch(normalized, [
    /^Company:\s*(.+)$/im,
    /^Employer:\s*(.+)$/im,
    /(?:at|@)\s+([A-Z][A-Za-z0-9 .&-]{2,})/,
  ]);
  const location = firstMatch(normalized, [
    /^Location:\s*(.+)$/im,
    /\b(Location|Office)\s*[:|-]\s*(.+)$/im,
  ]);
  const lower = normalized.toLowerCase();
  const skills = [
    'api', 'rest', 'soap', 'json', 'xml', 'etl', 'vba', 'sql', 'python',
    'jira', 'confluence', 'swagger', 'postman', 'agile', 'safe',
    'product owner', 'product manager', 'business analyst', 'requirements',
  ].filter(skill => lower.includes(skill));
  return {
    schema_version: 1,
    source,
    extracted_at: new Date().toISOString(),
    title: title || '',
    company: company || '',
    location: location || '',
    work_mode: lower.includes('remote') ? 'remote' : lower.includes('hybrid') ? 'hybrid' : lower.includes('onsite') ? 'onsite' : '',
    skills,
    description: normalized,
  };
}

export function extractJobFromFile({ input, output } = {}) {
  if (!input || !existsSync(input)) throw new Error(`Job file not found: ${input}`);
  const text = readFileSync(input, 'utf-8');
  const facts = extractJobFacts(text, input);
  const out = output || outputPathForFacts(facts, basename(input));
  mkdirSync(dirname(resolve(out)), { recursive: true });
  writeFileSync(out, JSON.stringify(facts, null, 2) + '\n');
  return { facts, output: out };
}

export async function extractJobFromUrl({ url, output } = {}) {
  if (!url) throw new Error('Job URL is required.');
  let response;
  try {
    response = await fetch(url);
  } catch (err) {
    throw new Error(`Could not fetch job URL: ${url}. ${err.message}`);
  }
  if (!response.ok) {
    throw new Error(`Could not fetch job URL: ${url}. HTTP ${response.status}`);
  }
  const contentType = response.headers.get('content-type') || '';
  const raw = await response.text();
  const text = contentType.includes('html') || /<html|<body|<main|<article/i.test(raw)
    ? htmlToText(raw)
    : raw.trim();
  if (!text) throw new Error(`No job description text extracted from URL: ${url}`);
  const facts = extractJobFacts(text, url);
  const out = output || outputPathForFacts(facts, 'url-job');
  mkdirSync(dirname(resolve(out)), { recursive: true });
  writeFileSync(out, JSON.stringify(facts, null, 2) + '\n');
  return { facts, output: out };
}

async function main() {
  const args = process.argv.slice(2);
  let input = '';
  let url = '';
  let output = '';
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--input' && args[i + 1]) input = args[++i];
    else if (args[i] === '--url' && args[i + 1]) url = args[++i];
    else if (args[i] === '--output' && args[i + 1]) output = args[++i];
    else if (args[i] === '--help' || args[i] === '-h') {
      console.log('Usage: node src/jobs/extract-job.mjs --input data/jobs/job.txt [--output data/jobs/job.json]');
      console.log('   or: node src/jobs/extract-job.mjs --url https://example.com/job [--output data/jobs/job.json]');
      process.exit(0);
    }
  }
  if (!input && !url) {
    console.error('Missing input. Provide --input <file> or --url <job-url>.');
    process.exit(1);
  }
  const result = input
    ? extractJobFromFile({ input, output })
    : await extractJobFromUrl({ url, output });
  console.log(JSON.stringify({ output: result.output, title: result.facts.title, company: result.facts.company }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
