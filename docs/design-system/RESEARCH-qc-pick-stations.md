# Research — QC station vs Pick station (mapped 2026-09-27)

Read-only map produced for `HANDOFF-qc-pick-split.md`. Line numbers were true on 2026-09-27; re-verify before editing (shared dirty tree).


## 1. QC Station

### UI Routes & Surfaces
- **Desktop Primary Route**: `/test` (`src/app/test/page.tsx:4-6`) mounts `<TechSurfacePage fallbackPath="/test" />` (`src/components/tech/TechSurfacePage.tsx:18-34`).
- **Desktop Legacy Alias**: `/tech` (`src/app/tech/page.tsx:4-6`) mounts `<TechSurfacePage fallbackPath="/tech" />`.
- **Desktop Page Content & Shell**: `TechSurfacePage` mounts `TechPageContent` (`src/components/tech/TechPageContent.tsx:20-35`), which renders `TechSidebarPanel` (`src/components/sidebar/TechSidebarPanel.tsx:23-74`) and `TechDashboard` (`src/components/TechDashboard.tsx`).
  - When `?view=testing` or `?view=testing-history`: `TechSidebarPanel` renders `TestingSidebarPanel` (`src/components/sidebar/TestingSidebarPanel.tsx:119`) with `TestingScanBar` (`src/components/sidebar/receiving/TestingScanBar.tsx:92`) and the right workspace renders `TestingPanel` (`src/components/tech/TestingPanel.tsx:57-110`).
  - When `?view` is default/omitted: `TechSidebarPanel` renders `ShippingSidebarPanel` (`src/components/sidebar/ShippingSidebarPanel.tsx:29-65`) with `ShippingScanBand` (`src/components/sidebar/tech/ShippingScanBand.tsx:46-123`).
- **Mobile Routes**:
  - `/m/qc/line/[id]` (`src/app/m/(shell)/qc/line/[id]/page.tsx:14-30`): Scanned line picker (`QcLinePicker`) directing to unit QC.
  - `/m/u/[id]/qc` (`src/app/m/(shell)/u/[id]/qc/page.tsx:12-28`): Unit QC runner (`UnitQcRunner` in `src/components/mobile/qc/UnitQcRunner.tsx:26-80`) backed by `useUnitChecklist` (`src/components/mobile/qc/useUnitQc.ts:32-42`).
  - `/m/r/[id]/qc` (`src/app/m/(shell)/r/[id]/qc/page.tsx`): Repair service unit QC.

### API Routes Called
- **Scan / Intake**:
  - `POST /api/tech/scan` (`src/app/api/tech/scan/route.ts:160-475`): Tracking or FNSKU scan on the bench.
  - `GET /api/testing/receiving-lines` (`src/app/api/testing/receiving-lines/route.ts:5-8`): Open receiving lines requiring test.
- **Verdict & Evaluation**:
  - `POST /api/serial-units/[id]/test` (`src/app/api/serial-units/[id]/test/route.ts:20-95`): Records verdicts (`PASS`, `TEST_AGAIN`, `TESTING_FAILED`) via `recordTestVerdict` (`src/lib/tech/recordTestVerdict.ts:80-260`).
  - `POST /api/tech/test-result` (`src/app/api/tech/test-result/route.ts:9-250`): State-machine test actions (`start`, `pass`, `fail`, `reset`) with optional condition grade.
  - `POST /api/serial-units/[id]/checklist` (`src/app/api/serial-units/[id]/checklist/route.ts:100-220`): Unit checklist step recording.
  - `POST /api/receiving-lines/[id]/qc-checks` (`src/app/api/receiving-lines/[id]/qc-checks/route.ts`): Receiving line QC step recording.
- **Serial Addition**:
  - `POST /api/tech/add-serial` (`src/app/api/tech/add-serial/route.ts:10-50`): Resolves latest SAL for the technician and delegates to `tech/serial`.
  - `POST /api/tech/serial` (`src/app/api/tech/serial/route.ts:17-150`): Adds serial via `insertTechSerialForSalContext` (`src/lib/tech/insertTechSerialForSalContext.ts:85-230`).

