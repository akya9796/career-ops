#!/usr/bin/env node

import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { parseMasterCv } from './src/cv/master-cv.mjs';
import { scoreJob } from './src/scoring/scoring-engine.mjs';

const cv = `# Akash Kotkar

## Experience

- Product Definition Analyst at Amadeus through Astek.
- Analyzed REST APIs, SOAP APIs, XML, and JSON for hospitality technology.
- Worked on requirements engineering, functional design, and technical documentation.

## Skills

Product Definition, Business Analysis, REST APIs, SOAP APIs, XML, JSON, Jira, SQL
`;

const parsed = parseMasterCv(cv, 'fixture-cv.md');
assert.equal(parsed.sections.some(section => section.type === 'experience'), true);
assert.equal(parsed.skills.includes('REST APIs'), true);
assert.equal(parsed.facts.some(fact => fact.line_start > 0), true);

const scoringConfig = {
  recommendations: { strong_apply: 82, apply: 68, maybe: 52 },
  dimensions: {
    skill_overlap: {
      weight: 10,
      positive_keywords: ['REST APIs', 'SOAP APIs', 'Product Definition', 'Python'],
    },
    swiss_permit_friendliness: {
      weight: 5,
      positive_keywords: ['Switzerland', 'hybrid'],
      risk_keywords: ['must already have swiss work authorization'],
    },
  },
  risk_level: { risk_keywords: ['must already have swiss work authorization'] },
};

const result = scoreJob({
  jobText: 'Technical Product Manager role in Switzerland working on REST APIs and SOAP APIs in a hybrid setup.',
  profile: parsed,
  scoringConfig,
});

assert.equal(result.overall_score > 0, true);
assert.equal(result.traceability.facts_not_allowed_to_claim.some(item => item.includes('Swiss work authorization')), true);
assert.equal(Array.isArray(result.missing_skills), true);

const temp = mkdtempSync(join(tmpdir(), 'career-intel-'));
try {
  writeFileSync(join(temp, 'ok.txt'), 'ok');
} finally {
  rmSync(temp, { recursive: true, force: true });
}

console.log('career intelligence module tests passed');

