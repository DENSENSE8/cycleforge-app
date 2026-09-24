# HANDOFF — Retire the old mobile display rules; make the exoskeleton the only law (served + gated by design-mcp) (2026-09-24)

Paste this whole file into a fresh session in `~/Projects/cycleforge-lanes/prod`. Read first, in
order: `AGENTS.md`, `docs/handoff/mobile-entity-exoskeleton-HANDOFF.md` (the per-entity spec),
`docs/handoff/mobile-exoskeleton-CONTINUE-HANDOFF.md` (Task 1–2 are the build plan this file
turns into law), `docs/mobile-first/SURFACE_LAW.md`, `tools/design-mcp/README.md`,
`src/design-system/pinned.json`. Do not commit; the owner commits. The tree carries other
lanes' uncommitted work (kiosk, paperwork, manuals, outbound ledger): touch only what the task
needs, never revert anyone else's hunks.

## The owner's ask (verbatim, 2026-09-24)

> "how would you update it so deleting those old mobile display rules and always ruled to these
> new rules for building this like the MCP DS for example"

> "you are building with old DS logic, see the repair REP-0000 DS details for a single grouping
> on the most top mounted then grouped into exact actions like photos below a compact
> information display on top, focus mainly on mobile"

Meaning: there must be ONE mobile record grammar — the repair hub exoskeleton — and the tools an
agent consults (design-mcp `ds_contract` / `ds_critique` / gates, `pnpm verify:fast`) must hand
out that grammar first and **fail** anything built the old way. The old rules are deleted, not
left beside the new ones.

## The one grammar (what "new rules" means)

```
┌ MobileDetailTopBar ─ ‹ Back · IDENT (mono) · meta ─────────── Scan ┐
│ DetailSummaryCard (read-only; whole card → /<entity>/[id]/info)     │
│ DetailAck (server-stamped, dismissable)                             │
│ DetailNav doors — one per exact job (Photos · Locations · …)        │
└ DetailDock: ≤3 verbs, one primary ──────────────────────────────────┘
/info = every fact (DetailFactRow) + the ONLY edit (pencil in the bar → BottomSheet)
/<job> = one job per screen, its own sticky job bar (e.g. Take photo)
Data: React Query facets `qk.<entity>.hub(id, facet)`; realtime in `/m/<entity>/[id]/layout.tsx`
Back: nav-trail via MobileDetailTopBar `backHref` — never `router.push` a parent
Mode: ModeRegion triage, bg-mode-panel, rounded-mode, px-mode-page
```

Reference implementations (both live, verified at :3050):
- Repair `src/app/m/(shell)/rs/[id]/**` (the original).
- **SKU exception** `src/app/m/(shell)/on-hold/[sku]/**` — built this session as the second
  adopter: hub `page.tsx`, `info/`, `photos/`, `locations/`, `pair/`, realtime `layout.tsx`;
  components `src/components/mobile/onhold/{SkuExceptionScreen,SkuExceptionInfoCard,SkuExceptionEditSheet,sku-exception-hub-rows,useSkuExceptionPhotoUploads}`;
  keys `qk.skuExceptions` in `src/queries/keys.ts`; hooks `src/hooks/useProvisionalSkus.ts`.
- DS kit so far: `src/design-system/components/DetailSummaryCard.tsx`,
  `src/design-system/components/DetailDock.tsx` (new this session; `RepairWorkbenchDock` is now a
  thin mapper over it; pinned in `pinned.json`, `ds.mjs contract "mobile entity hub verbs dock"`
  returns it first), `src/components/mobile/detail/DetailParts.tsx`.

## Task 1 — inventory the old rules (read-only, write the list into this file before deleting)

For each item: live callers (`ds.mjs` / code-graph `impact_analysis`), keep / rewrite / delete,
and why. Known candidates:

1. `docs/mobile-first/SURFACE_LAW.md` §7 "Component kit (build toward)": `MobilePhoneFrame`,
   `MobileStepShell`, `MobileQueueShell`, `MobileRecentStrip` — check which exist. Rewrite §7 as
   the exoskeleton kit (DetailSummaryCard · DetailNav · DetailFactRow · DetailAck · DetailDock ·
   DetailHubScreen) + the list/job-screen kit that stays (below). Delete unbuilt names.
