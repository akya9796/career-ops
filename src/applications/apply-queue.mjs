import { createInterface } from 'readline/promises';
import { stdin as input, stdout as output } from 'process';
import { pathToFileURL } from 'url';
import { readyRecords, saveApplicationRecord } from './application-records.mjs';

function queueRows() {
  return readyRecords()
    .filter(({ record }) => ['ready_for_apply', 'ready_for_approval', 'approved_ready_to_apply'].includes(record.status))
    .map(({ path, record }, index) => ({
      index: index + 1,
      record_path: path,
      company: record.company || 'Unknown company',
      role: record.role || 'Unknown role',
      location: record.location || '',
      score: record.score,
      recommendation: record.recommendation,
      cv: record.generated_files?.cv || '',
      cover_letter: record.generated_files?.cover_letter || '',
      job_url: record.source || '',
      approval: record.approval || 'pending',
    }));
}

export function listApplyQueue() {
  return queueRows();
}

export function updateApproval(recordPath, approval) {
  const item = readyRecords().find(candidate => candidate.path === recordPath);
  if (!item) throw new Error(`Queue record not found: ${recordPath}`);
  item.record.approval = approval;
  item.record.status = approval === 'approved' ? 'approved_ready_to_apply' : `application_${approval}`;
  item.record.updated_at = new Date().toISOString();
  saveApplicationRecord(item.path, item.record);
  return item.record;
}

async function interactiveQueue() {
  const rows = queueRows();
  if (!rows.length) {
    console.log('No Apply / Strong Apply jobs are ready for approval.');
    return { updated: 0 };
  }
  for (const row of rows) {
    console.log(`${row.index}. ${row.company} | ${row.role} | ${row.location || 'N/A'} | ${row.score} | ${row.recommendation}`);
    console.log(`   CV: ${row.cv || 'not generated'}`);
    console.log(`   Cover letter: ${row.cover_letter || 'not generated'}`);
    console.log(`   URL: ${row.job_url || 'N/A'}`);
  }
  const rl = createInterface({ input, output });
  let updated = 0;
  try {
    for (const row of rows) {
      const answer = (await rl.question(`Approve ${row.company} - ${row.role}? [a]pprove/[r]eject/[s]kip: `)).trim().toLowerCase();
      if (answer === 'a' || answer === 'approve') {
        updateApproval(row.record_path, 'approved');
        updated++;
      } else if (answer === 'r' || answer === 'reject') {
        updateApproval(row.record_path, 'rejected');
        updated++;
      } else {
        updateApproval(row.record_path, 'skipped');
        updated++;
      }
    }
  } finally {
    rl.close();
  }
  return { updated };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--json') || args.includes('--list')) {
    console.log(JSON.stringify({ jobs: queueRows() }, null, 2));
    return;
  }
  const result = await interactiveQueue();
  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(err => {
    console.error(err.message);
    process.exit(1);
  });
}
