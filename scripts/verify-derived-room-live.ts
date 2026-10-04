/**
 * Read-only live check: for every active BIN row, the room readers now derive
 * (`derivedRoomLabelSql` — nearest ROOM up `parent_id`, legacy text only when
 * no ROOM is reached) equals the legacy `locations.room` text, and the set
 * form readers join (`derivedRoomSetJoinSql`) agrees with the per-row walk
 * (`derivedRoomJoinSql`) for every row of every kind. Proves that migrating a
 * reader to the derived room changes nothing for existing bins.
 *
 * Runs inside `BEGIN READ ONLY … ROLLBACK`; writes nothing.
 *   npm run verify:derived-room
 */
import assert from 'node:assert/strict';
import 'dotenv/config';
import pool from '@/lib/db';
import {
  derivedRoomJoinSql,
  derivedRoomLabelSql,
  derivedRoomSetJoinSql,
} from '@/lib/locations/derived-room';

async function main(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN READ ONLY');
    const res = await client.query<{
      location_kind: string;
      total: number;
      no_room_ancestor: number;
      mismatches: number;
      set_vs_walk: number;
    }>(
      `SELECT l.location_kind,
              COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE room.id IS NULL)::int AS no_room_ancestor,
              COUNT(*) FILTER (
                WHERE ${derivedRoomLabelSql('l', 'room')} IS DISTINCT FROM NULLIF(BTRIM(l.room), '')
              )::int AS mismatches,
              COUNT(*) FILTER (
                WHERE ${derivedRoomLabelSql('l', 'room')} IS DISTINCT FROM ${derivedRoomLabelSql('l', 'rset')}
                   OR room.id IS DISTINCT FROM rset.room_id
              )::int AS set_vs_walk
         FROM locations l
         ${derivedRoomJoinSql('l', 'room')}
         ${derivedRoomSetJoinSql('l', 'rset')}
        WHERE l.is_active = true
        GROUP BY l.location_kind
        ORDER BY l.location_kind`,
    );
    for (const r of res.rows) {
      console.log(
        `${r.location_kind}: total=${r.total} no_room_ancestor=${r.no_room_ancestor} mismatches=${r.mismatches} set_vs_walk=${r.set_vs_walk}`,
      );
    }
    const bin = res.rows.find((r) => r.location_kind === 'BIN');
    assert.ok(bin, 'no active BIN rows to compare');
    assert.equal(bin.mismatches, 0, 'derived room differs from legacy room text for active BIN rows');
    for (const r of res.rows) assert.equal(r.set_vs_walk, 0, `set and per-row derived rooms disagree for ${r.location_kind}`);
    console.log('ok — derived room equals legacy room text for every active BIN row; set form equals per-row walk');
  } finally {
    await client.query('ROLLBACK').catch(() => undefined);
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
