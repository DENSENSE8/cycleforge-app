/**
 * Cycle-count LINES field catalog — the bindable facts of ONE
 * `cycle_count_lines` row.
 *
 * Off `AdminTable` 2026-09-12 (Wave D). The retired desk painted SEVEN hand
 * `AdminTableColumn` objects carrying JSX, with no header sort, no Fields
 * picker and no org binding, because that engine never grew them — and two of
 * the seven were not columns at all:
 *
 * - **Counted** rendered an inline `<input type="number">` + Submit `<form>`
 *   when `status === 'pending' && isOpen`, and a plain number otherwise. A
 *   compound row has no in-cell editor (`capabilities.inCellEdit` is `false`
 *   on every family in this repo), so the write is a ROW VERB that opens a
 *   `DeskStageOverlay` carrying the input — the Center-Lock L2 record plane,
 *   with the table still readable underneath.
 * - **Action** was POLYMORPHIC: Approve / Reject buttons when the line was
 *   actionable, and otherwise PROVENANCE TEXT (`by <approved_by_name>` /
 *   `counted by <counted_by_name>`). One track carrying two kinds of content
 *   is what `ENGINE_IS_MONOMORPHIC` refuses. It is split: the verbs are row
 *   verbs (`cycle-count-lines-verbs.ts`), and the provenance is two real
 *   PERSON facts.
 *
 * ## Where the eleven facts landed
 *
 * | retired cell        | fact           | home on the compound row        |
 * |---------------------|----------------|---------------------------------|
 * | Bin                 | `bin`          | the IDENTITY chip (`fulfillment`)|
 * | SKU                 | `sku`          | the row TITLE (item cell)       |
 * | Expected            | `expected`     | `status:1`                      |
 * | Counted (the number)| `counted`      | `status:2`                      |
 * | Δ                   | `variance`     | `status:3`                      |
 * | Status              | `status`       | the STATE pill                  |
 * | Action (provenance) | `counted_by`   | `status:4`, a PERSON face       |
 * | Action (provenance) | `approved_by`  | catalog, UNBOUND                |
 * | — (campaign header) | `tolerance`    | bound SUBTITLE under the SKU    |
 * | — (never painted)   | `counted_at`   | DATES chrome, Hash line         |
 * | — (never painted)   | `approved_at`  | DATES chrome, Calendar line     |
 *
 * Three of those rows are decisions rather than transcription.
 *
 * **The stamps were never a cell, and they are not a restoration.** The
 * retired Action cell printed WHO without WHEN, which is half a provenance
 * record on a desk whose whole job is an audit of a physical count. The Dates
 * chrome mounts on every compound row (the skeleton mounts WHOLE —
 * `COMPOUND_SKELETON_FILTER_DEBT` is documented shrink-only), so the
 * alternative was a track of dashes beside the facts that explain it. Counted
 * rides the Hash line, approved the Calendar line; both come from columns
 * `loadLines` already selected for the names it printed.
 *
 * **Only ONE of the two provenance persons is bound.** The retired cell
 * preferred `approved_by_name` and fell back to `counted_by_name` — a single
 * cell answering two questions because it only had one slot. Two tracks would
 * half-blank each other, since a line is at exactly one stage. `counted_by` is
 * the bound one: it is present on every line past `pending`, and the person an
 * approver needs to see is whose count they are about to trust. `approved_by`
 * ships UNBOUND — the house form of the retired `tier: 'optional'` (see
 * `ready.ts`, `repair.ts`, `my-day.ts`) — so the fact stays sortable,
 * searchable and one Fields click away, and its STAMP is painted regardless.
 * Same ruling, same words, as `cycle-counts.created_by` one route up.
 *
 * **`tolerance` is a line fact here, not a campaign one.** The retired Δ cell
 * coloured itself against `campaign.variance_tol` — a value outside the row,
 * read through a closure the adapter contract does not have. The tolerance is
 * threaded into each line where the page builds it
 * (`cycle-count-line-row.ts`), so the gate is a real fact the operator can
 * read, sort and search, and out-of-tolerance is said in the state pill's WORD
 * rather than in a cell's colour.
 *
 * ## Not here, and deliberately
 *
 * `notes` is selected by `loadLines` and painted by nothing — no notes cell,
 * no tooltip, no row expansion ever existed. A fact nothing paints is not a
 * catalog entry; `cycle-count-lines.test.ts` fails the day it appears in a
 * `paths` here without a plane that paints it.
 */

import type { FieldCatalog } from '@/lib/tables/field-catalog/types';
import type { SlotLayout } from '@/lib/tables/slot-layout-core';

