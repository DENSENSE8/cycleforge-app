/**
 * Guards for the returns testing bin resolver + migration seed + settings.
 */

import { test } from 'node:test';
import { ok, equal } from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_RETURNS_TEST_BIN_BARCODE,
  returnsTestBinSymbol,
} from '@/lib/inventory/returns-test-bin-symbol';

test('returns-test-bin barcode defaults to RETURNS-TEST', () => {
  equal(DEFAULT_RETURNS_TEST_BIN_BARCODE, 'RETURNS-TEST');
  equal(returnsTestBinSymbol(), 'RETURNS-TEST');
});

test('migration seeds RETURNS-TEST with RETURNS role', () => {
  const src = readFileSync(
    fileURLToPath(new URL('../migrations/2026-08-03_returns_test_bin.sql', import.meta.url)),
    'utf8',
  );
  ok(/RETURNS-TEST/.test(src), 'migration must seed RETURNS-TEST barcode');
  ok(/'RETURNS'/.test(src), 'migration must use bin_role RETURNS');
  ok(/Returns — Testing/.test(src), 'migration must name the bin');
});

/* The scan-hook wiring subtest left with its subject (merge, 2026-08-25):
   the sidebar receiving `useTrackingScan` hook was deleted by the
   warehouse-os zero-base. The domain half survives —
   `stage-return-to-returns-bin.ts` and the settings registry rows below
   are still pinned; the rebuilt shell's scan path re-earns a wiring pin
   when that surface lands. */

test('settings registry exposes receiving.returnsTestBin', () => {
  const src = readFileSync(
    fileURLToPath(new URL('../settings/registry.ts', import.meta.url)),
    'utf8',
  );
  ok(/receiving\.returnsTestBin/.test(src), 'registry must declare receiving.returnsTestBin');
});
