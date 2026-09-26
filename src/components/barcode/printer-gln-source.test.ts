/**
 * The label printers hold NO GLN of their own — how the borrowed GLN is retired.
 *
 * Two rounds of the same defect:
 *
 * 1. Both printers used to DEFAULT their config's `gln` to `0614141000005` —
 *    GS1's documentation GLN. Dropping the default stopped new configs
 *    carrying it, but did nothing about the ones already written: the value
 *    sits in operators' localStorage, so an operator who had ever opened the
 *    printer would keep printing it. A load-time sanitiser handled that.
 *
 * 2. The deeper problem was that the field existed here at all. A GLN is a
 *    LICENSED identifier belonging to the company, so a per-browser copy meant
 *    two operators could print the same rack with different GLNs — and neither
 *    had to match `organizations.settings.gs1.gln`, the value the print ladder,
 *    the interop projections and Settings all read. On 2026-08-02 the field was
 *    deleted from both configs; the GLN comes from `useOrgGs1()` alone.
 *
 * Deleting the key is strictly stronger than sanitising it: `loadConfig` never
 * reads `gln`, so a stale placeholder is inert JSON that cannot reach a label
 * by any code path. This test pins that — the printers' own configs must stay
 * GLN-free, or the second source of truth is back.
 *
 * Run: `node --require ./scripts/register-server-only-shim.cjs --import tsx \
 *        --test src/components/barcode/printer-gln-source.test.ts`
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig as loadBin } from './bin-label-printer/storage';
import { loadConfig as loadRack } from './rack-printer/rack-printer-config';
import { DEFAULT_CONFIG as BIN_DEFAULTS, CONFIG_KEY as BIN_KEY } from './bin-label-printer/types';
import { DEFAULT_CONFIG as RACK_DEFAULTS } from './rack-printer/rack-printer-config';

/** The value sitting in operators' localStorage right now. */
const STALE_PLACEHOLDER = '0614141000005';

test('neither printer config carries a GLN field at all', () => {
  assert.ok(!('gln' in BIN_DEFAULTS), 'bin printer config must not declare a gln');
  assert.ok(!('gln' in RACK_DEFAULTS), 'rack printer config must not declare a gln');
});

test('a stored placeholder cannot survive a config load — the actual migration', () => {
  const store = new Map<string, string>([
    [
      BIN_KEY,
      JSON.stringify({ maxAisles: 6, maxBays: 12, maxLevels: 5, maxPositions: 20, gln: STALE_PLACEHOLDER }),
    ],
    [
      'rackPrinter.config.v1',
      JSON.stringify({ maxAisles: 6, maxBays: 12, maxLevels: 5, gln: STALE_PLACEHOLDER }),
    ],
  ]);
  const g = globalThis as { window?: unknown };
  const had = 'window' in g;
  const prior = g.window;
  g.window = { localStorage: { getItem: (k: string) => store.get(k) ?? null } };
  try {
    for (const [name, loaded] of [['bin', loadBin()], ['rack', loadRack()]] as const) {
      assert.ok(
        !('gln' in loaded),
        `${name}: a pre-2026-08-02 config's gln must not survive the load`,
      );
      assert.equal(JSON.stringify(loaded).includes(STALE_PLACEHOLDER), false, `${name}: no placeholder`);
      // The counts beside it still load — this is a field removal, not a reset.
      assert.equal(loaded.maxAisles, 6, `${name}: layout counts still load`);
    }
  } finally {
    if (had) g.window = prior;
    else delete g.window;
  }
});