export const CYCLECOUNTLINES_FIELD_CATALOG: FieldCatalog = [
  { id: 'cycle-count-lines.bin', family: 'cycle-count-lines', label: 'Bin', displayType: 'id', slotKinds: ['identity', 'status', 'subtitle'], paths: { value: 'binName', fallback: 'binId' } },
  { id: 'cycle-count-lines.sku', family: 'cycle-count-lines', label: 'SKU', displayType: 'text', slotKinds: ['status', 'subtitle'], paths: { value: 'sku' } },
  { id: 'cycle-count-lines.expected', family: 'cycle-count-lines', label: 'Expected', displayType: 'number', slotKinds: ['status', 'subtitle'], paths: { value: 'expectedQty' } },
  { id: 'cycle-count-lines.counted', family: 'cycle-count-lines', label: 'Counted', displayType: 'number', slotKinds: ['status', 'subtitle'], paths: { value: 'countedQty' } },
  { id: 'cycle-count-lines.variance', family: 'cycle-count-lines', label: 'Δ', displayType: 'number', slotKinds: ['status', 'subtitle'], paths: { value: 'variance' } },
  { id: 'cycle-count-lines.status', family: 'cycle-count-lines', label: 'Status', displayType: 'tag', slotKinds: ['status', 'subtitle'], paths: { value: 'status' } },
  { id: 'cycle-count-lines.tolerance', family: 'cycle-count-lines', label: 'Tol', displayType: 'text', slotKinds: ['status', 'subtitle'], paths: { value: 'varianceTol' } },
  { id: 'cycle-count-lines.counted_by', family: 'cycle-count-lines', label: 'Counted by', displayType: 'person', slotKinds: ['status', 'subtitle'], paths: { display: 'countedByName', name: 'countedByName', value: 'countedByStaffId' } },
  { id: 'cycle-count-lines.counted_at', family: 'cycle-count-lines', label: 'Counted at', displayType: 'date', slotKinds: ['status', 'subtitle'], paths: { value: 'countedAt' } },
  { id: 'cycle-count-lines.approved_by', family: 'cycle-count-lines', label: 'Decided by', displayType: 'person', slotKinds: ['status', 'subtitle'], paths: { display: 'approvedByName', name: 'approvedByName', value: 'approvedByStaffId' } },
  { id: 'cycle-count-lines.approved_at', family: 'cycle-count-lines', label: 'Decided at', displayType: 'date', slotKinds: ['status', 'subtitle'], paths: { value: 'approvedAt' } },
];

/**
 * The PRODUCT default: the count ARITHMETIC plus who produced it — the four
 * data columns the retired flat array painted that the compound chrome does
 * not already own.
 *
 * FOUR status tracks is what this mount can afford. The skeleton mounts whole,
 * so `select · fulfillment · thumb · item · dates · state · status:1…4 ·
 * _fill` is exactly `MAX_DEFAULT_VISIBLE_TRACKS` (10); binding a fifth throws
 * in `parseTableDefinition` at module load.
 *
 * Six of the eleven facts are therefore painted by chrome the skeleton already
 * mounts, or ship unbound:
 *
 * - `bin` — the IDENTITY chip (`identityFieldId`), which is what the retired
 *   mono `bin_name ?? #bin_id` cell was.
 * - `sku` — the item cell's TITLE. A track repeating the title is noise. The
 *   retired cell wrapped it in a `<Link>` to `/inventory/health/sku/<sku>`;
 *   that is the view's `titleHref` now, so no cell carries an anchor.
 * - `status` — the state pill (adapter chrome). A bound duplicate would sit
 *   beside the pill saying the same word.
 * - `counted_at` / `approved_at` — the two DATES chrome lines.
 * - `approved_by` — unbound on purpose; see the catalog docblock.
 *
 * All six stay catalog FACTS, so their headers sort, the search box matches
 * them, and a staffer who wants `approved_by` as an explicit column binds it
 * from the Fields menu.
 *
 * `tolerance` is the bound SUBTITLE — the second line under the SKU, exactly
 * where the campaigns desk one route up puts the same fact under the campaign
 * name. A second line under a title is a subtitle, never a second track.
 *
 * `amountFieldId: null` — a bin count has no money fact.
 */
export const CYCLECOUNTLINES_PRODUCT_LAYOUT: SlotLayout = {
  morph: 'compound',
  identityFieldId: 'cycle-count-lines.bin',
  statusBindings: [
    { fieldId: 'cycle-count-lines.expected' },
    { fieldId: 'cycle-count-lines.counted' },
    { fieldId: 'cycle-count-lines.variance' },
    { fieldId: 'cycle-count-lines.counted_by' },
  ],
  subtitleBindings: [{ fieldId: 'cycle-count-lines.tolerance' }],
  amountFieldId: null,
};

export const CYCLECOUNTLINES_TABLE_LAYOUT_ID = 'cycle-count-lines';
