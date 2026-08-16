/**
 * Guard: procedure-gate writes are never fire-and-forget.
 *
 * ## What this exists to stop
 *
 * The Unbox capture steps settle off durable stamps (`condition_graded_at`,
 * `label_printed_at`, `serial_absent`, and their per-unit twins). Until
 * 2026-08-16, nine writes to those columns were spelled
 * `void fetch(...).catch(() => {})` — the response was never inspected, so a
 * 403 / RLS rejection / dropped connection advanced the operator's step gate on
 * a fact the database never recorded, with no toast, no log, and no console
 * warning. It is the only failure shape on this bench that produces wrong data
 * with **no signal at all**.
 *
 * Nothing forbade the pattern, which is why it reached nine sites. This guard
 * is the forbidding. `.claude/rules/pattern-evolution.md` §6: a retirement is
 * not done until the old path is deleted or a guard names the exact surviving
 * call sites — and the allowlist below is shrink-only, so finishing a migration
 * removes a line and nothing may add one.
 *
 * Run: node --test --import tsx \
 *        src/components/receiving/workspace/receiving-gate-write.guard.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describeGateWriteFailure } from './receiving-gate-write';

function sourceOf(relative: string): string {
  return readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8');
}

/**
 * Strip comments before scanning — this guard's own docblock quotes the banned
 * pattern verbatim, and so do the modules it protects.
 */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

const WAIST = code(sourceOf('./receiving-gate-write.ts'));
const HELPERS = code(sourceOf('./receiving-label-helpers.tsx'));
const CONDITION = code(sourceOf('./patch-receiving-line-condition.ts'));
const UNITS_EXPLOSION = code(sourceOf('./UnitsExplosionDisplay.tsx'));

// ---------------------------------------------------------------------------
// 1. The failure copy is operator-usable (behavioural, not a source grep)
// ---------------------------------------------------------------------------

/** Every branch must point at something the operator can actually do next. */
const ACTIONABLE = /retry|sign in|ask an admin|reopen|check the bench|report it/i;

const STATUSES: ReadonlyArray<number | null> = [null, 401, 403, 404, 409, 400, 422, 500, 503];

test('every failure states the fact was NOT saved, in the title', () => {
  for (const status of STATUSES) {
    const { title } = describeGateWriteFailure('Condition grade', status, null);
    assert.equal(
      title,
      'Condition grade not saved',
      `status ${status}: the title must carry the not-saved fact — an operator ` +
        'who only reads the title still has to learn the durable value diverged',
    );
  }
});

test('every failure names a next step in the description', () => {
  for (const status of STATUSES) {
    const { description } = describeGateWriteFailure('Print record', status, null);
    assert.match(
      description,
      ACTIONABLE,
      `status ${status} produced non-actionable copy: ${JSON.stringify(description)}`,
    );
  }
});

test('a dropped request is distinguished from any server answer', () => {
  const offline = describeGateWriteFailure('Condition grade', null, null);
  const server = describeGateWriteFailure('Condition grade', 500, null);
  assert.notEqual(
    offline.description,
    server.description,
    'offline and server-error need different remedies — collapsing them sends ' +
      'the operator to the wrong fix',
  );
  assert.match(offline.description, /connection/i);
});

test('permission and session failures name their own distinct remedy', () => {
  assert.match(describeGateWriteFailure('X', 401, null).description, /sign in/i);
  assert.match(describeGateWriteFailure('X', 403, null).description, /admin/i);
  assert.match(describeGateWriteFailure('X', 404, null).description, /reopen the carton/i);
  assert.match(describeGateWriteFailure('X', 409, null).description, /changed it first/i);
});

test("the server's own reason is surfaced on a 4xx, not discarded", () => {
  const { description } = describeGateWriteFailure(
    'Condition grade',
    400,
    'condition_grade must be one of: A, B, C',
  );
  assert.match(description, /must be one of/);
});

