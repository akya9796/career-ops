import { discoverJobs } from '../jobs/discover-jobs.mjs';
import { scoreBatch } from '../scoring/score-batch.mjs';
import { generateBatch } from './generate-batch.mjs';

let running = false;
let lastRefresh = null;
let lastResult = null;

export function refreshState() {
  return { running, last_refresh: lastRefresh, last_result: lastResult };
}

export async function runRefresh({
  discover = true,
  discoverOptions = {},
  scoreOptions = {},
  generateOptions = {},
} = {}) {
  if (running) return { skipped: true, reason: 'refresh already running', ...refreshState() };
  running = true;
  const startedAt = new Date().toISOString();
  try {
    const discovery = discover ? await discoverJobs(discoverOptions) : { discovered: 0, jobs_saved: 0 };
    const scoring = await scoreBatch(scoreOptions);
    const generation = await generateBatch(generateOptions);
    lastRefresh = new Date().toISOString();
    lastResult = {
      started_at: startedAt,
      finished_at: lastRefresh,
      discovery,
      scoring,
      generation,
      summary: `${discovery.jobs_saved ?? discovery.discovered ?? 0} jobs saved, ${generation.generated ?? 0} application packages generated`,
    };
    return lastResult;
  } finally {
    running = false;
  }
}
