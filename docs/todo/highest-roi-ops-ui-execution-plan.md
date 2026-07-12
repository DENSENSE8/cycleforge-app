# Highest-ROI Ops & UI Execution Plan

> **Live on the website:** this plan is folded into repo-root **`master-plan.mdx`**
> (tickets `ROI-A1` … `ROI-G1`) and renders in **Operations ▸ Plans → Live**
> (or open `/forge`, which redirects there). Same CRDT path as the agentic-loop
> master plan — edit `master-plan.mdx`, let the sync daemon merge, or load live
> after seed. This `.md` file is the long-form inventory + test-checklist companion.

**Status:** PLAN (code-grounded inventory 2026-07-11) · **Live SoT:** `master-plan.mdx`  
**Scope:** Ship-table UX · Walk-in kiosk (front desk + staff) · Inventory staging hierarchy · Testing modes / mobile · Popover DS · Packer photos in order search · Mobile unbox/pack UX · Gate unfinished pages  
**Principle:** Ship closed-loop daily-ops value first; new surfaces only where substrate already exists; never invent parallel engines.

---

## 0. Executive summary

These eight workstreams look like eight features. In code they are **not equal**: several are **one-line or small wiring fixes** on a working backbone; others need schema + stations + pairing UI. Ranking by **ROI = daily-ops leverage × correctness risk closed ÷ effort** yields this order:

| Rank | Workstream | Code state today | Effort | ROI | Why first/later |
|------|------------|------------------|--------|-----|-----------------|
| **P0** | Packer photos on order search / dashboard detail | Data + API + UI exist; **dashboard stack hides them** | XS | ★★★★★ | Unblocks support/shipping QA with almost no new surface |
| **P0** | Testing pass/fail instant UI + query invalidation | `recordTestVerdict` + optimistic hooks exist; polish gaps | S | ★★★★★ | Testers hit this hundreds of times/day |
| **P0** | Ship Unshipped ↔ Shipped tab affordance clarity | **Works** via `?unshipped` / `?shipped` + master-nav modes | XS–S | ★★★★ | Discoverability / muscle memory; not a greenfield table |
| **P1** | Mobile testing: receiving QR, matrix, serial split, order pair | Scan routing + label-manifest **API** partial; mobile polish gaps | M | ★★★★★ | Closes the phone bench loop MASTER already calls out |
| **P1** | Inventory closed-loop staging (scan item → rack/shelf/pos + rooms/desks) | `locations` room/row/col; move/transfer APIs; floorplan Phase 1; **no place station** | M–L | ★★★★★ | Physical truth for everything downstream |
| **P1** | Mobile unbox + pack UX (critique → polish) | Shell works; plan already ranked defects/readiness/commit | M | ★★★★ | Throughput + error reduction on busiest phone surfaces |
| **P2** | Popover DS: migrate to `RightPaneOverlay` backbone | Shell shared; claim wizards forked; many one-offs | M | ★★★ | Multiplier for every later modal; not ops-blocking alone |
| **P2** | Walk-in kiosk + management (idle → Sales/Repair/Service) | Staff `/walk-in` + Square + letterhead; **no kiosk shell** | L | ★★★★ | High customer-facing value after ops spine is trustworthy |
| **P3** | Gate unfinished / untested pages (worktrees / flags / nav) | design-demo kept; forge/signals redirect; knip backlog | S–M | ★★★ | Risk reduction; do continuously, not as a mega-project |

**Non-negotiable project rules applied throughout**

- Status only via `transition()` / `applyTransition()` — never raw `current_status`.
- Tenant scope via `withTenantTransaction` / `ctx.organizationId` — never body org.
- Audit via `recordAudit()` + `AUDIT_*` constants; mutations thread `clientEventId`.
- Display archetype first (Station / Workbench / Monitor / Canvas) per region.
- Integrations speak **capabilities**, not vendor brands, on operator copy.
- Search pairing goes through `hybridSearch` / `SearchHit` — no new search engine.
- Tabs use `TabSwitch`; buttons use design-system `Button`; popovers compose `RightPaneOverlay`.

---

## 1. Ground truth — what already exists (do not rebuild)

### 1.1 Ship tables (Unshipped / Shipped)

