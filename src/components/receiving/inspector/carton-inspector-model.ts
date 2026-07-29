/**
 * Carton inspector — the pure read model.
 *
 * The inspector is the READ view of a carton; `/unbox` is the WORK view. D4's
 * verdict allowed that split on one condition: **both shells compose the same
 * dumb primitives**, or we have forked a second rendering of a carton and will
 * maintain two half-correct ones. This module is the read half of keeping that
 * promise — it derives display facts and nothing else. No fetching, no writes,
 * no component imports, so the derivation is testable with zero DB and zero DOM.
 *
 * Shape mirrors `GET /api/receiving/[id]`, which already returns the whole
 * carton read model (identity + milestones + lines + serials + events). The
 * inspector adds no endpoint.
 *
 * **Timestamp discipline.** The carton milestone fields come back from
 * `to_char(ts::timestamp, 'YYYY-MM-DD HH24:MI:SS')` with the DB session on
 * `America/Los_Angeles` — i.e. they are **warehouse wall-clock strings, not
 * instants**. `formatDateTimePST` parses that naive shape purely (no `Date`
 * reparse), so it renders identically under any host TZ. Do NOT hand these to
 * anything that constructs a `Date` from them — that is the banned host-local
 * reparse in `.claude/rules/source-of-truth.md` → Dates. `events[].occurred_at`
 * IS a real ISO instant; the same formatter branches correctly for it.
 */

/** Carton header as returned by `GET /api/receiving/[id]` (`receiving`). */
export interface CartonInspectorReceiving {
  id: number;
  tracking: string | null;
  carrier: string | null;
  source: string | null;
  source_platform: string | null;
  intake_type: string | null;
  pairing_state: string | null;
  triage_complete: boolean | null;
  is_return: boolean | null;
  return_platform: string | null;
  staging_location_label: string | null;
  zoho_purchaseorder_id: string | null;
  zoho_purchaseorder_number: string | null;
  listing_url: string | null;
  support_notes: string | null;
  tracking_scanned_at: string | null;
  tracking_scanned_by_name: string | null;
  unbox_opened_at: string | null;
  unbox_opened_by_name: string | null;
  unboxed_at: string | null;
  unboxed_by_name: string | null;
  received_at: string | null;
  received_by_name: string | null;
  created_at: string | null;
}

export interface CartonInspectorLine {
  id: number;
  sku: string | null;
  item_name: string | null;
  quantity_expected: number | null;
  quantity_received: number | null;
  condition_grade: string | null;
  workflow_status: string | null;
  zoho_purchaseorder_number: string | null;
  /** Per-line tracking (a multi-tracking carton splits across lines). */
  tracking_number: string | null;
  serials?: Array<{ id: number; serial_number: string; current_status: string | null }>;
}

export interface CartonInspectorTotals {
  expected: number;
  received: number;
  lines: number;
  lines_complete: number;
}

export interface CartonInspectorPayload {
  success?: boolean;
  receiving: CartonInspectorReceiving;
  purchase_orders?: Array<{
    zoho_purchaseorder_id: string | null;
    zoho_purchaseorder_number: string | null;
    line_count: number;
  }>;
  lines?: CartonInspectorLine[];
  totals?: CartonInspectorTotals;
}

/** One "who did what, when" row. */
interface CartonMilestone {
  key: 'scanned' | 'opened' | 'unboxed' | 'received';
  label: string;
  /** Warehouse wall-clock string — render via `formatDateTimePST`, never `new Date`. */
  at: string;
  byName: string | null;
}

/**
 * The carton's provenance, in lifecycle order.
 *
 * This is the question a lookup scan is actually asking — "what happened to
 * this box, and who did it?" — so it is the inspector's lead content, not a
 * footnote. Milestones with no timestamp are omitted rather than rendered as
 * `—`: an absent stamp means the step did not happen, and a column of dashes
 * reads as missing data instead of an incomplete lifecycle.
 *
 * Scanned is a TRIAGE (door) stamp while Opened / Unboxed are UNBOX stamps —
 * they are independent by design, so a carton can legitimately have the later
 * ones without the earlier.
 */
