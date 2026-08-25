/**
 * Canvas layout tree — pure, immutable operations on the tiling model.
 *
 * No React, no DOM, no store: every function here takes a tree and returns a new
 * tree, so the whole window manager's behaviour is provable under
 * `npx tsx --test` and the store below it stays a thin owner of "which tree is
 * current".
 *
 * ## The model: leaves are GROUPS, not tabs
 *
 * A leaf holds an ordered list of tab ids and which of them it is showing —
 * VS Code's editor-group model, and the only model that survives the store's own
 * two facts:
 *
 * - `MAX_OPEN_TABS` is 24, so "one tile per open tab" would be 24 tiles;
 * - `isTabLive()` answers true for exactly ONE tab, so even at two tiles only
 *   one subtree may be mounted.
 *
 * A group is therefore a *window*, the tabs inside it are what that window can
 * show, and the canvas tiles windows. That is what lets 24 open tabs live in 2
 * tiles without either number being a lie.
 *
 * ## Empty groups are legal and persist
 *
 * Closing a group's last tab leaves the group in place, showing the launcher.
 * Closing the PANE is a separate, explicit gesture ({@link closeGroup}).
 *
 * The alternative — auto-removing a group when its last tab closes — collapses
 * the operator's layout as a side effect of finishing a piece of work, which is
 * precisely the moment they are about to start the next one in that pane. It
 * also makes "split this pane" undefined when the source group holds a single
 * tab, since there would be nothing to put in the new half. Persisting empty
 * groups answers both: a split always yields a pane, and a pane always outlives
 * its contents.
 *
 * ## Ids come from the caller
 *
 * Every operation that creates a node takes its id as an argument rather than
 * minting one. A module-level counter would make these functions impure and
 * their tests order-dependent; the store owns the counter and passes ids down.
 */

import { clampSplitRatio } from '@/lib/canvas/geometry';

export type CanvasOrientation = 'row' | 'column';

/** Which way a window-manipulation hotkey points. */
export type CanvasDirection = 'left' | 'right' | 'up' | 'down';

/**
 * A tiling leaf: one visible pane holding N tabs and showing one of them.
 * `activeTabId` is `null` only while the group is empty.
 */
export interface CanvasGroup {
  readonly type: 'group';
  readonly id: string;
  readonly tabIds: readonly string[];
  readonly activeTabId: string | null;
}

/**
 * A binary split. Two children, not N: an N-ary node has no unambiguous answer
 * to "which sash did I just drag", and every reference tiling UI (VS Code, tmux,
 * i3) is binary underneath for exactly that reason.
 *
 * `ratio` is the FIRST child's share of the split's available px, clamped to
 * `[0.1, 0.9]` by {@link clampSplitRatio}.
 */
export interface CanvasSplit {
  readonly type: 'split';
  readonly id: string;
  readonly orientation: CanvasOrientation;
  readonly ratio: number;
  readonly children: readonly [CanvasNode, CanvasNode];
}

export type CanvasNode = CanvasGroup | CanvasSplit;

export function isGroup(node: CanvasNode): node is CanvasGroup {
  return node.type === 'group';
}

export function isSplit(node: CanvasNode): node is CanvasSplit {
  return node.type === 'split';
}

/** Construct a group, normalizing `activeTabId` into its own tab list. */
export function canvasGroup(
  id: string,
  tabIds: readonly string[] = [],
  activeTabId: string | null = null,
): CanvasGroup {
  const tabs = [...new Set(tabIds)];
  const active =
    activeTabId !== null && tabs.includes(activeTabId) ? activeTabId : (tabs[0] ?? null);
  return { type: 'group', id, tabIds: tabs, activeTabId: active };
}

export function canvasSplit(
  id: string,
  orientation: CanvasOrientation,
  first: CanvasNode,
  second: CanvasNode,
  ratio = 0.5,
): CanvasSplit {
  return {
    type: 'split',
    id,
    orientation,
    ratio: clampSplitRatio(ratio),
    children: [first, second],
  };
}

/** Every group in visual order (leading edge first, depth-first). */
export function canvasGroups(root: CanvasNode): CanvasGroup[] {
  if (isGroup(root)) return [root];
  return [...canvasGroups(root.children[0]), ...canvasGroups(root.children[1])];
}