| Concern | Location |
|---------|----------|
| View enum | `DashboardOrderView = 'unshipped' \| 'shipped' \| 'fba' \| 'warranty'` in `src/utils/dashboard-search-state.ts` |
| URL | Presence params `?unshipped` (default), `?shipped`, `?fba`, `?warranty` |
| Switch | `DashboardOrdersView` — eager `UnshippedTable`, dynamic `DashboardShippedTable` |
| Nav modes | Master sidebar modes in `src/lib/sidebar-navigation.ts` (Unshipped · Shipped · Warranty) |
| Queries | `src/lib/queries/dashboard-queries.ts`, keys `dashboard-table.*` in `src/queries/keys.ts` |
| Data | `src/lib/dashboard-table-data.ts` |

**Gap is UX discoverability / in-table chrome**, not missing tables. FBA stays on `/fba` by design (commented in context panel).

### 1.2 Walk-in

| Concern | Location |
|---------|----------|
| Staff page | `/walk-in` — `?mode=repairs\|sales`, repair tabs, `?openRepair=` |
| Components | `SalesEditPanel`, `SalesCartSidebar`, `SquareProductSearchPopover`, repair intake suite |
| APIs | `/api/walk-in/{catalog,customers,orders,sales,status,sync,receipt,terminal/*}` |
| Branding | `getOrgLetterhead` / `/api/org/letterhead` — **reuse for kiosk idle media**, extend with org-scoped asset upload |
| Redirect | `/repair` → `/walk-in?mode=repairs` |

**Missing:** customer-facing idle/kiosk route, dual-display pairing protocol, org-uploadable idle animation keyed by `organization_id`.

### 1.3 Inventory layout & staging

| Concern | Location |
|---------|----------|
| Schema | `locations` — `room`, `row_label`, `col_label`, `zone_letter`, `bin_type`, `capacity`, `parent_id`, `barcode` (`schema.ts` ~2523). **No typed desk/rack/shelf/position enum hierarchy.** |
| Unit move | `POST /api/serial-units/[id]/move` — `current_location` + `MOVED` event (does not always sync bin qty) |
| SKU transfer | `POST /api/transfers` — bin-to-bin qty |
| Putaway | `receiving_line_putaway`, `/api/receiving/lines/[id]/putaway`, triage `staging_location_id` |
| Map | `/warehouse?tab=map&view=floorplan` Phase 1 shipped; layout x/y **not** persisted (Phases 2–3 pending in `docs/todo/warehouse-map-react-flow-plan.md`) |

### 1.4 Testing

| Concern | Location |
|---------|----------|
| Domain | `src/lib/tech/recordTestVerdict.ts` — `VERDICT_TO_STATUS`, line rollup, engine tap |
| API | `POST /api/serial-units/[id]/test` |
| Surface | `/test` (`SURFACE_REGISTRY.test`), legacy `/tech` |
| Isolation | `docs/testing-vs-receiving-isolation.md` — testing feeds only `/api/testing/receiving-lines` |
| Mobile | `ScanTestingPanel`, `resolveTestingScan` (incl. LPN `H-{id}`) |
| Label manifests | **API** `/api/label-manifests/*` + tables exist; operator UI per `serial-label-pairing-split-combine-plan.md` still PLAN |

### 1.5 Popovers

| Layer | Location |
|-------|----------|
| **Backbone shell** | `RightPaneOverlay` + `RightPaneOverlayHost` — resize, pane/viewport anchor, center/right |
| Claim pattern | `ReceivingClaimModal` + steps under `receiving/workspace/claim/` |
| Parallel claim | `ZendeskClaimModal` (same shell, forked controller) |
| Small popovers | `design-system/primitives/Popover.tsx`, `AnchoredLayer.tsx` |
| One-offs | FBA, Square search, OrdersSync, label `PopoverShell` in unit-detail, etc. |

### 1.6 Packer photos ↔ orders

| Concern | Location |
|---------|----------|
| Storage | `photos` + `photo_entity_links` (`entity_type='PACKER_LOG'`, `entity_id=packer_logs.id`) |
| API | `/api/packing-photos?packerLogId=` — `listPackerPhotos` |
| Row field | `packer_photos_url` on shipped/order rows (`dashboard-table-data.ts`) |
| UI default | `ShippedDetailsPanelContent` defaults `showPackingPhotos=true` |
| **Suppressed** | `DashboardDetailsStack` / dashboard context path sets **`showPackingPhotos={false}`** |

### 1.7 Mobile unbox / pack

| Route | Component |
|-------|-----------|
| `/m/unbox` | `RedesignedMobileReceive` surface=`unbox` |
| `/m/triage`, `/m/receive` | triage (receive deprecated → triage) |
| `/m/pack` | `RedesignedMobilePack` |
| Shell | `MobileShell`, `UniversalScan`, `ScanInput`, redesign bottom nav |
| UX plan | `docs/todo/unbox-receive-ux-improvement-plan.md` (defect chips, readiness bar, commit bar, serial hardening) |

