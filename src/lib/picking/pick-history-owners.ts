/**
 * Item number → owning picker, derived from who actually picks it.
 * Owner 2026-09-28: "staff already have clear pick patterns per item number —
 * nobody should assign pickers by hand." Pure: the rows come from
 * {@link PICK_HISTORY_SQL}; the writer is `deriveSkuPickOwners`.
 */

/** The window that decides ownership while the item has picks in it. */
export const RECENT_PICK_DAYS = 60;

/** The leader needs at least this many picks of their own in the deciding window. */
export const OWNER_MIN_PICKS = 3;

/** The leader must hold at least this share of the deciding window's picks. */
export const OWNER_MIN_SHARE = 0.6;

/**
 * Picks per (item number, picker), all-time and within {@link RECENT_PICK_DAYS}
 * — the desk's "Picked by" (`order_stage_facts.picked_by`: allocation pick
 * event › picking session › pick scan › serial taken), keyed by the order's
 * item (catalog SKU, else the order's own SKU) and dated by the pick, else the
 * order. `$1` org, `$2` item numbers (`NULL` = every item).
 */
export const PICK_HISTORY_SQL = `
  SELECT h.sku,
         h.staff_id,
         COUNT(*)::int AS picks,
         COUNT(*) FILTER (WHERE h.picked_at > NOW() - INTERVAL '${RECENT_PICK_DAYS} days')::int AS recent_picks,
         MAX(h.picked_at) AS last_at
    FROM (
      SELECT COALESCE(NULLIF(BTRIM(sc.sku), ''), NULLIF(BTRIM(o.sku), '')) AS sku,
             f.picked_by AS staff_id,
             COALESCE(f.picked_at, o.created_at) AS picked_at
        FROM order_stage_facts f
        JOIN orders o ON o.id = f.order_id AND o.organization_id = f.organization_id
        LEFT JOIN sku_catalog sc ON sc.id = o.sku_catalog_id AND sc.organization_id = o.organization_id
       WHERE f.organization_id = $1
         AND f.picked_by IS NOT NULL
    ) h
   WHERE h.sku IS NOT NULL
     AND ($2::text[] IS NULL OR h.sku = ANY($2::text[]))
   GROUP BY h.sku, h.staff_id`;

export interface PickHistoryRow {
  sku: string;
  staffId: number;
  /** All-time picks. */
  picks: number;
  /** Picks within {@link RECENT_PICK_DAYS}. */
  recentPicks: number;
  /** Epoch ms of the newest pick. */
  lastAt: number;
}

export interface SkuPickOwner {
  sku: string;
  staffId: number;
  /** `history`: earned by picks; `override`: named by the operator, wins over history. */
  source: 'history' | 'override';
  /** Which picks decided: the recent window, or all-time when nobody leads it clearly. */
  window: 'recent' | 'all';
  /** The owner's picks of this item in the deciding window, and everyone's. */
  picks: number;
  total: number;
  /** Runner-up in the deciding window (picks, then recency). */
  backupStaffId: number | null;
}

/** Can this item number carry an owner? Blank and the `No data` placeholder cannot. */
export function isOwnableSku(sku: string | null | undefined): sku is string {
  const trimmed = sku?.trim() ?? '';
  return trimmed !== '' && trimmed.toLowerCase() !== 'no data';
}

/** Pickers by picks, then most recent, then lowest id — one item or many summed. */
export function rankPickHistory(rows: Iterable<{ staffId: number; picks: number; lastAt: number }>): number[] {
  const tally = new Map<number, { picks: number; lastAt: number }>();
  for (const row of rows) {
    if (row.picks <= 0) continue;
    const prev = tally.get(row.staffId) ?? { picks: 0, lastAt: 0 };
    tally.set(row.staffId, { picks: prev.picks + row.picks, lastAt: Math.max(prev.lastAt, row.lastAt) });
  }
  return [...tally.entries()]
    .sort((a, b) => b[1].picks - a[1].picks || b[1].lastAt - a[1].lastAt || a[0] - b[0])
    .map(([staffId]) => staffId);
}

