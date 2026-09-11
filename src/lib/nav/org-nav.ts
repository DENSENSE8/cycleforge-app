/**
 * Navigation as data (Studio-driven operator-surfaces refactor, Phase 4).
 *
 * The static `APP_SIDEBAR_NAV` is the CODE default (what surfaces the app can
 * render). A per-org `nav_definitions` row is the DATA override — it can hide
 * or rename nav items so a business's sidebar reflects its own operation,
 * without a deploy. This mirrors the station/surface split: code registers
 * capabilities, data drives what each org sees.
 *
 * **Order is suggestion-only (2026-08-30).** Live MasterNav placement is
 * per-staff `prefs.spineSlots` (`src/lib/nav/spine-slots.ts`). Org `order`
 * still sorts the catalog / Add-from-catalog suggestions via
 * {@link mergeOrgNav}; it does not drive the rendered spine once staff slots
 * exist.
 *
 * `mergeOrgNav` is pure + DB-free (unit-tested); the loader + API + hook layer
 * it. The override is ADDITIVE and safe — a null/absent override yields the
 * static defaults unchanged, and an override can never introduce a nav item the
 * code doesn't already define (it only references existing ids).
 */

import type {
  SidebarChildPage,
  SidebarNavItem,
  SidebarPageNav,
} from '@/lib/sidebar-navigation';

/** One per-org override for a declared child (desk tab / drill row). */
export interface NavChildOverride {
  id: string;
  hidden?: boolean;
  label?: string;
  /** Lower first. Unset children keep code-relative order after explicit ones. */
  order?: number;
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
   * Suggestion sort for the Add catalog / merge helpers. Lower first.
   * Unset items keep default relative order. Does **not** own the live spine
   * (staff `spineSlots` do).
   */
  order?: number;
  /** Overrides for this page's declared children (desk tabs). */
  children?: NavChildOverride[];
}

export interface NavDefinition {
  entries: NavOverrideEntry[];
}

/**
 * Apply an org's nav override onto the static defaults: filter hidden items,
 * rename labelled ones, and apply suggestion `order`. Ordering semantics for
 * the Add catalog / merge helpers: items given an explicit `order` lead,
 * sorted by that order; every item WITHOUT an explicit order follows, in its
 * default relative position. Live MasterNav placement is per-staff
 * `spineSlots` — this `order` field does not render the spine.
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
      const merged = o?.label ? { ...item, label: o.label } : item;
      return { item: merged, order: o?.order, index };
    });

  visible.sort((a, b) => {
    const aHas = a.order !== undefined;
    const bHas = b.order !== undefined;
    if (aHas && bHas) return a.order! - b.order! || a.index - b.index;
    if (aHas) return -1; // explicit-order items lead
    if (bHas) return 1;
    return a.index - b.index; // unset items keep their default relative order
  });
  return visible.map((v) => v.item);
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
      return { item: merged, order: o.order, index };
    });

  return sortWithExplicitOrder(visible);
}

/** Stamp org hide / rename / child order onto a page record. */
export function applyOrgNavToPage(
  page: SidebarPageNav,
  override: NavDefinition | null | undefined,
): SidebarPageNav {
  if (!override || override.entries.length === 0) return page;
  const entry = override.entries.find((e) => e.id === page.id);
  if (!entry) return page;
  let next = page;
  if (entry.label) next = { ...next, label: entry.label };
  const children = mergeOrgPageChildren(page.children, entry);
  if (children) next = { ...next, children };
  return next;
}

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
