# HANDOFF — Inventory onto the contextual sidebar, then a Pre-pack labels mode

**Paste everything below the rule into a fresh session pointed at
`/home/michaelgarisek/Projects/cycleforge-lanes/prod`.** Written 2026-09-28, after FBA, Sourcing
and the "parent tier on every mode" law landed. Phase order: **1 Port Inventory → 2 Pre-pack
labels mode (print + store) → 3 Pair pre-pack labels to locations.** Phases 2–3 are the ROI;
Phase 1 is the frame they hang from. Each phase ends with a browser proof on `:3050`.

## Status 2026-09-28 (landed — read before continuing)

- **Owner rulings:** the QC / pre-box label is the **per-unit product label** (`unit_uid` +
  serial, template `product`) — not an `H-` box, not a `KIT-` manifest; its face stays as is.
  It lives in a new mode page **QC labels** (`/inventory/qc-labels`, tone amber). Inventory
  wears emerald; its landing mode is labelled **Warehouse** (a mode may not share the lane's
  name). Digits bind only the painted views. A pick scan of another unit's label is refused
  with both identities — no allocation swap.
- **Phase 1 done:** `LANE_DOORS.inventory`, `NAV_GO_KEYS.inventory` (`I`, `Q`),
  `NAV_PAGE_DECLS.inventory` / `['qc-labels']`, parity rows (gap-free), glyphs, both pages
  `contextual`. `InventoryDeskFrame` is `bare` + `NavPageActions`. Stock's Find/State,
  Replenish's `rtab`/`rsku`/`rstatus` and the Locations tool dropdown moved to the sidebar.
- **Pick → outbound loop (the blocker):** a pick never wrote the order's serial. The outbound
  order reads serials from `tech_serial_numbers.order_id` (`orders-list.ts`); QC writes the
  unit's lineage row unbound; `confirmPick` (`src/lib/picking/sessions.ts`) and
  `/api/picking/units/scan` only moved the allocation + unit. And the pickers' matchers
  (`picker-shared.ts`, `directed-pick.ts`) and the scan routes compared the scan to the raw
  serial, while the label encodes `unit_uid` / `(01)…(21)…` / `U-…` — so the label never
  matched. Fixed by `src/lib/picking/pick-scan-unit.ts` (one scan→unit grammar) and
  `src/lib/picking/pick-serial-link.ts` (`linkPickedSerialToOrder` / unlink, in the pick's
  transaction, QC tester carried forward, idempotent).
- **Not done:** Phase 3 (pair `H-` labels to bins) was not part of this pass.

---

You are porting the **Inventory** lane onto the contextual left sidebar, then building its
highest-ROI new mode: **pre-pack labels**. Staff print a run of QC / pre-pack labels ahead of
time, the system stores every printed label as a real record, and each label is later
**paired to a warehouse location label** (bin), so a scan of either one answers "what is in
here, and where is it".

## 0. Read first (in this order)

1. `AGENTS.md` — probe only `http://localhost:3050`; lane unit `cycleforge-lane@prod`
   (restart it if `:3050` returns 000 — Turbopack panicked twice on 2026-09-27/28).
2. `docs/refactors/sidebar/HANDOFF-contextual-page-port.md` — the per-page port loop (steps
   1–7, traps, proof list). Follow it for Phase 1.
3. `docs/refactors/sidebar/HANDOFF-outbound-sidebar-verify.md` — the check matrix. Row **7b**
   is the new law (below). Add Inventory rows; don't fork the file.
4. `docs/design-system/HANDOFF-triage-family-contract.md` — "The sidebar half of the contract":
   status chips in the middle; every sort / filter / date / Find in the sidebar; URL is the only
   state; one param, one control; `pages.ts` imports must be server-safe.
5. `docs/mobile-first/SURFACE_LAW.md` — a verb with no `/m` path is an **incomplete** feature.
   Pairing a label to a bin is a floor verb: it must work by scanning on a phone.
6. `node tools/design-mcp/ds.mjs contract "<intent>"` before writing any UI (`ContextualSidebar`,
   `NavModeSwitcher`, `NavFilters`, `TriageCardList`, `RecordCard`, `KeyboardKey`).

