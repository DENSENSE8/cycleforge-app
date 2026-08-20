'use client';

/**
 * Arrival dock note — one flush entry field on the door bench's floor.
 *
 * @domain-job Capture a free-text remark about the CARTON at the door, before
 *   anyone opens it ("arrived crushed", "no packing slip", "seal cut").
 * @hardware-target Station
 * @density floor
 * @justification Cannot reuse Unbox's {@link LineNotesCard}: that composer is
 *   bound to `receiving_line.notes` (per LINE ITEM) and carries the label-note
 *   ghost autocomplete that couples it to the printed sticker face. Arrival is
 *   the carton pass — it has no line the operator has chosen — so the note here
 *   is carton-grain and lands in `receiving.support_notes`. Same house shell
 *   ({@link OmnichannelComposerDock}), different column: a sibling, not a fork.
 *
 * **Why `support_notes` and not `receiving_line.notes`.** A door note describes
 * the box. On a multi-line PO, writing the line column would mean silently
 * picking one of N lines, and it would collide with the note the Unbox operator
 * writes later on that same buffer — two stations overwriting one field. The
 * grain split is the house rule (`source-of-truth.md` → Note vs label grain):
 * `receiving_line.notes` is per line item; `receiving.support_notes` is the
 * carton-wide remark. Storage is the same PATCH the staging control already
 * uses, so no new write path was invented for this.
 *
 * Save contract mirrors the existing carton-note editor in the Incoming details
 * rail (`NotesTab`): trim, null out an emptied field, no write when unchanged.
 * Commit is ⌘/Ctrl+Enter or blur — never a scan, and this field registers NO
 * scan sink and NO focus target, so the wedge keeps pointing at the sidebar
 * ingest bar.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { OmnichannelComposerDock } from '@/design-system/primitives';
import { invalidateReceivingFeeds } from '@/lib/queries/receiving-queries';
import { toast } from '@/lib/toast';

export function ArrivalCartonNotesEntry({
  receivingId,
  initialValue,
}: {
  receivingId: number | null;
  /** Current `receiving.support_notes` for this carton. */
  initialValue: string;
}) {
  const [value, setValue] = useState(initialValue);
  const [saving, setSaving] = useState(false);
  const queryClient = useQueryClient();
  // The committed server value, so an in-flight edit is not re-clobbered by a
  // refetch and a no-op commit does not issue a write.
  const savedRef = useRef(initialValue);

  // Re-seed when the dock swaps to a different carton. Keyed on receivingId as
  // well as the value: two cartons can legitimately hold the same note text.
  useEffect(() => {
    setValue(initialValue);
    savedRef.current = initialValue;
  }, [initialValue, receivingId]);

  const save = useCallback(async () => {
    if (receivingId == null) return;
    const trimmed = value.trim();
    if (trimmed === savedRef.current.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/receiving/${receivingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ support_notes: trimmed || null }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) throw new Error(data?.error || 'save failed');
      savedRef.current = trimmed;
      invalidateReceivingFeeds(queryClient);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save the note');
    } finally {
      setSaving(false);
    }
  }, [receivingId, value, queryClient]);

  return (
    <OmnichannelComposerDock
      value={value}
      onChange={setValue}
      onCommit={() => void save()}
      onBlur={() => void save()}
      placeholder="Note about this carton…"
      ariaLabel="Note about this carton"
      disabled={receivingId == null || saving}
      // Nested inside the dock host's own band — the host owns the plane, so
      // this must not paint a second raised card on top of it.
      chrome="bare"
      density="compact"
      autoGrow
      hideCommitButton
    />
  );
}