export function buildCartonMilestones(
  receiving: Pick<
    CartonInspectorReceiving,
    | 'tracking_scanned_at'
    | 'tracking_scanned_by_name'
    | 'unbox_opened_at'
    | 'unbox_opened_by_name'
    | 'unboxed_at'
    | 'unboxed_by_name'
    | 'received_at'
    | 'received_by_name'
  >,
): CartonMilestone[] {
  const candidates: Array<{ key: CartonMilestone['key']; label: string; at: string | null; byName: string | null }> = [
    { key: 'scanned', label: 'Scanned in', at: receiving.tracking_scanned_at, byName: receiving.tracking_scanned_by_name },
    { key: 'opened', label: 'Opened', at: receiving.unbox_opened_at, byName: receiving.unbox_opened_by_name },
    { key: 'unboxed', label: 'Unboxed', at: receiving.unboxed_at, byName: receiving.unboxed_by_name },
    { key: 'received', label: 'Received', at: receiving.received_at, byName: receiving.received_by_name },
  ];
  return candidates
    .filter((c): c is typeof c & { at: string } => typeof c.at === 'string' && c.at.trim().length > 0)
    .map((c) => ({ key: c.key, label: c.label, at: c.at, byName: c.byName?.trim() || null }));
}

/**
 * Lifecycle states a carton can be in, least → most advanced.
 *
 * The read view's FIRST job is answering "is this done?" (the reason the
 * operator scanned a finished box at all). Deriving that from the milestone
 * stamps here — rather than making the operator infer it from four timestamp
 * rows — is what lets the surface lead with an answer instead of an audit log.
 */
export type CartonLifecycleState = 'expected' | 'scanned' | 'opened' | 'unboxed' | 'received';

export interface CartonLifecycle {
  state: CartonLifecycleState;
  label: string;
  /** Semantic TONE, not a class — the view maps it (views stay dumb). */
  tone: 'neutral' | 'info' | 'success';
  /** The unbox work is finished — what makes a re-scan a lookup. */
  done: boolean;
}

const LIFECYCLE: Record<CartonLifecycleState, Omit<CartonLifecycle, 'state'>> = {
  expected:  { label: 'Expected',   tone: 'neutral', done: false },
  scanned:   { label: 'Scanned in', tone: 'info',    done: false },
  opened:    { label: 'Opened',     tone: 'info',    done: false },
  unboxed:   { label: 'Unboxed',    tone: 'success', done: true },
  received:  { label: 'Received',   tone: 'success', done: true },
};

/** Most-advanced milestone reached. Received ⊃ unboxed ⊃ opened ⊃ scanned. */
export function cartonLifecycle(
  receiving: Parameters<typeof buildCartonMilestones>[0],
): CartonLifecycle {
  const reached = new Set(buildCartonMilestones(receiving).map((m) => m.key));
  const state: CartonLifecycleState = reached.has('received')
    ? 'received'
    : reached.has('unboxed')
      ? 'unboxed'
      : reached.has('opened')
        ? 'opened'
        : reached.has('scanned')
          ? 'scanned'
          : 'expected';
  return { state, ...LIFECYCLE[state] };
}

/**
 * Collapse a single-actor, single-session lifecycle to one line.
 *
 * Four rows reading `Kai` four times with second precision is an audit log, not
 * an answer — and the audit log is the SECONDARY read (see the expander). When
 * one person did every step, the honest summary is who + the span.
 * Returns null when more than one actor touched it, because then the per-step
 * attribution IS the content and must not be hidden.
 */
export function collapseProvenance(
  milestones: CartonMilestone[],
): { actor: string; firstAt: string; lastAt: string; steps: number } | null {
  if (milestones.length < 2) return null;
  const actors = new Set(milestones.map((m) => m.byName).filter((n): n is string => !!n));
  if (actors.size !== 1) return null;
  if (milestones.some((m) => !m.byName)) return null;
  return {
    actor: [...actors][0],
    firstAt: milestones[0].at,
    lastAt: milestones[milestones.length - 1].at,
    steps: milestones.length,
  };
}

/**
 * Anchor for the shared `WorkspaceTimelineTab` (the SAME timeline the Unbox
 * workbench mounts). Passing the PO id lets it use the Incoming-details cache
 * instead of a second carrier fetch.
 */
export function cartonTimelineAnchor(receiving: CartonInspectorReceiving): {
  receivingId: number;
  tracking: string | null;
  poId: string | null;
} {
  return {
    receivingId: receiving.id,
    tracking: receiving.tracking?.trim() || null,
    poId: receiving.zoho_purchaseorder_id?.trim() || null,
  };
}

/** Received-vs-expected summary for the contents header. */
export function cartonContentsSummary(totals: CartonInspectorTotals | undefined | null): string {
  if (!totals || totals.lines === 0) return 'No lines';
  const { expected, received, lines, lines_complete: complete } = totals;
  const unitPart = expected > 0 ? `${received}/${expected} units` : `${received} units`;
  return `${unitPart} · ${complete}/${lines} ${lines === 1 ? 'line' : 'lines'} complete`;
}
