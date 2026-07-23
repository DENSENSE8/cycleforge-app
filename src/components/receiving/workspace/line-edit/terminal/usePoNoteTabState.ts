'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * Lifted inventory-notes (PO note) state — draft, dirty, sync, save.
 *
 * Owned at the LineEditPanel level so BOTH the content-only LinePoNoteCard and
 * the tab-aware StationTerminalDock can share the same draft / save path.
 * Lazy sync on tab activate (same contract as the former in-card footer).
 */
export interface PoNoteTabState {
  draft: string;
  setDraft: (next: string) => void;
  dirty: boolean;
  loading: boolean;
  saving: boolean;
  save: () => Promise<void>;
  syncFromInventory: () => Promise<void>;
}

export function usePoNoteTabState({
  overallZohoNotes,
  active,
  onSaveOverallNote,
  onLoadZohoNotes,
}: {
  overallZohoNotes: string | null;
  /** Whether the Zoho (PO notes) tab is currently selected. */
  active: boolean;
  onSaveOverallNote: (text: string) => void | Promise<void>;
  onLoadZohoNotes?: () => Promise<string | null | undefined>;
}): PoNoteTabState {
  const [draft, setDraft] = useState(overallZohoNotes ?? '');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);

  // Re-seed when the carton's synced note changes (carton switch, external save).
  useEffect(() => {
    setDraft(overallZohoNotes ?? '');
  }, [overallZohoNotes]);

  const dirty = draft.trim() !== (overallZohoNotes ?? '').trim();

  const syncFromInventory = useCallback(async () => {
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

  // On becoming the active tab, pull the latest note so the operator edits
  // current truth. Lazy: an unopened (mounted-but-hidden) tab never syncs.
  useEffect(() => {
    if (active) void syncFromInventory();
    // Only react to the tab becoming active — syncFromInventory guards dirty itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const save = useCallback(async () => {
    if (!dirty || saving) return;
    setSaving(true);
    try {
      await onSaveOverallNote(draft.trim());
    } finally {
      setSaving(false);
    }
  }, [dirty, saving, onSaveOverallNote, draft]);

  return {
    draft,
    setDraft,
    dirty,
    loading,
    saving,
    save,
    syncFromInventory,
  };
}
