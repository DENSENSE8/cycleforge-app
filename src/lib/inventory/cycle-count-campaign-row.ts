/** The cycle-count CAMPAIGN row — the wire shape `/inventory/cycle-counts` hands its client table island, and the row the `cycle-counts`… */

export interface CycleCountCampaignRow {
  id: number;
  /** Campaign name — the item cell's first line. */
  name: string;
  /** `open` | `closed` — the state pill. */
  status: string;
  /** Variance tolerance as stored (`0.050`), the second line under the name. */
  varianceTol: string;
  totalLines: number;
  countedLines: number;
  pendingReviewLines: number;
  approvedLines: number;
  /** ISO instant — the Dates chrome Hash line. */
  createdAt: string;
  /** Staff name from the `staff` join; `null` ⇒ created by the system. */
  createdByName: string | null;
}

/** The campaign's state PILL word. */
export function campaignStatusLabel(status: string): string {
  const s = status.trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
}
