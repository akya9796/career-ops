import { existsSync, mkdirSync, readFileSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { createInterface } from 'readline/promises';

export function sessionsDir() {
  return process.env.APPLICATION_ASSISTANT_SESSIONS_DIR || '.sessions';
}

export function sessionPathForSource(sourceId) {
  const safe = String(sourceId || 'portal').toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-|-$/g, '') || 'portal';
  return join(sessionsDir(), `${safe}.json`);
}

export function loadLocalEnv({ envPath = '.env.local', target = process.env } = {}) {
  if (!existsSync(envPath)) return target;
  const raw = readFileSync(envPath, 'utf-8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (target[key] !== undefined) continue;
    target[key] = rawValue.replace(/^["']|["']$/g, '');
  }
  return target;
}

export function credentialsForSource(source, { env = process.env } = {}) {
  const username = source?.username_env ? env[source.username_env] || '' : '';
  const password = source?.password_env ? env[source.password_env] || '' : '';
  return {
    username,
    password,
    hasCredentials: Boolean(username && password),
    username_env: source?.username_env || '',
    password_env: source?.password_env || '',
  };
}

export function redactSecret(value) {
  if (!value) return '';
  return '[redacted]';
}

async function waitForManualLogin() {
  if (!process.stdin.isTTY) {
    await new Promise(resolveWait => setTimeout(resolveWait, Number(process.env.APPLICATION_ASSISTANT_MANUAL_LOGIN_WAIT_MS || 120_000)));
    return;
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    await rl.question('Complete login in the browser, then press Enter to save the local session state.');
  } finally {
    rl.close();
  }
}

export async function withAuthenticatedPage(source, callback, {
  headless = true,
  playwright = null,
  manual = false,
  envPath = '.env.local',
} = {}) {
  loadLocalEnv({ envPath });
  const pw = playwright || await import('playwright');
  const browser = await pw.chromium.launch({ headless });
  const statePath = sessionPathForSource(source.id);
  const contextOptions = existsSync(statePath) ? { storageState: statePath } : {};
  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();
  try {
    if (source.login_required && !existsSync(statePath)) {
      const creds = credentialsForSource(source);
      if (!manual && creds.hasCredentials && source.username_selector && source.password_selector && source.submit_selector) {
        await page.goto(source.login_url, { waitUntil: 'domcontentloaded' });
        await page.fill(source.username_selector, creds.username);
        await page.fill(source.password_selector, creds.password);
        await Promise.all([
          page.waitForLoadState('domcontentloaded').catch(() => {}),
          page.click(source.submit_selector),
        ]);
      } else {
        await page.goto(source.login_url || source.url, { waitUntil: 'domcontentloaded' });
        console.warn(`${source.id}: manual login required. Complete login in the browser window; CAPTCHA and protection bypass are not automated.`);
        if (manual) await waitForManualLogin();
      }
      mkdirSync(dirname(resolve(statePath)), { recursive: true });
      await context.storageState({ path: statePath });
    }
    return await callback(page, context);
  } finally {
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}
