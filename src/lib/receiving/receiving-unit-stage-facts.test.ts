import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildReceivingUnitStageFactsRefreshSql,
  listReceivingUnitStageFacts,
  receivingUnitQcState,
  refreshReceivingUnitStageFacts,
  type ReceivingStageFactsQueryable,
} from './receiving-unit-stage-facts';
import type { OrgId } from '@/lib/tenancy/constants';

const ORG = '00000000-0000-4000-8000-000000000123' as OrgId;

test('QC projection maps only authoritative verdict vocabulary', () => {
  assert.equal(receivingUnitQcState(null), 'PENDING');
  assert.equal(receivingUnitQcState('PASS'), 'PASSED');
  assert.equal(receivingUnitQcState('TEST_AGAIN'), 'TEST_AGAIN');
  assert.equal(receivingUnitQcState('TESTING_FAILED'), 'FAILED');
  assert.equal(receivingUnitQcState('invented'), 'PENDING');
});

test('refresh SQL derives unit-first ticket, latest verdict, label and triage state', () => {
  const sql = buildReceivingUnitStageFactsRefreshSql('TRUE');
  assert.match(sql, /FROM testing_results tr/);
  assert.match(sql, /ORDER BY tr\.created_at DESC, tr\.id DESC/);
  assert.match(sql, /FROM label_print_jobs lpj/);
  assert.match(sql, /CASE tl\.entity_type WHEN 'SERIAL_UNIT' THEN 0 WHEN 'RECEIVING_LINE' THEN 1 ELSE 2 END/);
  assert.match(sql, /COALESCE\(rt\.triage_complete, false\)/);
  assert.match(sql, /ON CONFLICT \(organization_id, receiving_line_unit_id\)/);
  assert.match(sql, /IS DISTINCT FROM/);
});

test('target refresh de-duplicates ids and is a no-op without a target', async () => {
  const calls: Array<{ sql: string; params: unknown[] | undefined }> = [];
  const db: ReceivingStageFactsQueryable = {
    query: async (sql, params) => {
      calls.push({ sql, params });
      return { rowCount: 2 };
    },
  };
  assert.equal(await refreshReceivingUnitStageFacts(ORG, {}, db), 0);
  assert.equal(calls.length, 0);

  assert.equal(
    await refreshReceivingUnitStageFacts(
      ORG,
      { lineIds: [7, '7', 0], serialUnitIds: [11, 11], receivingIds: [3] },
      db,
    ),
    2,
  );
  assert.deepEqual(calls[0]?.params, [ORG, [7], [11], [3]]);
});

test('fast read groups projection rows without joining event tables', async () => {
  let capturedSql = '';
  const db: ReceivingStageFactsQueryable = {
    query: async (sql) => {
      capturedSql = sql;
      return {
        rowCount: 1,
        rows: [{
          organization_id: ORG,
          receiving_line_unit_id: '101',
          receiving_line_id: 7,
          receiving_id: 3,
          ordinal: 1,
          serial_unit_id: 11,
          unit_uid: 'BOSE251-2639-000001',
          serial: 'SN-11',
          condition_grade: 'USED_A',
          triage_state: 'TRIAGED',
          label_state: 'PRINTED',
          qc_state: 'PASSED',
          latest_verdict: 'PASS',
          tested_at: '2026-09-29T12:00:00.000Z',
          tested_by: 5,
          tested_by_name: 'Alex',
          primary_support_ticket_id: null,
          projection_version: 1,
          updated_at: '2026-09-29T12:00:01.000Z',
        }],
      };
    },
  };
  const grouped = await listReceivingUnitStageFacts(ORG, [7], db);
  assert.equal(grouped.get(7)?.[0]?.receiving_line_unit_id, 101);
  assert.equal(grouped.get(7)?.[0]?.qc_state, 'PASSED');
  assert.equal(grouped.get(7)?.[0]?.serial, 'SN-11');
  assert.equal(grouped.get(7)?.[0]?.tested_by_name, 'Alex');
  assert.match(capturedSql, /FROM receiving_unit_stage_facts/);
  assert.match(capturedSql, /JOIN receiving_line_unit/);
  assert.doesNotMatch(capturedSql, /testing_results|label_print_jobs|ticket_links/);
});