2. `src/design-system/pinned.json` mobile record entries: `ItemCardRow`, `ItemRecordMobileMeta`,
   `ItemRecordMobileStage`, `ItemRecordQtyBadge`, `MobilePhotoCountBadge`, `BottomSheet`
   ("phone row detail, list row opens a detail, handheld detail, mobile drill-in"). A useWhen that
   answers "record / detail / drill-in" with a sheet or a card row competes with the hub. Rewrite
   those useWhen/doNot so they answer LIST rows only and point record jobs at `DetailSummaryCard`;
   `BottomSheet` keeps "edit sheet from /info pencil, confirm, pickers" and loses "detail".
3. `.cursor/rules/mobile-first-surface.mdc` (alwaysApply) — align with the new §7 or delete lines
   that prescribe the old kit.
4. `MobileTriagePage` / `TriageRow` (`src/components/mobile/triage/`) — KEEP for search-and-pick
   job screens (pair location, pair to Zoho SKU); forbid it as an entity record/detail screen.
5. Old per-entity record screens listed in the continuation audit table (`/m/h/[id]`, `/m/r/[id]`,
   `/m/orders/[orderId]` bento, `/m/b/[barcode]` redirect) — they are the unported baseline, not
   rules; they shrink as each is ported.
6. `docs/handoff/*` that prescribe the retired patterns (e.g. mobile record cards, "row → sheet"
   for entity detail): add a one-line "superseded by mobile-ds-law-exoskeleton-HANDOFF.md" at the
   top rather than editing history.

### Task 1 result — the list (2026-09-24, cloud session) · AWAITING OWNER APPROVAL

Callers are `grep -rlE "import .*\b<Name>\b" src` counts (code-graph was not reachable from
the cloud session; re-run `impact_analysis` before any delete). Nothing below is deleted yet.

| # | Item | Live callers | Verdict | Why |
|---|---|---|---|---|
| 1a | SURFACE_LAW §7 `MobilePhoneFrame` | 0 (never built) | **delete** | unbuilt name; `MobileShell` owns the phone column |
| 1b | SURFACE_LAW §7 `MobileRecentStrip` | 0 (never built) | **delete** | unbuilt; Back is nav-trail via `backHref` |
| 1c | SURFACE_LAW §7 `MobileStepShell` | 0 (never built) | **delete** | unbuilt; a job screen is `DetailRecordFrame` + its own sticky job bar |
| 1d | SURFACE_LAW §7 `MobileQueueShell` ("row → sheet") | 0 (never built) | **delete** | unbuilt, and "row → sheet" is the pattern that competes with the hub for an entity |
| 1e | SURFACE_LAW §7 `MobileActionSlot` | 5 files | **keep** | real; the top-bar verb for list/queue pages, not records |
| 1f | SURFACE_LAW §7 table | — | **rewrite** | two groups: *Record (the exoskeleton)*: `DetailHubScreen` · `DetailRecordFrame` · `DetailSummaryCard` · `DetailNav` + `detailDoor` · `DetailFactRow` · `DetailAck` · `DetailDock`. *List / job screens (stay)*: `MobileShell`, `MobileActionSlot`, `ItemCardRow`, `MobileTriagePage`, `BottomSheet` (edit / confirm / picker) |
| 2a | pinned `ItemCardRow` | 9 files | **keep, rewrite useWhen/doNot** | LIST row only; add "a row opens the entity's hub (`/m/<entity>/[id]`), never a record sheet or card" |
| 2b | pinned `ItemRecordMobileMeta` | 2 files | **keep, rewrite doNot** | list-row facts cluster; add "not a record screen — the record is `DetailHubScreen`" |
| 2c | pinned `ItemRecordMobileStage` | only re-exported by `item-record/index.ts`; no screen imports it | **delete candidate** | list-row stage mark nobody mounts; confirm with code-graph, then delete component + pin |
| 2d | pinned `ItemRecordQtyBadge` | 2 files | **keep** | list-row qty; no record wording to remove |
| 2e | pinned `MobilePhotoCountBadge` | 2 files | **keep, rewrite useWhen** | drop "phone card"; a record's photo count is the Photos door meta |
| 2f | pinned `BottomSheet` | 41 files | **keep, rewrite useWhen/doNot** | lose "phone row detail, list row opens a detail, handheld detail, phone drill-in"; keep "edit sheet from the /info pencil, dock verb sheet, confirm, pickers" |
| 3 | `.cursor/rules/mobile-first-surface.mdc` | — | **gone already** | the `.cursor` tree was removed 2026-09-22; delete the stale pointers to it in `SURFACE_LAW.md` (header + §9) and `src/lib/mobile/mobile-first-surface.ts` line 5 |
| 4 | `MobileTriagePage` / `TriageRow` | 3 screens (pair location, on-hold list, merge) | **keep** | search-and-pick job screens; the law already fails it as a hub (`hub-triage-page`) |
| 5 | unported record screens `/m/u/[id]` `/m/h/[id]` `/m/r/[id]` `/m/b/[barcode]` `/m/orders/[orderId]` `/m/id/scan-out/[orderId]` | — | **baseline, not rules** | `DETAIL_HUB_UNPORTED_BASELINE = 6`, shrink-only; `/m/u/[id]` also carries a heading and `router.back()` |
| 6a | `docs/handoff/mobile-repair-workbench-NEXT-HANDOFF.md` | — | **add superseded line** | lists `DetailSectionHeading` as an exoskeleton part; the law forbids a heading on a hub |
| 6b | `docs/handoff/daily-*-HANDOFF.md` "detail sheet" | — | **leave** | daily checklist items are list rows, not scanned entities |
| 6c | `DetailSectionHeading` (component) | unit hub + repair sub-screens | **keep** | legal on job screens / `/info`; forbidden only on hubs |

