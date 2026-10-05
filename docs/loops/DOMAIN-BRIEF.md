# CycleForge domain brief — read before you write a line

This is not a new-goods web store. Any instinct that starts "a SKU has a quantity, an order
decrements it" is wrong here. Every rule below names the file that enforces it; read that file
before you change behaviour near it. Laws beat this brief; this brief beats your defaults.

## 1. The business in 10 lines

1. Used / refurbished electronics. A **serial unit** is one physical box with its own serial,
   condition grade, test result, location and history — non-fungible. Two units of one SKU are
   not interchangeable (`serial_units`, `src/lib/migrations/2026-04-10_create_serial_units.sql`).
2. Unit lifecycle is a state machine (`RECEIVED → TRIAGED/IN_TEST → IN_REPAIR ↔ REPAIR_DONE →
   TESTED/GRADED → STOCKED → ALLOCATED → PICKED → PACKED → … → SHIPPED → RETURNED`):
   `SERIAL_STATES` + `transition()` in `src/lib/inventory/state-machine.ts`.
3. Flow: arrival scan (`/m/scan`, pair to any location `/m/r/[id]/place`) → unbox (`/unbox`, `/m/unbox`)
   → test / Quality control (`/m/qc`, test results in `tech_serial_numbers`) → condition grade
   (`serial_units.condition_grade`) → repair loop (`/repair`, `/m/repair-scan`) → put-away
   (`/m/stock`) → allocation / shortage (`/shipping/shortage`) → pick by serial (`/m/pick`,
   `/pick`) → pack (`/pack`) → scan-out (`/shipping/scan-out`, `/m/id/scan-out/[orderId]`).
4. Every floor event is a row in `station_activity_logs` (`ARRIVAL_SCANNED`, `UNBOX_COMPLETED`,
   `QC_RESULT_RECORDED`, `PICK_SCANNED`, `SERIAL_ADDED`, `PACK_COMPLETED`, `SHIP_CONFIRM`, …:
   `STATION_FEED_ACTIVITY_JOB`, `src/lib/station-feed/event-map.ts`) plus `ops_events` /
   `mobile_scan_events`.
5. Inbound is not only purchase orders: `PO`, `RETURN`, `TRADE_IN`, `PICKUP` (+ `REPAIR`
   drop-offs) all land as inbound orders (`AUTHORED_INBOUND_ORDER_TYPES`,
   `src/lib/inbound/inbound-order-draft.ts`). Returns re-enter as units (`SHIPPED → RETURNED →
   TRIAGED/STOCKED/RMA/SCRAPPED`); walk-in repairs land via `receiveWalkInRepairInTx`
   (`src/lib/repair/walk-in-receiving.ts`).
6. Sellable = `STOCKED` in a pickable location, never in a STAGING / DOCK / QUARANTINE / DAMAGED /
   RETURNS / RECEIVING bin (`pickableSerialUnitsWhereClause`, `src/lib/inventory/pickability.ts`).
7. Prepack is per physical unit (`prepackHref`: `/m/prepack` on the phone, QC labels
   `?task=prepack` on the desk). The unit (OEM serial or `unit_uid`) is the key; its product comes
   from the unit and a mismatch is refused. Condition (`condition_grade`) and refurbishment
   provenance (`serial_units.refurb_provenance`, Amazon Renewed is provenance, never a grade) are
   separate. Finish requires typed unit evidence (photo_aspect serial / condition / included on
   `prepack` photos), kit Included / Missing (`serial_unit_prepack_contents`), and stores the unit
   through the PUTAWAY / MOVED ledger. FBA units then get FNSKU labels at the Print station
   (`PRINT_STATION_PATHS.fnskuLabels`; tables `fba_fnskus`, `fba_shipments`).
8. Channels: Amazon, eBay (several stores), Walmart, Ecwid, FBA (`return_platform_enum`,
   `src/lib/migrations/0000_baseline_through_2026-03.sql`) plus a walk-in counter. Marketplace
   text is a transport, never identity.
9. Identity: CycleForge's own `sku_catalog` governs title, SKU and photo; Zoho is a demoted
   external fact (`catalog_external_ids`) — `src/lib/sku/sku-identity-law.ts`.
10. Operators work on phones and scan guns first; desks are denser views of the same jobs
    (`docs/mobile-first/SURFACE_LAW.md` §1).

## 2. What a generic e-commerce agent gets wrong here

Format: wrong instinct → the law → where it is enforced.

1. **"Allocate = decrement on-hand by 1."** → An order is bound to specific serial units:
   `allocateOrder` (`src/lib/inventory/allocate.ts`) allocates pickable `STOCKED` units (optionally
   by `conditionGrade`); a shortage earmarks a PO (`earmarkPoForReplenishmentRequest`) and clears
   by binding arriving unit ids (`allocateShortageUnits`, `src/lib/orders/shortage-inbound.ts`).
   Never a bare quantity counter.
