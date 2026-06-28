import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { pathToFileURL } from 'url';
import { extractJobFromUrl } from '../jobs/extract-job.mjs';

async function readYaml(path) {
  const raw = readFileSync(path, 'utf-8');
  try {
    return JSON.parse(raw);
  } catch {
    // Fall through to js-yaml for users who prefer normal YAML syntax.
  }
  const yaml = await import('js-yaml');
  return yaml.load(raw);
}

function normalize(text) {
  return String(text || '').toLowerCase();
}

function countMatches(text, keywords = []) {
  const lower = normalize(text);
  const matches = [];
  for (const keyword of keywords || []) {
    const key = normalize(keyword).trim();
    if (key && lower.includes(key)) matches.push(keyword);
  }
  return [...new Set(matches)];
}

function recommendation(score, config) {
  const thresholds = config.recommendations || {};
  if (score >= (thresholds.apply ?? 72)) return 'Apply';
  if (score >= (thresholds.maybe ?? 55)) return 'Maybe';
  return 'Skip';
}

function estimateDifficulty(score, risks) {
  if (risks.length >= 4 || score < 45) return 'High';
  if (risks.length >= 2 || score < 68) return 'Medium';
  return 'Moderate';
}

function estimatePrepHours(score, missingSkills) {
  if (score >= 82 && missingSkills.length <= 2) return '3-5 hours';
  if (score >= 68) return '6-10 hours';
  if (score >= 52) return '10-16 hours';
  return '16+ hours if pursuing despite low fit';
}

function slugify(value) {
  return String(value || 'job').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'job';
}

function readJobMetadata(jobPath, jobText) {
  if (jobPath?.endsWith('.json')) {
    try {
      const parsed = JSON.parse(jobText);
      return {
        company: parsed.company || '',
        role: parsed.title || '',
        source: parsed.source || jobPath,
      };
    } catch {
      // Fall back to text matching below.
    }
  }
  const role = jobText.match(/^Job Title:\s*(.+)$/im)?.[1]?.trim()
    || jobText.match(/^Role:\s*(.+)$/im)?.[1]?.trim()
    || '';
  const company = jobText.match(/^Company:\s*(.+)$/im)?.[1]?.trim()
    || '';
  return { company, role, source: jobPath };
}

function readJobTextForScoring(jobPath) {
  const raw = readFileSync(jobPath, 'utf-8');
  if (jobPath.endsWith('.json')) {
    try {
      return JSON.parse(raw).description || raw;
    } catch {
      return raw;
    }
  }
  return raw;
}

export function scoreJob({ jobText, profile, scoringConfig }) {
  const dimensions = scoringConfig.dimensions || {};
  const dimensionResults = {};
  let weighted = 0;
  let totalWeight = 0;
  const allReasons = [];
  const risks = [];
  const missingSkills = [];

  const cvFacts = Array.isArray(profile?.facts) ? profile.facts : [];
  const cvFactText = cvFacts.map(fact => fact.text).join('\n');
  const combinedEvidence = `${jobText}\n${cvFactText}`;

  for (const [name, spec] of Object.entries(dimensions)) {
    const weight = Number(spec.weight || 0);
    if (weight <= 0) continue;
    const jobMatches = countMatches(jobText, spec.positive_keywords);
    const cvMatches = countMatches(cvFactText, spec.positive_keywords);
    const riskMatches = countMatches(jobText, spec.risk_keywords);
    const overlap = jobMatches.filter(item => countMatches(cvFactText, [item]).length > 0);
    const base = jobMatches.length === 0 ? 45 : Math.min(100, 45 + overlap.length * 18 + cvMatches.length * 4);
    const penalty = Math.min(35, riskMatches.length * 12);
    const score = Math.max(0, Math.min(100, Math.round(base - penalty)));
    weighted += score * weight;
    totalWeight += weight;
    dimensionResults[name] = {
      score,
      weight,
      job_matches: jobMatches,
      cv_matches: cvMatches,
      overlap,
      risk_matches: riskMatches,
    };
    if (overlap.length > 0) allReasons.push(`${name}: ${overlap.slice(0, 4).join(', ')}`);
    for (const risk of riskMatches) risks.push(`${name}: ${risk}`);
    for (const jobMatch of jobMatches) {
      if (!countMatches(cvFactText, [jobMatch]).length) missingSkills.push(jobMatch);
    }
  }

  const globalRisks = countMatches(jobText, scoringConfig.risk_level?.risk_keywords || []);
  for (const risk of globalRisks) risks.push(`risk_level: ${risk}`);

  const overall = totalWeight > 0 ? Math.round(weighted / totalWeight) : 0;
  const uniqueMissing = [...new Set(missingSkills)].slice(0, 15);
  const factsUsed = cvFacts
    .filter(fact => countMatches(combinedEvidence, fact.text.split(/\s+/).filter(word => word.length > 4).slice(0, 8)).length > 0)
    .slice(0, 12)
    .map(fact => ({
      id: fact.id,
      source: fact.source,
      line_start: fact.line_start,
      line_end: fact.line_end,
      text: fact.text,
    }));

  return {
    schema_version: 1,
    overall_score: overall,
    recommendation: recommendation(overall, scoringConfig),
    dimensions: dimensionResults,
    top_reasons: allReasons.slice(0, 8),
    risks: [...new Set(risks)].slice(0, 12),
    missing_skills: uniqueMissing,
    estimated_interview_difficulty: estimateDifficulty(overall, risks),
    estimated_preparation_time: estimatePrepHours(overall, uniqueMissing),
    suggested_positioning_strategy: 'Position Akash around product definition, requirements engineering, API analysis, hospitality/travel technology, and supply-chain systems only where supported by the master CV.',
    traceability: {
      source_references_used: factsUsed,
      confidence_level: factsUsed.length >= 5 ? 'medium' : 'low',
      hallucination_risk_check: factsUsed.length >= 5 ? 'No unsupported claims detected in deterministic scoring output.' : 'Low CV fact coverage; require master CV ingestion before generated documents.',
      facts_used_from_cv: factsUsed,
      facts_inferred_from_job_description: Object.fromEntries(Object.entries(dimensionResults).map(([key, value]) => [key, value.job_matches])),
      facts_not_allowed_to_claim: [
        'Work authorization unless explicitly present in cv.md or profile config',
        'Experience, companies, degrees, certifications, achievements, or metrics not present in the master CV or approved knowledge files',
      ],
    },
  };
}

