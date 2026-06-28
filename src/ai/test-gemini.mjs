#!/usr/bin/env node

import { existsSync } from 'fs';
import { pathToFileURL } from 'url';
import { AIManager } from './ai-manager.mjs';
import { loadEnvFile, readAiConfig } from './ai-config.mjs';

function sanitize(message, secret) {
  return String(message || '').split(secret || '__no_secret__').join('[redacted]');
}

export async function testGeminiSetup({
  configPath = 'config/ai.yml',
  envPath = '.env.local',
  env = process.env,
  fetchImpl = fetch,
} = {}) {
  const checks = [];
  const pass = message => checks.push({ ok: true, message });
  const fail = message => {
    const err = new Error(message);
    err.checks = checks;
    throw err;
  };

  if (!existsSync(configPath)) fail('config/ai.yml not found.');
  pass('config/ai.yml exists.');

  const config = readAiConfig({ configPath });
  if (config.provider !== 'gemini') fail(`config/ai.yml provider must be gemini, found: ${config.provider || '(missing)'}.`);
  pass('provider is gemini.');

  loadEnvFile({ envPath, target: env });
  const envName = config.gemini?.api_key_env || 'GEMINI_API_KEY';
  const apiKey = env[envName];
  if (!apiKey) fail(`${envName} is missing. Add it to .env.local or the process environment.`);
  pass(`${envName} exists.`);

  const manager = new AIManager({ config, env, fetchImpl });
  let result;
  try {
    result = await manager.generate({
      systemPrompt: 'You are a terse connection test.',
      userPrompt: 'Reply with OK only.',
      input: { test: 'gemini_connection' },
      temperature: 0,
      maxOutputTokens: 16,
      timeoutMs: 30_000,
    });
  } catch (err) {
    fail(err.message);
  }
  if (!result.ok || !result.text.trim()) fail('Gemini API returned no usable text.');
  pass(`Gemini API connection works with ${result.model || config.gemini?.model || 'configured model'}.`);
  return { ok: true, checks };
}

async function main() {
  try {
    const result = await testGeminiSetup();
    for (const check of result.checks) console.log(`OK: ${check.message}`);
  } catch (err) {
    const apiKey = process.env.GEMINI_API_KEY || '';
    const checks = err.checks || [];
    for (const check of checks) console.log(`OK: ${check.message}`);
    console.error(`FAIL: ${sanitize(err.message, apiKey)}`);
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
