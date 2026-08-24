'use client';

/**
 * Workspace persistence — the bridge between the in-memory store and the two
 * places a workspace survives a reload.
 *
 * 1. **`staff_preferences.prefs.workspace`** — the durable, cross-device SoT.
 *    Per (org, staff), Zod-gated, RLS from birth, **no migration**: `prefs` is
 *    an open JSONB bag and an absent key already means "start from empty".
 * 2. **A localStorage mirror** — a flash-free first paint while the prefs GET
 *    is in flight.
 *
 * Two hazards this module exists to not repeat:
 *
 * - **The prefs merge is SHALLOW** (`prefs || patch`). Writing a nested partial
 *   REPLACES the whole `workspace` object, so {@link serializeWorkspace} always
 *   emits the complete sub-map and callers PUT that.
 * - **The mirror key carries identity.** The existing `cf.quickAccess` mirror
 *   does not, so a second staffer signing in on a shared floor terminal reads
 *   the previous operator's bag. {@link workspaceStorageKey} takes org + staff
 *   and there is no keyless form to reach for.
 */

import { hydrateCanvasLayout, serializeCanvasLayout } from '@/lib/canvas/store';
import {
  hydrateKeybindingsFromPrefs,
  serializeKeybindings,
} from '@/lib/keybindings/persistence';
import { getToolPaletteSnapshot, hydrateToolPalette } from '@/lib/tools/store';
import { WorkspacePrefs } from '@/lib/workspace/prefs-schema';
import { getWorkspaceSnapshot, hydrateWorkspace } from '@/lib/workspace/store';
import type { TabDescriptor, WorkspaceSnapshot } from '@/lib/workspace/types';

const MIRROR_PREFIX = 'cf.workspace';

/**
 * Device mirror key for one (org, staff) pair. Identity is REQUIRED — a shared
 * station is the normal case here, not the edge case.
 */
export function workspaceStorageKey(identity: {
  orgId: string;
  staffId: string | number;
}): string {
  return `${MIRROR_PREFIX}:${identity.orgId}:${identity.staffId}`;
}

/** The whole `workspace` sub-map, ready to PUT or mirror. */
export function serializeWorkspace(
  snapshot: WorkspaceSnapshot = getWorkspaceSnapshot(),
): WorkspacePrefs {
  return {
    openTabs: snapshot.openTabs.map((tab) => ({
      id: tab.id,
      kind: tab.kind,
      ref: tab.ref,
      params: { ...tab.params },
    })),
    pinnedTabs: [...snapshot.pinnedTabs],
    focusedTabId: snapshot.focusedTabId,
    keybindings: serializeKeybindings(),
    pinnedTools: [...getToolPaletteSnapshot().pinnedToolKeys],
    canvas: serializeCanvasLayout(),
  };
}

/** Validate an untrusted bag (prefs GET, localStorage). `null` = unusable. */
export function parseWorkspacePrefs(raw: unknown): WorkspacePrefs | null {
  const parsed = WorkspacePrefs.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/** Push a validated bag into the store. An absent/invalid bag empties it. */
export function hydrateWorkspaceFromPrefs(prefs: WorkspacePrefs | null | undefined): void {
  const tabs: TabDescriptor[] = (prefs?.openTabs ?? []).map((tab) => ({
    id: tab.id,
    kind: tab.kind,
    ref: tab.ref,
    params: tab.params ?? {},
  }));
  hydrateWorkspace({
    openTabs: tabs,
    pinnedTabs: prefs?.pinnedTabs ?? [],
    focusedTabId: prefs?.focusedTabId ?? null,
  });
  hydrateKeybindingsFromPrefs(prefs?.keybindings);
  hydrateToolPalette({ pinnedToolKeys: prefs?.pinnedTools ?? [] });
  // ORDER MATTERS: the workspace store must already hold the tabs, because
  // `hydrateCanvasLayout` reads `getWorkspaceSnapshot()` itself to reconcile
  // the restored arrangement against what is actually open — a pane naming a
  // tab that no longer exists is dropped rather than rendered empty.
  hydrateCanvasLayout(prefs?.canvas);
}

/** Read the device mirror. Corrupt / unavailable storage reads as empty. */
export function readWorkspaceMirror(key: string): WorkspacePrefs | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? parseWorkspacePrefs(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

/** Write the device mirror. Quota / private-mode failures are non-fatal. */
export function writeWorkspaceMirror(key: string, prefs: WorkspacePrefs): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(prefs));
  } catch {
    /* quota / private mode — the prefs bag is still the SoT */
  }
}