## Task 2 — make the exoskeleton law, served and gated (copy the sku-identity pattern)

One law module, one guard, one gate; the MCP tool reads the same module so it cannot disagree
with the gate.

- `src/lib/mobile/detail-hub-law.ts` (+ `.test.ts` for its pure predicates) and
  `src/lib/mobile/detail-hub-cohort.ts`:
  - **Peers:** `/m/rs/[id]` (ported), `/m/on-hold/[sku]` (ported), `/m/u/[id]`, `/m/h/[id]`,
    `/m/r/[id]`, `/m/b/[code]`, `/m/orders/[orderId]`, `/m/id/scan-out/[orderId]`.
  - **Presence (engine contract) on a hub page:** `DetailSummaryCard` (or a mapper whose only
    child is it), `DetailNav`, `MobileDetailTopBar`, `DetailDock`.
  - **Absence on a hub:** an `Edit` text button or pencil (pencil only on `/info`); a heading
    above the card; `router.push` for Back; a nested `<main>`; `useEffect`+`fetch` for hub facets
    (React Query only); more than 3 dock verbs or more than one primary; a raw sticky-bottom
    `<nav>` with a Button grid (that is `DetailDock`); `MobileTriagePage` as the record screen.
  - **Absence on `/info`:** any write control other than the bar pencil.
  - **Baseline:** shrink-only count of unported hubs (like `MOBILE_GRAY_GROUND_BASELINE` in
    `src/lib/mobile/mobile-ground.ts`).
- `scripts/detail-hub-guard.ts` (`--json`, `--file`), wired into `pnpm verify:fast` exactly like
  the ground and sku-identity guards (find their wiring in `package.json` / the verify script).
- `tools/design-mcp/design-mcp.profile.json`: add gate `ds_detail_hub`
  (argv `scripts/detail-hub-guard.ts --json`, `fileArg --file`) beside `ds_boundary`,
  `ds_nav_names`, `ds_sku_identity`; add `extraAxes[]` `detail-hub` (sources: the law + cohort)
  so `ds_tokens({ axis: 'detail-hub' })` serves the constants. `ds.mjs detail-hub` subcommand
  following `mobile-ground`; README row (also fix the README's `smoke.mjs` line — the engine's
  smoke lives in `~/Projects/Garisek-OS/tools/design-mcp/smoke.mjs`).
- Pin the kit: `DetailHubScreen` (slots topBar · card · ack · rows · dock · loading/error — the
  generic of `SkuExceptionScreen` + the repair hub layout) and a `detailDoor(base, id, title,
  icon, {meta, enabled})` helper in `src/lib/mobile/` (from `useRepairHubRows` /
  `sku-exception-hub-rows.tsx`). Migrate repair and SKU exception onto both (clean cutover, no
  aliases). Each pin: useWhen phrased as the job, doNot, law citing operator 2026-09-24.
- Prove the gate: plant one violation per rule in a fixture, watch the guard fail, remove it.
  `ds.mjs contract "<job phrase>"` must return the new pin FIRST for: "mobile scanned entity
  hub", "mobile record detail", "phone drill-in", "hub verbs", "entity details and edit".

### Task 2 result (2026-09-24, cloud session) — built, gated, green

- Law `src/lib/mobile/detail-hub-law.ts` (+ `.test.ts`, 16 tests: one planted violation per rule),
  cohort `src/lib/mobile/detail-hub-cohort.ts` (8 peers, 2 ported, `DETAIL_HUB_UNPORTED_BASELINE = 6`).
