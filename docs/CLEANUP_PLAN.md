# Cleanup Plan: AI Job Application Assistant

## Objective

Refocus this repository from a broad AI Career Intelligence Platform into a lean local AI Job Application Assistant.

The application should support only:

1. Master CV ingestion from `cv.md`
2. Job URL or pasted job description analysis
3. Job fit scoring
4. Tailored CV generation
5. Cover letter generation
6. Application tracking
7. Interview preparation
8. Human approval before any application action

Anything not directly needed for job applications should be removed, archived, merged, or simplified.

## Keep

These files or folders remain part of the working product.

- `cv.md`
- `package.json`
- `doctor.mjs`
- `generate-pdf.mjs`
- `generate-cover-letter.mjs`
- `tracker.mjs`
- `tracker-utils.mjs`
- `tracker-links.mjs`
- `role-matcher.mjs`
- `liveness-core.mjs`
- `liveness-api.mjs`
- `liveness-browser.mjs`
- `check-liveness.mjs`
- `templates/cv-template.html`
- `templates/cover-letter-template.html`
- `templates/states.yml`
- `fonts/`
- `config/profile.yml`
- `config/portals.yml`
- `config/scoring.yml`
- `prompts/scoring.md`
- `prompts/cv-tailoring.md`
- `prompts/cover-letter.md`
- `prompts/interview-prep.md`
- `data/jobs/`
- `data/applications/`
- `data/generated/`
- `data/cv_versions/`
- `src/ai/`
- `src/cv/`
- `src/scoring/`
- `src/jobs/`
- `src/cover_letters/`
- `src/tracker/`
- `src/interview/`
- `src/pdf/`
- `docs/CLEANUP_PLAN.md`
- `docs/APPLICATION_ASSISTANT_ARCHITECTURE.md`

## Remove

These are not needed in the lean application assistant and can be deleted if not archived.

- `knowledge/`
- `src/market/`
- `src/dashboard/`
- `docs/AI_CAREER_INTELLIGENCE_ARCHITECTURE.md`
- `prompts/market_intelligence/`
- `config/targets/`
- `config/scoring/job-fit.yml` after merge into `config/scoring.yml`
- `config/portals/` after merge into `config/portals.yml`
- `data/reports/`
- empty market/career-intelligence scaffolding created during the previous direction

## Archive

These original `career-ops` capabilities are useful historically but too broad for the lean assistant. Move them to `archive/legacy-career-ops/` rather than deleting immediately.

- `dashboard/`
- `modes/`
- `batch/`
- `scaffolder/`
- `providers/`
- `scan.mjs`
- `validate-portals.mjs`
- `verify-portals.mjs`
- multilingual README files: `README.*.md`
- broad governance/community/update files:
  - `CHANGELOG.md`
  - `CODE_OF_CONDUCT.md`
  - `CONTRIBUTING.md`
  - `CONTRIBUTORS.md`
  - `GOVERNANCE.md`
  - `SUPPORT.md`
  - `SECURITY.md`
  - `TRADEMARK.md`
  - `CITATION.cff`
  - `DOCKER.md`
  - `Dockerfile`
  - `docker-compose.yml`
  - `flake.nix`
  - `flake.lock`
  - `renovate.json`
  - `release-please-config.json`
- original broad examples:
  - `examples/`
  - `writing-samples/`
  - `voice-dna.md`
- original broad docs/assets:
  - `docs/ARCHITECTURE.md`
  - `docs/CUSTOMIZATION.md`
  - `docs/RUNNING_ON_A_BUDGET.md`
  - `docs/SCRIPTS.md`
  - `docs/SETUP.md`
  - `docs/local-parser-cookbook.md`
  - `docs/*.jpg`
  - `docs/*.gif`
  - `docs/press/`
- unused template extras:
  - `templates/README.md`
  - `templates/portals.example.yml`
  - `templates/resume-template.html`
  - `templates/cv-template.tex`
- legacy updater and broad maintenance scripts:
  - `update-system.mjs`
  - `updater-migration-tests.mjs`
  - `verify-pipeline.mjs`
  - `reconcile-pipeline.mjs`
  - `dedup-tracker.mjs`
  - `merge-tracker.mjs`
  - `normalize-statuses.mjs`
  - `archive-posting.mjs`
  - `analyze-patterns.mjs`
  - `followup-cadence.mjs`
  - `scan-ats-full.mjs`
  - `gemini-eval.mjs`
  - `ollama-eval.mjs`
  - `match-star.mjs`
  - `build-cv-latex.mjs`
  - `generate-latex.mjs`
  - broad legacy tests such as `test-all.mjs`, `test-salary-filter.mjs`, `test-trust-validator.mjs`, `tracker-columns-tests.mjs`

## Merge

Consolidate the previous multi-folder configuration into the simplified target shape.

- Merge `config/scoring/job-fit.yml` into `config/scoring.yml`.
- Merge `config/targets/akash-kotkar.yml` and useful parts of `config/profile.yml` into a single `config/profile.yml`.
- Merge `portals.yml` and `config/portals/README.md` into `config/portals.yml`.
- Flatten prompt folders:
  - `prompts/scoring/job-fit.md` -> `prompts/scoring.md`
  - `prompts/cv/variant.md` -> `prompts/cv-tailoring.md`
  - `prompts/cover_letters/concise.md` -> `prompts/cover-letter.md`
  - `prompts/interview/prep.md` -> `prompts/interview-prep.md`
- Rename the focused test from `test-career-intelligence.mjs` to `test-application-assistant.mjs`.

## Simplify

- `package.json` should expose only:
  - `npm run doctor`
  - `npm run cv:ingest`
  - `npm run score:job`
  - `npm run generate:cv`
  - `npm run generate:cover-letter`
  - `npm run interview:prep`
  - `npm run test:application-assistant`
- Root scripts should become thin wrappers or be archived.
- No market-intelligence, salary-intelligence, visa-intelligence, learning-roadmap, career-strategy, or dashboard modules should remain in the active app.
- The active app should never submit applications. It may prepare files and tracker entries, then wait for human approval.

## Safety Rules

- `cv.md` is the single source of truth.
- Do not invent facts missing from `cv.md`.
- Preserve the original PDF-derived facts when creating `cv.md`.
- Tailored documents must include traceability back to CV facts.
- Application submission is out of scope unless a future explicit approval module is added.
