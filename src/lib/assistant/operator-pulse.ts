/**
 * Operator pulse — the FIRST ROW of the home surface, ranked.
 *
 * ## What this is
 *
 * The row above the composer is not chat chrome and not a greeting. It is the
 * shift's standing answer to "what is costing us money right now", across the
 * four pillars this platform integrates: support tickets, order triage,
 * technical refurbishment, and fulfillment. One row, the worst thing as a
 * sentence, the next few as counters, and EVERY one of them carrying the
 * question that turns the number into work.
 *
 * ## Where the numbers come from
 *
 * `/api/home-board` tiles — nothing else. That route dispatches registered
 * assistant tools through `runAssistantTool`, the same chokepoint with the same
 * per-tool permission check and the same org-from-ctx scoping the agent uses.
 * So the pulse, the board rail, and the sentence the model answers with are
 * literally the same query. A second query here would be a second truth.
 *
 * This module reads the RAW tool payloads rather than
 * {@link boardTileRows}' formatted `BoardRow`s, because ranking needs numbers
 * (`units`, `oldestDays`) and those rows have already been rendered to strings
 * ("12 orders", "oldest 3 days"). Parsing English back into integers to sort it
 * is how a display projection becomes a data bug. Reading the payload
 * defensively, once, is cheaper and honest.
 *
 * ## Why lanes, and not the biggest number
 *
 * Ranking by magnitude puts 400 dormant SKUs above three customers waiting on
 * a reply, which is exactly backwards for a shop whose reputation is its
 * channel standing. Lanes encode the business order ONCE:
 *
 *   1. `promised` — someone outside the building is waiting (support replies,
 *      open order exceptions). Late here costs a metric, a case, or an account.
 *   2. `blocked`  — money already spent, physically stuck (repairs in flight,
 *      units on hold, receiving exceptions). It cannot earn until it moves.
 *   3. `latent`   — money never earned (received but never listed, dead stock).
 *      Real, but nobody is waiting on it today.
 *
 * Inside a lane, AGE beats SIZE: a small rotting pile is a process that stopped
 * working, a big fresh one is just a busy day. Ties fall back to size, then to
 * a stable id so the row never reshuffles between polls.
 *
 * ## Words, not numbers
 *
 * `headline` copy is owned here on purpose. The tools' own labels are desk
 * labels ("Received but never listed") and read as a report heading in a
 * sentence slot. This module renames them for the row; it never invents a
 * count, a unit, an age, or a question — those are the tool's.
 */

import type { BoardTilePayload } from '@/components/session/board/board-tiles';

/**
 * Lane order IS the ranking. Lower sorts first.
 *
 * `PULSE_LANE_FACE` is the display twin: the eyebrow a lane group header
 * wears and the one-line why, so the ledger never hand-rolls lane copy.
 */
export const PULSE_LANES = ['promised', 'blocked', 'latent'] as const;
export type PulseLane = (typeof PULSE_LANES)[number];

export const PULSE_LANE_FACE: Record<PulseLane, { label: string; why: string }> = {
  promised: { label: 'Promised', why: 'someone outside the building is waiting' },
  blocked: { label: 'Blocked', why: 'money already spent, physically stuck' },
  latent: { label: 'Latent', why: 'money never earned' },
};

/**
 * The four pillars this platform integrates, in telemetry-strip order. An
 * item's pillar is which PART of the business its lane is costing — the
 * mission pane's strip is one cell per pillar, summed from the same ranked
 * items the ledger draws. No second query, no second truth.
 */
export const PULSE_PILLARS = ['support', 'orders', 'refurb', 'fulfillment'] as const;
export type PulsePillar = (typeof PULSE_PILLARS)[number];

export const PULSE_PILLAR_LABEL: Record<PulsePillar, string> = {
  support: 'Support',
  orders: 'Orders',
  refurb: 'Refurb',
  fulfillment: 'Listings',
};

