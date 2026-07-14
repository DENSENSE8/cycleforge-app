'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { ReceivingLineRow } from '@/components/station/ReceivingLinesTable';
import { dispatchSelectLine } from '@/components/station/ReceivingLinesTable';
import {
  setItemDescHandoff,
  takeItemDescHandoff,
} from '@/components/receiving/workspace/itemDescHandoff';
import type { InlineActionFeedbackPayload } from '@/components/receiving/workspace/InlineActionFeedbackCard';
import type { ApiResponse } from './usePoLinesData';

function zohoSkipNote(zoho?: { skipped?: string }): string | undefined {
  switch (zoho?.skipped) {
    case 'no_zoho_link':
      return 'Saved locally — no PO link on this line.';
    case 'no_line_item_id':
      return 'Saved locally — sync purchase orders first.';
    case 'po_not_editable':
      return 'Saved locally — the synced PO is not editable.';
    default:
      return undefined;
  }
}

interface Args {
  queryKey: readonly unknown[];
  activeLineId: number;
  /** Every sibling line — the handoff consumer resolves the now-active line from here. */
  allRows: ReceivingLineRow[];
  /** Falls back to the placeholder line when the fetch hasn't resolved yet. */
  placeholderActiveRow?: ReceivingLineRow;
  /** Success/error feedback renders below the label preview in LineEditPanel. */
  onItemDescFeedback?: (feedback: InlineActionFeedbackPayload | null) => void;
  /** Called after a successful local + Zoho item-description save. */
  onItemDescSaved?: (lineId: number, zohoNotes: string | null) => void;
  /** Un-collapse the active row body so the editor is visible when opened. */
  expandActiveRow: () => void;
}

export interface PoLineItemDescriptionEditor {
  /** The line whose description editor is currently swapped into the row body, or null. */
  shownId: number | null;
  /** Current draft text for the shown line. */
  draft: string;
  /** The line whose PATCH is in flight, or null. */
  savingLineId: number | null;
  inputRef: React.RefObject<HTMLInputElement>;
  /** Open (or refresh) the editor for a line, switching to it first if it isn't active. */
  open: (line: ReceivingLineRow) => void;
  /** Notes-icon behavior: close if already open on this line, else open. */
  toggle: (line: ReceivingLineRow) => void;
  setDraft: (value: string) => void;
  save: (lineId: number) => Promise<void>;
}

/**
 * Inline Zoho item-description (line desc) editor for {@link PoLinesAccordion}.
 *
 * The notes icon toggles a line's meta display between the condition + serial
 * chips and the Zoho item description in the same slot; clicking the shown
 * description opens this inline editor, whose green check saves to
 * `receiving_lines.zoho_notes` and pushes the same text to the linked Zoho PO
 * line item description. Mirrors the narrow-editor shape of
 * {@link useCartonLabelEditor}: one editable surface, own state, delegates
 * persistence.
 *
 * Opening from a non-active row stashes an {@link itemDescHandoff} and switches
 * lines first (per-line state is wiped on the switch, so intent must cross it
 * via the module-scoped handoff).
 */
