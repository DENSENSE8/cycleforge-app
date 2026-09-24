import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const migrationPath = join(
  repoRoot,
  'src/lib/migrations/2026-09-18_v1_label_ingestions.sql',
);
const expectedTables = ['desktop_devices', 'label_ingestions', 'label_ingestion_orders'] as const;

type ExpectedColumn = readonly [dataType: string, nullable: boolean];

const expectedColumns: Record<(typeof expectedTables)[number], Record<string, ExpectedColumn>> = {
  desktop_devices: {
    id: ['bigint', false],
    organization_id: ['uuid', false],
    public_id: ['uuid', false],
    label: ['text', false],
    status: ['text', false],
    platform: ['text', false],
    app_version: ['character varying', true],
    enroll_code_hash: ['character varying', true],
    enroll_code_expires_at: ['timestamp with time zone', true],
    device_token_hash: ['character varying', true],
    enrolled_by_staff_id: ['integer', true],
    last_seen_at: ['timestamp with time zone', true],
    revoked_at: ['timestamp with time zone', true],
    created_at: ['timestamp with time zone', false],
    updated_at: ['timestamp with time zone', false],
  },
  label_ingestions: {
    id: ['bigint', false],
    organization_id: ['uuid', false],
    device_id: ['bigint', true],
    actor_staff_id: ['integer', true],
    client_event_id: ['uuid', false],
    sha256: ['character varying', false],
    file_basename: ['text', false],
    byte_size: ['bigint', false],
    observed_at: ['timestamp with time zone', false],
    source: ['text', false],
    state: ['text', false],
    parser_version: ['text', true],
    match_method: ['text', true],
    detected_cycleforge_reference: ['text', true],
    matched_account_source: ['text', true],
    matched_marketplace_order_id: ['text', true],
    tracking_number_raw: ['text', true],
    tracking_number_normalized: ['text', true],
    carrier: ['text', true],
    staged_storage_provider: ['text', true],
    staged_object_key: ['text', true],
    mime_type: ['text', false],
    matched_order_id: ['integer', true],
    shipment_id: ['bigint', true],
    document_id: ['integer', true],
    quarantine_reason_code: ['text', true],
    attempt_count: ['integer', false],
    row_version: ['integer', false],
    error_code: ['text', true],
    error_detail: ['text', true],
    applied_at: ['timestamp with time zone', true],
    created_at: ['timestamp with time zone', false],
    updated_at: ['timestamp with time zone', false],
  },
  label_ingestion_orders: {
    organization_id: ['uuid', false],
    ingestion_id: ['bigint', false],
    order_id: ['integer', false],
    ordinal: ['integer', false],
    link_role: ['text', false],
    created_at: ['timestamp with time zone', false],
  },
};

const requiredConstraints: Record<string, readonly string[]> = {
  desktop_devices: [
    'desktop_devices_pkey',
    'desktop_devices_org_public_uniq',
    'desktop_devices_org_id_uniq',
    'desktop_devices_staff_org_fk',
    'desktop_devices_label_chk',
    'desktop_devices_status_chk',
    'desktop_devices_platform_chk',
    'desktop_devices_status_fields_chk',
  ],
  label_ingestions: [
    'label_ingestions_pkey',
    'label_ingestions_org_id_uniq',
    'label_ingestions_org_device_fk',
    'label_ingestions_org_actor_fk',
    'label_ingestions_org_order_fk',
    'label_ingestions_org_shipment_fk',
    'label_ingestions_org_document_fk',
    'label_ingestions_sha256_chk',
    'label_ingestions_state_chk',
    'label_ingestions_match_method_chk',
    'label_ingestions_applied_chk',
  ],
  label_ingestion_orders: [
    'label_ingestion_orders_pk',
    'label_ingestion_orders_org_ingestion_fk',
    'label_ingestion_orders_org_order_fk',
    'label_ingestion_orders_ingestion_ordinal_uniq',
  ],
};

