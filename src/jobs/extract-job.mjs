import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { basename, dirname, resolve } from 'path';
import { pathToFileURL } from 'url';

function slugify(value) {
  return String(value || 'job').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'job';
}

function firstMatch(text, patterns) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[match.length - 1].trim();
  }
  return '';
}

function decodeHtmlEntities(value) {
  return String(value || '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#x27;/g, "'");
}

const GENERIC_COMPANY_VALUES = new Set([
  'position',
  'job',
  'jobs',
  'role',
  'opportunity',
  'company',
  'employer',
  'hiring team',
  'recruiter',
  'department',
  'type de contrat',
  'taux d\'activité',
  'domaine d\'activité',
  'tous les filtres',
]);

function cleanSingleLine(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .replace(/[|•].*$/, '')
    .trim()
    .replace(/^[\s:,-]+|[\s:,-]+$/g, '');
}

function cleanCompany(value) {
  const cleaned = cleanSingleLine(value);
  if (!cleaned) return '';
  if (GENERIC_COMPANY_VALUES.has(cleaned.toLowerCase())) return '';
  if (cleaned.length > 80) return '';
  if (/^(location|office|search|filter|position|contract|salary|apply|login)\b/i.test(cleaned)) return '';
  return cleaned;
}

function cleanLocation(value) {
  const cleaned = cleanSingleLine(value);
  if (!cleaned) return '';
  if (cleaned.length > 120) return '';
  if (/^(location|office|search|filter|job|jobs|apply|save|type de contrat|taux d'activit)/i.test(cleaned)) return '';
  return cleaned;
}

function cleanTitle(value) {
  const cleaned = cleanSingleLine(value);
  if (!cleaned) return '';
  if (/^(position|job|jobs|search|filter|all filters)$/i.test(cleaned)) return '';
  if (cleaned.length > 120) return '';
  return cleaned;
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
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function objectValues(value) {
  if (!value || typeof value !== 'object') return [];
  return Array.isArray(value) ? value : [value];
}

function extractJsonLdHints(html) {
  const hints = {};
  const scripts = String(html || '').match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi) || [];
  for (const script of scripts) {
    const jsonText = script.replace(/^<script[^>]*>/i, '').replace(/<\/script>$/i, '').trim();
    try {
      const parsed = JSON.parse(decodeHtmlEntities(jsonText));
      const nodes = objectValues(parsed['@graph'] || parsed);
      for (const node of nodes.flatMap(objectValues)) {
        const type = String(node?.['@type'] || '').toLowerCase();
        if (!type.includes('jobposting')) continue;
        hints.title ||= cleanTitle(node.title);
        hints.company ||= cleanCompany(node.hiringOrganization?.name || node.organization?.name);
        const locations = objectValues(node.jobLocation);
        const address = locations[0]?.address || {};
        hints.location ||= cleanLocation([
          address.addressLocality,
          address.addressRegion,
          address.addressCountry,
        ].filter(Boolean).join(', '));
      }
    } catch {
      // Some sites include non-standard JSON-LD. Other extraction paths still apply.
    }
  }
  return hints;
}

function extractHtmlHints(html) {
  const raw = decodeHtmlEntities(html);
  const title = firstMatch(raw, [
    /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i,
    /<title[^>]*>([\s\S]*?)<\/title>/i,
  ]);
  const cleanedTitle = cleanTitle(title.replace(/\s+-\s+(?:Offre d'emploi chez|Annonce sur).+$/i, ''));
  const company = firstMatch(title, [
    /\s+-\s+Offre d'emploi chez\s+(.+?)\s+-\s+jobup\.ch/i,
    /\s+-\s+Job offer at\s+(.+?)\s+-\s+jobup\.ch/i,
  ]);
  return {
    ...extractJsonLdHints(raw),
    title: cleanedTitle || extractJsonLdHints(raw).title || '',
    company: cleanCompany(company) || extractJsonLdHints(raw).company || '',
  };
}

const LOCATION_WORD_PATTERN = /(Gen.{0,4}ve|Geneva|Lausanne|Z.{0,4}rich|Zurich|Basel|Bern|Paris|Lyon|Annecy|Remote|France|Switzerland)/i;

export function inferJobMetadataFromText(text, hints = {}) {
  const normalized = String(text || '').replace(/\r\n/g, '\n').trim();
  const titleFromHeader = firstMatch(normalized, [
    /^#\s+(.+)$/m,
    /^Position Title:\s*(.+)$/im,
    /^Role:\s*(.+)$/im,
    /^Job Title:\s*(.+)$/im,
    /^Title:\s*(.+)$/im,
    /^(.+?)\s+-\s+(?:Offre d'emploi chez|Annonce sur|Job offer at)\s+.+?\s+-\s+jobup\.ch\s*$/im,
    /\bApplication for\s+(.+?)\s+(?:at|@)\s+[A-Z][A-Za-z0-9 .&-]{2,}/i,
  ]);
  const title = cleanTitle(hints.title || titleFromHeader);

  const companyFromHeader = firstMatch(normalized, [
    /^Company:\s*(.+)$/im,
    /^Employer:\s*(.+)$/im,
    /^Organization:\s*(.+)$/im,
    /^.+?\s+-\s+Offre d'emploi chez\s+(.+?)\s+-\s+jobup\.ch\s*$/im,
    /^.+?\s+-\s+Job offer at\s+(.+?)\s+-\s+jobup\.ch\s*$/im,
  ]);
  let company = cleanCompany(hints.company || companyFromHeader);

  let location = cleanLocation(hints.location || firstMatch(normalized, [
    /^Location:\s*(.+)$/im,
    /^Lieu\s*:\s*(.+)$/im,
    /\b(?:Location|Office|Lieu de travail)\s*[:|-]\s*(.+)$/im,
  ]));

  if (title) {
    const lines = normalized.split('\n').map(line => cleanSingleLine(line)).filter(Boolean);
    const titleIndex = lines.findIndex(line => line.toLowerCase() === title.toLowerCase());
    if (titleIndex > 0) {
      for (let index = Math.max(0, titleIndex - 5); index < titleIndex; index++) {
        const line = lines[index];
        if (!company && /^[A-Z0-9][A-Za-z0-9 .&'()+/-]{2,80}$/.test(line) && !/^(save|apply|postuler|sauvegarder|recherche)$/i.test(line)) {
          const companyLocation = line.match(/^(.+?)\s+((?:Gen.{0,4}ve|Geneva|Lausanne|Z.{0,4}rich|Zurich|Basel|Bern|Paris|Lyon|Annecy|Remote|France|Switzerland).*)$/i);
          if (companyLocation) {
            company = cleanCompany(companyLocation[1]);
            location ||= cleanLocation(companyLocation[2]);
          } else {
            company = cleanCompany(line);
          }
        }
        if (!location && LOCATION_WORD_PATTERN.test(line)) {
          location = cleanLocation(line);
        }
      }
    }
  }

  return { title: title || '', company: company || '', location: location || '' };
}

function outputPathForFacts(facts, fallback = 'job') {
  const dir = process.env.APPLICATION_ASSISTANT_JOBS_DIR || 'data/jobs';
  return `${dir}/${slugify(facts.company || fallback)}-${slugify(facts.title || 'job')}.json`;
}

export function extractJobFacts(text, source = '', hints = {}) {
  const normalized = String(text || '').replace(/\r\n/g, '\n').trim();
  const metadata = inferJobMetadataFromText(normalized, hints);
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
    title: metadata.title,
    company: metadata.company,
    location: metadata.location,
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

export async function extractJobFromUrl({ url, output, fetchImpl = fetch } = {}) {
  if (!url) throw new Error('Job URL is required.');
  let response;
  try {
    response = await fetchImpl(url);
  } catch (err) {
    throw new Error(`Could not fetch job URL: ${url}. ${err.message}`);
  }
  if (!response.ok) {
    throw new Error(`Could not fetch job URL: ${url}. HTTP ${response.status}`);
  }
  const contentType = response.headers.get('content-type') || '';
  const raw = await response.text();
  const hints = contentType.includes('html') || /<html|<body|<main|<article/i.test(raw) ? extractHtmlHints(raw) : {};
  const text = contentType.includes('html') || /<html|<body|<main|<article/i.test(raw)
    ? htmlToText(raw)
    : raw.trim();
  if (!text) throw new Error(`No job description text extracted from URL: ${url}`);
  const facts = extractJobFacts(text, url, hints);
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
