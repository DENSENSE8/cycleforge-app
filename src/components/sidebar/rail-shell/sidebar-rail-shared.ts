import type { ReactNode } from 'react';
import type { PaintSurface } from '@/lib/observability/paint-timing';
import type { NavRegionId } from '@/lib/keyboard/nav-keys';

import { formatLaneAgeCompact } from '@/utils/date';
import type { RefreshDomain } from '@/lib/refresh/domains';
import type { RailPeekFact } from './RailPeekCard';
import type { RailRowActionsResolver } from './rail-row-actions';

export function railRelativeTime(iso: string | null | undefined): string {
  return formatLaneAgeCompact(iso) ?? '—';
}

/** DESC sort key for a feed's `getActivityAt` axis; missing/invalid → 0 (last). */
export function railActivitySortMs(iso: string | null | undefined): number {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : 0;
}

/** Merge a `receiving-line-updated` (or feed `updateEvent`) patch into a rail row. */
export function mergeRailUpdatePatch<TRow>(
  existing: TRow,
  updated: Partial<TRow>,
  getActivityAt?: (row: TRow) => string | null | undefined,
): TRow {
  const merged = { ...(existing as object), ...(updated as object) } as TRow;
  if (!getActivityAt) return merged;
  const prevAt = getActivityAt(existing);
  if (prevAt == null || prevAt === '') return merged;
  const nextAt = getActivityAt(merged);
  if (nextAt != null && nextAt !== '') return merged;

  const restored = { ...(merged as object) } as TRow;
  for (const key of Object.keys(updated as object) as Array<keyof TRow>) {
    if (updated[key] == null && existing[key] != null) {
      restored[key] = existing[key];
    }
  }
  return restored;
}

/**
 * Client-side activity sort for rails that do not preserve server order.
 * When `preserveServerOrder` is true, returns `rows` unchanged (Unboxed).
 */
export function orderRailRowsByActivity<TRow>(
  rows: TRow[],
  opts: {
    preserveServerOrder?: boolean;
    getActivityAt?: (row: TRow) => string | null | undefined;
    getId: (row: TRow) => number;
  },
): TRow[] {
  if (opts.preserveServerOrder || !opts.getActivityAt) return rows;
  const getActivityAt = opts.getActivityAt;
  return [...rows].sort((a, b) => {
    const d = railActivitySortMs(getActivityAt(b)) - railActivitySortMs(getActivityAt(a));
    return d !== 0 ? d : opts.getId(b) - opts.getId(a);
  });
}

export interface SidebarRailRowContext {
  isSelected: boolean;
  isFocused: boolean;
  /** PKG-group chip node (when this row leads a collapsed multi-item group), else null. */
  pkgChip: ReactNode;
}

export interface SidebarRailShellProps<TRow> {
  /** React-query key. */
  queryKey: ReadonlyArray<unknown>;
  /** Fetcher returning the rows directly. */
  fetchFn: () => Promise<TRow[]>;
  /** Optimistic update event ({ id, ...partial }); merged into the matching row. */
  updateEvent?: string;
  /** Optimistic delete event ({ id }); the matching row is dropped immediately. */
  deleteEvent?: string;
  /**
   * Optimistic group-delete event (detail = group id, e.g. a receiving_id).
   * Every row whose `getGroupId` matches is dropped immediately — used when a
   * whole carton/log is removed and all its lines should vanish from the rail.
   */
  deleteGroupEvent?: string;
  /** Undo channel for {@link deleteEvent} ({ id }). */
  restoreEvent?: string;
  /** Undo channel for {@link deleteGroupEvent} (detail = group id). */
  restoreGroupEvent?: string;
  /**
   * Domain-specific events that trigger a full query invalidation — the rail's
   * OWN vocabulary (`fba-print-shipped`, `packer-log-updated`, …), not a
   * cross-app broadcast.
   */
  refreshEvents?: string[];
  /**
   * Refresh domains this rail renders. Same debounced invalidation as
   * {@link refreshEvents}, but the rail only wakes for writes that actually
   * touched its data. SoT: `@/lib/refresh/domains`.
   */
  refreshDomains?: readonly RefreshDomain[];
  /** Client-side subtractive DISPLAY filter — row ids hidden for THIS viewer (e.g. */
  excludedIds?: ReadonlySet<number>;
  /**
   * Client-side keep filter — rows that return false are hidden as a pure
   * DISPLAY filter (same contract as {@link excludedIds}: not in the queryKey,
   * so toggling facets re-filters in place). Unset = keep every row.
   */
  includeRow?: (row: TRow) => boolean;
  /** Opt-in cold-reload continuity. */
  loadSnapshot?: () => Promise<TRow[] | null>;
  /**
   * Persist the rows the rail just rendered as the next reload's seed. Called
   * with the settled authoritative rows; the provider debounces + fires the
   * write. Pair with {@link loadSnapshot}; unset = no persistence.
   */
  persistSnapshot?: (rows: TRow[]) => void;
  /** When set, a CustomEvent<'prev' | 'next'> on this name steps the selection to the adjacent rendered row and fires `onSelect` — the wiring… */
  navigateEvent?: string;

