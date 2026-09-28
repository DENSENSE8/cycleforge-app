# HANDOFF — lane mode policy: which lanes get triage + industrial, which get triage only (written 2026-09-27)

Paste the **Prompt** block at the bottom into a fresh session. Everything above it is the
ground truth it relies on (code read 2026-09-27; other sessions edit this worktree — re-read
before every edit). Dev origin `http://localhost:3050` only (AGENTS.md §1).

Read first: `MODE-SPLIT-INVENTORY.md` (map + leaks), `HANDOFF-mode-split-next.md` (foundations),
`BRIEF.md` §6, §12 (Mode D floor), §13.

## 1. Owner ruling (2026-09-27) — what this pass encodes

> Data lanes display in BOTH systems — a triage mode and an industrial mode — because they need
> extremely tight data density: **Products, Inbound, Outbound, Sales, Reports, Inventory.**
> **Daily tasks, Media library and Automations display in triage ONLY.**
> The split must be clear on mobile and desktop.

Supersedes:
- BRIEF §12 Mode D "the one user-invoked industrial view on desktop" is To ship only → Floor is
  offered on every **dual** lane desk.
- `MODE-SPLIT-INVENTORY.md` owner decision 6 ("`/incoming` on Floor stays triage; only
  `/shipping` is runtime") → Inbound is dual; Floor on `/incoming` paints industrial.
- `resolveRegionMode`'s phone collapse no longer applies to **triage-only** lanes (today every
  `/m/*` route and every coarse pointer collapses triage → industrial unless `form`).

Unchanged: BRIEF §5 invariants (state colours, codes, scan bar); kiosk = `counter`; `/ai-chat` =
`assistant`; Mode C hardware mirror = explicit `industrial`; one component, two looks — never a
triage copy of a component.

## 2. State of the code today (verified by reading)

| Fact | Where |
|---|---|
| Route → mode is pathname-prefix, longest first; entries `triage` / `runtime` / `industrial` / `counter` / `assistant`, flags `exact`, `form`, `look` | `src/lib/routing/mode-registry.ts` (`DESK_TRIAGE_ROUTES`, `DECLARED_ROUTES`, `modeRouteFor`) |
| Only `/shipping` is `runtime`; its layout flips the page region on Floor | `src/app/shipping/layout.tsx:40-63` (`useDeskFloorActive` → `ModeRegion mode={floor ? 'industrial' : 'triage'}`) |
| Chrome (top bar) resolves the same way — `runtime` reads the Floor flag | `src/design-system/providers/RouteModeRegion.tsx:42-55` (`ChromeModeRegion`) |
| `RouteModeRegion` skips `runtime` routes (their layout owns the region) | `RouteModeRegion.tsx:20` |
| Phone collapse: `triage` + phone ⇒ `industrial` unless `form` | `src/design-system/providers/resolve-region-mode.ts:19-21`; phone = `/m/*` OR coarse pointer (`modeDeviceOf`, `:8-10`) — a desk route on a touch tablet collapses too |
| `:root` squares corners under `@media (pointer: coarse)`; a `[data-mode]` region redeclares its own | `packages/design-tokens/src/modes.ts:668-692` |
| Floor is one view enum `in-place | split | floor`, session posture, never stored; offered only while a list registers a floor face | `DeskStageContext.tsx` (`useDeskFloorFace`, `useDeskFloorActive` — a shell-wide external store), `DeskPageChrome.tsx:110-165` (⌘/Ctrl+Shift+F bound only when `floorAvailable`; auto-exits when none), `DeskRecordViewSwitch.tsx:99` (Floor option filtered by `floorAvailable`) |
| Lists that register a floor face today: **two** | `UnshippedTable.tsx:166` (Outbound), `IncomingDeliveriesLedger.tsx:252` (Inbound — registers Floor, but `/incoming` is plain `triage`, so its Floor view stays triage: the stage goes fullscreen, the look does not change) |
| `RecordLedger` desks (Stock, Replenishment, Docked receipts, Shipped, SKU exceptions, **Daily agenda**) register no floor face | `src/design-system/components/record-ledger/RecordLedger.tsx` |
| Floor needs `DeskPageChrome` (via `DeskPageLayout`) | `/products/layout.tsx`, `/reports/page.tsx:439`, `/dashboard/page.tsx:66`, `/incoming/page.tsx:15`; `/studio` is a full-canvas surface that takes neither (`pinned.json` `DeskPageChrome`) |
| The only density axis besides mode | `StationPanelRoot` `data-density="floor"` (`globals.css [data-density='floor']`); per-component `density="compact|comfortable"` props (timelines, search rows). Tight data density today = the industrial face |

### Lane → routes (from `src/lib/sidebar-navigation.ts` + `src/lib/nav/lanes.ts`)

