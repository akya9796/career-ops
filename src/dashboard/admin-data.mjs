import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';

const CLEAR_TEXT = 'CLEAR DASHBOARD DATA';

function projectPath(path) {
  return resolve(path);
}

function clearDirectoryContents(dir) {
  const full = projectPath(dir);
  mkdirSync(full, { recursive: true });
  for (const entry of readdirSync(full, { withFileTypes: true })) {
    if (entry.name === '.gitkeep') continue;
    rmSync(join(full, entry.name), { recursive: true, force: true });
  }
  const keep = join(full, '.gitkeep');
  if (!existsSync(keep)) writeFileSync(keep, '');
  return full;
}

export function dashboardDataTargets() {
  return [
    process.env.APPLICATION_ASSISTANT_DISCOVERED_JOBS_DIR || 'data/jobs/discovered',
    process.env.APPLICATION_ASSISTANT_APPLICATIONS_DIR || 'data/applications',
    process.env.APPLICATION_ASSISTANT_GENERATED_DIR || 'data/generated',
    process.env.APPLICATION_ASSISTANT_REPORTS_DIR || 'data/reports',
  ];
}

export function clearDashboardData(payload = {}) {
  if (payload.confirm_step_1 !== true || payload.confirm_text !== CLEAR_TEXT) {
    return { ok: false, status: 400, error: 'Double confirmation required.' };
  }
  const cleared = dashboardDataTargets().map(clearDirectoryContents);
  return { ok: true, status: 200, cleared, preserved: ['master/', 'cv.md', 'config/', 'prompts/', '.env.local', '.sessions/', 'archive/'] };
}

export function clearLoginSessions(payload = {}) {
  if (payload.confirm_text !== 'CLEAR LOGIN SESSIONS') {
    return { ok: false, status: 400, error: 'Confirmation text required.' };
  }
  const dir = resolve(process.env.APPLICATION_ASSISTANT_SESSIONS_DIR || '.sessions');
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  return { ok: true, status: 200, cleared: [dir] };
}
