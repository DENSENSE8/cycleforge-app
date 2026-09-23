import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import 'dotenv/config';
import pool from '@/lib/db';
import { commitWmsReroute } from '@/lib/packing/wms-reroute-adapter';
import type { OrgId } from '@/lib/tenancy/constants';

async function main(): Promise<void> {
  const client = await pool.connect();
  let began = false;
  try {
  await client.query('BEGIN');
  began = true;

  const fixture = await client.query<{
    organization_id: OrgId;
    order_id: number;
    staff_id: number;
    source_id: number;
    source_slot: string;
    destination_id: number;
    destination_slot: string;
    source_load: number;
    destination_load: number;
  }>(
    `SELECT p.organization_id, p.order_id, s.id AS staff_id,
            source.id AS source_id,
            COALESCE(NULLIF(BTRIM(source.barcode), ''), source.name) AS source_slot,
            destination.id AS destination_id,
            COALESCE(NULLIF(BTRIM(destination.barcode), ''), destination.name) AS destination_slot,
            (SELECT COUNT(*)::int FROM order_pack_placements x
              WHERE x.organization_id = p.organization_id AND x.location_id = source.id) AS source_load,
            (SELECT COUNT(*)::int FROM order_pack_placements x
              WHERE x.organization_id = p.organization_id AND x.location_id = destination.id) AS destination_load
       FROM order_pack_placements p
       JOIN locations source
         ON source.id = p.location_id AND source.organization_id = p.organization_id
       JOIN LATERAL (
         SELECT l.id, l.name, l.barcode
           FROM locations l
          WHERE l.organization_id = p.organization_id
            AND l.id <> source.id
            AND l.is_active = true
            AND l.location_kind = ANY($1::text[])
          ORDER BY l.sort_order, l.id
          LIMIT 1
       ) destination ON true
       JOIN LATERAL (
         SELECT staff.id
           FROM staff
          WHERE staff.organization_id = p.organization_id
          ORDER BY staff.id
          LIMIT 1
       ) s ON true
      ORDER BY p.id
      LIMIT 1`,
    [['DESK', 'STAGING']],
  );
  const row = fixture.rows[0];
  assert.ok(row, 'Live Neon needs one pack placement, another active pack location, and one staff actor.');

  await client.query("SELECT set_config('app.current_org', $1, true)", [row.organization_id]);
  await client.query(
    `UPDATE locations
        SET capacity = CASE id WHEN $2 THEN $4::int WHEN $3 THEN $5::int END
      WHERE organization_id = $1 AND id = ANY($6::int[])`,
    [
      row.organization_id,
      row.source_id,
      row.destination_id,
      Math.max(1, Number(row.source_load)),
      Number(row.destination_load) + 1,
      [row.source_id, row.destination_id],
    ],
  );

  const intent = {
    v: 1 as const,
    action: 'stage.reroute' as const,
    commandId: `neon-eval-${randomUUID()}`,
    signalId: `slot-full-eval-${randomUUID()}`,
    organizationId: row.organization_id,
    staffId: Number(row.staff_id),
    orderId: Number(row.order_id),
    quantity: 1,
    fromSlot: row.source_slot,
    toSlot: row.destination_slot,
    reason: 'slot_full' as const,
  };

  const committed = await commitWmsReroute(row.organization_id, intent, client);
  assert.equal(committed.status, 'committed');
  const replayed = await commitWmsReroute(row.organization_id, intent, client);
  assert.equal(replayed.status, 'replayed');
  assert.equal(replayed.mutationId, committed.mutationId);

  const current = await client.query<{ location_id: number }>(
    `SELECT location_id FROM order_pack_placements
      WHERE organization_id = $1 AND order_id = $2`,
    [row.organization_id, row.order_id],
  );
  assert.equal(Number(current.rows[0]?.location_id), Number(row.destination_id));

  console.log(JSON.stringify({
    status: 'pass',
    transaction: 'rolled-back',
    committed: committed.status,
    replayed: replayed.status,
    mutationIdStable: replayed.mutationId === committed.mutationId,
  }));
  } finally {
    if (began) await client.query('ROLLBACK').catch(() => {});
    client.release();
    await pool.end();
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
