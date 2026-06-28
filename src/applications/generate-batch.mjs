import { pathToFileURL } from 'url';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { generateTailoredCv } from '../cv/generate-tailored-cv.mjs';
import { generateCoverLetter } from '../cover_letters/generate-cover-letter.mjs';
import { generateInterviewPrep } from '../interview/generate-interview-prep.mjs';
import { renderMarkdownFileToPdf } from '../pdf/render-markdown-pdf.mjs';
import { documentReadyRecords, jobGeneratedDir, saveApplicationRecord } from './application-records.mjs';
import { readAppConfig } from '../config/app-config.mjs';

export async function generateBatch({ cvPath = 'cv.md', masterPdf = '', profilePath = 'config/profile.yml' } = {}) {
  const generated = [];
  const config = readAppConfig({ profilePath });
  const cvFilename = config.candidate.cv_filename;
  const coverFilename = config.candidate.cover_letter_filename;
  const master = masterPdf || config.candidate.master_cv_path;
  for (const item of documentReadyRecords({ minScore: 50 })) {
    const { path, record } = item;
    if (!['ready_for_document_generation', 'scored_needs_human_review', 'ready_for_approval'].includes(record.status)) continue;
    const dir = jobGeneratedDir(record);
    const jobPath = record.local_job_file || record.source;
    if (!jobPath || !existsSync(jobPath)) {
      record.status = 'stale_job_file_missing';
      record.updated_at = new Date().toISOString();
      record.notes = `${record.notes || ''}`.trim() || `Skipped document generation because the saved job file no longer exists: ${jobPath || '(missing)'}`;
      saveApplicationRecord(path, record);
      continue;
    }
    const cv = generateTailoredCv({
      masterPdf: master,
      jobPath,
      output: `${dir}/${cvFilename}`,
      mode: 'copy-master',
    });
    const cover = generateCoverLetter({
      cvPath,
      jobPath,
      output: `${dir}/cover-letter.md`,
      profilePath,
    });
    const coverPdf = await renderMarkdownFileToPdf(cover.output, `${dir}/${coverFilename}`);
    const jdPath = `${dir}/job-description.md`;
    const scoringPath = `${dir}/scoring.json`;
    if (existsSync(jobPath)) writeFileSync(jdPath, readFileSync(jobPath, 'utf-8'));
    writeFileSync(scoringPath, JSON.stringify({
      score: record.score,
      recommendation: record.recommendation,
      top_reasons: record.top_reasons || [],
      missing_skills: record.missing_skills || [],
      risks: record.risks || [],
    }, null, 2) + '\n');
    const interview = generateInterviewPrep({
      cvPath,
      jobPath,
      output: `${dir}/interview-prep.md`,
    });
    record.generated_files = {
      ...(record.generated_files || {}),
      cv: cv.output,
      cover_letter: cover.output,
      cover_letter_pdf: coverPdf,
      job_description: jdPath,
      scoring: scoringPath,
      interview_prep: interview.output,
    };
    record.status = 'ready_for_apply';
    record.approval = record.approval || 'pending';
    record.updated_at = new Date().toISOString();
    record.cv_pdf_path = cv.output;
    record.cover_letter_pdf_path = coverPdf;
    record.job_description_path = jdPath;
    record.scoring_path = scoringPath;
    saveApplicationRecord(path, record);
    generated.push({
      record_path: path,
      company: record.company,
      role: record.role,
      score: record.score,
      recommendation: record.recommendation,
      generated_files: record.generated_files,
    });
  }
  return { generated: generated.length, jobs: generated };
}

async function main() {
  const args = process.argv.slice(2);
  let cvPath = 'cv.md';
  let masterPdf = 'master/master-cv.pdf';
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--cv' && args[i + 1]) cvPath = args[++i];
    else if (args[i] === '--master-pdf' && args[i + 1]) masterPdf = args[++i];
  }
  try {
    console.log(JSON.stringify(await generateBatch({ cvPath, masterPdf }), null, 2));
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
