import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { pathToFileURL } from 'url';
import { parseMasterCv } from '../cv/master-cv.mjs';
import { requireLatestJob } from '../jobs/latest-job.mjs';
import { readAppConfig } from '../config/app-config.mjs';
import { AIManager } from '../ai/ai-manager.mjs';
import { loadPrompt } from '../ai/prompt-loader.mjs';

const GENERIC_JOB_VALUES = new Set(['', 'position', 'job', 'jobs', 'role', 'the role', 'your company', 'company']);

function slugify(value) {
  return String(value || 'job').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'job';
}

function cleanJobValue(value) {
  const cleaned = String(value || '').replace(/\s+/g, ' ').trim();
  return GENERIC_JOB_VALUES.has(cleaned.toLowerCase()) ? '' : cleaned;
}

function readJob(path) {
  if (!path || !existsSync(path)) throw new Error(`Job file not found: ${path}`);
  const raw = readFileSync(path, 'utf-8');
  if (path.endsWith('.json')) {
    try {
      const job = JSON.parse(raw);
      return { text: job.description || raw, title: cleanJobValue(job.title), company: cleanJobValue(job.company) };
    } catch {
      return { text: raw, title: '', company: '' };
    }
  }
  return {
    text: raw,
    title: cleanJobValue(raw.match(/^Job Title:\s*(.+)$/im)?.[1]?.trim() || raw.match(/^Role:\s*(.+)$/im)?.[1]?.trim()),
    company: cleanJobValue(raw.match(/^Company:\s*(.+)$/im)?.[1]?.trim()),
  };
}

function contactFromCv(cvText, profilePath = 'config/profile.yml') {
  const config = readAppConfig({ profilePath });
  const name = config.candidate.full_name || cvText.match(/^#\s+(.+)$/m)?.[1]?.trim() || 'Candidate';
  const email = config.candidate.email || cvText.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] || '';
  const phoneRaw = config.candidate.phone || cvText.match(/\+?\d[\d\s().-]{7,}\d/)?.[0] || '';
  const location = config.candidate.location || cvText.match(/^([A-Z][A-Za-z .'-]+,\s*[A-Z][A-Za-z .'-]+)\s*$/m)?.[1]?.trim() || '';
  return { name, email, phone: formatPhone(phoneRaw), location };
}

function formatPhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits === '33745671942') return '+33 7 45 67 19 42';
  return String(value || '').trim();
}

function sentenceFromFacts(facts) {
  if (facts.length === 0) {
    return 'I bring hands-on experience with API-driven workflows, functional analysis, and structured documentation from complex data-intensive platforms.';
  }
  return facts
    .map(fact => fact.text.replace(/\.$/, '').trim())
    .filter(Boolean)
    .slice(0, 2)
    .map(text => `${text}.`)
    .join(' ');
}

function writeAudit({ auditPath, job, output, facts }) {
  mkdirSync(dirname(resolve(auditPath)), { recursive: true });
  const lines = [
    '# Cover Letter Audit',
    '',
    `Job: ${job.company || 'Unknown company'} - ${job.title || 'Unknown role'}`,
    `Applicant-facing file: ${output}`,
    '',
    '## CV Facts Used',
    '',
    ...(facts.length ? facts.map(fact => `- cv.md:${fact.line_start} ${fact.text}`) : ['- No specific bullet facts selected; letter used only the CV summary.']),
    '',
  ];
  writeFileSync(auditPath, lines.join('\n'));
}

