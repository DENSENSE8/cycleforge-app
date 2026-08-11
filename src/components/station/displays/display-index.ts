/**
 * Station Displays Root Index — pure row model + helpers (no React).
 *
 * Shared waist for Unbox · Arrival · Testing · Pack · Shipping · Review.
 * Domain builders (e.g. `buildUnboxDisplayIndexRows`) return {@link DisplayIndexRow};
 * the list paints icons from matching {@link SectionTab} entries.
 */

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
      // ticket · tracking · timeline · support · unknown → context
      return 'context';
  }
}

/**
 * Declared stable nav-key per Displays leaf id — the co-located key map the
 * leader-armed selection keyboard reveals on the Right region (nav-keys P0;
 * spec: `docs/todo/nav-keys-selection-keyboard-HANDOFF.md`). Identity-stable:
 * a leaf's letter holds across sessions so muscle memory forms ('p' = Photos,
 * 't' = Ticket). `resolveNavKeymap` honors these when free and falls back
 * deterministically for any unlisted leaf, so a station showing a subset never
 * loses a hint. A P4 uniqueness guard asserts these letters never collide
 * across the full leaf vocabulary — keep them distinct.
 */
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
};

/**
 * Build neutral Root Index rows from visible section tabs.
 * `stripHidden` never appear (Unbox checklist is ring-only via stripHidden).
 * A visible `checklist` leaf (Testing SKU checklist) stays on the index.
 * When `count` is set, subtitle paints the count so thin stations are not blank.
 */
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

/**
 * Aggregate status for an eyebrow trailer — **action rows only**.
 *
 * `N pending` when a group holds work, otherwise nothing. The earlier ladder
 * also emitted `Clear` and `Incomplete`, and `Incomplete` was a lie: Context
 * holds Support · Tracking · Timeline, which are reference rows that can never
 * BE complete, so a group of them read "INCOMPLETE" beside three rows that were
 * all fine. Chrome must not invent a second story about state (Kinetic Ledger
 * law 1) — and a trailer that fires on every group is noise the eyebrow pays
 * for on every render while saying nothing.
 */
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
