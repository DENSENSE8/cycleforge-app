'use client';

/**
 * Canvas store — the single owner of "where the open tabs are arranged".
 *
 * Module-level singleton + `subscribe`/`emit` + a cached immutable snapshot for
 * `useSyncExternalStore`, the same shape as `src/lib/right-rail/store.ts` and
 * `src/lib/workspace/store.ts`. A fresh object out of `getSnapshot()` on every
 * call is an infinite render loop, so the snapshot is rebuilt only on a real
 * mutation.
 *
 * ## The split with the workspace store
 *
 * `@/lib/workspace/store` owns **what is open** — the tab list, the pins, the
 * focused tab, and the suspension contract. This store owns **where those tabs
 * sit** — the tiling tree. Two stores rather than one because they answer to
 * different authorities: the tab list is persisted per staffer and is the thing
 * an AI verb or a deep link mutates, while the arrangement is a per-device
 * viewport question that a 1440px laptop and a 2560px bench legitimately answer
 * differently.
 *
 * The dependency runs one way. This store imports the workspace store to move
 * focus (focusing a PANE is focusing the tab that pane is showing — there is no
 * second notion of focus, and inventing one is how a window manager grows a
 * "which tile owns the scan" problem the operator already ruled does not exist).
 * The workspace store imports nothing from here.
 *
 * ## Why the store caches the open-tab list
 *
 * Every mutation has to reconcile against what is open — closing a pane re-homes
 * its tabs rather than closing them, and a preset deals the open tabs across
 * fresh panes. Rather than make every mutation take the tab list as an argument
 * (and every call site remember to pass a current one), {@link syncCanvasLayout}
 * caches what the workspace last published. The host calls it on every workspace
 * commit, so the cache is never more than one render stale, and a mutation can
 * always answer "what am I arranging".
 */

import {
  canvasGroup,
  canvasGroups,
  closeGroup,
  evenOutSplits,
  findGroup,
  findGroupForTab,
  moveTabToGroup,
  neighbourGroupId,
  parseCanvasLayout,
  reconcileCanvasLayout,
  setActiveTab,
  setSplitRatio,
  splitGroup,
  type CanvasDirection,
  type CanvasNode,
  type CanvasOrientation,
} from '@/lib/canvas/layout';
import { publishCanvasLayoutChange } from '@/lib/canvas/native-overlay';
import { CANVAS_PRESETS, type CanvasPresetId } from '@/lib/canvas/presets';
import { focusTab, getWorkspaceSnapshot } from '@/lib/workspace/store';

export interface CanvasSnapshot {
  readonly root: CanvasNode;
  /** Non-null while one pane is zoomed to the whole canvas. */
  readonly maximizedGroupId: string | null;
  /** The pane showing the workspace's focused tab, or the leading pane. */
  readonly focusedGroupId: string | null;
}

type Listener = () => void;

const listeners = new Set<Listener>();

/** Monotonic per-process id counter — deterministic, so tests read cleanly. */
let idSeq = 0;
function nextGroupId(): string {
  idSeq += 1;
  return `g${idSeq}`;
}
function nextSplitId(): string {
  idSeq += 1;
  return `s${idSeq}`;
}

let root: CanvasNode = canvasGroup('g0');
let maximizedGroupId: string | null = null;

/**
 * The pane the operator is working in.
 *
 * Held rather than derived from `focusedTabId` on every read, for one reason: an
 * EMPTY pane can be focused. It is the launcher surface, and "split, then pick
 * what goes in the new half" is the gesture that creates one — a pane focus that
 * could only be expressed through a tab would make the new pane unreachable
 * until something was already in it.
 *
 * This is not a second notion of focus competing with the workspace's. Whenever
 * the focused pane holds tabs, focusing it focuses its active tab through
 * `focusTab`, and {@link syncCanvasLayout} re-derives from the workspace. The
 * two can only differ while a pane is empty, which is exactly the case the
 * workspace has no way to represent.
 */
let focusedGroupId: string | null = 'g0';

/** Last workspace publication — see the "why the store caches" docblock. */
let openTabIds: readonly string[] = [];
let focusedTabId: string | null = null;