- Guard `scripts/detail-hub-guard.ts` (`--json`, `--file`) → gate **Detail hub** in
  `scripts/verify-profile.mjs` (`always`). Proven: planted Edit/heading/router.back/`<main>`/
  useEffect+fetch on the repair hub, an `<input>` on SKU-exception `/info`, and a 4-verb/2-primary
  `RepairWorkbenchDock` → exit 1 listing all eight; reverted → exit 0. Baseline 7 → "drop it".
- Kit: `src/design-system/components/DetailHubScreen.tsx` (`DetailHubScreen` + `DetailRecordFrame`),
  `src/lib/mobile/detail-door.ts` (`detailDoor`). Repair and SKU exception hubs cut over (no aliases);
  `SkuExceptionScreen` is now a thin mapper over `DetailRecordFrame` (+ `useSkuExceptionRecord`).
- Pins: `DetailHubScreen` added (useWhen: mobile scanned entity hub, mobile record detail, phone
  drill-in, entity details and edit, …); `DetailSummaryCard` narrowed to the card slot so it no
  longer competes for "mobile scanned entity hub". `detailDoor` lives in `lib` (not a walked home) —
  served through the `DetailHubScreen` pin and the `detail-hub` axis.
- `ds.mjs detail-hub [file]` subcommand; README row + naming + `detail-hub` axis + smoke path fixed.
- **Not done from the cloud (needs the laptop):**
  1. `tools/design-mcp/design-mcp.profile.json` is a symlink to the MAIN checkout
     (`~/Projects/cycleforge-app/tools/design-mcp/design-mcp.profile.json`), outside this worktree.
     Add beside `ds_sku_identity`:
     gate `ds_detail_hub` → argv `["scripts/detail-hub-guard.ts", "--json"]`, `fileArg: "--file"`;
     `extraAxes[]` entry `detail-hub` with sources `src/lib/mobile/detail-hub-law.ts`
     (`DETAIL_HUB_KIT`, `DETAIL_DOCK_MAX_VERBS`, `DETAIL_HUB_REFUSAL`) and
     `src/lib/mobile/detail-hub-cohort.ts` (`DETAIL_HUB_PEERS`, `DETAIL_HUB_UNPORTED_BASELINE`).
     Copy the exact key shape from the `ds_sku_identity` / `mobile-ground` entries already there.
  2. `ds.mjs contract "<phrase>"` for the five phrases — the engine is not in the cloud container.
     Until Task 3 rewrites `BottomSheet`'s useWhen, "phone drill-in" may still rank it first.
  3. Probe both hubs at :3050 (repair RS hub + `/m/on-hold/TMP-QAE2E0924`) — layout is unchanged
     by design (same slots, same classes), but it has not been looked at in a browser.

## Task 3 — delete the old rules (after Task 1's list is approved by the owner)

Rewrite/delete per the Task 1 list. Every deletion: callers migrated first, grep proves zero
references, `pnpm verify:fast` green.

## State this session left (all uncommitted)

