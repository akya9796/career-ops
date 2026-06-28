# AI Job Application Assistant

A local futuristic cockpit for job discovery, fit scoring, document generation, and application tracking.

This is not a career intelligence platform and not an auto-apply bot. It does not store credentials in tracked config, bypass CAPTCHA, or submit applications for you.

## What You Get

- Soft glass dashboard at `http://localhost:3000`
- Job discovery from configured sources
- Secure authenticated portal session support
- Direct company career URL discovery
- Manual URL import
- Batch scoring
- Preserved master CV PDF copy
- Generated cover letter PDF
- Job description and scoring files per application
- Application tracker with status updates
- Compact main dashboard with document links in each row
- Recommendation, status, and role-signal analytics
- Manual apply workflow

## Private Files

These files are personal and ignored by git:

- `cv.md`
- `master/*`
- `generated/*`
- `data/applications/*`
- `data/jobs/*`
- `data/generated/*`
- `data/cv_versions/*`
- `config/profile.yml`
- `.env.local`
- `.sessions/*`

Keep your real CV at:

```text
master/master-cv.pdf
```

Keep your structured CV/profile reference at:

```text
cv.md
```

Generated application packages are stored locally under:

```text
data/generated/<application-key>/
```

## Setup

```bash
npm install
npx playwright install chromium
npm run cv:ingest -- --input cv.md --output data/generated/profile/master-cv.json
```

Configure:

```text
config/profile.yml
config/portals.yml
config/scoring.yml
config/ai.yml
```

For authenticated portals, create a local secret file from the placeholder template:

```bash
cp .env.local.example .env.local
```

Put real usernames and passwords only in `.env.local` or your OS/environment secret store. Never put credentials in `config/portals.yml` and never commit `.env.local`.

## AI Provider

The app has a provider-agnostic AI layer under `src/ai/`. Business logic calls `AIManager.generate(...)`; it does not call Gemini or any provider directly.

V1 supports Gemini. Planned provider slots exist for OpenAI, Claude, Ollama, OpenRouter, and Azure OpenAI, but they are intentionally not implemented yet.

Get a Gemini API key from Google AI Studio:

```text
https://aistudio.google.com/apikey
```

Then add it to `.env.local`:

```text
GEMINI_API_KEY=your_key_here
```

Select the provider and model in `config/ai.yml`:

```yaml
provider: gemini

gemini:
  enabled: true
  model: gemini-2.5-flash
  api_key_env: GEMINI_API_KEY
```

Switching providers later should only require changing `provider:` and that provider's config block. Current AI usage is limited to cover letter generation, job summary, and job fit explanation. Scraping, duplicate detection, scheduling, dashboard state, storage, application tracking, and scoring remain deterministic.

If Gemini is missing or fails, the app retries once, writes deterministic fallback content where needed, and keeps the dashboard usable.

## Start The App

```bash
npm run app
```

This starts the dashboard, opens the browser, runs discovery/scoring/document generation, and schedules refresh every hour by default.

Open without discovery:

```bash
npm run app:no-discover
```

Run a manual refresh:

```bash
npm run refresh
```

## Dashboard Workflow

1. Start with `npm run app`.
2. Check automation status in the header.
3. Filter the main dashboard by status, recommendation, score, source, company, role, or location.
4. Open the preserved CV PDF, generated cover letter PDF, job description, and job URL directly from the table row.
5. Apply manually on the employer or portal page.
6. Update the application status from the table.

The dashboard uses a light glass-style layout by default, keeps the source column short, and keeps the main table readable. Generated document links are available directly in the row.

Supported statuses:

- `ready_for_apply`
- `applied`
- `rejected`
- `interview`
- `offer`
- `skipped`
- `archived`

## Discovery

Discovery reads `config/portals.yml`.

Jobup.ch is the first active search provider. The app also includes configurable best-effort search templates for strong France/Switzerland sources:

- Jobup.ch
- Jobs.ch
- Welcome to the Jungle
- HelloWork
- France Travail
- APEC
- SwissDevJobs
- SwissTechJobs
- Indeed
- LinkedIn
- company career pages

Sources that often require login, block scraping, or change dynamically are configured as manual-import stubs. The dashboard will not pretend these are fully automated; discovery logs `source unavailable / manual import recommended` where appropriate.

Example:

