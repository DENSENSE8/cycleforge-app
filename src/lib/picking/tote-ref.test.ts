import { strictEqual } from 'node:assert';
import test from 'node:test';
import { toteRefFromScan } from './tote-ref';

// The tote gate's whole contract:

test('bare house plates canonicalize to H-{id}', () => {
  strictEqual(toteRefFromScan('H-12'), 'H-12');
  strictEqual(toteRefFromScan('h-12'), 'H-12');
  strictEqual(toteRefFromScan('H-0'), 'H-0');
});

test('QR redirect URLs and bare paths canonicalize to the same H-{id}', () => {
  strictEqual(toteRefFromScan('https://wh.example.com/m/h/42'), 'H-42');
  strictEqual(toteRefFromScan('/m/h/7'), 'H-7');
});

test('whitespace around the scan is tolerated', () => {
  strictEqual(toteRefFromScan('  H-12  '), 'H-12');
});

test('non-tote scans return null — they are not this verb', () => {
  strictEqual(toteRefFromScan('ABC123'), null); // serial
  strictEqual(toteRefFromScan('A-12'), null); // bin
  strictEqual(toteRefFromScan('U-9'), null); // unit handle
  strictEqual(toteRefFromScan('SKU-1'), null); // sku-only label → bin class
  strictEqual(toteRefFromScan(''), null);
});

test('an H-class scan for a DIFFERENT redirect shape still names a tote', () => {
  // routeScan keeps value for any handling-unit route; the redirect branch is
  // the normalizer, the value branch is the floor for anything else.
  strictEqual(toteRefFromScan('H-999999'), 'H-999999');
});
