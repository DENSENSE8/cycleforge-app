/**
 * Table definition registry — Phase 1 kernel (nonlinear table engine).
 *
 *   npx tsx --test src/components/tables/table-definition-registry.test.ts
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  getTableDefinition,
  tableDefinitionIds,
  TABLE_DEFINITIONS,
} from './table-definition-registry';

test('registry enumerates at least the Receiving browse binding', () => {
  const ids = tableDefinitionIds();
  assert.ok(ids.includes('receiving.browse'), `expected receiving.browse in ${ids.join(',')}`);
  assert.equal(getTableDefinition('receiving.browse')?.id, 'receiving.browse');
  assert.equal(getTableDefinition('no.such.view'), undefined);
  assert.ok(Object.keys(TABLE_DEFINITIONS).length >= 1);
});
