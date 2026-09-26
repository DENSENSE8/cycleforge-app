/** Station Displays Root Index — pure row model + helpers (no React). */

import type { SectionTab } from '@/design-system/components';

/** Sentinel URL / activeTab value — Displays open on the Root Index (no leaf). */
export const STATION_DISPLAY_INDEX = 'index' as const;

/** Badge tone — action needs operator attention; ok is verified; neutral is info. */
export type DisplayIndexTone = 'action' | 'ok' | 'neutral';

/** Fixed pipeline clusters for the Root Index (omit empty groups). */
export type DisplayIndexGroup = 'verification' | 'assets' | 'context';

const DISPLAY_INDEX_GROUP_ORDER: readonly DisplayIndexGroup[] = [
  'verification',
  'assets',
  'context',
] as const;

const DISPLAY_INDEX_GROUP_LABEL: Record<DisplayIndexGroup, string> = {
  verification: 'Verification',
  assets: 'Assets',
  context: 'Context',
};

export interface DisplayIndexRow {
  /** Leaf id — station-local vocabulary (not UnboxSideTab-bound). */
  id: string;
  label: string;
  subtitle: string;
  tone: DisplayIndexTone;
  group: DisplayIndexGroup;
}

/** Group-level eyebrow trailer derived from row tones (never invents qty). */
interface DisplayIndexGroupSummary {
  actionCount: number;
  /** Empty = omit trailing status (all-neutral with no action). */
  label: string;
  tone: DisplayIndexTone;
}

/**
 * Default group for a leaf id when a station omits enriched `indexRows`.
 * Unknown ids fall back to Context so derive stays honest.
 */
export function defaultDisplayIndexGroup(id: string): DisplayIndexGroup {
  switch (id) {
    case 'listings':
    case 'listing':
    case 'classify':
    case 'linkage':
    case 'pairing':
      return 'verification';
    case 'inventory':
    case 'units':
    case 'prebox':
    case 'photos':
    case 'condition':
    case 'checklist':
    case 'manuals':
      return 'assets';
    default:
      // ticket · tracking · timeline · support · look · unknown → context
      return 'context';
  }
}

/** Shared Displays leaf — live scan-station skin try-on. Injected by PushStack. */
export const STATION_LOOK_DISPLAY_ID = 'look';

/**
 * Leaves the push column owns itself. Station hosts must not canonicalize
 * these ids — Unbox used to treat unknown leaves as gated-off and fall back
 * to the first visible strip tab (Linkage).
 */
export function isDisplaysHostedLeaf(id: string): boolean {
  return id === STATION_LOOK_DISPLAY_ID;
}

/** Resolve the tab the Displays column should paint. */
export function resolveDisplaysActiveTab(
  requested: string | null,
  knownLeafIds: readonly string[],
): string | null {
  if (requested == null) return null;
  if (requested === STATION_DISPLAY_INDEX) return STATION_DISPLAY_INDEX;
  if (isDisplaysHostedLeaf(requested)) return requested;
  if (knownLeafIds.includes(requested)) return requested;
  return STATION_DISPLAY_INDEX;
}

/** Declared stable nav-key per Displays leaf id — the co-located key map the leader-armed selection keyboard reveals on the Right region… */
export const DISPLAY_LEAF_NAV_KEY: Record<string, string> = {
  ticket: 't',
  photos: 'p',
  linkage: 'k',
  pairing: 'g',
  classify: 'c',
  inventory: 'i',
  units: 'u',
  prebox: 'b',
  listings: 'l',
  condition: 'd',
  support: 's',
  tracking: 'r',
  timeline: 'm',
  // Visible Testing / station checklist · manuals (Unbox checklist is stripHidden)
  checklist: 'h',
  manuals: 'a',
  // Desk order inspector (Context plane — same letter map when Right owns keys)
  order: 'o',
  documents: 'e',
  conversation: 'v',
  // Scan-station skin try-on (injected on every PushStack host)
  look: 'w',
};

/** Build neutral Root Index rows from visible section tabs. */
export function deriveDisplayIndexRowsFromTabs(tabs: readonly SectionTab[]): DisplayIndexRow[] {
  return tabs
    .filter((t) => !t.stripHidden)
    .map((t) => {
      const count = typeof t.count === 'number' ? t.count : null;
      const subtitle =
        count != null && count > 0
          ? count === 1
            ? '1 item'
            : `${count} items`
          : '';
      return {
        id: t.id,
        label: t.label,
        subtitle,
        tone: 'neutral' as const,
        group: defaultDisplayIndexGroup(t.id),
      };
    });
}

/** Ensure the Root Index carries a Look row whose subtitle is the live Color · Depth label (e.g. */
export function withLookDisplayIndexRow(
  rows: readonly DisplayIndexRow[],
  currentLabel: string,
): DisplayIndexRow[] {
  const lookRow: DisplayIndexRow = {
    id: STATION_LOOK_DISPLAY_ID,
    label: 'Look',
    subtitle: currentLabel,
    tone: 'neutral',
    group: 'context',
  };
  const idx = rows.findIndex((r) => r.id === STATION_LOOK_DISPLAY_ID);
  if (idx === -1) return [...rows, lookRow];
  const existing = rows[idx]!;
  const next = [...rows];
  next[idx] = { ...lookRow, group: existing.group };
  return next;
}

/**
 * Filter Root Index rows by a footer search query (label · subtitle · id · group).
 * Empty / whitespace query returns `rows` unchanged.
 */
export function filterDisplayIndexRows(
  rows: readonly DisplayIndexRow[],
  query: string,
): DisplayIndexRow[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...rows];
  return rows.filter(
    (row) =>
      row.label.toLowerCase().includes(q) ||
      row.subtitle.toLowerCase().includes(q) ||
      row.id.toLowerCase().includes(q) ||
      DISPLAY_INDEX_GROUP_LABEL[row.group].toLowerCase().includes(q),
  );
}

/** Aggregate status for an eyebrow trailer — **action rows only**. */
export function summarizeDisplayIndexGroup(
  rows: readonly DisplayIndexRow[],
): DisplayIndexGroupSummary {
  if (rows.length === 0) {
    return { actionCount: 0, label: '', tone: 'neutral' };
  }
  let actionCount = 0;
  for (const row of rows) {
    if (row.tone === 'action') actionCount += 1;
  }
  if (actionCount > 0) {
    return {
      actionCount,
      label: actionCount === 1 ? '1 pending' : `${actionCount} pending`,
      tone: 'action',
    };
  }
  return { actionCount: 0, label: '', tone: 'neutral' };
}

/** Group rows in fixed Verification → Assets → Context order; omit empty groups. */
export function groupDisplayIndexRows(
  rows: readonly DisplayIndexRow[],
): { group: DisplayIndexGroup; label: string; rows: DisplayIndexRow[] }[] {
  const byGroup = new Map<DisplayIndexGroup, DisplayIndexRow[]>();
  for (const g of DISPLAY_INDEX_GROUP_ORDER) byGroup.set(g, []);
  for (const row of rows) {
    const list = byGroup.get(row.group);
    if (list) list.push(row);
    else byGroup.get('context')!.push(row);
  }
  const out: { group: DisplayIndexGroup; label: string; rows: DisplayIndexRow[] }[] = [];
  for (const g of DISPLAY_INDEX_GROUP_ORDER) {
    const list = byGroup.get(g) ?? [];
    if (list.length === 0) continue;
    out.push({ group: g, label: DISPLAY_INDEX_GROUP_LABEL[g], rows: list });
  }
  return out;
}