Shared tree: `git status --short` first. Other sessions are live (orders cards, Labels & docs,
Unboxed / Inbound History, auth, boot/welcome). Inventory has foreign edits right now — e.g.
`src/components/inventory/{ByUnitView,PulseWorkspace,TriageWorkspace}.tsx`,
`src/app/inventory/{events,holds,returns,throughput,health/**}`, `src/app/warehouse/**`. Re-read a
file right before each edit, check its mtime (`find <paths> -mmin -15`), never revert what you
did not write, never commit without asking, report red in other people's files with
`git status --short <file>` proof. If a file changes under you, stop and re-read. Probe
hygiene: use `tests/.auth/admin.json` (`storageState`), never mint sign-ins per run; wait for
`[data-nav-switcher="view"]`, not `networkidle`; ≥200 ms after `Escape`, ≥30 ms between `G` and
its letter; delete probe scripts from `/tmp` when done.

## What landed already (don't redo)

- **Rollout:** `ai-chat`, `incoming`, `fba`, `label-intake`, `sourcing` are `contextual`
  (`src/lib/nav/context/rollout.ts`). `outbound` is still `legacy` in the map (staff override
  dogfood). `inventory` is `legacy`.
- **Parent tier on every mode (operator 2026-09-28, law):** every page of a lane that has a
  door (`LANE_DOORS`, `src/lib/nav/lanes.ts`) shows `‹ <Lane>` and the SAME mode card
  (`NavModeSwitcher`) with itself current, door first — never a `‹ <Page>` row. Derived in
  `src/lib/nav/context/build.ts` (`modeLaneOf` / `laneModeRows`), pinned by `resolve.test.ts`
  ("every mode of a door lane…"), written into `src/design-system/pinned.json`
  (ContextualSidebar law). **A page you add to the Inventory lane inherits this for free once
  the lane has a door** — you declare nothing per page.
- `parity.ts` `pageStops` skips the `.modes` section (modes are other pages, not views).
- Controls contract: `NavControls` = `sort` (+ `dirParam`), `staff`, `dateRanges`, `choices`
  (single-choice, no counts, absent = the list's default, re-tap clears; a vocabulary omits its
  default value — see `SOURCING_*_OPTIONS` in `src/components/sourcing/sourcing-shared.ts`).
