# PROPOSE — Composer action registry, Order Management scope

**Status: PROPOSE ONLY.** No implement until FireBall190 go.
Date: 2026-09-03. Epic: CYC-34. Module SoT: CYC-82 (OM ingest → one pending desk).
Parent narrative: the One AI Composer architecture note (2026-09-03).
Read [`LAWS.md`](LAWS.md) and [`HANDOFF-ai-first.md`](HANDOFF-ai-first.md) first.

This file maps every Order Management action in the architecture note (§4.2
import/export and §4.3 Order Management) to what backs it in the repo today.
It is scoped to OM on purpose: every other §4 family is parked behind OM at
100% by the note's own build order, and registering them now is inventory,
not ROI.

Every row was checked against the code on 2026-09-03. A row marked MISSING
means no tool, table, or writer exists for it; UNKNOWN means the business
rule is not named and must not be invented.

## 0. What already exists (do not rebuild)

| You will want | It already is |
|---|---|
| A tool registry the model composes | `src/lib/assistant/tools/index.ts` — ~30 org-scoped read tools, one write chokepoint (`propose_mutation`), one undo (`revert_mutation`). Org always from the authenticated ctx. |
| A server agent loop | `src/lib/assistant/agent-loop.ts` — Claude tool-use loop behind `POST /api/assistant/chat`, hard turn cap, client UI tools forwarded to the browser. |
| Client UI tools | `navigate`, `highlight`, `focus_node`, `set_lens`, `set_zoom` (canvas). |
| A gated AI write path | `applyAgentMutation` with trust classes `auto` / `draft_scoped` / `review`; kinds live in `src/lib/surfaces/registry.ts` `MUTATION_KINDS`. |
| The one order writer | `ingestCanonicalOrders` (`src/lib/orders/ingest-canonical-orders.ts`) — every source normalises to `CanonicalOrderLine[]` and lands here. Owns shipment links, catalog identity, customer match, duplicate collapse, the deadline `work_assignments` row, cache bust, realtime publish. |
| The Sheets reader | `src/lib/jobs/google-sheets-transfer-orders.ts` — reads the tab, binds headers, feeds the writer. Ecwid feeds the same writer. |
| Sheet rows as decisions | `src/lib/orders-sync/sheets-inline-triage.ts` — synced sheet rows land on the staging LedgerGrid with approve / reject. A sheet is a person typing, not an authority. |
| Missing-item-number queue | `src/lib/inventory/order-import-exceptions.ts` — resolve re-runs the exact import path; never hand-builds an order. |
| Auto-cage of unpaired rows | `src/lib/orders/auto-cage.ts` |
| Product tables the Composer can point at | `PRODUCT_TABLES` in `src/lib/tables/table-catalog.ts`: `orders` (To-ship), `orders-import` (Order import staging), `import-exception` (Review · Missing item number), `catalog-link` (Review · Listing match), `tracking-exceptions`, `tasks`, `my-day`, `sessions`. |
| Permissions | `orders.view`, `orders.create`, `orders.import`, `orders.void` in `permission-registry.ts`. |

## 1. Gate legend

Same gates as the architecture note. The repo's trust classes map onto them:

| Gate | Repo trust class today | Meaning |
|---|---|---|
| GREEN | read tool | Search, read, summarise, draft, emit table |
| YELLOW | `auto` or `review` mutation kind | Internal write to the org DB, import into org DB, document pairing |
| RED | no class exists; confirm card in Composer before any tool runs | Send, publish, money, delete, permissions, customer contact |

Note: no `order.*` mutation kind exists in `MUTATION_KINDS` today. Every
YELLOW/RED order write below is therefore MISSING at the AI layer even where a
non-AI route already does the write.

## 2. Registry — §4.2 Import

