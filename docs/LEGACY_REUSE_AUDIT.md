# Legacy Reuse Audit

The archive at `archive/legacy-career-ops/` contains useful building blocks, but the current assistant should stay lean. Decisions below favor small, direct improvements to discovery, reliability, document generation, tracking, and approval-first application workflow.

| File/module | What it does | Still useful? | Improvement path | Effort | Risk | Decision |
| --- | --- | --- | --- | --- | --- | --- |
| `providers/_http.mjs` | Fetch helper with timeout, user agent, and clearer HTTP errors. | Yes | Adapt timeout/user-agent behavior for current discovery fetches. | Low | Low | Reuse now |
| `providers/smartrecruiters.mjs` | Reads SmartRecruiters public postings API from company career URLs. | Yes, for selected company pages | Add a small provider-specific extractor later for configured company URLs. | Medium | Low | Adapt later |
| `providers/workday.mjs` | Reads Workday CXS public jobs endpoint from Workday career URLs. | Yes, for company pages | Add targeted Workday support after direct company URL discovery stabilizes. | Medium | Medium | Adapt later |
| `providers/greenhouse.mjs`, `providers/lever.mjs`, `providers/ashby.mjs` | Public ATS provider adapters. | Yes | Reuse parser ideas only, behind explicit company URL config. | Medium | Low | Adapt later |
| `providers/_trust-validator.mjs` | Host validation for provider URLs. | Yes | Add allowlist validation when provider-specific adapters are restored. | Medium | Low | Adapt later |
| `dedup-tracker.mjs` | Conservative dedup logic preserving advanced statuses. | Partly | Current JSON application records already use stable keys; reuse status-preservation ideas if duplicate merging grows. | Medium | Medium | Adapt later |
| `tracker-utils.mjs`, `tracker-links.mjs` | Markdown tracker parsing/link helpers. | Limited | Current dashboard uses JSON records, so only concepts are relevant. | Medium | Medium | Keep archived |
| `scan.mjs`, `scan-ats-full.mjs` | Broad scanner loading many providers. | Too broad for current scope | Avoid restoring broad scanner architecture. | High | High | Keep archived |
| `validate-portals.mjs`, `verify-portals.mjs` | Portal config validation and liveness checks. | Yes | Could become a small `doctor` check for company URLs and env key names. | Medium | Low | Adapt later |
| `batch/batch-runner.sh` | Batch processing orchestration. | Mostly superseded | Current `refresh-pipeline.mjs` is simpler and local. | Low | Medium | Keep archived |
| `dashboard/` Go TUI | Terminal dashboard, sorting, progress views. | Conceptually useful | Current web dashboard already covers main workflow; borrow sorting/progress ideas only. | High | Medium | Keep archived |
| `src/cv/pdf-text-extract.mjs` | PDF text extraction utility. | Potentially useful | Could improve CV ingestion from PDF later. | Medium | Medium | Adapt later |
| `generate-latex.mjs`, `build-cv-latex.mjs`, `templates/cv-template.tex` | LaTeX CV generation. | Not aligned | Current app preserves master CV layout and avoids rewriting it. | High | Medium | Keep archived |
| `reserve-report-num.mjs`, report workflows | Stable numbered report generation. | Limited | Current generated packages are per application key; numbered reports are unnecessary. | Medium | Low | Keep archived |
| `liveness-*` current root files and archived liveness docs | Portal liveness checks. | Yes | Keep current lightweight scripts; do not merge archived scanner. | Low | Low | Keep archived |
| `modes/*`, `knowledge/*`, market intelligence docs | Prompt modes and career intelligence. | No for this request | Would bloat the assistant beyond discovery/application workflow. | High | High | Remove permanently if archive cleanup is desired |
| Multilingual READMEs and broad governance docs | Project packaging docs. | No direct runtime value | Keep only in archive for history. | Low | Low | Keep archived |

## Reused Now

Implemented a small `src/jobs/http.mjs` helper, adapted from `providers/_http.mjs`, and made live discovery use it by default. This improves scraping reliability with request timeouts and a consistent user agent while preserving the current lean discovery design.

## Not Restored

The old provider loader, career intelligence modules, broad scan modes, and TUI architecture remain archived. They are useful references, but restoring them now would expand the maintenance surface and distract from the dashboard-first assistant.