### 1.8 Experimental / public surfaces

- **True public** (`src/proxy.ts` `PUBLIC_PATHS`): auth, share tokens, GS1, health/cron/webhooks.
- **Auth-required but not product nav:** `/design-demo/**` (kept showroom), `/wipe`, `/open-links`, various short links.
- **Redirects:** `/forge` → operations plans; `/signals` → `/operations?mode=signals`.
- Dead-code program: `docs/partial/dead-code-triage.md` (waves 1–6 ~75%); knip backlog remains for some trees.

---

## 2. Wave plan (implementation order)

### Wave A — Close the loop with existing data (1–3 days)

Ship the wins that need almost no new schema.

#### A1. Packer photos visible on order search / dashboard detail — **P0**

**Problem:** Operators open an order from dashboard/search and cannot see pack photos even though packer station uploaded them and the row often already carries `packer_photos_url`.

**Change**

1. In `DashboardDetailsStack` (and any `context="dashboard"` / order-workbench path), enable packing photos:
   - Pass `showPackingPhotos={true}` into `ShippedDetailsPanelContent`, **or** remove the hard-false and default to true for shipped + packed contexts.
2. Confirm hydrate path in `dashboard-table-data.ts` always joins packer enrichment when `PACKER_LOG_ENRICHMENT_READ` spine is on; if unshipped rows lack packer logs, show empty section with teaching copy (“No pack photos yet”), not a crash.
3. Ensure order full page `/o/[orderId]` and search-opened panels use the same stack props.
4. Wire gallery to existing `PhotoGallery` / `usePhotoGallery`; do **not** invent a second photo model.

**Acceptance**

- Pack an order with ≥1 photo → open that order from dashboard Unshipped/Shipped search → photos render and open full viewer.
- Delete/remove photo from packer path → dashboard reflects after realtime/`usePackerPhotosRealtimeRefresh` invalidation.
- Tenant isolation: org A cannot load org B `packerLogId` via `/api/packing-photos`.

**Test checklist — A1**

- [ ] Unit: mapper keeps `packer_photos_url` through dashboard + shipped mappers.
- [ ] Manual: pack → photo → open from `?search=` on shipped table.
- [ ] Manual: open `/o/{orderId}` — photos section present.
- [ ] E2E (add): `tests/e2e/order-packer-photos.spec.ts` — fixture order with linked PACKER_LOG photo appears in detail.
- [ ] Negative: order with no packer_log → empty teaching state, no console errors.
- [ ] Permission: user without photo permission gets 403, UI degrades.

---

#### A2. Testing: instant UI after Pass / Fail — **P0**

**Problem:** After pressing Pass, UI should flip immediately (optimistic) and stay correct after server settle; any lag feels broken on a high-frequency station.

**Change**

1. Audit existing optimistic path (tech testing controllers / unit slots — search `optimistic` near `recordTestVerdict` consumers and `POST /api/serial-units/[id]/test`).
2. On success: invalidate **only** testing-scoped keys (`testing/receiving-lines`, unit detail, recent rail) — never receiving isolation feed (see `surface-isolation.ts`).
3. On 409 (`expectedFrom` conflict): rollback optimistic status; big fail state on the active unit card (station law), not a tiny toast.
4. Thread `clientEventId` per button press so double-tap is idempotent.
5. Mobile `ScanTestingPanel`: same optimistic contract as desktop unit slots.

**Acceptance**

- Pass → unit card status + line rollup update in &lt;100ms perceived; no full-page reload.
- Offline / 500 → rollback + retryable error; no stuck “passing…” forever.
- Double-tap Pass → single `testing_results` row / single transition.

**Test checklist — A2**

- [ ] Unit: `recordTestVerdict` mapping still authoritative (`recordTestVerdict-verdict-map.test.ts`).
- [ ] Component/integration: optimistic → settle; optimistic → 409 rollback.
- [ ] E2E: `receiving-tech-modes` or new `testing-pass-instant.spec.ts` — click Pass, assert chip/status before network mock resolves.
- [ ] Isolation guard: after test, receiving recent rail does not steal testing events (existing isolation tests).
- [ ] Zoho side-effects remain `after()` / non-blocking (MASTER bugs about multi-post are **separate** P0 bugs — track but don’t block UI optimism).

