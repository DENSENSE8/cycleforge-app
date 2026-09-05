import test from 'node:test';
import assert from 'node:assert/strict';
import { matchCatalogHits, type CatalogPasteHit } from './catalog-paste-match';

const hits = (rows: Array<Partial<CatalogPasteHit> & { id: number; sku: string }>): CatalogPasteHit[] =>
  rows.map((r) => ({ zoho_sku: null, ...r }));

test('matchCatalogHits: empty paste is none', () => {
  assert.deepEqual(matchCatalogHits(hits([{ id: 1, sku: 'A' }]), '  '), { kind: 'none' });
});

test('matchCatalogHits: exact sku wins over siblings', () => {
  const list = hits([
    { id: 1, sku: 'BOSE-1' },
    { id: 2, sku: 'BOSE-2' },
  ]);
  const match = matchCatalogHits(list, 'bose-2');
  assert.equal(match.kind, 'exact');
  if (match.kind !== 'exact') return;
  assert.equal(match.hit.id, 2);
});

test('matchCatalogHits: zoho sku is an exact face', () => {
  const list = hits([{ id: 9, sku: 'CF-1', zoho_sku: 'ZOHO-9' }]);
  const match = matchCatalogHits(list, 'ZOHO-9');
  assert.equal(match.kind, 'exact');
  if (match.kind !== 'exact') return;
  assert.equal(match.hit.id, 9);
});

test('matchCatalogHits: one inexact hit is unique', () => {
  const match = matchCatalogHits(hits([{ id: 3, sku: 'WAVE' }]), '76755777');
  assert.equal(match.kind, 'unique');
  if (match.kind !== 'unique') return;
  assert.equal(match.hit.id, 3);
});

test('matchCatalogHits: several inexact hits stay ambiguous', () => {
  const match = matchCatalogHits(
    hits([
      { id: 1, sku: 'A' },
      { id: 2, sku: 'B' },
    ]),
    '76755777',
  );
  assert.equal(match.kind, 'ambiguous');
});

test('matchCatalogHits: no hits is none', () => {
  assert.deepEqual(matchCatalogHits([], 'X'), { kind: 'none' });
});