| # | Action (note wording) | Gate | Backing today | Status | Note |
|---|---|---|---|---|---|
| I1 | Daily Order List (Sheet_MM_DD_YYYY) → import | YELLOW | `google-sheets-transfer-orders` job → `ingestCanonicalOrders`; staging via `sheets-inline-triage` | EXISTS (job) / MISSING (as a Composer tool) | Import already runs. Composer needs a tool name that triggers the job for one day tab and returns the writer's result shape. |
| I2 | Per-day import report (imported + assigned + exact timestamps + backlog) | GREEN | none | MISSING | No sync-run log table exists. Derivable from `orders.createdAt` and `work_assignments.assignedAt`, but "imported on day X" is not durably recorded per run. See §5 Q1. |
| I3 | Pending Orders sheet reconcile (backup DONE / blank) | GREEN read, YELLOW apply | `sheets-inline-triage` approve / reject | PARTIAL | Triage decision exists. DONE-vs-blank as a stage stand-in is not modelled; the live website enum is UNKNOWN (note §8). |
| I4 | Marketplace order pull by date range | YELLOW | Ecwid via the same writer; eBay lane imports 30 days shipped (`auto-cage.ts`) | PARTIAL | Amazon pull is not in the writer's source list. Date-range parameter not exposed. |
| I5 | Tracking orphan attach | YELLOW | `tracking-exceptions` table; `linkShipment` in the writer | PARTIAL | Table exists for reading. No AI mutation kind for attach. |
| I6 | Unmatched / no_item_number exception queues | GREEN read, YELLOW resolve | `order-import-exceptions.ts`; tables `import-exception`, `catalog-link` | EXISTS (read + non-AI resolve) | Resolve re-runs the real import path. Expose as a tool; do not add a second resolver. |
| I7 | Amazon FBA inventory CSV, FBA barcode PDF library, manuals tree, PO / return CSV, serial workbooks, staff / clock / printer map, photo batches | — | — | OUT OF SCOPE | Slice 2+ per build order. Listed so nobody re-adds them here. |

## 3. Registry — §4.2 Export

| # | Action | Gate | Backing today | Status | Note |
|---|---|---|---|---|---|
| E1 | Pending desk CSV / EOD pending from desk | GREEN | `src/lib/tables/export` exists for product tables | PARTIAL | Export path exists for tables. "EOD pending" must count desk rows, not non-DONE title counts (note §4.3). |
| E2 | Composer action audit log | GREEN | `get_mutation_history` (`agent_mutations`) | EXISTS | Already answers "what did you change". |
| E3 | FBA plan, return CSV, AFN snapshot, tracking pack, document zip | — | — | OUT OF SCOPE | Slice 2+. |

## 4. Registry — §4.3 Order Management