/**
 * The pane a re-homed tab lands in when the tree has nowhere obvious to put it.
 * Reuses the LEADING pane's own id rather than minting one, so a reconcile that
 * changes nothing does not walk the id counter forward and make every later id
 * depend on how many times the workspace happened to publish.
 */
function homeGroupId(): string {
  return canvasGroups(root)[0]?.id ?? nextGroupId();
}

/**
 * Re-seat pane focus after a tree edit. The tab the workspace says is focused
 * wins; a pane focus that still names a live pane is kept (that is how an empty
 * launcher pane holds focus); otherwise the leading pane takes it.
 */
function resettleFocus(): void {
  const owning = focusedTabId ? findGroupForTab(root, focusedTabId)?.id : null;
  if (owning) {
    focusedGroupId = owning;
    return;
  }
  if (focusedGroupId && findGroup(root, focusedGroupId)) return;
  focusedGroupId = canvasGroups(root)[0]?.id ?? null;
}

let snapshot: CanvasSnapshot = { root, maximizedGroupId, focusedGroupId };

/**
 * Frozen constant, not a fresh object: `useSyncExternalStore` re-invokes the
 * server snapshot on every server render and a new identity each time loops.
 */
const SERVER_SNAPSHOT: CanvasSnapshot = Object.freeze({
  root: canvasGroup('g0'),
  maximizedGroupId: null,
  focusedGroupId: 'g0',
});

function commit(reason: Parameters<typeof publishCanvasLayoutChange>[0] = 'layout'): void {
  if (
    root === snapshot.root &&
    maximizedGroupId === snapshot.maximizedGroupId &&
    focusedGroupId === snapshot.focusedGroupId
  ) {
    return;
  }
  snapshot = { root, maximizedGroupId, focusedGroupId };
  // Native overlays sit ABOVE the page at absolute window pixels and do not
  // reflow with the DOM — see `native-overlay.ts`. Publishing here (rather than
  // in the host's render) is what guarantees a layout change that MOVES a slot
  // without resizing it still re-issues bounds.
  publishCanvasLayoutChange(reason);
  for (const listener of listeners) listener();
}

