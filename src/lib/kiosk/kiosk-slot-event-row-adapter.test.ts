/**
 * Gate preamble (Fact-Forcing):
 * Importers/callers: node:test only (adapter + resolve coverage).
 * Affected API: none.
 * Data schemas: KioskSlotEventTableRow, CompoundRowView, CompoundSlotValue.
 * User instruction (verbatim): Continue to the next phase
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { kioskSlotEventCompoundView } from '@/lib/kiosk/kiosk-slot-event-row-adapter';
import { resolveKioskSlotEventsSlotValue } from '@/lib/tables/field-catalog/kiosk-slot-events-resolve';
import type { KioskSlotEventTableRow } from '@/lib/kiosk/kiosk-slot-event-row';

function row(partial: Partial<KioskSlotEventTableRow> = {}): KioskSlotEventTableRow {
  return {
    id: 10,
    organizationId: 'org',
    kioskDeviceId: 3,
    deviceLabel: 'Front desk',
    slotKey: 'lane-a',
    fromState: 'idle',
    toState: 'occupied',
    dwellMs: 8 * 86400 * 1000,
    hardwareStatus: 'ok',
    occurredAt: '2026-09-10T20:00:00.000Z',
    payload: {},
    ...partial,
  };
}

describe('kiosk slot-events adapter + resolve', () => {
  it('paints device title and transition tip without a deadline', () => {
    const view = kioskSlotEventCompoundView(row());
    assert.equal(view.title, 'Front desk');
    assert.equal(view.stateLabel, 'occupied');
    assert.equal(view.stateTip, 'idle → occupied');
    assert.equal(view.delay, null);
  });

  it('resolves dwell as compact face and transition as from → to', () => {
    assert.deepEqual(resolveKioskSlotEventsSlotValue(row(), 'kiosk-slot-events.dwell'), {
      kind: 'value',
      text: '8d',
    });
    assert.deepEqual(resolveKioskSlotEventsSlotValue(row(), 'kiosk-slot-events.status_change'), {
      kind: 'value',
      text: 'idle → occupied',
    });
  });
});