/** One window's pickers — ranked by picks, then recency — with their counts. */
export function rankPickWindow(
  rows: readonly PickHistoryRow[],
  window: SkuPickOwner['window'],
): { ranked: number[]; picksOf: (staffId: number | undefined) => number; total: number } {
  const counted = rows.map((r) => ({ staffId: r.staffId, picks: window === 'recent' ? r.recentPicks : r.picks, lastAt: r.lastAt }));
  const picksOf = (staffId: number | undefined) =>
    counted.filter((r) => r.staffId === staffId).reduce((n, r) => n + r.picks, 0);
  return { ranked: rankPickHistory(counted), picksOf, total: counted.reduce((n, r) => n + r.picks, 0) };
}

/**
 * Who stands in for an item's owner, best first: the recent window's ranking,
 * then all-time's. The owner is dropped by the consumer (`resolvePickOwnership`).
 */
export function pickBackupCandidates(rows: readonly PickHistoryRow[]): number[] {
  return [...new Set([...rankPickWindow(rows, 'recent').ranked, ...rankPickWindow(rows, 'all').ranked])];
}

/**
 * One owner per item: the leader of the last {@link RECENT_PICK_DAYS} days
 * when they have at least {@link OWNER_MIN_PICKS} picks of their own and at
 * least {@link OWNER_MIN_SHARE} of that window's picks; if nobody qualifies
 * there, the all-time leader under the same thresholds. A tie for the lead
 * qualifies nobody. Backup = the deciding window's runner-up. `overrides`
 * (item → staff) win over history, picks or not. Sorted by item number.
 */
export function planSkuPickOwners(
  rows: readonly PickHistoryRow[],
  overrides: ReadonlyMap<string, number> = new Map(),
): SkuPickOwner[] {
  const bySku = new Map<string, PickHistoryRow[]>();
  for (const row of rows) {
    if (!isOwnableSku(row.sku)) continue;
    const sku = row.sku.trim();
    const list = bySku.get(sku) ?? [];
    list.push(row);
    bySku.set(sku, list);
  }

  const owners: SkuPickOwner[] = [];
  for (const [rawSku, staffId] of overrides) {
    if (!isOwnableSku(rawSku)) continue;
    const sku = rawSku.trim();
    const list = bySku.get(sku) ?? [];
    const window: SkuPickOwner['window'] = list.some((r) => r.recentPicks > 0) ? 'recent' : 'all';
    const { picksOf, total } = rankPickWindow(list, window);
    owners.push({
      sku,
      staffId,
      source: 'override',
      window,
      picks: picksOf(staffId),
      total,
      backupStaffId: pickBackupCandidates(list).find((id) => id !== staffId) ?? null,
    });
  }

  for (const [sku, list] of bySku) {
    if (overrides.has(sku)) continue;
    for (const window of ['recent', 'all'] as const) {
      const { ranked, picksOf, total } = rankPickWindow(list, window);
      const top = picksOf(ranked[0]);
      if (top < OWNER_MIN_PICKS || top / total < OWNER_MIN_SHARE || picksOf(ranked[1]) === top) continue;
      owners.push({ sku, staffId: ranked[0], source: 'history', window, picks: top, total, backupStaffId: ranked[1] ?? null });
      break;
    }
  }

  return owners.sort((a, b) => (a.sku < b.sku ? -1 : a.sku > b.sku ? 1 : 0));
}

/** The pairing note: where the owner came from, with the evidence. */
export function skuPickOwnerNote(owner: SkuPickOwner): string {
  const span = owner.window === 'recent' ? `${RECENT_PICK_DAYS}d` : 'all-time';
  return owner.source === 'override'
    ? `Override: operator (pick history ${owner.picks}/${owner.total} ${span})`
    : `Auto: pick history ${owner.picks}/${owner.total} ${span}`;
}
