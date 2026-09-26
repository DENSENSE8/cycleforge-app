/** The cycle-count LINE row — the wire shape `/inventory/cycle-counts/[id]` hands its client table island, and the row the… */

/** The five-way closed vocabulary of `cycle_count_lines.status`. */
const CYCLE_COUNT_LINE_STATUSES = [
  'pending',
  'counted',
  'pending_review',
  'approved',
  'rejected',
] as const;

type CycleCountLineStatus = (typeof CYCLE_COUNT_LINE_STATUSES)[number];

export interface CycleCountLineRow {
  id: number;
  /** The campaign this line belongs to — the server actions' FormData key. */
  campaignId: number;
  binId: number;
  /** `locations.name`; `null` ⇒ the identity face falls back to `#binId`. */
  binName: string | null;
  sku: string;
  expectedQty: number;
  /** `null` until somebody counts. */
  countedQty: number | null;
  /** `counted_qty - expected_qty`, as stored. `null` until counted. */
  variance: number | null;
  status: string;
  /** `cycle_count_lines.counted_by` — drives the PERSON face's avatar. */
  countedByStaffId: number | null;
  countedByName: string | null;
  /** ISO instant — the Dates chrome Hash line. */
  countedAt: string | null;
  approvedByStaffId: number | null;
  approvedByName: string | null;
  /** ISO instant — the Dates chrome Calendar line. */
  approvedAt: string | null;
  /** The CAMPAIGN's tolerance as stored (`0.050`) — the gate, as a fact. */
  varianceTol: string;
  /** Derived: this line's variance is outside {@link varianceTol}. */
  overTolerance: boolean;
  /** The CAMPAIGN is still open ⇒ the row's write verbs are offered. */
  campaignOpen: boolean;
}

/** The line's IDENTITY face — `bin_name ?? */
export function cycleCountLineBinLabel(
  row: Pick<CycleCountLineRow, 'binId' | 'binName'>,
): string {
  const name = (row.binName ?? '').trim();
  return name || `#${row.binId}`;
}

/** The line's state PILL word. */
export function cycleCountLineStatusLabel(status: string): string {
  switch (status) {
    case 'pending':
      return 'Pending';
    case 'counted':
      return 'Counted';
    case 'pending_review':
      return 'Pending review';
    case 'approved':
      return 'Approved';
    case 'rejected':
      return 'Rejected';
    default:
      return status.trim();
  }
}

/** The signed variance FACE — `+3`, `-2`, `0`. */
export function cycleCountLineVarianceFace(variance: number | null): string | null {
  if (variance == null) return null;
  return variance > 0 ? `+${variance}` : String(variance);
}

/** Is this line's variance outside the campaign's tolerance? */
export function isCycleCountLineOverTolerance(
  variance: number | null,
  expectedQty: number,
  varianceTol: string | number,
): boolean {
  if (variance == null || variance === 0) return false;
  const tol = Number(varianceTol);
  if (!Number.isFinite(tol)) return false;
  return Math.abs(variance) > expectedQty * tol;
}