export function usePoLineItemDescriptionEditor({
  queryKey,
  activeLineId,
  allRows,
  placeholderActiveRow,
  onItemDescFeedback,
  onItemDescSaved,
  expandActiveRow,
}: Args): PoLineItemDescriptionEditor {
  const queryClient = useQueryClient();
  const [shownId, setShownId] = useState<number | null>(null);
  const [edit, setEdit] = useState<{ id: number; draft: string } | null>(null);
  const [savingLineId, setSavingLineId] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Consume a title-click handoff queued before `dispatchSelectLine` re-seeded
  // this accordion, so the editor opens on the newly active line instead of
  // being wiped with React state.
  useEffect(() => {
    const line =
      allRows.find((r) => r.id === activeLineId) ??
      (placeholderActiveRow?.id === activeLineId ? placeholderActiveRow : undefined);
    if (!line) return;
    if (!takeItemDescHandoff(activeLineId)) return;
    setShownId(line.id);
    setEdit({ id: line.id, draft: line.zoho_notes ?? '' });
    expandActiveRow();
  }, [activeLineId, allRows, placeholderActiveRow, expandActiveRow]);

  // Focus + place the caret at the end whenever the editor (re)opens.
  useEffect(() => {
    if (shownId == null) return;
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      const len = el.value.length;
      el.focus();
      el.setSelectionRange(len, len);
      el.scrollLeft = el.scrollWidth;
    });
  }, [shownId, edit?.id]);

  /** Open (or refresh) the editor for a line. If that line isn't active yet,
   *  stash a handoff and switch first so the expand motion lands on the
   *  selected row after re-seed. */
  const open = useCallback(
    (line: ReceivingLineRow) => {
      onItemDescFeedback?.(null);
      if (line.id !== activeLineId) {
        setItemDescHandoff(line.id);
        dispatchSelectLine(line);
        return;
      }
      setShownId(line.id);
      setEdit({ id: line.id, draft: line.zoho_notes ?? '' });
      expandActiveRow();
    },
    [activeLineId, onItemDescFeedback, expandActiveRow],
  );

  const toggle = useCallback(
    (line: ReceivingLineRow) => {
      if (shownId === line.id) {
        setShownId(null);
        setEdit(null);
        onItemDescFeedback?.(null);
        return;
      }
      open(line);
    },
    [shownId, open, onItemDescFeedback],
  );

  const setDraft = useCallback(
    (value: string) => {
      setEdit((prev) => (prev ? { ...prev, draft: value } : prev));
      onItemDescFeedback?.(null);
    },
    [onItemDescFeedback],
  );

  const save = useCallback(
    async (lineId: number) => {
      if (!edit || edit.id !== lineId || savingLineId != null) return;
      const next = edit.draft.trim() || null;
      setSavingLineId(lineId);
      onItemDescFeedback?.(null);
      try {
        const res = await fetch(`/api/receiving/lines/${lineId}/inventory-note`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ zoho_notes: next }),
        });
        const data = (await res.json().catch(() => null)) as {
          error?: string;
          zoho?: { patched?: boolean; skipped?: string };
        } | null;
        if (res.ok) {
          queryClient.setQueryData<ApiResponse>(queryKey, (prev) =>
            prev?.receiving_lines
              ? {
                  ...prev,
                  receiving_lines: prev.receiving_lines.map((r) =>
                    r.id === lineId ? ({ ...r, zoho_notes: next } as ReceivingLineRow) : r,
                  ),
                }
              : prev,
          );
          setEdit({ id: lineId, draft: next ?? '' });
          onItemDescSaved?.(lineId, next);
          onItemDescFeedback?.({
            tone: 'emerald',
            headline: next ? 'Item description updated' : 'Item description cleared',
            items: next ? [next] : [],
            note: data?.zoho?.patched ? undefined : zohoSkipNote(data?.zoho),
            at: Date.now(),
          });
          // No invalidate here: the setQueryData patch above IS the SoT. A
          // trailing invalidateQueries forced a full siblings refetch that
          // re-rendered every row and could briefly overwrite the just-saved
          // text when the server read lagged the write.
        } else {
          onItemDescFeedback?.({
            tone: 'amber',
            headline: 'Could not save item description',
            items: [],
            note: data?.error?.trim() || 'Save failed',
            at: Date.now(),
          });
        }
      } catch {
        onItemDescFeedback?.({
          tone: 'amber',
          headline: 'Could not save item description',
          items: [],
          note: 'Save failed',
          at: Date.now(),
        });
      } finally {
        setSavingLineId(null);
      }
    },
    [edit, savingLineId, queryClient, queryKey, onItemDescFeedback, onItemDescSaved],
  );

  return {
    shownId,
    draft: edit?.draft ?? '',
    savingLineId,
    inputRef,
    open,
    toggle,
    setDraft,
    save,
  };
}
