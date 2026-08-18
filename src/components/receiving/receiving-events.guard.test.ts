import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, extname } from 'node:path';
import { test } from 'node:test';

/**
 * Guards the receiving cross-pane event bus (ratchet model from
 * surface-box-tokens.guard.test.ts).
 *
 * The receiving surface coordinates its sidebar / right pane / workspace through
 * a hand-wired window-CustomEvent bus. Untyped and one-shot, it silently drops
 * events when a listener mounts late (the Suspense race behind the Unbox
 * refresh-stickiness bug) and hides every producer/consumer edge behind a string
 * literal. The migration target routes durable selection through the URL,
 * volatile state through the TanStack Query cache, and the residual
 * fire-and-forget notifications through the TYPED bus:
 *
 *   - dispatch:   `emitReceiving(name, detail)`  (receiving-events.ts)
 *   - subscribe:  `useReceivingEvents({ … })`    (@/hooks/useReceivingEvents)
 *
 * So this guard RATCHETS: the count of RAW `new CustomEvent('receiving-…')` /
 * `addEventListener('receiving-…')` call sites outside the sanctioned bus
 * modules may only shrink. New receiving events go through the typed API; the
 * baseline drops as existing call sites migrate. Never raise it.
 *
 * A genuinely bus-external raw usage (a non-bus listener, a test harness) is
 * exempt with a same-line `receiving-bus-allow` comment. Use it sparingly.
 *
 * Set RECEIVING_BUS_LIST=1 to print the offending files (migration aid).
 */

const SRC_ROOT = join(process.cwd(), 'src');

// Shrink-only baseline. LOWER as call sites adopt emitReceiving /
// useReceivingEvents; never raise. 2026-07-21: armed at 94 after migrating the
// Unbox selection cluster (sidebar selection hook + dashboard + pane dispatch)
// off the raw bus (was 111).
const RAW_BUS_BASELINE = 84;

const ESCAPE_MARKER = 'receiving-bus-allow';
const LIST = process.env.RECEIVING_BUS_LIST === '1';

// The sanctioned bus modules — the ONLY place raw receiving CustomEvent
// construction / subscription is allowed to live.
const SANCTIONED = new Set([
  'utils/events.ts',
  'components/receiving/receiving-events.ts',
  'hooks/_events.ts',
  'hooks/useReceivingEvents.ts',
]);

const RAW_DISPATCH = /new CustomEvent\('receiving-/;
const RAW_LISTEN = /addEventListener\('receiving-/;

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (['.ts', '.tsx'].includes(extname(entry))) out.push(full);
  }
  return out;
}

function isCommentLine(line: string): boolean {
  const t = line.trimStart();
  return t.startsWith('//') || t.startsWith('*') || t.startsWith('/*');
}

const ALL_SOURCE_FILES = walk(SRC_ROOT);

test('raw receiving CustomEvent bus usage does not grow (ratchet toward the typed bus)', () => {
  let count = 0;
  const files: string[] = [];
  for (const file of ALL_SOURCE_FILES) {
    const rel = relative(SRC_ROOT, file).split('\\').join('/');
    if (SANCTIONED.has(rel) || rel.endsWith('.guard.test.ts')) continue;
    let fileCount = 0;
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      if (isCommentLine(line) || line.includes(ESCAPE_MARKER)) continue;
      if (RAW_DISPATCH.test(line) || RAW_LISTEN.test(line)) fileCount++;
    }
    if (fileCount > 0) {
      count += fileCount;
      files.push(`${rel} (${fileCount})`);
    }
  }

  if (LIST) {
    // eslint-disable-next-line no-console
    console.log(`\nraw receiving bus sites (${count}):\n${files.sort().join('\n')}`);
  }

  assert.ok(
    count <= RAW_BUS_BASELINE,
    `Raw receiving CustomEvent bus usage grew from ${RAW_BUS_BASELINE} to ${count}. ` +
      `New receiving events must use emitReceiving() / useReceivingEvents() ` +
      `(see receiving-events.ts). Run RECEIVING_BUS_LIST=1 to see offenders.`,
  );

  assert.ok(
    count >= RAW_BUS_BASELINE - 8,
    `Raw receiving bus usage dropped to ${count} — good. Lower RAW_BUS_BASELINE ` +
      `to ${count} in this guard so the ratchet holds the new floor.`,
  );
});
