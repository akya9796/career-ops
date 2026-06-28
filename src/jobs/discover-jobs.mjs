import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'fs';
import { basename, dirname, join, resolve } from 'path';
import { pathToFileURL } from 'url';
import { extractJobFacts, extractJobFromUrl } from './extract-job.mjs';
import { fetchWithTimeout } from './http.mjs';
import { credentialsForSource, loadLocalEnv, sessionPathForSource, withAuthenticatedPage } from './portal-auth.mjs';

function slugify(value) {
  return String(value || 'job').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'job';
}

function discoveredDir() {
  return process.env.APPLICATION_ASSISTANT_DISCOVERED_JOBS_DIR || 'data/jobs/discovered';
}

function readText(path) {
  return existsSync(path) ? readFileSync(path, 'utf-8') : '';
}

function simpleYamlList(raw, key) {
  const lines = String(raw || '').split(/\r?\n/);
  const start = lines.findIndex(line => line.trim() === `${key}:`);
  if (start === -1) return [];
  const keyIndent = lines[start].match(/^\s*/)?.[0]?.length || 0;
  const values = [];
  for (const line of lines.slice(start + 1)) {
    if (!line.trim()) continue;
    const indent = line.match(/^\s*/)?.[0]?.length || 0;
    if (indent <= keyIndent && !line.trim().startsWith('- ')) break;
    const match = line.match(/^\s*-\s+["']?(.+?)["']?\s*$/);
    if (match) values.push(match[1]);
    else if (indent <= keyIndent) break;
  }
  return values;
}

function extractTargetRoles(profilePath = 'config/profile.yml') {
  const raw = readText(profilePath);
  return simpleYamlList(raw, 'target_roles').filter(Boolean);
}

function extractManualUrls(portalsPath = 'config/portals.yml') {
  const raw = readText(portalsPath);
  const urls = simpleYamlList(raw, 'manual_urls');
  return [...new Set(urls)].filter(Boolean);
}

function extractSearchQueries(portalsPath = 'config/portals.yml') {
  return simpleYamlList(readText(portalsPath), 'search_queries').filter(Boolean);
}

function discoveryDefaultLimit(portalsPath = 'config/portals.yml') {
  const match = readText(portalsPath).match(/^\s*default_limit:\s*(\d+)\s*$/m);
  return match ? Number(match[1]) || 25 : 25;
}

function jobupSearchTemplate(portalsPath = 'config/portals.yml') {
  const raw = readText(portalsPath);
  const match = raw.match(/^\s*search_url_template:\s*["']?(.+?)["']?\s*$/m);
  return match?.[1] || 'https://www.jobup.ch/fr/emplois/?term={query}';
}

function mappingBlocks(portalsPath = 'config/portals.yml', key = 'sources') {
  const raw = readText(portalsPath);
  const lines = raw.split(/\r?\n/);
  const candidates = lines
    .map((line, index) => line.trim() === `${key}:` ? index : -1)
    .filter(index => index !== -1);
  const sourcesIndex = candidates.find(index => {
    const sourcesIndent = lines[index].match(/^\s*/)?.[0]?.length || 0;
    return lines.slice(index + 1).some(line => {
      if (!line.trim()) return false;
      const indent = line.match(/^\s*/)?.[0]?.length || 0;
      if (indent <= sourcesIndent) return false;
      return new RegExp(`^\\s{${sourcesIndent + 2}}[a-zA-Z0-9_]+:\\s*$`).test(line);
    });
  }) ?? -1;
  if (sourcesIndex === -1) return [];
  const sourcesIndent = lines[sourcesIndex].match(/^\s*/)?.[0]?.length || 0;
  const blocks = [];
  let current = null;
  for (const line of lines.slice(sourcesIndex + 1)) {
    if (!line.trim()) continue;
    const indent = line.match(/^\s*/)?.[0]?.length || 0;
    if (indent <= sourcesIndent) break;
    const sourceMatch = line.match(/^(\s*)([a-zA-Z0-9_]+):\s*$/);
    if (sourceMatch && sourceMatch[1].length === sourcesIndent + 2) {
      if (current) blocks.push(current);
      current = { id: sourceMatch[2], lines: [] };
      continue;
    }
    if (current) current.lines.push(line);
  }
  if (current) blocks.push(current);
  return blocks.map(block => {
    const text = block.lines.join('\n');
    const value = key => text.match(new RegExp(`^\\s*${key}:\\s*["']?(.+?)["']?\\s*$`, 'm'))?.[1]?.trim() || '';
    return {
      id: block.id,
      enabled: value('enabled') !== 'false',
      login_required: value('login_required') === 'true',
      mode: value('mode'),
      template: value('search_url_template'),
      login_url: value('login_url'),
      username_env: value('username_env'),
      password_env: value('password_env'),
      username_selector: value('username_selector'),
      password_selector: value('password_selector'),
      submit_selector: value('submit_selector'),
      reason: value('reason'),
      note: value('note'),
      region: value('region'),
      reliability: value('reliability') || 'best_effort',
    };
  });
}

function sourceBlocks(portalsPath = 'config/portals.yml') {
  return mappingBlocks(portalsPath, 'sources');
}

export function authenticatedSourceBlocks(portalsPath = 'config/portals.yml') {
  return mappingBlocks(portalsPath, 'authenticated_sources');
}

export function companyCareerUrls(portalsPath = 'config/portals.yml') {
  const raw = readText(portalsPath);
  const lines = raw.split(/\r?\n/);
  const start = lines.findIndex(line => line.trim() === 'company_career_urls:');
  if (start === -1) return [];
  const baseIndent = lines[start].match(/^\s*/)?.[0]?.length || 0;
  const entries = [];
  let current = null;
  const assign = (entry, line) => {
    const match = line.match(/^\s*([a-zA-Z0-9_]+):\s*["']?(.+?)["']?\s*$/);
    if (match) entry[match[1]] = match[2].trim();
  };
  for (const line of lines.slice(start + 1)) {
    if (!line.trim()) continue;
    const indent = line.match(/^\s*/)?.[0]?.length || 0;
    if (indent <= baseIndent) break;
    const item = line.match(/^\s*-\s+name:\s*["']?(.+?)["']?\s*$/);
    if (item) {
      if (current) entries.push(current);
      current = { name: item[1].trim() };
      continue;
    }
    if (current) assign(current, line);
  }
  if (current) entries.push(current);
  return entries.map(entry => ({
    ...entry,
    id: slugify(entry.name),
    enabled: entry.enabled !== 'false',
    login_required: entry.login_required === 'true',
  }));
}

function outputPathForFacts(facts, fallback) {
  const id = `${slugify(facts.company || 'company')}-${slugify(facts.title || fallback || 'job')}`;
  return join(discoveredDir(), `${id}.json`);
}

function alreadyDiscovered(url) {
  if (!existsSync(discoveredDir())) return false;
  return readdirSync(discoveredDir())
    .filter(file => file.endsWith('.json'))
    .some(file => {
      try {
        const parsed = JSON.parse(readFileSync(join(discoveredDir(), file), 'utf-8'));
        return parsed.source === url;
      } catch {
        return false;
      }
    });
}

function writeFacts(facts, output) {
  mkdirSync(dirname(resolve(output)), { recursive: true });
  writeFileSync(output, JSON.stringify(facts, null, 2) + '\n');
  return output;
}

function htmlLinks(html, baseUrl) {
  const links = [];
  for (const match of String(html || '').matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const href = match[1];
    const title = match[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (!title || title.length < 4) continue;
    try {
      links.push({ title, url: new URL(href, baseUrl).href });
    } catch {
      // Ignore malformed links from job boards.
    }
  }
  return links;
}

function isLikelyDetailUrl(sourceId, url) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, '').toLowerCase();
    const path = parsed.pathname.toLowerCase();
    if (sourceId === 'jobup') {
      if (!host.endsWith('jobup.ch')) return false;
      return Boolean(parsed.searchParams.get('jobid')) || /\/emplois\/.+/.test(path) || /\/jobs\/.+/.test(path);
    }
    if (sourceId === 'jobs_ch') return host.endsWith('jobs.ch') && /\/offres-emplois\/.+/.test(path);
    if (sourceId === 'welcome_to_the_jungle') return host.endsWith('welcometothejungle.com') && /\/companies\/.+\/jobs\/.+/.test(path);
    if (sourceId === 'hellowork') return host.endsWith('hellowork.com') && /\/fr-fr\/emplois\/.+\.html$/.test(path);
    if (sourceId === 'company_careers') return /job|career|emploi|poste|opening|position|requisition|req/i.test(path);
    return false;
  } catch {
    return false;
  }
}

async function fetchText(url, fetchImpl) {
  const response = await fetchImpl(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

async function discoverSourceUrls({ source, queries, limit, fetchImpl = fetch }) {
  const urls = [];
  let searchResultUrlsFound = 0;
  for (const query of queries) {
    const searchUrl = source.template.replace('{query}', encodeURIComponent(query));
    let html = '';
    try {
      html = await fetchText(searchUrl, fetchImpl);
    } catch {
      continue;
    }
    const links = htmlLinks(html, searchUrl).filter(link => isLikelyDetailUrl(source.id, link.url));
    searchResultUrlsFound += links.length;
    let addedForQuery = 0;
    for (const link of links) {
      if (addedForQuery >= limit) break;
      urls.push(link.url);
      addedForQuery++;
    }
  }
  return { urls, searchResultUrlsFound };
}

async function discoverAuthenticatedSourceUrls({ source, queries, limit }) {
  if (source.mode === 'manual_login_session') {
    return { urls: [], searchResultUrlsFound: 0, message: `${source.id}: manual login session mode; run npm run login:portal -- --source ${source.id}.` };
  }
  if (!source.template) {
    return { urls: [], searchResultUrlsFound: 0, message: `${source.id}: authenticated search template not configured.` };
  }
  const creds = credentialsForSource(source);
  if (!creds.hasCredentials && !existsSync(sessionPathForSource(source.id))) {
    return { urls: [], searchResultUrlsFound: 0, message: `${source.id}: missing ${creds.username_env || 'username env'} / ${creds.password_env || 'password env'} or saved session; manual import recommended.` };
  }
  try {
    return await withAuthenticatedPage(source, async page => {
      const urls = [];
      let searchResultUrlsFound = 0;
      for (const query of queries) {
        const searchUrl = source.template.replace('{query}', encodeURIComponent(query));
        await page.goto(searchUrl, { waitUntil: 'domcontentloaded' });
        const links = await page.$$eval('a[href]', anchors => anchors.map(anchor => ({ title: anchor.textContent || '', url: anchor.href })));
        const detailLinks = links.filter(link => isLikelyDetailUrl(source.id, link.url));
        searchResultUrlsFound += detailLinks.length;
        urls.push(...detailLinks.slice(0, limit).map(link => link.url));
        await page.waitForTimeout(600);
      }
      return { urls, searchResultUrlsFound };
    }, { headless: true });
  } catch (err) {
    return { urls: [], searchResultUrlsFound: 0, message: `${source.id}: authenticated discovery failed (${err.message}).` };
  }
}

async function discoverCompanyCareerUrls({ companies, queries, limit, fetchImpl = fetch }) {
  const urls = [];
  let searchResultUrlsFound = 0;
  const messages = [];
  for (const company of companies) {
    if (!company.enabled) continue;
    if (!company.url) {
      messages.push(`${company.name}: company career URL missing; manual import recommended.`);
      continue;
    }
    if (company.login_required) {
      messages.push(`${company.name}: login required; run manual session or import URLs manually.`);
      continue;
    }
    try {
      const html = await fetchText(company.url, fetchImpl);
      const queryPattern = queries.length ? new RegExp(queries.map(q => q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'i') : /job|career|analyst|product/i;
      const links = htmlLinks(html, company.url)
        .filter(link => queryPattern.test(`${link.title} ${link.url}`))
        .filter(link => isLikelyDetailUrl('company_careers', link.url));
      searchResultUrlsFound += links.length;
      urls.push(...links.slice(0, limit).map(link => link.url));
      if (!links.length) messages.push(`${company.name}: no matching job links found; manual import recommended if the site is dynamic.`);
    } catch (err) {
      messages.push(`${company.name}: company careers discovery failed (${err.message}); manual import recommended.`);
    }
  }
  return { urls, searchResultUrlsFound, messages };
}

export async function discoverJobs({
  profilePath = 'config/profile.yml',
  portalsPath = 'config/portals.yml',
  url = '',
  input = '',
  live = true,
  limit = null,
  fetchImpl = fetchWithTimeout,
} = {}) {
  const outputs = [];
  const effectiveLimit = limit ?? discoveryDefaultLimit(portalsPath);
  const roles = extractTargetRoles(profilePath);
  const queries = extractSearchQueries(portalsPath);
  const sources = sourceBlocks(portalsPath);
  const authenticatedSources = authenticatedSourceBlocks(portalsPath);
  const companies = companyCareerUrls(portalsPath);
  const stats = {
    queries_scanned: live ? queries.length : 0,
    sources_scanned: 0,
    search_result_urls_found: 0,
    manual_urls_imported: 0,
    duplicates_skipped: 0,
    jobs_saved: 0,
    source_messages: [],
  };
  loadLocalEnv();
  const urls = [...extractManualUrls(portalsPath)];
  if (url) urls.push(url);
  if (input && existsSync(input)) {
    urls.push(...readFileSync(input, 'utf-8').split(/\r?\n/).map(line => line.trim()).filter(line => line && !line.startsWith('#')));
  }
  stats.manual_urls_imported = [...new Set(urls)].length;

  if (live && queries.length) {
    const activeSources = sources.length ? sources : [{ id: 'jobup', enabled: true, template: jobupSearchTemplate(portalsPath), reliability: 'active' }];
    for (const source of activeSources) {
      if (!source.enabled) {
        stats.source_messages.push(`${source.id}: source unavailable / manual import recommended${source.reason ? ` (${source.reason})` : ''}.`);
        continue;
      }
      if (!source.template || source.mode === 'manual_url_import') {
        stats.source_messages.push(`${source.id}: source unavailable / manual import recommended${source.reason ? ` (${source.reason})` : ''}.`);
        continue;
      }
      stats.sources_scanned++;
      const found = await discoverSourceUrls({ source, queries, limit: effectiveLimit, fetchImpl });
      stats.search_result_urls_found += found.searchResultUrlsFound;
      urls.push(...found.urls);
    }
    for (const source of authenticatedSources.filter(item => item.enabled && item.login_required)) {
      stats.sources_scanned++;
      const found = await discoverAuthenticatedSourceUrls({ source: { ...sources.find(item => item.id === source.id), ...source }, queries, limit: effectiveLimit });
      stats.search_result_urls_found += found.searchResultUrlsFound;
      urls.push(...found.urls);
      if (found.message) stats.source_messages.push(found.message);
    }
    if (companies.length) {
      const found = await discoverCompanyCareerUrls({ companies, queries, limit: effectiveLimit, fetchImpl });
      stats.sources_scanned += companies.filter(company => company.enabled).length;
      stats.search_result_urls_found += found.searchResultUrlsFound;
      stats.source_messages.push(...found.messages);
      urls.push(...found.urls);
    }
  }

  const seen = new Set();
  for (const jobUrl of urls) {
    if (seen.has(jobUrl)) {
      stats.duplicates_skipped++;
      continue;
    }
    seen.add(jobUrl);
    if (alreadyDiscovered(jobUrl)) {
      stats.duplicates_skipped++;
      continue;
    }
    try {
      const outHint = join(discoveredDir(), `${slugify(basename(jobUrl) || 'url-job')}.json`);
      const extracted = await extractJobFromUrl({ url: jobUrl, output: outHint, fetchImpl });
      outputs.push(extracted.output);
    } catch {
      const facts = extractJobFacts(`Job URL: ${jobUrl}\nConfigured target roles: ${roles.join(', ')}`, jobUrl);
      const out = outputPathForFacts(facts, 'manual-url');
      outputs.push(writeFacts(facts, out));
    }
    stats.jobs_saved = outputs.length;
  }

  return { discovered: outputs.length, outputs, roles, ...stats };
}

async function main() {
  const args = process.argv.slice(2);
  let input = '';
  let url = '';
  let live = true;
  let limit = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--input' && args[i + 1]) input = args[++i];
    else if (args[i] === '--url' && args[i + 1]) url = args[++i];
    else if (args[i] === '--limit' && args[i + 1]) limit = Number(args[++i]) || limit;
    else if (args[i] === '--live') live = true;
    else if (args[i] === '--manual-only' || args[i] === '--no-live') live = false;
    else if (args[i] === '--help' || args[i] === '-h') {
      console.log('Usage: node src/jobs/discover-jobs.mjs [--input urls.txt] [--url <job-url>] [--manual-only] [--limit 25]');
      process.exit(0);
    }
  }
  const result = await discoverJobs({ input, url, live, limit });
  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
