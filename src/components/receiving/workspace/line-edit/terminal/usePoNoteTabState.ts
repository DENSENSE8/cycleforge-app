'use client';

import { useCallback, useEffect, useState } from 'react';
import type {
  SaveOverallNoteOptions,
  SaveOverallNoteResult,
} from '../hooks/useSyncedPoNote';

/** Lifted inventory-notes (PO note) state — draft, dirty, sync, save. */
export interface PoNoteTabState {
  draft: string;
  setDraft: (next: string) => void;
  dirty: boolean;
  loading: boolean;
  saving: boolean;
  save: () => Promise<SaveOverallNoteResult | void>;
  syncFromInventory: () => Promise<void>;
  /** Stamp from last trusted pull — Inventory Displays seeds this from the dossier. */
  baseLastModifiedZoho: string | null;
  setBaseLastModifiedZoho: (next: string | null) => void;
}

export function usePoNoteTabState({
  overallZohoNotes,
  active,
  onSaveOverallNote,
  onLoadZohoNotes,
  /** Carton / PO identity — re-pull when the operator switches cartons while Inventory stays open. */
  syncKey = null,
}: {
  overallZohoNotes: string | null;
  /** Whether the Zoho (PO notes) tab is currently selected. */
  active: boolean;
  onSaveOverallNote: (
    text: string,
    opts?: SaveOverallNoteOptions,
  ) => void | Promise<void | SaveOverallNoteResult>;
  onLoadZohoNotes?: () => Promise<string | null | undefined>;
  syncKey?: string | number | null;
}): PoNoteTabState {
  const [draft, setDraft] = useState(overallZohoNotes ?? '');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [baseLastModifiedZoho, setBaseLastModifiedZoho] = useState<string | null>(null);

  const dirty = draft.trim() !== (overallZohoNotes ?? '').trim();

  // Re-seed when the carton's synced note changes (carton switch, external save).
  // Never wipe a dirty draft when the feed briefly reports null mid-pull.
  useEffect(() => {
    if (dirty) return;
    setDraft(overallZohoNotes ?? '');
  }, [overallZohoNotes, dirty]);

  const syncFromInventory = useCallback(async () => {
    if (!onLoadZohoNotes || loading) return;
    // Never clobber unsaved edits with a fresh pull.
    if (draft.trim() !== (overallZohoNotes ?? '').trim()) return;
    setLoading(true);
    try {
      const fresh = await onLoadZohoNotes();
      // Successful string (incl. '') updates the draft. null/undefined = failed
      // pull — keep whatever we have so empty local never wipes a good draft.
      if (typeof fresh === 'string') setDraft(fresh);
    } finally {
      setLoading(false);
    }
  }, [onLoadZohoNotes, loading, draft, overallZohoNotes]);

  // On becoming the active tab (or switching carton while open), pull latest.
  useEffect(() => {
    if (active) void syncFromInventory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, syncKey]);

  const save = useCallback(async () => {
    if (!dirty || saving) return;
    setSaving(true);
    try {
      const result = await onSaveOverallNote(draft.trim(), {
        baseLastModifiedZoho,
      });
      if (
        result &&
        typeof result === 'object' &&
        result.ok &&
        result.liveLastModifiedZoho
      ) {
        setBaseLastModifiedZoho(result.liveLastModifiedZoho);
      }
      return result;
    } finally {
      setSaving(false);
    }
  }, [dirty, saving, onSaveOverallNote, draft, baseLastModifiedZoho]);

  return {
    draft,
    setDraft,
    dirty,
    loading,
    saving,
    save,
    syncFromInventory,
    baseLastModifiedZoho,
    setBaseLastModifiedZoho,
  };
}