### Tables Written
- `station_activity_logs`:
  - `station`: `'TECH'` (`src/app/api/tech/scan/route.ts:444`, `src/lib/tech/insertTechSerialForSalContext.ts:221`).
  - `activity_type`: `'TRACKING_SCANNED'` (`src/app/api/tech/scan/route.ts:445`), `'SERIAL_ADDED'` (`src/lib/tech/insertTechSerialForSalContext.ts:222`), `'FNSKU_SCANNED'` (`src/app/api/tech/scan/route.ts:245`), `'WS_ORDER_TESTED'` (`src/lib/realtime/publish.ts:282`).
- `tech_serial_numbers`:
  - Written by `attachTechSerial` (`src/lib/inventory/tech-serial.ts:44-124`). Columns: `serial_number`, `serial_type`, `tested_by`, `station_source` ('TECH'/'RECEIVING'), `receiving_line_id`, `shipment_id`, `scan_ref`, `notes`, `fnsku`, `source_sku_id`, `context_station_activity_log_id`, `orders_exception_id`, `serial_unit_id`, `order_id`, `organization_id`, `created_at`.
- `serial_units`:
  - `current_status`: transitions to `'IN_TEST'`, `'TESTED'`, `'GRADED'`, `'ON_HOLD'`, or `'IN_REPAIR'` (`src/lib/tech/recordTestVerdict.ts:167-195`, `src/app/api/tech/test-result/route.ts:133-210`).
  - `condition_grade`: `'BRAND_NEW'`, `'LIKE_NEW'`, `'REFURBISHED'`, `'USED_A'`, `'USED_B'`, `'USED_C'`, `'PARTS'` (`src/app/api/tech/test-result/route.ts:130-225`).
- `inventory_events`:
  - `event_type`: `'TEST_PASS'`, `'TEST_FAIL'`, `'TEST_START'`, `'ADJUSTED'` (`src/lib/tech/recordTestVerdict.ts:31-35`, `src/app/api/tech/test-result/route.ts:134`).
- `testing_results`:
  - `serial_unit_id`, `receiving_line_id`, `verdict`, `unit_status`, `tested_by`, `notes`, `inventory_event_id`, `organization_id` (`src/lib/tech/recordTestVerdict.ts:241-255`).
- `tech_verifications`:
  - Check template step executions (`src/app/api/serial-units/[id]/checklist/route.ts:60-95`).

### Keys & Inbound Links
- **Keys**:
  - The actual physical QC process keys on `serial_units.id` / `serial_units.normalized_serial` and `receiving_lines.id`.
  - The tracking scan (`/api/tech/scan`) keys on `shipments` (`shipping_tracking_numbers.id`) or `orders.id` (`order_row_id` metadata).
- **Receiving / Inbound -> QC Link**:
  - Inbound package received at dock -> unboxed into cartons & lines (`receiving_line`, `workflow_status` = `EXPECTED` -> `RECEIVED`).
  - Unit records are born in `serial_units` (`origin_receiving_line_id = receiving_line.id`, initial status `RECEIVED`).
  - Receiving lines carry `needs_test: boolean` (`src/components/sidebar/receiving/RecentActivityRail.tsx`) and `assigned_tech_id`.
  - When tested on the QC bench (`TestingPanel` or mobile `/m/qc/line/[id]`), `recordTestVerdict` updates unit status and counts tested units against `receiving_line.quantity_expected` (`src/lib/tech/recordTestVerdict.ts:285-320`), updating `receiving_line.qa_status`, `disposition_code`, and `workflow_status`. On `PASS`, `recordTestVerdict` triggers best-effort automatic allocation to pending orders (`recordTestVerdict.ts:350-420`).

---

## 2. Pick Station