```yaml
discovery:
  refresh_interval_minutes: 60
  default_limit: 25
  search_queries:
    - "IT Business Analyst"
    - "Technical Business Analyst"
    - "Product Owner"
  sources:
    jobup:
      enabled: true
      search_url_template: "https://www.jobup.ch/fr/emplois/?term={query}"
    jobs_ch:
      enabled: true
      search_url_template: "https://www.jobs.ch/fr/offres-emplois/?term={query}"
    welcome_to_the_jungle:
      enabled: true
      search_url_template: "https://www.welcometothejungle.com/en/jobs?query={query}&aroundQuery=France"
    linkedin:
      enabled: false
      mode: "manual_url_import"
  manual_urls: []
```

Authenticated sources reference credential key names, not credential values:

```yaml
discovery:
  authenticated_sources:
    jobup:
      enabled: true
      login_required: true
      login_url: "https://www.jobup.ch/fr/login/"
      username_env: "JOBUP_USERNAME"
      password_env: "JOBUP_PASSWORD"
    linkedin:
      enabled: false
      login_required: true
      mode: "manual_login_session"
      note: "Do not automate CAPTCHA or bypass protections."
```

If a source needs login and safe selectors are not configured, the app opens a browser for manual login and saves local session state under `.sessions/`. Passwords are not printed in logs.

For protected portals such as LinkedIn, use manual session mode:

```bash
npm run login:portal -- --source linkedin
```

The command opens a browser, lets you log in manually, and stores only browser session state under `.sessions/`. It does not store a password for manual-login portals.

Direct company career pages are configured under `discovery.company_career_urls`:

```yaml
discovery:
  company_career_urls:
    - name: "Amadeus"
      enabled: true
      url: "https://careers.amadeus.com/"
      login_required: false
```

Discovery scans enabled portal search pages, enabled company career URLs, saved authenticated sessions where configured, and any manual URLs. If a company page is dynamic or protected, the app logs `manual import recommended` and continues.

Discovery output tracks:

- `queries_scanned`
- `search_result_urls_found`
- `manual_urls_imported`
- `duplicates_skipped`
- `jobs_saved`

## Generated Documents

The CV is not rewritten. The app copies:

```text
master/master-cv.pdf
```

into each application package using the filename configured in `config/profile.yml`.

Documents are generated for jobs with score `50` or higher. The cover letter is generated per job and must not include fake claims, fake work authorization, source references, internal notes, `Safety Check`, or placeholder text like `Position`.

If PDF generation fails, the dashboard can still show the Markdown fallback.

## API

Local routes:

- `GET /api/health`
- `GET /api/applications`
- `GET /api/applications/:id`
- `POST /api/applications/:id/status`
- `POST /api/applications/:id/archive`
- `DELETE /api/applications/:id`
- `POST /api/refresh`
- `GET /api/analytics`
- `POST /api/admin/clear-data`
- `POST /api/admin/clear-sessions`

Generated files are served only from safe local project data directories.

## CLI Commands

The dashboard is the normal workflow, but these commands remain available:

```bash
npm run doctor
npm run discover:jobs
npm run login:portal -- --source linkedin
npm run score:batch
npm run generate:batch
npm run apply:queue
npm run apply:assist -- --latest
npm run score:job -- --url https://company.example/jobs/123
npm run generate:cover-letter -- --latest --pdf
npm run generate:cover-letter -- --latest --ai --pdf
npm run test:application-assistant
```

## Limitations

- Some portals block scraping or require login.
- LinkedIn usually requires manual login session mode or manual URL import.
- The app never auto-submits applications.
- The app never stores job portal credentials.
- The app does not bypass CAPTCHA or portal protections.
- If `master/master-cv.pdf` is missing, CV generation is skipped or reported as missing instead of crashing the dashboard.

## Git Safety

Before pushing, check:

```bash
git status --short
```

Your personal CV, generated documents, discovered jobs, application records, and local profile config should stay ignored.

To reset from the dashboard, use `Clear Dashboard Data`. It requires two confirmations: click `I understand`, then type exactly:

```text
CLEAR DASHBOARD DATA
```

This clears:

```text
data/applications/
data/jobs/discovered/
data/generated/
data/reports/
```

It does not delete `master/master-cv.pdf`, `cv.md`, `config/`, `prompts/`, `.env.local`, `.sessions/`, or `archive/`.

Use `Clear Login Sessions` separately to remove only `.sessions/`.

The legacy reuse audit is in `docs/LEGACY_REUSE_AUDIT.md`. The only legacy code reused now is a small HTTP timeout/user-agent helper for discovery reliability.

The AI provider audit is in `docs/AI_PROVIDER_AUDIT.md`.
