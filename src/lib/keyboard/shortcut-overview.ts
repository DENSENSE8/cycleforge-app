/**
 * Staff shortcut overview — Dialog opened by `?` when no selection CTA strip
 * is teaching inline. Selection CTAs use {@link toggleSelectionInlineHotkeys}
 * for on-button letter overlays instead.
 */

export type ShortcutOverviewRow = {
  keys: string[];
  label: string;
};

export type ShortcutOverviewGroup = {
  id: string;
  title: string;
  rows: readonly ShortcutOverviewRow[];
};

type Listener = () => void;

let overviewOpen = false;
const overviewListeners = new Set<Listener>();

const extraGroups = new Map<string, ShortcutOverviewGroup>();
const groupListeners = new Set<Listener>();
let groupsCache: ShortcutOverviewGroup[] = [];

function emitOverview() {
  for (const l of overviewListeners) l();
}

function emitGroups() {
  groupsCache = [...extraGroups.values()].sort((a, b) => a.id.localeCompare(b.id));
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
  return false;
}

export function setShortcutOverviewOpen(next: boolean): void {
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
  return [];
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
