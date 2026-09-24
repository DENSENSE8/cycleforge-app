import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { serverOrganizationId } from './types';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const migration = readFileSync(
  join(repoRoot, 'src/lib/migrations/2026-09-18_v1_label_ingestions.sql'),
  'utf8',
);
const applySource = readFileSync(join(repoRoot, 'src/lib/label-ingestions/apply.ts'), 'utf8');

function normalized(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

describe('V1 label-ingestion tenancy red lines', () => {
  test('brands only UUID organization identities resolved by server code', () => {
    assert.equal(
      serverOrganizationId('11111111-1111-4111-8111-111111111111'),
      '11111111-1111-4111-8111-111111111111',
    );
    assert.throws(() => serverOrganizationId('from-request-json'), /not a UUID/);
  });

  test('forces canonical RLS on every new tenant-owned table without a fallback', () => {
    const calls = [...migration.matchAll(/SELECT\s+enforce_tenant_isolation\('([^']+)'\);/gi)]
      .map((match) => match[1]);
    assert.deepEqual(calls, [
      'desktop_devices',
      'label_ingestions',
      'label_ingestion_orders',
    ]);
    assert.doesNotMatch(migration, /EXCEPTION\s+WHEN|RAISE\s+NOTICE[^;]*enforce_tenant_isolation/is);
  });

  test('scopes idempotency and byte identity to organization', () => {
    const sql = normalized(migration);
    assert.match(sql, /ux_label_ingestions_org_sha256 ON label_ingestions \(organization_id, sha256\)/i);
    assert.match(sql, /ux_label_ingestions_org_client_event ON label_ingestions \(organization_id, client_event_id\)/i);
    assert.doesNotMatch(sql, /UNIQUE\s*\(sha256\)/i);
    assert.doesNotMatch(sql, /UNIQUE\s*\(client_event_id\)/i);
  });

  test('uses composite tenant foreign keys for every new cross-table relationship', () => {
    const sql = normalized(migration);
    for (const relationship of [
      'FOREIGN KEY (organization_id, enrolled_by_staff_id) REFERENCES staff (organization_id, id)',
      'FOREIGN KEY (organization_id, device_id) REFERENCES desktop_devices (organization_id, id)',
      'FOREIGN KEY (organization_id, actor_staff_id) REFERENCES staff (organization_id, id)',
      'FOREIGN KEY (organization_id, matched_order_id) REFERENCES orders (organization_id, id)',
      'FOREIGN KEY (organization_id, shipment_id) REFERENCES shipping_tracking_numbers (organization_id, id)',
      'FOREIGN KEY (organization_id, document_id) REFERENCES documents (organization_id, id)',
      'FOREIGN KEY (organization_id, ingestion_id) REFERENCES label_ingestions (organization_id, id)',
      'FOREIGN KEY (organization_id, order_id) REFERENCES orders (organization_id, id)',
    ]) {
      assert.ok(sql.includes(relationship), `missing tenant relationship: ${relationship}`);
    }
  });

  test('contains no fuzzy order-resolution vocabulary or representative-row shortcut', () => {
    assert.doesNotMatch(applySource, /levenshtein|similarity\s*\(|soundex|metaphone|buyer_address|customer_address/i);
    assert.doesNotMatch(applySource, /FROM\s+orders[\s\S]{0,500}\bLIMIT\s+1\b/i);
    assert.match(applySource, /account_source = \$2[\s\S]*order_id = \$3[\s\S]*ORDER BY id ASC[\s\S]*FOR UPDATE/i);
  });

  test('never writes marketplace lifecycle state and always transitions units through the state machine', () => {
    assert.doesNotMatch(applySource, /UPDATE\s+orders[\s\S]{0,200}\bstatus\s*=/i);
    assert.match(applySource, /expectedFrom:\s*'PACKED'/);
    assert.match(applySource, /to:\s*'LABELED'/);
    assert.match(applySource, /transitionUnit\([\s\S]*client,[\s\S]*orgId/);
  });

  test('locks the three mutable row classes in the required global order', () => {
    const orderLock = applySource.indexOf('// First lock class:');
    const allocationLock = applySource.indexOf('// Second lock class:');
    const serialUnitLock = applySource.indexOf('// Third lock class:');
    assert.ok(orderLock >= 0 && allocationLock > orderLock && serialUnitLock > allocationLock);
  });
});
