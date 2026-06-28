import { createServer } from 'http';
import { existsSync, readFileSync, rmSync } from 'fs';
import { extname, resolve } from 'path';
import { pathToFileURL } from 'url';
import { spawn } from 'child_process';
import { listApplicationRecords, normalizeApplicationRecord, saveApplicationRecord } from '../applications/application-records.mjs';
import { runRefresh, refreshState } from '../applications/refresh-pipeline.mjs';
import { readAppConfig } from '../config/app-config.mjs';
import { clearDashboardData, clearLoginSessions } from './admin-data.mjs';

const ROOT = resolve('.');
const SAFE_DIRS = ['data/generated', 'generated', 'data/jobs', 'data/applications', 'master'].map(dir => resolve(dir));
const DASHBOARD_ASSETS_DIR = resolve('src/dashboard/assets');

function json(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body, null, 2));
}

function text(res, status, body, type = 'text/plain; charset=utf-8') {
  res.writeHead(status, { 'content-type': type });
  res.end(body);
}

function parseBody(req) {
  return new Promise(resolveBody => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        resolveBody(body ? JSON.parse(body) : {});
      } catch {
        resolveBody({});
      }
    });
  });
}

function applications() {
  return listApplicationRecords().map(({ path, record }) => ({ path, ...normalizeApplicationRecord(record) }));
}

function findById(id) {
  return listApplicationRecords().find(({ record }) => {
    const normalized = normalizeApplicationRecord(record);
    return normalized.id === id || normalized.unique_key === id;
  }) || null;
}

