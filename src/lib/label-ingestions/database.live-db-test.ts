import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { Client } from 'pg';

const ORG_A = 'a1111111-1111-4111-8111-111111111111';
const ORG_B = 'b2222222-2222-4222-8222-222222222222';
const EVENT_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const EVENT_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);

function requiredDisposableUrl(name: 'V1_TEST_DATABASE_URL' | 'V1_TEST_TENANT_DATABASE_URL'): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required; V1 database tests never silently skip`);
  if (process.env.V1_TEST_DATABASE_KIND !== 'disposable') {
    throw new Error('V1_TEST_DATABASE_KIND must be exactly "disposable"');
  }
  const parsed = new URL(value);
  if (/(^|[-_.\/])(prod|production)([-_.\/]|$)/i.test(`${parsed.hostname}/${parsed.pathname}`)) {
    throw new Error(`${name} points at a production-looking target`);
  }
  return value;
}

async function setOrganization(client: Client, organizationId: string): Promise<void> {
  await client.query("SELECT set_config('app.current_org', $1, true)", [organizationId]);
}

async function inTenantTransaction<T>(
  client: Client,
  organizationId: string,
  fn: () => Promise<T>,
): Promise<T> {
  await client.query('BEGIN');
  try {
    await setOrganization(client, organizationId);
    const result = await fn();
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

async function expectSqlState(
  client: Client,
  operation: () => Promise<unknown>,
  expected: string,
): Promise<void> {
  await client.query('SAVEPOINT v1_expected_failure');
  try {
    await assert.rejects(operation(), (error: unknown) => {
      assert.equal((error as { code?: string }).code, expected);
      return true;
    });
  } finally {
    await client.query('ROLLBACK TO SAVEPOINT v1_expected_failure');
    await client.query('RELEASE SAVEPOINT v1_expected_failure');
  }
}

describe('V1 label-ingestion live database invariants', () => {
  const owner = new Client({ connectionString: requiredDisposableUrl('V1_TEST_DATABASE_URL') });
  const tenant = new Client({ connectionString: requiredDisposableUrl('V1_TEST_TENANT_DATABASE_URL') });
  let deviceA = 0;
  let deviceB = 0;

  before(async () => {
    await owner.connect();
    await tenant.connect();
    for (const organizationId of [ORG_A, ORG_B]) {
      await inTenantTransaction(owner, organizationId, async () => {
        await owner.query('DELETE FROM label_ingestion_orders WHERE organization_id = $1', [organizationId]);
        await owner.query('DELETE FROM label_ingestions WHERE organization_id = $1', [organizationId]);
        await owner.query('DELETE FROM desktop_devices WHERE organization_id = $1', [organizationId]);
      });
    }
    deviceA = await inTenantTransaction(owner, ORG_A, async () => {
      const result = await owner.query<{ id: string }>(
        `INSERT INTO desktop_devices (organization_id, label, platform)
         VALUES ($1, 'V1 test A', 'LINUX') RETURNING id`,
        [ORG_A],
      );
      return Number(result.rows[0].id);
    });
    deviceB = await inTenantTransaction(owner, ORG_B, async () => {
      const result = await owner.query<{ id: string }>(
        `INSERT INTO desktop_devices (organization_id, label, platform)
         VALUES ($1, 'V1 test B', 'LINUX') RETURNING id`,
        [ORG_B],
      );
      return Number(result.rows[0].id);
    });
  });

  after(async () => {
    for (const organizationId of [ORG_A, ORG_B]) {
      await inTenantTransaction(owner, organizationId, async () => {
        await owner.query('DELETE FROM label_ingestion_orders WHERE organization_id = $1', [organizationId]);
        await owner.query('DELETE FROM label_ingestions WHERE organization_id = $1', [organizationId]);
        await owner.query('DELETE FROM desktop_devices WHERE organization_id = $1', [organizationId]);
      });
    }
    await tenant.end();
    await owner.end();
  });

  test('enforces hash and client-event idempotency per tenant, not globally', async () => {
    await inTenantTransaction(owner, ORG_A, async () => {
      await owner.query(
        `INSERT INTO label_ingestions (
           organization_id, device_id, client_event_id, sha256, file_basename,
           byte_size, observed_at, source
         ) VALUES ($1, $2, $3, $4, 'a.pdf', 10, now(), 'BROWSER_FIXTURE')`,
        [ORG_A, deviceA, EVENT_A, HASH_A],
      );

      await expectSqlState(
        owner,
        () => owner.query(
          `INSERT INTO label_ingestions (
             organization_id, device_id, client_event_id, sha256, file_basename,
             byte_size, observed_at, source
           ) VALUES ($1, $2, $3, $4, 'duplicate-hash.pdf', 10, now(), 'BROWSER_FIXTURE')`,
          [ORG_A, deviceA, EVENT_B, HASH_A],
        ),
        '23505',
      );
    });

    await inTenantTransaction(owner, ORG_A, async () => {
      await expectSqlState(
        owner,
        () => owner.query(
          `INSERT INTO label_ingestions (
             organization_id, device_id, client_event_id, sha256, file_basename,
             byte_size, observed_at, source
           ) VALUES ($1, $2, $3, $4, 'duplicate-event.pdf', 10, now(), 'BROWSER_FIXTURE')`,
          [ORG_A, deviceA, EVENT_A, HASH_B],
        ),
        '23505',
      );
    });

    await inTenantTransaction(owner, ORG_B, async () => {
      await owner.query(
        `INSERT INTO label_ingestions (
           organization_id, device_id, client_event_id, sha256, file_basename,
           byte_size, observed_at, source
         ) VALUES ($1, $2, $3, $4, 'same-bytes-other-tenant.pdf', 10, now(), 'BROWSER_FIXTURE')`,
        [ORG_B, deviceB, EVENT_A, HASH_A],
      );
    });
  });

  test('denies cross-tenant reads and writes through the non-bypass tenant role', async () => {
    await tenant.query('BEGIN');
    try {
      await setOrganization(tenant, ORG_A);
      const visible = await tenant.query<{ organization_id: string }>(
        'SELECT organization_id FROM desktop_devices ORDER BY id',
      );
      assert.ok(visible.rows.length >= 1);
      assert.ok(visible.rows.every((row) => row.organization_id === ORG_A));

      const crossTenantUpdate = await tenant.query(
        `UPDATE desktop_devices
            SET label = 'cross-tenant update'
          WHERE organization_id = $1
            AND id = $2
        RETURNING id`,
        [ORG_B, deviceB],
      );
      assert.equal(crossTenantUpdate.rowCount, 0);

      await expectSqlState(
        tenant,
        () => tenant.query(
          `INSERT INTO desktop_devices (id, organization_id, public_id, label, platform)
           VALUES (900000000000000000, $1, $2, 'cross-tenant write', 'LINUX')`,
          [ORG_B, 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'],
        ),
        '42501',
      );
    } finally {
      await tenant.query('ROLLBACK');
    }
  });

  test('rejects a cross-tenant composite foreign-key link even for the owner role', async () => {
    await owner.query('BEGIN');
    try {
      await setOrganization(owner, ORG_A);
      await expectSqlState(
        owner,
        () => owner.query(
          `INSERT INTO label_ingestions (
             organization_id, device_id, client_event_id, sha256, file_basename,
             byte_size, observed_at, source
           ) VALUES ($1, $2, $3, $4, 'cross-link.pdf', 10, now(), 'BROWSER_FIXTURE')`,
          [ORG_A, deviceB, 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'd'.repeat(64)],
        ),
        '23503',
      );
    } finally {
      await owner.query('ROLLBACK');
    }
  });
});