---

#### A3. Ship table Unshipped ↔ Shipped top tabs — **P0 (UX)**

**Problem:** Operators want explicit **tab buttons at the top of the ship tables** to toggle Unshipped ↔ Shipped. Code already has modes; some layouts (master-nav off, dense table focus) hide the affordance.

**Change**

1. Add a sticky table header control using **`TabSwitch`** (MASTER contract — not ad-hoc pills):
   - Items: **Unshipped** | **Shipped** (optional third: Warranty only if already in `DashboardOrderView`).
2. Wire to existing `setOrderView` / `normalizeDashboardOrderViewParams` — preserve shipped date filter prefs when switching back to Shipped.
3. Keep master-nav modes in sync (single URL SoT). Selecting either updates the same presence params.
4. Prefetch: on hover/focus of Shipped tab, call existing `warmActiveView` / view warmup so switch feels instant.
5. Do **not** reintroduce separate Pending table; merged unshipped is SoT.

**Acceptance**

- Click Unshipped → URL has unshipped presence, table is backlog.
- Click Shipped → URL has `shipped`, packed/shipped table + date pills work.
- Keyboard: tabs reachable; selection doesn’t shift row height.
- Counts optional follow-up (MASTER “unshipped rail badges”) — not required for A3.

**Test checklist — A3**

- [ ] Unit: `dashboard-search-state.test.ts` still covers presence params + legacy `?pending`.
- [ ] E2E: extend table-column / shipped specs — click top tabs, assert URL + table landmark.
- [ ] Perf: shipped date filter still warm-cache (`shipped-date-filter-perf.spec.ts`).
- [ ] Bulk select mode survives view switch (clear or preserve — pick one and document; recommend **clear** selection on view change).

---

### Wave B — Physical inventory closed loop (3–8 days)

#### B1. Location hierarchy: Room → (Desk | Rack) → Shelf → Position — **P1**

**Problem:** Product mental model is rooms, desks, racks, shelves, positions; schema is mostly flat bins with `room`/`row`/`col`/`bin_type`/`parent_id`.

**Design decision (recommended)**

Keep **one physical location row per scannable place** (barcode), model hierarchy with:

```
location_kind ∈ ('ROOM','DESK','RACK','SHELF','POSITION','BIN','STAGING','OTHER')
parent_id → parent location
path / depth optional materialized for queries
```

- `ROOM` / `DESK` may be non-scannable containers (or scannable zone QR).
- Putaway targets are typically `POSITION` or `BIN` (leaf).
- Staging carts/areas = `STAGING` kind (links existing `staging_location_id`).

**Migration** (new dated SQL via `db-migration-author` skill):

1. Add `location_kind TEXT NOT NULL DEFAULT 'BIN'` + named CHECK.
2. Backfill: existing rows → `BIN` (or map known `bin_type` strings if any encode rack/shelf).
3. Optionally add `layout_x/y/w/h` if Wave B3 persists floorplan (can be same migration or Phase 2 of warehouse map plan).
4. `enforce_tenant_isolation` already on table — keep org-led indexes.
5. Drizzle model same PR.

**Domain**

- Extend `location-queries.ts`: create child, list tree by room, resolve barcode → leaf + ancestors.
- Move unit: `POST /api/serial-units/[id]/move` must accept location id **or** barcode; write `current_location` **and** consistent bin_contents / events; use `transition` only if status change is required (placement alone is often `MOVED` event without status flip — match existing semantics).
- Putaway after receive/test: domain helper `placeUnitOnLocation({ unitId, locationBarcode, clientEventId })` with Deps injection for tests.

**UI**

- **Station (scan):** “Place” mode — scan location (rack/shelf/pos) → becomes active target; scan unit → places on target; re-focus. Crossfade active card only.
- **Workbench:** inventory/warehouse tree browser for rooms/desks; edit hierarchy; print barcodes.
- Warehouse floorplan: rooms as zones; desks/racks as nodes (Phase 2 of existing plan).

**Acceptance**

- Create Room → Rack → Shelf → Position with barcodes; scan chain places unit; inventory UI shows real room/desk/rack path, not free text only.
- Selecting a rack in UI + scan unit places on that rack’s default shelf/position policy (document policy: require leaf scan vs allow rack-level default).
- Closed loop: receive → stage → test → place → pick sees same location.

**Test checklist — B1**

