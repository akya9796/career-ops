import { pathToFileURL } from 'url';
import { runRefresh } from './refresh-pipeline.mjs';

async function main() {
  try {
    console.log(JSON.stringify(await runRefresh(), null, 2));
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
