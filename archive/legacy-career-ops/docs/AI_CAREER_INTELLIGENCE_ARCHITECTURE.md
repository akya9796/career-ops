# AI Career Intelligence Platform Architecture

## Phase 1 Repository Analysis

This fork starts from `career-ops`, a CLI-first job search automation system. The current architecture is effective for single job evaluation and pipeline management, but it is organized around agent prompt modes and root-level scripts rather than a modular product architecture.

### Current Architecture

- **Runtime:** Node.js ESM scripts at the repository root, plus a Go Bubble Tea terminal dashboard in `dashboard/`.
- **Agent layer:** `AGENTS.md`, CLI-specific wrappers, and `modes/*.md` define the AI workflows.
- **Data layer:** Markdown, TSV, JSON-like payloads, and generated files under `data/`, `reports/`, `output/`, `batch/`, `jds/`, and `interview-prep/`.
- **Job discovery:** `scan.mjs` loads provider plugins from `providers/*.mjs` and writes discovered jobs to `data/pipeline.md`.
- **Evaluation:** Prompt-heavy A-G job evaluation in `modes/oferta.md` and `modes/_shared.md`, with optional Gemini and Ollama scripts.
- **Tracker:** `data/applications.md` remains the canonical application tracker; `tracker.mjs` builds a derived SQLite index where available.
- **Document generation:** HTML templates plus Playwright PDF rendering through `generate-pdf.mjs` and `generate-cover-letter.mjs`.
- **Dashboard:** Go TUI parses the Markdown tracker and report files.

### What Already Exists

- Human-in-the-loop application workflow and explicit anti-auto-apply rules.
- Portal provider pattern for Greenhouse, Ashby, Lever, Workday, SmartRecruiters, and other sources.
- Markdown application tracker with merge, deduplication, normalization, liveness, and reconciliation utilities.
- ATS-safe PDF generation with section-order validation and Unicode normalization.
- Cover letter PDF rendering from structured payloads.
- Gemini and Ollama evaluator scripts.
- Go TUI dashboard for the current tracker.
- Data contract separating user-owned files from system-owned files.

### What Should Be Reused

- `providers/*.mjs` and `scan.mjs` as the first generation portal adapter layer.
- `data/applications.md`, `tracker.mjs`, and tracker utility scripts as the initial tracker storage.
- `generate-pdf.mjs`, `generate-latex.mjs`, templates, and fonts for document rendering.
- `generate-cover-letter.mjs` for cover letter PDF output once draft generation becomes structured.
- `liveness-core.mjs` and liveness verification scripts.
- `dashboard/` as the initial dashboard surface while the data model evolves.
- `DATA_CONTRACT.md` source-of-truth boundary, with stronger CV traceability added.

### What Should Be Replaced

- The old 1-5 A-G scoring model should be replaced by a config-driven 0-100 job-fit engine.
- Hardcoded prompt logic in `modes/_shared.md` and `modes/oferta.md` should move into editable files under `prompts/`.
- User-specific archetypes in prompt files should move into `config/targets/` and `knowledge/profile/`.
- Root-level scripts should gradually become thin CLI wrappers over `/src` modules.
- Free-text tracker notes should be supplemented by structured JSON records under `data/applications/`.

### What Should Be Added

- Master CV ingestion and normalized profile model with source references.
- Fact ledger enforcing that generated claims come only from the master CV, profile config, and approved knowledge files.
- Config-driven scoring dimensions for Switzerland, France, remote Europe, product/API/BA roles, and work authorization risk.
- Structured job, application, generated-document, interview, skill-gap, and market-intelligence data models.
- Provider-neutral AI client layer for OpenAI, Claude, Gemini, and Ollama.
- Prompt registry under `prompts/` with no prompts hardcoded in business logic.
- Approval queue for application drafts and later browser automation.
- Versioned CV and cover letter records linked to jobs and source facts.

## Target Architecture

```text
config/
  ai.yml
  scoring/job-fit.yml
  targets/akash-kotkar.yml
  portals/README.md
prompts/
  scoring/job-fit.md
  cv/variant.md
  cover_letters/concise.md
  interview/prep.md
  market_intelligence/trends.md
knowledge/
  profile/
  roles/
  countries/
  companies/
  visa/
  salary/
data/
  jobs/
  applications/
  generated/
  cv_versions/
  reports/
src/
  adapters/
  ai/
  scoring/
  cv/
  cover_letters/
  tracker/
  interview/
  market/
  dashboard/
```

### Core Design Rules

- The uploaded master CV is immutable and remains the factual source of truth.
- Generated content must cite exact source facts and include a hallucination risk check.
- AI providers are interchangeable through configuration.
- Scoring dimensions and weights live in YAML, not code.
- Prompt text lives in `prompts/`, not code.
- Portal integrations use adapters, with the existing `providers/` layer retained during migration.
- Application submission requires explicit user approval.

## Implementation Plan

1. **Phase 1:** Add architecture docs, folder structure, configurable targets, scoring config, AI config, prompt registry, and initial module boundaries.
2. **Phase 2:** Build master CV ingestion and normalized structured profile output with line references.
3. **Phase 3:** Add 0-100 scoring engine using configurable dimensions and target-role/country weights.
4. **Phase 4:** Add structured job and application models while keeping Markdown tracker compatibility.
5. **Phase 5:** Build CV variant generator from approved source facts only.
6. **Phase 6:** Build cover letter generator with traceability, risk check, and concise output.
7. **Phase 7:** Build interview preparation generator with STAR stories derived from CV facts.
8. **Phase 8:** Extend dashboard metrics for market intelligence, skill gaps, and funnel status.
9. **Phase 9:** Move existing portal providers behind `/src/adapters` registry and add missing Swiss/EU sources.
10. **Phase 10:** Add ready-to-apply queue with explicit approval gates.

## Task Checklist

- [x] Read repository structure and key system files.
- [x] Identify reusable modules and replacement areas.
- [x] Add target architecture report.
- [x] Create updated modular folder structure.
- [x] Add Akash-specific target profile configuration.
- [x] Add editable scoring configuration.
- [x] Add editable prompt files.
- [x] Add first master CV ingestion module.
- [x] Add first config-driven scoring module.
- [ ] Add PDF/DOCX text extraction implementation.
- [ ] Add structured application/job persistence.
- [ ] Wire CV variants and cover letters into the new fact ledger.
- [ ] Extend dashboard to use structured data.

