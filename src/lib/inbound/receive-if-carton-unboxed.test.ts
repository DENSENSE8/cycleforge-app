import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  receiveImportedLineIfCartonUnboxed,
  type ReceiveIfCartonUnboxedDeps,
} from './receive-if-carton-unboxed';
import type { OrgId } from '@/lib/tenancy/constants';

const ORG = '00000000-0000-4000-8000-000000000001' as OrgId;

function fakes(row: Record<string, unknown> | null) {
  const received: Array<{ lineId: number; units: number; status: string | null | undefined }> = [];
  const deps: ReceiveIfCartonUnboxedDeps = {
    query: (async () => ({ rows: row ? [row] : [], rowCount: row ? 1 : 0 })) as ReceiveIfCartonUnboxedDeps['query'],
    receiveLineUnits: async (input) => {
      received.push({
        lineId: input.receiving_line_id,
        units: input.units,
        status: input.set_workflow_status,
      });
      return {
        line_id: input.receiving_line_id,
        units_added: input.units,
        serials_recorded: [],
        ledger_event_ids: [],
        inventory_event_ids: [],
        line_state: {
          id: input.receiving_line_id,
          sku: null,
          item_name: null,
          quantity_received: input.units,
          quantity_expected: input.units,
          workflow_status: 'DONE',
          is_complete: true,
        },
      };
    },
  };
  return { deps, received };
}

describe('receiveImportedLineIfCartonUnboxed', () => {
  it('no-ops when the carton has not been unboxed', async () => {
    const { deps, received } = fakes({
      receiving_id: 9,
      quantity_expected: 1,
      quantity_received: 0,
      workflow_status: 'EXPECTED',
      unboxed_at: null,
      opened_at: null,
      unbox_scan: null,
    });
    const hit = await receiveImportedLineIfCartonUnboxed(ORG, 12, deps);
    assert.equal(hit, null);
    assert.equal(received.length, 0);
  });

  it('local-receives remaining qty to DONE when Unbox already opened the carton', async () => {
    const { deps, received } = fakes({
      receiving_id: 9,
      quantity_expected: 2,
      quantity_received: 0,
      workflow_status: 'EXPECTED',
      unboxed_at: '2026-08-18',
      opened_at: null,
      unbox_scan: null,
    });
    const hit = await receiveImportedLineIfCartonUnboxed(ORG, 12, deps);
    assert.deepEqual(hit, { receivingLineId: 12, receivingId: 9, received: true });
    assert.equal(received.length, 1);
    assert.equal(received[0]?.units, 2);
    assert.equal(received[0]?.status, 'DONE');
  });
});
