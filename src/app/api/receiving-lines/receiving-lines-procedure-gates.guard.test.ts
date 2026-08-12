import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * The Unbox procedure's acknowledgement stamps must survive the whole wire.
 *
 * `normalizeRow` is a strict ALLOWLIST with no
 * passthrough: it builds a literal object field by field and drops everything
 * the SELECT returned that it does not name. That is a deliberate API contract,
 * and it is also a silent one — a column added to the builders but not to the
 * normalizer arrives at the client as `undefined`, which is indistinguishable
 * from "not acknowledged".
 *
 * Ownership: `src/lib/receiving/lines/normalize-row.ts` (imported by
 * `/api/receiving-lines`).
 *
 * All three of these shipped exactly that way. The write routes stamped the
 * columns, `build-sql.ts` selected them, `derive-capture-step-states.ts` read
 * them, and the `condition`, `contents` and `label` steps could never go done
 * because the value never crossed the wire. Nothing threw. Nothing 500'd. The
 * procedure pointer simply parked on a step forever, and every layer looked
 * correct in isolation — which is why this is a test and not a comment.
 *
 * A stamp is only real when every link holds, so assert every link:
 *   1. the list/by-id/by-receiving builders SELECT it, and
 *   2. `normalizeRow` names it.
 *
 * Extend the list when a new capture step gains a gate column. A gate with no
 * row here is a gate that can silently stop working.
 */

const ROOT = path.resolve(__dirname, '../../../..');
const NORMALIZE_ROW = path.join(ROOT, 'src/lib/receiving/lines/normalize-row.ts');
const BUILD_SQL = path.join(ROOT, 'src/lib/receiving/lines/build-sql.ts');

/** Gate columns read by `deriveCaptureStepFlags` / Unbox commit `stage` off the line row. */
const GATE_COLUMNS = [
  'condition_graded_at',
  'contents_confirmed_at',
  'label_previewed_at',
  'staged_at',
];

/** The three builders whose rows reach the client through `normalizeRow`. */
const BUILDER_COUNT = 3;

test('every procedure gate column is SELECTed by all three line builders', () => {
  const sql = readFileSync(BUILD_SQL, 'utf8');
  for (const col of GATE_COLUMNS) {
    // `staged_at` lives in the shared PUTAWAY_STAGED_SELECT_SQL fragment —
    // count fragment mounts, not expanded aliases (the source never inlines
    // `AS staged_at` three times).
    const hits =
      col === 'staged_at'
        ? sql.split('${PUTAWAY_STAGED_SELECT_SQL}').length - 1
        : sql.split(`AS ${col}`).length - 1;
    assert.equal(
      hits,
      BUILDER_COUNT,
      `${col}: expected ${BUILDER_COUNT} SELECT aliases in build-sql.ts, found ${hits}. ` +
        'A builder that omits it renders the step permanently un-completable on that view.',
    );
  }
  assert.equal(
    sql.split('${PUTAWAY_STAGED_JOIN_SQL}').length - 1,
    BUILDER_COUNT,
    'PUTAWAY_STAGED_JOIN_SQL must mount in every builder that selects staged_*',
  );
});

test('normalizeRow names every procedure gate column', () => {
  const normalizer = readFileSync(NORMALIZE_ROW, 'utf8');
  const start = normalizer.indexOf('function normalizeRow');
  assert.ok(start > 0, 'normalizeRow not found — did the normalizer move?');
  const body = normalizer.slice(start);

  for (const col of [...GATE_COLUMNS, 'staged_location_id']) {
    assert.ok(
      new RegExp(`^\\s*${col}\\s*:`, 'm').test(body),
      `${col} is missing from normalizeRow's allowlist. The column is SELECTed but ` +
        'dropped before the response, so the step it gates can never report done — ' +
        'silently, with no error anywhere.',
    );
  }
});
