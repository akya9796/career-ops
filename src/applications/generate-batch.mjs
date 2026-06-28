import { pathToFileURL } from 'url';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { generateTailoredCv } from '../cv/generate-tailored-cv.mjs';
import { generateCoverLetterWithAI } from '../cover_letters/generate-cover-letter.mjs';
import { generateInterviewPrep } from '../interview/generate-interview-prep.mjs';
import { renderMarkdownFileToPdf } from '../pdf/render-markdown-pdf.mjs';
import { documentReadyRecords, jobGeneratedDir, saveApplicationRecord } from './application-records.mjs';
import { readAppConfig } from '../config/app-config.mjs';
import { AIManager } from '../ai/ai-manager.mjs';
import { loadPrompt } from '../ai/prompt-loader.mjs';

async function writeAiDocument({ aiManager, promptName, output, input, fallback }) {
  const prompt = loadPrompt(promptName);
  const result = await aiManager.generate({
    systemPrompt: prompt.text,
    userPrompt: 'Return concise markdown only.',
    input,
    fallback,
    maxOutputTokens: 1200,
  });
  writeFileSync(output, result.text.trim() + '\n');
  return result;
}

export async function generateBatch({ cvPath = 'cv.md', masterPdf = '', profilePath = 'config/profile.yml' } = {}) {
  const generated = [];
  const config = readAppConfig({ profilePath });
  const aiManager = new AIManager();
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
    const cover = await generateCoverLetterWithAI({
      cvPath,
      jobPath,
      output: `${dir}/cover-letter.md`,
      profilePath,
      aiManager,
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
    const jobSummaryPath = `${dir}/job-summary.md`;
    const fitExplanationPath = `${dir}/job-fit-explanation.md`;
    const jobText = readFileSync(jobPath, 'utf-8');
    const summaryResult = await writeAiDocument({
      aiManager,
      promptName: 'job-summary',
      output: jobSummaryPath,
      input: { company: record.company, role: record.role, location: record.location, job_description: jobText },
      fallback: `# Job Summary\n\nAI summary unavailable. Review the saved job description for ${record.company || 'the company'} - ${record.role || 'the role'}.\n`,
    });
    const explanationResult = await writeAiDocument({
      aiManager,
      promptName: 'job-fit-explanation',
      output: fitExplanationPath,
      input: {
        company: record.company,
        role: record.role,
        score: record.score,
        recommendation: record.recommendation,
        top_reasons: record.top_reasons || [],
        missing_skills: record.missing_skills || [],
        risks: record.risks || [],
      },
      fallback: `# Job Fit Explanation\n\n${record.recommendation || 'Recommendation'} with score ${record.score ?? 'N/A'}. Review deterministic reasons, risks, and missing skills in scoring.json.\n`,
    });
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
      job_summary: jobSummaryPath,
      job_fit_explanation: fitExplanationPath,
      interview_prep: interview.output,
    };
    record.ai = {
      provider: aiManager.providerName,
      cover_letter_used: Boolean(cover.ai?.used),
      job_summary_used: Boolean(summaryResult.ok),
      job_fit_explanation_used: Boolean(explanationResult.ok),
      last_error: [cover.ai?.error, summaryResult.error, explanationResult.error].filter(Boolean)[0] || '',
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