**SKU exceptions backend (done, verified in the QA sandbox):**
migration `src/lib/migrations/2026-09-24_on_hold_provisional_sku_description.sql` (APPLIED with
`--only`; other lanes' pending files untouched); `src/lib/neon/provisional-sku-queries.ts`
(list/detail/update, merge moves photos + description, `findProvisionalMergeTarget`);
routes `GET/POST /api/sku-catalog/provisional`, `GET/PATCH /api/sku-catalog/provisional/[sku]`
(404 → `{mergedInto}`), merge route publishes; `publishSkuExceptionChanged` in
`src/lib/realtime/publish.ts`; `SKU_STOCK` photo publish in `src/lib/photos/publish-entity-media.ts`
and `DELETE /api/photos/[id]`; share `src/lib/share-link.ts` (`shareRecordLink`, the rail's old
`shareRailLink` migrated) + `src/lib/inventory/sku-exception-links.ts`; proxy phone-UA rewrite
`/inventory/sku-exceptions` → `/m/on-hold` (query kept), `/m/on-hold?sku=` → hub.

**Mobile (this handoff's reference):** as listed above. Probed in the QA sandbox
(`/tmp/skuex-mobile.mjs`; screenshots `/tmp/skuex-m-*.png`): share link → hub; card mono/chip
equal height (22/22); card → `/info` → pencil edit saved (server read back); hub → Photos made 0
record GETs; Locations → keypad +1 → returned to Locations with stock 1 → 2; pair screen renders.

**Production bug fixed on the way (verify it stays fixed):** every phone keypad count
(`putaway.adjust` over the WMS socket) was refused with a Zod `Invalid UUID` because
`src/lib/realtime/wms-execution-command.ts` validated `organizationId` with RFC `uuid()`, and the
seeded tenants are `00000000-0000-0000-0000-000000000001` (dogfood) / `…0002` (QA). Now `z.guid()`
(the identity-equality check stays the authority) with a regression test in
`wms-execution-command.test.ts` (run with `node --import tsx --import
./scripts/register-server-only-shim.cjs --test …`). The adapter is spawned by the out-of-repo
gateway, so the fix only loads after `systemctl --user restart garisek-wms-gateway.service`
(done 2026-09-24).

**Desktop (built by sub-agent `InventoryDeskLedger`, transcript `history://InventoryDeskLedger`):**
Inventory tabs are **Stock · SKU Exceptions · Ledger · Locations**. Both ledger tabs run in
`src/components/inventory/InventoryDeskFrame.tsx` (flush To-ship stage, `ModeRegion mode="triage"`,
only on `/inventory/stock` and `/inventory/sku-exceptions`) on a new shared primitive
`src/design-system/components/record-ledger/` (`RecordLedger`, `IndustrialRecord`,
`RecordEvidence`, `record-ledger-geometry.ts`; one Medium row size, J/K/Esc, evidence column).
SKU Exceptions: `src/components/inventory/sku-exceptions/{SkuExceptionsLedger,SkuExceptionEvidence,SkuExceptionEvidenceSections,SkuExceptionPhotosSection,SkuExceptionPairSection,sku-exception-record}`;
the slot-table `sku-exceptions` family and its registrations are deleted. Stock:
`src/app/inventory/stock/page.tsx` (RSC, `?q=` in SQL, `?room=` comma list, `?open=`),
`src/components/inventory/stock/{StockLedger,StockEvidence,stock-record}`, data restored in
`src/lib/neon/location-stock-queries.ts` + `src/lib/inventory/location-stock-row.ts`.
Token: `LIFECYCLE.onHold` = `HLD` (warning) in `packages/design-tokens/src/lifecycle.ts`
(generated files rebuilt; only the onHold key was added to To-ship's `STATE_RANK` / `byState`).
Agent-reported: `pnpm verify:fast` green; QA-sandbox writes from the evidence column (photo
add/delete, description edit, count ±, Stock count ±) all reverted. Screenshots `/tmp/inv-*.png`
— the `inv-skuex-open.png` one caught a dev-compile loading state; **retake desk screenshots
first** (1440×900, after hydration) and look at them before building on this.
Open decisions it left: (1) BRIEF.md state-code list lacks `HLD` (owner law — ask);
(2) no S/M/L row zoom on the shared ledger (`useLedgerRowZoom` lives in To-ship's folder —
promote it into the primitive or accept Medium only); (3) raw `<button>`/`<input>` in the evidence
parts flagged by `ds_critique` as heuristic forks (same pattern as To-ship's evidence column);
(4) Stock count ± only on loose bin rows (serial units move by scan).
Pre-existing reds from other sessions: 'shift-click is reachable' (`OutboundOrderEvidence.tsx:494`)
and two 'compound title strike' tests.

## Working rules

- Probes: `http://localhost:3050` only. Writes only in the QA sandbox tenant:
  `POST /api/auth/signin` with `x-tenant-slug: cycleforge-qa`, body
  `{"staffId":67,"deviceKind":"personal"}` (QA Admin, pinless). Fixtures: location
  `QA-SHELF-CD91550F`, Zoho SKU `QA-BOSE-SLM2-BK`, exception `TMP-QAE2E0924`. Never write to USAV.
- Boundary: `/m` code imports only design-system, `components/ui`, `components/Icons`, mobile,
  `lib`, `hooks`, `contexts`, `utils`, `@/queries/keys` (`node tools/design-mcp/ds.mjs boundary <file>`).
- White ground baseline shrink-only (`src/lib/mobile/mobile-ground.ts`; the new on-hold screens
  are listed in `MOBILE_GRAY_GROUND_ZERO`).
- Migrations only through the runner with the owner's OK; `--only <file>` refuses to reorder.
- Done = `pnpm verify:fast` green (report other lanes' reds separately), the new guard proven on a
  planted violation, `ds.mjs contract` returning the new pins first, and a probe of both hubs.
