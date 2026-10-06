import assert from 'node:assert/strict';
import test from 'node:test';
import type { OrgId } from '@/lib/tenancy/constants';
import { PRINT_FILE_SORTS, printFileQuerySchema } from './print-file-contracts';
import { printFilesParams, printFilesSql } from './print-files';

const ORG = '00000000-0000-0000-0000-000000000001' as OrgId;

test('tenant isolation: every table the file list reads is predicated on the org ($1)', () => {
  for (const sort of PRINT_FILE_SORTS) {
    const sql = printFilesSql(sort).replace(/\s+/g, ' ');
    const ctes = new Set([...sql.matchAll(/(?:WITH|,)\s*(\w+) AS \(/g)].map((m) => m[1]));
    const reads = [...sql.matchAll(/\b(?:FROM|JOIN)\s+(\w+)(?:\s+(?!ON\b|WHERE\b|JOIN\b|LEFT\b|CROSS\b|GROUP\b|ORDER\b)(\w+))?/g)]
      .filter((m) => !ctes.has(m[1]) && !/^LATERAL$/i.test(m[1]));
    const tables = new Set(reads.map((m) => m[1]));
    for (const table of ['label_batches', 'label_ingestions', 'documents', 'document_entity_links', 'orders', 'label_print_events', 'paperwork_print_events', 'staff']) {
      assert.ok(tables.has(table), `expected the file list to read ${table}`);
    }
    for (const [, table, alias] of reads) {
      assert.ok(alias, `${table} is read without an alias, so its org predicate cannot be checked`);
      assert.match(sql, new RegExp(`\\b${alias}\\.organization_id = (\\$1\\b|\\w+\\.organization_id)`), `${table} ${alias} is not predicated on organization_id`);
    }
  }
});

test('params: org first, civil-day windows as instants, Find escaped, status and paging last', () => {
  const params = printFilesParams(
    ORG,
    printFileQuerySchema.parse({ q: '50%_off', from: '2026-10-06', to: '2026-10-06', printedFrom: '2026-10-05', printing: 'partly', limit: '25', offset: '50' }),
  );
  assert.deepEqual(params, [
    ORG,
    '2026-10-06T07:00:00.000Z',
    '2026-10-07T07:00:00.000Z',
    '2026-10-05T07:00:00.000Z',
    null,
    '%50\\%\\_off%',
    'partly',
    25,
    50,
    null,
  ]);
  const blank = printFilesParams(ORG, printFileQuerySchema.parse({ q: '   ' }), 7);
  assert.equal(blank[5], null);
  assert.equal(blank[6], null);
  assert.equal(blank[9], 7);
});

test('sort: last printed puts never-printed files last', () => {
  assert.match(printFilesSql('last-printed'), /ORDER BY r\.last_printed_at DESC NULLS LAST/);
  assert.match(printFilesSql('oldest'), /ORDER BY r\.uploaded_at ASC/);
});
