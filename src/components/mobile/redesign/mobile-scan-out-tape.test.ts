import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { scanOutTapeEntry } from '@/components/mobile/redesign/mobile-scan-out-tape';
import {
  pushStationTape,
  STATION_TAPE_LIMIT,
  type StationTapeEntry,
} from '@/components/mobile/station/station-tape';
import type {
  ScanOutResult,
  SettledScanOut,
} from '@/components/outbound/scan-out/useScanOutStation';

const NOW = Date.UTC(2026, 8, 4, 17, 0, 0);
const TRACKING = '1Z999AA10123456784';

function settled(
  status: SettledScanOut['status'],
  result: Partial<ScanOutResult> | null,
  seq = 1,
): SettledScanOut {
  return {
    status,
    result: result ? ({ ok: true, matched: true, ...result } as ScanOutResult) : null,
    text: 'x',
    scanned: TRACKING,
    seq,
  };
}

describe('scanOutTapeEntry', () => {
  it('reads the product title, and stamps a fresh confirm at now', () => {
    const entry = scanOutTapeEntry(
      settled('ok', { shipmentId: 7, tracking: TRACKING, productTitle: 'Dell OptiPlex 7090' }),
      NOW,
    );
    assert.equal(entry.title, 'Dell OptiPlex 7090');
    assert.equal(entry.identifier, TRACKING);
    assert.equal(entry.dedupeKey, 'shipment:7');
    assert.equal(entry.tone, 'ok');
    assert.equal(entry.at, new Date(NOW).toISOString());
  });

  it('says the package SHIPPED when the commit landed but context did not', () => {
    // The commit succeeded; only the carton lookup failed. Leaving the title
    // null made the row print "Unfound order", which states the opposite of
    // what happened and sends an operator chasing a package that went out fine.
    const entry = scanOutTapeEntry(settled('ok', { shipmentId: 7, productTitle: '   ' }), NOW);
    assert.equal(entry.title, 'Shipped — details unavailable');
    assert.equal(entry.identifier, TRACKING);
  });

  it('still leaves an unresolved label untitled, so the row can say "Unfound order"', () => {
    // A miss is the opposite case: nothing was committed and nothing is known.
    const entry = scanOutTapeEntry(settled('miss', { matched: false }), NOW);
    assert.equal(entry.title, null);
  });

  it('keeps the real title when the shipment has one', () => {
    const entry = scanOutTapeEntry(
      settled('ok', { shipmentId: 7, productTitle: 'Bose Wave IV', orderId: 'SO-1' }),
      NOW,
    );
    assert.equal(entry.title, 'Bose Wave IV');
  });

  it('blocks a cancelled order with the server’s own instruction', () => {
    const entry = scanOutTapeEntry(
      settled('blk', {
        shipmentId: 7,
        blocked: true,
        productTitle: 'Bose Wave IV',
        message: 'Order is cancelled — do not ship. Pull this package.',
      }),
      NOW,
    );
    assert.equal(entry.tone, 'bad');
    assert.equal(entry.verb, 'Do not ship');
    assert.equal(entry.message, 'Order is cancelled — do not ship. Pull this package.');
  });

  it('reads a transport failure as queued, not as a refusal', () => {
    // The server never saw it, so nothing is known about the package — but that
    // is a statement about the network, not about the label.
    const entry = scanOutTapeEntry(
      { status: 'err', result: null, text: 'x', scanned: TRACKING, seq: 1, transportFailed: true },
      NOW,
    );
    assert.equal(entry.tone, 'warn');
    assert.equal(entry.verb, 'Queued to send');
    assert.match(String(entry.message), /connection/i);
  });

  it('stamps a duplicate at the ORIGINAL departure, not the re-scan', () => {
    const entry = scanOutTapeEntry(
      settled('dup', {
        shipmentId: 7,
        duplicate: true,
        shipConfirmedAt: '2026-09-04 09:00:00',
      }),
      NOW,
    );
    assert.equal(entry.at, new Date('2026-09-04T09:00:00').toISOString());
  });

  it('gives a re-read the warn tone, not the success tone', () => {
    // The verb is the operator's wording and is the same for both; the TONE and
    // the stamp are the entire distinction between "shipped it" and "this
    // already left", so the re-read must not read as a clean scan.
    assert.equal(scanOutTapeEntry(settled('ok', { shipmentId: 7 }), NOW).tone, 'ok');
    assert.equal(scanOutTapeEntry(settled('dup', { shipmentId: 7 }), NOW).tone, 'warn');
    assert.equal(
      scanOutTapeEntry(settled('ok', { shipmentId: 7 }), NOW).verb,
      scanOutTapeEntry(settled('dup', { shipmentId: 7 }), NOW).verb,
    );
  });

  it('keeps a miss on the tape with the server’s own words and no dedupe key', () => {
    const entry = scanOutTapeEntry(
      settled('miss', { matched: false, message: 'No shipment found for this label' }),
      NOW,
    );
    assert.equal(entry.dedupeKey, null);
    assert.equal(entry.message, 'No shipment found for this label');
    assert.equal(entry.title, null);
    assert.equal(entry.identifier, TRACKING);
    assert.equal(entry.tone, 'bad');
  });

  it('carries station facts as typed fields, never as label/value prose', () => {
    // The row renders these through house chips (OrderIdChip, ConditionGradeChip),
    // which own the vocabulary — the model carries values only.
    const entry = scanOutTapeEntry(
      settled('ok', {
        shipmentId: 7,
        orderId: 'SO-1001',
        condition: 'NEW',
        imageUrl: 'https://cdn.example/unit.jpg',
      }),
      NOW,
    );
    assert.equal(entry.recordId, 'SO-1001');
    assert.equal(entry.conditionGrade, 'NEW');
    assert.equal(entry.imageUrl, 'https://cdn.example/unit.jpg');
  });

  it('leaves absent facts null rather than inventing a placeholder', () => {
    const entry = scanOutTapeEntry(settled('ok', { shipmentId: 7 }), NOW);
    assert.equal(entry.recordId, null);
    assert.equal(entry.conditionGrade, null);
    assert.equal(entry.imageUrl, null);
  });

  it('keys rows by submit order so two reads of one label never collide', () => {
    assert.notEqual(
      scanOutTapeEntry(settled('ok', { shipmentId: 7 }, 1), NOW).id,
      scanOutTapeEntry(settled('dup', { shipmentId: 7 }, 2), NOW).id,
    );
  });
});

