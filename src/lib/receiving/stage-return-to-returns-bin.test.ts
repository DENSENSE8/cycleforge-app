import assert from 'node:assert/strict';
import { describe, it, beforeEach, mock } from 'node:test';
import { stageReturnCartonToReturnsTestBin } from '@/lib/receiving/stage-return-to-returns-bin';

describe('stageReturnCartonToReturnsTestBin', () => {
  beforeEach(() => {
    mock.restoreAll();
  });

  it('skips non-return intake', async () => {
    const result = await stageReturnCartonToReturnsTestBin({
      receivingId: 42,
      row: {
        id: 1,
        intake_type: null,
        receiving_type: 'PO',
        carton_intake_type: 'PO',
        staging_location_id: null,
      },
    });
    assert.equal(result, 'skipped_not_return');
  });

  it('skips when already staged', async () => {
    const result = await stageReturnCartonToReturnsTestBin({
      receivingId: 42,
      row: {
        id: 1,
        intake_type: null,
        receiving_type: 'RETURN',
        carton_intake_type: 'RETURN',
        staging_location_id: 99,
      },
    });
    assert.equal(result, 'skipped_already_staged');
  });

  it('stages return carton to RETURNS-TEST', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    mock.method(globalThis, 'fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, init });
      if (url.includes('/api/receiving/returns-test-bin')) {
        return new Response(JSON.stringify({ location: { id: 77, barcode: 'RETURNS-TEST' } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (/\/api\/receiving\/\d+$/.test(url)) {
        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response('not found', { status: 404 });
    });

    const result = await stageReturnCartonToReturnsTestBin({
      receivingId: 42,
      row: {
        id: 7,
        intake_type: null,
        receiving_type: 'RETURN',
        carton_intake_type: 'RETURN',
        staging_location_id: null,
      },
    });
    assert.equal(result, 'staged');
    assert.equal(calls.length, 2);
    assert.match(calls[0]!.url, /\/api\/receiving\/returns-test-bin/);
    assert.match(calls[1]!.url, /\/api\/receiving\/42$/);
    const body = JSON.parse(String(calls[1]!.init?.body ?? '{}'));
    assert.equal(body.staging_location_id, 77);
    assert.equal(body.priority_lane, 'RETURN');
  });

  it('returns no_bin when location is missing', async () => {
    mock.method(globalThis, 'fetch', async () =>
      new Response(JSON.stringify({ error: 'Bin not found' }), { status: 404 }),
    );
    const result = await stageReturnCartonToReturnsTestBin({
      receivingId: 42,
      row: {
        id: 7,
        intake_type: null,
        receiving_type: 'RETURN',
        carton_intake_type: 'RETURN',
        staging_location_id: null,
      },
    });
    assert.equal(result, 'no_bin');
  });
});