- Reference ports to copy: **Sourcing** (old context panel → `choices` rows; a record picker
  moved from the sidebar into the stage, `BoseModelPickerPane`; `layout.tsx` = `DeskPageLayout
  bare` + `NavPageActions`) and **FBA** (a page's own tab row → sidebar views, then deleted).

## Facts (measured 2026-09-28)

- `SIDEBAR_PAGE_NAV.inventory`: href `/inventory`, `deskChrome`, `railless`, **no `tone`**,
  domainGroup `inventory`, and it is the **only page in its lane** — so today there is no mode
  card and no `LANE_DOORS.inventory`. Children (11): Stock `/inventory/stock` · SKU Exceptions
  `/inventory/sku-exceptions` · Ledger `/inventory` · Tracking Exceptions `/inventory/triage` ·
  Pulse · Graph · Replenish `/inventory?section=replenish` · Locations `/inventory/locations` ·
  Reason Codes · Quick Picks `/inventory/favorites` · Health.
- `parityGaps('inventory')` → `[]`, but its parity list has **only 5 view rows** (stock,
  sku-exceptions, ledger, replenish, locations). It declares no params, filters, actions or
  saved views, so `[]` means "not inventoried yet", not "ready". Fill the rows as you
  inventory each view's real controls (tab rows, filter menus, toolbars, week pills).
- `NAV_PAGE_DECLS.inventory` does not exist. `NAV_VIEW_ICONS` has no `inventory.*` glyphs.
- Frame: `src/app/inventory/layout.tsx` → `InventoryDeskFrame`
  (`src/components/inventory/InventoryDeskFrame.tsx`) → `DeskPageLayout` **without `bare`**, so
  it paints the children as a header tab row. Stock / SKU Exceptions / Replenish run flush
  (`LEDGER_PATHS`).
- Inventory is rail-less (operator 2026-09-15): `SidebarContextPanel` has no inventory branch
  and `CONTEXT_PANEL_ROUTE_KEYS` dropped it — there is no old panel to delete, only the tab row.
- `LANE_MOBILE_FIRST.inventory = 'desk-only'` (`lanes.ts:78`). Phone scans already land:
  bin codes → `/inventory?bin=…` (`src/lib/barcode-routing.ts`), `H-…` → `/m/h/[id]`,
  `/m/loc/[code]` (location hub), `/m/pair/[code]` (`MobilePairLocation`: "pick what belongs in
  a scanned location").
- **Pre-pack label prior art (reuse it — do not mint a second identity family):**
  - `handling_units` (`2026-06-08_handling_units_lpn.sql`): `code` = `H-{id}`, status
    `OPEN → STAGED → IN_TEST → CLOSED`, **`location_id → locations(id)` already exists**
    (indexed). Queries: `src/lib/neon/handling-unit-queries.ts` (`createHandlingUnitsBulk`,
    `assignUnitsToHandlingUnit`, `listHandlingUnits` filters by location, `dissolveHandlingUnit`).
  - `POST /api/handling-units/bulk` — mint N `H-` boxes in one call, idempotent. **No desk UI
    calls it** except `TotePlateWorkspace` (Inventory › Locations › Totes tab,
    `src/components/warehouse/{LocationsWorkspace,TotePlateWorkspace}.tsx`) via
    `src/lib/print/printLabelRun.ts` (`handlingUnitLabelToFace`, `printLabelFacesJob`).
  - **Gap:** `location_id` is written only at INSERT. There is **no writer that pairs or moves
    an existing `H-` label to a bin** — that is Phase 3.
  - `label_print_jobs` (`2026-07-06a`): every print is a row (`handling_unit_id`,
    `template_id` e.g. `'lpn'`, `qr_payload`, `is_reprint`, `client_event_id` idempotency) —
    this is "stored in the system".
  - `label_manifests` (`2026-07-06b`, `KIT-…`, `PREBOX | KIT | MASTER_CARTON`,
    `OPEN → SEALED → DISSOLVED`): one master label over N serial units. Prebox flow lives in
    Unbox (`PreboxWizard`, `PreboxDisplayHost`).
  - Location labels: `src/lib/print/printLocationLabel.ts`, special-bin print page
    `src/app/inventory/locations/print/special-bin/page.tsx`.
  - Printing channels + queue: `src/lib/label-prints/{contracts,print-queue,print-route}.ts`
    (Labels & docs session's — read, don't edit).

## Phase 1 — Port Inventory (the frame)

1. **Snapshot** `GET /api/nav/context?path=/inventory` and `parityGaps('inventory')`.
2. **Inventory each view's real controls** (tab rows inside views, filter menus, toolbars, week
   pills, bin/location pickers) and add one parity row per control. Grep for bare-digit
   handlers before `viewKeys` (`/^[1-9]$/`, `key === '1'`). With 11 views, only `1`–`9`
   bind — ask the owner which views keep a digit, or trim/merge views first
   (Reason Codes, Quick Picks and Health look like settings, not lists).
3. **Declare** `NAV_PAGE_DECLS.inventory` (search per view — only where the list actually reads
   the param, else the ⌘K face; `choices` / `sort` / `staff` / `dateRanges`; saved views where a
   view has a `SAVED_VIEW_PARAM_KEYS` surface; verbs as `actions`).
4. **Glyphs + tone:** give `SIDEBAR_PAGE_NAV.inventory` a `tone` (it has none — ask the owner
   or reuse the colour Inventory already wears elsewhere) and add `NAV_VIEW_ICONS['inventory.*']`.
5. **Frame:** `InventoryDeskFrame` → `DeskPageLayout bare` + `NavPageActions`. Keep its flush
   `LEDGER_PATHS` behaviour. Delete the tab row in the same change.
6. **Canary** `nav.contextual.inventory = contextual` (staff), probe every view (port handoff §4:
   title, pills, digits, reload + back/forward, Esc, no `Hydration failed`), then flip
   `NAV_CONTEXT_ROLLOUT.inventory` and reset the override to `inherit`.

## Phase 2 — Pre-pack labels mode: print a run, store every label

**Ask the owner first (one batched question), then write a pattern card in
`docs/design-system/RECORD-CARD-MIGRATION.md` and get it signed off before code:**
- **Grain:** is a "QC / pre-pack label" an `H-` handling unit (a box/tote label, one per
  physical pre-pack) — recommended, it already has status + `location_id` + bulk mint + print
  jobs — or a per-unit `U-` label, or a `KIT-` manifest? Pick one family; never mint a new one.
- **Where it lives:** a new **mode page** in the Inventory lane (e.g. `SIDEBAR_PAGE_NAV` id
  `prepack`, label "Pre-pack labels", href `/inventory/prepack`) — recommended, because the
  owner called it a mode — or a view under Inventory. As a mode page it needs
  `LANE_DOORS.inventory = 'inventory'` and `NAV_GO_KEYS.inventory` letters (e.g. `I` Inventory,
  `P` Pre-pack); the mode card, `‹ Inventory` and the resolve.test law then apply automatically.
- **Views** (candidates): Blank (printed, not yet paired) · Paired (has a bin) · All; status
  chips over the list; Find by `H-` code / bin code / SKU.
- **Verbs:** Print a run (N labels, copies, printer) — the desk header's primary action;
  Reprint (writes `label_print_jobs.is_reprint`); Void.

Build (after sign-off), reusing the triage family (`TriageCardList` / `RecordCard` /
`TriageSelectBar` / `DeskRecordPlane`) with a pure `prepackCardModel` adapter and a data host —
no bespoke list:
1. Mint + print: `POST /api/handling-units/bulk` then the existing `printLabelRun` path;
   every sticker is a `label_print_jobs` row (`template_id: 'lpn'`). Lift the run form out of
   `TotePlateWorkspace` into a shared piece rather than copying it; the Totes tab keeps working.
2. List: `listHandlingUnits` (add filters the views need — "no location", "has location"),
   one card per `H-` label: code, status, bin (or "Not paired"), printed at/by, reprints.
3. Record: the label's history (print jobs, pairing moves, members).

## Phase 3 — Pair pre-pack labels to location labels

1. **Writer** (the gap): `POST /api/handling-units/[id]/location` `{ locationCode }` (or
   `null` to unpair) — resolve the bin through the same location lookup the bin scan uses,
   set `handling_units.location_id`, write an audit row (`recordAudit`, like
   `/api/label-manifests`), idempotent by `client_event_id`. Tenant-scoped (`withAuth`,
   org-led; see the `org-scope` skill). Unit tests over the query with Deps injection
   (`domain-unit-test` skill): pair, re-pair (move), unpair, unknown bin, another org's bin.
2. **Floor (mobile-first, required):** scan the `H-` label → `/m/h/[id]` gets a "Put away in
   a bin" door → scan the bin label → paired. And the reverse from `/m/loc/[code]` /
   `/m/pair/[code]`: scan a bin, then scan pre-pack labels into it. Reuse `MobilePairLocation`
   and the scan sinks; no second scan grammar.
3. **Desk:** the Pre-pack card shows its bin; the record plane has Pair / Move / Unpair; Find
   takes a bin code and lists what is paired there. `/inventory/locations` shows each bin's
   pre-pack labels.
4. Recommended later: show paired pre-packs in the bin scan answer (`/inventory?bin=…`).

## Done means (every phase)

- `node --import tsx --import ./scripts/register-server-only-shim.cjs --test src/lib/nav/context/resolve.test.ts src/lib/sidebar-navigation.test.ts src/lib/nav/*.test.ts src/lib/routing/*.test.ts`
  green; `parityGaps(<page>)` → `[]` with REAL rows (not an empty list).
- A Playwright probe on `:3050` with the port handoff §4 evidence; screenshots of the sidebar
  (x 0–420) and header for every view; for Phase 3, a phone-viewport probe of scan H → scan bin.
- New API: route tests + `pnpm verify:fast` (known foreign red on 2026-09-28:
  `src/lib/auth/pin.ts:159` typecheck; `sidebar-navigation.test.ts` "incoming has only On the way
  and History" from the Unboxed rename). Report foreign failures separately with proof.
- Check-matrix rows added; migrations only if the owner approves a schema change (the
  `db-migration-author` skill) — the current schema already carries `location_id`.