describe('pushStationTape', () => {
  const row = (over: Partial<StationTapeEntry>): StationTapeEntry => ({
    id: 'scan-out-0',
    tone: 'ok',
    verb: 'Scanned out',
    title: 'Dell OptiPlex 7090',
    identifier: TRACKING,
    meta: [],
    message: null,
    at: new Date(NOW).toISOString(),
    dedupeKey: null,
    ...over,
  });

  it('puts the newest entry at the head', () => {
    const tape = pushStationTape(
      [row({ id: 'a', dedupeKey: 'shipment:1' })],
      row({ id: 'b', dedupeKey: 'shipment:2' }),
    );
    assert.deepEqual(
      tape.map((e) => e.id),
      ['b', 'a'],
    );
  });

  it('collapses a re-read of the same thing instead of listing it twice', () => {
    const tape = pushStationTape(
      [row({ id: 'a', dedupeKey: 'shipment:7' }), row({ id: 'z', dedupeKey: 'shipment:3' })],
      row({ id: 'b', dedupeKey: 'shipment:7', tone: 'warn' }),
    );
    assert.equal(tape.length, 2);
    assert.equal(tape[0].id, 'b');
    assert.equal(tape[0].tone, 'warn');
    assert.equal(tape[1].dedupeKey, 'shipment:3');
  });

  it('never collapses two keyless entries — an unreadable label is its own problem', () => {
    const tape = pushStationTape([row({ id: 'a', tone: 'bad' })], row({ id: 'b', tone: 'bad' }));
    assert.equal(tape.length, 2);
  });

  it('caps the tape', () => {
    let tape: StationTapeEntry[] = [];
    for (let i = 0; i < STATION_TAPE_LIMIT + 5; i += 1) {
      tape = pushStationTape(tape, row({ id: `e${i}`, dedupeKey: `shipment:${i + 1}` }));
    }
    assert.equal(tape.length, STATION_TAPE_LIMIT);
    assert.equal(tape[0].id, `e${STATION_TAPE_LIMIT + 4}`);
  });
});
