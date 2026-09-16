/**
 * Tripwire — the Identity Purity law.
 *
 * Run: npx tsx --test src/lib/tables/slot-table-identity-purity-law.test.ts
 */

import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import type { FieldDef } from '@/lib/tables/field-catalog/types';
import {
  assertValidIdentityFieldDef,
  BANNED_IDENTITY_PATH_PATTERNS,
  BANNED_IDENTITY_ROW_PROPERTIES,
  SLOT_TABLE_IDENTITY_PURITY_LAW,
} from '@/lib/tables/slot-table-identity-purity-law';
import { ordersCompoundView } from '@/lib/orders/orders-compound-view';
import type { ShippedOrder } from '@/types/orders';

const CATALOGS_DIR = join(process.cwd(), 'src/lib/tables/field-catalog');

describe('slot-table identity purity law', () => {
  it('states the law explicitly', () => {
    assert.match(SLOT_TABLE_IDENTITY_PURITY_LAW, /ID column is strictly for machine identifiers/);
  });

  it('every field catalog complies with identity purity', async () => {
    const catalogFiles = readdirSync(CATALOGS_DIR).filter(
      (name) => name.endsWith('.ts') && name !== 'types.ts' && !name.includes('.test.'),
    );
    assert.ok(catalogFiles.length >= 10, 'catalogs directory must contain catalog definitions');

    for (const file of catalogFiles) {
      // Exception: test discovers and loads all sibling catalog definitions dynamically
      const mod = await import(join(CATALOGS_DIR, file));
      const catalog = Object.values(mod).find(
        (val) => Array.isArray(val) && val.length > 0 && typeof val[0] === 'object' && 'slotKinds' in val[0],
      ) as FieldDef[] | undefined;

      if (!catalog) continue;

      for (const field of catalog) {
        if (field.slotKinds.includes('identity')) {
          assert.equal(
            field.displayType,
            'id',
            `${file}: field '${field.id}' has slotKinds: ['identity'] but displayType '${field.displayType}'. Must be 'id'.`,
          );

          if (field.paths) {
            for (const [key, prop] of Object.entries(field.paths)) {
              for (const pattern of BANNED_IDENTITY_PATH_PATTERNS) {
                assert.doesNotMatch(
                  key,
                  pattern,
                  `${file}: field '${field.id}' identity path key '${key}' maps a person/staff attribution.`,
                );
                assert.doesNotMatch(
                  prop,
                  pattern,
                  `${file}: field '${field.id}' identity property path '${prop}' maps a person/staff attribution.`,
                );
              }
            }
          }

          assert.doesNotThrow(
            () => assertValidIdentityFieldDef(field),
            `${file}: field '${field.id}' must pass assertValidIdentityFieldDef.`,
          );
        }
      }
    }
  });

  it('ordersCompoundView never routes staff names into orderId or identityFace', () => {
    const mockOrder = {
      id: 99999,
      order_id: 'ORDER-100200',
      item_number: 'ITEM-88',
      product_title: 'Test Component',
      shipping_tracking_number: '1Z9999999999',
      notes: null,
      tester_name: 'David',
      packed_by_name: 'Thuy',
      tested_by_name: 'David',
      shipped_out_by_name: 'David',
    } as unknown as ShippedOrder;

    const view = ordersCompoundView(mockOrder, {
      stateLabel: 'OPEN',
      delayDays: 0,
      testerDisplay: 'David',
      packerDisplay: 'Thuy',
    });

    // ID column attributes
    assert.equal(view.orderId, 'ORDER-100200');
    assert.notEqual(view.orderId, 'David');
    assert.notEqual(view.orderId, 'Thuy');

    if (view.identityFace) {
      assert.notEqual(view.identityFace.value, 'David');
      assert.notEqual(view.identityFace.value, 'Thuy');
      for (const prop of BANNED_IDENTITY_ROW_PROPERTIES) {
        assert.notEqual(view.identityFace.value, prop);
      }
    }
  });
});