### UI Routes & Surfaces
- **Mobile Picker**: `/m/pick` (`src/app/m/(shell)/pick/page.tsx`), `/m/pick/[orderId]` (`src/app/m/(shell)/pick/[orderId]/page.tsx`), `/m/id/pick/[orderId]` (`src/app/m/(shell)/id/pick/[orderId]/page.tsx`). Uses `PickerTaskCard.tsx` and `useMobilePicker.ts`.
- **Desktop "Picker" Desk**:
  - Configured in navigation as `ready-to-pack`: `/test?ship=urgent` (`src/lib/sidebar-navigation.ts:955-957`, `docs/refactors/sidebar/NAV-CONTEXTS.md:94-96`).
  - Label in `SIDEBAR_PAGE_NAV`: `'Picker'` (`NAV-CONTEXTS.md:95`, `PARITY.md:889-891`).
  - Desktop UI mounts `TechSurfacePage`, falling back to `ShippingSidebarPanel` with `ShippingScanBand` (`src/components/sidebar/tech/ShippingScanBand.tsx:46-120`).

### API Routes Called
- `POST /api/pick/scan` (`src/app/api/pick/scan/route.ts:11-255`): Validates allocation for order, transitions unit to `PICKED`, updates allocation.
- `POST /api/pick/unscan` (`src/app/api/pick/unscan/route.ts`).
- `GET /api/pick/queue` (`src/app/api/pick/queue/route.ts:10-70`): Open orders for assigned picker.
- `POST /api/v1/picking/sessions` (`src/app/api/v1/picking/sessions/route.ts:13-37`): Open or reuse session.
- `POST /api/v1/picking/sessions/[id]/tote` (`src/app/api/v1/picking/sessions/[id]/tote/route.ts`): Binds tote to order.
- `GET /api/orders/[id]/pick-tasks` (`src/app/api/orders/[id]/pick-tasks/route.ts`): Order pick tasks.
- `POST /api/tech/scan` (`src/app/api/tech/scan/route.ts:160-475`): Used by the desktop `/test?ship=urgent` "Picker" desk!

### Tables Written
- `order_unit_allocations`:
  - `state`: transitions from `'ALLOCATED'` to `'PICKED'` (`src/app/api/pick/scan/route.ts:223-231`, `src/lib/picking/sessions.ts:628-634`). (Other states: `'PACKED'`, `'SHIPPED'`, `'RETURNED'`, `'RELEASED'`).
- `inventory_events`:
  - `event_type`: `'PICKED'` or `'FORCE_PICK'` (`src/app/api/pick/scan/route.ts:107-160`, `src/lib/picking/sessions.ts:590-605`).
  - `station`: `'PACK'` or `'MOBILE'`.
- `picking_sessions`:
  - Written by `openPickingSessionOn` / `startSession` (`src/lib/picking/sessions.ts:285-300`). Columns: `order_id`, `picker_staff_id`, `device_id`, `started_at`, `ended_at`, `abandoned`.
- `station_activity_logs`:
  - Not written by `/api/pick/scan` or `/api/v1/picking/*`.
  - WRITTEN by the desktop "Picker" desk (`/test?ship=urgent`) via `/api/tech/scan` as `station = 'TECH'` and `activity_type = 'TRACKING_SCANNED'` (`src/app/api/tech/scan/route.ts:442-458`).

### Keys
- Allocation picking keys on `order_unit_allocations.id`, `serial_units.id`, and `orders.id`.
- Desktop "Picker" desk keys on `shipping_tracking_numbers.id` (`shipment_id`) and `orders.id` (`metadata->>'order_row_id'`).

---

## 3. Shared & Conflated Points (Exact Lines)

### The Single Event Counted as Both QC and Pick
1. **The Writer**:
   - `src/app/api/tech/scan/route.ts:442-458`:
     Scanning a tracking barcode at the desktop "Picker" desk writes:
     `station = 'TECH'`, `activity_type = 'TRACKING_SCANNED'`.
2. **The QC Reader**:
   - `src/lib/orders/orders-list.ts:244-255`:
     ```sql
     test_activity AS (
       SELECT DISTINCT ON (sal.shipment_id)
         sal.shipment_id, sal.created_at, sal.staff_id
       FROM station_activity_logs sal
       WHERE sal.station = 'TECH'
         AND sal.shipment_id IS NOT NULL
         AND sal.activity_type = 'TRACKING_SCANNED'
     ```
     Selected at `orders-list.ts:413` as `test_activity.created_at AS test_activity_at`.
   - `src/lib/orders/order-stages.ts:33-35`:
     ```ts
     if (kind === 'qc') {
       const stamp = row.test_activity_at ? formatMonthDayTimePST(row.test_activity_at) : '—';
       at = stamp === '—' ? null : stamp;
     }
     ```
     Result: Marks the order as **QC'd** by `staff_id` at `created_at`.
