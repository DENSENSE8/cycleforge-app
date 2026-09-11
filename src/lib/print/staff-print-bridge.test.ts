/**
 * Tripwire — staff print bridge wire parse.
 *
 * Run: node --import tsx --test src/lib/print/staff-print-bridge.test.ts
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  parseStaffPrintJob,
  parseStaffPrintStatus,
  roleReady,
  thisDeviceCanFulfillPrintJob,
} from './staff-print-bridge';

describe('parseStaffPrintJob', () => {
  it('accepts a rack location job', () => {
    const job = parseStaffPrintJob({
      request_id: 'req-1',
      grain: 'rack',
      role: 'label',
      location: {
        roomName: 'Zone 3 - Parts',
        gln: '123',
        segments: [{ zone: 'C', aisle: 1, bay: 1, level: 1, position: 0 }],
      },
    });
    assert.equal(job?.grain, 'rack');
    assert.equal(job?.location?.segments[0]?.zone, 'C');
    assert.equal(job?.location?.segments[0]?.position, 0);
  });

  it('rejects empty segments', () => {
    assert.equal(
      parseStaffPrintJob({
        request_id: 'req-1',
        grain: 'bin',
        location: { roomName: 'Cage', gln: '', segments: [] },
      }),
      null,
    );
  });

  it('accepts a pack papers job', () => {
    const job = parseStaffPrintJob({
      request_id: 'req-2',
      grain: 'papers',
      papers: { orderRowId: 44, packerLogId: null, reprint: true },
    });
    assert.equal(job?.role, 'paper');
    assert.equal(job?.papers?.orderRowId, 44);
    assert.equal(job?.papers?.reprint, true);
  });
});

describe('roleReady', () => {
  it('requires silent + that role paired', () => {
    const status = parseStaffPrintStatus({
      silent: true,
      label: { ready: true, name: 'TSC', kind: 'usb', profileId: 'p1' },
      paper: { ready: false, name: null, kind: null },
      profiles: [{ id: 'p1', name: 'TSC', role: 'label', kind: 'usb' }],
    });
    assert.equal(status?.label.profileId, 'p1');
    assert.equal(status?.profiles.length, 1);
    assert.equal(roleReady(status, 'label'), true);
    assert.equal(roleReady(status, 'paper'), false);
    assert.equal(
      roleReady({ ...status!, silent: false }, 'label'),
      false,
    );
  });
});

describe('thisDeviceCanFulfillPrintJob', () => {
  it('lets the USB computer print labels and skips a phone with no profile', () => {
    const ready = parseStaffPrintStatus({
      silent: true,
      label: { ready: true, name: 'TSC', kind: 'usb', profileId: 'p1' },
      paper: { ready: false, name: null, kind: null },
      profiles: [],
    })!;
    const empty = parseStaffPrintStatus({
      silent: true,
      label: { ready: false, name: null, kind: null },
      paper: { ready: false, name: null, kind: null },
      profiles: [],
    })!;
    assert.equal(thisDeviceCanFulfillPrintJob({ grain: 'rack' }, ready), true);
    assert.equal(thisDeviceCanFulfillPrintJob({ grain: 'bin' }, empty), false);
    assert.equal(thisDeviceCanFulfillPrintJob({ grain: 'papers' }, ready), false);
  });
});
