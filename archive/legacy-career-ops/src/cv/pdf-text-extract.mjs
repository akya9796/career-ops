import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, resolve } from 'path';
import { inflateSync } from 'zlib';
import { pathToFileURL } from 'url';

function decodePdfString(raw) {
  let out = '';
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (ch !== '\\') {
      out += ch;
      continue;
    }
    const next = raw[++i];
    if (next === 'n') out += '\n';
    else if (next === 'r') out += '\r';
    else if (next === 't') out += '\t';
    else if (next === 'b') out += '\b';
    else if (next === 'f') out += '\f';
    else if (next === '(' || next === ')' || next === '\\') out += next;
    else if (/[0-7]/.test(next || '')) {
      let oct = next;
      for (let j = 0; j < 2 && /[0-7]/.test(raw[i + 1] || ''); j++) oct += raw[++i];
      out += String.fromCharCode(parseInt(oct, 8));
    } else if (next) {
      out += next;
    }
  }
  return out;
}

function decodeHexString(hex) {
  const cleaned = hex.replace(/\s+/g, '');
  let out = '';
  for (let i = 0; i < cleaned.length - 1; i += 2) {
    const code = parseInt(cleaned.slice(i, i + 2), 16);
    if (Number.isFinite(code) && code > 0) out += String.fromCharCode(code);
  }
  return out;
}

function extractTextOperators(streamText) {
  const chunks = [];
  const textObjectRe = /BT([\s\S]*?)ET/g;
  let objMatch;
  while ((objMatch = textObjectRe.exec(streamText))) {
    const body = objMatch[1];
    const tokenRe = /\((?:\\.|[^\\)])*\)\s*Tj|<([0-9A-Fa-f\s]+)>\s*Tj|\[((?:.|\n)*?)\]\s*TJ|(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+Td|T\*/g;
    let match;
    while ((match = tokenRe.exec(body))) {
      const token = match[0];
      if (token.endsWith('Tj')) {
        if (token.trim().startsWith('<')) chunks.push(decodeHexString(match[1] || ''));
        else {
          const stringMatch = token.match(/\(([\s\S]*)\)\s*Tj$/);
          if (stringMatch) chunks.push(decodePdfString(stringMatch[1]));
        }
      } else if (token.endsWith('TJ')) {
        const arr = match[3] || '';
        const parts = [];
        const strRe = /\((?:\\.|[^\\)])*\)|<([0-9A-Fa-f\s]+)>/g;
        let part;
        while ((part = strRe.exec(arr))) {
          if (part[0].startsWith('<')) parts.push(decodeHexString(part[1] || ''));
          else parts.push(decodePdfString(part[0].slice(1, -1)));
        }
        chunks.push(parts.join(''));
      } else {
        chunks.push('\n');
      }
    }
  }
  return chunks.join(' ');
}

export function extractPdfText(inputPath) {
  const buffer = readFileSync(inputPath);
  const latin = buffer.toString('latin1');
  const texts = [];
  const streamRe = /<<(?:.|\n|\r)*?>>\s*stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let match;
  while ((match = streamRe.exec(latin))) {
    const dictStart = latin.lastIndexOf('<<', match.index);
    const dict = latin.slice(dictStart, match.index);
    const rawStart = match.index + match[0].indexOf(match[1]);
    const rawEnd = rawStart + match[1].length;
    const raw = buffer.subarray(rawStart, rawEnd);
    let stream = null;
    if (/\/FlateDecode/.test(dict)) {
      try {
        stream = inflateSync(raw).toString('latin1');
      } catch {
        stream = null;
      }
    } else {
      stream = raw.toString('latin1');
    }
    if (!stream) continue;
    const text = extractTextOperators(stream);
    if (text.trim()) texts.push(text);
  }
  return texts
    .join('\n')
    .replace(/\s+\n/g, '\n')
    .replace(/\n\s+/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function main() {
  const [input, output = 'data/generated/pdf-extract.txt'] = process.argv.slice(2);
  if (!input) {
    console.error('Usage: node src/cv/pdf-text-extract.mjs <input.pdf> [output.txt]');
    process.exit(1);
  }
  const text = extractPdfText(input);
  mkdirSync(dirname(resolve(output)), { recursive: true });
  writeFileSync(output, text + '\n');
  console.log(JSON.stringify({ output, characters: text.length }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}

