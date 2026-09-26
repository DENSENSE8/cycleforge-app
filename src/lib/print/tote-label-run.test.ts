/** Tote (handling-unit) plate run — the two contracts a bulk run rides on. */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { MAX_TOTE_PRINT_RUN } from './labelCopies';
import { parseStaffPrintJob } from './staff-print-bridge';
import { mintTotesForPrint, toteReprintFromTyped } from './tote-mint-api';
import { handlingUnitLabelToFace } from './printHandlingUnitLabel';
import { buildFaceInfoHtml } from './labelFace';

const toteJob = (tote: unknown) => ({
  type: 'staff.print_job',
  request_id: 'req-1',
  targetStationId: 'ps_bench',
  grain: 'tote',
  role: 'label',
  tote,
});

describe('tote print job on the wire', () => {
  it('carries only a count — the desk mints, the phone never sends ids', () => {
    const job = parseStaffPrintJob(toteJob({ count: 40 }));
    assert.equal(job?.grain, 'tote');
    assert.equal(job?.tote?.count, 40);
    // A tote job has no location payload to speak of; sending one would mean
    // the phone thought a box was a place.
    assert.equal(job?.location, undefined);
  });

  it('refuses a count the mint would have to guess at', () => {
    assert.equal(parseStaffPrintJob(toteJob({ count: 0 })), null);
    assert.equal(parseStaffPrintJob(toteJob({ count: -3 })), null);
    assert.equal(parseStaffPrintJob(toteJob({})), null);
    assert.equal(parseStaffPrintJob(toteJob(null)), null);
    assert.equal(parseStaffPrintJob({ ...toteJob({ count: 5 }), tote: undefined }), null);
  });

  it('bounds the run so one scan cannot mint a warehouse', () => {
    assert.ok(parseStaffPrintJob(toteJob({ count: MAX_TOTE_PRINT_RUN })));
    assert.equal(parseStaffPrintJob(toteJob({ count: MAX_TOTE_PRINT_RUN + 1 })), null);
  });

  it('still parses the location grains it shares the channel with', () => {
    const bin = parseStaffPrintJob({
      type: 'staff.print_job',
      request_id: 'req-2',
      targetStationId: 'ps_bench',
      grain: 'bin',
      role: 'label',
      location: {
        roomName: 'Receiving',
        gln: '0812345000009',
        segments: [{ zone: 'C', aisle: 1, bay: 1, level: 1, position: 1 }],
      },
    });
    assert.equal(bin?.grain, 'bin');
    assert.equal(bin?.tote, undefined);
  });
});

describe('tote plate face', () => {
  it('leads with the code and encodes the H- handle a scan resolves', () => {
    const face = handlingUnitLabelToFace({ handlingUnitId: 412 });
    assert.equal(face.kind, 'lpn');
    assert.equal(face.center, 'H-412');
    assert.equal(face.matrix.value, 'H-412');
  });

  it('shows the stored code but always encodes the house handle', () => {
    // An external tote barcode may occupy `code`, but `routeScan` only decodes
    // the H- prefix — so the symbol must stay the handle or the plate is dead
    // paper at the pack bench.
    const face = handlingUnitLabelToFace({ handlingUnitId: 7, code: 'ACME-TOTE-88' });
    assert.equal(face.center, 'ACME-TOTE-88');
    assert.equal(face.matrix.value, 'H-7');
  });

  it('prints the kicker then the ID, and nothing else', () => {
    // Operator ruling 2026-09-15: `Box / LPN` top-left, ID left-middle, NO
    // date — and no member count or bin, which are stale the moment the tote
    // moves. Guarded on the rendered HTML, not just the model.
    const { infoHtml, infoCss } = buildFaceInfoHtml(
      handlingUnitLabelToFace({ handlingUnitId: 412 }),
    );
    assert.match(infoHtml, /class="hu-kicker">Box \/ LPN</);
    assert.match(infoHtml, /class="hu-code">H-412</);
    assert.doesNotMatch(infoHtml, /hu-date|hu-count|hu-loc|units/i);
    // Left-aligned, vertically centred, and the biggest thing on the paper.
    assert.match(infoCss, /\.hu-code\{[^}]*font-size:30px/);
    assert.match(infoCss, /\.hu-code\{[^}]*justify-content:flex-start/);
    assert.match(infoCss, /\.hu-code\{[^}]*align-items:center/);
  });
});

describe('tote mint request', () => {
  const okBody = {
    success: true,
    handling_units: [{ id: 1, code: 'H-1' }, { id: 2, code: 'H-2' }],
  };

  async function captureMint(...args: Parameters<typeof mintTotesForPrint>) {
    const original = globalThis.fetch;
    let sent: { url: string; body: Record<string, unknown> } | null = null;
    globalThis.fetch = (async (url: string, init: RequestInit) => {
      sent = { url: String(url), body: JSON.parse(String(init.body)) };
      return { ok: true, json: async () => okBody } as unknown as Response;
    }) as typeof fetch;
    try {
      const payloads = await mintTotesForPrint(...args);
      return { sent: sent!, payloads };
    } finally {
      globalThis.fetch = original;
    }
  }

  it('keys the batch on the caller-supplied id so a redelivery cannot double-mint', async () => {
    const { sent } = await captureMint(2, 'req-abc');
    assert.equal(sent.url, '/api/handling-units/bulk');
    assert.equal(sent.body.count, 2);
    assert.equal(sent.body.idempotencyKey, 'req-abc');
  });

  it('omits the key when the caller has no repeatable trigger', async () => {
    // The desk button is a fresh human intent each press: a second press must
    // mint NEW totes, not replay the last batch.
    const { sent } = await captureMint(2);
    assert.equal('idempotencyKey' in sent.body, false);
  });

  it('maps minted rows onto plate payloads, ids ascending', async () => {
    const { payloads } = await captureMint(2, 'req-xyz');
    assert.deepEqual(
      payloads.map((p) => [p.handlingUnitId, p.code]),
      [[1, 'H-1'], [2, 'H-2']],
    );
  });

  it('throws rather than printing paper for boxes that were never created', async () => {
    const original = globalThis.fetch;
    globalThis.fetch = (async () =>
      ({ ok: false, json: async () => ({ success: false, error: 'nope' }) }) as unknown as Response) as typeof fetch;
    try {
      await assert.rejects(() => mintTotesForPrint(3, 'req-1'), /nope/);
    } finally {
      globalThis.fetch = original;
    }
  });
});

describe('tote reprint from typed number', () => {
  it('prints H-25 for 25 without looking the row up', () => {
    assert.deepEqual(toteReprintFromTyped('25'), { handlingUnitId: 25, code: 'H-25' });
    assert.deepEqual(toteReprintFromTyped('H-25'), { handlingUnitId: 25, code: 'H-25' });
  });
});
