import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { basename, dirname, join, resolve } from 'path';
import { inferJobMetadataFromText } from '../jobs/extract-job.mjs';

export function applicationsDir() {
  return process.env.APPLICATION_ASSISTANT_APPLICATIONS_DIR || 'data/applications';
}

export function generatedDir() {
  return process.env.APPLICATION_ASSISTANT_GENERATED_DIR || 'data/generated';
}

export function slugify(value) {
  return String(value || 'application')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) || 'application';
}

export function uniqueKeyForApplication({ company = '', role = '', location = '', source = '', description = '' } = {}) {
  const base = [company, role, location].map(slugify).filter(Boolean).join('-');
  const hashText = `${source}\n${description}`;
  let hash = 0;
  for (let i = 0; i < hashText.length; i++) hash = ((hash << 5) - hash + hashText.charCodeAt(i)) | 0;
  const suffix = Math.abs(hash).toString(36).slice(0, 8);
  return `${base || 'job'}-${suffix}`;
}

export function jobIdFromRecord(record = {}) {
  if (record.unique_key) return record.unique_key;
  const company = record.company || 'company';
  const role = record.role || record.role_title || 'role';
  const id = `${slugify(company)}-${slugify(role)}`;
  return id === 'company-role' ? slugify(basename(record.source || 'application')) : id;
}

export function jobGeneratedDir(record = {}) {
  return join(generatedDir(), jobIdFromRecord(record));
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf-8'));
  } catch {
    return null;
  }
}

export function listApplicationRecords({ dir = applicationsDir() } = {}) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter(file => file.toLowerCase().endsWith('.json') && file.toLowerCase() !== 'ready-queue.json')
    .map(file => {
      const path = join(dir, file);
      const record = readJson(path);
      return record ? { path, record } : null;
    })
    .filter(Boolean)
    .sort((a, b) => String(b.record.created_at || '').localeCompare(String(a.record.created_at || '')));
}

export function findApplicationBySource(source, { dir = applicationsDir() } = {}) {
  const wanted = resolve(source || '');
  return listApplicationRecords({ dir }).find(({ record }) => {
    if (!record.source) return false;
    return resolve(record.source) === wanted || record.source === source;
  }) || null;
}

export function saveApplicationRecord(path, record) {
  mkdirSync(dirname(resolve(path)), { recursive: true });
  writeFileSync(path, JSON.stringify(record, null, 2) + '\n');
  return path;
}

export function readyRecords({ dir = applicationsDir() } = {}) {
  return listApplicationRecords({ dir }).filter(({ record }) => {
    const rec = String(record.recommendation || '').toLowerCase();
    const approved = String(record.approval || '').toLowerCase();
    return ['apply', 'strong apply'].includes(rec)
      && !['rejected'].includes(approved)
      && !['submitted', 'stale_job_file_missing', 'archived', 'deleted'].includes(record.status);
  });
}

export function documentReadyRecords({ dir = applicationsDir(), minScore = 50 } = {}) {
  return listApplicationRecords({ dir }).filter(({ record }) => {
    const approved = String(record.approval || '').toLowerCase();
    const status = String(record.status || '');
    return Number(record.score || 0) >= minScore
      && !['rejected'].includes(approved)
      && !['submitted', 'stale_job_file_missing', 'archived', 'deleted'].includes(status);
  });
}

export function latestReadyRecord(options = {}) {
  return readyRecords(options)[0] || null;
}

export function normalizeApplicationRecord(record = {}) {
  const repaired = repairMetadata(record);
  const uniqueKey = record.unique_key || uniqueKeyForApplication({
    company: repaired.company,
    role: repaired.role || repaired.role_title,
    location: repaired.location,
    source: record.source || record.job_url,
  });
  const generated = record.generated_files || {};
  return {
    ...record,
    id: record.id || uniqueKey,
    unique_key: uniqueKey,
    company: repaired.company,
    role: repaired.role,
    role_title: repaired.role_title,
    location: repaired.location,
    country: record.country || '',
    language: record.language || '',
    job_url: record.job_url || record.source || '',
    canonical_url: record.canonical_url || record.source || '',
    discovered_at: record.discovered_at || record.created_at || '',
    updated_at: record.updated_at || record.created_at || '',
    last_scored_at: record.last_scored_at || record.created_at || '',
    cv_pdf_path: record.cv_pdf_path || generated.cv || '',
    cover_letter_pdf_path: record.cover_letter_pdf_path || generated.cover_letter_pdf || '',
    job_description_path: record.job_description_path || generated.job_description || '',
    scoring_path: record.scoring_path || generated.scoring || '',
    duplicate_of: record.duplicate_of || '',
    notes: record.notes || '',
  };
}

function weakValue(value) {
  const text = String(value || '').trim();
  return !text || /^(application|position|job|role|unknown|company)$/i.test(text);
}

function repairMetadata(record = {}) {
  const repaired = {
    company: record.company || '',
    role: record.role || record.role_title || '',
    role_title: record.role_title || record.role || '',
    location: record.location || '',
  };
  if (!weakValue(repaired.company) && !weakValue(repaired.role_title) && !weakValue(repaired.location)) return repaired;
  const jobPath = record.local_job_file || '';
  if (!jobPath || !existsSync(jobPath)) return repaired;
  try {
    const raw = readFileSync(jobPath, 'utf-8');
    const parsed = JSON.parse(raw);
    const inferred = inferJobMetadataFromText(parsed.description || raw, {
      title: parsed.title,
      company: parsed.company,
      location: parsed.location,
    });
    repaired.company = weakValue(repaired.company) ? inferred.company : repaired.company;
    repaired.role_title = weakValue(repaired.role_title) ? inferred.title : repaired.role_title;
    repaired.role = weakValue(repaired.role) ? repaired.role_title : repaired.role;
    repaired.location = weakValue(repaired.location) ? inferred.location : repaired.location;
  } catch {
    // Dashboard display should remain resilient even if a saved job file is malformed.
  }
  return repaired;
}
