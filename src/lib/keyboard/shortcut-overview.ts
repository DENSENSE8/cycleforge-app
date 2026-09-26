/**
 * Staff shortcut overview — Dialog opened by `?` when no selection CTA strip
 * is teaching inline. Selection CTAs use {@link toggleSelectionInlineHotkeys}
 * for on-button letter overlays instead.
 */

type ShortcutOverviewRow = {
  keys: string[];
  label: string;
};

type ShortcutOverviewGroup = {
  id: string;
  title: string;
  rows: readonly ShortcutOverviewRow[];
};

type Listener = () => void;

let overviewOpen = false;
const overviewListeners = new Set<Listener>();

const extraGroups = new Map<string, ShortcutOverviewGroup>();
const groupListeners = new Set<Listener>();

/** Stable SSR snapshots — fresh `[]` each call trips React getServerSnapshot. */
const SERVER_OVERVIEW_OPEN = false;
const SERVER_OVERVIEW_GROUPS: ShortcutOverviewGroup[] = [];

/** Client cache — idle identity must match the server snapshot. */
let groupsCache: ShortcutOverviewGroup[] = SERVER_OVERVIEW_GROUPS;

function emitOverview() {
  for (const l of overviewListeners) l();
}

function emitGroups() {
  const next = [...extraGroups.values()].sort((a, b) => a.id.localeCompare(b.id));
  groupsCache = next.length === 0 ? SERVER_OVERVIEW_GROUPS : next;
  for (const l of groupListeners) l();
}

export function subscribeShortcutOverview(listener: Listener): () => void {
  overviewListeners.add(listener);
  return () => {
    overviewListeners.delete(listener);
  };
}

export function getShortcutOverviewOpen(): boolean {
  return overviewOpen;
}

export function getServerShortcutOverviewOpen(): boolean {
  return SERVER_OVERVIEW_OPEN;
}

function setShortcutOverviewOpen(next: boolean): void {
  if (overviewOpen === next) return;
  overviewOpen = next;
  emitOverview();
}

export function toggleShortcutOverview(): void {
  setShortcutOverviewOpen(!overviewOpen);
}

export function openShortcutOverview(): void {
  setShortcutOverviewOpen(true);
}

export function closeShortcutOverview(): void {
  setShortcutOverviewOpen(false);
}

export function subscribeShortcutOverviewGroups(listener: Listener): () => void {
  groupListeners.add(listener);
  return () => {
    groupListeners.delete(listener);
  };
}

export function listShortcutOverviewGroups(): ShortcutOverviewGroup[] {
  return groupsCache;
}

export function getServerShortcutOverviewGroups(): ShortcutOverviewGroup[] {
  return SERVER_OVERVIEW_GROUPS;
}

/**
 * Live surface shortcuts (selection CTAs, a mounted inspector floor, …).
 * Returns an unregister function — call on unmount.
 */
export function registerShortcutOverviewGroup(group: ShortcutOverviewGroup): () => void {
  extraGroups.set(group.id, group);
  emitGroups();
  return () => {
    extraGroups.delete(group.id);
    emitGroups();
  };
}