export interface PulseItem {
  /** Stable across polls — React key and the ranking tie-breaker of last resort. */
  id: string;
  /** Which lane this cost sorts in — the rank's first key. */
  lane: PulseLane;
  /** Which business pillar this cost lands on — the telemetry strip's axis. */
  pillar: PulsePillar;
  /**
   * The sentence body WITHOUT the count — "orders stuck in exceptions". The
   * row renders `count` beside it in its own ink, so the number is never
   * baked into the string it has to style around.
   */
  headline: string;
  /**
   * Two or three words for a SECONDARY item — "order exceptions". The lead
   * spends the row's width on grammar; a counter keeps the noun, and both
   * faces are authored rather than sliced out of each other with a regex.
   */
  short: string;
  /** How many things. Never rendered bare — `headline`/`short` name them. */
  count: number;
  unit: string;
  /** Age of the oldest item in days, when the source carries a date. */
  ageDays: number | null;
  /** The question this item seeds into the composer on click. The tool's own. */
  question: string;
}

const LANE_RANK: Record<PulseLane, number> = { promised: 0, blocked: 1, latent: 2 };

/**
 * ROI gap id → the lane and pillar it belongs to, and how the row says it,
 * singular and plural.
 *
 * A gap id absent from this map still ranks: unknown ids land in `blocked` /
 * `refurb` (the middle lane, the physical pipeline) with the tool's own label,
 * because a new gap query is more likely to be stuck work than either
 * extreme, and silently dropping a gap the backend just started reporting is
 * the worse failure.
 */
const GAP_FACE: Record<
  string,
  { lane: PulseLane; pillar: PulsePillar; one: string; many: string; short: string }
> = {
  open_order_exceptions: {
    lane: 'promised',
    pillar: 'orders',
    one: 'order stuck in exceptions',
    many: 'orders stuck in exceptions',
    short: 'order exceptions',
  },
  open_receiving_exceptions: {
    lane: 'blocked',
    pillar: 'refurb',
    one: 'receiving line unresolved',
    many: 'receiving lines unresolved',
    short: 'receiving lines',
  },
  repairs_in_flight: {
    lane: 'blocked',
    pillar: 'refurb',
    one: 'unit mid-repair',
    many: 'units mid-repair',
    short: 'mid-repair',
  },
  units_on_hold: {
    lane: 'blocked',
    pillar: 'refurb',
    one: 'unit on hold',
    many: 'units on hold',
    short: 'on hold',
  },
  unlisted_units: {
    lane: 'latent',
    pillar: 'fulfillment',
    one: 'unit received, never listed',
    many: 'units received, never listed',
    short: 'never listed',
  },
  dead_stock: {
    lane: 'latent',
    pillar: 'fulfillment',
    one: 'SKU dormant',
    many: 'SKUs dormant',
    short: 'dormant',
  },
};

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function count(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
}