- [ ] Unit: `placeUnitOnLocation` fakes deps — event written, barcode resolve, 404/409.
- [ ] Migration idempotent on re-run; backfill leaves no null kind.
- [ ] Manual scan: location barcode then unit barcode; reverse order rejected with clear station fail card.
- [ ] RLS: org B cannot place on org A location id.
- [ ] E2E: place station happy path + wrong-org barcode.
- [ ] Regression: existing `/api/transfers` and bins-overview still return correct fill %.

---

#### B2. Staging closed loop for receiving/testing — **P1**

**Problem:** Staging chips / `staging_location_id` exist but the “I put this carton/unit on Stage Rack 2” story must be 100% real data end-to-end.

**Change**

1. Map triage staging chips to real `locations` rows (`kind=STAGING` or designated bins).
2. On scan-to-stage: write location + inventory event + optional receiving_triage update in one tenant transaction.
3. UI: show current staging location as presentation-ready chips (path labels from server).
4. After test Pass: optional “place to stock” prompt that deep-links Place station with unit preloaded (ephemeral, not URL for unit id if station law forbids — prefer scan confirmation).

**Test checklist — B2**

- [ ] Stage carton → refresh another device → same location.
- [ ] Clear/re-stage updates single source field (no dual-write drift).
- [ ] Audit log entries for place/stage actions via `recordAudit`.

---

### Wave C — Testing mobile + serial identity (4–10 days)

#### C1. Mobile testing flow: receiving QR + matrix + details — **P1**

**Build on:** `resolveTestingScan`, `MobilePoQrScanSheet`, `ScanTestingPanel`, `/m/*` shell, MASTER §3 mobile QR item.

**Flows**

1. Scan **receiving QR** (carton / PO / line) → load testing context (isolation feed only).
2. Scan **unit label / serial** → bind to active line; matrix/checklist steps on phone with large pass/fail targets (thumb zone).
3. Update details (grade, notes, failure tags) on phone; optimistic local; server settle.
4. Photo request path already has unit photo studios — keep; don’t fork.

**UX (phone best-in-class)**

- Station archetype on mobile: sticky scan, one active card, big Pass/Fail, OfflineBanner degrade-not-block.
- Min 44px targets; safe-area insets; no hover-only actions.
- Reduce motion via existing hooks.

**Test checklist — C1**

- [ ] E2E mobile viewport: scan PO QR fixture → line list → pass unit.
- [ ] Offline queue: pass while offline → sync → single verdict.
- [ ] Wrong QR type → clear error, scan bar re-focus.

---

#### C2. Serial identification, split, wrong-pair recovery — **P1**

**Build on:** `docs/todo/serial-label-pairing-split-combine-plan.md` + existing `label_manifests` API + `attachSerialToLine` + LPN handling units.

**Hard rules (already in plan)**

- One manufacturer serial → one `serial_units` row → one `unit_uid`.
- Split/combine changes membership (box/manifest/allocation), never re-mints identity.

**Operator UX**

1. Detect wrong serial paired to wrong item → confirm “Split / re-pair” → calls seal/dissolve/attach APIs; audit.
2. Multi-serial acknowledgement UI on testing desktop + mobile (label-manifest items).
3. Branching: wrong SN on line A → unassign → optional assign to line B without deleting unit history.

**Test checklist — C2**

- [ ] API e2e: existing `label-manifest-api.spec.ts` + attach/unassign cases.
- [ ] Manual: wrong serial on line → split → both lines show correct chips.
- [ ] Provenance / events: no orphan serial_units; no double unit_uid.

---

#### C3. Order number search + pairing (integrations + local DB) — **P1**

**Build on:** `hybridSearch` / `POST /api/ai/retrieve` / `SearchHit`; order tables + integration order numbers; allocation `order_unit_allocations`.

**Change**

1. Testing / walk-in staff surfaces: order search uses AI quick-jump client — **no new search**.
2. Pair unit → order via existing allocate API; show conflict if already allocated.
3. Local DB orders + integrated channel order numbers both return as `SearchHit` with deep links.

**Test checklist — C3**

- [ ] Search order number from integration → hit → open.
- [ ] Search local-only order → hit.
- [ ] Allocate serial to order → pack path sees allocation; double-allocate 409.

---

### Wave D — Mobile unbox + pack UX polish (3–6 days)

#### D1. Critique → implement from existing unbox plan — **P1**

Execute ranked items in `docs/todo/unbox-receive-ux-improvement-plan.md` on **phone** first (then desktop parity):

