/**
 * Unit test for the SearchHit identifier decorator.
 *
 * Run: `node --require ./scripts/register-server-only-shim.cjs --import tsx \
 *        --test src/lib/interop/search-identifiers.test.ts`
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { searchHitIdentifiers, withSearchHitIdentifiers } from './search-identifiers';
import type { SearchHit } from '@/lib/search/search-hit';

const hit = (over: Partial<SearchHit> = {}): SearchHit => ({
  id: 42,
  entityType: 'unit',
  title: 'A thing',
  subtitle: '',
  href: '/x',
  matchField: 'serial',
  score: 1,
  chips: [],
  ...over,
});

test('every entity type gets an internal identifier', () => {
  for (const entityType of ['order', 'unit', 'receiving', 'sku', 'repair', 'fba'] as const) {
    const ids = searchHitIdentifiers(hit({ entityType }));
    assert.ok(ids.internal.startsWith('urn:cycleforge:'), `${entityType} must have one`);
    assert.equal(ids.gs1, undefined, 'no GS1 key without the facts to build one');
  }
});

test('a receiving hit is a carton, not a "receiving"', () => {
  assert.equal(
    searchHitIdentifiers(hit({ id: 7, entityType: 'receiving' })).internal,
    'urn:cycleforge:carton:7',
  );
});

test('a unit gets an SGTIN only with BOTH halves', () => {
  const both = searchHitIdentifiers(hit({ entityType: 'unit' }), {
    gtin: '00812345000019',
    serial: 'SN-1',
  });
  assert.equal(both.gs1, 'urn:epc:id:sgtin:00812345000019.SN-1');

  // A serial alone is not an SGTIN — the GTIN half carries the licensed prefix.
  const serialOnly = searchHitIdentifiers(hit({ entityType: 'unit' }), { serial: 'SN-1' });
  assert.equal(serialOnly.gs1, undefined);
  assert.ok(serialOnly.internal, 'but the internal handle is still there');

  const gtinOnly = searchHitIdentifiers(hit({ entityType: 'unit' }), { gtin: '00812345000019' });
  assert.equal(gtinOnly.gs1, undefined);
});

test('a SKU gets a class-level GTIN', () => {
  const ids = searchHitIdentifiers(hit({ entityType: 'sku' }), { gtin: '00812345000019' });
  assert.equal(ids.gs1, 'https://id.gs1.org/01/00812345000019');
});

test('a placeholder GTIN never becomes a gs1 identifier', () => {
  const unit = searchHitIdentifiers(hit({ entityType: 'unit' }), {
    gtin: '00614141000005',
    serial: 'SN-1',
  });
  assert.equal(unit.gs1, undefined);
  const sku = searchHitIdentifiers(hit({ entityType: 'sku' }), { gtin: '00614141000005' });
  assert.equal(sku.gs1, undefined);
});

test('an order or repair never claims a GS1 key even when handed a GTIN', () => {
  // Neither is a trade item. Passing facts must not conjure one.
  for (const entityType of ['order', 'repair', 'fba', 'receiving'] as const) {
    const ids = searchHitIdentifiers(hit({ entityType }), {
      gtin: '00812345000019',
      serial: 'SN-1',
    });
    assert.equal(ids.gs1, undefined, `${entityType} is not a trade item`);
  }
});

test('the decorator is non-mutating and additive', () => {
  const original = hit();
  const decorated = withSearchHitIdentifiers(original, {
    gtin: '00812345000019',
    serial: 'SN-1',
  });

  assert.equal(original.identifiers, undefined, 'the input is untouched');
  assert.ok(decorated.identifiers);
  // Everything else survives — this is a field on the existing shape, not a
  // parallel result type.
  assert.equal(decorated.title, original.title);
  assert.equal(decorated.href, original.href);
  assert.equal(decorated.score, original.score);
});