/** Every tab id the layout holds, in visual order. */
export function canvasTabIds(root: CanvasNode): string[] {
  return canvasGroups(root).flatMap((group) => [...group.tabIds]);
}

export function findGroup(root: CanvasNode, groupId: string): CanvasGroup | null {
  return canvasGroups(root).find((group) => group.id === groupId) ?? null;
}

export function findGroupForTab(root: CanvasNode, tabId: string): CanvasGroup | null {
  return canvasGroups(root).find((group) => group.tabIds.includes(tabId)) ?? null;
}

/** Structural map over groups — the shared spine of every edit below. */
function mapGroups(root: CanvasNode, fn: (group: CanvasGroup) => CanvasGroup): CanvasNode {
  if (isGroup(root)) return fn(root);
  const first = mapGroups(root.children[0], fn);
  const second = mapGroups(root.children[1], fn);
  if (first === root.children[0] && second === root.children[1]) return root;
  return { ...root, children: [first, second] };
}

/** Replace one group wholesale — with a group, or with a whole subtree. */
function replaceGroup(
  root: CanvasNode,
  groupId: string,
  next: (group: CanvasGroup) => CanvasNode,
): CanvasNode {
  if (isGroup(root)) return root.id === groupId ? next(root) : root;
  const first = replaceGroup(root.children[0], groupId, next);
  const second = replaceGroup(root.children[1], groupId, next);
  if (first === root.children[0] && second === root.children[1]) return root;
  return { ...root, children: [first, second] };
}

/** Show a different tab in a group. A tab the group does not hold is ignored. */
export function setActiveTab(root: CanvasNode, groupId: string, tabId: string): CanvasNode {
  return mapGroups(root, (group) =>
    group.id === groupId && group.tabIds.includes(tabId) && group.activeTabId !== tabId
      ? { ...group, activeTabId: tabId }
      : group,
  );
}

/** Move a sash. Unknown split ids and unchanged ratios are no-ops. */
export function setSplitRatio(root: CanvasNode, splitId: string, ratio: number): CanvasNode {
  if (isGroup(root)) return root;
  const clamped = clampSplitRatio(ratio);
  if (root.id === splitId) {
    return root.ratio === clamped ? root : { ...root, ratio: clamped };
  }
  const first = setSplitRatio(root.children[0], splitId, ratio);
  const second = setSplitRatio(root.children[1], splitId, ratio);
  if (first === root.children[0] && second === root.children[1]) return root;
  return { ...root, children: [first, second] };
}

/** Reset every sash to centre — the "even out" hotkey. */
export function evenOutSplits(root: CanvasNode): CanvasNode {
  if (isGroup(root)) return root;
  return {
    ...root,
    ratio: 0.5,
    children: [evenOutSplits(root.children[0]), evenOutSplits(root.children[1])],
  };
}

/**
 * Split a pane, producing a new sibling group.
 *
 * `moveTabId` (default: the source group's active tab) moves into the new group
 * — but only when the source holds more than one tab. A single-tab group splits
 * into itself plus an EMPTY pane, because moving its only tab would relocate the
 * pane rather than split it, and an empty pane is the launcher surface anyway.
 */
export function splitGroup(
  root: CanvasNode,
  input: {
    groupId: string;
    orientation: CanvasOrientation;
    newGroupId: string;
    newSplitId: string;
    /** Which tab rides into the new pane. Defaults to the source's active tab. */
    moveTabId?: string;
    /** New pane goes before the source instead of after. */
    before?: boolean;
    ratio?: number;
  },
): CanvasNode {
  const source = findGroup(root, input.groupId);
  if (!source) return root;

  const candidate = input.moveTabId ?? source.activeTabId;
  const canMove =
    source.tabIds.length > 1 && candidate !== null && source.tabIds.includes(candidate);
  const movedTab = canMove ? candidate : null;

  return replaceGroup(root, input.groupId, (group) => {
    const remaining = movedTab
      ? group.tabIds.filter((id) => id !== movedTab)
      : [...group.tabIds];
    const kept = canvasGroup(
      group.id,
      remaining,
      movedTab && group.activeTabId === movedTab ? null : group.activeTabId,
    );
    const created = canvasGroup(input.newGroupId, movedTab ? [movedTab] : []);
    const [first, second] = input.before ? [created, kept] : [kept, created];
    return canvasSplit(input.newSplitId, input.orientation, first, second, input.ratio ?? 0.5);
  });
}

