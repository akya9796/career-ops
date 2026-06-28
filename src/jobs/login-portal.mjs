#!/usr/bin/env node

import { pathToFileURL } from 'url';
import { authenticatedSourceBlocks } from './discover-jobs.mjs';
import { sessionPathForSource, withAuthenticatedPage } from './portal-auth.mjs';

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? '' : process.argv[index + 1] || '';
}

export async function loginPortal({ sourceId, portalsPath = 'config/portals.yml' } = {}) {
  if (!sourceId) throw new Error('Provide --source <source-id>.');
  const source = authenticatedSourceBlocks(portalsPath).find(item => item.id === sourceId);
  if (!source) throw new Error(`No authenticated source found for: ${sourceId}`);
  if (!source.login_required) throw new Error(`${sourceId} is not configured as login_required.`);
  await withAuthenticatedPage(source, async () => null, { headless: false, manual: true });
  return { source: sourceId, session_state: sessionPathForSource(sourceId), password_stored: false };
}

async function main() {
  try {
    const result = await loginPortal({
      sourceId: argValue('--source'),
      portalsPath: argValue('--portals') || 'config/portals.yml',
    });
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
