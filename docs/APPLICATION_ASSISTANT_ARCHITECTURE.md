# AI Job Application Assistant Architecture

## Product Scope

This repository is now a focused local CLI assistant for job applications.

It does not provide broad market intelligence, long-term career strategy,
salary intelligence, visa intelligence, learning roadmaps, or dashboards.

## Workflow

1. User adds a job URL or pastes a job description.
2. The assistant extracts job facts into `data/jobs/`.
3. The assistant compares the job against `cv.md`.
4. The assistant returns a 0-100 score and `Apply`, `Maybe`, or `Skip`.
5. For approved jobs, it generates:
   - tailored CV Markdown
   - tailored CV PDF
   - cover letter Markdown
   - cover letter PDF
   - interview prep notes
6. The assistant updates the application tracker.
7. Nothing is auto-submitted.

## Folder Structure

```text
config/
  scoring.yml
  profile.yml
  portals.yml

prompts/
  scoring.md
  cv-tailoring.md
  cover-letter.md
  interview-prep.md

data/
  jobs/
  applications/
  generated/
  cv_versions/

src/
  ai/
  cv/
  scoring/
  jobs/
  cover_letters/
  tracker/
  interview/
  pdf/

docs/
  CLEANUP_PLAN.md
  APPLICATION_ASSISTANT_ARCHITECTURE.md
```

## Modules

### CV

`src/cv/` ingests `cv.md`, extracts structured facts, and keeps line references.
The original `cv.md` remains the single source of truth.

### Jobs

`src/jobs/` accepts either a pasted job description or a URL-derived text file.
It extracts role, company, location, work mode, requirements, skills, and risks.

### Scoring

`src/scoring/` loads `config/scoring.yml`, compares job facts against CV facts,
and returns a 0-100 recommendation.

### CV Tailoring

`src/cv/` generates tailored Markdown CV variants from existing CV facts only.
It may reorder, select, and rephrase supported facts, but cannot invent claims.

### Cover Letters

`src/cover_letters/` generates concise Markdown cover letters from CV and job facts.
The PDF path uses the existing Playwright renderer.

### Interview

`src/interview/` generates practical interview notes and likely questions from the
job description and CV facts.

### Tracker

`src/tracker/` writes application records under `data/applications/`.
The legacy Markdown tracker can remain as a compatibility export only.

### PDF

`src/pdf/` wraps the existing PDF rendering utilities for generated CVs and cover letters.

## Non-Goals

- Continuous market tracking
- Company intelligence expansion
- Salary intelligence
- Visa intelligence
- Learning roadmaps
- Career strategy dashboard
- Automatic application submission