export function subscribeCanvas(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getCanvasSnapshot(): CanvasSnapshot {
  return snapshot;
}

export function getServerCanvasSnapshot(): CanvasSnapshot {
  return SERVER_SNAPSHOT;
}

/**
 * Reconcile the arrangement against the workspace's open tabs. The host calls
 * this on every workspace commit; it is idempotent and cheap when nothing moved.
 */
export function syncCanvasLayout(input: {
  openTabIds: readonly string[];
  focusedTabId: string | null;
}): void {
  openTabIds = [...input.openTabIds];
  focusedTabId = input.focusedTabId;
  root = reconcileCanvasLayout({
    root,
    openTabIds,
    focusedTabId,
    fallbackGroupId: homeGroupId(),
  });
  // A zoomed pane that no longer exists must not keep the canvas in single mode.
  if (maximizedGroupId && !findGroup(root, maximizedGroupId)) maximizedGroupId = null;
  resettleFocus();
  commit('layout');
}

/* ── Arrangement ────────────────────────────────────────────────────────── */

/**
 * Split a pane. The new pane opens EMPTY unless the source holds more than one
 * tab, in which case its active tab moves across — see `layout.ts` on why an
 * empty pane is a first-class thing here and not a defect.
 */
export function splitPane(groupId: string, orientation: CanvasOrientation): void {
  if (!findGroup(root, groupId)) return;
  root = splitGroup(root, {
    groupId,
    orientation,
    newGroupId: nextGroupId(),
    newSplitId: nextSplitId(),
  });
  maximizedGroupId = null;
  resettleFocus();
  commit();
}

/** Split the pane the operator is working in. The hotkey path. */
export function splitFocusedPane(orientation: CanvasOrientation): void {
  if (focusedGroupId) splitPane(focusedGroupId, orientation);
}

/**
 * Close a PANE. Its tabs are not closed — they are re-homed into the pane that
 * survives, because a pane is a window and closing a window does not destroy the
 * work that was open in it. Closing the last pane leaves one empty pane rather
 * than a node-less canvas.
 */
export function closePane(groupId: string): void {
  const result = closeGroup(root, groupId);
  root = result.root ?? canvasGroup(nextGroupId());
  if (maximizedGroupId === groupId) maximizedGroupId = null;
  root = reconcileCanvasLayout({
    root,
    openTabIds,
    focusedTabId,
    fallbackGroupId: homeGroupId(),
  });
  resettleFocus();
  commit();
}

/** Move a sash. `ratio` is the FIRST child's share; clamped to `[0.1, 0.9]`. */
export function setPaneRatio(splitId: string, ratio: number): void {
  const next = setSplitRatio(root, splitId, ratio);
  if (next === root) return;
  root = next;
  commit();
}

/** Reset every sash to centre. */
export function evenOutPanes(): void {
  const next = evenOutSplits(root);
  if (next === root) return;
  root = next;
  commit();
}

/**
 * Zoom the focused pane to the whole canvas, or restore the tree. Not a layout
 * edit — the tree is untouched, so restoring is exact.
 */
export function toggleMaximizePane(groupId?: string): void {
  const target = groupId ?? focusedGroupId;
  if (!target || !findGroup(root, target)) return;
  maximizedGroupId = maximizedGroupId === target ? null : target;
  commit();
}

/** Apply a named arrangement to whatever is open. */
export function applyCanvasPreset(presetId: CanvasPresetId): void {
  const preset = CANVAS_PRESETS[presetId];
  if (!preset) return;
  const groupIds: string[] = [];
  const splitIds: string[] = [];
  root = preset.build([...openTabIds], {
    groupId: (index) => {
      while (groupIds.length <= index) groupIds.push(nextGroupId());
      return groupIds[index];
    },
    splitId: (index) => {
      while (splitIds.length <= index) splitIds.push(nextSplitId());
      return splitIds[index];
    },
  });
  maximizedGroupId = null;
  root = reconcileCanvasLayout({
    root,
    openTabIds,
    focusedTabId,
    fallbackGroupId: homeGroupId(),
  });
  resettleFocus();
  commit();
}

/* ── Focus and tab movement ─────────────────────────────────────────────── */

/**
 * Show a tab and focus it. Focusing a PANE is focusing the tab it is showing —
 * there is no second notion of focus in this app, and there must not be: the
 * operator ruled that scan ownership belongs to the one armed scan SESSION, not
 * to a tile, so a per-tile focus model would have nothing to own and would only
 * be able to disagree with the workspace.
 */
export function activateTab(tabId: string): void {
  const group = findGroupForTab(root, tabId);
  if (group) {
    root = setActiveTab(root, group.id, tabId);
    focusedGroupId = group.id;
  }
  // Keep the cached workspace focus honest RIGHT NOW rather than waiting for the
  // host's next `syncCanvasLayout`. Two canvas commands can land inside one React
  // batch (focus a pane, then move a tab out of it), and the second one reading a
  // stale focus would act on the pane the operator just left.
  focusedTabId = tabId;
  focusTab(tabId);
  commit('focus');
}

/**
 * Focus a pane by id. Focuses the tab it is showing, if it has one — an EMPTY
 * pane can hold focus with nothing behind it, which is the case the workspace
 * store has no way to represent and the reason pane focus is a field here.
 */
export function focusPane(groupId: string): void {
  const group = findGroup(root, groupId);
  if (!group || focusedGroupId === groupId) return;
  focusedGroupId = groupId;
  if (group.activeTabId) {
    activateTab(group.activeTabId);
    return;
  }
  commit('focus');
}

/** Focus the pane in a direction. No-op at the edge of the canvas. */
export function focusPaneDirection(direction: CanvasDirection): void {
  if (!focusedGroupId) return;
  const targetId = neighbourGroupId(root, focusedGroupId, direction);
  if (!targetId) return;
  const target = findGroup(root, targetId);
  if (!target) return;
  // A zoomed pane hides its neighbours; moving focus into one is the operator
  // asking to see it, so the zoom yields rather than the move being refused.
  if (maximizedGroupId && maximizedGroupId !== targetId) maximizedGroupId = null;
  focusedGroupId = targetId;
  if (target.activeTabId) {
    activateTab(target.activeTabId);
    return;
  }
  // An empty launcher pane holds pane focus with no tab to focus behind it.
  commit('focus');
}

/**
 * Send the focused tab to the pane in a direction, creating one by splitting if
 * there is nothing there. "Move it over there" should always do something — a
 * refusal at the canvas edge is the one case where the operator's intent is
 * unambiguous and the tree simply has not caught up yet.
 */
export function moveFocusedTabDirection(direction: CanvasDirection): void {
  const fromId = focusedGroupId;
  if (!fromId || !focusedTabId) return;
  const from = findGroup(root, fromId);
  if (!from || !from.tabIds.includes(focusedTabId)) return;

  const targetId = neighbourGroupId(root, fromId, direction);
  if (targetId) {
    root = moveTabToGroup(root, { tabId: focusedTabId, toGroupId: targetId });
    maximizedGroupId = null;
    focusedGroupId = targetId;
    commit();
    return;
  }

  if (from.tabIds.length < 2) return; // nothing to split off — the pane IS the tab
  const newGroupId = nextGroupId();
  root = splitGroup(root, {
    groupId: fromId,
    orientation: direction === 'left' || direction === 'right' ? 'row' : 'column',
    newGroupId,
    newSplitId: nextSplitId(),
    moveTabId: focusedTabId,
    before: direction === 'left' || direction === 'up',
  });
  maximizedGroupId = null;
  focusedGroupId = newGroupId;
  commit();
}

/** Next / previous tab within the focused pane. Wraps. */
export function cycleTabInFocusedPane(delta: 1 | -1): void {
  const group = focusedGroupId ? findGroup(root, focusedGroupId) : null;
  if (!group || group.tabIds.length === 0) return;
  const current = group.activeTabId ? group.tabIds.indexOf(group.activeTabId) : -1;
  const next = (current + delta + group.tabIds.length) % group.tabIds.length;
  activateTab(group.tabIds[next]);
}

/** Put an already-open tab into a specific pane — the launcher's landing call. */
export function adoptTabIntoPane(groupId: string, tabId: string): void {
  const target = findGroup(root, groupId);
  if (!target) return;
  if (!target.tabIds.includes(tabId)) {
    root = moveTabToGroup(root, { tabId, toGroupId: groupId });
  }
  activateTab(tabId);
  commit();
}

/* ── Persistence ────────────────────────────────────────────────────────── */

/** The arrangement, ready to mirror or PUT. See `needsOutsideLane` for the key. */
export function serializeCanvasLayout(): { root: CanvasNode; maximizedGroupId: string | null } {
  return { root, maximizedGroupId };
}

/**
 * Push a validated arrangement into the store. An unusable bag starts from one
 * empty pane rather than throwing — a corrupt preference must never be able to
 * stop the shell from mounting.
 */
export function hydrateCanvasLayout(raw: unknown): void {
  const parsed =
    raw && typeof raw === 'object'
      ? parseCanvasLayout((raw as { root?: unknown }).root ?? raw)
      : null;
  root = parsed ?? canvasGroup(nextGroupId());
  const wantMaximized =
    raw && typeof raw === 'object' ? (raw as { maximizedGroupId?: unknown }).maximizedGroupId : null;
  maximizedGroupId =
    typeof wantMaximized === 'string' && findGroup(root, wantMaximized) ? wantMaximized : null;
  const workspace = getWorkspaceSnapshot();
  syncCanvasLayout({
    openTabIds: workspace.openTabs.map((tab) => tab.id),
    focusedTabId: workspace.focusedTabId,
  });
}

/** Empty the canvas (sign-out, and the per-test reset). */
export function resetCanvas(): void {
  idSeq = 0;
  root = canvasGroup('g0');
  maximizedGroupId = null;
  focusedGroupId = 'g0';
  openTabIds = [];
  focusedTabId = null;
  snapshot = { root, maximizedGroupId, focusedGroupId };
  for (const listener of listeners) listener();
}
