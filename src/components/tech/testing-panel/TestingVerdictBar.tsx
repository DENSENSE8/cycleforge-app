'use client';

import {
  TestingStatusPills,
  unitStatusToVerdict,
} from '@/components/receiving/workspace/TestingStatusPills';
import { getLast8Serial } from '@/lib/copy-chip-format';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import type { TestingController } from './testing-panel-types';

/**
 * Pass · Test again · Fail for the active unit, in the middle of the station
 * between the Items band (its serial) and the Label band. Fail opens the
 * fault sheet; `P` / the dock passes and prints in one go.
 */
export function TestingVerdictBar({ c, row }: { c: TestingController; row: ReceivingLineRow }) {
  const serial = c.activeSerial;
  // Several units on the line: name the one being judged.
  const unitFace = serial && (row.serials?.length ?? 0) > 1 ? getLast8Serial(serial.serial_number) : null;
  return (
    <div data-testid="testing-verdict-bar" className="flex w-full min-w-0 items-center gap-2 px-3 py-2">
      {unitFace ? (
        <span className="shrink-0 font-mono text-role-caption font-semibold text-text-muted" title={serial?.serial_number}>
          {unitFace}
        </span>
      ) : null}
      <TestingStatusPills
        labeled
        value={unitStatusToVerdict(serial?.current_status)}
        onChange={(next) => {
          if (serial) c.requestSlotVerdict(row.id, serial, next);
        }}
        disabled={!serial || c.isMutating || c.isPrinting}
      />
    </div>
  );
}
