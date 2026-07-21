// READ-ONLY acceptance probe for WS-JOURNEY. Finds a representative shipped
// serial that traversed the loop and tallies which spines/hops have data, to
// fill the gap ledger in docs/todo/journey-hop-emitters-plan.md. No writes.
import pg from 'pg';

const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!url) { console.error('no DATABASE_URL'); process.exit(1); }
const c = new pg.Client({ connectionString: url });
await c.connect();

const q = (s, p = []) => c.query(s, p).then((r) => r.rows);

// 1. Pick a shipped serial_unit: has an order allocation whose order has a shipment.
const picks = await q(`
  SELECT su.id AS serial_unit_id, su.serial_number, su.organization_id,
         o.id AS order_id, o.order_id AS order_number, o.shipment_id
    FROM serial_units su
    JOIN order_unit_allocations oua
      ON oua.serial_unit_id = su.id AND oua.organization_id = su.organization_id
    JOIN orders o
      ON o.id = oua.order_id AND o.organization_id = su.organization_id
   WHERE o.shipment_id IS NOT NULL
   ORDER BY oua.allocated_at DESC NULLS LAST
   LIMIT 5`);

if (picks.length === 0) {
  console.log('NO shipped+allocated serial found — cannot probe hop completeness.');
  process.exit(0);
}

console.log(`Sampled ${picks.length} shipped serials; detail on the newest:\n`);

for (const p of picks) {
  const evts = await q(
    `SELECT event_type, count(*)::int n, count(bin_id)::int with_bin
       FROM inventory_events WHERE serial_unit_id = $1 GROUP BY event_type ORDER BY event_type`,
    [p.serial_unit_id],
  );
  const sal = await q(
    `SELECT count(*)::int n FROM station_activity_logs WHERE tech_serial_number_id = $1`,
    [p.serial_unit_id],
  ).catch(() => [{ n: 'n/a' }]);
  const tickets = await q(
    `SELECT count(*)::int n FROM ticket_links WHERE entity_type = 'SERIAL_UNIT' AND entity_id = $1`,
    [p.serial_unit_id],
  ).catch(() => [{ n: 'n/a (table/col mismatch)' }]);
  const trk = p.shipment_id
    ? await q(`SELECT count(*)::int n FROM shipping_tracking_numbers WHERE id = $1`, [p.shipment_id])
    : [{ n: 0 }];

  console.log(`serial_unit_id=${p.serial_unit_id} serial=${p.serial_number} order=${p.order_number} shipment=${p.shipment_id}`);
  console.log('  inventory_events by type:', evts.map((e) => `${e.event_type}×${e.n}${e.with_bin ? ` (bin:${e.with_bin})` : ''}`).join(', ') || '(none)');
  console.log(`  station_activity_logs (tech_serial): ${sal[0].n}`);
  console.log(`  ticket_links(SERIAL_UNIT): ${tickets[0].n}   carrier tracking rows: ${trk[0].n}`);
  console.log('');
}

// 2. Aggregate: how often does each lifecycle hop appear across recent shipped units, and how often with a bin?
const agg = await q(`
  WITH shipped AS (
    SELECT DISTINCT su.id
      FROM serial_units su
      JOIN order_unit_allocations oua ON oua.serial_unit_id = su.id
      JOIN orders o ON o.id = oua.order_id AND o.shipment_id IS NOT NULL
     ORDER BY su.id DESC LIMIT 200)
  SELECT ie.event_type,
         count(DISTINCT ie.serial_unit_id)::int units,
         count(*)::int rows,
         count(ie.bin_id)::int rows_with_bin
    FROM inventory_events ie JOIN shipped s ON s.id = ie.serial_unit_id
   GROUP BY ie.event_type ORDER BY units DESC`);
console.log('Across up to 200 recent shipped units — hop presence (event_type → distinct units, rows, rows_with_bin):');
for (const r of agg) console.log(`  ${r.event_type.padEnd(22)} units=${r.units}  rows=${r.rows}  bin=${r.rows_with_bin}`);

await c.end();
