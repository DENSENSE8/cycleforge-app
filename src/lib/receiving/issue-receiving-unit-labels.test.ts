import assert from 'node:assert/strict';
import test from 'node:test';
import type { PoolClient } from 'pg';
import {
  issueReceivingUnitLabels,
  receivingUnitLabelEventId,
  receivingUnitSyntheticSerial,
  type IssueReceivingUnitLabelsDeps,
} from './issue-receiving-unit-labels';
import type { OrgId } from '@/lib/tenancy/constants';

const ORG = '00000000-0000-4000-8000-000000000123' as OrgId;

test('receiving physical-unit storage serial is stable and slot-scoped', () => {
  assert.equal(receivingUnitSyntheticSerial(42), 'AUTO-RLU-42');
  assert.throws(() => receivingUnitSyntheticSerial(0));
});

test('receiving label print key is stable per unit and issuance', () => {
  assert.equal(
    receivingUnitLabelEventId(12, 42, 'event_1234'),
    'receiving-label:12:42:event_1234',
  );
  assert.notEqual(
    receivingUnitLabelEventId(12, 42, 'event_1234'),
    receivingUnitLabelEventId(12, 43, 'event_1234'),
  );
});

test('quantity three mints three durable identities and a retry reuses them', async () => {
  type Slot = {
    id: number;
    ordinal: number;
    serialUnitId: number | null;
    serial: string | null;
    uid: string | null;
  };
  const slots: Slot[] = [];
  let upsertCalls = 0;
  const refreshTargets: number[][] = [];

  const client = {
    query: async <T>(sql: string, params?: unknown[]) => {
      if (sql.includes('FROM receiving_line rl')) {
        return {
          rows: [{
            id: 7,
            sku: 'BOSE-251',
            item_name: 'Bose 251 speakers',
            quantity_expected: 3,
            quantity_received: 0,
            sku_catalog_id: 51,
            catalog_product_title: 'Bose 251 Environmental Speakers',
            zoho_item_title: null,
            line_condition: 'USED_A',
          }] as T[],
          rowCount: 1,
        };
      }
      if (sql.includes('SELECT id, ordinal') && sql.includes('receiving_line_unit')) {
        return {
          rows: slots.map((slot) => ({ id: slot.id, ordinal: slot.ordinal })) as T[],
          rowCount: slots.length,
        };
      }
      if (sql.includes('INSERT INTO receiving_line_unit')) {
        for (const ordinal of (params?.[2] as number[]) ?? []) {
          slots.push({ id: 100 + ordinal, ordinal, serialUnitId: null, serial: null, uid: null });
        }
        return { rows: [] as T[], rowCount: 0 };
      }
      if (sql.includes('SELECT rlu.id')) {
        return {
          rows: slots.map((slot) => ({
            id: slot.id,
            ordinal: slot.ordinal,
            serial_unit_id: slot.serialUnitId,
            serial_absent: false,
            condition_grade: null,
            serial_number: slot.serial,
            unit_uid: slot.uid,
            current_status: slot.serialUnitId ? 'LABELED' : null,
            print_count: slot.serialUnitId ? 1 : 0,
          })) as T[],
          rowCount: slots.length,
        };
      }
      if (sql.includes('UPDATE receiving_line_unit')) {
        const serialUnitId = Number(params?.[0]);
        const lineUnitId = Number(params?.[1]);
        const slot = slots.find((candidate) => candidate.id === lineUnitId);
        if (slot) {
          slot.serialUnitId = serialUnitId;
          slot.serial = receivingUnitSyntheticSerial(slot.id);
          slot.uid = `BOSE251-2639-${String(slot.ordinal).padStart(6, '0')}`;
        }
        return { rows: [] as T[], rowCount: slot ? 1 : 0 };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  } as unknown as PoolClient;

  const upsertUnit: IssueReceivingUnitLabelsDeps['upsertUnit'] = async (input) => {
    upsertCalls += 1;
    const lineUnitId = Number(input.serial_number.replace('AUTO-RLU-', ''));
    const slot = slots.find((candidate) => candidate.id === lineUnitId);
    assert.ok(slot);
    const id = 1000 + slot.ordinal;
    const uid = `BOSE251-2639-${String(slot.ordinal).padStart(6, '0')}`;
    return {
      is_new: true,
      prior_status: null,
      is_return: false,
      warnings: [],
      unit: {
        id,
        serial_number: input.serial_number,
        normalized_serial: input.serial_number,
        sku: input.sku ?? null,
        sku_catalog_id: input.sku_catalog_id ?? null,
        unit_uid: uid,
        zoho_item_id: null,
        current_status: 'LABELED',
        current_location: null,
        condition_grade: input.condition_grade ?? null,
        received_at: null,
        received_by: null,
        notes: null,
        metadata: {},
        created_at: '2026-09-29T00:00:00.000Z',
        updated_at: '2026-09-29T00:00:00.000Z',
      },
    };
  };
  const deps: IssueReceivingUnitLabelsDeps = {
    transaction: async (_orgId, fn) => fn(client),
    upsertUnit,
    refreshFacts: async (_orgId, target) => {
      refreshTargets.push((target.lineIds ?? []).map(Number));
      return 0;
    },
  };

  const first = await issueReceivingUnitLabels(
    { lineId: 7, issuanceVersion: 'issue_0001', actorStaffId: 3 },
    ORG,
    deps,
  );
  assert.equal(first.quantity, 3);
  assert.equal(new Set(first.labels.map((label) => label.unitUid)).size, 3);
  assert.deepEqual(first.labels.map((label) => label.serialNumber), [null, null, null]);

  const retry = await issueReceivingUnitLabels(
    { lineId: 7, issuanceVersion: 'issue_0002', actorStaffId: 3 },
    ORG,
    deps,
  );
  assert.deepEqual(
    retry.labels.map((label) => label.unitUid),
    first.labels.map((label) => label.unitUid),
  );
  assert.equal(upsertCalls, 3, 'identified units bypass upsert on reprint');
  assert.ok(retry.labels.every((label) => label.isReprint));
  assert.deepEqual(refreshTargets, [[7], [7]]);
});
