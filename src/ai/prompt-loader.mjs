import { existsSync, readFileSync } from 'fs';
import { join, resolve } from 'path';

export function loadPrompt(name, { promptsDir = 'prompts' } = {}) {
  const safe = String(name || '').replace(/[^a-z0-9_-]+/gi, '-').replace(/^-|-$/g, '');
  if (!safe) throw new Error('Prompt name is required.');
  const path = resolve(join(promptsDir, `${safe}.md`));
  const root = resolve(promptsDir);
  if (!(path === root || path.startsWith(`${root}\\`) || path.startsWith(`${root}/`))) throw new Error(`Unsafe prompt path: ${name}`);
  if (!existsSync(path)) throw new Error(`Prompt not found: ${path}`);
  return { name: safe, path, text: readFileSync(path, 'utf-8').trim() };
}

export function buildPromptInput({ systemPrompt = '', userPrompt = '', input = {} } = {}) {
  return [
    systemPrompt && `SYSTEM PROMPT:\n${systemPrompt}`,
    userPrompt && `USER PROMPT:\n${userPrompt}`,
    `STRUCTURED JSON INPUT:\n${JSON.stringify(input, null, 2)}`,
  ].filter(Boolean).join('\n\n');
}