1. Structured defect chips (`reason_codes` + typed fact table per polymorphic contract).
2. `ReceiveReadinessBar` (data completeness, not nav stepper).
3. Sticky `StationCommitBar` with disabled reasons.
4. Serial capture hardening (scan affordance, dupe check).

Pack path (`/m/pack`, `MobilePackerFlow`):

1. Scan 1 → order details; Scan 2 → what to pack; auto-progress (MASTER §3).
2. Pack photos remain linked (Wave A1 depends on this remaining correct).
3. Large confirm dock; offline queue already partially present — harden.

**Process:** run **critique** skill on live mobile screenshots or storybook; then **improve-ui** skill for normalize/polish with approval gate.

**Test checklist — D1**

- [ ] Existing `mobile-unbox-list`, `mobile-packer-flow`, `mobile-photos` pass.
- [ ] New: readiness bar gates Receive when serial missing.
- [ ] Defect chips appear on label preview / audit.
- [ ] Visual regression optional; manual iPhone SE + iPad widths.

---

### Wave E — Popover design system migration (3–7 days, can parallelize)

#### E1. Standardize on ReceivingClaimModal backbone — **P2**

**SoT shell:** `RightPaneOverlay` (expand/reshape already supported).

**Program**

1. Document a short “Overlay recipe” in design-system notes:
   - Host with `RightPaneOverlayHost` on workbench right panes.
   - Wizard steps = crossfade inside overlay (claim pattern).
   - Size persistence keys namespaced per surface.
2. Migrate high-traffic one-offs first: FBA popovers (also fixes MASTER tracking/condition save bugs), Orders sync, Square product search (if still free-floating), label edit.
3. **Do not** merge ZendeskClaim and ReceivingClaim controllers in one PR — extract shared `ClaimWizardShell` presentation only; keep domain controllers separate.
4. Small menus stay on DS `Popover` / `AnchoredLayer` — claim backbone is for **large reshapeable** surfaces only.

**Test checklist — E1**

- [ ] `zendesk-claim.spec.ts` still passes after any shared shell extract.
- [ ] Resize + escape + backdrop click consistent across migrated popovers.
- [ ] z-index only named tokens (`panelPopover` / `modal`).

---

### Wave F — Walk-in dual display (1–2 weeks)

#### F1. Architecture — **P2**

Two routes, one domain:

| Surface | Route (proposal) | Archetype | Audience |
|---------|------------------|-----------|----------|
| **Front desk / kiosk** | `/walk-in/kiosk` (or `/kiosk/walk-in`) | Station-like idle + canvas of choices; **no** operator chrome | Customer |
| **Staff management** | `/walk-in` (existing, enhanced) | Workbench | Staff |

**Idle state**

1. Full-screen branded idle (letterhead colors + **org-uploaded media**).
2. Media storage: org-scoped object (NAS/S3 pattern already used for photos) keyed `organization_id`; settings upload on Organization settings — not env files.
3. After idle timeout or “Start”, choose **Sales | Repair | Service** with a special loading animation (same org media or default Lottie/CSS).
4. Sales → Square catalog path (existing APIs). Repair → intake stepper (POS-like redesign already in MASTER). Service → warranty/support intake (define minimal MVP: ticket + serial search via hybridSearch).

**Pairing / inventory**

- Staff management display shows live session for kiosk session id (Ably or poll).
- On-spot inventory pairing: AI search (`hybridSearch`) for serial/SKU; link sale/repair line to `serial_units` / stock when present.
- Never hardcode Zoho/Square in customer copy — capability labels.

**Auth**

- Kiosk: device enrollment or long-lived station session (mirror packing kiosk PIN patterns if any); **not** fully public without token. Prefer `PUBLIC_PATHS` only for a tokenized `/walk-in/kiosk/[deviceToken]` if unauthenticated display is required.
- Management: normal staff auth + `walk-in` permission.

**Test checklist — F1**

- [ ] Idle → mode select → sales catalog loads for org with Square connected.
- [ ] Org without Square: sales disabled with capability message.
- [ ] Upload idle animation as org A; org B kiosk does not show it.
- [ ] Repair intake e2e still passes; paperwork letterhead intact.
- [ ] Session pairing: kiosk selects repair → staff screen shows draft within N seconds.
- [ ] Inventory search pairs unit without wrong-tenant leak.

---

### Wave G — Hide unfinished surfaces (ongoing, start early)

#### G1. Policy — **P3 / continuous**

**Do not** use long-lived personal git worktrees as the product gate (collides with “work only on `main`” rule). Prefer:

