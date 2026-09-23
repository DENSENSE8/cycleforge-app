/**
 * Operator session laws — one id, one grep, one eval/CI hook.
 *
 * These are the rulings from recent walks that still lived as chat weight:
 * Dates stays Dates, inbound is not an Amount fork, Orders is not a different
 * table, overlay is not a display cohort. Paint-law prose is not an audit.
 * Adding a row here without a tripwire match is a comment; the test iterates
 * every id.
 *
 * Agents do not invent Operator verdicts. Grow this list only from a session
 * ruling that already landed in engine source.
 */

export type SessionLawEval = 'slot-table' | 'shortcuts' | 'station';

export type SlotTableSessionLaw = {
  id: string;
  date: string;
  ruling: string;
  file: string;
  /** Source regex (compiled in the tripwire). */
  mustMatch?: string;
  mustNotMatch?: string;
  /** Strip comments before grepping so the law file can name the forbidden string. */
  codeOnly?: boolean;
  eval: SessionLawEval;
};

export const SLOT_TABLE_SESSION_LAWS: readonly SlotTableSessionLaw[] = [
  {
    id: 'dates.header-is-dates',
    date: '2026-09-05',
    ruling:
      'Do not rename the Dates column per page. The header is the slot; the adapter names the fact on the top line.',
    file: 'src/components/tables/compound/compound-columns.ts',
    mustMatch: "gridLabel: 'Dates'",
    eval: 'slot-table',
  },
  {
    id: 'dates.due-hover-due-date',
    date: '2026-09-05',
    ruling: 'DATES bottom line hover is Due date, not Ship by date. CSV/import headers may still say Ship by.',
    file: 'src/components/tables/compound/compound-row-model.ts',
    mustMatch: "export const COMPOUND_DATES_DUE_HOVER = 'Due date'",
    eval: 'slot-table',
  },
  {
    // Gate: importers = slot-table session-law tripwire + eval:cohort.
    // API: none. Schema: SessionLaw id rename. User: "implement 1-4" Start date
    // agnosticism — never Order date on non-order peers.
    id: 'dates.start-hover-start-date',
    date: '2026-09-11',
    ruling:
      'DATES top line hover default is Start date (portable), not Order date. Hash glyph. Family tips that lead with Last seen / Enrolled / Ordered / … own the chip. startedHover is the Hash SoT parallel to delayTip.',
    file: 'src/components/tables/compound/compound-row-model.ts',
    mustMatch: "export const COMPOUND_DATES_START_HOVER = 'Start date'",
    eval: 'slot-table',
  },
  {
    id: 'dates.hover-helper',
    date: '2026-09-05',
    ruling: 'Hover names the line through compoundDatesHoverLabel so MorphCursorLayer carries the chip.',
    file: 'src/components/tables/compound/compound-row-model.ts',
    mustMatch: 'export function compoundDatesHoverLabel',
    eval: 'slot-table',
  },
  {
    id: 'line-money.no-amount-track',
    date: '2026-09-05',
    ruling:
      'COMPOUND_COLUMN_KEYS has no amount track. Line price lives under the Item title after qty on every PRODUCT_TABLES peer.',
    file: 'src/components/tables/compound/compound-columns.ts',
    mustMatch:
      "'select',[\\s\\n]*'fulfillment',[\\s\\n]*'thumb',[\\s\\n]*'item',[\\s\\n]*'dates',[\\s\\n]*'state',[\\s\\n]*'_fill'",
    mustNotMatch: "'amount'",
    codeOnly: true,
    eval: 'slot-table',
  },
  {
    id: 'line-money.suffix-amount-or-price',
    date: '2026-09-05',
    ruling:
      'Line money is `{family}.amount` or `{family}.price`. Occupancy (.stock) and catalog.cost are not line money.',
    file: 'src/lib/tables/slot-table-line-money.ts',
    mustMatch: "fieldId.endsWith('.amount') || fieldId.endsWith('.price')",
    eval: 'slot-table',
  },
  {
    id: 'line-money.inbound-incoming-price',
    date: '2026-09-05',
    ruling: 'Incoming catalogs incoming.price as subtitle money. Do not keep an inbound Amount column.',
    file: 'src/lib/tables/field-catalog/incoming.ts',
    mustMatch: "id: 'incoming.price'",
    eval: 'slot-table',
  },
  {
    id: 'line-money.inbound-receiving-price',
    date: '2026-09-05',
    ruling: 'Receiving catalogs receiving.price as subtitle money — same engine as outbound orders.amount.',
    file: 'src/lib/tables/field-catalog/receiving.ts',
    mustMatch: "id: 'receiving.price'",
    eval: 'slot-table',
  },
  {
    id: 'engine.no-orders-only-amount-drop',
    date: '2026-09-05',
    ruling:
      'Orders is not a different table. Do not filter amount off the Orders mount while inbound still paints an Amount column.',
    file: 'src/lib/dashboard-order-row-layout.ts',
    mustNotMatch: "key !== 'amount'",
    codeOnly: true,
    eval: 'slot-table',
  },
  {
    id: 'header.no-frozen-sort-prop',
    date: '2026-09-04',
    ruling:
      'Outbound DataTable lanes share ?sort= via useQueueDisplaySort. Passing sort= froze Shipped / Review / Staged headers.',
    file: 'src/lib/tables/slot-table-cohort.test.ts',
    mustMatch: 'must not freeze DataTable sort',
    eval: 'slot-table',
  },
  {
    id: 'morphing.not-queueMode-gated',
    date: '2026-09-04',
    ruling:
      'Selecting a row always opens the left Morphing menu on To-ship AND Shipped. queueMode must not disable it.',
    file: 'src/lib/tables/slot-table-cohort.test.ts',
    mustMatch: 'Morphing must not gate on queueMode === fulfillment',
    eval: 'slot-table',
  },
  {
    id: 'overlay.no-display-cohort',
    date: '2026-09-04',
    ruling:
      'Display eval is slot-table only. eval:cohort overlay stays refused. Station shell is eval:station <id>.',
    file: 'tools/eval-ledger/run-cohort-eval.mjs',
    mustMatch: 'overlay is not a display cohort',
    eval: 'station',
  },
  {
    id: 'overlay.idle-helper-owns-stack',
    date: '2026-09-04',
    ruling:
      'Do not delete visibility / zIndex.panel to silence critique. The idle overlay helper owns browse hide and pane stack.',
    file: 'src/design-system/motion/idle-overlay.ts',
    mustMatch: 'zIndex.panel',
    eval: 'station',
  },
  {
    id: 'engine.skeleton-filter-ratchet',
    date: '2026-09-05',
    ruling:
      'A new mount must not .filter Dates/select/thumb off compoundColumnsFor. Today\'s seven admin desks are named COMPOUND_SKELETON_FILTER_DEBT — shrink-only.',
    file: 'src/lib/tables/table-engine-law.ts',
    mustMatch: 'export const COMPOUND_SKELETON_FILTER_DEBT',
    eval: 'slot-table',
  },
  {
    id: 'chrome.action-row-below-header',
    date: '2026-09-10',
    ruling:
      'Row verbs sit below the column header in an empty:hidden in-flow slot. Never cover the column labels.',
    file: 'src/design-system/components/grid/LedgerGrid.tsx',
    mustMatch: 'empty:hidden',
    eval: 'slot-table',
  },
  {
    id: 'chrome.notes-inline-one-row',
    date: '2026-09-10',
    ruling:
      'Desktop Notes morphs the action row into a one-row composer. BottomSheet only on /m/ URLs.',
    file: 'src/components/outbound/orders/to-ship/MorphingRowActionMenu.tsx',
    mustMatch: 'isMorphingMobileUrl',
    eval: 'slot-table',
  },
  {
    id: 'chrome.oos-shortage-identity',
    date: '2026-09-10',
    ruling:
      'Out of stock is shortage identity (SKU/kit part), not a note. Hover is the product card. Toast View Pending → SHIPPING_SHORTAGE_PATH. Kit components come from sku_relationships (then sku_kit_parts) — never Zoho -P parsing.',
    file: 'src/components/outbound/orders/to-ship/MorphingRowActionMenu.tsx',
    mustMatch: 'composition',
    eval: 'slot-table',
  },
  {
    id: 'staff.combo-is-assignee-combobox',
    date: '2026-09-11',
    ruling:
      'Every staff combobox is AssigneeCombobox via StageStaffAssignPopover. Rows paint StaffAvatar + name. Never SearchableSelectField for people.',
    file: 'src/components/tables/compound/StageStaffAssignPopover.tsx',
    mustMatch: 'StaffAvatar',
    eval: 'slot-table',
  },
  {
    id: 'staff.morphing-scan-out-uses-stage-popover',
    date: '2026-09-11',
    ruling:
      'Scan-out staff on the Morphing action strip is StageStaffAssignPopover, not SearchableSelectField.',
    file: 'src/components/outbound/orders/to-ship/MorphingRowActionMenu.tsx',
    mustMatch: 'StageStaffAssignPopover',
    mustNotMatch: 'SearchableSelectField',
    eval: 'slot-table',
  },
] as const;

export type SlotTableSessionLawId = (typeof SLOT_TABLE_SESSION_LAWS)[number]['id'];
