/**
 * Backfill `shipping_tracking_numbers.carrier` from the one pattern list.
 *
 *   node --import tsx scripts/backfill-carrier-detection.mts            # dry run
 *   node --import tsx scripts/backfill-carrier-detection.mts --apply
 *   node --import tsx scripts/backfill-carrier-detection.mts --conflicts
 *
 * Why a script and not a migration: the detector is TypeScript
 * (`@/utils/carrier-patterns`, shared with the scan resolver). Re-expressing
 * those regexes in SQL would create a SECOND detector that drifts from the
 * first — the exact failure this whole effort is removing. So the decision is
 * made in one place and the script only writes the result.
 *
 * What it touches: ONLY rows whose stored carrier is absent/`UNKNOWN` while the
 * pattern list names a carrier. Those rows are unpollable today, so naming them
 * can only add signal.
 *
 * What it refuses to touch: a row where stored and detected DISAGREE. That is a
 * judgment call (an operator's claim vs a barcode shape) and silently picking a
 * side is how a shipment spends months 404ing. `--conflicts` lists them for a
 * human.
 *
 * Re-runnable: the predicate is the deviation itself.
 */

import { Client } from 'pg';
import { resolveStoredCarrier, UNKNOWN_CARRIER } from '../src/lib/shipping/carrier-resolution';
import { isCarrierSyncEnabled } from '../src/lib/shipping/enabled-carriers';

interface Row {
  id: number;
  raw: string;
  normalized: string;
  carrier: string | null;
}

const apply = process.argv.includes('--apply');
const showConflicts = process.argv.includes('--conflicts');

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL is not set. Source the lane env first.');
  process.exit(1);
}

const client = new Client({ connectionString });
await client.connect();

const { rows } = await client.query<Row>(
  `SELECT id,
          tracking_number_raw        AS raw,
          tracking_number_normalized AS normalized,
          carrier
     FROM shipping_tracking_numbers`,
);

const namable: Array<{ id: number; from: string; to: string; raw: string }> = [];
const conflicts: Array<{ id: number; stored: string; detected: string; raw: string }> = [];
const stillUnknown: string[] = [];

for (const row of rows) {
  const stored = String(row.carrier ?? '').trim().toUpperCase();
  const resolved = resolveStoredCarrier({
    tracking: row.normalized || row.raw,
    reported: stored || null,
  });

  if (resolved.conflict) {
    conflicts.push({
      id: row.id,
      stored,
      detected: resolved.detected ?? UNKNOWN_CARRIER,
      raw: row.raw,
    });
    continue;
  }

  const storedIsAbsent = !stored || stored === UNKNOWN_CARRIER;
  if (storedIsAbsent && resolved.carrier !== UNKNOWN_CARRIER) {
    namable.push({ id: row.id, from: stored || '(null)', to: resolved.carrier, raw: row.raw });
  } else if (storedIsAbsent) {
    stillUnknown.push(row.raw);
  }
}

const byTarget = new Map<string, number>();
for (const n of namable) byTarget.set(n.to, (byTarget.get(n.to) ?? 0) + 1);

console.log(`rows scanned            ${rows.length}`);
console.log(`namable (unknown -> X)  ${namable.length}`);
for (const [carrier, n] of [...byTarget].sort((a, b) => b[1] - a[1])) {
  const pollable = isCarrierSyncEnabled(carrier) ? 'polled now' : 'no live integration';
  console.log(`  ${String(n).padStart(5)}  -> ${carrier.padEnd(14)} ${pollable}`);
}
console.log(`conflicts (left alone)  ${conflicts.length}`);
console.log(`still unnameable        ${stillUnknown.length}`);
console.log(`  samples: ${JSON.stringify(stillUnknown.slice(0, 8))}`);

if (showConflicts) {
  console.log('\nconflicts — stored vs detected, for human triage:');
  for (const c of conflicts) {
    console.log(`  id=${c.id} stored=${c.stored} detected=${c.detected} raw=${c.raw}`);
  }
}

if (!apply) {
  console.log('\nDRY RUN — nothing written. Re-run with --apply.');
  await client.end();
  process.exit(0);
}

// One statement, one transaction: a half-named table is worse than an unnamed
// one, because the second run's predicate would no longer describe it.
await client.query('BEGIN');
try {
  let written = 0;
  for (const batchStart of range(0, namable.length, 500)) {
    const batch = namable.slice(batchStart, batchStart + 500);
    const res = await client.query(
      `UPDATE shipping_tracking_numbers AS s
          SET carrier = v.carrier,
              -- Unpollable until now, so let the next sweep pick it up. An
              -- unsupported carrier is filtered by ENABLED_SYNC_CARRIERS, not
              -- by a null check date, so this is safe for all of them.
              next_check_at = COALESCE(s.next_check_at, now()),
              updated_at = now()
         FROM (SELECT * FROM unnest($1::bigint[], $2::text[]) AS t(id, carrier)) AS v
        WHERE s.id = v.id
          AND (s.carrier IS NULL OR upper(btrim(s.carrier)) IN ('', 'UNKNOWN'))`,
      [batch.map((b) => b.id), batch.map((b) => b.to)],
    );
    written += res.rowCount ?? 0;
  }
  await client.query('COMMIT');
  console.log(`\nAPPLIED — ${written} rows named.`);
} catch (err) {
  await client.query('ROLLBACK');
  throw err;
}

await client.end();

function range(start: number, end: number, step: number): number[] {
  const out: number[] = [];
  for (let i = start; i < end; i += step) out.push(i);
  return out;
}
