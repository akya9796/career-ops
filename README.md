# AI Job Application Assistant

A lean local CLI assistant for preparing job applications from a single source of truth: `cv.md`.

This is not a career intelligence platform. It does not do long-term market strategy, salary intelligence, visa intelligence, learning roadmaps, dashboards, or automatic applications.

## What It Does

1. Ingests the master CV from `cv.md`.
2. Analyzes a pasted job description or saved job text.
3. Scores job fit from 0-100.
4. Generates a tailored CV in Markdown.
5. Generates a cover letter in Markdown.
6. Generates interview prep notes.
7. Keeps generated files under `data/`.
8. Requires human approval before applying.

## Source Of Truth

`cv.md` is the master CV and the only source for candidate facts.

Generated CVs, cover letters, tracker entries, and interview notes must not invent:

- experience
- employers
- skills
- tools
- education
- certifications
- achievements
- work authorization
- metrics

The current `cv.md` was created from the attached Akash Kotkar CV PDF using extracted text and contains only facts present in that CV.

## Folder Structure

```text
config/
  profile.yml
  scoring.yml
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

Legacy broad career-ops functionality has been moved to `archive/legacy-career-ops/`.

## Commands

```bash
npm run doctor
npm run cv:ingest -- --input cv.md --output data/generated/profile/master-cv.json
npm run score:job -- --job data/jobs/example.txt --profile data/generated/profile/master-cv.json
npm run score:job -- --url https://company.example/jobs/123 --profile data/generated/profile/master-cv.json
npm run generate:cv -- --latest --pdf
npm run generate:cover-letter -- --latest --pdf
npm run interview:prep -- --latest
npm run generate:cv -- --job data/jobs/example.txt --output data/cv_versions/example-tailored-cv.md --pdf data/generated/example-tailored-cv.pdf
npm run generate:cover-letter -- --job data/jobs/example.txt --output data/generated/example-cover-letter.md --pdf data/generated/example-cover-letter.pdf
npm run interview:prep -- --job data/jobs/example.txt --output data/generated/example-interview-prep.md
npm run test:application-assistant
```

## Workflow

Create a job description file under `data/jobs/`, for example:

```text
Job Title: Technical Business Analyst
Company: ExampleCo
Location: Geneva

Paste the job description here.
```

Then run:

```bash
npm run cv:ingest -- --input cv.md --output data/generated/profile/master-cv.json
npm run score:job -- --job data/jobs/example.txt --profile data/generated/profile/master-cv.json
npm run score:job -- --url https://company.example/jobs/123 --profile data/generated/profile/master-cv.json
npm run generate:cv -- --latest --pdf
npm run generate:cover-letter -- --latest --pdf
npm run interview:prep -- --latest
```

Use `--job` for a local saved job description. Use `--url` to fetch a job URL, save the extracted job under `data/jobs/`, and score that saved file.
Use `--latest` after scoring to generate documents from the newest scored job.

Review every generated file manually before applying.

## Documentation

- [Cleanup Plan](docs/CLEANUP_PLAN.md)
- [Application Assistant Architecture](docs/APPLICATION_ASSISTANT_ARCHITECTURE.md)
