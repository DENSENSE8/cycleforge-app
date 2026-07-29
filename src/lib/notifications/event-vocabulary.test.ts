import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { OPS_EVENT_ENTITY_TYPES } from '@/lib/ops-event-types';
import { ALL_PERMISSIONS } from '@/lib/auth/permissions-shared';
import {
  ENTITY_VIEW_PERMISSION,
  NOTIFIABLE_ENTITY_TYPES,
  NON_NOTIFIABLE_ENTITY_TYPES,
  NOTIFIABLE_EVENTS,
  buildCollapseKey,
  buildDedupKey,
  expandEventPattern,
  expandEventPatterns,
  isNotifiableEntityType,
} from './event-vocabulary';

const MIGRATION = join(
  process.cwd(),
  'src/lib/migrations/2026-07-28c_staff_subscriptions.sql',
);

test('entity vocabulary is a partition of OPS_EVENT_ENTITY_TYPES', () => {
  // Every ops entity type is either notifiable or explicitly skipped — no
  // silent third bucket, which is how a new event type would go undelivered.
  const covered = new Set<string>([...NOTIFIABLE_ENTITY_TYPES, ...NON_NOTIFIABLE_ENTITY_TYPES]);
  for (const t of OPS_EVENT_ENTITY_TYPES) {
    assert.ok(covered.has(t), `ops entity type '${t}' is neither notifiable nor documented-skipped`);
  }
  assert.equal(covered.size, OPS_EVENT_ENTITY_TYPES.length);
});

test('notifiable entity types match the DB CHECK byte-for-byte', () => {
  // Pins the code list against the migration's named CHECK. If someone adds a
  // value on one side only, this fails instead of silently dropping rows.
  const sql = readFileSync(MIGRATION, 'utf8');
  const match = sql.match(
    /staff_subscriptions_entity_type_chk\s+CHECK \(entity_type IS NULL OR entity_type IN \(([^)]+)\)\)/,
  );
  assert.ok(match, 'entity_type CHECK not found in the birth migration');
  const inDb = match[1]
    .split(',')
    .map((s) => s.trim().replace(/^'|'$/g, ''))
    .filter(Boolean)
    .sort();
  assert.deepEqual(inDb, [...NOTIFIABLE_ENTITY_TYPES].sort());
});

test('every notifiable entity type maps to a REGISTERED permission', () => {
  for (const t of NOTIFIABLE_ENTITY_TYPES) {
    const perm = ENTITY_VIEW_PERMISSION[t];
    assert.ok(perm, `${t} has no view permission`);
    // A typo'd permission id would silently deny every recipient forever.
    assert.ok(ALL_PERMISSIONS.has(perm), `${perm} is not in the permission registry`);
  }
});

test('every notifiable event names a notifiable entity type', () => {
  for (const def of Object.values(NOTIFIABLE_EVENTS)) {
    assert.ok(isNotifiableEntityType(def.entityType), `${def.key} → bad entityType`);
    if (def.collapseParent) {
      assert.ok(
        isNotifiableEntityType(def.collapseParent.entityType),
        `${def.key} → bad collapseParent`,
      );
    }
  }
});

test('expandEventPattern handles exact, prefix-wildcard and total-wildcard', () => {
  assert.deepEqual(expandEventPattern('receiving.carton.opened'), ['receiving.carton.opened']);
  assert.deepEqual(expandEventPattern('nope.not.real'), []);

  const lineKeys = expandEventPattern('receiving.line.*');
  assert.ok(lineKeys.includes('receiving.line.unboxed'));
  assert.ok(lineKeys.includes('receiving.line.exception'));
  assert.ok(!lineKeys.includes('receiving.carton.opened'), 'prefix must not over-match');

  assert.equal(expandEventPattern('*').length, Object.keys(NOTIFIABLE_EVENTS).length);
});

test('expandEventPatterns dedupes across overlapping patterns', () => {
  const keys = expandEventPatterns(['receiving.line.*', 'receiving.line.unboxed']);
  assert.equal(new Set(keys).size, keys.length);
  assert.ok(keys.includes('receiving.line.unboxed'));
});

test('a line event collapses onto its CARTON, not onto the line', () => {
  // This is the 200-line-PO fatigue guard: every line of one receive must fold
  // into a single inbox row per watcher.
  const a = buildCollapseKey({
    eventKey: 'receiving.line.unboxed',
    entityType: 'receiving_line',
    entityId: 111,
    payload: { receivingId: 4412 },
  });
  const b = buildCollapseKey({
    eventKey: 'receiving.line.unboxed',
    entityType: 'receiving_line',
    entityId: 222,
    payload: { receivingId: 4412 },
  });
  assert.equal(a, b, 'two lines of the same carton must share a collapse key');
  assert.equal(a, 'receiving:4412:unbox');
});

test('collapse falls back to the event entity when the parent id is missing', () => {
  const key = buildCollapseKey({
    eventKey: 'receiving.line.unboxed',
    entityType: 'receiving_line',
    entityId: 111,
    payload: {},
  });
  assert.equal(key, 'receiving_line:111:unbox');
});

test('different event families never collapse together', () => {
  const unbox = buildCollapseKey({
    eventKey: 'receiving.carton.opened',
    entityType: 'receiving',
    entityId: 7,
  });
  const delivery = buildCollapseKey({
    eventKey: 'receiving.carton.delivered',
    entityType: 'receiving',
    entityId: 7,
  });
  assert.notEqual(unbox, delivery);
});

test('dedup key prefers client_event_id and never collapses to a null-shaped key', () => {
  assert.equal(buildDedupKey({ clientEventId: 'abc', opsEventId: 9 }), 'ce:abc');
  // Server-originated events have a NULL client_event_id; falling back to the
  // ops_event id is what keeps them distinct instead of all colliding.
  assert.equal(buildDedupKey({ clientEventId: null, opsEventId: 9 }), 'oe:9');
  assert.notEqual(
    buildDedupKey({ clientEventId: null, opsEventId: 9 }),
    buildDedupKey({ clientEventId: null, opsEventId: 10 }),
  );
});