export function generateCoverLetter({ cvPath = 'cv.md', jobPath, output = 'data/generated/cover-letter.md', profilePath = 'config/profile.yml' } = {}) {
  if (!existsSync(cvPath)) throw new Error(`CV not found: ${cvPath}`);
  const cvText = readFileSync(cvPath, 'utf-8');
  const contact = contactFromCv(cvText, profilePath);
  const parsed = parseMasterCv(cvText, cvPath);
  const job = readJob(jobPath);
  const jobLower = job.text.toLowerCase();
  const experienceFacts = parsed.facts
    .filter(fact => fact.section_type.endsWith('_bullet'))
    .filter(fact => /experience/i.test(fact.section_type) || /Product Definition|Business Analyst|Project Manager|Intern/i.test(fact.section))
    .filter(fact => fact.text.toLowerCase().split(/[^a-z0-9]+/).some(token => token.length > 3 && jobLower.includes(token)))
    .slice(0, 3);
  const fallbackFacts = parsed.facts
    .filter(fact => fact.section_type.endsWith('_bullet'))
    .filter(fact => fact.text.toLowerCase().split(/[^a-z0-9]+/).some(token => token.length > 3 && jobLower.includes(token)))
    .slice(0, 3);
  const relevant = experienceFacts.length ? experienceFacts : fallbackFacts;
  const company = cleanJobValue(job.company);
  const title = cleanJobValue(job.title);
  const companyLine = company || 'Hiring Team';
  const titleDisplay = title || 'the advertised role';
  const companyDisplay = company || 'your team';
  const interestTarget = company ? `${titleDisplay} at ${company}` : titleDisplay;
  const today = new Date().toISOString().slice(0, 10);
  const letter = [
    contact.name,
    contact.location,
    contact.email,
    contact.phone,
    '',
    today,
    '',
    'Hiring Team',
    companyLine,
    '',
    `Subject: Application for ${titleDisplay}`,
    '',
    'Dear Hiring Team,',
    '',
    `I am writing to apply for ${interestTarget}. I am a Technical Product Analyst and Product Definition Analyst with 5+ years of experience across API-driven platforms, business analysis, and product/system analysis, with experience spanning hospitality tech, fintech, and ecommerce.`,
    '',
    `My current work at Amadeus through Astek is closely aligned with this opportunity: I work on bulk data ingestion, REST/SOAP API analysis, JSON/XML validation, functional documentation, and issue resolution across product, engineering, QA, and business stakeholders. ${sentenceFromFacts(relevant)} I would bring the same structured approach to understanding requirements, clarifying system behavior, and supporting reliable delivery for ${companyDisplay}.`,
    '',
    `I can help ${companyDisplay} create clearer links between product intent, engineering implementation, QA validation, and business outcomes, while improving issue resolution, data reliability, and scalable operational workflows. Thank you for your time and consideration. I would welcome the opportunity to discuss how my background can support your team.`,
    '',
    'Sincerely,',
    contact.name,
    '',
  ].join('\n');
  mkdirSync(dirname(resolve(output)), { recursive: true });
  writeFileSync(output, letter);
  const jobId = `${slugify(job.company || 'job')}-${slugify(job.title || 'role')}`;
  const audit = `data/generated/${jobId}/cover-letter-audit.md`;
  writeAudit({ auditPath: audit, job, output, facts: relevant });
  return { output, audit, selected_facts: relevant.length };
}

export async function generateCoverLetterWithAI({
  cvPath = 'cv.md',
  jobPath,
  output = 'data/generated/cover-letter.md',
  profilePath = 'config/profile.yml',
  aiManager = null,
} = {}) {
  const fallback = generateCoverLetter({ cvPath, jobPath, output, profilePath });
  const cvText = readFileSync(cvPath, 'utf-8');
  const job = readJob(jobPath);
  const prompt = loadPrompt('cover-letter');
  const manager = aiManager || new AIManager();
  const result = await manager.generate({
    systemPrompt: prompt.text,
    userPrompt: 'Generate the final cover letter only. Do not include audit notes, markdown headings, or unsupported claims.',
    input: {
      cv: cvText,
      job,
      profile: readAppConfig({ profilePath }).candidate,
    },
    fallback: readFileSync(output, 'utf-8'),
    maxOutputTokens: 1800,
  });
  if (result.ok && result.text.trim()) {
    writeFileSync(output, result.text.trim() + '\n');
    return { ...fallback, ai: { provider: result.provider, model: result.model, used: true } };
  }
  return { ...fallback, ai: { provider: result.provider, used: false, error: result.error } };
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
    const result = args.includes('--ai')
      ? await generateCoverLetterWithAI({ cvPath, jobPath, output })
      : generateCoverLetter({ cvPath, jobPath, output });
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
