/** Phase 1.5 — the Settings → Workstation packing-bench binding. */

import assert from 'node:assert/strict';
import test from 'node:test';
import { packBenchShortLabel } from './pack-bench-display';
import { normalizePackBenchLocationId } from '@/lib/settings/workstation';

// ── the binding VALUE ────────────────────────────────────────────────────────

test('a bench binding normalizes to a positive locations.id or null', () => {
  assert.equal(normalizePackBenchLocationId(42), 42);
  // Settings writes the raw <select> value, which is a string.
  assert.equal(normalizePackBenchLocationId('42'), 42);
  // "" is the "— No bench —" option, not a bench with id 0.
  assert.equal(normalizePackBenchLocationId(''), null);
  assert.equal(normalizePackBenchLocationId(0), null);
  assert.equal(normalizePackBenchLocationId(-1), null);
  assert.equal(normalizePackBenchLocationId(null), null);
  assert.equal(normalizePackBenchLocationId(undefined), null);
  assert.equal(normalizePackBenchLocationId('desk-2'), null);
});

// ── resolving the binding against the live bench list ────────────────────────

const BENCHES = [
  // id 7 carries an operator nickname; id 9 has none, so it falls back to `name`.
  {
    id: 7,
    name: 'QA Packing Desk 1',
    displayName: 'Packing Station 1',
    barcode: 'QA-PACK-DESK-01',
    locationKind: 'DESK',
  },
  { id: 9, name: 'QA Packing Staging', barcode: 'QA-PACK-STAGING', locationKind: 'STAGING' },
];

test('resolveWorkstationBench arms the bound bench from the live locations list', async () => {
  const { resolveWorkstationBench } = await import('./pack-station-arm');
  // `name` on the armed station is the FACE — "Placing at …" is a display
  // string, so the nickname is resolved once here rather than at each caller.
  assert.deepEqual(resolveWorkstationBench(BENCHES, 7), {
    locationId: 7,
    name: 'Packing Station 1',
    barcode: 'QA-PACK-DESK-01',
    locationKind: 'DESK',
  });
  assert.equal(resolveWorkstationBench(BENCHES, 9)?.locationKind, 'STAGING');
  // No nickname → the canonical name, minus the QA fixture prefix.
  assert.equal(resolveWorkstationBench(BENCHES, 9)?.name, 'Packing Staging');
});

test('resolveWorkstationBench refuses a binding the bench list no longer carries', async () => {
  const { resolveWorkstationBench } = await import('./pack-station-arm');
  // Renamed / deactivated / deleted bench — arming a stale name would let an
  // operator place packages against a bench that is not on the floor.
  assert.equal(resolveWorkstationBench(BENCHES, 404), null);
  assert.equal(resolveWorkstationBench([], 7), null);
  assert.equal(resolveWorkstationBench(undefined, 7), null);
});

test('resolveWorkstationBench treats an absent binding as "no bench", never a lookup', async () => {
  const { resolveWorkstationBench } = await import('./pack-station-arm');
  assert.equal(resolveWorkstationBench(BENCHES, null), null);
  assert.equal(resolveWorkstationBench(BENCHES, undefined), null);
  assert.equal(resolveWorkstationBench(BENCHES, 0), null);
});

// ── auto-arm suppression ─────────────────────────────────────────────────────

test('auto-arm suppression is off on the server, where there is no session', async () => {
  const { isAutoArmSuppressed } = await import('./pack-station-arm');
  assert.equal(typeof globalThis.window, 'undefined');
  assert.equal(isAutoArmSuppressed(), false);
});

test('clearing the bench by hand suppresses auto-arm; arming again lifts it', async () => {
  const store = new Map<string, string>();
  const sessionStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
  const g = globalThis as Record<string, unknown>;
  g.window = { sessionStorage };
  g.sessionStorage = sessionStorage;
  try {
    // Fresh import so the module reads the stubbed browser globals.
    const arm = await import(`./pack-station-arm?suppression=${Date.now()}`);
    const bench = {
      locationId: 7,
      name: 'QA Packing Desk 1',
      barcode: 'QA-PACK-DESK-01',
      locationKind: 'DESK' as const,
    };

    assert.equal(arm.isAutoArmSuppressed(), false, 'a fresh session starts from the binding');

    arm.writeArmedPackStation(bench);
    assert.deepEqual(arm.readArmedPackStation(), bench);
    assert.equal(arm.isAutoArmSuppressed(), false);

    // An explicit clear outranks the binding for the rest of the session —
    // re-arming what the operator just put down is fighting them.
    arm.writeArmedPackStation(null);
    assert.equal(arm.readArmedPackStation(), null);
    assert.equal(arm.isAutoArmSuppressed(), true);

    // Arming again (bench barcode scan, KPI click) is consent to auto-arm later.
    arm.writeArmedPackStation(bench);
    assert.equal(arm.isAutoArmSuppressed(), false);
  } finally {
    delete g.window;
    delete g.sessionStorage;
  }
});

// ── bench display ────────────────────────────────────────────────────────────

test('packBenchShortLabel prefers the operator nickname over the warehouse name', () => {
  // The whole point of `locations.display_name`: Settings → Stations maps the
  // backend name to the face the floor reads.
  assert.equal(
    packBenchShortLabel({
      locationName: 'Pack Desk 1',
      locationDisplayName: 'Packing Station 1',
      locationKind: 'DESK',
    }),
    'Packing Station 1',
  );
  // Cleared / never-set nickname falls back to the canonical name — never blank.
  for (const empty of [null, undefined, '', '   ']) {
    assert.equal(
      packBenchShortLabel({
        locationName: 'Pack Desk 1',
        locationDisplayName: empty,
        locationKind: 'DESK',
      }),
      'Pack Desk 1',
    );
  }
  // Count rows arrive display-RESOLVED from SQL, so they pass no nickname and
  // the resolved value is already sitting in `locationName`.
  assert.equal(
    packBenchShortLabel({ locationName: 'Packing Station 1', locationKind: 'DESK' }),
    'Packing Station 1',
  );
});

test('packBenchShortLabel shows the name the operator stored on the bench', () => {
  // With no nickname, the canonical `locations.name` is the face.
  assert.equal(packBenchShortLabel({ locationName: 'Pack Desk 2', locationKind: 'DESK' }), 'Pack Desk 2');
  assert.equal(packBenchShortLabel({ locationName: 'Bench 1', locationKind: 'DESK' }), 'Bench 1');
  assert.equal(packBenchShortLabel({ locationName: 'Fragile wrap', locationKind: 'DESK' }), 'Fragile wrap');
  // A renamed STAGING row is NOT overridden with the word "Staging" — the kind
  // is carried by the row, and a face that ignores the rename is the derived
  // label this rule replaced.
  assert.equal(packBenchShortLabel({ locationName: 'Overflow shelf', locationKind: 'STAGING' }), 'Overflow shelf');
  // Fixture prefix only — no tenant types "QA ".
  assert.equal(packBenchShortLabel({ locationName: 'QA Packing Desk 2', locationKind: 'DESK' }), 'Packing Desk 2');
  assert.equal(packBenchShortLabel({ locationName: 'QA Packing Staging', locationKind: 'STAGING' }), 'Packing Staging');
  // Empty face is never a blank chip.
  assert.equal(packBenchShortLabel({ locationName: '   ', locationKind: 'STAGING' }), 'Staging');
  assert.equal(packBenchShortLabel({ locationName: '', locationKind: 'DESK' }), 'Bench');
});