/**
 * Close a pane. Its parent split collapses into the surviving sibling — the
 * sibling keeps its own subtree, so closing a pane never re-arranges panes the
 * operator did not touch.
 *
 * Returns `null` when the closed group was the last one; the caller mints a
 * fresh empty root (the store does this, so a canvas is never node-less).
 *
 * The closed group's tabs are NOT closed — they are handed back so the caller
 * can re-home them. A pane is a window; closing a window does not destroy the
 * work that was open in it.
 */
export function closeGroup(
  root: CanvasNode,
  groupId: string,
): { root: CanvasNode | null; orphanedTabIds: readonly string[] } {
  const group = findGroup(root, groupId);
  if (!group) return { root, orphanedTabIds: [] };
  const orphanedTabIds = [...group.tabIds];

  if (isGroup(root)) {
    return root.id === groupId ? { root: null, orphanedTabIds } : { root, orphanedTabIds };
  }

  const prune = (node: CanvasNode): CanvasNode | null => {
    if (isGroup(node)) return node.id === groupId ? null : node;
    const first = prune(node.children[0]);
    const second = prune(node.children[1]);
    if (first === null) return second;
    if (second === null) return first;
    if (first === node.children[0] && second === node.children[1]) return node;
    return { ...node, children: [first, second] };
  };

  return { root: prune(root), orphanedTabIds };
}

/** The path of splits from the root down to a group, outermost first. */
function pathToGroup(
  root: CanvasNode,
  groupId: string,
): { split: CanvasSplit; childIndex: 0 | 1 }[] | null {
  if (isGroup(root)) return root.id === groupId ? [] : null;
  for (const childIndex of [0, 1] as const) {
    const below = pathToGroup(root.children[childIndex], groupId);
    if (below) return [{ split: root, childIndex }, ...below];
  }
  return null;
}

/** Edge-most group of a subtree along one axis — where a directional move lands. */
function edgeGroup(node: CanvasNode, orientation: CanvasOrientation, index: 0 | 1): CanvasGroup {
  if (isGroup(node)) return node;
  const childIndex = node.orientation === orientation ? index : 0;
  return edgeGroup(node.children[childIndex], orientation, index);
}

/**
 * The group in a given direction, or `null` at the edge of the canvas.
 *
 * Walks up to the first ancestor split on the direction's axis that the group is
 * not already on the far side of, then descends into the sibling and takes its
 * facing edge — the tmux / i3 / VS Code rule. Deliberately structural rather
 * than geometric: a geometric "nearest rect" needs measured pixels, which would
 * make directional focus untestable without a DOM and would change answer with
 * a sash drag that moved nothing the operator was looking at.
 */
export function neighbourGroupId(
  root: CanvasNode,
  fromGroupId: string,
  direction: CanvasDirection,
): string | null {
  const path = pathToGroup(root, fromGroupId);
  if (!path) return null;
  const axis: CanvasOrientation = direction === 'left' || direction === 'right' ? 'row' : 'column';
  const wantIndex: 0 | 1 = direction === 'right' || direction === 'down' ? 1 : 0;
  const facingIndex: 0 | 1 = wantIndex === 1 ? 0 : 1;

  for (let i = path.length - 1; i >= 0; i -= 1) {
    const { split, childIndex } = path[i];
    if (split.orientation !== axis) continue;
    if (childIndex === wantIndex) continue;
    return edgeGroup(split.children[wantIndex], axis, facingIndex).id;
  }
  return null;
}

/**
 * Move a tab into another group, appending it and making it that group's active
 * tab. The source group keeps its remaining tabs and falls back to the first of
 * them; an emptied source stays as a launcher pane (see the file docblock).
 */
export function moveTabToGroup(
  root: CanvasNode,
  input: { tabId: string; toGroupId: string },
): CanvasNode {
  const source = findGroupForTab(root, input.tabId);
  const target = findGroup(root, input.toGroupId);
  if (!source || !target || source.id === target.id) return root;

  return mapGroups(root, (group) => {
    if (group.id === source.id) {
      const remaining = group.tabIds.filter((id) => id !== input.tabId);
      return canvasGroup(
        group.id,
        remaining,
        group.activeTabId === input.tabId ? null : group.activeTabId,
      );
    }
    if (group.id === target.id) {
      return canvasGroup(group.id, [...group.tabIds, input.tabId], input.tabId);
    }
    return group;
  });
}

