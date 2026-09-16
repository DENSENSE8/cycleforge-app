/**
 * The cycle-count CAMPAIGN row — the wire shape `/inventory/cycle-counts`
 * hands its client table island, and the row the `cycle-counts` family speaks
 * about.
 *
 * The desk is an RSC page: `loadCampaigns` runs server-side and the rows cross
 * the boundary as props, so this shape is deliberately PLAIN and serializable
 * (ISO strings, no `Date`, no pg row object). It carries exactly the facts the
 * desk painted — `closed_at` and `created_by` are selected by the query and
 * were never drawn, so they are not here. Adding them would restore columns the
 * port is not asked to invent.
 */

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

/**
 * The campaign's state PILL word. One map, read by the row adapter (the pill)
 * and by the resolver (the Status header's sort key and the search index) — a
 * separate face on either side would order the list by words the operator
 * cannot see.
 */
export function campaignStatusLabel(status: string): string {
  const s = status.trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
}
