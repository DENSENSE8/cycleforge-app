/**
 * Audit-log field catalog — the bindable facts of ONE `audit_logs` row.
 *
 * Off `AdminTable` 2026-09-12 (Wave D). The retired desk painted FIVE
 * hand-written `AdminTableColumn` objects carrying JSX, and three of them were
 * two-line stacks — five columns, eight facts, no header sort, no Fields
 * picker and no org binding, because that engine never grew them.
 *
 * ## Where the eight facts landed
 *
 * | retired cell      | fact              | home on the compound row          |
 * |-------------------|-------------------|-----------------------------------|
 * | When              | `when`            | DATES chrome (day over clock)     |
 * | Actor (line 1)    | `actor`           | `status:1`, a PERSON face         |
 * | Actor (line 2)    | `actor_role`      | bound SUBTITLE                    |
 * | Source · Action 1 | `action`          | the row TITLE (item cell)         |
 * | Source · Action 2 | `source`          | bound SUBTITLE                    |
 * | Entity (line 1)   | `entity_type`     | the STATE pill                    |
 * | Entity (line 2)   | `entity_id`       | the IDENTITY handle               |
 * | IP                | `ip`              | `status:2`                        |
 *
 * Two notes on that table, because both are decisions rather than
 * transcription:
 *
 * **The header said "Source · Action"; the cell rendered ACTION over SOURCE.**
 * One of the two orders had to win. The RENDER order wins: what a reader scans
 * an audit log for is what happened, the source is where it happened, and the
 * retired cell already made that call by putting `action` on the bold line.
 * The Action header is now the item track's, and `source` is the line under
 * it — so the reversed header word order is gone rather than preserved.
 *
 * **The Entity cell splits across the pill and the handle, not title over
 * subtitle.** `entity_type` is a small closed vocabulary (`order`, `staff`,
 * `receiving_line`, …) — that is a pill, which is what the state track is for.
 * `entity_id` is the row's handle, and a compound row has exactly one identity
 * chip. The batch rule (primary → identity/title, secondary → subtitle) exists
 * to stop a family opening a second TRACK for one cell; neither of these is a
 * second track.
 *
 * ## Not here, and deliberately
 *
 * `metadata`, `before_data` and `after_data` are selected by the desk's query
 * and painted by nothing. The page docblock used to promise "expand a row to
 * see the before/after JSON"; that feature was never built, the docblock has
 * been corrected, and a fact nothing paints is not a catalog entry. When a
 * diff plane ships it mints its own fields — and `audit-log.test.ts` fails the
 * day one of those three names appears in a `paths` here without one.
 */

import type { FieldCatalog } from '@/lib/tables/field-catalog/types';
import type { SlotLayout } from '@/lib/tables/slot-layout-core';

export const AUDITLOG_FIELD_CATALOG: FieldCatalog = [
  { id: 'audit-log.entity_id', family: 'audit-log', label: 'Entity id', displayType: 'id', slotKinds: ['identity', 'status', 'subtitle'], paths: { value: 'entity_id' } },
  { id: 'audit-log.entity_type', family: 'audit-log', label: 'Entity', displayType: 'tag', slotKinds: ['status', 'subtitle'], paths: { value: 'entity_type' } },
  { id: 'audit-log.action', family: 'audit-log', label: 'Action', displayType: 'text', slotKinds: ['status', 'subtitle'], paths: { value: 'action' } },
  { id: 'audit-log.source', family: 'audit-log', label: 'Source', displayType: 'text', slotKinds: ['status', 'subtitle'], paths: { value: 'source' } },
  { id: 'audit-log.actor', family: 'audit-log', label: 'Actor', displayType: 'person', slotKinds: ['status', 'subtitle'], paths: { display: 'actor_name', name: 'actor_name', value: 'actor_staff_id' } },
  { id: 'audit-log.actor_role', family: 'audit-log', label: 'Role', displayType: 'tag', slotKinds: ['status', 'subtitle'], paths: { value: 'actor_role' } },
  { id: 'audit-log.when', family: 'audit-log', label: 'When', displayType: 'date', slotKinds: ['status', 'subtitle'], paths: { value: 'created_at' } },
  { id: 'audit-log.ip', family: 'audit-log', label: 'IP', displayType: 'text', slotKinds: ['status', 'subtitle'], paths: { value: 'ip_address' } },
];

/**
 * The PRODUCT default: WHO did it and from WHERE, as the two tracks.
 *
 * The skeleton mounts WHOLE (no geometry cut — `COMPOUND_SKELETON_FILTER_DEBT`
 * is documented shrink-only), so `fulfillment · thumb · item · dates · state ·
 * status:N · _fill` leaves FOUR status slots under
 * `MAX_DEFAULT_VISIBLE_TRACKS`. This desk needs only two of them, because five
 * of the eight facts are painted by chrome the skeleton already mounts:
 *
 * - `when` — the DATES chrome. Hash line = the civil day, Calendar line = the
 *   clock face with seconds, which is the precision the retired `fmtTs` cell
 *   had and an audit log cannot lose. A bound track beside that chrome would
 *   print the same instant twice.
 * - `action` — the item cell's TITLE. A track repeating the title is noise.
 * - `entity_type` — the state pill (adapter chrome).
 * - `entity_id` — the identity chip (`identityFieldId`).
 * - `source` / `actor_role` — the subtitle line, `source · role`, painted
 *   INSIDE the item cell. Never a second track for a cell's second line.
 *
 * All five stay catalog FACTS, so their headers sort and the search box
 * matches them, and a staffer who wants `when` or `entity_type` as an explicit
 * column has two free slots to bind it into — the house form of the retired
 * `tier: 'optional'` (see `ready.ts`, `repair.ts`, `my-day.ts`).
 *
 * `amountFieldId: null` — an audit row has no money fact.
 */
export const AUDITLOG_PRODUCT_LAYOUT: SlotLayout = {
  morph: 'compound',
  identityFieldId: 'audit-log.entity_id',
  statusBindings: [
    { fieldId: 'audit-log.actor' },
    { fieldId: 'audit-log.ip' },
  ],
  subtitleBindings: [
    { fieldId: 'audit-log.source' },
    { fieldId: 'audit-log.actor_role' },
  ],
  amountFieldId: null,
};

export const AUDITLOG_TABLE_LAYOUT_ID = 'audit-log';
