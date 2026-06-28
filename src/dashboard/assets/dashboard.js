let apps = [];

document.body.dataset.theme = localStorage.getItem('assistant-theme') || 'light';

const $ = id => document.getElementById(id);
const statuses = ['ready_for_apply', 'applied', 'rejected', 'interview', 'offer', 'skipped', 'archived'];

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char]));
}

function fileHref(path) {
  return '/files/' + encodeURIComponent(path).replaceAll('%2F', '/').replaceAll('%5C', '/');
}

function fileLink(path, label) {
  return path
    ? '<a class="doc-link" target="_blank" href="' + fileHref(path) + '">' + escapeHtml(label) + '</a>'
    : '<span class="muted">-</span>';
}

function sourceLabel(value) {
  if (!value) return '';
  try { return new URL(value).hostname.replace(/^www\./, ''); } catch {}
  const text = String(value).split(/[\\/]/).pop() || String(value);
  return text.length > 18 ? text.slice(0, 15) + '...' : text;
}

function pct(value, max) {
  return max > 0 ? Math.max(5, Math.round((value / max) * 100)) : 0;
}

async function load() {
  const [appRes, analyticsRes, healthRes] = await Promise.all([
    fetch('/api/applications'),
    fetch('/api/analytics'),
    fetch('/api/health'),
  ]);
  apps = await appRes.json();
  const analytics = await analyticsRes.json();
  const health = await healthRes.json();
  $('running').textContent = health.refresh.running ? 'Discovery running' : 'Idle';
  $('runningDot').style.background = health.refresh.running ? 'var(--warn)' : 'var(--accent)';
  $('refreshMeta').textContent = 'Last: ' + (health.refresh.last_refresh || 'never') + ' | Next: ' + (health.next_refresh_at || 'not scheduled');
  renderCards(analytics);
  renderCharts(analytics);
  renderFilters();
  renderRows();
}

function renderCards(a) {
  const items = [
    ['Total', a.total_jobs],
    ['Ready', a.ready_for_apply],
    ['Applied', a.applied],
    ['Interview', a.interview],
    ['Rejected', a.rejected],
    ['Offers', a.offers],
    ['Strong', a.strong_apply],
    ['Apply', a.apply],
    ['Avg', a.average_score],
  ];
  $('cards').innerHTML = items.map(([key, value]) =>
    '<div class="kpi-card"><span>' + escapeHtml(key) + '</span><strong>' + escapeHtml(value) + '</strong></div>'
  ).join('');
}

function barRows(object) {
  const entries = Object.entries(object || {}).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const max = entries.reduce((current, [, value]) => Math.max(current, value), 0);
  return entries.map(([label, value]) =>
    '<div class="bar-row"><span title="' + escapeHtml(label) + '">' + escapeHtml(label) + '</span><div class="bar-track"><div class="bar-fill" style="width:' + pct(value, max) + '%"></div></div><b>' + escapeHtml(value) + '</b></div>'
  ).join('') || '<span class="muted">No data yet</span>';
}

function renderCharts(a) {
  $('recommendationBars').innerHTML = barRows(a.by_recommendation);
  $('statusBars').innerHTML = barRows(a.by_status);
  $('roleSignals').innerHTML = (a.top_keywords_or_role_titles || [])
    .map(([label, value]) => '<span class="chip" title="' + escapeHtml(label) + '">' + escapeHtml(label) + ' / ' + escapeHtml(value) + '</span>')
    .join('') || '<span class="muted">No role signals yet</span>';
}

function renderFilters() {
  for (const id of ['status', 'recommendation']) {
    const el = $(id);
    const current = el.value;
    const values = [...new Set(apps.map(app => app[id]).filter(Boolean))].sort();
    el.innerHTML = '<option value="">All ' + id + 's</option>' + values.map(value => '<option>' + escapeHtml(value) + '</option>').join('');
    el.value = current;
  }
}

function filteredApps() {
  const query = $('search').value.toLowerCase();
  const status = $('status').value;
  const recommendation = $('recommendation').value;
  const minScore = Number($('minScore').value || 0);
  return apps
    .filter(app => (!status || app.status === status)
      && (!recommendation || app.recommendation === recommendation)
      && Number(app.score || 0) >= minScore
      && (!query || [app.company, app.role_title, app.location, app.source].join(' ').toLowerCase().includes(query)))
    .sort((a, b) => Number(b.score || 0) - Number(a.score || 0));
}

function generated(app, key) {
  return app[key] || app.generated_files?.[key] || '';
}

function renderRows() {
  const filtered = filteredApps();
  $('resultCount').textContent = filtered.length + (filtered.length === 1 ? ' application' : ' applications');
  $('rows').innerHTML = filtered.map(app => '<tr>' +
    '<td><span class="score-pill">' + escapeHtml(app.score ?? '') + '</span></td>' +
    '<td><span class="rec-pill">' + escapeHtml(app.recommendation || '') + '</span></td>' +
    '<td title="' + escapeHtml(app.company || '') + '">' + escapeHtml(app.company || '') + '</td>' +
    '<td title="' + escapeHtml(app.role_title || '') + '">' + escapeHtml(app.role_title || '') + '</td>' +
    '<td title="' + escapeHtml(app.location || '') + '">' + escapeHtml(app.location || '') + '</td>' +
    '<td title="' + escapeHtml(app.source || '') + '"><span class="source-pill">' + escapeHtml(sourceLabel(app.source)) + '</span></td>' +
    '<td><select class="status-select" onchange="setStatus(\'' + escapeHtml(app.id) + '\', this.value)">' + statuses.map(status => '<option ' + (app.status === status ? 'selected' : '') + '>' + status + '</option>').join('') + '</select></td>' +
    '<td>' + fileLink(generated(app, 'cv_pdf_path') || generated(app, 'cv'), 'CV') + '</td>' +
    '<td>' + fileLink(generated(app, 'cover_letter_pdf_path') || generated(app, 'cover_letter_pdf') || generated(app, 'cover_letter'), 'Letter') + '</td>' +
    '<td>' + fileLink(generated(app, 'job_description_path') || generated(app, 'job_description'), 'JD') + '</td>' +
    '<td>' + (app.job_url ? '<a class="doc-link" target="_blank" href="' + escapeHtml(app.job_url) + '">Open</a>' : '<span class="muted">-</span>') + '</td>' +
    '<td title="' + escapeHtml(app.updated_at || '') + '">' + escapeHtml((app.updated_at || '').slice(0, 10)) + '</td>' +
    '</tr>').join('') || '<tr><td colspan="12" class="muted">No applications match the current filters.</td></tr>';
}

window.setStatus = async (id, status) => {
  await fetch('/api/applications/' + id + '/status', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ status }),
  });
  await load();
};

$('themeBtn').onclick = () => {
  document.body.dataset.theme = document.body.dataset.theme === 'dark' ? 'light' : 'dark';
  localStorage.setItem('assistant-theme', document.body.dataset.theme);
};

$('refreshBtn').onclick = async () => {
  $('banner').style.display = 'block';
  $('banner').textContent = 'Refreshing discovery, scoring, and generated packages...';
  const res = await fetch('/api/refresh', { method: 'POST' });
  const data = await res.json();
  $('banner').textContent = data.summary || 'Refresh complete';
  await load();
};

for (const id of ['search', 'status', 'recommendation', 'minScore']) {
  $(id).addEventListener('input', renderRows);
}

load();
