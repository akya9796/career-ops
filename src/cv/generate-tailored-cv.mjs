import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'fs';
import { dirname, extname, resolve } from 'path';
import { pathToFileURL } from 'url';
import { requireLatestJob } from '../jobs/latest-job.mjs';

const DEFAULT_MASTER_PDF = 'master/master-cv.pdf';
const DEFAULT_MODE = 'copy-master';

function slugify(value) {
  return String(value || 'application')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) || 'application';
}

function cleanJobValue(value) {
  const cleaned = String(value || '').replace(/\s+/g, ' ').trim();
  if (!cleaned) return '';
  if (/^(position|job|jobs|role|company|your company|the role)$/i.test(cleaned)) return '';
  return cleaned;
}

function readJob(path) {
  if (!path) return { text: '', title: '', company: '' };
  if (!existsSync(path)) throw new Error(`Job file not found: ${path}`);
  const raw = readFileSync(path, 'utf-8');
  if (path.toLowerCase().endsWith('.json')) {
    try {
      const job = JSON.parse(raw);
      return {
        text: job.description || raw,
        title: cleanJobValue(job.title),
        company: cleanJobValue(job.company),
      };
    } catch {
      return { text: raw, title: '', company: '' };
    }
  }
  return {
    text: raw,
    title: cleanJobValue(raw.match(/^Job Title:\s*(.+)$/im)?.[1] || raw.match(/^Role:\s*(.+)$/im)?.[1]),
    company: cleanJobValue(raw.match(/^Company:\s*(.+)$/im)?.[1]),
  };
}

function jobId(job) {
  const company = cleanJobValue(job.company);
  const title = cleanJobValue(job.title);
  if (company || title) return `${slugify(company || 'company')}-${slugify(title || 'role')}`;
  return 'application-cv';
}

function defaultOutputForJob(job) {
  return `generated/${jobId(job)}/cv.pdf`;
}

function normalizePdfOutput(output, job) {
  if (!output) return defaultOutputForJob(job);
  return extname(output).toLowerCase() === '.pdf'
    ? output
    : output.replace(/\.[^.\\/]+$/, '') + '.pdf';
}

function copyMasterPdf({ masterPdf, output }) {
  if (!existsSync(masterPdf)) {
    throw new Error(`Master CV PDF not found: ${masterPdf}. Add your canonical CV at master/master-cv.pdf.`);
  }
  mkdirSync(dirname(resolve(output)), { recursive: true });
  copyFileSync(masterPdf, output);
}

export function generateTailoredCv({
  masterPdf = DEFAULT_MASTER_PDF,
  cvPath,
  jobPath,
  output,
  mode = DEFAULT_MODE,
} = {}) {
  const resolvedMasterPdf = cvPath && extname(cvPath).toLowerCase() === '.pdf' ? cvPath : masterPdf;
  const job = readJob(jobPath);
  const resolvedMode = mode || DEFAULT_MODE;
  if (!['copy-master', 'light-tailor'].includes(resolvedMode)) {
    throw new Error('Invalid CV mode. Use --mode copy-master or --mode light-tailor.');
  }

  const pdfOutput = normalizePdfOutput(output, job);
  copyMasterPdf({ masterPdf: resolvedMasterPdf, output: pdfOutput });

  return {
    output: pdfOutput,
    mode: resolvedMode,
    master_pdf: resolvedMasterPdf,
    job_id: jobId(job),
    job_file: jobPath || '',
    format: 'master_pdf_template',
    layout_preserved: true,
    pages_policy: 'preserve_master_pdf',
    tailoring_applied: false,
    reason: resolvedMode === 'copy-master'
      ? 'copy-master mode uses the master CV PDF unchanged.'
      : 'light-tailor requested, but PDF-preserving editing is not implemented; copied the master CV unchanged to avoid lower-quality output.',
  };
}

async function main() {
  const args = process.argv.slice(2);
  let masterPdf = DEFAULT_MASTER_PDF;
  let cvPath = '';
  let jobPath = '';
  let output = '';
  let latest = false;
  let mode = DEFAULT_MODE;

  for (let i = 0; i < args.length; i++) {
    if ((args[i] === '--master-pdf' || args[i] === '--master') && args[i + 1]) masterPdf = args[++i];
    else if (args[i] === '--cv' && args[i + 1]) cvPath = args[++i];
    else if (args[i] === '--job' && args[i + 1]) jobPath = args[++i];
    else if (args[i] === '--output' && args[i + 1]) output = args[++i];
    else if (args[i] === '--mode' && args[i + 1]) mode = args[++i];
    else if (args[i] === '--latest') latest = true;
    else if (args[i] === '--pdf') {
      if (args[i + 1] && !args[i + 1].startsWith('--')) output = args[++i];
    } else if (args[i] === '--help' || args[i] === '-h') {
      console.log('Usage: node src/cv/generate-tailored-cv.mjs [--latest | --job data/jobs/job.json] [--mode copy-master|light-tailor] [--output generated/company-role/cv.pdf]');
      console.log('Default mode is copy-master. It copies master/master-cv.pdf unchanged.');
      process.exit(0);
    }
  }

  try {
    if (!jobPath && latest) jobPath = requireLatestJob().jobPath;
    const result = generateTailoredCv({ masterPdf, cvPath, jobPath, output, mode });
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