2. **"Scan the SKU/UPC barcode to pick."** → A pick scan must name exactly one unit (serial,
   `unit_uid`, `U-{id}`) or one sealed package (`KIT-…`, naming each member); a label for a
   different box is refused, never swapped: `unitsForScan` / `wrongUnitLabelRefusal`
   (`src/lib/picking/pick-scan-unit.ts`), then
   `linkPickedSerialToOrder` (`src/lib/picking/pick-serial-link.ts`).
3. **"`UPDATE serial_units SET current_status = …`."** → Every status change goes through
   `transition()` / pre-flight `guard()` (`src/lib/inventory/state-machine.ts`), which records the
   inventory event. Disallowed moves are refused there, not re-decided in your route.
4. **"Condition is a product attribute."** → Condition is per unit (`serial_units.condition_grade`;
   history in `serial_unit_condition_history`). Grades: `CONDITION_GRADES` (`BRAND_NEW`,
   `LIKE_NEW`, `REFURBISHED`, `USED_A/B/C`, `PARTS`); marketplace strings map through
   `resolveConditionGrade` (`src/lib/conditions.ts`). The picker is `LedgerCondition`
   (`src/components/outbound/orders/outbound-orders-ledger-editors.tsx`), never a hand-rolled select.
5. **"Show the marketplace / Zoho title."** → One SKU, one title, one photo. Read titles through
   `resolveSkuIdentityTitle`, join with `SKU_CATALOG_JOIN_ON_SQL` (exact + org-scoped, never
   `similarity()`); marketplace text lives in `sku_platform_ids.display_name`. Audit:
   `auditSkuIdentitySource`, refusal text `SKU_IDENTITY_REFUSAL` (`src/lib/sku/sku-identity-law.ts`).
6. **"Insert the PO / tracking / carton rows directly."** → Inbound has ONE writer:
   `InboundOrderDraft` → `ingestInboundOrder` (`src/lib/inbound/ingest-inbound-order.ts`), one
   transaction for header, lines, cartons, tracking and ledger. Never write `receiving_lines` /
   `receiving_carton` / tracking tables from a new route.
7. **"Put filters, sort, date and status chips above the table."** → Every control that changes
   WHICH records show or IN WHAT ORDER is declared in `NAV_PAGE_DECLS`
   (`src/lib/nav/context/pages.ts`) and painted by the left contextual sidebar; facets in
   `NAV_FACET_GROUPS` (`src/lib/nav/facets/contexts.ts`). `DataTable`'s `sheetFind`, `filter`,
   `sortMenu`, `views`, `dateMenu` are retired. No body exception: the Live feed's date window
   was retired 2026-10-05 (the board is live, always today).
   Law: `.omp/rules/sidebar-controls-contract.md`. Mobile (`src/app/m/**`) is exempt pending a ruling.
8. **"`id.slice(-8)` for a short id."** → In lists, identifiers show their last 8 via
   `getLast8` / `getLast8Serial` (`src/lib/copy-chip-format.ts`) painted by `CopyChip`
   (`src/components/ui/CopyChip.tsx`); record bodies keep the full id; copy is always the full
   value; scan / typed-tail matching uses `normalizeTrackingLast8` / `orderTrackingMatchKeys`
   (`src/lib/tracking-format.ts`). Law: `.omp/rules/identifier-last8-contract.md`.
9. **"Type the URL string."** → Every registered URL comes from `src/lib/nav/route-tree.ts`:
   `WAREHOUSE_PATHS`, `QUALITY_CONTROL_PATHS`, `PREPACK_PATHS`, `SUPPORT_PATHS`, builders
   `locationPath`, `containerPath`, `supportHref`, reverse lookup `routeForPath`. A new page is a
   new `ROUTE_TREE` node. Gate: `scripts/route-tree-guard.ts`; rule `.omp/rules/route-literals.md`.
10. **"Use the standard WMS / helpdesk word."** → The UI paints only the canonical term (§3).
    Rooms never Zone; a Tote is a container, never an LPN and never a location; LPN is Receiving's
    R-plate; Customer never Account; Support item never Ticket. Check a word with `lookupTerm`
    (`VOCABULARY`, `src/lib/nav/route-tree.ts`).
11. **"Build the desktop page, squeeze it onto phones later."** → Every operator verb must be
    completable on `/m/*` first; desks add density after (`docs/mobile-first/SURFACE_LAW.md` §1, §3).
    Mobile code lives in `src/components/mobile/**` / `src/app/m/**`; mobile and desktop
    components never import each other (`ARCHITECTURE.md` "Component split (binding)").
    The primary record of a job opens as a full-screen hub (`DetailHubScreen`), never a modal
    or sheet (SURFACE_LAW §7). There is no `/m/pack` queue — do not recreate it (§8).