/**
 * Reconcile the layout against the workspace store's open tabs.
 *
 * The store is the SoT for what exists; the layout is the SoT for where it sits.
 * This is the one function that reads both, and it runs on every store commit:
 *
 * - a tab the store closed leaves every group it was in;
 * - a tab the store opened that no group holds is homed — into the group that
 *   already holds the focused tab, else the leading group;
 * - a group whose active tab vanished falls back to its first remaining tab;
 * - empty groups SURVIVE (they are launcher panes — see the file docblock);
 * - a `null` / empty root becomes one empty group, so the canvas always has a
 *   node to render.
 *
 * Deliberately total: it is safe to run against a layout restored from
 * `staff_preferences` after tabs have come and gone, which is the case a
 * restored workspace always hits.
 */
export function reconcileCanvasLayout(input: {
  root: CanvasNode | null;
  openTabIds: readonly string[];
  focusedTabId?: string | null;
  /** Id for the root group when the layout has to be created from nothing. */
  fallbackGroupId: string;
}): CanvasNode {
  const open = new Set(input.openTabIds);
  const base = input.root ?? canvasGroup(input.fallbackGroupId);

  const seen = new Set<string>();
  const pruned = mapGroups(base, (group) => {
    const tabIds = group.tabIds.filter((id) => {
      if (!open.has(id) || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
    if (tabIds.length === group.tabIds.length && tabIds.every((id, i) => id === group.tabIds[i])) {
      const active =
        group.activeTabId !== null && tabIds.includes(group.activeTabId)
          ? group.activeTabId
          : (tabIds[0] ?? null);
      return active === group.activeTabId ? group : { ...group, activeTabId: active };
    }
    return canvasGroup(group.id, tabIds, group.activeTabId);
  });

  const unplaced = input.openTabIds.filter((id) => !seen.has(id));
  if (unplaced.length === 0) return pruned;

  const groups = canvasGroups(pruned);
  const homeId =
    (input.focusedTabId ? findGroupForTab(pruned, input.focusedTabId)?.id : null) ??
    groups[0]?.id ??
    input.fallbackGroupId;

  return mapGroups(pruned, (group) =>
    group.id === homeId
      ? canvasGroup(
          group.id,
          [...group.tabIds, ...unplaced],
          input.focusedTabId && unplaced.includes(input.focusedTabId)
            ? input.focusedTabId
            : group.activeTabId,
        )
      : group,
  );
}

/* ── Serialization ───────────────────────────────────────────────────────── */

/**
 * Validate an untrusted layout bag (prefs GET, localStorage mirror).
 * `null` = unusable, and the caller starts from an empty canvas.
 *
 * Hand-rolled rather than zod: the tree is recursive, this module is a pure leaf
 * that stays runnable under `tsx --test` with no dependencies, and the checks
 * are cheap enough that a schema would be more machinery than validation. Depth
 * is bounded so a hostile or corrupt bag cannot blow the stack.
 */
const MAX_LAYOUT_DEPTH = 8;

export function parseCanvasLayout(raw: unknown, depth = 0): CanvasNode | null {
  if (depth > MAX_LAYOUT_DEPTH || typeof raw !== 'object' || raw === null) return null;
  const node = raw as Record<string, unknown>;
  if (typeof node.id !== 'string' || node.id.length === 0 || node.id.length > 160) return null;

  if (node.type === 'group') {
    const tabIds = Array.isArray(node.tabIds)
      ? node.tabIds.filter((id): id is string => typeof id === 'string' && id.length > 0)
      : [];
    const active = typeof node.activeTabId === 'string' ? node.activeTabId : null;
    return canvasGroup(node.id, tabIds, active);
  }

  if (node.type === 'split') {
    if (node.orientation !== 'row' && node.orientation !== 'column') return null;
    if (!Array.isArray(node.children) || node.children.length !== 2) return null;
    const first = parseCanvasLayout(node.children[0], depth + 1);
    const second = parseCanvasLayout(node.children[1], depth + 1);
    if (!first || !second) return null;
    const ratio = typeof node.ratio === 'number' ? node.ratio : 0.5;
    return canvasSplit(node.id, node.orientation, first, second, ratio);
  }

  return null;
}
