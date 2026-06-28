import { existsSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { pathToFileURL } from 'url';
import { scoreJobFromFiles, writeApplicationScore } from './scoring-engine.mjs';
import { findApplicationBySource, listApplicationRecords, saveApplicationRecord } from '../applications/application-records.mjs';

function discoveredDir() {
  return process.env.APPLICATION_ASSISTANT_DISCOVERED_JOBS_DIR || 'data/jobs/discovered';
}

function applicationsDir() {
  return process.env.APPLICATION_ASSISTANT_APPLICATIONS_DIR || 'data/applications';
}

function listJobFiles(dir = discoveredDir()) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter(file => ['.json', '.txt', '.md'].some(ext => file.toLowerCase().endsWith(ext)))
    .map(file => join(dir, file));
}

function originalSourceForJob(jobPath) {
  try {
    const parsed = JSON.parse(readFileSync(jobPath, 'utf-8'));
    return parsed.source || '';
  } catch {
    return '';
  }
}

function existingRecordForJob(jobPath) {
  return findApplicationBySource(jobPath) || findApplicationBySource(originalSourceForJob(jobPath));
}

function strongRecommendation(result) {
  if (result.overall_score >= 85) return 'Strong Apply';
  return result.recommendation;
}

function writeReadyQueue() {
  const ready = listApplicationRecords()
    .filter(({ record }) => ['Apply', 'Strong Apply'].includes(record.recommendation))
    .map(({ path, record }) => ({
      record_path: path,
      company: record.company,
      role: record.role,
      location: record.location || '',
      score: record.score,
      recommendation: record.recommendation,
      source: record.source,
      generated_files: record.generated_files || {},
      approval: record.approval || 'pending',
    }));
  const output = join(applicationsDir(), 'ready-queue.json');
  writeFileSync(output, JSON.stringify({ updated_at: new Date().toISOString(), jobs: ready }, null, 2) + '\n');
  return output;
}

export async function scoreBatch({
  jobsDir = discoveredDir(),
  profilePath = 'data/generated/profile/master-cv.json',
  configPath = 'config/scoring.yml',
} = {}) {
  const results = [];
  for (const jobPath of listJobFiles(jobsDir)) {
    if (existingRecordForJob(jobPath)) {
      results.push({ job_file: jobPath, status: 'duplicate_skipped' });
      continue;
    }
    const result = await scoreJobFromFiles({ jobPath, profilePath, configPath });
    result.recommendation = strongRecommendation(result);
    const jobText = readFileSync(jobPath, 'utf-8');
    const recordPath = writeApplicationScore({ jobPath, jobText, result });
    const item = listApplicationRecords().find(candidate => resolve(candidate.path) === resolve(recordPath));
    if (item) {
      item.record.recommendation = result.recommendation;
      item.record.status = Number(result.overall_score || 0) >= 50
        ? 'ready_for_document_generation'
        : 'scored_needs_human_review';
      item.record.local_job_file = jobPath;
      saveApplicationRecord(item.path, item.record);
    }
    results.push({
      job_file: jobPath,
      record_path: recordPath,
      score: result.overall_score,
      recommendation: result.recommendation,
      status: 'scored',
    });
  }
  const ready_queue = writeReadyQueue();
  return {
    scored: results.filter(item => item.status === 'scored').length,
    duplicates_skipped: results.filter(item => item.status === 'duplicate_skipped').length,
    ready_queue,
    results,
  };
}

async function main() {
  const args = process.argv.slice(2);
  let jobsDir = discoveredDir();
  let profilePath = 'data/generated/profile/master-cv.json';
  let configPath = 'config/scoring.yml';
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--jobs-dir' && args[i + 1]) jobsDir = args[++i];
    else if (args[i] === '--profile' && args[i + 1]) profilePath = args[++i];
    else if (args[i] === '--config' && args[i + 1]) configPath = args[++i];
  }
  try {
    console.log(JSON.stringify(await scoreBatch({ jobsDir, profilePath, configPath }), null, 2));
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
