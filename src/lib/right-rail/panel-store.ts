'use client';

/**
 * Right-rail panel lifecycle — singleton dismiss / draft cache / resume.
 * Park is silent (no "Draft saved." toast) — operator 2026-09-01.
 */

import { useEffect, useSyncExternalStore } from 'react';
import { toast } from '@/lib/toast';

/** Payload the host treats as "the view in the slot". */
export interface RightRailViewPayload {
  id: string;
}

/** Cached unsaved state from the last dismissed view. */
export interface RightRailDraftCache {
  viewId: string;
  data: unknown;
  capturedAt: number;
}

export interface PanelStoreSnapshot {
  /** Occupant the operator last opened. Stays set while dismissed so Resume can remount. */
  activeView: RightRailViewPayload | null;
  /** Unsaved form/view cache. Null until the first closeAndCachePanel. */
  draftData: RightRailDraftCache | null;
  /** True after closeAndCachePanel until Resume / a new openPanel. Host skips painting this id. */
  dismissed: boolean;
  /** True while a draft-resume chord is armed (Mod+Shift+R). Default notify disarms immediately — no toast. */
  draftToastArmed: boolean;
}

interface PanelStoreNotifyDeps {
  now: () => number;
  notifyDraftSaved: (input: { onResume: () => void; onDismiss: () => void }) => void;
  dismissToast: () => void;
}

const EMPTY: PanelStoreSnapshot = {
  activeView: null,
  draftData: null,
  dismissed: false,
  draftToastArmed: false,
};

const defaultNotifyDeps: PanelStoreNotifyDeps = {
  now: () => Date.now(),
  // Operator 2026-09-01: park silently — no "Draft saved." toast on →| / Esc /
  // row churn. Resume stays on Mod+Shift+R only while draftToastArmed (tests /
  // hosts may still arm via setPanelStoreNotifyDeps).
  notifyDraftSaved: ({ onDismiss }) => {
    onDismiss();
  },
  dismissToast: () => {
    toast.dismiss();
  },
};

let notifyDeps: PanelStoreNotifyDeps = defaultNotifyDeps;
let draftCapture: (() => unknown) | null = null;
let liveDraft: unknown = undefined;

let snapshot: PanelStoreSnapshot = EMPTY;
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

function replace(next: PanelStoreSnapshot): void {
  if (
    snapshot.activeView?.id === next.activeView?.id &&
    snapshot.draftData === next.draftData &&
    snapshot.dismissed === next.dismissed &&
    snapshot.draftToastArmed === next.draftToastArmed
  ) {
    return;
  }
  snapshot = next;
  emit();
}

/** Test / host-unmount waist. Production: `RightRailHost` cleanup. */
export function resetPanelStore(): void {
  draftCapture = null;
  liveDraft = undefined;
  snapshot = EMPTY;
  emit();
}

export function setPanelStoreNotifyDeps(deps: Partial<PanelStoreNotifyDeps>): void {
  notifyDeps = { ...notifyDeps, ...deps };
}

export function restorePanelStoreNotifyDeps(): void {
  notifyDeps = defaultNotifyDeps;
}

/**
 * Views with unsaved fields register a getter. closeAndCachePanel snapshots it
 * at dismiss so the view can unmount (destroying wedge / keydown listeners)
 * without losing the draft.
 */
export function setPanelDraftCapture(fn: (() => unknown) | null): void {
  draftCapture = fn;
}

/** Incremental cache while the view is mounted — fallback if no capture getter. */
export function setPanelDraftData(data: unknown): void {
  liveDraft = data;
}

function captureDraft(): unknown {
  if (draftCapture) {
    try {
      return draftCapture();
    } catch {
      return liveDraft ?? {};
    }
  }
  return liveDraft ?? {};
}

/**
 * Mount (or override) the singleton view. A new id clears dismiss so the host
 * paints immediately — picking another row never leaves a stale parked draft
 * on screen.
 */
export function openPanel(view: RightRailViewPayload): void {
  replace({
    ...snapshot,
    activeView: { id: view.id },
    dismissed: false,
  });
}

/**
 * Occupancy sync: a newly registered occupant is an implicit openPanel.
 * Re-registering the same id while dismissed must NOT undismiss (the toast
 * still owns Resume). An empty slot clears activeView only when not dismissed.
 */
export function syncPanelOccupant(id: string | null): void {
  if (id == null) {
    if (!snapshot.dismissed && snapshot.activeView != null) {
      replace({ ...snapshot, activeView: null });
    }
    return;
  }
  if (snapshot.activeView?.id !== id) {
    openPanel({ id });
  }
}

/**
 * →| / Esc. Snapshot dirty state, unmount the view (host skips its occupant
 * id). Parks silently — no "Draft saved." toast (operator 2026-09-01).
 */
export function closeAndCachePanel(): void {
  const view = snapshot.activeView;
  if (!view || snapshot.dismissed) return;

  const data = captureDraft();
  liveDraft = undefined;
  draftCapture = null;
  replace({
    activeView: view,
    draftData: {
      viewId: view.id,
      data,
      capturedAt: notifyDeps.now(),
    },
    dismissed: true,
    draftToastArmed: false,
  });
}

function disarmDraftToast(): void {
  if (!snapshot.draftToastArmed) return;
  replace({ ...snapshot, draftToastArmed: false });
}

/** Toast Resume · Mod+Shift+R. Remounts the cached view; host paints again. */
export function reopenDraft(): void {
  if (!snapshot.dismissed && !snapshot.draftData) return;
  notifyDeps.dismissToast();
  disarmDraftToast();
  replace({
    ...snapshot,
    dismissed: false,
    draftToastArmed: false,
  });
}

function subscribePanelStore(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getPanelStore(): PanelStoreSnapshot {
  return snapshot;
}

function getServerPanelStore(): PanelStoreSnapshot {
  return EMPTY;
}

/** React waist — the named `usePanelStore` the host and views subscribe through. */
export function usePanelStore(): PanelStoreSnapshot {
  return useSyncExternalStore(subscribePanelStore, getPanelStore, getServerPanelStore);
}

/** Hydrate a remounted view from the last closeAndCachePanel snapshot. */
function useRestoredPanelDraft<T = unknown>(): T | undefined {
  const snap = usePanelStore();
  if (!snap.draftData) return undefined;
  if (snap.activeView && snap.draftData.viewId !== snap.activeView.id) return undefined;
  return snap.draftData.data as T;
}

/**
 * View opt-in: pass `getDraft` to snapshot unsaved fields on →| / Esc.
 * Omit it to only read the restored cache (what the host occupant body does).
 */
export function usePanelDraft<T = unknown>(getDraft?: () => T): T | undefined {
  useEffect(() => {
    if (!getDraft) return undefined;
    setPanelDraftCapture(getDraft);
    return () => setPanelDraftCapture(null);
  }, [getDraft]);
  return useRestoredPanelDraft<T>();
}
