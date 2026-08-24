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

test('receiving scan hook auto-stages return cartons', () => {
  const src = readFileSync(
    fileURLToPath(
      new URL('../../components/sidebar/receiving/useTrackingScan.ts', import.meta.url),
    ),
    'utf8',
  );
  ok(/maybeStageReturnCarton/.test(src), 'scan hook must call maybeStageReturnCarton');
  ok(
    /stageReturnCartonToReturnsTestBin/.test(src),
    'scan hook must import stageReturnCartonToReturnsTestBin',
  );
});

test('settings registry exposes receiving.returnsTestBin', () => {
  const src = readFileSync(
    fileURLToPath(new URL('../settings/registry.ts', import.meta.url)),
    'utf8',
  );
  ok(/receiving\.returnsTestBin/.test(src), 'registry must declare receiving.returnsTestBin');
});
