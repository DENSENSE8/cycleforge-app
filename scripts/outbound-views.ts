import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { OUTBOUND_SAVED_VIEWS } from '../src/lib/outbound/work-contract';

/**
 * The §3 saved outbound work views, published for clients that cannot import
 * the server contract (the Tauri shell, and later SwiftUI). Membership itself
 * is never published: it is a server rule in `work-projection.ts`, and a
 * client that reimplemented it would become a second authority over lifecycle
 * state. This artifact carries the catalog — ids, labels, and the plain-text
 * statement of the server rule — so an unpaired shell can render the same
 * controls in the same order without inventing one.
 */
const OUTPUT = 'docs/contracts/outbound-views.v1.json';
const artifact = `${JSON.stringify({ version: '1.0', views: OUTBOUND_SAVED_VIEWS }, null, 2)}\n`;

const mode = process.argv[2];
if (mode === '--json') {
  process.stdout.write(artifact);
} else if (mode === '--write') {
  mkdirSync(dirname(OUTPUT), { recursive: true });
  writeFileSync(OUTPUT, artifact);
  console.log(`V1 outbound view catalog written: ${OUTBOUND_SAVED_VIEWS.length} views.`);
} else if (mode === '--check') {
  if (readFileSync(OUTPUT, 'utf8') !== artifact) {
    throw new Error(`${OUTPUT} is stale; run pnpm exec tsx scripts/outbound-views.ts --write`);
  }
  console.log(`V1 outbound view catalog current: ${OUTBOUND_SAVED_VIEWS.length} views.`);
} else {
  throw new Error('Usage: tsx scripts/outbound-views.ts --check | --write | --json');
}