1. **Nav + permission gate** — unfinished pages omit from `APP_SIDEBAR_NAV` and require `feature.x` or staff admin.
2. **Env/org flag** — `resolveForOrg` for staged surfaces (`surface_composed_render` pattern).
3. **Proxy allowlist** — never add experimental routes to `PUBLIC_PATHS`.
4. **design-demo** — keep for internal, restrict to admin permission or `NODE_ENV=development` if desired.
5. **True dead code** — continue knip waves in `dead-code-triage.md`; delete only with evidence.

**Inventory pass (checklist)**

- [ ] List every `src/app/**/page.tsx` not linked from sidebar or SURFACE_REGISTRY.
- [ ] Classify: production deep-link | internal demo | dead | redirect.
- [ ] For demo: require admin **or** remove from production deploy preview robots.
- [ ] Document in `docs/auth-coverage.md` if gating changes.

**Optional worktrees** only for **local experimental branches** agents use — not for shipping unfinished product to customers. Product exposure is flags/nav, not branch topology.

---

## 3. Dependency graph

```
A1 packer photos ─────────────────────────────┐
A2 testing optimistic ────────┐               │
A3 ship tabs ─────────────────┤               ├─► daily ops confidence
                              │               │
B1 location hierarchy ──► B2 staging loop ────┤
                              │               │
C2 serial split API UI ──► C1 mobile testing ─┤
C3 order pair (hybridSearch) ─┘               │
                                              │
D1 mobile unbox/pack polish ──────────────────┤
E1 popover backbone (parallel anytime) ───────┤
F1 walk-in kiosk (after C3 + branding) ───────┘
G1 gating (start Wave A, finish continuous)
```

**Parallelizable:** A1 ∥ A2 ∥ A3 ∥ E1 ∥ G1.  
**Serial:** B1 → B2; C2 substrate → C1 polish; A1 before claiming pack photos “done” in D1.

---

## 4. PR plan (incremental, reviewable)

| PR | Title | Depends | Primary files / areas |
|----|-------|---------|------------------------|
| **PR-1** | fix(dashboard): show packer photos in order detail stacks | — | `DashboardDetailsStack`, order workbench stacks, `ShippedDetailsPanelContent` props, e2e |
| **PR-2** | fix(testing): instant pass/fail optimistic + scoped invalidation | — | tech testing controllers, `ScanTestingPanel`, query keys |
| **PR-3** | feat(dashboard): TabSwitch Unshipped/Shipped on table chrome | — | `DashboardOrdersView` / Unshipped+Shipped headers, `dashboard-search-state` |
| **PR-4** | feat(inventory): location_kind hierarchy + placeUnit domain | — | migration, `location-queries`, move API, unit tests |
| **PR-5** | feat(stations): Place station scan-to-location | PR-4 | new station surface or warehouse mode, scan routing |
| **PR-6** | feat(receiving): staging chips → real locations closed loop | PR-4 | triage staging, putaway |
| **PR-7** | feat(testing): serial re-pair / label-manifest operator UI | — (API exists) | testing panel, manifest UI, attachSerial |
| **PR-8** | feat(mobile): testing QR + large pass/fail + details edit | PR-2, PR-7 | `ScanTestingPanel`, mobile QR sheets |
| **PR-9** | feat(search): order pair from hybridSearch in testing/walk-in | — | allocate API consumers, AiQuickJump |
| **PR-10** | feat(mobile): unbox readiness/defects/commit + pack multi-scan | — | mobile receive/pack, reason_codes |
| **PR-11** | refactor(ui): ClaimWizardShell extract + migrate FBA/order popovers | — | `RightPaneOverlay` consumers |
| **PR-12** | feat(walk-in): kiosk idle + dual display + org media | PR-9 | new kiosk route, org asset upload, session channel |
| **PR-13** | chore(nav): gate experimental pages + auth-coverage update | — | sidebar, permissions, proxy review |

Each PR: permission registry updates if new routes; `recordAudit` on mutations; no `.env` commits.

---

## 5. Cross-cutting quality bar

### 5.1 UX / UI

- Run **critique** then **improve-ui** (approval gate) on: Place station, mobile unbox, mobile pack, kiosk idle.
- Archetypes: Place = Station; inventory tree = Workbench; kiosk idle = Station-like; staff walk-in = Workbench; ship tables = Workbench list (tabs are mode switch, not a second archetype).
- Phone: thumb-zone primary actions, safe areas, 16px+ body, no hover-only.

### 5.2 Correctness

