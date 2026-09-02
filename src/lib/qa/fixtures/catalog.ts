/**
 * Known QA fixture entities — metadata for reset/cleanup.
 *
 * Prefixes (QA- / TEST-) are for humans. Cleanup keys off these identifiers
 * plus qa_fixture_records rows.
 */

import {
  QA_DEMO_ORDER_VOLUME,
  QA_FIXTURE_ORDERS,
  QA_FIXTURE_PO_ID,
  QA_FIXTURE_PO_NUMBER,
  QA_FIXTURE_SKUS,
  QA_FIXTURE_TESTING_LINE,
  QA_FIXTURE_TESTED_LINE,
  QA_FIXTURE_TRACKING,
  QA_FIXTURE_UNIT,
  QA_FIXTURE_ZOHO_ITEM,
  qaDemoOrderId,
} from '@/lib/tenancy/qa-org';

export interface FixtureEntityRef {
  table: string;
  entityId: string;
  scenarioId: string;
  label: string;
}

export function listKnownFixtureEntities(): FixtureEntityRef[] {
  const out: FixtureEntityRef[] = [
    { table: 'orders', entityId: QA_FIXTURE_ORDERS.awaiting, scenarioId: 'fixtures.e2e-outbound', label: 'E2E awaiting order' },
    { table: 'orders', entityId: QA_FIXTURE_ORDERS.pending, scenarioId: 'fixtures.e2e-outbound', label: 'E2E pending order' },
    { table: 'orders', entityId: QA_FIXTURE_ORDERS.pendingSecond, scenarioId: 'fixtures.e2e-outbound', label: 'E2E pending order #2' },
    { table: 'orders', entityId: QA_FIXTURE_ORDERS.pendingThird, scenarioId: 'fixtures.e2e-outbound', label: 'E2E pending order #3' },
    { table: 'orders', entityId: QA_FIXTURE_ORDERS.packed, scenarioId: 'fixtures.e2e-outbound', label: 'E2E packed order' },
    { table: 'receiving_shipments', entityId: QA_FIXTURE_TRACKING, scenarioId: 'fixtures.receiving-carton', label: 'Receiving tracking' },
    { table: 'purchase_orders', entityId: QA_FIXTURE_PO_ID, scenarioId: 'fixtures.receiving-carton', label: 'Receiving PO id' },
    { table: 'purchase_orders', entityId: QA_FIXTURE_PO_NUMBER, scenarioId: 'zoho.new-purchase-order', label: 'Receiving PO number' },
    { table: 'sku_catalog', entityId: QA_FIXTURE_SKUS.speaker, scenarioId: 'fixtures.receiving-carton', label: 'Speaker SKU' },
    { table: 'sku_catalog', entityId: QA_FIXTURE_SKUS.earbuds, scenarioId: 'fixtures.e2e-outbound', label: 'Earbuds SKU' },
    { table: 'items', entityId: QA_FIXTURE_ZOHO_ITEM.zohoItemId, scenarioId: 'zoho.new-purchase-order', label: 'Zoho item mirror' },
    { table: 'receiving_lines', entityId: QA_FIXTURE_TESTING_LINE.lineId, scenarioId: 'fixtures.receiving-carton', label: 'Needs-test line' },
    { table: 'receiving_lines', entityId: QA_FIXTURE_TESTED_LINE.lineId, scenarioId: 'fixtures.receiving-carton', label: 'Tested line' },
    { table: 'serial_units', entityId: QA_FIXTURE_UNIT.unitUid, scenarioId: 'fixtures.e2e-outbound', label: 'Pack-placement unit' },
  ];

  for (const lane of ['awaiting', 'pending', 'packed', 'shipped'] as const) {
    const n = QA_DEMO_ORDER_VOLUME[lane];
    for (let i = 0; i < n; i++) {
      out.push({
        table: 'orders',
        entityId: qaDemoOrderId(lane, i),
        scenarioId: 'fixtures.demo-volume',
        label: `Demo ${lane} ${i + 1}`,
      });
    }
  }
  return out;
}

export function fixtureEntitiesForScenario(scenarioId: string): FixtureEntityRef[] {
  return listKnownFixtureEntities().filter((e) => e.scenarioId === scenarioId);
}

export function demoOrderIdPattern(): string {
  return 'QA-DEMO-ORD-%';
}

export function e2eOrderIds(): string[] {
  return Object.values(QA_FIXTURE_ORDERS);
}
