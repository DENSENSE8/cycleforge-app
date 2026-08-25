/** Run: node --import tsx --test src/lib/keyboard/find-field-scan.test.ts */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FIND_FIELD_BURST_IDLE,
  appendFindFieldKey,
  resolveFindFieldScan,
} from '@/lib/keyboard/find-field-scan';
import { WEDGE_MAX_INTER_KEY_MS } from '@/lib/keyboard/wedge-scan-machine';

/** Type a string at a fixed inter-key gap, as a wedge or a human would. */
function type(value: string, gapMs: number) {
  let state = FIND_FIELD_BURST_IDLE;
  let t = 0;
  for (const ch of value) {
    state = appendFindFieldKey(state, ch, t);
    t += gapMs;
  }
  return state;
}

const WEDGE_GAP = 5;
const HUMAN_GAP = WEDGE_MAX_INTER_KEY_MS + 40;

test('a machine-fast burst of a printed handle is claimed', () => {
  const scan = resolveFindFieldScan(type('R-1234', WEDGE_GAP));
  assert.equal(scan.kind, 'handle');
  if (scan.kind === 'handle') {
    assert.equal(scan.route.type, 'receiving');
    assert.equal(scan.raw, 'R-1234');
  }
});

test('a HUMAN typing the same characters is never claimed', () => {
  // The whole safety argument: at human speed every gap exceeds the wedge
  // ceiling, so the run restarts each keystroke and can never reach minLength.
  const state = type('R-1234', HUMAN_GAP);
  assert.equal(state.buffer.length, 1);
  assert.deepEqual(resolveFindFieldScan(state), { kind: 'find' });
});

test('ordinary find text stays the field\'s own job', () => {
  for (const raw of ['Dell Latitude 7420', 'HP-PSU-450', 'CN1A2B3XYZ']) {
    assert.deepEqual(resolveFindFieldScan(type(raw, WEDGE_GAP)), { kind: 'find' }, raw);
  }
});

test('a carrier TRACKING number resolves to find, not handle', () => {
  // `routeScan` has no carrier vocabulary, so the honest client answer is
  // "text for your query". Tracking needs the server arm.
  for (const raw of ['1Z999AA10123456784', '9400111899223197428490']) {
    assert.deepEqual(resolveFindFieldScan(type(raw, WEDGE_GAP)), { kind: 'find' }, raw);
  }
});

test('a burst under the wedge minimum is never claimed', () => {
  // `WEDGE_MIN_LENGTH` is 3, and `R-1` is a REAL carton handle (receiving_id 1)
  // — so the short case has to be genuinely shorter than the floor, not merely
  // short-looking.
  assert.deepEqual(resolveFindFieldScan({ buffer: 'R-', lastKeyAt: 1 }), { kind: 'find' });
  assert.equal(resolveFindFieldScan({ buffer: 'R-1', lastKeyAt: 1 }).kind, 'handle');
});

test('a non-character key resets the run', () => {
  const state = appendFindFieldKey(type('R-123', WEDGE_GAP), 'Shift', 99);
  assert.deepEqual(state, FIND_FIELD_BURST_IDLE);
});

// ── Wiring contract ────────────────────────────────────────────────────────
// The adapter itself (`src/hooks/useFindFieldScan.ts`) is guarded by MOUNTED
// DOM tests beside it (`useFindFieldScan.test.ts`): capture binding, the
// single claimed preventDefault, off-stack side effects and the paste
// short-circuit are all asserted as behaviour there. Three source-text guards
// stood here while the adapter did not exist; they were deleted 2026-08-23
// when it landed (X1 — a regex over source pins a shape, not a behaviour).
// The two checks below survive because they guard OTHER modules' contracts
// this feature composes and must never loosen.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

test('the GLOBAL wedge keeps its editable bail — this is opt-in, not a loosening', () => {
  // The reducer's editable reset is the law that makes a field own its own keys.
  // This work adds a second, field-scoped path; it must never relax the first.
  assert.match(read('src/lib/keyboard/wedge-scan-machine.ts'), /if \(event\.editable\) \{/);
});

test('the guess-vs-decode rule has ONE home, and callers compose it', () => {
  // Four separate live defects came from `if (routeScan(v))` — which is always
  // true. `decodedHandle` is that rule; these three compose it rather than
  // re-deriving the redirect test.
  assert.match(read('src/lib/barcode-routing.ts'), /export function decodedHandle/);
  for (const path of [
    'src/lib/station-scan-routing.ts',
    'src/lib/receiving/history-command-scan.ts',
    'src/lib/keyboard/find-field-scan.ts',
  ]) {
    assert.match(read(path), /decodedHandle/, path);
  }
});