| # | Action | Gate | Backing today | Status | Note |
|---|---|---|---|---|---|
| O1 | Pull channel orders → one pending desk (stage + owner + exception) | GREEN | `orders` table (To-ship); `get_order_lookup`; `hybrid_entity_search` | PARTIAL | Table and lookups exist. No single "pending desk" read that returns stage + owner + exception per row. |
| O2 | Assign / reassign / wave / priority | YELLOW | `work_assignments` (`assigneeStaffId`, `priority`, `deadlineAt`); `get_assignments` read | PARTIAL | Read exists. No `work_assignment.*` mutation kind. |
| O3 | Stages received → reviewed → assigned → picking → testing? → packing → ready → shipped → exception | — | `orders.status` is free text with `statusHistory`; `'shipped'` and `'hold'` are the only values the code branches on | UNKNOWN | Do not invent the enum. The note lists the target; the live website status is an open question (§8). |
| O4 | Open / close / reopen | YELLOW | none at AI layer | MISSING | Depends on O3. |
| O5 | Attach / clear tracking; carrier notes (SurePost / RTS) | YELLOW | `linkShipment`, `tracking-exceptions` | PARTIAL | Same as I5. Carrier notes have no field; `orders.notes` is free text. |
| O6 | Exceptions: incomplete address, wait-on-customer, HOLD, OOS, CANCEL, ship-instructions verify, CS hold, wrong-item leftover | GREEN read, YELLOW set | `order-row-flags.ts` (`hold` exists); `orders.isOutOfStock`; `isUrgent` | PARTIAL | HOLD and OOS have columns. The rest are not modelled. Reason tags are a UNKNOWN list. |
| O7 | Repair / info@ rows first-class (#5010 class) | GREEN | `repair` table; `resolve_support_ticket`, `list_support_followups` | PARTIAL | Repairs are searchable. Whether they belong on the pending desk is open (§8). |
| O8 | Kit / multi-line expand; merge / split channel IDs | YELLOW | writer's duplicate collapse | PARTIAL | Collapse exists inside ingest. No explicit merge / split tool. |
| O9 | EOD pending from desk | GREEN | see E1 | PARTIAL | |
| O10 | Ship-to edit | RED | `customers` table; no AI write | MISSING | Confirm card required. No RED class exists in `applyAgentMutation`; RED must stay in the Composer, not the mutation registry. |
| O11 | Draft customer contact | GREEN draft, RED send | agents already draft (note §6 row 6) | PARTIAL | Send is out of scope for OM. |
| O12 | Trace one order end to end | GREEN | `get_operations_journey` | EXISTS | |
| O13 | Packer counts for EOD (Tuan / Thuy) | GREEN | `get_packing_kpi` | EXISTS | Kai is not a packer (note §4.11); the tool takes a day, not a staff filter. |

## 5. The gaps that decide the first slice

Ordered by how much of the table above each one unlocks.

1. **`emit_table` client UI tool (MISSING, keystone).** Nothing in the loop can
   put a DataTable spec into the viewport. The note's §5 output contract has no
   carrier. Proposed shape: `{ tableId: PRODUCT_TABLES id, columns?, sort?,
   filters?, rowActions?, bulkActions? }`, bound to the slot-table engine so
   the viewport is the existing table, not a new page. Row and bulk actions
   name tools from this registry. Coordinate with the companion-composer lane
   (`PLAN-companion-composer.md`, BUILDING as of 2026-09-03) before any code.
2. **Per-day import report (I2, MISSING).** Needs a durable per-run record
   (day tab, started, finished, rows read, rows written, rows caged, rows
   assigned). Q1 below decides whether that is a new table or a derivation.
3. **Pending desk read (O1, PARTIAL).** One GREEN tool returning stage, owner,
   exception per row, backed by `orders` joined to `work_assignments`. Blocked
   on O3 for the stage column; can ship with `status` passed through as text.
4. **`work_assignment.*` mutation kinds (O2, MISSING).** Assign / reassign /
   priority as YELLOW `review` kinds. Reuses the existing chokepoint; no new
   write path.
5. **`order.link_tracking` mutation kind (I5 / O5).** Wraps `linkShipment`.

Everything else in §2–§4 is either already served or waits on an UNKNOWN.

## 6. Questions this registry cannot answer (do not invent)

| # | Question | Blocks |
|---|---|---|
| Q1 | Is "imported on day X" the sheet tab date, the job run timestamp, or `orders.createdAt`? The three disagree when a tab is re-synced. | I2 |
| Q2 | Live website Order UI status enum and buttons (note §8, unchanged). | O3, O4, I3 |
| Q3 | Exception reason tag list as used today (beyond HOLD / OOS). | O6 |
| Q4 | Do #5010-class repairs belong on the Pending Orders sheet? (note §8) | O7 |
| Q5 | Which staff are assignable on the pending desk, and does Lien's desk own assignment or does the Composer? | O2 |

## 7. Non-goals for this registry

- No code. No new routes. No new mutation kinds until go.
- No second write path beside `ingestCanonicalOrders` or `applyAgentMutation`.
- No RED class inside `applyAgentMutation`; RED confirm lives in the Composer.
- No stage enum, reason list, or website status invented to fill a row.
- No families beyond §4.2 / §4.3.

## 8. Next after go (pick one)

- Implement §5 item 1 (`emit_table`) against the `orders` table only, with
  zero row actions, and prove the loop can land a filtered To-ship view.
- Answer Q1, then implement §5 item 2 as a GREEN read tool.
- Paste the OM contract onto CYC-82 (still separate from this file).

End of file.
