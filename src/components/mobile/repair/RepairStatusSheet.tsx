'use client';

import { useEffect, useState } from 'react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/design-system/primitives';
import { Check } from '@/components/Icons';
import { ModeRegion } from '@/design-system/providers/ModeRegion';
import {
  REPAIR_WORKBENCH_STATUSES,
  repairStatusBadgeClass,
  repairStatusOperatorLabel,
} from '@/lib/repair-status';
import { cn } from '@/utils/_cn';

/**
 * Status verb of the mobile repair workbench. Two taps on purpose: choosing a
 * row only selects it; the explicit Save button is the one write. Operator
 * labels on screen, queue-compatible stored values on the wire
 * (`REPAIR_WORKBENCH_STATUSES`) — the page owns the PATCH, the optimistic
 * value, and the rollback, so this sheet never sends a ticket message.
 */
export function RepairStatusSheet({
  open,
  current,
  saving,
  error,
  onSave,
  onClose,
}: {
  open: boolean;
  /** Stored status currently on the repair (post-refresh, or optimistic while saving). */
  current: string | null;
  saving: boolean;
  error: string | null;
  onSave: (next: string) => void;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<string | null>(current);

  // Re-seed each time the sheet opens so a stale pick never survives a close.
  useEffect(() => {
    if (open) setSelected(current);
  }, [open, current]);

  const dirty = selected !== null && selected !== current;

  return (
    <BottomSheet open={open} onClose={saving ? () => {} : onClose} forceVariant="sheet" title="Repair status">
      {/* BottomSheet portals out of the page's ModeRegion; re-declare triage so
          the mode radius / padding / hit tokens resolve inside the sheet. */}
      <ModeRegion mode="triage" className="flex flex-col gap-3 pb-2">
        <div role="radiogroup" aria-label="Repair status" className="flex flex-col gap-1.5">
          {REPAIR_WORKBENCH_STATUSES.map((value) => {
            const isSelected = value === selected;
            return (
              // ds-raw-button: full-width radio row (label + trailing check), not an action button
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={isSelected}
                disabled={saving}
                onClick={() => setSelected(value)}
                className={cn(
                  'flex min-h-mode-hit items-center justify-between gap-3 rounded-mode border px-mode-page text-left text-mode-body font-semibold transition-colors disabled:opacity-60',
                  isSelected ? repairStatusBadgeClass(value) : 'border-mode-edge bg-mode-panel text-mode-ink active:bg-mode-hover',
                )}
              >
                <span>{repairStatusOperatorLabel(value)}</span>
                {value === current ? (
                  <span className="text-role-caption">Current</span>
                ) : isSelected ? (
                  <Check className="h-4 w-4 shrink-0" />
                ) : null}
              </button>
            );
          })}
        </div>

        {error ? (
          <p role="alert" className="rounded-mode border border-rose-200 bg-rose-50 px-mode-page py-2.5 text-role-caption font-semibold text-rose-700">
            Not saved — {error}. The previous status is back.
          </p>
        ) : null}

        <Button
          variant="primary"
          size="lg"
          className="w-full rounded-mode"
          disabled={!dirty}
          loading={saving}
          onClick={() => selected && onSave(selected)}
        >
          {saving
            ? 'Saving'
            : dirty
              ? `Save — ${repairStatusOperatorLabel(selected)}`
              : 'Choose a new status'}
        </Button>
        <p className="text-center text-role-caption text-mode-muted">
          Saving changes the repair only. No customer message is sent.
        </p>
      </ModeRegion>
    </BottomSheet>
  );
}
