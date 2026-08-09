import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mergeCustomFieldColumns } from './column-model';
import { customFieldColumnKey, isCustomFieldColumnKey, parseCustomFieldDefKey } from '@/lib/tables/custom-field-keys';
import { resolveCellMapKey, resolveColumnPaintPath } from '@/lib/tables/cell-map-registry';
import type { CustomFieldDef } from './types';

describe('custom-field-keys', () => {
  it('round-trips def key ↔ column key', () => {
    assert.equal(customFieldColumnKey('po_ref'), 'custom:po_ref');
    assert.equal(parseCustomFieldDefKey('custom:po_ref'), 'po_ref');
    assert.equal(isCustomFieldColumnKey('custom:po_ref'), true);
    assert.equal(isCustomFieldColumnKey('title'), false);
  });
});

describe('cell-map-registry', () => {
  it('reads cellMapKey from a definition', () => {
    assert.equal(
      resolveCellMapKey({ cellMapKey: 'orders', entityFamily: 'orders' }),
      'orders',
    );
  });

  it('routes custom:* to the shared paint path', () => {
    assert.equal(resolveColumnPaintPath('custom:po_ref'), 'custom');
    assert.equal(resolveColumnPaintPath('title'), 'system');
  });
});

describe('mergeCustomFieldColumns', () => {
  const system = [
    { key: 'select', width: 'minmax(2rem, 2rem)' },
    { key: 'title', width: 'minmax(12rem, 12rem)' },
    { key: '_fill', width: 'minmax(0rem, 1fr)' },
  ] as const;

  const def: CustomFieldDef = {
    id: 1,
    organizationId: '00000000-0000-0000-0000-000000000001',
    entityType: 'ORDER',
    key: 'po_ref',
    label: 'PO ref',
    type: 'text',
    options: null,
    sortOrder: 0,
    archivedAt: null,
  };

  it('inserts custom tracks before _fill', () => {
    const merged = mergeCustomFieldColumns(system, [def]);
    assert.deepEqual(
      merged.map((c) => c.key),
      ['select', 'title', 'custom:po_ref', '_fill'],
    );
    const custom = merged.find((c) => c.key === 'custom:po_ref');
    assert.ok(custom);
    assert.equal(custom.tier, 'optional');
    assert.equal(custom.hideKey, 'custom:po_ref');
  });
});
