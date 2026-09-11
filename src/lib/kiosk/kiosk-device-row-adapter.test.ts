/**
 * Gate preamble (Fact-Forcing):
 * - Importers/callers: node:test only; covers `kioskDeviceCompoundView` used by
 *   `useKioskDevicesSpreadsheet` → DataTable Dates cell.
 * - Affected API: none (pure unit assertions on CompoundRowView.dates fields).
 * - Schemas: `KioskDeviceTableRow` + `CompoundDelay.faceLabel`.
 * - User instruction (verbatim intent): make the slot data table more page and
 *   display method agnostic — don't jam order date / last seen / dwell into one
 *   row when another row below can show dwell; be introspective.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  compoundDatesHoverLabel,
  COMPOUND_DATES_START_HOVER,
} from '@/components/tables/compound/compound-row-model';
import { kioskDeviceCompoundView } from '@/lib/kiosk/kiosk-device-row-adapter';
import type { KioskDeviceTableRow } from '@/lib/kiosk/kiosk-device-row';

function row(partial: Partial<KioskDeviceTableRow> = {}): KioskDeviceTableRow {
  return {
    id: 1,
    label: 'Front desk',
    status: 'active',
    squareTerminalDeviceId: null,
    lastSeenAt: '2026-09-02T12:00:00.000Z',
    createdAt: '2026-08-27T12:00:00.000Z',
    enrolledByStaffId: null,
    enrolledByName: null,
    dwellSeconds: 8 * 86400,
    hardwareStatus: 'ok',
    ...partial,
  };
}

describe('kioskDeviceCompoundView — DATES two-line paint', () => {
  it('paints last seen on Hash and dwell on Calendar via faceLabel', () => {
    const view = kioskDeviceCompoundView(row());
    assert.equal(view.orderedAt?.label, 'Sep 2');
    assert.match(String(view.orderedAt?.tip ?? ''), /Last seen/);
    assert.match(String(view.orderedAt?.tip ?? ''), /Enrolled/);
    assert.doesNotMatch(String(view.orderedAt?.tip ?? ''), /Dwell/);
    assert.equal(view.startedHover, view.orderedAt?.tip);
    assert.equal(view.delay?.faceLabel, '8d');
    assert.equal(view.delayTip, 'Dwell · 8d');
  });

  it('Hash hover chip is family-named — never Order date / Start date prefix', () => {
    const view = kioskDeviceCompoundView(row());
    const chip = compoundDatesHoverLabel('start', view.startedHover);
    assert.match(chip, /^Last seen/);
    assert.doesNotMatch(chip, /Order date/);
    assert.doesNotMatch(chip, new RegExp(`^${COMPOUND_DATES_START_HOVER}`));
  });

  it('does not leave Calendar empty while dwell exists', () => {
    const view = kioskDeviceCompoundView(row({ dwellSeconds: 45 }));
    assert.equal(view.delay?.faceLabel, '45s');
    assert.ok(view.delay);
  });

  it('falls back to enrolled on Hash when never seen', () => {
    const view = kioskDeviceCompoundView(
      row({ lastSeenAt: null, dwellSeconds: null, hardwareStatus: 'offline' }),
    );
    assert.equal(view.orderedAt?.label, 'Aug 27');
    assert.equal(view.delay, null);
  });
});
