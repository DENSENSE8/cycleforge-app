import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  arrivalHistoryEntries,
  arrivalTapeEntry,
  type SettledArrival,
} from '@/components/mobile/receiving/arrival-station-tape';
import { pushStationTape } from '@/components/mobile/station/station-tape';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';

const NOW = Date.UTC(2026, 8, 5, 17, 0, 0);
const TRACKING = '1Z999AA10123456784';

function settled(over: Partial<SettledArrival> = {}): SettledArrival {
  return {
    status: 'arrived',
    scanned: TRACKING,
    seq: 1,
    receivingId: 51189,
    title: null,
    tracking: TRACKING,
    recordId: null,
    imageUrl: null,
    message: null,
    ...over,
  };
}

describe('arrivalTapeEntry', () => {
  it('reads a fresh intake as the quiet success, keyed to its carton', () => {
    const entry = arrivalTapeEntry(settled({ message: 'No PO match. Carton logged for triage.' }), NOW);
    assert.equal(entry.tone, 'ok');
    assert.equal(entry.verb, 'Arrived');
    assert.equal(entry.identifier, TRACKING);
    assert.equal(entry.dedupeKey, 'carton:51189');
    assert.equal(entry.at, new Date(NOW).toISOString());
    assert.equal(entry.live, true);
  });

  it('gives a box that is already in the system the stop-and-look tone', () => {
    // Arriving one carton twice is the error this station exists to prevent, so
    // a re-scan must not read like a clean intake.
    const entry = arrivalTapeEntry(settled({ status: 'known' }), NOW);
    assert.equal(entry.tone, 'warn');
    assert.notEqual(entry.tone, arrivalTapeEntry(settled(), NOW).tone);
  });

  it('refuses the wrong label with the reason, and keys it to no carton', () => {
    // Nothing was written, so there is nothing to collapse onto — and two wrong
    // labels are two separate problems.
    const entry = arrivalTapeEntry(
      settled({
        status: 'refused',
        receivingId: null,
        tracking: null,
        scanned: 'SKU-1099',
        message: 'Nothing arrives under a product label. Scan the carrier label on the box.',
      }),
      NOW,
    );
    assert.equal(entry.tone, 'bad');
    assert.equal(entry.dedupeKey, null);
    assert.equal(entry.identifier, 'SKU-1099');
    assert.match(String(entry.message), /carrier label/);
  });

  it('says a lost connection recorded NOTHING — arrival has no outbox', () => {
    // The dock queues a failed confirm because the package really left. An
    // arrival that never reached the server is un-arrived, and telling the
    // operator it is "queued" would leave a box logged only on the phone.
    const entry = arrivalTapeEntry(
      settled({ status: 'err', receivingId: null, transportFailed: true }),
      NOW,
    );
    assert.equal(entry.tone, 'bad');
    assert.match(String(entry.message), /nothing was recorded/i);
    assert.match(String(entry.message), /again/i);
  });

  it('carries the carton facts as typed fields, and leaves absent ones null', () => {
    const entry = arrivalTapeEntry(
      settled({ title: 'Dell OptiPlex 7090', recordId: 'PO-4471', imageUrl: 'https://cdn/x.jpg' }),
      NOW,
    );
    assert.equal(entry.title, 'Dell OptiPlex 7090');
    assert.equal(entry.recordId, 'PO-4471');
    assert.equal(entry.imageUrl, 'https://cdn/x.jpg');
    // The box is still shut at the door: there is no grade to report.
    assert.equal(entry.conditionGrade, null);
    // A fresh arrival with no PO match has no name — the host prints "New
    // arrival" over the tracking, which is exactly what happened.
    assert.equal(arrivalTapeEntry(settled(), NOW).title, null);
  });

  it('names a non-arrival row by its outcome, never "New arrival"', () => {
    // The untitled fallback belongs to a box that DID arrive. A refusal or a
    // failed scan falling through to it would head a red row with a green
    // sentence.
    assert.equal(
      arrivalTapeEntry(settled({ status: 'refused', receivingId: null }), NOW).title,
      'Not an arrival',
    );
    assert.equal(arrivalTapeEntry(settled({ status: 'err' }), NOW).title, 'Scan failed');
    assert.equal(arrivalTapeEntry(settled({ status: 'known' }), NOW).title, 'Already arrived');
  });

  it('collapses a re-scan onto the row its carton already has', () => {
    const first = arrivalTapeEntry(settled({ seq: 1 }), NOW);
    const again = arrivalTapeEntry(settled({ seq: 2, status: 'known' }), NOW);
    const tape = pushStationTape([first], again);
    assert.equal(tape.length, 1);
    assert.equal(tape[0].tone, 'warn');
  });
});

describe('arrivalHistoryEntries', () => {
  const row = (over: Partial<ReceivingLineRow>): ReceivingLineRow =>
    ({
      id: 1,
      receiving_id: 900,
      item_name: 'Bose Wave IV',
      tracking_number: TRACKING,
      image_url: null,
      created_at: '2026-09-05T10:00:00.000Z',
      ...over,
    }) as ReceivingLineRow;

  it('reports one arrival per carton, not one per line', () => {
    const entries = arrivalHistoryEntries([
      row({ id: 1, receiving_id: 900 }),
      row({ id: 2, receiving_id: 900, item_name: 'Second line of the same box' }),
      row({ id: 3, receiving_id: 901 }),
    ]);
    assert.deepEqual(
      entries.map((e) => e.dedupeKey),
      ['carton:900', 'carton:901'],
    );
  });

  it('stamps the DOOR time, preferring received over first scan over row age', () => {
    const [received] = arrivalHistoryEntries([
      row({
        received_at: '2026-09-05T08:00:00.000Z',
        scanned_at: '2026-09-05T09:00:00.000Z',
      }),
    ]);
    assert.equal(received.at, '2026-09-05T08:00:00.000Z');

    const [scanned] = arrivalHistoryEntries([row({ scanned_at: '2026-09-05T09:00:00.000Z' })]);
    assert.equal(scanned.at, '2026-09-05T09:00:00.000Z');

    const [made] = arrivalHistoryEntries([row({})]);
    assert.equal(made.at, '2026-09-05T10:00:00.000Z');
  });

  it('orders newest first, so the tape opens on the last box in', () => {
    const entries = arrivalHistoryEntries([
      row({ receiving_id: 900, received_at: '2026-09-05T08:00:00.000Z' }),
      row({ receiving_id: 902, received_at: '2026-09-05T12:00:00.000Z' }),
      row({ receiving_id: 901, received_at: '2026-09-05T10:00:00.000Z' }),
    ]);
    assert.deepEqual(
      entries.map((e) => e.dedupeKey),
      ['carton:902', 'carton:901', 'carton:900'],
    );
  });

  it('names whose door scan it was, and never offers it as this session’s work', () => {
    const [entry] = arrivalHistoryEntries([row({ received_by_name: 'Dana' })]);
    assert.equal(entry.actor, 'Dana');
    assert.equal(entry.live, false);
  });

  it('prefers the catalog title over the per-receipt line name', () => {
    const [entry] = arrivalHistoryEntries([
      row({ catalog_product_title: 'Bose Wave Music System IV', item_name: 'bose radio USED' }),
    ]);
    assert.equal(entry.title, 'Bose Wave Music System IV');
  });

  it('drops feed rows that have no carton — there is no arrival to show', () => {
    // An EXPECTED line (receiving_id NULL) is an announced delivery that has not
    // turned up. Listing it as an arrival would say a box is here when it is not.
    assert.deepEqual(arrivalHistoryEntries([row({ receiving_id: null })]), []);
  });
});