function days(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

/** `get_roi_gaps` → one item per gap that actually has something in it. */
function gapItems(data: unknown): PulseItem[] {
  const items: PulseItem[] = [];
  for (const entry of asArray(asRecord(data).gaps)) {
    const gap = asRecord(entry);
    const units = count(gap.units);
    if (units === 0) continue;
    const id = typeof gap.id === 'string' && gap.id ? gap.id : null;
    if (!id) continue;
    const question = typeof gap.question === 'string' ? gap.question : '';
    if (!question) continue;
    const label = typeof gap.label === 'string' && gap.label ? gap.label.toLowerCase() : 'items';
    const face =
      GAP_FACE[id] ?? {
        lane: 'blocked' as PulseLane,
        pillar: 'refurb' as PulsePillar,
        one: label,
        many: label,
        short: label,
      };
    items.push({
      id: `gap:${id}`,
      lane: face.lane,
      pillar: face.pillar,
      // Singular matters: "1 orders stuck in exceptions" is the tell that a
      // row was assembled by string concatenation rather than authored.
      headline: units === 1 ? face.one : face.many,
      short: face.short,
      count: units,
      unit: typeof gap.unit === 'string' ? gap.unit : 'items',
      ageDays: days(gap.oldestDays),
      question,
    });
  }
  return items;
}

/**
 * `list_support_followups` → the ONE promised-lane item this platform cannot
 * function without. A ticket assigned to you and not answered is the only row
 * here with a person on the other end of it.
 *
 * Age comes from `updatedAtMs` (assignment touch time), which is the oldest
 * signal the query returns; `now` is injected so ranking is deterministic
 * under test.
 */
function supportItems(data: unknown, now: number): PulseItem[] {
  const root = asRecord(data);
  const items = asArray(root.items);
  const open = count(root.count ?? items.length);
  if (open === 0) return [];
  const oldestMs = items.reduce<number | null>((oldest, entry) => {
    const ms = Number(asRecord(entry).updatedAtMs);
    if (!Number.isFinite(ms) || ms <= 0) return oldest;
    return oldest == null || ms < oldest ? ms : oldest;
  }, null);
  return [
    {
      id: 'support:followups',
      lane: 'promised',
      pillar: 'support',
      headline: open === 1 ? 'ticket waiting on your reply' : 'tickets waiting on your reply',
      short: 'awaiting reply',
      count: open,
      unit: open === 1 ? 'ticket' : 'tickets',
      ageDays: oldestMs == null ? null : days((now - oldestMs) / 86_400_000),
      question: 'Show me my assigned support tickets, oldest first',
    },
  ];
}

/**
 * Rank: lane, then age (older first), then size, then id.
 *
 * `ageDays: null` sorts BELOW any known age inside its lane — an item whose
 * table carries no date cannot be proven urgent, and promoting an unknown over
 * a measured 9-day-old queue would make the row lie in the operator's favour.
 */
function compare(a: PulseItem, b: PulseItem): number {
  if (LANE_RANK[a.lane] !== LANE_RANK[b.lane]) return LANE_RANK[a.lane] - LANE_RANK[b.lane];
  const ageA = a.ageDays ?? -1;
  const ageB = b.ageDays ?? -1;
  if (ageA !== ageB) return ageB - ageA;
  if (a.count !== b.count) return b.count - a.count;
  return a.id.localeCompare(b.id);
}

/**
 * Board tiles → the pulse ledger, ranked, worst first. The FULL set: the
 * ledger scrolls vertically by lane; capping here would hide ranked work the
 * operator asked to see.
 *
 * `denied` and `error` tiles contribute nothing rather than an apology: a
 * picker without `dashboard.view` on one tool still gets the pillars they can
 * see, and a broken tool must never turn the ledger into an error banner.
 */
export function operatorPulse(
  tiles: readonly BoardTilePayload[],
  opts: { now?: number } = {},
): PulseItem[] {
  const now = opts.now ?? Date.now();
  const items: PulseItem[] = [];
  for (const tile of tiles) {
    if (tile.state !== 'ok') continue;
    if (tile.tool === 'get_roi_gaps') items.push(...gapItems(tile.data));
    else if (tile.tool === 'list_support_followups') items.push(...supportItems(tile.data, now));
  }
  return items.sort(compare);
}

/**
 * The telemetry strip: one cell per pillar, summed from the SAME ranked items
 * the ledger draws (one query, one truth). `worst` is the pillar's top-ranked
 * item so a strip cell click seeds the same question its ledger row would.
 */
export function pulsePillarTotals(
  items: readonly PulseItem[],
): Array<{ pillar: PulsePillar; count: number; worst: PulseItem | null }> {
  return PULSE_PILLARS.map((pillar) => {
    const mine = items.filter((i) => i.pillar === pillar);
    return {
      pillar,
      count: mine.reduce((sum, i) => sum + i.count, 0),
      worst: mine[0] ?? null,
    };
  });
}

/**
 * The age suffix an operator reads without arithmetic, or null when the source
 * has no date. Deliberately not folded into `headline`: the row shows age on
 * the lead item only, where there is width for it.
 */
export function pulseAge(item: PulseItem): string | null {
  if (item.ageDays == null) return null;
  if (item.ageDays >= 1) return item.ageDays === 1 ? '1 day old' : `${item.ageDays} days old`;
  return 'today';
}