3. **The Pick Reader**:
   - `src/lib/neon/orders-queries.ts:128-138` (and imported in `orders-list.ts:665`):
     ```sql
     LEFT JOIN LATERAL (
       SELECT sal.staff_id  AS picked_by,
              sal.created_at AS picked_at
       FROM station_activity_logs sal
       WHERE sal.shipment_id     = o.shipment_id
         AND sal.organization_id = o.organization_id
         AND sal.station         = 'TECH'
         AND sal.activity_type   = 'TRACKING_SCANNED'
       ORDER BY sal.created_at DESC, sal.id DESC
       LIMIT 1
     ) pick_station ON o.shipment_id IS NOT NULL
     ```
   - Selected at `orders-list.ts:478-483`:
     ```sql
     COALESCE(pick_alloc.picked_by, pick_sess.picked_by, pick_station.picked_by) AS picked_by,
     s_picked.name AS picked_by_name,
     to_char(COALESCE(pick_alloc.picked_at, pick_sess.picked_at, pick_station.picked_at), 'YYYY-MM-DD HH24:MI:SS') AS picked_at,
     ```
   - `src/lib/orders/order-stages.ts:36-39`:
     ```ts
     const step = resolveOrdersSlotValue(row, 'orders.picked');
     at = step?.kind === 'stage_event' ? (step.at ?? null) : null;
     ```
     Result: Marks the order as **Picked** by `staff_id` at `created_at`.
   - **Conclusion**: A single scan at the desktop station stamps BOTH `test_activity_at` (QC) and `picked_at` (Pick) with the exact same timestamp and staff ID.

---

## 4. Readers to Migrate

1. **`src/lib/orders/orders-list.ts`**:
   - Lines 244-255 (`test_activity` CTE): Reads `station='TECH'` and `activity_type='TRACKING_SCANNED'`.
   - Lines 256-270 (`next_test_activity` CTE): Reads `station='TECH'` and `activity_type='TRACKING_SCANNED'`.
   - Lines 290-302 (`test_duration` CTE): Computes duration from `station='TECH'` and `activity_type='TRACKING_SCANNED'`.
   - Lines 427, 494, 728: `wa_t.assigned_tech_id AS tester_id` joined to `staff_pick_assignee`.
   - Lines 478-483: `picked_by` and `picked_at` reading from `pick_station`.
2. **`src/lib/neon/orders-queries.ts`**:
   - Lines 128-138 (`PICK_FACTS_LATERALS` third arm `pick_station`): Reads `station='TECH'` and `activity_type='TRACKING_SCANNED'`.
   - Lines 316-318, 466-468, 750-752, 900-902: Projections of `picked_by` and `picked_at`.
3. **`src/lib/tables/field-catalog/orders-resolve.ts`**:
   - Lines 90-99 (`pickedStep`): Reads `picked_by_name`, `picked_by`, `picked_at`.
   - Lines 140-141 (`case 'orders.picked'`): Calls `pickedStep`.
4. **`src/lib/orders/order-stages.ts`**:
   - Lines 33-35: Reads `row.test_activity_at` and `row.tested_by` for QC.
   - Lines 36-45: Reads `orders.picked` and binds `assignee: [row.tester_id, row.tester_name]` for Pick.
5. **`src/components/dashboard/orders-queue/useOrdersQueueFeed.ts`**:
   - Lines 63-85 (`queueRowStaff`): Fallback chain assigns `r.tester_id` / `r.tested_by` as `testerId` / `testerDisplay`.
   - Lines 333-349 (`handleCommitStageAssign`): When `fieldId === 'orders.picked'`, calls `assignMutate({ orderId, testerId: staffId, testerName })`.
6. **`src/components/outbound/orders/OrderRecordView.tsx`**:
   - Lines 419-425: Maps `ORDER_STAGE_KINDS` using `orderStage`.
   - Lines 560-584: Renders "QC by" (unassignable, `selectedStaffId={null}`) and "Picked by" (assigns to `staff.testerId`, calling `commits.handleCommitStageAssign(line, 'orders.picked', id, name)`).
