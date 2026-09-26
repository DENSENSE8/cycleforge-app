/** The label printers hold NO GLN of their own — how the borrowed GLN is retired. */

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
