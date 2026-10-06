import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyPageStock, printFileQuerySchema, printFileStatus } from './print-file-contracts';

const inch = (n: number) => n * 72;

test('page stock: 4×6-class pages are labels, either orientation', () => {
  assert.equal(classifyPageStock(inch(4), inch(6)), 'label');
  assert.equal(classifyPageStock(inch(6), inch(4)), 'label');
  assert.equal(classifyPageStock(inch(4), inch(8)), 'label');
  assert.equal(classifyPageStock(inch(8), inch(4)), 'label');
});

test('page stock: Letter, A4 and half-letter are paper', () => {
  assert.equal(classifyPageStock(612, 792), 'paper');
  assert.equal(classifyPageStock(792, 612), 'paper');
  assert.equal(classifyPageStock(595.28, 841.89), 'paper');
  assert.equal(classifyPageStock(inch(5.5), inch(8.5)), 'paper');
});

test('page stock boundaries: short side ≤ 4.5in and long side ≤ 9in, inclusive', () => {
  assert.equal(classifyPageStock(inch(4.5), inch(9)), 'label');
  assert.equal(classifyPageStock(inch(4.5) + 0.5, inch(6)), 'paper');
  assert.equal(classifyPageStock(inch(4), inch(9) + 0.5), 'paper');
});

test('print status: none printed, some, every page', () => {
  assert.equal(printFileStatus({ printedPages: 0, pageCount: 10 }), 'not-printed');
  assert.equal(printFileStatus({ printedPages: 6, pageCount: 10 }), 'partly');
  assert.equal(printFileStatus({ printedPages: 10, pageCount: 10 }), 'printed');
});

test('file query: defaults, civil days only, no foreign params', () => {
  const parsed = printFileQuerySchema.parse({});
  assert.equal(parsed.sort, 'newest');
  assert.equal(parsed.printing, undefined);
  assert.equal(printFileQuerySchema.safeParse({ from: '2026-10-06T00:00:00Z' }).success, false);
  assert.equal(printFileQuerySchema.safeParse({ organizationId: 'x' }).success, false);
  assert.equal(printFileQuerySchema.safeParse({ printing: 'partly', sort: 'last-printed', limit: '50' }).success, true);
});