12. **"A plain `<button>` / `<input>` / `<select>` with Tailwind px and hex."** → Compose
    `Button` / `IconButton` / `TextField` / `DropdownMenu` from `src/design-system/primitives/`;
    phone bottom verbs are `DetailDock` (`src/design-system/components/DetailDock.tsx`). No
    `text-[Npx]`, `#hex`, `z-[N]`, `style={{…}}`; look up tokens with
    `node tools/design-mcp/ds.mjs tokens <axis>`. Rules: `.omp/rules/ds-raw-elements.md`,
    `.omp/rules/ds-token-literals.md`.
13. **"`<input type="date">` in a table cell."** → Ship-by / any date-in-a-cell is
    `DateRangePickerField variant="compact"`; filter ranges are `variant="range"`
    (`src/design-system/components/DateRangePickerField.tsx`). Never `InlineEditableValue` for a date.
14. **"A searchable select of staff names."** → People pickers are `AssigneeCombobox`
    (`src/design-system/components/AssigneeCombobox.tsx`) mounted via `StageStaffAssignPopover`
    (`src/components/staff-assign/StageStaffAssignPopover.tsx`) — avatar + name, never
    `SearchableSelectField`.
15. **"A scan station is a search box with mode tabs; save, then repaint."** → The station mouth
    is `StationComposerHost` (`src/components/composer/StationComposerHost.tsx`), never
    `OmnichannelComposerDock` alone; `showModeRow` is always on (`false` is not on the type).
    Writes are optimistic — the UI changes before the server answers — via `useOptimisticMutation`
    (`src/lib/optimistic/useOptimisticMutation.ts`).

## 3. Vocabulary (copied from `VOCABULARY`, `src/lib/nav/route-tree.ts`)

The UI paints the canonical label. Banned words never stand in for it in nav labels or new UI copy.

| Canonical (plural) | Meaning | Banned |
|---|---|---|
| Customer (Customers) | Buyer identity + contact, channel identities, full order history | account (as the customer record name); contact (as the customer record name) |
| Quality control | Testing workflow for returned, repaired and newly unboxed serialized units | QC (as a navigation label); testing (as the page name) |
| Inbound | Scan direction for packages arriving at the door | In (as the scan direction); receive (as the scan direction) |
| Outbound | Scan direction for packages leaving the building | Out (as the scan direction); scan out (as the direction name) |
| Warehouse | Lane for the building and everything stored in it | inventory (as a lane name) |
| Stock | One SKU's quantity at one location ("on hand" is the number) | quant; inventory row; bin contents |
| Room (Rooms) | Top of the address: Room › Aisle › Bay › Level › Position | zone; area; storage type |
| Aisle (Aisles) | A row of bays inside a room | row |
| Bay (Bays) | One section of fixed racking in an aisle | rack (for fixed racking); section |
| Level (Levels) | Shelf height inside a bay | shelf (for fixed racking) — "Shelf" only for a movable rack's tiers (RK12-3) |
| Position (Positions) | The slot on a level | slot; spot |
| Location (Locations) | Any scannable address stock can sit at (C0310300, RK12-3, free-written) | bin; storage bin; slot |
| Rack (Racks) | A MOVABLE rack (RK12) whose shelves are locations; fixed racking is bays | bay racking; movable (as a label) |
| Tote (Containers) | H-#### handling unit: holds units, moves, is never itself a location | LPN (for a tote); licence-plated box; handling unit (in UI copy) |
| LPN (LPNs) | License plate number: the R-* plate Receiving puts on an arriving carton | licence (British spelling); carton (as the record name — pending owner ruling) |
| Location labels | Stickers for a location, bay or movable rack | labels (unqualified); bin tags |
| Print station (Print stations) | A computer the org sends label / document jobs to; prints silently | workstation; print server |
| Support item (Support items) | One local customer conversation or internal record; Zendesk / eBay / Amazon / Ecwid / email / phone / walk-in are transports | ticket (as the Support record name); case (as the Support record name); Zendesk ticket (as the record name); Update ticket (as a customer-visible action) |
| Internal record (Internal records) | A Support item not for a customer: staff notes only, never a customer send | internal ticket; private ticket; note ticket |
| Check-in (Check-ins) | Proactive post-purchase Support item for one exact order | survey; follow-up email (as the program name); touch base |

## 4. Where to look first

1. `AGENTS.md` — dev origin `:3050`, placement default, product facts.
2. `src/lib/nav/route-tree.ts` — every URL, nav name and domain word.
3. `src/lib/inventory/state-machine.ts` + `src/lib/inventory/allocate.ts` — the unit lifecycle and
   serial allocation.
4. `src/lib/sku/sku-identity-law.ts` — title / SKU / photo identity.
5. `src/lib/inbound/ingest-inbound-order.ts` — the one inbound writer.
6. `docs/mobile-first/SURFACE_LAW.md` — mobile-first job tree and the `/m` component kit.
7. `src/lib/nav/context/pages.ts` + `.omp/rules/sidebar-controls-contract.md` — where controls go.
8. `src/design-system/pinned.json` — pinned primitives with `useWhen` / `doNot`; ask
   `node tools/design-mcp/ds.mjs contract '<the job>'` before building a control.
