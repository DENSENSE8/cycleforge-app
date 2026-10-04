import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DERIVED_ROOM_MAX_DEPTH,
  derivedRoomJoinSql,
  derivedRoomLabelSql,
  derivedRoomSetJoinSql,
  rackWalkOrderSql,
} from '@/lib/locations/derived-room';

test('derivedRoomJoinSql: walks parent_id org-scoped at every hop, depth-capped, exposes the room label', () => {
  const sql = derivedRoomJoinSql('l', 'droom');
  assert.match(sql, /^LEFT JOIN LATERAL \(/);
  assert.match(sql, /\) droom ON true$/);
  assert.match(sql, /p\.id = l\.id AND p\.organization_id = l\.organization_id/, 'seed row is the location itself, same org');
  assert.match(sql, /p\.id = up\.parent_id AND p\.organization_id = l\.organization_id/, 'every hop stays in the org');
  assert.ok(sql.includes(`up.depth < ${DERIVED_ROOM_MAX_DEPTH}`), 'a corrupted cycle cannot spin');
  assert.match(sql, /up\.location_kind <> 'ROOM'/, 'the walk stops at the nearest ROOM');
  assert.match(sql, /COALESCE\(NULLIF\(BTRIM\(up\.room\), ''\), BTRIM\(up\.name\)\) AS label/, "label is the ROOM row's own key");
  assert.match(sql, /WHERE up\.location_kind = 'ROOM'\s+ORDER BY up\.depth\s+LIMIT 1/);
});

test('derivedRoomSetJoinSql: one pass down from every ROOM, org-scoped hops, nearest room wins', () => {
  const sql = derivedRoomSetJoinSql('l', 'droom', '$1');
  assert.match(sql, /^LEFT JOIN \(/);
  assert.match(sql, /\) droom ON droom\.id = l\.id$/);
  assert.match(sql, /WHERE r\.location_kind = 'ROOM' AND r\.organization_id = \$1/, 'roots are this tenant’s rooms');
  assert.match(sql, /c\.parent_id = down\.id AND c\.organization_id = down\.organization_id/, 'every hop stays in the org');
  assert.match(sql, /c\.location_kind <> 'ROOM'/, 'a nested ROOM roots its own subtree');
  assert.ok(sql.includes(`down.depth < ${DERIVED_ROOM_MAX_DEPTH}`));
  assert.match(sql, /COALESCE\(NULLIF\(BTRIM\(r\.room\), ''\), BTRIM\(r\.name\)\) AS label/, 'same label as the lateral form');
  assert.doesNotMatch(derivedRoomSetJoinSql('l', 'droom'), /organization_id = \$/, 'unscoped legacy read has no org param');
  assert.throws(() => derivedRoomSetJoinSql('l', 'droom', "1 OR true"));
});

test('derivedRoomLabelSql: the derived room wins; legacy text only when no ROOM is reached', () => {
  assert.equal(derivedRoomLabelSql('l', 'room'), "COALESCE(room.label, NULLIF(BTRIM(l.room), ''))");
  assert.equal(derivedRoomLabelSql('loc', 'r2'), "COALESCE(r2.label, NULLIF(BTRIM(loc.room), ''))");
});

test('rackWalkOrderSql: rack, shelf, position numerically; NULL for non-RK barcodes', () => {
  const keys = rackWalkOrderSql('m.location_barcode').split(', ');
  assert.equal(keys.length, 3);
  for (const key of keys) {
    assert.match(key, /^substring\(m\.location_barcode from '\^RK.*'\)::int NULLS FIRST$/);
  }
  assert.ok(rackWalkOrderSql('barcode').startsWith('substring(barcode from'));
});

test('identifiers are never interpolated unchecked', () => {
  assert.throws(() => derivedRoomJoinSql('l; DROP TABLE x', 'room'));
  assert.throws(() => derivedRoomJoinSql('l', 'room r'));
  assert.throws(() => derivedRoomLabelSql('l', "x'"));
  assert.throws(() => rackWalkOrderSql('l.barcode DESC'));
  assert.throws(() => rackWalkOrderSql('a.b.c'));
});