7. **`src/app/api/orders/assign/route.ts`**:
   - Lines 94-98: Writes `testerId` to `work_assignments` with `work_type = 'TEST'`.
8. **Dashboards & Counts**:
   - `src/lib/orders/desk-counts.ts` / `perf-explain/desk_counts_to_ship.after.sql:6-9`: Queries `station_activity_logs`.
   - `src/app/api/orders/queue-counts/route.ts`: Evaluates tested vs pending stages using `sal.activity_type IN ('TRACKING_SCANNED', 'FNSKU_SCANNED')`.
   - `src/app/api/operations/kpi-table/route.ts:289`:
     `WHEN u.action_type IN ('TRACKING_SCANNED', 'SERIAL_ADDED', 'FNSKU_SCANNED') THEN 'TECH'`.
9. **Assistant Tools**:
   - `src/lib/operations/journey.ts:315-350` & `src/lib/assistant/tools/domain-read-tools.ts:78-83` (`get_operations_journey`): Reads all SAL rows for the shipment as `station = 'TECH'`; cannot differentiate between QC and picking.

---

## 5. Schema, Constants & Migrations

### Activity Type Constants & Station Enums
- **File**: `src/lib/station-activity.ts`
  - `StationName`: `'TECH' | 'PACK' | 'FBA' | 'RECEIVING' | 'ADMIN' | 'OUTBOUND'` (Line 5). Notice: `'PICK'` does not exist as a station name.
  - `StationActivityType`: `'TRACKING_SCANNED' | 'FNSKU_SCANNED' | 'SERIAL_ADDED' | 'PACK_COMPLETED' | 'PACK_SCAN' | 'PACK_SHIPPED' | 'FBA_READY' | 'SHIP_CONFIRM' | 'DOCK_STAGED' | 'WS_ORDER_TESTED' | 'WS_REPAIR_CHANGED' | 'WS_RECEIVING_CHANGED' | 'WS_FBA_SCAN'` (Lines 6-21). Notice: No `'PICK_SCANNED'` or `'PICK_COMPLETED'`.
  - `PACK_ACTIVITY_TYPES`: `['PACK_COMPLETED', 'PACK_SCAN'] as const` (Line 26).
  - `TECH_TEST_ACTIVITY_TYPES`: `['TRACKING_SCANNED', 'FNSKU_SCANNED'] as const` (Line 29).
  - `VELOCITY_ACTIVITY_TYPES`: `['TRACKING_SCANNED', 'FNSKU_SCANNED', 'PACK_SCAN', 'PACK_COMPLETED', 'FBA_READY'] as const` (Lines 32-38).

### Table Definitions in Migrations
1. `station_activity_logs`:
   - `src/lib/migrations/0000_baseline_through_2026-03.sql:2277-2292`: Created with `station VARCHAR(20)`, `activity_type VARCHAR(30)`, `shipment_id BIGINT`, `scan_ref TEXT`, `metadata JSONB`.
   - `src/lib/migrations/2026-09-26_perf_01_sal_order_grain_columns.sql`: Added stored generated columns `order_row_id` and `ext_order_id`.
2. `tech_serial_numbers`:
   - `src/lib/migrations/create_tech_serial_numbers.sql:6-14`: Created with `shipping_tracking_number TEXT`, `serial_number TEXT`, `serial_type VARCHAR(20)`, `test_date_time TIMESTAMP`, `tester_id INTEGER REFERENCES staff(id)`.
   - `src/lib/migrations/2026-07-30_tech_serial_numbers_order_id.sql`: Added `order_id` column.
   - `src/lib/migrations/2026-05-17_inventory_v2_phase0.sql`: Added `serial_unit_id` FK.
3. `order_unit_allocations`:
   - `src/lib/migrations/2026-05-17_inventory_v2_phase0.sql:94-106`: Created with `order_id INTEGER`, `serial_unit_id INTEGER`, `state allocation_state_enum` (`ALLOCATED`, `PICKING`, `PICKED`, `PACKED`, `SHIPPED`, `RETURNED`, `RELEASED`).
