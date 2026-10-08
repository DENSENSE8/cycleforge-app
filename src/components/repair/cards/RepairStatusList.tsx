'use client';

/**
 * Change status — the repair statuses in the centered picker dialog (operator
 * 2026-10-08), for the open record's verb and the check-set strip's: the
 * search is focused, typing filters, ↑ / ↓ move, Enter picks. The host writes
 * the pick through the one status writer (`useRepairStatusChange`); a landed
 * write shows the done face. Cancel is not offered — it asks for a reason on
 * the record. The card carries no status control (owner 2026-10-04).
 */

import { useState } from 'react';
import { IntakeCombobox } from '@/components/outbound/orders/intake/IntakeCombobox';
import { VerbDoneState } from '@/design-system/components/record-action-strip/VerbDoneState';
import { STATE_TONE_CLASSES } from '@/design-system/tokens/lifecycle';
import { REPAIR_STATUS } from '@/design-system/tokens/repair-status';
import { repairStatusOperatorLabel } from '@/lib/repair-status';
import { cn } from '@/utils/_cn';

/** Every stored status the list offers, in workflow order — Cancel lives on the record (it takes a reason). */
const CHOICES = Object.values(REPAIR_STATUS)
  .filter((face) => face.id !== 'Cancelled')
  .map((face) => ({
    value: face.id,
    label: repairStatusOperatorLabel(face.id),
    icon: <span className={cn('size-2 rounded-full', STATE_TONE_CLASSES[face.tone].dot)} />,
  }));

/**
 * The status picker body. `current` ticks the status the repair(s) share
 * (`''` when they differ); `onPick` resolves `true` once the write landed.
 */
export function RepairStatusList({
  current,
  subject,
  testId,
  onPick,
  done,
}: {
  current: string;
  /** What changes — "Repair 10089", "3 repairs". */
  subject: string;
  testId: string;
  onPick: (next: string) => Promise<boolean>;
  done: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [landed, setLanded] = useState<string | null>(null);

  const pick = async (next: string) => {
    if (saving) return;
    setSaving(true);
    try {
      if (await onPick(next)) setLanded(next);
    } finally {
      setSaving(false);
    }
  };

  if (landed) {
    return <VerbDoneState title="Status set" detail={`${subject} → ${repairStatusOperatorLabel(landed)}`} onDone={done} testId={`${testId}-done`} />;
  }

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col gap-2" data-testid={testId}>
      <p className="text-role-caption text-text-soft">
        {subject}
        {current ? (
          <>
            {' '}
            · now <span className="text-text-default">{repairStatusOperatorLabel(current)}</span>
          </>
        ) : null}
      </p>
      <IntakeCombobox
        surface="open"
        value={current || null}
        onChange={(next) => void pick(next)}
        options={CHOICES}
        placeholder="Status"
        searchPlaceholder="Type a status…"
        emptyMessage="No status matches"
        disabled={saving}
        ariaLabel={`Set the status of ${subject}`}
        optionTestId={(option) => `${testId}-${option.value}`}
        className="flex-1"
      />
    </div>
  );
}
