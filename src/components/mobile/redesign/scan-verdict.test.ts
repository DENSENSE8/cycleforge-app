import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildScanVerdict,
  scanFailureVerdict,
} from '@/components/mobile/redesign/scan-verdict';
import type { LookupPoResolution } from '@/lib/receiving/scan';

const TRACKING = '1Z999AA10123456784';

function matched(data: Record<string, unknown> = {}): LookupPoResolution {
  return {
    kind: 'matched',
    data: {
      receiving_id: 42,
      po_ids: ['PO-1001'],
      lines: [{ id: 1 }, { id: 2 }],
      unbox_verdict: 'normal',
      ...data,
    },
  };
}

describe('buildScanVerdict — matched', () => {
  it('reads MATCHED with its PO and line count, and cues success', () => {
    const v = buildScanVerdict(TRACKING, matched());
    assert.equal(v.tone, 'matched');
    assert.equal(v.headline, 'MATCHED');
    assert.equal(v.feedback, 'success');
    assert.equal(v.receivingId, 42);
    assert.equal(v.lineCount, 2);
    assert.deepEqual(v.poIds, ['PO-1001']);
    assert.equal(v.detail, 'PO-1001 · 2 lines');
  });

  it('promotes an expedited carton to RUSH and names the waiting count', () => {
    const v = buildScanVerdict(
      TRACKING,
      matched({ unbox_verdict: 'expedited', pending_order_skus: ['SKU-A', 'SKU-B'] }),
    );
    assert.equal(v.tone, 'expedited');
    assert.equal(v.headline, 'RUSH');
    assert.equal(v.feedback, 'success');
    assert.ok(v.detail?.includes('2 awaiting an order'));
  });

  it('flags a multi-PO carton for triage', () => {
    const v = buildScanVerdict(TRACKING, matched({ multi_po_warning: true }));
    assert.ok(v.detail?.includes('multiple POs'));
  });

  it('elides a long PO list rather than overflowing the banner', () => {
    const v = buildScanVerdict(
      TRACKING,
      matched({ po_ids: ['PO-1', 'PO-2', 'PO-3', 'PO-4'] }),
    );
    assert.ok(v.detail?.startsWith('PO-1 · PO-2 +2'));
  });

  it('singularizes a one-line carton', () => {
    const v = buildScanVerdict(TRACKING, matched({ lines: [{ id: 1 }] }));
    assert.ok(v.detail?.endsWith('1 line'));
  });
});

describe('buildScanVerdict — misses', () => {
  it('says an UNFOUND carton was logged, not that the scan failed', () => {
    const v = buildScanVerdict(TRACKING, {
      kind: 'unmatched',
      data: { receiving_id: 77, po_ids: [], lines: [] },
    });
    assert.equal(v.tone, 'unfound');
    assert.equal(v.headline, 'UNFOUND');
    assert.equal(v.receivingId, 77, 'the created carton is reachable from the banner');
    assert.ok(v.detail?.includes('triage'));
    assert.equal(v.feedback, 'reject');
  });

  it('carries the exception reason when triage recorded one', () => {
    const v = buildScanVerdict(TRACKING, {
      kind: 'unmatched',
      data: { receiving_id: 77, exception_reason: 'carrier mismatch' },
    });
    assert.ok(v.detail?.includes('carrier mismatch'));
  });

  it('prefers the server reason on a clean not-found', () => {
    const v = buildScanVerdict('PO-404', {
      kind: 'not_found',
      data: { error: 'No PO found for order number "PO-404"', po_ids: [] },
    });
    assert.equal(v.tone, 'miss');
    assert.equal(v.headline, 'NO MATCH');
    assert.equal(v.detail, 'No PO found for order number "PO-404"');
    assert.equal(v.receivingId, null, 'a clean miss must not point at a phantom carton');
  });

  it('falls back to a plain sentence when the server sent no reason', () => {
    const v = buildScanVerdict('PO-404', { kind: 'not_found', data: {} });
    assert.ok(v.detail);
  });

  it('names the integration as the cause instead of blaming the label', () => {
    const v = buildScanVerdict(TRACKING, {
      kind: 'integration-error',
      data: { integration_error: 'zoho_not_connected' },
    });
    assert.equal(v.tone, 'error');
    assert.equal(v.headline, 'NOT CONNECTED');
    assert.equal(v.feedback, 'reject');
  });
});

describe('scanFailureVerdict', () => {
  it('surfaces the thrown message so a dropped scan is never silent', () => {
    const v = scanFailureVerdict(TRACKING, new Error('Lookup failed'));
    assert.equal(v.tone, 'error');
    assert.equal(v.headline, 'SCAN FAILED');
    assert.equal(v.detail, 'Lookup failed');
    assert.equal(v.feedback, 'reject');
    assert.equal(v.scanned, TRACKING);
  });

  it('degrades to offline guidance for a bare network throw', () => {
    const v = scanFailureVerdict(TRACKING, new Error(''));
    assert.ok(v.detail?.includes('signal'));
  });
});
