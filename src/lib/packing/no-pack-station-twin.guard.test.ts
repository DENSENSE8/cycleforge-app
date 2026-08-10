/**
 * Guard: pack placement has ONE source of truth, and it is not a parallel
 * packing-station registry.
 *
 * Locked product rule (`AGENTS.md` → Pack placement; `.claude/rules/source-of-truth.md`):
 *   packing benches are `locations` rows (`location_kind` DESK/STAGING); the
 *   current place for a labeled order is `order_pack_placements`. NEVER a
 *   parallel `packing_stations` table, and never a browser workstation
 *   (`cf.workstation`) or `staff_stations` role enum as the COUNT source.
 *
 * A prose rule cannot fail. This test makes re-introducing the twin — the exact
 * shape the SoT forbids — a red gate:
 *   1. No `.ts`/`.tsx` file uses a `packing_stations` SQL relation.
 *   2. The count SoT (`countOpenPlacementsByLocation`) reads from
 *      `order_pack_placements` + `locations`, and nothing else.
 *
 * Matching targets SQL relation usage (FROM/JOIN/INTO/UPDATE/CREATE TABLE …),
 * never a prose comment — the migration that BANS the twin says the words
 * `packing_stations` in a `-- …` line, and a bare substring scan would fail on
 * the rule that exists to prevent the violation.
 */

import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const SRC_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SELF = fileURLToPath(import.meta.url);

/** SQL uses `packing_stations` as a relation — the banned parallel registry. */
const PACKING_STATIONS_RELATION =
  /\b(FROM|JOIN|INTO|UPDATE|REFERENCES|CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?)\s+packing_stations\b/i;

function* walkTs(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next') continue;
    const full = path.join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      yield* walkTs(full);
    } else if (/\.tsx?$/.test(entry)) {
      yield full;
    }
  }
}

test('no source file introduces a parallel `packing_stations` registry', () => {
  const offenders: string[] = [];
  for (const file of walkTs(SRC_ROOT)) {
    if (file === SELF) continue;
    const text = readFileSync(file, 'utf8');
    if (!text.includes('packing_stations')) continue;
    for (const [i, line] of text.split('\n').entries()) {
      if (PACKING_STATIONS_RELATION.test(line)) {
        offenders.push(`${path.relative(SRC_ROOT, file)}:${i + 1}  ${line.trim()}`);
      }
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `Pack placement lives on \`locations\` + \`order_pack_placements\`, never a ` +
      `\`packing_stations\` table. Remove the parallel registry:\n${offenders.join('\n')}`,
  );
});

test('the pack-placement count SoT reads from order_pack_placements + locations only', () => {
  const sot = readFileSync(path.join(SRC_ROOT, 'lib/packing/pack-placement.ts'), 'utf8');

  // Isolate the count function body so a docblock mention elsewhere cannot
  // satisfy (or trip) these assertions.
  const start = sot.indexOf('export async function countOpenPlacementsByLocation');
  assert.notEqual(start, -1, 'countOpenPlacementsByLocation must exist as the count SoT');
  const body = sot.slice(start, sot.indexOf('\nexport ', start + 1) + 0 || sot.length);

  assert.match(
    body,
    /FROM order_pack_placements/i,
    'counts must come from the order_pack_placements ledger',
  );
  assert.match(body, /FROM locations/i, 'counts join the locations bench map');
  for (const banned of ['packing_stations', 'staff_stations', 'sessionStorage', 'localStorage']) {
    assert.doesNotMatch(
      body,
      new RegExp(banned),
      `the count SoT must not read from ${banned}`,
    );
  }
});

test('the unit-pack-placement count SoT reads from unit_pack_placements + serial_units + locations only', () => {
  const sot = readFileSync(path.join(SRC_ROOT, 'lib/packing/unit-pack-placement.ts'), 'utf8');

  const start = sot.indexOf('export async function countOpenUnitPlacementsByLocation');
  assert.notEqual(start, -1, 'countOpenUnitPlacementsByLocation must exist as the unit count SoT');
  const body = sot.slice(start, sot.indexOf('\nexport ', start + 1) + 0 || sot.length);

  assert.match(
    body,
    /FROM unit_pack_placements/i,
    'unit counts must come from the unit_pack_placements ledger',
  );
  assert.match(body, /FROM locations/i, 'unit counts join the locations bench map');
  // Units are counted only while on the floor — the count joins serial_units.
  assert.match(body, /JOIN serial_units/i, 'unit counts join serial_units for on-floor status');
  for (const banned of ['packing_stations', 'staff_stations', 'sessionStorage', 'localStorage']) {
    assert.doesNotMatch(
      body,
      new RegExp(banned),
      `the unit count SoT must not read from ${banned}`,
    );
  }
});
