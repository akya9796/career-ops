import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { join, resolve } from 'path';

export const NO_LATEST_JOB_MESSAGE = 'No latest job found. First run: npm run score:job -- --url <job_url>';

function jobsDir() {
  return process.env.APPLICATION_ASSISTANT_JOBS_DIR || 'data/jobs';
}

function applicationsDir() {
  return process.env.APPLICATION_ASSISTANT_APPLICATIONS_DIR || 'data/applications';
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf-8'));
  } catch {
    return null;
  }
}

function timestamp(path, record = null) {
  const parsed = record?.created_at ? Date.parse(record.created_at) : NaN;
  if (Number.isFinite(parsed)) return parsed;
  try {
    return statSync(path).mtimeMs;
  } catch {
    return 0;
  }
}

function listFiles(dir, extensions) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter(file => extensions.some(ext => file.toLowerCase().endsWith(ext)))
    .map(file => join(dir, file));
}

function metadataFromJob(jobPath) {
  const raw = readFileSync(jobPath, 'utf-8');
  if (jobPath.toLowerCase().endsWith('.json')) {
    const parsed = readJson(jobPath);
    if (parsed) {
      return {
        title: parsed.title || '',
        company: parsed.company || '',
        location: parsed.location || '',
        source: parsed.source || jobPath,
      };
    }
  }
  return {
    title: raw.match(/^Job Title:\s*(.+)$/im)?.[1]?.trim() || raw.match(/^Role:\s*(.+)$/im)?.[1]?.trim() || '',
    company: raw.match(/^Company:\s*(.+)$/im)?.[1]?.trim() || '',
    location: raw.match(/^Location:\s*(.+)$/im)?.[1]?.trim() || '',
    source: jobPath,
  };
}

function resolveJobPath(source) {
  if (!source) return '';
  const direct = resolve(source);
  if (existsSync(direct)) return source;
  const fromJobsDir = join(jobsDir(), source);
  if (existsSync(fromJobsDir)) return fromJobsDir;
  return '';
}

export function findLatestJob() {
  const appCandidates = listFiles(applicationsDir(), ['.json'])
    .map(path => ({ path, record: readJson(path) }))
    .filter(item => item.record)
    .map(item => ({ ...item, jobPath: resolveJobPath(item.record.source), ts: timestamp(item.path, item.record) }))
    .filter(item => item.jobPath)
    .sort((a, b) => b.ts - a.ts);

  if (appCandidates.length > 0) {
    const latest = appCandidates[0];
    return {
      jobPath: latest.jobPath,
      applicationRecordPath: latest.path,
      applicationRecord: latest.record,
      jobMetadata: metadataFromJob(latest.jobPath),
    };
  }

  const jobCandidates = listFiles(jobsDir(), ['.json', '.txt', '.md'])
    .filter(path => !path.endsWith('.gitkeep'))
    .map(path => ({ path, ts: timestamp(path) }))
    .sort((a, b) => b.ts - a.ts);

  if (jobCandidates.length === 0) return null;
  const latestJob = jobCandidates[0].path;
  return {
    jobPath: latestJob,
    applicationRecordPath: '',
    applicationRecord: null,
    jobMetadata: metadataFromJob(latestJob),
  };
}

export function requireLatestJob() {
  const latest = findLatestJob();
  if (!latest) throw new Error(NO_LATEST_JOB_MESSAGE);
  return latest;
}