const requiredIndexes: Record<string, readonly string[]> = {
  desktop_devices: [
    'desktop_devices_org_public_uniq',
    'desktop_devices_org_id_uniq',
    'ux_desktop_devices_org_enroll_hash',
    'ux_desktop_devices_org_token_hash',
    'idx_desktop_devices_org_status',
    'idx_desktop_devices_org_seen',
  ],
  label_ingestions: [
    'label_ingestions_org_id_uniq',
    'ux_label_ingestions_org_sha256',
    'ux_label_ingestions_org_client_event',
    'idx_label_ingestions_org_state_observed',
    'idx_label_ingestions_org_order_identity',
    'idx_label_ingestions_org_device_observed',
  ],
  label_ingestion_orders: [
    'label_ingestion_orders_pk',
    'label_ingestion_orders_ingestion_ordinal_uniq',
    'idx_label_ingestion_orders_org_order',
    'idx_label_ingestion_orders_org_ingestion',
  ],
};

function fail(message: string): never {
  throw new Error(`verify:v1:schema: ${message}`);
}

function normalizedSql(value: string | null | undefined): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function assertDisposableTarget(connectionString: string): URL {
  if (process.env.V1_TEST_DATABASE_KIND !== 'disposable') {
    fail('V1_TEST_DATABASE_KIND must be exactly "disposable"');
  }
  if (process.env.V1_TEST_DATABASE_CONFIRM !== 'APPLY_V1_MIGRATION') {
    fail('V1_TEST_DATABASE_CONFIRM must be exactly "APPLY_V1_MIGRATION"');
  }

  const parsed = new URL(connectionString);
  const lowerIdentity = `${parsed.hostname}/${parsed.pathname}`.toLowerCase();
  if (/(^|[-_.\/])(prod|production)([-_.\/]|$)/.test(lowerIdentity)) {
    fail(`refusing production-looking database target ${parsed.hostname}${parsed.pathname}`);
  }
  for (const [name, candidate] of [
    ['DATABASE_URL', process.env.DATABASE_URL],
    ['TENANT_APP_DATABASE_URL', process.env.TENANT_APP_DATABASE_URL],
  ] as const) {
    if (candidate && candidate === connectionString) {
      fail(`V1_TEST_DATABASE_URL must not equal ${name}`);
    }
  }
  return parsed;
}