| Lane (nav label) | Desk routes | Phone routes (`src/app/m`) | Today |
|---|---|---|---|
| Products (`catalog`) | `/products` | none | triage |
| Inbound | `/incoming` (door), `/sourcing`, `/triage`, `/receiving`, `/unbox`, `/carton` | `/m/r/*`, `/m/receiving/po/*`, `/m/rs/*`, `/m/fnsku/*` | triage desk; industrial phone (collapse) |
| Outbound (`fulfillment`) | `/shipping/*` (runtime), `/pick`, `/pack`, `/packer`, `/fba`, `/tracking-exceptions` | `/m/orders`, `/m/work`, `/m/pick/*`, `/m/pack/*`, `/m/scan`, `/m/exceptions/*`, `/m/shipping/shipments/*`, `/m/id/*` | runtime desk; industrial phone |
| Sales | `/dashboard` (`?mode=sales|pickup|repairs` — all Sales children), `/counter`, `/walk-in` (redirect), `/orders/new` (form) | `/m/orders/new` (form) | triage; forms pinned triage |
| Reports | `/reports` (tabs: staff day, dead stock, tasks, task time, …) | none | triage |
| Inventory | `/inventory/*`, `/warehouse`, `/replenish`, `/bin` | `/m/loc/*`, `/m/u/*`, `/m/pair/*` (confirm lane from the mobile registry) | triage desk; industrial phone |
| Daily tasks | `/` exact (`?mode=tasks`, `?mode=forge` Plans ride it) | `/m/home` (`MobileDailyChecklist`) | triage desk; **industrial phone (collapse) — violates the ruling** |
| Media library | `/ops/photos` (`PhotoLibraryPage`, nav row `ops-photos`); `/photos` unverified — confirm before tagging | `/m/p/*/photos`, `/m/unit-photos/*` are evidence capture, not the library | triage desk |
| Automations | `/studio` | none | triage desk; **industrial on a coarse-pointer tablet — violates the ruling** |

Not named by the owner (classify, do not guess): `/pickup` and `/repair` (floor stations in the
`walk-in` subgroup — Sales or Inbound?), `/search`, `/serial`, `/tech`, `/test`, `/wipe`,
`/forge`, `/operations`, `/ops` (other than photos), `/review`, `/signals`, `/manuals`,
`/calendar`, `/open-links`, `/support`, `/settings`, `/admin`, identifier doors, auth. Default for
this pass: **triage-only** (no new Floor anywhere nobody asked for); list them in the report as
owner questions. Scan stations that belong to a data lane (`/unbox`, `/triage`, `/pick`, `/pack`)
follow their lane.

## 3. Contract (the shape to build — one policy, both surfaces)