test('a bare INTERNAL code never reaches the operator', () => {
  // readServerMessage drops `error: 'INTERNAL'`; if it ever leaked through as a
  // message, this asserts the 5xx branch still reads as prose rather than a code.
  const { description } = describeGateWriteFailure('X', 500, null);
  assert.doesNotMatch(description, /INTERNAL/);
  assert.match(description, /server error/i);
});

// ---------------------------------------------------------------------------
// 2. The waist is the only fetch in the gate-write path
// ---------------------------------------------------------------------------

test('the waist inspects the response and never swallows the fetch', () => {
  assert.match(WAIST, /export function persistGateWrite/);
  assert.match(WAIST, /export function persistGateWriteBatch/);
  assert.match(WAIST, /export function describeGateWriteFailure/);
  // The whole point: the status is read.
  assert.match(WAIST, /if \(res\.ok\) return;/);
  assert.doesNotMatch(
    WAIST,
    /fetch\([^)]*\)\s*\.catch\(\(\)\s*=>\s*\{\}\)/,
    'the waist must not swallow its own fetch',
  );
});

test('gate helpers route every durable write through the waist', () => {
  assert.match(HELPERS, /persistGateWrite|persistGateWriteBatch/);
  assert.match(CONDITION, /persistGateWrite\(/);
  for (const [name, src] of [
    ['receiving-label-helpers.tsx', HELPERS],
    ['patch-receiving-line-condition.ts', CONDITION],
  ] as const) {
    assert.doesNotMatch(
      src,
      /\bfetch\(/,
      `${name} must not call fetch directly — gate writes go through persistGateWrite ` +
        'so the result is inspected and the optimistic patch can be reverted',
    );
  }
});

test('every persistGateWrite call supplies both apply and revert', () => {
  // An optimistic patch with no undo is the half-fix: the operator learns it
  // failed but the step gate stays settled on the value the server rejected.
  const calls = [...HELPERS.matchAll(/persistGateWrite(?:Batch)?<?[^(]*\(\{/g)];
  assert.ok(calls.length >= 7, `expected the 7 gate helpers to use the waist, saw ${calls.length}`);
  const applyCount = (HELPERS.match(/\bapply:/g) ?? []).length;
  const revertCount = (HELPERS.match(/\brevert:/g) ?? []).length;
  assert.equal(
    applyCount,
    revertCount,
    'every apply: needs a matching revert: — an unmatched pair means one helper ' +
      'paints an optimistic value it cannot undo',
  );
  assert.equal(applyCount, calls.length, 'each waist call needs exactly one apply/revert pair');
});

test('batch writes revert only the items that failed', () => {
  // Reverting the whole set on a partial failure is as wrong as reverting none:
  // the successes are durable, so a blanket revert desyncs the other way.
  assert.match(WAIST, /revert: \(failed: readonly T\[\]\) => void/);
  assert.match(WAIST, /revert\(failed\)/);
  const failedIdSets = (HELPERS.match(/failedIds\s*=\s*new Set/g) ?? []).length;
  assert.equal(failedIdSets, 3, 'all three batch helpers must scope their revert by failed id');
});

test('the line-level snapshot is a required parameter, never defaulted', () => {
  // A defaulted snapshot is a silent opt-out at every call site nobody visited
  // (.claude/rules/backend-patterns.md → "a safety classification is a REQUIRED
  // parameter"). Required turns a missed call site into a compile error.
  assert.match(CONDITION, /previous: PreviousLineCondition,?\s*\)/);
  assert.doesNotMatch(CONDITION, /previous[^)]*=\s*\{/, 'previous must have no default');
  assert.match(HELPERS, /previousPrintedAt: string \| null,?\s*\)/);
  assert.match(
    HELPERS,
    /previous: \{ serial_absent: boolean; serial_absent_reason: string \| null \}/,
  );
});

test('the condition gate has exactly one writer', () => {
  // UnitsExplosionDisplay used to PATCH /condition itself (swallowed), and used
  // the generic c.patch for the set path — which never stamps condition_graded_at,
  // so the Condition step could not settle from that surface at all.
  assert.match(UNITS_EXPLOSION, /patchReceivingLineCondition\(/);
  assert.doesNotMatch(
    UNITS_EXPLOSION,
    /fetch\(`\/api\/receiving\/lines\/\$\{[^}]+\}\/condition`/,
    'the condition gate is written only by patchReceivingLineCondition',
  );
});

// ---------------------------------------------------------------------------
// 3. Shrink-only ratchet on the swallowed-fetch pattern
// ---------------------------------------------------------------------------

const ROOTS = ['../../receiving', '../../station'] as const;

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

/**
 * Does this file discard a fetch rejection?
 *
 * Line-anchored on purpose. A regex spanning `fetch(` … `.catch(...)` is lazy
 * but still crosses statement boundaries, so it pairs a fetch on one line with
 * an unrelated `res.json().catch(() => null)` further down and reports the whole
 * tree. The marker is the swallowing `.catch` itself; a `.json()` on the same
 * line is the benign defensive parse, and a `fetch(` in the preceding few lines
 * is what makes the discarded rejection a lost write rather than a lost promise.
 */
function swallowsFetch(src: string): boolean {
  const lines = src.split('\n');
  return lines.some((line, i) => {
    if (!/\.catch\(\(\)\s*=>\s*(\{\}|undefined|null)\)/.test(line)) return false;
    if (/\.json\(\)/.test(line)) return false; // defensive parse, not a swallow
    const window = lines.slice(Math.max(0, i - 12), i + 1).join('\n');
    return /\bfetch\(/.test(window);
  });
}

/**
 * Files that may still swallow a fetch, each with the reason it is tolerable.
 * **Shrink-only.** Fixing one removes a line; nothing may add one.
 *
 * `res.json().catch(() => null)` is NOT this pattern — that is a defensive parse
 * of a response whose status is about to be inspected, and it is correct.
 */
const SWALLOWED_FETCH_ALLOWLIST: ReadonlyMap<string, string> = new Map([
  [
    'workspace/line-edit/hooks/useSourcePlatform.ts',
    'GET that only refines an already-seeded display value — a failed read leaves ' +
      'the seeded platform, which is the correct fallback, and writes nothing.',
  ],
  [
    'workspace/ReceivingLineWorkspace.tsx',
    'view telemetry (`/receiving-lines/view`) — genuinely fire-and-forget: a lost ' +
      'view stamp costs a Recent-rail entry, not operator-visible state.',
  ],
  [
    'PreboxWizard.tsx',
    'label-print job POST. NOT harmless — a swallowed failure means the labels ' +
      'never print while the toast says they are. Out of scope for the gate-write ' +
      'pass (not a procedure gate); next candidate to migrate.',
  ],
]);

test('no new swallowed fetches in the receiving / station trees', () => {
  const offenders: string[] = [];
  for (const root of ROOTS) {
    const dir = fileURLToPath(new URL(root, import.meta.url));
    for (const file of walk(dir)) {
      if (!swallowsFetch(code(readFileSync(file, 'utf8')))) continue;
      const rel = file.replace(/\\/g, '/').replace(/^.*\/components\/(receiving|station)\//, '');
      if (!SWALLOWED_FETCH_ALLOWLIST.has(rel)) offenders.push(rel);
    }
  }
  assert.deepEqual(
    offenders,
    [],
    'A fetch whose rejection is discarded cannot tell the operator the write did ' +
      'not land. Route durable writes through persistGateWrite; if the call is ' +
      'genuinely fire-and-forget, add it to SWALLOWED_FETCH_ALLOWLIST with a reason.',
  );
});

test('the swallowed-fetch allowlist only shrinks', () => {
  assert.ok(
    SWALLOWED_FETCH_ALLOWLIST.size <= 3,
    `allowlist grew to ${SWALLOWED_FETCH_ALLOWLIST.size} — it is shrink-only; ` +
      'migrate the call to persistGateWrite instead of adding an entry',
  );
  for (const [file, reason] of SWALLOWED_FETCH_ALLOWLIST) {
    assert.ok(reason.length > 40, `${file}: allowlist entries need a real reason`);
  }
});