function analytics() {
  const apps = applications();
  const countBy = key => apps.reduce((acc, item) => {
    const value = item[key] || 'unknown';
    acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {});
  const avg = apps.length ? Math.round(apps.reduce((sum, item) => sum + Number(item.score || 0), 0) / apps.length) : 0;
  const topTitles = countBy('role_title');
  return {
    total_jobs: apps.length,
    ready_for_apply: apps.filter(item => item.status === 'ready_for_apply').length,
    applied: apps.filter(item => item.status === 'applied').length,
    interview: apps.filter(item => item.status === 'interview').length,
    rejected: apps.filter(item => item.status === 'rejected').length,
    offers: apps.filter(item => item.status === 'offer').length,
    strong_apply: apps.filter(item => item.recommendation === 'Strong Apply').length,
    apply: apps.filter(item => item.recommendation === 'Apply').length,
    average_score: avg,
    by_status: countBy('status'),
    by_source: countBy('source'),
    by_recommendation: countBy('recommendation'),
    top_keywords_or_role_titles: Object.entries(topTitles).sort((a, b) => b[1] - a[1]).slice(0, 8),
  };
}

function safeFile(pathname) {
  const raw = decodeURIComponent(pathname.replace(/^\/files\//, ''));
  const full = resolve(ROOT, raw);
  if (!SAFE_DIRS.some(dir => full === dir || full.startsWith(`${dir}\\`) || full.startsWith(`${dir}/`))) return null;
  return existsSync(full) ? full : null;
}

function mime(path) {
  const ext = extname(path).toLowerCase();
  if (ext === '.css') return 'text/css; charset=utf-8';
  if (ext === '.js') return 'application/javascript; charset=utf-8';
  if (ext === '.pdf') return 'application/pdf';
  if (ext === '.json') return 'application/json; charset=utf-8';
  if (ext === '.md' || ext === '.txt') return 'text/plain; charset=utf-8';
  return 'application/octet-stream';
}

function openBrowser(url) {
  if (process.env.APPLICATION_ASSISTANT_NO_OPEN === '1') return;
  const command = process.platform === 'win32' ? 'cmd' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
  try {
    spawn(command, args, { detached: true, stdio: 'ignore', windowsHide: true }).unref();
  } catch {
    // Opening the browser is convenience only; the server remains usable.
  }
}

const DASHBOARD_HTML = `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>AI Job Application Assistant</title>
  <link rel="stylesheet" href="/assets/dashboard.css">
</head>
<body>
  <div class="dashboard-shell">
    <header class="app-header">
      <div class="brand-row">
        <div class="brand-mark">JA</div>
        <div>
          <div class="eyebrow">AI Job Application Assistant</div>
          <h1>Application Dashboard</h1>
        </div>
      </div>
      <div class="header-status">
        <div class="run-state"><span id="runningDot"></span><span id="running">Idle</span></div>
        <div id="refreshMeta" class="refresh-meta">Waiting for status...</div>
      </div>
      <div class="header-actions">
        <button class="ghost" id="themeBtn">Theme</button>
        <button id="refreshBtn">Refresh</button>
      </div>
    </header>

    <div id="banner" class="banner"></div>

    <section class="kpi-grid" id="cards"></section>

    <section class="toolbar">
      <div class="search-box">
        <span>Search</span>
        <input id="search" placeholder="company, role, location, source">
      </div>
      <select id="status"><option value="">All statuses</option></select>
      <select id="recommendation"><option value="">All recommendations</option></select>
      <input id="minScore" type="number" min="0" max="100" placeholder="Min score">
    </section>

    <section class="main-panel" id="pipeline">
      <div class="panel-title">
        <div>
          <span class="eyebrow">Main dashboard</span>
          <strong id="resultCount">0 applications</strong>
        </div>
        <span class="hint">Review, open documents, and update status from this table.</span>
      </div>
      <div class="table-wrap">
        <table>
          <colgroup>
            <col class="score"><col class="rec"><col class="company"><col class="role"><col class="location"><col class="source"><col class="status"><col class="file"><col class="file"><col class="file"><col class="job"><col class="updated">
          </colgroup>
          <thead><tr><th>Score</th><th>Fit</th><th>Company</th><th>Role</th><th>Location</th><th>Source</th><th>Status</th><th>CV</th><th>Letter</th><th>JD</th><th>Job</th><th>Updated</th></tr></thead>
          <tbody id="rows"></tbody>
        </table>
      </div>
    </section>

    <section class="insights-grid" id="analytics">
      <div class="insight-card"><span>Recommendation Mix</span><div id="recommendationBars" class="bar-stack"></div></div>
      <div class="insight-card"><span>Status Flow</span><div id="statusBars" class="bar-stack"></div></div>
      <div class="insight-card"><span>Top Role Signals</span><div id="roleSignals" class="chips"></div></div>
    </section>

    <section class="admin-band">
      <button class="danger" id="clearDataBtn">Clear Dashboard Data</button>
      <button class="ghost" id="clearSessionsBtn">Clear Login Sessions</button>
    </section>
  </div>
  <div class="modal-backdrop" id="clearModal" hidden>
    <div class="modal">
      <div class="modal-title">Clear Dashboard Data</div>
      <p>This will delete discovered jobs, application records, generated documents, and dashboard state. Your master CV and config files will NOT be deleted.</p>
      <button id="confirmUnderstand">I understand</button>
      <div id="confirmTextWrap" class="confirm-text" hidden>
        <label for="confirmText">Type CLEAR DASHBOARD DATA</label>
        <input id="confirmText" autocomplete="off">
        <div class="modal-actions">
          <button class="ghost" id="cancelClearData">Cancel</button>
          <button class="danger" id="confirmClearData">Clear Dashboard Data</button>
        </div>
      </div>
    </div>
  </div>
<script src="/assets/dashboard.js"></script>
</body>
</html>`;

export function createDashboardServer({ noDiscover = false, open = true, port = 3000, refreshOptions = {} } = {}) {
  const config = readAppConfig();
  let nextRefreshAt = '';
  let timer = null;
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    try {
      if (req.method === 'GET' && url.pathname === '/') return text(res, 200, DASHBOARD_HTML, 'text/html; charset=utf-8');
      if (req.method === 'GET' && url.pathname.startsWith('/assets/')) {
        const assetName = decodeURIComponent(url.pathname.replace('/assets/', ''));
        const assetPath = resolve(DASHBOARD_ASSETS_DIR, assetName);
        if (!assetPath.startsWith(DASHBOARD_ASSETS_DIR) || !existsSync(assetPath)) return json(res, 404, { error: 'asset not found' });
        return text(res, 200, readFileSync(assetPath, 'utf-8'), mime(assetPath));
      }
      if (req.method === 'GET' && url.pathname === '/api/health') return json(res, 200, { ok: true, config: { refresh_interval_minutes: config.refresh_interval_minutes }, refresh: refreshState(), next_refresh_at: nextRefreshAt });
      if (req.method === 'GET' && url.pathname === '/api/applications') return json(res, 200, applications());
      if (req.method === 'GET' && url.pathname === '/api/analytics') return json(res, 200, analytics());
      const appMatch = url.pathname.match(/^\/api\/applications\/([^/]+)$/);
      if (req.method === 'GET' && appMatch) {
        const item = findById(appMatch[1]);
        return item ? json(res, 200, { path: item.path, ...normalizeApplicationRecord(item.record) }) : json(res, 404, { error: 'not found' });
      }
      const statusMatch = url.pathname.match(/^\/api\/applications\/([^/]+)\/status$/);
      if (req.method === 'POST' && statusMatch) {
        const body = await parseBody(req);
        const item = findById(statusMatch[1]);
        if (!item) return json(res, 404, { error: 'not found' });
        item.record.status = body.status || item.record.status;
        item.record.updated_at = new Date().toISOString();
        saveApplicationRecord(item.path, item.record);
        return json(res, 200, normalizeApplicationRecord(item.record));
      }
      const archiveMatch = url.pathname.match(/^\/api\/applications\/([^/]+)\/archive$/);
      if (req.method === 'POST' && archiveMatch) {
        const item = findById(archiveMatch[1]);
        if (!item) return json(res, 404, { error: 'not found' });
        item.record.status = 'archived';
        item.record.updated_at = new Date().toISOString();
        saveApplicationRecord(item.path, item.record);
        return json(res, 200, normalizeApplicationRecord(item.record));
      }
      const deleteMatch = url.pathname.match(/^\/api\/applications\/([^/]+)$/);
      if (req.method === 'DELETE' && deleteMatch) {
        const item = findById(deleteMatch[1]);
        if (!item) return json(res, 404, { error: 'not found' });
        rmSync(item.path, { force: true });
        return json(res, 200, { deleted: true });
      }
      if (req.method === 'POST' && url.pathname === '/api/refresh') return json(res, 200, await runRefresh(refreshOptions));
      if (req.method === 'POST' && url.pathname === '/api/admin/clear-data') {
        const result = clearDashboardData(await parseBody(req));
        return json(res, result.status, result);
      }
      if (req.method === 'POST' && url.pathname === '/api/admin/clear-sessions') {
        const result = clearLoginSessions(await parseBody(req));
        return json(res, result.status, result);
      }
      if (req.method === 'GET' && url.pathname.startsWith('/files/')) {
        const file = safeFile(url.pathname);
        if (!file) return json(res, 404, { error: 'file not found' });
        res.writeHead(200, { 'content-type': mime(file) });
        return res.end(readFileSync(file));
      }
      return json(res, 404, { error: 'not found' });
    } catch (err) {
      return json(res, 500, { error: err.message });
    }
  });

  async function start() {
    await new Promise(resolveListen => server.listen(port, resolveListen));
    const address = server.address();
    const actualPort = typeof address === 'object' ? address.port : port;
    const url = `http://localhost:${actualPort}`;
    if (!noDiscover) runRefresh(refreshOptions).catch(err => console.error(`Initial refresh failed: ${err.message}`));
    const schedule = () => {
      const next = Date.now() + config.refresh_interval_ms;
      nextRefreshAt = new Date(next).toISOString();
      timer = setTimeout(async () => {
        await runRefresh(refreshOptions).catch(err => console.error(`Scheduled refresh failed: ${err.message}`));
        schedule();
      }, config.refresh_interval_ms);
    };
    schedule();
    if (open) openBrowser(url);
    return { server, url, close: () => { if (timer) clearTimeout(timer); server.close(); } };
  }

  return { server, start };
}

async function main() {
  const args = process.argv.slice(2);
  const noDiscover = args.includes('--no-discover');
  const noOpen = args.includes('--no-open');
  const portFlag = args.indexOf('--port');
  const port = portFlag !== -1 ? Number(args[portFlag + 1]) || 3000 : 3000;
  const app = createDashboardServer({ noDiscover, open: !noOpen, port });
  const started = await app.start();
  console.log(`AI Job Application Assistant dashboard: ${started.url}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
