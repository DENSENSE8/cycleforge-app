/**
 * Navigation as data (Studio-driven operator-surfaces refactor, Phase 4).
 *
 * The static `APP_SIDEBAR_NAV` is the CODE default (what surfaces the app can
 * render). A per-org `nav_definitions` row is the DATA override — it can hide,
 * rename, reorder, or re-glyph existing items so a warehouse's spine and desk
 * tabs match its language, without a deploy.
 *
 * **L1 map order is suggestion-only (2026-08-30) for live MasterNav placement**
 * once staff `prefs.spineSlots` exist. **Desk page tabs** (To ship · Shortage ·
 * …) reorder **on the tab row itself** — drag the tabs in `DeskPageChrome`.
 * That is not Studio and not a MasterNav arrange mode. This file only merges
 * persisted child `order` onto existing ids; it cannot mint tabs.
 *
 * The override is ADDITIVE and safe — a null/absent override yields the static
 * defaults unchanged, and an override can never introduce a nav item or child
 * the code doesn't already define (it only references existing ids).
 */

import { isNavIconKey, resolveNavIcon } from '@/lib/nav/nav-icon-catalog';
import type {
  SidebarChildPage,
  SidebarNavItem,
  SidebarPageNav,
} from '@/lib/sidebar-navigation';

/** One per-org override for a declared child (desk tab / drill row). */
export interface NavChildOverride {
  /** Matches a `SidebarChildPage.id` on the parent entry. */
  id: string;
  hidden?: boolean;
  label?: string;
  /** Lower first. Unset children keep code-relative order after explicit ones. */
  order?: number;
  /** Key in {@link NAV_ICON_CATALOG}. Unknown keys are dropped on parse. */
  icon?: string;
}

/** One per-org override for a nav item, keyed by the item's stable id. */
export interface NavOverrideEntry {
  /** Matches a `SidebarNavItem.id` (e.g. 'receiving', 'outbound'). */
  id: string;
  /** Hide this item from the org's nav. */
  hidden?: boolean;
  /** Rename it (the operator's word for the surface). */
  label?: string;
  /**
   * Suggestion sort for L1 merge helpers. Lower first.
   * Unset items keep default relative order. Does **not** own the live spine
   * (staff `spineSlots` do).
   */
  order?: number;
  /** Key in {@link NAV_ICON_CATALOG}. */
  icon?: string;
  /** Overrides for this page's declared children (desk tabs). */
  children?: NavChildOverride[];
}

export interface NavDefinition {
  entries: NavOverrideEntry[];
}

function sortWithExplicitOrder<T>(
  rows: Array<{ item: T; order: number | undefined; index: number }>,
): T[] {
  rows.sort((a, b) => {
    const aHas = a.order !== undefined;
    const bHas = b.order !== undefined;
    if (aHas && bHas) return a.order! - b.order! || a.index - b.index;
    if (aHas) return -1;
    if (bHas) return 1;
    return a.index - b.index;
  });
  return rows.map((v) => v.item);
}

/**
 * Apply an org's nav override onto the static L1 defaults: filter hidden items,
 * rename labelled ones, swap catalog icons, and apply suggestion `order`.
 */
export function mergeOrgNav(
  defaults: readonly SidebarNavItem[],
  override: NavDefinition | null | undefined,
): SidebarNavItem[] {
  if (!override || override.entries.length === 0) return [...defaults];
  const byId = new Map(override.entries.map((e) => [e.id, e]));

  const visible = defaults
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => !byId.get(item.id)?.hidden)
    .map(({ item, index }) => {
      const o = byId.get(item.id);
      let merged = item;
      if (o?.label) merged = { ...merged, label: o.label };
      const icon = resolveNavIcon(o?.icon);
      if (icon) merged = { ...merged, icon };
      return { item: merged, order: o?.order, index };
    });

  return sortWithExplicitOrder(visible);
}

export function mergeOrgPageChildren(
  children: readonly SidebarChildPage[] | undefined,
  override: NavOverrideEntry | undefined,
): SidebarChildPage[] | undefined {
  if (!children) return undefined;
  if (!override?.children?.length) return [...children];
  const byId = new Map(override.children.map((e) => [e.id, e]));

  const visible = children
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => !byId.get(item.id)?.hidden)
    .map(({ item, index }) => {
      const o = byId.get(item.id);
      if (!o) return { item, order: undefined, index };
      let merged = item;
      if (o.label) merged = { ...merged, label: o.label };
      const icon = resolveNavIcon(o.icon);
      if (icon) merged = { ...merged, icon };
      return { item: merged, order: o.order, index };
    });

  return sortWithExplicitOrder(visible);
}

/** Stamp org hide / rename / icon / child order onto a page record. */
export function applyOrgNavToPage(
  page: SidebarPageNav,
  override: NavDefinition | null | undefined,
): SidebarPageNav {
  if (!override || override.entries.length === 0) return page;
  const entry = override.entries.find((e) => e.id === page.id);
  if (!entry) return page;
  let next = page;
  if (entry.label) next = { ...next, label: entry.label };
  const icon = resolveNavIcon(entry.icon);
  if (icon) next = { ...next, icon };
  const children = mergeOrgPageChildren(page.children, entry);
  if (children) next = { ...next, children };
  return next;
}

