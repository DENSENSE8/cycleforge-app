'use client';

import { ConditionPills } from '@/components/receiving/workspace/ConditionPills';
import type { TestingController } from './testing-panel-types';

/**
 * The active unit's house condition grade, inline above Fail · Test again ·
 * Pass and always visible (operator 2026-10-08) — the house grades in house
 * order, so bare `1`–`7` pick them (`useTestingPrimaryAction`). A pick
 * re-grades through `POST /api/serial-units/:id/grade` (painted at once), and
 * the unit label and the FNSKU pairing follow the new grade on the next press.
 */
export function TestingConditionBar({ c }: { c: TestingController }) {
  return (
    <div data-testid="testing-condition-bar" className="flex w-full min-w-0 items-center">
      <ConditionPills
        value={c.activeGrade}
        onChange={c.regradeActive}
        readOnly={!c.activeSerial?.id}
        labelVariant="label"
        layout="barDistribute"
      />
    </div>
  );
}
