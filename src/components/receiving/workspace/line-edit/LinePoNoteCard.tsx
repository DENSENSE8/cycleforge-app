'use client';

import { useCallback, useEffect, useState } from 'react';
import { Check, Download, Loader2 } from '@/components/Icons';
import { Button } from '@/design-system/primitives';
import { WorkspaceCard } from '@/design-system/components';
import { HoverTooltip } from '@/components/ui/HoverTooltip';

const NOTES_TEXTAREA_FOCUS =
  'focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20';

/**
 * Synced PO-note editor — the carton-level note that lives on the linked purchase
 * order in the connected inventory system. A first-class "PO note" display tab in
 * the unbox workspace (peer of Unbox / Checklist). Matched cartons only — an
 * unfound carton has no PO, so the tab is not shown.
 *
 * This is the full editor (view / reload / overwrite), distinct from the notes
 * composer's push button, which only APPENDS the per-line note to this PO note.
 * On becoming the active tab it pulls the latest value from inventory (unless the
 * draft has unsaved edits) so the operator always edits current truth — lazily,
 * so an unopened tab never fires an inventory round-trip.
 */
export function LinePoNoteCard({
  overallZohoNotes,
  active,
  onSaveOverallNote,
  onLoadZohoNotes,
}: {
  /** Current synced PO note (carton-level). */
  overallZohoNotes: string | null;
  /** Whether this tab is currently selected — gates the lazy pull-from-inventory. */
  active: boolean;
  /** Persist (overwrite) the PO note + push to the inventory PO field. */
  onSaveOverallNote: (text: string) => void | Promise<void>;
  /** Pull the latest PO note from the inventory system. No-op if absent. */
  onLoadZohoNotes?: () => Promise<string | null | undefined>;
}) {
  const [draft, setDraft] = useState(overallZohoNotes ?? '');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);

  // Re-seed when the carton's synced note changes (carton switch, external save).
  useEffect(() => {
    setDraft(overallZohoNotes ?? '');
  }, [overallZohoNotes]);

  const dirty = draft.trim() !== (overallZohoNotes ?? '').trim();

  const loadFromInventory = useCallback(async () => {
    if (!onLoadZohoNotes || loading) return;
    // Never clobber unsaved edits with a fresh pull.
    if (draft.trim() !== (overallZohoNotes ?? '').trim()) return;
    setLoading(true);
    try {
      const fresh = await onLoadZohoNotes();
      if (fresh !== undefined) setDraft(fresh ?? '');
    } finally {
      setLoading(false);
    }
  }, [onLoadZohoNotes, loading, draft, overallZohoNotes]);

  // On becoming the active tab, pull the latest note so the operator edits current
  // truth. Lazy: an unopened (mounted-but-hidden) tab never syncs.
  useEffect(() => {
    if (active) void loadFromInventory();
    // Only react to the tab becoming active — loadFromInventory guards staleness/dirty itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const handleSave = async () => {
    if (!dirty || saving) return;
    setSaving(true);
    try {
      await onSaveOverallNote(draft.trim());
    } finally {
      setSaving(false);
    }
  };

  return (
    <WorkspaceCard variant="glass" overflow="visible" bodyClassName="space-y-1 p-4">
      <textarea
        rows={6}
        aria-label="Synced PO note"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="Carton note on the linked PO — edits overwrite the synced note"
        className={`min-h-[8rem] w-full resize-y rounded-lg border border-border-soft inset-field text-role-caption text-text-default placeholder:text-text-faint ${NOTES_TEXTAREA_FOCUS}`}
      />
      <div className="flex items-center justify-between gap-2">
        <span className="text-role-micro font-semibold uppercase tracking-wide text-text-faint">
          {loading ? (
            <span className="inline-flex items-center gap-1 text-blue-500">
              <Loader2 className="h-3 w-3 animate-spin" /> Syncing from inventory…
            </span>
          ) : onLoadZohoNotes ? (
            <HoverTooltip
              label={dirty ? 'Save or discard edits first' : 'Reload the latest synced note'}
              asChild
            >
              <Button
                variant="ghost"
                size="sm"
                icon={<Download className="h-3 w-3" />}
                onClick={() => void loadFromInventory()}
                disabled={dirty}
                aria-label={dirty ? 'Save or discard edits first' : 'Reload the latest synced note'}
                className="h-auto gap-1 px-0 text-role-micro font-semibold uppercase tracking-wide text-text-faint hover:bg-transparent hover:text-text-muted"
              >
                Sync from inventory
              </Button>
            </HoverTooltip>
          ) : null}
        </span>
        <HoverTooltip label="Save the note to the synced PO" asChild>
          {/* ds-raw-button: emerald save action, styled to match the receive bar */}
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={!dirty || saving || loading}
            aria-label="Save the note to the synced PO"
            className="ds-raw-button inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-role-caption font-bold uppercase tracking-wide text-white ring-1 ring-inset ring-emerald-700 transition disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Check className="h-3.5 w-3.5" />
            {saving ? 'Saving…' : 'Save to inventory'}
          </button>
        </HoverTooltip>
      </div>
    </WorkspaceCard>
  );
}