async function verify(): Promise<void> {
  const connectionString = process.env.V1_TEST_DATABASE_URL;
  if (!connectionString) fail('V1_TEST_DATABASE_URL is required; no gate may silently skip live catalog proof');
  const parsed = assertDisposableTarget(connectionString);
  const client = new Client({ connectionString, application_name: 'cycleforge-v1-schema-verifier' });
  await client.connect();

  try {
    const identity = await client.query<{ database: string; role: string }>(
      'SELECT current_database() AS database, current_user AS role',
    );
    const database = identity.rows[0]?.database ?? '';
    if (/(^|[-_.])(prod|production)([-_.]|$)/i.test(database)) {
      fail(`refusing production-looking current_database ${database}`);
    }

    await client.query(readFileSync(migrationPath, 'utf8'));

    const columns = await client.query<{
      table_name: string;
      column_name: string;
      data_type: string;
      is_nullable: 'YES' | 'NO';
      column_default: string | null;
    }>(
      `SELECT table_name, column_name, data_type, is_nullable, column_default
         FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = ANY($1::text[])
        ORDER BY table_name, ordinal_position`,
      [expectedTables],
    );

    for (const table of expectedTables) {
      const actual = columns.rows.filter((row) => row.table_name === table);
      const expected = expectedColumns[table];
      if (actual.length !== Object.keys(expected).length) {
        fail(`${table} has ${actual.length} columns; expected ${Object.keys(expected).length}`);
      }
      for (const [name, [type, nullable]] of Object.entries(expected)) {
        const row = actual.find((candidate) => candidate.column_name === name);
        if (!row) fail(`${table}.${name} is missing`);
        if (row.data_type !== type || (row.is_nullable === 'YES') !== nullable) {
          fail(`${table}.${name} is ${row.data_type}/${row.is_nullable}; expected ${type}/${nullable ? 'YES' : 'NO'}`);
        }
      }
      const org = actual.find((row) => row.column_name === 'organization_id');
      const expectedDefault = "(nullif(current_setting('app.current_org'::text, true), ''::text))::uuid";
      if (normalizedSql(org?.column_default) !== expectedDefault) {
        fail(`${table}.organization_id does not carry the canonical loud-fail tenant default`);
      }
    }

    const constraints = await client.query<{
      table_name: string;
      constraint_name: string;
      definition: string;
    }>(
      `SELECT c.relname AS table_name,
              con.conname AS constraint_name,
              pg_get_constraintdef(con.oid, true) AS definition
         FROM pg_constraint con
         JOIN pg_class c ON c.oid = con.conrelid
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND c.relname = ANY($1::text[])
        ORDER BY c.relname, con.conname`,
      [expectedTables],
    );
    for (const [table, names] of Object.entries(requiredConstraints)) {
      const present = new Set(
        constraints.rows.filter((row) => row.table_name === table).map((row) => row.constraint_name),
      );
      for (const name of names) if (!present.has(name)) fail(`${table} is missing constraint ${name}`);
    }

    const tenantForeignKeys = constraints.rows.filter((row) =>
      row.constraint_name.includes('_org_') && normalizedSql(row.definition).startsWith('foreign key'),
    );
    for (const row of tenantForeignKeys) {
      if (!normalizedSql(row.definition).startsWith('foreign key (organization_id,')) {
        fail(`${row.constraint_name} does not lead with organization_id`);
      }
    }

    const indexes = await client.query<{ table_name: string; index_name: string; definition: string }>(
      `SELECT c.relname AS table_name,
              i.relname AS index_name,
              pg_get_indexdef(i.oid) AS definition
         FROM pg_index x
         JOIN pg_class c ON c.oid = x.indrelid
         JOIN pg_class i ON i.oid = x.indexrelid
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND c.relname = ANY($1::text[])
        ORDER BY c.relname, i.relname`,
      [expectedTables],
    );
    for (const [table, names] of Object.entries(requiredIndexes)) {
      const present = new Set(
        indexes.rows.filter((row) => row.table_name === table).map((row) => row.index_name),
      );
      for (const name of names) if (!present.has(name)) fail(`${table} is missing index ${name}`);
    }
    for (const indexName of ['ux_label_ingestions_org_sha256', 'ux_label_ingestions_org_client_event']) {
      const definition = normalizedSql(indexes.rows.find((row) => row.index_name === indexName)?.definition ?? '');
      if (!definition.includes('unique index') || !definition.includes('(organization_id,')) {
        fail(`${indexName} is not tenant-first unique`);
      }
    }

    const rls = await client.query<{
      table_name: string;
      relrowsecurity: boolean;
      relforcerowsecurity: boolean;
    }>(
      `SELECT c.relname AS table_name, c.relrowsecurity, c.relforcerowsecurity
         FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND c.relname = ANY($1::text[])
        ORDER BY c.relname`,
      [expectedTables],
    );
    for (const table of expectedTables) {
      const row = rls.rows.find((candidate) => candidate.table_name === table);
      if (!row?.relrowsecurity || !row.relforcerowsecurity) fail(`${table} does not ENABLE and FORCE RLS`);
    }

    const policies = await client.query<{
      tablename: string;
      policyname: string;
      permissive: string;
      roles: string[];
      cmd: string;
      qual: string | null;
      with_check: string | null;
    }>(
      `SELECT tablename, policyname, permissive, roles, cmd, qual, with_check
         FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = ANY($1::text[])
        ORDER BY tablename, policyname`,
      [expectedTables],
    );
    const exactPredicate = normalizedSql(
      "(organization_id = (NULLIF(current_setting('app.current_org'::text, true), ''::text))::uuid)",
    );
    for (const table of expectedTables) {
      const policy = policies.rows.find(
        (candidate) => candidate.tablename === table && candidate.policyname === 'tenant_isolation',
      );
      if (!policy) fail(`${table} is missing tenant_isolation policy`);
      if (
        policy.permissive !== 'PERMISSIVE'
        || policy.cmd !== 'ALL'
        || !policy.roles.includes('public')
        || normalizedSql(policy.qual) !== exactPredicate
        || normalizedSql(policy.with_check) !== exactPredicate
      ) {
        fail(`${table}.tenant_isolation does not exactly match the canonical USING/WITH CHECK policy`);
      }
    }

    console.log(
      `verify:v1:schema PASS — ${expectedTables.length} tables on ${parsed.hostname}/${database} `
      + `(${columns.rows.length} columns, ${constraints.rows.length} constraints, ${indexes.rows.length} indexes, forced RLS).`,
    );
  } finally {
    await client.end();
  }
}

verify().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
