'use client';

import {
  TestingStatusPills,
  unitStatusToVerdict,
  type TestingVerdict,
} from '@/components/receiving/workspace/TestingStatusPills';
import { QC_VERDICTS } from '@/lib/qc/qc-verdict';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import type { TestingController } from './testing-panel-types';

/** The QC record's keys (P / T / F), painted in the station's verdict buttons. */
const VERDICT_KEYS = Object.fromEntries(
  QC_VERDICTS.map((spec) => [spec.verdict, spec.hotkey.toUpperCase()]),
) as Readonly<Record<TestingVerdict, string>>;

/**
 * Fail · Test again · Pass for the active unit, in the middle of the station
 * between the Items band (its serial) and the Label band. Verdicts paint at
 * once and save behind (never greyed while saving). Pass is the station's one
 * Pass — it passes and prints; Fail opens the fault sheet.
 */
export function TestingVerdictBar({ c, row }: { c: TestingController; row: ReceivingLineRow }) {
  const serial = c.activeSerial;
  return (
    <div data-testid="testing-verdict-bar" className="flex w-full min-w-0 items-center">
      <TestingStatusPills
        labeled
        hotkeys={VERDICT_KEYS}
        value={unitStatusToVerdict(serial?.current_status)}
        onChange={(next) => {
          if (next === 'PASS') void c.handlePrimary();
          else if (serial) c.requestSlotVerdict(row.id, serial, next);
        }}
        disabled={!serial}
      />
    </div>
  );
}
