import { existsSync } from 'fs';
import { createInterface } from 'readline/promises';
import { stdin as input, stdout as output } from 'process';
import { pathToFileURL } from 'url';
import { latestReadyRecord, listApplicationRecords } from './application-records.mjs';

function pickRecord({ latest = false, recordPath = '' } = {}) {
  if (recordPath) {
    const item = listApplicationRecords().find(candidate => candidate.path === recordPath);
    if (!item) throw new Error(`Application record not found: ${recordPath}`);
    return item;
  }
  if (latest) {
    const approved = listApplicationRecords().find(({ record }) => record.status === 'approved_ready_to_apply');
    return approved || latestReadyRecord();
  }
  throw new Error('Usage: npm run apply:assist -- --latest');
}

export async function applyAssist({ latest = false, recordPath = '', dryRun = false } = {}) {
  const item = pickRecord({ latest, recordPath });
  const record = item.record;
  const url = record.source || '';
  if (!url) throw new Error('Selected application has no job URL/source to open.');
  const files = record.generated_files || {};
  const result = {
    company: record.company || '',
    role: record.role || '',
    job_url: url,
    cv: files.cv || '',
    cover_letter: files.cover_letter || '',
    will_submit: false,
    safety: 'Browser assist opens the job page only. It does not bypass CAPTCHA, invent answers, or submit the application.',
  };
  if (dryRun) return result;

  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  console.log(`Opened: ${url}`);
  console.log(`CV: ${files.cv && existsSync(files.cv) ? files.cv : 'not generated'}`);
  console.log(`Cover letter: ${files.cover_letter && existsSync(files.cover_letter) ? files.cover_letter : 'not generated'}`);
  console.log('Review manually. This assistant will not submit the application.');
  const rl = createInterface({ input, output });
  try {
    await rl.question('Press Enter after you are done reviewing/uploading manually. ');
  } finally {
    rl.close();
    await browser.close();
  }
  return result;
}

async function main() {
  const args = process.argv.slice(2);
  const latest = args.includes('--latest');
  const dryRun = args.includes('--dry-run');
  const recordFlag = args.indexOf('--record');
  const recordPath = recordFlag !== -1 ? args[recordFlag + 1] : '';
  try {
    console.log(JSON.stringify(await applyAssist({ latest, recordPath, dryRun }), null, 2));
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
