import type { ReactNode } from 'react';
import type { PaintSurface } from '@/lib/observability/paint-timing';

import { formatLaneAgeCompact } from '@/utils/date';

export function railRelativeTime(iso: string | null | undefined): string {
  return formatLaneAgeCompact(iso) ?? '—';
}

/** DESC sort key for a feed's `getActivityAt` axis; missing/invalid → 0 (last). */
export function railActivitySortMs(iso: string | null | undefined): number {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : 0;
}

/**
 * Merge a `receiving-line-updated` (or feed `updateEvent`) patch into a rail row.
 *
 * Rails own their age/sort axis via `getActivityAt`. Workspace by-id refreshes
 * (esp. Testing-style full-row dumps reused for Unbox serial hydration) often
 * omit or null that stamp — spreading them verbatim blanks the age label and
 * can reshuffle. When a patch would clear the feed's axis, restore any
 * nullified keys from the existing row (same invariant as RQ `mergeRailRows`
 * freezing `unbox_opened_at`). Non-axis fields (serials, title, …) still apply.
 */
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
  /** Events that trigger a full query invalidation. */
  refreshEvents?: string[];
  /**
   * Client-side subtractive DISPLAY filter — row ids hidden for THIS viewer
   * (e.g. the staffer's rail-dismiss set). Applied AFTER fetch, so it is
   * deliberately NOT part of the queryKey: loading it or changing it re-filters
   * the already-fetched rows in place, instead of changing the queryKey and
   * blanking the whole list to a skeleton on every load / dismiss. Empty (the
   * default) = no filtering.
   */
  excludedIds?: ReadonlySet<number>;
  /**
   * Opt-in cold-reload continuity. Returns the viewer's last-known rows for this
   * rail (or null) — on mount the rail seeds from it so a reload paints quickly
   * instead of waiting the full (heavy) authoritative query, then reconciles
   * over it. Seed-only; never the source of truth. Backed by Upstash via
   * `/api/receiving/rail-snapshot` (see `rail-snapshot-client.ts`). Memoize it —
   * the seed effect keys on its identity. Snapshot-enabled rails keep settled
   * chrome instead of showing the pulse skeleton while the seed resolves.
   */
  loadSnapshot?: () => Promise<TRow[] | null>;
  /**
   * Persist the rows the rail just rendered as the next reload's seed. Called
   * with the settled authoritative rows; the provider debounces + fires the
   * write. Pair with {@link loadSnapshot}; unset = no persistence.
   */
  persistSnapshot?: (rows: TRow[]) => void;
  /**
   * When set, a CustomEvent<'prev' | 'next'> on this name steps the selection to
   * the adjacent rendered row and fires `onSelect` — the wiring behind a detail
   * pane's up/down header chevrons when there's no separate table to drive
   * navigation (Unbox/Triage/Testing workspace header → this rail).
   */
  navigateEvent?: string;

  selectedId: number | null;
  selectedRow?: TRow | null;
  /**
   * Optimistic row pinned at the very top until its real row lands in the feed —
   * e.g. the triage "importing" stub (title = the scanned tracking #), rendered
   * through the SAME row component, then replaced by the resolved row. Deduped by
   * id so it never doubles a row already present.
   */
  leadingRow?: TRow | null;
  limit?: number;
  /**
   * When true (default), a selected row that falls outside the top-N window is
   * hoisted to `rows[0]` (pinned lead) so the active line stays visible. Set
   * FALSE for feeds that must hold a STRICT sort order (e.g. the unbox rail,
   * which must always read top→bottom by `unboxed_at`): the hoist there made a
   * just-received carton shoot to the top and then drop back down as the
   * authoritative refetch settled it into its real `unboxed_at` slot — a
   * jarring bounce. With the pin off, the row simply stays in its sorted
   * position (a freshly-unboxed carton is at the top by `unboxed_at` anyway).
   */
  pinSelectedLead?: boolean;
  /**
   * When true, keep the fetcher/SQL order — do not re-sort by `getActivityAt`.
   * Unboxed uses this so the server first-open axis is the only sort; client
   * re-sort was fighting the SQL order and causing Unfound flicker.
   */
  preserveServerOrder?: boolean;

  eyebrowTitle: string;
  eyebrowSuffix?: string;
  /** Right-aligned eyebrow slot (e.g. a refresh button). Takes precedence over `eyebrowSuffix`. */
  eyebrowAction?: ReactNode;
  /**
   * When true, hides the "TITLE · N" eyebrow band (and its inline edit pencil).
   * Used when the workbench chrome already owns tabs + select toggle.
   */
  hideEyebrow?: boolean;
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
  /**
   * Stagger entrance axis.
   *   - `sidebar` (default) — visible y settle; safe in scrolling sidebar rails.
   *   - `rise` — taller y settle for full-width workbench cards.
   *   - `slide` — visible, clipped-safe horizontal settle for sidebar rails.
   */
  staggerRevealMotion?: 'slide' | 'rise' | 'sidebar';
  /**
   * Horizontal inset for the list host.
   *   - `gutter` (shell default) — symmetric SIDEBAR_GUTTER.
   *   - `scanDock` — left = SIDEBAR_RAIL_INSET_LEFT (sidebar gutter), right flush
   *     (SIDEBAR_RAIL_INSET_X); the status
   *     dot rides a compact FLOW leading track (SIDEBAR_SCAN_DOCK_LEADING_ROW) at the
   *     row's left and the title/eyebrow sit one tight gap after it — the dense
   *     scan-dock column. Recent rails default this via SidebarRecentRailBase.
   */
  railInset?: 'scanDock' | 'gutter';

  /** Dev/observability: stamp a paint mark once the rail leaves skeleton state. */
  contentPaintSurface?: PaintSurface;

  getId: (row: TRow) => number;
  /**
   * Durable RENDER identity, preferred over {@link getId} for the React `key` AND
   * the {@link leadingRow} dedup. Lets an optimistic row (the triage "importing"
   * stub) reconcile to its resolved row IN PLACE — same key → React UPDATE, not
   * unmount+remount — even though its server `id` changes on resolve. Return a
   * client-minted id (e.g. `client_event_id`) that survives the stub→real swap;
   * fall back to a stringified `id` for ordinary rows. Defaults to `getId`.
   */
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
}
