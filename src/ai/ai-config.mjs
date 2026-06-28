import { existsSync, readFileSync } from 'fs';

export function loadEnvFile({ envPath = '.env.local', target = process.env } = {}) {
  if (!existsSync(envPath)) return target;
  for (const line of readFileSync(envPath, 'utf-8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    if (target[match[1]] === undefined) target[match[1]] = match[2].replace(/^["']|["']$/g, '');
  }
  return target;
}

function coerceValue(value) {
  const text = String(value || '').replace(/^["']|["']$/g, '').trim();
  if (text === 'true') return true;
  if (text === 'false') return false;
  return text;
}

export function parseAiConfig(raw = '') {
  const config = {};
  let section = null;
  for (const line of String(raw || '').split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const sectionMatch = line.match(/^([A-Za-z0-9_]+):\s*$/);
    if (sectionMatch) {
      section = sectionMatch[1];
      config[section] ||= {};
      continue;
    }
    const topMatch = line.match(/^([A-Za-z0-9_]+):\s*(.+?)\s*$/);
    if (topMatch && !line.startsWith(' ')) {
      config[topMatch[1]] = coerceValue(topMatch[2]);
      section = null;
      continue;
    }
    const nested = line.match(/^\s+([A-Za-z0-9_]+):\s*(.*?)\s*$/);
    if (nested && section) {
      config[section] ||= {};
      config[section][nested[1]] = coerceValue(nested[2]);
    }
  }
  return config;
}

export function readAiConfig({ configPath = 'config/ai.yml' } = {}) {
  const raw = existsSync(configPath) ? readFileSync(configPath, 'utf-8') : '';
  const config = parseAiConfig(raw);
  config.provider ||= 'gemini';
  return config;
}