1. **Policy on the registry, not in layouts.** Replace `RouteMode = ModeName | 'runtime'` + `form`
   with an explicit lane policy on every `ModeRouteEntry`:
   - `dual` — triage and industrial. Desk default triage, Floor (⌘/Ctrl+Shift+F, the view
     switch's Floor option) paints industrial. Phone default industrial.
   - `triage` — triage on every device and pointer; never collapses, never offers Floor.
     Absorbs today's `form: true` (a form is a triage-only region) — clean cutover, delete `form`.
   - `industrial` — industrial everywhere (`/m/scan`, Mode C mirrors).
   - `counter`, `assistant` — unchanged.
   Each entry also names its `lane` (`DomainGroupId | 'daily' | 'media' | 'automations' | 'reports' | …`)
   so the policy is auditable per lane, and the test can assert the owner's table.
2. **One resolver.** `resolveRegionMode(policy, device, floor)` is the only place mode is decided:
   `dual` → `floor ? industrial : (device === 'phone' ? industrial : triage)`; `triage` →
   `triage`; others → themselves. `RouteModeRegion` and `ChromeModeRegion` both call it; the
   `/shipping` layout's own `ModeRegion` goes away (keep its `look` via the registry). No other
   layout may mount a page-level `ModeRegion`.
3. **Floor is gated by policy, not by accident.** `useDeskFloorFace` registration is ignored on a
   non-`dual` route (DeskPageChrome reads the policy), so a `RecordLedger` on Daily can never
   offer Floor, and a Floor left on from `/shipping` is dropped when the route is `triage`
   (the external floor store resets on a non-dual route). Every `dual` desk registers at least one
   floor face — Products, Reports, Sales (`/dashboard`), Inventory (`/inventory` stock) need one.
4. **Industrial face = the tight density.** A floor face is the SAME list component reading mode
   tokens (`rounded-mode*`, `bg-mode-*`, `border-mode-divide|fact`, `.mode-label`, the
   `industrial:` variant) plus the industrial dials in BRIEF §4 (0 page padding, 1px row rules,
   edge to edge, `DESK_STAGE_FULLSCREEN_CLASS`). Get values from `ds_tokens <axis>`; never type a
   literal row height or radius. If `RecordLedger` / `DataTable` have no industrial row recipe
   yet, add it ONCE at the primitive (`record-ledger/*`, `desk-stage.ts`) and let every dual desk
   inherit it — do not tighten each desk by hand.
5. **Phone.** `/m/home` (Daily) resolves triage. Phone data-lane routes stay industrial (owner
   2026-09-27 decision 3). Forms (`/m/orders/new`) are `triage` policy. A coarse-pointer desk
   (tablet) keeps the policy: triage-only lanes stay rounded; the region's coarse block keeps the
   region's radius (fix in `modes.ts` emission if it squares a triage region, not per component).
6. **Nav tells the operator which lanes have Floor.** The Floor option in `DeskRecordViewSwitch`
   and the ⌘/Ctrl+Shift+F row in the `?` sheet appear only on dual desks (already true by
   `floorAvailable`; now also true by policy). No new switch component.

## 4. Enforcement (law, so it does not drift)

- `mode-registry.test.ts`: every page resolves to an entry WITH a policy and lane; the owner table
  is asserted literally (Products/Inbound/Outbound/Sales/Reports/Inventory ⇒ `dual` except forms;
  Daily/Media/Automations ⇒ `triage`); a matrix test over `resolveRegionMode` for
  policy × {desktop, phone} × {floor on, off}: a `triage` policy never yields `industrial`.
- `resolve-region-mode.test.ts`: rewrite for the new signature (delete the `form` cases; they are
  the `triage` policy now).
- `src/design-system/pinned.json`: a `ModeRegistry` entry — "a lane's modes come from its policy
  in mode-registry.ts; Floor only on `dual`; Daily, Media library, Automations are triage on every
  device"; update `DeskStageContext` / `DeskPageChrome` pins (Floor gated by policy).
- `BRIEF.md` §13: add the ruling verbatim with date; strike the superseded lines listed in §1.
- `MODE-SPLIT-INVENTORY.md`: regenerate the route table from the registry with a Policy column.

## Prompt

> You own the lane mode policy for CycleForge's triage ⇄ industrial design system. Read
> `docs/design-system/HANDOFF-lane-mode-policy.md` (this file) first, then `MODE-SPLIT-INVENTORY.md`
> and `BRIEF.md` §6/§12/§13. Work on `http://localhost:3050` only; lane lifecycle is
> `systemctl --user … cycleforge-lane@prod`. Other sessions edit this worktree — re-read before
> every edit; do not touch `OrderRecordView.tsx`, `order-record-sections.tsx`, `orders-list.ts`,
> `src/lib/auth/pin.ts`.
>
> Owner ruling to encode: **Products, Inbound, Outbound, Sales, Reports, Inventory display in both
> triage and industrial (extremely tight data density on industrial); Daily tasks, Media library
> and Automations display in triage only — on desktop and on the phone.**
>
> Do, in order, verifying each step on :3050:
> 1. **Registry policy** (§3.1–3.2): add `policy` + `lane` to every `ModeRouteEntry`, replace
>    `runtime` and `form`, one `resolveRegionMode(policy, device, floor)`, used by
>    `RouteModeRegion` and `ChromeModeRegion`; remove the page-level `ModeRegion` from
>    `src/app/shipping/layout.tsx` (keep `SurfaceGate`, `RouteShell`, the Labels look). Run
>    `xd://lsp` references on `resolveRegionMode`, `modeRouteFor`, `ModeRouteEntry`, and the
>    `ModeRegion` `form` prop first; migrate every caller. Classify the unnamed routes (§2) as
>    `triage` and list them in the report as owner questions.
> 2. **Floor gated by policy** (§3.3): DeskPageChrome ignores floor-face registration off `dual`
>    routes; the floor store resets on a non-dual route. Prove: enter Floor on `/shipping/orders`,
>    navigate to `/` and `/studio` — both triage, no Floor option, ⌘/Ctrl+Shift+F inert.
> 3. **Floor faces on every dual desk** (§3.4): `/incoming` now paints industrial on Floor;
>    add the floor face to `/products`, `/reports`, `/dashboard?mode=sales`, `/inventory` by
>    giving the shared primitive (`RecordLedger` / `DataTable`) one industrial row recipe from
>    `ds_tokens`, then `useDeskFloorFace(true)` where each desk mounts it. Measure edge to edge
>    (`getBoundingClientRect` of `[data-testid=desk-page-stage]` and the first row vs
>    `innerWidth`) and count visible rows at 1440×900 in triage vs Floor for each desk — Floor
>    must show strictly more rows.
> 4. **Phone + touch** (§3.5): `/m/home` triage at 390×844; `/m/orders/new` still triage; `/m/pick`
>    and `/m/orders` unchanged industrial. Emulate a coarse pointer (CDP
>    `Emulation.setEmitTouchEventsForMouse` + `setEmulatedMedia` `pointer: coarse`) on `/studio`
>    and `/ops/photos` at 1024×768: `data-mode="triage"`, `--mode-radius-control` non-zero.
> 5. **Law + docs** (§4): tests, `pinned.json`, BRIEF §13, inventory route table with a Policy
>    column. Run `node tools/design-mcp/ds.mjs critique <file>` on each touched component.
>
> Rules: one component, two looks — never fork a triage or industrial copy; no literal radii,
> heights or colours (`ds_tokens`); live updates are mode-agnostic (do not touch
> `realtime-registry.ts` behaviour); ask before changing any owner ruling not listed in §1.
> Proof table in the report: every route in §2's lane table → policy → computed `data-mode`
> (desk In place, desk Floor where dual, phone) → screenshot path. Done = that table all green,
> `pnpm verify:fast` green except pre-existing reds named by file, and the docs updated.
