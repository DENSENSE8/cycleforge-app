'use client';

/** Why the replacement ships: one reason (Lost / Damaged / Wrong item / Other) + a short optional note. */

import { ReasonChipPicker } from '@/components/ui/ReasonChipPicker';
import { TextField } from '@/design-system/primitives';
import { REPLACEMENT_REASONS, type ReplacementReason } from '@/lib/shipping/replacement-rate-shop';
import type { TimelineTone } from '@/lib/timeline/types';

const REASON_TONE: Record<ReplacementReason, TimelineTone> = {
  lost: 'warning',
  damaged: 'danger',
  wrong_item: 'info',
  other: 'muted',
};

const REASON_OPTIONS = REPLACEMENT_REASONS.map((reason) => ({ code: reason.id, label: reason.label, tone: REASON_TONE[reason.id] }));

/** The route caps the note at 500 characters. */
const NOTE_MAX = 500;

export function ReplacementReasonFields({
  reason,
  onReasonChange,
  note,
  onNoteChange,
}: {
  reason: ReplacementReason | null;
  onReasonChange: (next: ReplacementReason | null) => void;
  note: string;
  onNoteChange: (next: string) => void;
}) {
  return (
    <section className="flex min-w-0 flex-col gap-2" aria-label="Reason for replacement" data-testid="send-replacement-reason">
      <h3 className="mode-label text-text-muted">Reason for replacement</h3>
      <ReasonChipPicker
        value={reason}
        onChange={(code) => onReasonChange(REPLACEMENT_REASONS.find((r) => r.id === code)?.id ?? null)}
        options={REASON_OPTIONS}
        ariaLabel="Reason for replacement"
      />
      <TextField
        label="Note (optional)"
        value={note}
        onChange={(next) => onNoteChange(next.slice(0, NOTE_MAX))}
        multiline
        rows={2}
        maxLength={NOTE_MAX}
        data-testid="send-replacement-note"
      />
    </section>
  );
}