- Idempotent scans (`clientEventId`).
- 409 conflicts surface as station fail cards.
- Search only via hybrid retrieval SoT.
- Photos only via `photo_entity_links` polymorphic pattern.

### 5.3 Testing pyramid per wave

| Layer | Required |
|-------|----------|
| Unit (Deps fakes) | Every new domain helper |
| Route permission | New routes in `route-permission-manifest.test.ts` |
| E2E happy path | One per wave P0/P1 |
| Manual device | iPad kiosk + phone unbox/pack before calling wave done |
| Tenancy | At least one cross-org negative per data-touching wave |

### 5.4 Definition of Done (wave)

- [ ] Acceptance criteria in this doc checked.
- [ ] No isolation violations (testing vs receiving).
- [ ] No new hardcoded vendor strings on operator UI.
- [ ] Real data visible in UI (no mock racks / fake photo arrays).
- [ ] MASTER.md open bugs that this wave touches flipped or explicitly deferred with reason.

---

## 6. Key decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Ship tabs | Enhance existing URL modes with `TabSwitch` on table chrome | Tables already exist; rebuild would thrash queries |
| Location model | `location_kind` + `parent_id` on `locations`, not separate tables | Matches current bins; one barcode resolver |
| Place UX | Station scan-to-place | Hands-busy; archetype rules |
| Packer photos | Flip stack flag + hydrate; no new entity type | PACKER_LOG link already correct |
| Search/pairing | `hybridSearch` only | SoT invariant |
| Kiosk auth | Device token / enrolled station, not fully open public | Avoids open inventory write surface |
| Unfinished pages | Flags + nav + permissions, not long-lived product worktrees | Repo rule: work on `main`; worktrees for agent isolation only |
| Popover SoT | `RightPaneOverlay` for large reshapeable; DS Popover for menus | Matches claim backbone already proven |
| Walk-in media | Org-scoped upload by `organization_id` | Multi-tenant; letterhead pattern exists |

---

## 7. Open questions (need product input before F/B policy locks)

1. **Place policy:** Must operator scan leaf position every time, or may scanning a rack place to “next free position”?
2. **Kiosk network:** Same iPad switching apps vs two devices (customer display + staff laptop)? Dual-device needs session channel; single-device is mode switch only.
3. **Service mode on kiosk:** Full warranty intake MVP or “take a number / notify staff” only?
4. **Ship tabs:** Include Warranty (and FBA?) in the same table header `TabSwitch`, or only Unshipped/Shipped?
5. **design-demo in production:** Admin-only vs leave signed-in accessible?

---

## 8. Suggested first sprint (highest ROI slice)

**Goal:** operators feel “the app tells the truth” within one sprint.

1. **PR-1** packer photos on order detail  
2. **PR-2** testing instant pass/fail  
3. **PR-3** ship table TabSwitch  
4. Start **PR-4** location_kind migration design review  
5. **G1** quick pass: ensure design-demo / wipe not in customer-facing nav  

**Exit demo script**

1. Pack order + photo → find order in dashboard search → see photos.  
2. Test unit Pass → status updates immediately on `/test` and mobile.  
3. Toggle Unshipped/Shipped from table header without hunting sidebar.  
4. (Stretch) Scan a bin barcode and a unit → unit shows on that bin in inventory UI.

---

## 9. References (code & docs)

- Dashboard: `src/app/dashboard/page.tsx`, `DashboardOrdersView`, `dashboard-search-state.ts`
- Packer photos: `ShippedDetailsPanelContent`, `DashboardDetailsStack`, `/api/packing-photos`, `photo_entity_links`
- Testing: `recordTestVerdict.ts`, `/test`, `ScanTestingPanel`, isolation doc
- Inventory: `location-queries.ts`, `locations` schema, warehouse floorplan plan
- Serial pairing plan: `docs/todo/serial-label-pairing-split-combine-plan.md`
- Unbox UX plan: `docs/todo/unbox-receive-ux-improvement-plan.md`
- MASTER bugs: `docs/roadmap/MASTER.md` §1–3
- Overlay: `RightPaneOverlay.tsx`, `ReceivingClaimModal`
- Walk-in: `/walk-in`, `/api/walk-in/*`, letterhead
- Dead code: `docs/partial/dead-code-triage.md`
- Surfaces: `src/lib/stations/surface-keys.ts`

---

*Inventory date: 2026-07-11. Re-verify file line anchors before implementation if HEAD has moved (user commits mid-session via GitHub Desktop).*