4. `picking_sessions`:
   - `src/lib/migrations/2026-05-20_inventory_v2_active_states.sql:51-60`: Created with `order_id INTEGER`, `picker_staff_id INTEGER`, `device_id TEXT`, `started_at TIMESTAMPTZ`, `ended_at TIMESTAMPTZ`, `abandoned BOOLEAN`.

---

## 6. Work Assignments & Conflation

- **`work_assignments` Allowed Work Types**:
  - `src/app/api/assignments/route.ts:18`:
    `const WORK_TYPES = new Set<WorkType>(['TEST', 'PACK', 'REPAIR', 'QA', 'RECEIVE', 'STOCK_REPLENISH']);`
  - There is NO `'PICK'` work type in the database enum/schema!
- **Assignment Borrowing**:
  - In `orders-list.ts:427, 566-574, 728`:
    The lateral `wa_t` queries `work_assignments WHERE work_type = 'TEST' AND assigned_tech_id IS NOT NULL`. It projects `wa_t.assigned_tech_id AS tester_id` and joins `staff staff_pick_assignee ON staff_pick_assignee.id = wa_t.assigned_tech_id`.
  - In `OrderRecordView.tsx:578-581`:
    The "Picked by" card row binds `selectedStaffId={staff.testerId}` and `assignedName={staff.testerDisplay}`. When an operator assigns a picker in the UI, `commits.handleCommitStageAssign(line, 'orders.picked', id, name)` calls `assignMutate({ orderId, testerId: staffId })`, which writes a `work_assignments` record with `work_type = 'TEST'` (`src/app/api/orders/assign/route.ts:94-98`).
  - Meanwhile, the "QC by" row on `OrderRecordView.tsx:560-569` has NO work assignment picker (`selectedStaffId={null}`, `assignedName="---"`), showing only historical facts (`qcFacts`).

---

## 7. Docs Mentioning QC / Test / Pick Stations
- `docs/testing-vs-receiving-isolation.md:3-78`: Isolation boundary between `/test` (Testing/QC) and `/unbox` / `/triage` (Receiving).
- `docs/refactors/sidebar/PARITY.md:889-954`: Explains `ready-to-pack` ("Picker") at `/test?ship=urgent` vs `testing` ("Quality Control") at `/test?view=testing`.
- `docs/refactors/sidebar/NAV-CONTEXTS.md:94-96, 1792-1801`: Navigation registry mapping `ready-to-pack` to label "Picker" and href `/test?ship=urgent`.
- `docs/design-system/HANDOFF-card-list-port.md:38-40, 70-80`: Discusses `queueRowStaff`, pick facts on rows, stage assignments for Pick/Pack, and proposed auto-rules for QC / Pick / Pack.
- `docs/design-system/BRIEF.md:50-54`: Categorizes floor roles (`industrial` vs `triage`).

---

## 8. Open Architectural Questions for the Data/API Split

1. **Station Identity & Activity Type**:
   - Should a new station `'PICK'` be added to `StationName` in `src/lib/station-activity.ts` and `station_activity_logs`, or should picking use a new `activity_type` (e.g. `'ORDER_PICKED'` / `'PICK_SCANNED'`) under `station = 'PICK'`?
   - Should the desktop `/test?ship=urgent` desk write to `order_unit_allocations` / `inventory_events` directly instead of writing a tracking scan to `station_activity_logs`?
2. **Work Assignment Enum**:
   - `work_assignments.work_type` currently only supports `'TEST'`. Will a database migration add `'PICK'` to `work_assignments_work_type_enum` so that `orders.picker_id` is cleanly separated from `orders.tester_id`?
3. **Disentangling Historical SAL Rows**:
   - Historical rows in `station_activity_logs` with `station='TECH'` and `activity_type='TRACKING_SCANNED'` currently represent both test bench activity and picker desk scans. Can they be distinguished by URL/source metadata, or should new logic only apply forward from a cutoff timestamp / migration?
4. **Desktop Pick vs Unit Allocations**:
   - When a picker scans a tracking barcode at the desktop "Picker" desk, should the backend automatically advance all `ALLOCATED` rows for that order to `PICKED` in `order_unit_allocations`, or will the desktop desk require scanning individual item serials?