#!/usr/bin/env node

import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { resolve } from 'path';
import { tmpdir } from 'os';
import { parseMasterCv } from './src/cv/master-cv.mjs';
import { scoreJob } from './src/scoring/scoring-engine.mjs';
import { extractJobFacts } from './src/jobs/extract-job.mjs';
import { discoverJobs } from './src/jobs/discover-jobs.mjs';
import { generateTailoredCv } from './src/cv/generate-tailored-cv.mjs';
import { generateCoverLetter } from './src/cover_letters/generate-cover-letter.mjs';
import { generateInterviewPrep } from './src/interview/generate-interview-prep.mjs';
import { scoreBatch } from './src/scoring/score-batch.mjs';
import { generateBatch } from './src/applications/generate-batch.mjs';
import { listApplyQueue } from './src/applications/apply-queue.mjs';
import { applyAssist } from './src/applications/apply-assist.mjs';
import { createDashboardServer } from './src/dashboard/server.mjs';
import { saveApplicationRecord } from './src/applications/application-records.mjs';

const temp = mkdtempSync(join(tmpdir(), 'application-assistant-'));

try {
  const cvPath = join(temp, 'cv.md');
  const masterPdfPath = join(temp, 'master-cv.pdf');
  const jobPath = join(temp, 'job.txt');
  const masterPdfBytes = Buffer.from('%PDF-1.4\n% master cv fixture\n%%EOF\n', 'utf-8');
  writeFileSync(masterPdfPath, masterPdfBytes);
  writeFileSync(cvPath, `# Akash Kotkar

Annecy, France
Email: kotkarakash46@gmail.com
Phone: +33745671942
LinkedIn: kotkar-akash

## Summary

Technical Product Analyst with 5+ years of experience working on API-driven platforms, business analysis, and functional system analysis.

## Core Skills

- API analysis (REST / SOAP)
- JSON / XML payload validation
- ETL workflow validation
- VBA macros
- Jira
- Confluence
- Functional specs
- Technical specs
- Agile (SAFe)
- Cross-team collaboration

## Work Experience

### Product Definition Analyst at Amadeus (Astek)

Aug 2024 - Present

- Led functional evolution of bulk data ingestion workflow (Excel -> CSV -> API).
- Conducted API testing for client classification and data extraction.
- Acted as liaison between product, engineering, and QA to triage functional, data, and technical issues.
- Designed API workarounds and improved template logic for customer operations.
- Mentored developers and QA while strengthening E2E testing.

### Business Analyst at Finwizard Technology

Oct 2022 - Mar 2024

- Optimized KYC workflows through client segmentation.
- Built reconciliation logic for BSE/NSE datasets and implemented data cleansing protocols.
- Conducted API testing for client classification and data extraction.

### Technical Project Manager at IMT Atlantique

Dec 2020 - Apr 2022

- Managed multi-stakeholder technical projects through KPI, risk, and milestone tracking.
- Coordinated technical, administrative, and research teams.

## Education

### MSc Management & Optimization of Supply Chain, Transport

IMT Atlantique, Nantes, France
Sep 2018 - Dec 2020

## Key Impacts

- Reduced root cause identification time from approximately 2 days to 2-3 hours for production issues.
- Supported data operations through high-volume bulk updates via structured data workflows.

## Positioning

- Focus: API-driven platforms, bulk data ingestion, functional system analysis.
`);
  writeFileSync(jobPath, `Job Title: Technical Business Analyst
Company: ExampleCo
Location: France

We need API analysis, REST, JSON, XML, Jira, functional specifications, and stakeholder coordination.`);

  const parsed = parseMasterCv(readFileSync(cvPath, 'utf-8'), cvPath);
  assert.equal(parsed.sections.some(section => section.type === 'skills'), true);
  assert.equal(parsed.facts.some(fact => fact.line_start > 0), true);

  const job = extractJobFacts(readFileSync(jobPath, 'utf-8'), jobPath);
  assert.equal(job.title, 'Technical Business Analyst');
  assert.equal(job.company, 'ExampleCo');
  assert.equal(job.skills.includes('api'), true);

  const jobupStyleJob = extractJobFacts(`Consultant / Senior Consultant - Deal Advisory - Tech CoE - Offre d'emploi chez KPMG - jobup.ch

Offres d'emploi similaires
KPMG Zurich

Sauvegarder Postuler

Consultant / Senior Consultant - Deal Advisory - Tech CoE

Postuler Sauvegarder

8036 Zurich

This role requires technology due diligence, data analysis, product and platform topics.`, 'https://www.jobup.ch/fr/emplois/detail/example/');
  assert.equal(jobupStyleJob.title, 'Consultant / Senior Consultant - Deal Advisory - Tech CoE');
  assert.equal(jobupStyleJob.company, 'KPMG');
  assert.match(jobupStyleJob.location, /Zurich/);

  const result = scoreJob({
    jobText: readFileSync(jobPath, 'utf-8'),
    profile: parsed,
    scoringConfig: {
      recommendations: { apply: 72, maybe: 55 },
      dimensions: {
        skill_overlap: { weight: 10, positive_keywords: ['REST', 'JSON', 'XML', 'Jira', 'Python'] },
        product_analysis_fit: { weight: 5, positive_keywords: ['API analysis', 'functional specifications'] },
      },
      risk_level: { risk_keywords: ['native german'] },
    },
  });
  assert.equal(result.overall_score > 0, true);
  assert.equal(['Apply', 'Maybe', 'Skip'].includes(result.recommendation), true);

  const tailored = generateTailoredCv({ masterPdf: masterPdfPath, jobPath, output: join(temp, 'tailored.pdf') });
  assert.equal(tailored.mode, 'copy-master');
  assert.equal(tailored.layout_preserved, true);
  assert.equal(tailored.tailoring_applied, false);
  assert.equal(tailored.format, 'master_pdf_template');
  assert.deepEqual(readFileSync(tailored.output), masterPdfBytes);

  const lightTailored = generateTailoredCv({
    masterPdf: masterPdfPath,
    jobPath,
    output: join(temp, 'light-tailored.pdf'),
    mode: 'light-tailor',
  });
  assert.equal(lightTailored.mode, 'light-tailor');
  assert.equal(lightTailored.tailoring_applied, false);
  assert.match(lightTailored.reason, /copied the master CV unchanged/i);
  assert.deepEqual(readFileSync(lightTailored.output), masterPdfBytes);

  const cover = generateCoverLetter({ cvPath, jobPath, output: join(temp, 'cover.md') });
  assert.equal(cover.selected_facts > 0, true);
  const coverText = readFileSync(cover.output, 'utf-8').trim();
  assert.doesNotMatch(coverText, /Safety Check|Generated only from cv\.md|source:|cv\.md:\d+/i);
  assert.doesNotMatch(coverText, /\bPosition\b/);
  assert.doesNotMatch(coverText, /^#/m);
  assert.match(coverText, /Akash Kotkar/);
  assert.match(coverText, /Dear Hiring Team/);
  assert.match(coverText, /Sincerely/);
  assert.match(coverText, /Subject: Application for Technical Business Analyst/);
  assert.equal(coverText.split(/\n\s*\n/).filter(Boolean).length <= 10, true);
  assert.match(readFileSync(cover.audit, 'utf-8'), /Cover Letter Audit/);

  const interview = generateInterviewPrep({ cvPath, jobPath, output: join(temp, 'interview.md') });
  assert.equal(interview.selected_facts > 0, true);

  const profilePath = join(temp, 'profile.json');
  const configPath = join(temp, 'scoring.json');
  writeFileSync(profilePath, JSON.stringify(parsed, null, 2));
  writeFileSync(configPath, JSON.stringify({
    recommendations: { apply: 72, maybe: 55 },
    dimensions: {
      skill_overlap: { weight: 10, positive_keywords: ['REST', 'JSON', 'XML', 'Jira', 'API analysis'] },
    },
    risk_level: { risk_keywords: [] },
  }, null, 2));
  const localCliEnv = {
    ...process.env,
    APPLICATION_ASSISTANT_APPLICATIONS_DIR: join(temp, 'local-cli-applications'),
  };
  mkdirSync(localCliEnv.APPLICATION_ASSISTANT_APPLICATIONS_DIR, { recursive: true });

  const localScore = JSON.parse(execFileSync(process.execPath, [
    'src/scoring/scoring-engine.mjs',
    '--job', jobPath,
    '--profile', profilePath,
    '--config', configPath,
  ], { encoding: 'utf-8', env: localCliEnv }));
  assert.equal(localScore.overall_score > 0, true);
  assert.equal(localScore.job_file, jobPath);

  const urlText = `Job Title: API Product Owner
Company: UrlCo
Location: Remote Europe

This role needs REST, JSON, XML, API analysis, Jira, and stakeholder coordination.`;
  const dataUrl = `data:text/plain,${encodeURIComponent(urlText)}`;
  const urlRoot = join(temp, 'url-score');
  const urlEnv = {
    ...process.env,
    APPLICATION_ASSISTANT_JOBS_DIR: join(urlRoot, 'jobs'),
    APPLICATION_ASSISTANT_APPLICATIONS_DIR: join(urlRoot, 'applications'),
  };
  mkdirSync(urlEnv.APPLICATION_ASSISTANT_JOBS_DIR, { recursive: true });
  mkdirSync(urlEnv.APPLICATION_ASSISTANT_APPLICATIONS_DIR, { recursive: true });
  const urlScore = JSON.parse(execFileSync(process.execPath, [
    'src/scoring/scoring-engine.mjs',
    '--url', dataUrl,
    '--profile', profilePath,
    '--config', configPath,
  ], { encoding: 'utf-8', env: urlEnv }));
  assert.equal(urlScore.overall_score > 0, true);
  assert.equal(urlScore.job_file.includes(urlEnv.APPLICATION_ASSISTANT_JOBS_DIR), true);
  assert.match(readFileSync(urlScore.job_file, 'utf-8'), /UrlCo/);

  const missingInput = spawnSync(process.execPath, [
    'src/scoring/scoring-engine.mjs',
    '--profile', profilePath,
    '--config', configPath,
  ], { encoding: 'utf-8' });
  assert.notEqual(missingInput.status, 0);
  assert.match(missingInput.stderr, /Provide either --job <file> or --url <job-url>/);

  const explicitCliCv = JSON.parse(execFileSync(process.execPath, [
    'src/cv/generate-tailored-cv.mjs',
    '--master-pdf', masterPdfPath,
    '--job', jobPath,
    '--output', join(temp, 'explicit-cli-tailored.pdf'),
  ], { encoding: 'utf-8' }));
  assert.equal(explicitCliCv.job_file, jobPath);
  assert.equal(explicitCliCv.mode, 'copy-master');
  assert.equal(explicitCliCv.layout_preserved, true);
  assert.deepEqual(readFileSync(join(temp, 'explicit-cli-tailored.pdf')), masterPdfBytes);

  const latestRoot = join(temp, 'latest');
  const latestJobs = join(latestRoot, 'jobs');
  const latestApplications = join(latestRoot, 'applications');
  mkdirSync(latestJobs, { recursive: true });
  mkdirSync(latestApplications, { recursive: true });
  const latestEnv = {
    ...process.env,
    APPLICATION_ASSISTANT_JOBS_DIR: latestJobs,
    APPLICATION_ASSISTANT_APPLICATIONS_DIR: latestApplications,
  };
  const latestScore = JSON.parse(execFileSync(process.execPath, [
    'src/scoring/scoring-engine.mjs',
    '--url', dataUrl,
    '--profile', profilePath,
    '--config', configPath,
  ], { encoding: 'utf-8', env: latestEnv }));
  assert.match(latestScore.job_file, /urlco-api-product-owner\.json$/);

  const latestCv = JSON.parse(execFileSync(process.execPath, [
    'src/cv/generate-tailored-cv.mjs',
    '--master-pdf', masterPdfPath,
    '--latest',
    '--output', join(temp, 'latest-tailored.pdf'),
  ], { encoding: 'utf-8', env: latestEnv }));
  assert.equal(resolve(latestCv.job_file), resolve(latestScore.job_file));
  assert.deepEqual(readFileSync(join(temp, 'latest-tailored.pdf')), masterPdfBytes);

  const latestCover = JSON.parse(execFileSync(process.execPath, [
    'src/cover_letters/generate-cover-letter.mjs',
    '--cv', cvPath,
    '--latest',
    '--output', join(temp, 'latest-cover.md'),
  ], { encoding: 'utf-8', env: latestEnv }));
  assert.equal(resolve(latestCover.job_file), resolve(latestScore.job_file));

  const latestInterview = JSON.parse(execFileSync(process.execPath, [
    'src/interview/generate-interview-prep.mjs',
    '--cv', cvPath,
    '--latest',
    '--output', join(temp, 'latest-interview.md'),
  ], { encoding: 'utf-8', env: latestEnv }));
  assert.equal(resolve(latestInterview.job_file), resolve(latestScore.job_file));

  const emptyLatestRoot = join(temp, 'empty-latest');
  const emptyLatestEnv = {
    ...process.env,
    APPLICATION_ASSISTANT_JOBS_DIR: join(emptyLatestRoot, 'jobs'),
    APPLICATION_ASSISTANT_APPLICATIONS_DIR: join(emptyLatestRoot, 'applications'),
  };
  mkdirSync(emptyLatestEnv.APPLICATION_ASSISTANT_JOBS_DIR, { recursive: true });
  mkdirSync(emptyLatestEnv.APPLICATION_ASSISTANT_APPLICATIONS_DIR, { recursive: true });
  const missingLatest = spawnSync(process.execPath, [
    'src/cv/generate-tailored-cv.mjs',
    '--master-pdf', masterPdfPath,
    '--latest',
    '--output', join(temp, 'missing-latest.pdf'),
  ], { encoding: 'utf-8', env: emptyLatestEnv });
  assert.notEqual(missingLatest.status, 0);
  assert.match(missingLatest.stderr, /No latest job found\. First run: npm run score:job -- --url <job_url>/);

  const automationRoot = join(temp, 'automation');
  process.env.APPLICATION_ASSISTANT_DISCOVERED_JOBS_DIR = join(automationRoot, 'jobs', 'discovered');
  process.env.APPLICATION_ASSISTANT_APPLICATIONS_DIR = join(automationRoot, 'applications');
  process.env.APPLICATION_ASSISTANT_GENERATED_DIR = join(automationRoot, 'generated');
  const emptyPortals = join(automationRoot, 'empty-portals.yml');
  mkdirSync(automationRoot, { recursive: true });
  writeFileSync(emptyPortals, 'discovery:\n  manual_urls: []\n  search_queries: []\n');
  const discovered = await discoverJobs({ portalsPath: emptyPortals, url: dataUrl, limit: 5, live: false });
  assert.equal(discovered.discovered, 1);
  assert.match(readFileSync(discovered.outputs[0], 'utf-8'), /API Product Owner/);

  const jobupRoot = join(temp, 'jobup-fixture');
  const jobupPortals = join(jobupRoot, 'portals.yml');
  const jobupDiscoveredDir = join(jobupRoot, 'discovered');
  mkdirSync(jobupRoot, { recursive: true });
  writeFileSync(jobupPortals, `discovery:
  output_dir: "data/jobs/discovered"
  default_limit: 1
  search_queries:
    - "IT Business Analyst"
    - "API Product Owner"
  sources:
    jobup:
      enabled: true
      search_url_template: "https://fixture.jobup.ch/fr/emplois/?term={query}"
  manual_urls:
    - "https://www.jobup.ch/fr/emplois/detail/manual-product-owner/?jobid=manual-1"
`);
  process.env.APPLICATION_ASSISTANT_DISCOVERED_JOBS_DIR = jobupDiscoveredDir;
  const fixtureFetch = async fixtureUrl => {
    const urlValue = String(fixtureUrl);
    if (urlValue.includes('/fr/emplois/?term=')) {
      const query = decodeURIComponent(new URL(urlValue).searchParams.get('term') || '');
      const html = query.includes('API')
        ? `<a href="https://www.jobup.ch/fr/emplois/detail/manual-product-owner/?jobid=manual-1">API Product Owner</a>
           <a href="https://www.jobup.ch/fr/emplois/detail/second-api-role/?jobid=api-2">Second API Role</a>`
        : `<a href="https://www.jobup.ch/fr/emplois/detail/it-business-analyst/?jobid=it-1">IT Business Analyst</a>
           <a href="/fr/emplois/detail/another-it-role/?jobid=it-2">Another IT Role</a>`;
      return new Response(html, { status: 200, headers: { 'content-type': 'text/html' } });
    }
    if (urlValue.includes('manual-product-owner')) {
      return new Response('Job Title: API Product Owner\nCompany: ManualCo\nLocation: Geneva\n\nREST JSON API analysis Jira', { status: 200, headers: { 'content-type': 'text/plain' } });
    }
    if (urlValue.includes('it-business-analyst')) {
      return new Response('Job Title: IT Business Analyst\nCompany: JobupCo\nLocation: Lausanne\n\nBusiness analysis REST JSON Jira', { status: 200, headers: { 'content-type': 'text/plain' } });
    }
    return new Response('not found', { status: 404 });
  };
  const jobupDiscovery = await discoverJobs({
    portalsPath: jobupPortals,
    fetchImpl: fixtureFetch,
  });
  assert.equal(jobupDiscovery.queries_scanned, 2);
  assert.equal(jobupDiscovery.search_result_urls_found, 4);
  assert.equal(jobupDiscovery.manual_urls_imported, 1);
  assert.equal(jobupDiscovery.duplicates_skipped, 1);
  assert.equal(jobupDiscovery.jobs_saved, 2);
  assert.equal(jobupDiscovery.discovered, 2);
  const jobupOutputText = jobupDiscovery.outputs.map(path => readFileSync(path, 'utf-8')).join('\n');
  assert.match(jobupOutputText, /ManualCo/);
  assert.match(jobupOutputText, /JobupCo/);
  process.env.APPLICATION_ASSISTANT_DISCOVERED_JOBS_DIR = join(automationRoot, 'jobs', 'discovered');

  const multiPortalRoot = join(temp, 'multi-portal-fixture');
  const multiPortalConfig = join(multiPortalRoot, 'portals.yml');
  const multiPortalDiscovered = join(multiPortalRoot, 'discovered');
  mkdirSync(multiPortalRoot, { recursive: true });
  writeFileSync(multiPortalConfig, `discovery:
  default_limit: 1
  search_queries:
    - "Product Owner"
  sources:
    jobs_ch:
      enabled: true
      search_url_template: "https://fixture.jobs.ch/fr/offres-emplois/?term={query}"
    welcome_to_the_jungle:
      enabled: true
      search_url_template: "https://fixture.welcometothejungle.com/en/jobs?query={query}"
    linkedin:
      enabled: false
      mode: "manual_url_import"
      reason: "Manual import only."
  manual_urls: []
`);
  process.env.APPLICATION_ASSISTANT_DISCOVERED_JOBS_DIR = multiPortalDiscovered;
  const multiPortalFetch = async fixtureUrl => {
    const urlValue = String(fixtureUrl);
    if (urlValue.includes('fixture.jobs.ch')) {
      return new Response('<a href="https://www.jobs.ch/fr/offres-emplois/detail/product-owner-platform/">Product Owner Platform</a>', { status: 200, headers: { 'content-type': 'text/html' } });
    }
    if (urlValue.includes('fixture.welcometothejungle.com')) {
      return new Response('<a href="https://www.welcometothejungle.com/en/companies/acme/jobs/product-owner_paris">Product Owner Paris</a>', { status: 200, headers: { 'content-type': 'text/html' } });
    }
    if (urlValue.includes('jobs.ch')) {
      return new Response('Job Title: Product Owner Platform\nCompany: JobsChCo\nLocation: Zurich\n\nProduct owner API Jira', { status: 200, headers: { 'content-type': 'text/plain' } });
    }
    if (urlValue.includes('welcometothejungle')) {
      return new Response('Job Title: Product Owner Paris\nCompany: WTTJCo\nLocation: Paris\n\nProduct owner API Jira', { status: 200, headers: { 'content-type': 'text/plain' } });
    }
    return new Response('not found', { status: 404 });
  };
  const multiPortalDiscovery = await discoverJobs({ portalsPath: multiPortalConfig, fetchImpl: multiPortalFetch });
  assert.equal(multiPortalDiscovery.sources_scanned, 2);
  assert.equal(multiPortalDiscovery.search_result_urls_found, 2);
  assert.equal(multiPortalDiscovery.jobs_saved, 2);
  assert.equal(multiPortalDiscovery.source_messages.some(message => message.includes('linkedin')), true);
  const multiPortalText = multiPortalDiscovery.outputs.map(path => readFileSync(path, 'utf-8')).join('\n');
  assert.match(multiPortalText, /JobsChCo/);
  assert.match(multiPortalText, /WTTJCo/);
  process.env.APPLICATION_ASSISTANT_DISCOVERED_JOBS_DIR = join(automationRoot, 'jobs', 'discovered');

  const batchScore = await scoreBatch({
    jobsDir: process.env.APPLICATION_ASSISTANT_DISCOVERED_JOBS_DIR,
    profilePath,
    configPath,
  });
  assert.equal(batchScore.scored, 1);
  assert.equal(batchScore.results[0].recommendation, 'Strong Apply');

  const maybeJobPath = join(automationRoot, 'maybe-job.txt');
  writeFileSync(maybeJobPath, 'Job Title: Business Systems Analyst\nCompany: MaybeCo\nLocation: Lyon\n\nBusiness analysis Jira API documentation.');
  saveApplicationRecord(join(process.env.APPLICATION_ASSISTANT_APPLICATIONS_DIR, 'maybeco.json'), {
    id: 'maybeco-business-systems-analyst',
    unique_key: 'maybeco-business-systems-analyst',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    company: 'MaybeCo',
    role: 'Business Systems Analyst',
    role_title: 'Business Systems Analyst',
    location: 'Lyon',
    source: maybeJobPath,
    local_job_file: maybeJobPath,
    status: 'ready_for_document_generation',
    score: 54,
    recommendation: 'Maybe',
    generated_files: {},
  });

  const batchGenerated = await generateBatch({ cvPath, masterPdf: masterPdfPath });
  assert.equal(batchGenerated.generated, 2);
  const strongGenerated = batchGenerated.jobs.find(item => item.company === 'UrlCo');
  const maybeGenerated = batchGenerated.jobs.find(item => item.company === 'MaybeCo');
  assert.deepEqual(readFileSync(strongGenerated.generated_files.cv), masterPdfBytes);
  assert.equal(strongGenerated.generated_files.cv.endsWith('Akash KOTKAR CV.pdf'), true);
  assert.equal(strongGenerated.generated_files.cover_letter.endsWith('cover-letter.md'), true);
  assert.equal(strongGenerated.generated_files.cover_letter_pdf.endsWith('Akash KOTKAR Cover Letter.pdf'), true);
  assert.equal(strongGenerated.generated_files.job_description.endsWith('job-description.md'), true);
  assert.equal(strongGenerated.generated_files.scoring.endsWith('scoring.json'), true);
  assert.equal(strongGenerated.generated_files.interview_prep.endsWith('interview-prep.md'), true);
  assert.equal(maybeGenerated.recommendation, 'Maybe');
  assert.equal(maybeGenerated.score, 54);
  assert.equal(maybeGenerated.generated_files.cover_letter_pdf.endsWith('Akash KOTKAR Cover Letter.pdf'), true);

  const queue = listApplyQueue();
  assert.equal(queue.length, 1);
  assert.equal(queue[0].company, 'UrlCo');
  assert.equal(queue[0].role, 'API Product Owner');
  assert.equal(queue[0].recommendation, 'Strong Apply');
  assert.equal(queue[0].cv.endsWith('Akash KOTKAR CV.pdf'), true);
  assert.equal(queue[0].job_url, dataUrl);

  const assist = await applyAssist({ latest: true, dryRun: true });
  assert.equal(assist.will_submit, false);
  assert.equal(assist.job_url, dataUrl);
  assert.match(assist.safety, /does not/i);

  const dashboardRoot = join(temp, 'dashboard');
  const dashboardApps = join(dashboardRoot, 'applications');
  const dashboardGenerated = join(dashboardRoot, 'generated');
  process.env.APPLICATION_ASSISTANT_APPLICATIONS_DIR = dashboardApps;
  process.env.APPLICATION_ASSISTANT_GENERATED_DIR = dashboardGenerated;
  mkdirSync(dashboardApps, { recursive: true });
  saveApplicationRecord(join(dashboardApps, 'sample.json'), {
    id: 'sampleco-business-analyst-geneva',
    unique_key: 'sampleco-business-analyst-geneva',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    company: 'SampleCo',
    role: 'Business Analyst',
    role_title: 'Business Analyst',
    location: 'Geneva',
    source: 'https://example.com/job',
    job_url: 'https://example.com/job',
    status: 'ready_for_apply',
    score: 88,
    recommendation: 'Strong Apply',
    generated_files: {},
  });
  const dashboard = createDashboardServer({ noDiscover: true, open: false, port: 0 });
  const started = await dashboard.start();
  try {
    const dashboardHtmlResponse = await fetch(`${started.url}/`);
    const dashboardHtml = await dashboardHtmlResponse.text();
    assert.equal(dashboardHtmlResponse.status, 200);
    assert.match(dashboardHtml, /Application Dashboard/);
    assert.match(dashboardHtml, /dashboard-shell/);
    assert.match(dashboardHtml, /main-panel/);
    assert.match(dashboardHtml, /table-wrap/);
    assert.match(dashboardHtml, /\/assets\/dashboard\.css/);

    const dashboardCssResponse = await fetch(`${started.url}/assets/dashboard.css`);
    const dashboardCss = await dashboardCssResponse.text();
    assert.equal(dashboardCssResponse.status, 200);
    assert.match(dashboardCssResponse.headers.get('content-type') || '', /text\/css/);
    assert.match(dashboardCss, /\.dashboard-shell/);
    assert.match(dashboardCss, /\.main-panel/);
    assert.match(dashboardCss, /\.table-wrap/);

    const dashboardJsResponse = await fetch(`${started.url}/assets/dashboard.js`);
    const dashboardJs = await dashboardJsResponse.text();
    assert.equal(dashboardJsResponse.status, 200);
    assert.match(dashboardJsResponse.headers.get('content-type') || '', /application\/javascript/);
    assert.match(dashboardJs, /renderRows/);
    assert.match(dashboardJs, /fileLink/);

    const appsResponse = await fetch(`${started.url}/api/applications`);
    const dashboardAppsJson = await appsResponse.json();
    assert.equal(appsResponse.status, 200);
    assert.equal(dashboardAppsJson.length, 1);
    assert.equal(dashboardAppsJson[0].company, 'SampleCo');

    const statusResponse = await fetch(`${started.url}/api/applications/sampleco-business-analyst-geneva/status`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'applied' }),
    });
    const statusJson = await statusResponse.json();
    assert.equal(statusResponse.status, 200);
    assert.equal(statusJson.status, 'applied');

    const analyticsResponse = await fetch(`${started.url}/api/analytics`);
    const analyticsJson = await analyticsResponse.json();
    assert.equal(analyticsResponse.status, 200);
    assert.equal(analyticsJson.total_jobs, 1);
    assert.equal(analyticsJson.applied, 1);
  } finally {
    started.close();
  }

  const dashboardRefreshRoot = join(temp, 'dashboard-refresh');
  const dashboardPortals = join(dashboardRefreshRoot, 'portals.yml');
  const dashboardDiscovered = join(dashboardRefreshRoot, 'discovered');
  const dashboardRefreshApps = join(dashboardRefreshRoot, 'applications');
  const dashboardRefreshGenerated = join(dashboardRefreshRoot, 'generated');
  mkdirSync(dashboardRefreshRoot, { recursive: true });
  mkdirSync(dashboardRefreshApps, { recursive: true });
  mkdirSync(dashboardRefreshGenerated, { recursive: true });
  writeFileSync(dashboardPortals, 'discovery:\n  manual_urls: []\n  search_queries: []\n');
  process.env.APPLICATION_ASSISTANT_DISCOVERED_JOBS_DIR = dashboardDiscovered;
  process.env.APPLICATION_ASSISTANT_APPLICATIONS_DIR = dashboardRefreshApps;
  process.env.APPLICATION_ASSISTANT_GENERATED_DIR = dashboardRefreshGenerated;
  const refreshServer = createDashboardServer({
    noDiscover: true,
    open: false,
    port: 0,
    refreshOptions: {
      discoverOptions: { portalsPath: dashboardPortals, url: dataUrl, live: false },
      scoreOptions: { jobsDir: dashboardDiscovered, profilePath, configPath },
      generateOptions: { cvPath, masterPdf: masterPdfPath },
    },
  });
  const refreshStarted = await refreshServer.start();
  try {
    const refreshResponse = await fetch(`${refreshStarted.url}/api/refresh`, { method: 'POST' });
    const refreshJson = await refreshResponse.json();
    assert.equal(refreshResponse.status, 200);
    assert.equal(refreshJson.discovery.jobs_saved, 1);
    const refreshedApps = await (await fetch(`${refreshStarted.url}/api/applications`)).json();
    assert.equal(refreshedApps.length, 1);
    assert.equal(refreshedApps[0].status, 'ready_for_apply');
  } finally {
    refreshStarted.close();
  }

  console.log('application assistant tests passed');
} finally {
  rmSync(temp, { recursive: true, force: true });
}
