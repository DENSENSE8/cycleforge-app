/**
 * History-first law for Workbench spreadsheet capabilities (custom columns).
 *
 * Unbox History (`ReceivingGridHost` / RECEIVING) is the golden. Do not fan out
 * custom fields (or peer table-engine capabilities) to Orders / other families
 * until History is dogfood-verified — then grow {@link CUSTOM_FIELD_LIVE_ENTITY_TYPES}
 * and wire that family's host + list API in the **same** change.
 *
 * SoT: AGENTS.md · source-of-truth.md → Table engine fan-out (History first).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  CUSTOM_FIELD_ENTITY_TYPES,
  CUSTOM_FIELD_LIVE_ENTITY_TYPES,
  isCustomFieldEntityLive,
} from './types';
import { customFieldEntityTypeForTableId } from './table-entity';

const ROOT = join(import.meta.dirname, '../../..');

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), 'utf8');
}

/** Forbidden import markers for a family that is NOT yet live. */
const CUSTOM_FIELD_WIRE_MARKERS = [
  'useCustomFieldDefs',
  'mergeCustomFieldColumns',
  'attachCustomFieldsToRows',
  'commitCustomFieldValueClient',
  "from '@/components/tables/CustomFieldCell'",
] as const;

/**
 * When an entity is NOT in CUSTOM_FIELD_LIVE_ENTITY_TYPES, these product mounts
 * must stay clean — no custom-field wire. When it IS live, the positive mounts
 * below must carry the wire.
 */
const FROZEN_OFF_MOUNTS: Record<string, readonly string[]> = {
  ORDER: [
    'src/components/dashboard/orders-queue/OrdersGridHost.tsx',
    'src/components/dashboard/orders-queue/OrdersQueueTableRow.tsx',
    'src/app/api/orders/route.ts',
  ],
};

/** Required wires when the entity is live. */
const LIVE_MOUNTS: Record<string, readonly string[]> = {
  RECEIVING: [
    'src/components/station/receiving-grid/ReceivingGridHost.tsx',
    'src/app/api/receiving-lines/route.ts',
    'src/components/station/receiving-grid/cells/index.tsx',
  ],
};

describe('custom fields — History-first fan-out', () => {
  it('LIVE allowlist is a non-empty subset of the storage vocabulary', () => {
    assert.ok(CUSTOM_FIELD_LIVE_ENTITY_TYPES.length >= 1);
    for (const live of CUSTOM_FIELD_LIVE_ENTITY_TYPES) {
      assert.ok(
        (CUSTOM_FIELD_ENTITY_TYPES as readonly string[]).includes(live),
        `${live} is live but not in CUSTOM_FIELD_ENTITY_TYPES`,
      );
    }
  });

  it('RECEIVING stays the Unbox History golden (must remain live)', () => {
    assert.ok(
      isCustomFieldEntityLive('RECEIVING'),
      'RECEIVING must stay in CUSTOM_FIELD_LIVE_ENTITY_TYPES — History is the golden',
    );
  });

  it('tableId map only returns live entity types', () => {
    assert.equal(customFieldEntityTypeForTableId('receiving'), 'RECEIVING');
    assert.equal(customFieldEntityTypeForTableId('testing'), 'RECEIVING');
    assert.equal(
      customFieldEntityTypeForTableId('orders'),
      null,
      'orders must not map to ORDER until ORDER is live — History-first',
    );
    assert.equal(customFieldEntityTypeForTableId('shipped'), null);
  });

  it('non-live families have no product wire (Orders stays clean while ORDER is off)', () => {
    for (const [entity, files] of Object.entries(FROZEN_OFF_MOUNTS)) {
      if (isCustomFieldEntityLive(entity)) continue;
      for (const rel of files) {
        const src = read(rel);
        for (const marker of CUSTOM_FIELD_WIRE_MARKERS) {
          assert.ok(
            !src.includes(marker),
            `${rel} still wires custom fields (${marker}) while ${entity} is not in ` +
              'CUSTOM_FIELD_LIVE_ENTITY_TYPES. Dogfood Unbox History first; then grow the ' +
              'live allowlist and wire this mount in the same change.',
          );
        }
      }
    }
  });

  it('every LIVE entity has host + list API + cell paint wired', () => {
    for (const entity of CUSTOM_FIELD_LIVE_ENTITY_TYPES) {
      const mounts = LIVE_MOUNTS[entity];
      assert.ok(
        mounts?.length,
        `Add LIVE_MOUNTS['${entity}'] when growing CUSTOM_FIELD_LIVE_ENTITY_TYPES`,
      );
      for (const rel of mounts) {
        const src = read(rel);
        const hasWire =
          src.includes('useCustomFieldDefs') ||
          src.includes('mergeCustomFieldColumns') ||
          src.includes('attachCustomFieldsToRows') ||
          src.includes('CustomFieldCell');
        assert.ok(
          hasWire,
          `${rel} must wire custom fields now that ${entity} is live`,
        );
      }
    }
  });

  it('API routes gate on isCustomFieldEntityLive (not a hardcoded string twin)', () => {
    const defs = read('src/app/api/custom-fields/defs/route.ts');
    const values = read('src/app/api/custom-fields/values/route.ts');
    assert.match(
      defs,
      /isCustomFieldEntityLive/,
      'defs route must call isCustomFieldEntityLive — one allowlist',
    );
    assert.match(
      values,
      /isCustomFieldEntityLive/,
      'values route must call isCustomFieldEntityLive — one allowlist',
    );
  });
});