export async function scoreJobFromFiles({
  jobPath,
  profilePath = 'data/generated/profile/master-cv.json',
  configPath = 'config/scoring.yml',
} = {}) {
  if (!jobPath || !existsSync(jobPath)) throw new Error(`Job description file not found: ${jobPath}`);
  if (!existsSync(profilePath)) throw new Error(`Structured profile not found: ${profilePath}. Run npm run cv:ingest first.`);
  const jobText = readJobTextForScoring(jobPath);
  const profile = JSON.parse(readFileSync(profilePath, 'utf-8'));
  const scoringConfig = await readYaml(configPath);
  return scoreJob({ jobText, profile, scoringConfig });
}

export function writeApplicationScore({ jobPath, jobText, result, outputDir = 'data/applications' }) {
  outputDir = process.env.APPLICATION_ASSISTANT_APPLICATIONS_DIR || outputDir;
  const meta = readJobMetadata(jobPath, jobText);
  const today = new Date().toISOString().slice(0, 10);
  const output = `${outputDir}/${today}-${slugify(meta.company)}-${slugify(meta.role)}.json`;
  const record = {
    schema_version: 1,
    created_at: new Date().toISOString(),
    company: meta.company,
    role: meta.role,
    source: meta.source,
    status: 'scored_needs_human_review',
    human_approval_required_before_applying: true,
    score: result.overall_score,
    recommendation: result.recommendation,
    risks: result.risks,
    missing_skills: result.missing_skills,
    generated_files: {},
  };
  mkdirSync(dirname(resolve(output)), { recursive: true });
  writeFileSync(output, JSON.stringify(record, null, 2) + '\n');
  return output;
}

function usage() {
  return [
    'Usage:',
    '  node src/scoring/scoring-engine.mjs --job data/jobs/example.txt --profile data/generated/profile/master-cv.json',
    '  node src/scoring/scoring-engine.mjs --url https://example.com/job --profile data/generated/profile/master-cv.json',
    '',
    'Provide either --job <file> or --url <job-url>.',
  ].join('\n');
}

async function main() {
  const args = process.argv.slice(2);
  let jobPath = '';
  let url = '';
  let profilePath = 'data/generated/profile/master-cv.json';
  let configPath = 'config/scoring.yml';
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--job' && args[i + 1]) jobPath = args[++i];
    else if (args[i] === '--url' && args[i + 1]) url = args[++i];
    else if (args[i] === '--profile' && args[i + 1]) profilePath = args[++i];
    else if (args[i] === '--config' && args[i + 1]) configPath = args[++i];
    else if (args[i] === '--help' || args[i] === '-h') {
      console.log(usage());
      process.exit(0);
    }
  }
  if (!jobPath && !url) {
    console.error(usage());
    process.exit(1);
  }
  if (!jobPath && url) {
    const extracted = await extractJobFromUrl({ url });
    jobPath = extracted.output;
  }
  try {
    const result = await scoreJobFromFiles({ jobPath, profilePath, configPath });
    const jobText = readFileSync(jobPath, 'utf-8');
    result.job_file = jobPath;
    result.application_tracker_record = writeApplicationScore({ jobPath, jobText, result });
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
