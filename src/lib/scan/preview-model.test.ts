/** preview-model tests — the telling layer over the dispatch table. */

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { previewScan } from './preview-model';

const UPS = '1Z999AA10123456784';
const FEDEX = '999999999999'; // 12-digit FedEx shape
test('a never-seen carrier tracking previews the door, in work words', () => {
  const p = previewScan({ scan: UPS });
  assert.ok(p);
  assert.equal(p.card, 'arrival');
  assert.equal(p.classLabel, 'Carrier tracking');
  assert.equal(p.mode, 'preview');
  assert.match(p.next, /door/);
  assert.match(p.next, /Intake/);
  assert.equal(p.title, 'Intake · UPS 6784');
  assert.equal(p.raw, UPS);
});

test('a known tracking previews the carton stage instead', () => {
  const p = previewScan({ scan: FEDEX, state: { trackingSeen: true } });
  assert.ok(p);
  assert.equal(p.card, 'carton');
  assert.match(p.next, /stage/);
});

test('a product label previews read-only — no work starts', () => {
  const p = previewScan({ scan: '00614141123452' });
  assert.ok(p);
  assert.equal(p.card, 'preview');
  assert.equal(p.classLabel, 'Product label');
  assert.match(p.next, /no work starts/);
});

test('an armed session that expects the class earns the act sentence', () => {
  const armed = { expects: ['carrier-tracking' as const], title: 'Intake · UPS 6784' };
  const p = previewScan({ scan: UPS, armedSession: armed });
  assert.ok(p);
  assert.equal(p.mode, 'act');
  assert.match(p.next, /Advances the armed block/);
  // An act on a never-seen tracking re-titles the block it advances.
  assert.equal(p.title, 'Intake · UPS 6784');
});

test('routability is honest: empty is null, loose bytes land on the bin catch-all', () => {
  // routeScan treats loose alphanumeric strings as bins (the licence syntax is
  // the catch-all), so the preview says so rather than refusing to answer.
  assert.equal(previewScan({ scan: '' }), null);
  const p = previewScan({ scan: 'hello world' });
  assert.ok(p);
  assert.equal(p.classLabel, 'Bin');
  assert.equal(p.card, 'preview');
});
test('every sentence names work, never the word Arrival', () => {
  for (const raw of [UPS, '00614141123452', 'hello world']) {
    const p = previewScan({ scan: raw });
    if (!p) continue;
    assert.doesNotMatch(p.next, /Arrival/);
    assert.doesNotMatch(p.destination, /Arrival/);
  }
});