/**
 * True when `orderedIds` is a de-duplicated list of known child ids (subset
 * allowed — a permission-filtered tab row cannot name tabs the staffer cannot
 * see). Empty / dupes / unknown ids fail.
 */
export function isKnownChildOrder(
  knownIds: readonly string[],
  orderedIds: readonly string[],
): boolean {
  if (orderedIds.length < 2) return false;
  if (orderedIds.length !== new Set(orderedIds).size) return false;
  const known = new Set(knownIds);
  return orderedIds.every((id) => known.has(id));
}

export function upsertChildOrder(
  current: NavDefinition | null | undefined,
  pageId: string,
  orderedIds: readonly string[],
): NavDefinition {
  const entries = [...(current?.entries ?? [])];
  const idx = entries.findIndex((e) => e.id === pageId);
  const prev = idx >= 0 ? entries[idx]! : { id: pageId };
  const prevChildren = new Map((prev.children ?? []).map((c) => [c.id, c]));
  const seen = new Set(orderedIds);
  const children: NavChildOverride[] = orderedIds.map((id, order) => ({
    ...(prevChildren.get(id) ?? { id }),
    id,
    order,
  }));
  for (const [id, leftover] of prevChildren) {
    if (seen.has(id)) continue;
    children.push({ ...leftover, id });
  }
  const nextEntry: NavOverrideEntry = { ...prev, id: pageId, children };
  if (idx >= 0) entries[idx] = nextEntry;
  else entries.push(nextEntry);
  return { entries };
}

export function upsertChildIcon(
  current: NavDefinition | null | undefined,
  pageId: string,
  childId: string,
  icon: string,
): NavDefinition {
  if (!isNavIconKey(icon)) return current ?? { entries: [] };
  const entries = [...(current?.entries ?? [])];
  const idx = entries.findIndex((e) => e.id === pageId);
  const prev = idx >= 0 ? entries[idx]! : { id: pageId };
  const children = [...(prev.children ?? [])];
  const childIdx = children.findIndex((c) => c.id === childId);
  if (childIdx >= 0) {
    children[childIdx] = { ...children[childIdx]!, icon };
  } else {
    children.push({ id: childId, icon });
  }
  const nextEntry: NavOverrideEntry = { ...prev, id: pageId, children };
  if (idx >= 0) entries[idx] = nextEntry;
  else entries.push(nextEntry);
  return { entries };
}

function parseChildOverride(raw: unknown): NavChildOverride | null {
  if (!raw || typeof raw !== 'object') return null;
  const id = (raw as { id?: unknown }).id;
  if (typeof id !== 'string' || !id) return null;
  const entry: NavChildOverride = { id };
  const hidden = (raw as { hidden?: unknown }).hidden;
  if (typeof hidden === 'boolean') entry.hidden = hidden;
  const label = (raw as { label?: unknown }).label;
  if (typeof label === 'string' && label) entry.label = label;
  const order = (raw as { order?: unknown }).order;
  if (typeof order === 'number' && Number.isFinite(order)) entry.order = order;
  const icon = (raw as { icon?: unknown }).icon;
  if (isNavIconKey(icon)) entry.icon = icon;
  return entry;
}

/** Narrow an unknown jsonb payload into a NavDefinition (defensive, for the loader). */
export function parseNavDefinition(raw: unknown): NavDefinition | null {
  if (!raw || typeof raw !== 'object') return null;
  const entriesRaw = (raw as { entries?: unknown }).entries;
  if (!Array.isArray(entriesRaw)) return null;
  const entries: NavOverrideEntry[] = [];
  for (const e of entriesRaw) {
    if (!e || typeof e !== 'object') continue;
    const id = (e as { id?: unknown }).id;
    if (typeof id !== 'string' || !id) continue;
    const entry: NavOverrideEntry = { id };
    const hidden = (e as { hidden?: unknown }).hidden;
    if (typeof hidden === 'boolean') entry.hidden = hidden;
    const label = (e as { label?: unknown }).label;
    if (typeof label === 'string' && label) entry.label = label;
    const order = (e as { order?: unknown }).order;
    if (typeof order === 'number' && Number.isFinite(order)) entry.order = order;
    const icon = (e as { icon?: unknown }).icon;
    if (isNavIconKey(icon)) entry.icon = icon;
    const childrenRaw = (e as { children?: unknown }).children;
    if (Array.isArray(childrenRaw)) {
      const children: NavChildOverride[] = [];
      for (const c of childrenRaw) {
        const parsed = parseChildOverride(c);
        if (parsed) children.push(parsed);
      }
      if (children.length > 0) entry.children = children;
    }
    entries.push(entry);
  }
  return { entries };
}
