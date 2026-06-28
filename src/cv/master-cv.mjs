import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, extname, resolve } from 'path';
import { pathToFileURL } from 'url';

const SUPPORTED_TEXT_EXTENSIONS = new Set(['.md', '.markdown', '.txt']);
const PLANNED_BINARY_EXTENSIONS = new Set(['.pdf', '.docx']);

export function readMasterCv(inputPath) {
  const fullPath = resolve(inputPath);
  if (!existsSync(fullPath)) {
    throw new Error(`Master CV not found: ${inputPath}`);
  }
  const extension = extname(fullPath).toLowerCase();
  if (SUPPORTED_TEXT_EXTENSIONS.has(extension)) {
    return {
      path: fullPath,
      format: extension.replace('.', '') || 'text',
      text: readFileSync(fullPath, 'utf-8'),
      extraction: { status: 'ok', method: 'plain-text' },
    };
  }
  if (PLANNED_BINARY_EXTENSIONS.has(extension)) {
    throw new Error(`${extension} ingestion is planned but needs a text extraction adapter. Export this CV to Markdown/text for the current increment.`);
  }
  throw new Error(`Unsupported CV format: ${extension || '(none)'}`);
}

function normalizeHeading(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'untitled';
}

function classifySection(title) {
  const normalized = normalizeHeading(title);
  if (/experience|employment|work/.test(normalized)) return 'experience';
  if (/skill|technology|tool|competenc|technical|data_and_integration|methods|documentation/.test(normalized)) return 'skills';
  if (/education|degree|academic/.test(normalized)) return 'education';
  if (/project/.test(normalized)) return 'projects';
  if (/certification|certificate/.test(normalized)) return 'certifications';
  if (/summary|profile|objective/.test(normalized)) return 'summary';
  return normalized;
}

function splitLines(text) {
  return String(text || '').replace(/\r\n/g, '\n').split('\n');
}

function bulletText(line) {
  const match = line.match(/^\s*(?:[-*+]|\d+[.)])\s+(.+?)\s*$/);
  return match ? match[1].trim() : null;
}

function extractSkillsFromText(text) {
  const tokens = new Set();
  for (const line of String(text || '').split(/\r?\n/)) {
    const cleanedLine = line.replace(/^\s*(?:[-*+]|\d+[.)])\s+/, '').replace(/[*_`]/g, '').trim();
    if (!cleanedLine) continue;
    const pieces = cleanedLine
      .replace(/[()]/g, ',')
      .split(/[,;|/]/)
      .map(item => item.trim())
      .filter(Boolean);
    for (const raw of pieces.length ? pieces : [cleanedLine]) {
      const item = raw.trim();
      if (item.length >= 2 && item.length <= 40 && /[a-zA-Z]/.test(item)) {
        tokens.add(item);
      }
    }
  }
  return [...tokens].sort((a, b) => a.localeCompare(b));
}

export function parseMasterCv(text, sourcePath = 'cv.md') {
  const lines = splitLines(text);
  const sections = [];
  let current = { title: 'Preamble', type: 'preamble', startLine: 1, endLine: 1, lines: [] };

  for (let index = 0; index < lines.length; index++) {
    const lineNumber = index + 1;
    const heading = lines[index].match(/^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/);
    if (heading) {
      current.endLine = Math.max(current.startLine, lineNumber - 1);
      sections.push(current);
      current = {
        title: heading[1].trim(),
        type: classifySection(heading[1]),
        startLine: lineNumber,
        endLine: lineNumber,
        lines: [],
      };
    } else {
      current.lines.push({ line: lineNumber, text: lines[index] });
      current.endLine = lineNumber;
    }
  }
  sections.push(current);

  const facts = [];
  const skills = new Set();
  for (const section of sections) {
    const body = section.lines.map(item => item.text).join('\n').trim();
    if (!body) continue;
    facts.push({
      id: `cv:${facts.length + 1}`,
      source: sourcePath,
      section: section.title,
      section_type: section.type,
      line_start: section.startLine,
      line_end: section.endLine,
      text: body,
    });
    if (section.type === 'skills') {
      for (const skill of extractSkillsFromText(body)) skills.add(skill);
    }
    for (const item of section.lines) {
      const bullet = bulletText(item.text);
      if (bullet) {
        facts.push({
          id: `cv:${facts.length + 1}`,
          source: sourcePath,
          section: section.title,
          section_type: `${section.type}_bullet`,
          line_start: item.line,
          line_end: item.line,
          text: bullet,
        });
      }
    }
  }

  return {
    schema_version: 1,
    source: {
      path: sourcePath,
      ingested_at: new Date().toISOString(),
    },
    sections: sections
      .filter(section => section.type !== 'preamble' || section.lines.some(item => item.text.trim()))
      .map(({ title, type, startLine, endLine }) => ({ title, type, line_start: startLine, line_end: endLine })),
    facts,
    skills: [...skills].sort((a, b) => a.localeCompare(b)),
    safety: {
      source_of_truth: 'master_cv',
      original_cv_preserved: true,
      generation_rule: 'Generated content may use these facts only when paired with profile config and approved knowledge files.',
    },
  };
}

export function ingestMasterCv({ input = 'cv.md', output = 'data/generated/profile/master-cv.json' } = {}) {
  const cv = readMasterCv(input);
  const parsed = parseMasterCv(cv.text, cv.path);
  parsed.source.format = cv.format;
  parsed.source.extraction = cv.extraction;
  mkdirSync(dirname(resolve(output)), { recursive: true });
  writeFileSync(output, JSON.stringify(parsed, null, 2) + '\n');
  return parsed;
}

function main() {
  const args = process.argv.slice(2);
  let input = 'cv.md';
  let output = 'data/generated/profile/master-cv.json';
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--input' && args[i + 1]) input = args[++i];
    else if (args[i] === '--output' && args[i + 1]) output = args[++i];
    else if (args[i] === '--help' || args[i] === '-h') {
      console.log('Usage: node src/cv/master-cv.mjs --input cv.md --output data/generated/profile/master-cv.json');
      process.exit(0);
    }
  }
  const parsed = ingestMasterCv({ input, output });
  console.log(JSON.stringify({
    output,
    facts: parsed.facts.length,
    sections: parsed.sections.length,
    skills: parsed.skills.length,
  }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