  selectedId: number | null;
  selectedRow?: TRow | null;
  /** Optimistic row pinned at the very top until its real row lands in the feed — e.g. */
  leadingRow?: TRow | null;
  limit?: number;
  /** When true (default), a selected row that falls outside the top-N window is hoisted to `rows[0]` (pinned lead) so the active line stays… */
  pinSelectedLead?: boolean;
  /**
   * When true, keep the fetcher/SQL order — do not re-sort by `getActivityAt`.
   * Unboxed uses this so the server first-open axis is the only sort; client
   * re-sort was fighting the SQL order and causing Unfound flicker.
   */
  preserveServerOrder?: boolean;

  /**
   * The rail's name. **Not painted** — the `TITLE · N` eyebrow band was removed
   * 2026-08-22. It is the listbox's accessible name and the key the first-load
   * reveal registry dedupes on, so it must stay unique per rail.
   */
  eyebrowTitle: string;
  emptyText?: string;
  /**
   * When true, selects the first row once data loads if nothing is selected yet.
   * Re-selects when selection is cleared (e.g. switching back to Receive mode).
   */
  autoSelectFirstWhenEmpty?: boolean;
  /** Optional guard — return false to skip auto-select (deep links, wrong mode). */
  canAutoSelectFirst?: () => boolean;
  /**
   * When true, rows cascade in (stagger reveal) the first time the feed loads,
   * and freshly-arriving rows slide in individually. Off by default so callers
   * opt in explicitly.
   */
  staggerReveal?: boolean;
  /** Stagger entrance axis. */
  staggerRevealMotion?: 'slide' | 'rise' | 'sidebar';
  /** Horizontal inset for the list host. */
  railInset?: 'scanDock' | 'gutter';

  /** Dev/observability: stamp a paint mark once the rail leaves skeleton state. */
  contentPaintSurface?: PaintSurface;

  /**
   * Same top-N visible rows the rail renders (after filters / order / pin).
   * Optional observer — collapsed-strip MRU publish lives in the shell itself.
   */
  onVisibleRowsChange?: (rows: TRow[]) => void;

  /**
   * Publish top-N (`CONTEXT_PANEL_COLLAPSE.mruPinCount`) rows as mid-strip
   * status-dot pins while the context rail is parked. {@link SidebarRecentRailBase}
   * defaults this on so every recent-activity rail inherits the peek.
   */
  publishCollapseMru?: boolean;
  /** Title-quality tooltip for a collapse pin (falls back to status label / id). */
  getCollapsePinLabel?: (row: TRow) => string;
  /**
   * Secondary identity line for the collapse-pin peek (tracking · PO · SKU)
   * when the row has no typed {@link getCollapsePinFacts} chips. Optional.
   */
  getCollapsePinMeta?: (row: TRow) => string | null | undefined;
  /** Copyable identity chips for the parked-pin peek card. */
  getCollapsePinFacts?: (row: TRow) => RailPeekFact[] | null | undefined;

  getId: (row: TRow) => number;
  /** Durable RENDER identity, preferred over {@link getId} for the React `key` AND the {@link leadingRow} dedup. */
  getReconcileId?: (row: TRow) => string | number;
  /** Grouping key (e.g. receiving_id). Return null for no grouping. */
  getGroupId?: (row: TRow) => number | null;
  getActivityAt?: (row: TRow) => string | null | undefined;
  /** When true, row clicks + hover preview are suppressed (e.g. triage importing stub). */
  getRowDisabled?: (row: TRow) => boolean;
  onSelect: (row: TRow) => void;
  getStatusDot: (row: TRow) => string;
  /** Hover tooltip for the status dot — e.g. "Received" / "Scanned". */
  getStatusDotLabel?: (row: TRow) => string;

  renderRowMain: (row: TRow, ctx: SidebarRailRowContext) => ReactNode;
  renderPopover?: (
    row: TRow,
    ctx: { groupSize: number; openWorkspace: () => void; dismiss: () => void },
  ) => ReactNode;
  /** Per-row overflow (⋮) menu. */
  rowActions?: RailRowActionsResolver<TRow>;
  /** Opt this rail into the leader-armed selection keyboard as a nav-keys region (typically `'left'`). */
  navRegionId?: NavRegionId;
}
