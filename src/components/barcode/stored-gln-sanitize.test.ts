/**
 * The stored-GLN sanitiser — how the borrowed GLN actually gets retired.
 *
 * Dropping `DEFAULT_GLN` from the code stops NEW configs defaulting to it. It
 * does nothing about the configs that already exist: both label printers
 * persist their settings to localStorage, and every one written before
 * 2026-08-02 contains `0614141000005` verbatim. Without sanitising on LOAD,
 * an operator who had ever opened the printer would keep printing GS1's
 * documentation GLN forever, and the "fix" would be invisible in exactly the
 * installs that had the problem.
 *
 * Both printers keep their own config module (different shapes — bins have
 * positions, racks do not), so the sanitiser is asserted in both.
 *
 * Run: `node --require ./scripts/register-server-only-shim.cjs --import tsx \
 *        --test src/components/barcode/stored-gln-sanitize.test.ts`
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeStoredGln as sanitizeBin } from './bin-label-printer/storage';
import { sanitizeStoredGln as sanitizeRack } from './rack-printer/rack-printer-config';
import { DEFAULT_CONFIG as BIN_DEFAULTS } from './bin-label-printer/types';
import { DEFAULT_CONFIG as RACK_DEFAULTS } from './rack-printer/rack-printer-config';

/** The value sitting in operators' localStorage right now. */
const STALE_PLACEHOLDER = '0614141000005';
/** Check-digit-valid, non-example prefix. */
const LICENSED = '0812345000009';

const BOTH: Array<[string, (v: unknown) => string]> = [
  ['bin', sanitizeBin],
  ['rack', sanitizeRack],
];

test('neither printer ships a default GLN any more', () => {
  assert.equal(BIN_DEFAULTS.gln, '', 'bin printer must default to no GLN');
  assert.equal(RACK_DEFAULTS.gln, '', 'rack printer must default to no GLN');
});

test('a stored placeholder is scrubbed on load — the actual migration', () => {
  for (const [name, sanitize] of BOTH) {
    assert.equal(
      sanitize(STALE_PLACEHOLDER),
      '',
      `${name}: the pre-existing placeholder must not survive a config load`,
    );
  }
});

test('a licensed GLN in a stored config is preserved', () => {
  for (const [name, sanitize] of BOTH) {
    assert.equal(sanitize(LICENSED), LICENSED, `${name}: a real GLN must survive`);
    assert.equal(sanitize(`  ${LICENSED}  `), LICENSED, `${name}: trimmed`);
  }
});

test('junk of every shape resolves to "no GLN" rather than throwing', () => {
  for (const [name, sanitize] of BOTH) {
    for (const junk of [
      undefined,
      null,
      '',
      '   ',
      42,
      {},
      [],
      'not-a-gln',
      '123',
      // 13 digits but a bad check digit — would crash bwip-js at render time.
      '0812345000005',
    ]) {
      assert.equal(sanitize(junk), '', `${name}: ${JSON.stringify(junk)} must resolve to ""`);
    }
  }
});
