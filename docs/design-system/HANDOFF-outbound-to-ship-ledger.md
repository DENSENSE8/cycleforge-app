# HANDOFF — Outbound "To ship" → industrial record ledger

**Status (2026-09-24, uncommitted):** Steps 0–2 landed, then revised by the owner — industrial
canvas `#fafafa`, `SURFACE_LAW.md` amended, `OutboundOrdersLedger` on To ship (edge-to-edge
industrial desk bar; location in the context band; condition beside the select box; the open
record reads in an evidence column, not the right rail). Step 3 skipped: `apps/mobile-ios` is not
in `prod`. **Next work follows [`HANDOFF-industrial-record-ledger.md`](./HANDOFF-industrial-record-ledger.md).**

Paste this whole file as the first message of a fresh session in the **prod lane**
(`~/Projects/cycleforge-lanes/prod`). You are implementing one page. Read
[`BRIEF.md`](./BRIEF.md) first — it is the law; where older docs disagree, BRIEF wins.

## The ask (owner's words)

> "The current slot data table component is not correct and I would need to upgrade it to what is
> displayed on a mobile display. So it will display like a modern industrial warehouse display
> similar to the desktop application and not like a slow software as a service."
>
> "You cannot sweep over the entire codebase … This needs to be done page by page."
>
> "The background would be FAFAFA."

## Scope

**In:** the **To ship** tab of `/shipping/orders` (desk), and its iPhone twin `ToShipRowView`
(Step 3). **Out:** Pending, Shipped, Exceptions tabs; station embeds of the slot table
(`PackerTable`, `TechAllTriageTable`, `ShortageDesk`); `/m/work`; other iOS screens; Tauri. Do not
touch them. Do not sweep other pages. Do not commit — the owner commits.

## Rules you work under

- Dev origin `http://localhost:3050` only. Lane: `systemctl --user status cycleforge-lane@prod`.
  Never start `next dev` or bind a port.
- The tree carries many uncommitted changes from other work. Touch only files this page needs;
  never revert or reformat anything else.
- Mode system (already built, uncommitted): `@cycleforge/design-tokens` (`packages/design-tokens`),
  `ModeRegion` / `useMode` (`src/design-system/providers/ModeRegion.tsx`), `[data-mode]` CSS injected
  by `src/app/layout.tsx`, Tailwind utilities `bg-mode-*`, `text-mode-*`, `rounded-mode`,
  `min-h-mode-hit`, `duration-mode-feedback`. `/shipping` is already wrapped in
  `ModeRegion mode="industrial"` (`src/app/shipping/layout.tsx`). Values come from tokens — never a
  literal hex or px in the component (`ds_tokens mode`, `ds_tokens color`).
- Known unrelated red: `src/lib/picking/sessions.ts` imports missing `@/lib/picking/tote-scan`
  (Typecheck). Not yours; report it, don't fix it.

## Step 0 — token + law changes (do first)

1. **Industrial canvas → `#fafafa`.** In `packages/design-tokens/src/modes.ts` set industrial
   `canvas` from `#ecece8` to `#fafafa`. Run `pnpm tokens:build`, then `pnpm tokens:check`. This is
   the only token value you change. Rows stay `#fff`; industrial ink `#10110f`, rule `#cacbc5`,
   edge `#b7b8b0`, well `#e6e7e1`, muted `#535650` stay.
2. **Desk stage follows the mode** on this page only: the To ship ledger's ground is
   `bg-mode-canvas` (`#fafafa`) with white rows — not the `DESK_STAGE_GROUND_CLASS` white sheet.
   Do not change `tokens/desk-stage.ts` globally.
3. **Law amendment.** Replace `docs/mobile-first/SURFACE_LAW.md:164` ("Desktop … renders a dense
   `DataTable`; it does not import mobile work rows") with: *"Industrial desk pages render the
   industrial record ledger (BRIEF.md §4 industrial). `DataTable` remains for triage and admin
   tables. Adoption is page by page."*

## Step 1 — read the current chain (don't skip)

`src/app/shipping/(desk)/orders/page.tsx` (RSC seed `seedUnshippedQueue` in
`src/lib/queries/unshipped-queue-seed.server.ts`, first paint `OrdersQueueFirstPaint`) →
`src/components/outbound/orders/OutboundOrdersDeskShell.tsx` → `OutboundOrdersDesk.tsx` →
`src/components/dashboard/DashboardOrdersView.tsx` → `src/components/unshipped/UnshippedTable.tsx` →
`src/components/dashboard/orders-queue/useOrdersSpreadsheet.tsx` → `DataTable` →
`NonlinearTableHost` → `LedgerGridSurface`. Column model: `src/lib/dashboard-order-row-layout.ts`.

**Precedent to copy (already in prod):** `src/features/label-intake/LabelIntakeLedger.tsx` — the
Tauri tactical record list on web: `@container`, spine, image lane, 3-band record, evidence column
≥64 rem / bottom sheet below. **Visual reference:**
`~/Projects/cycleforge-lanes/v1-outbound/apps/desktop-tauri/src/styles.css` (`.work-row`,
`.state-spine`, `.image-lane`, `.work-record`, `.record-band`) and `main.jsx` `WorkRow`; mobile
`src/components/mobile/redesign/ItemCardRow.tsx` + `src/design-system/tokens/item-record-mobile.ts`.

## Step 2 — build `OutboundOrdersLedger`

New `src/components/outbound/orders/OutboundOrdersLedger.tsx` (+ a small `…-geometry.ts` if
needed). Mount it in `DashboardOrdersView` **for the To ship tab only**, in place of
`UnshippedTable`'s DataTable body. Keep every data/behaviour hook; replace presentation only.

**Must keep wired (same hooks, same behaviour):** `useOrdersQueueRows` (feed, grouping, sort),
`useOrdersQueuePlane` (selection + bulk bar via the existing morphing host), `useOrderAssignment`
(condition, ship-by, qty, item number), the pick/pack assign path (`/api/orders/assign`), notes
(`POST /api/orders/[id]/notes`), `useQueueDisplaySort` (URL sort), search + filters + `100` page
size from the To ship toolbar, `useOrderRailSelection` (row → right rail), `refreshDomain
('orders.outbound')`, the RSC seed + `HydrationBoundary`, virtualization (TanStack Virtual, as
`LedgerGridSurface` does). Keep `useOrdersTableLayout` / `ORDERS_DEFAULT_TABLE_BINDING` untouched so
`slot-table-cohort.test.ts` and the station embeds stay green.

### Row anatomy (industrial, desk)

Row zoom **Medium is the default**:

| Lane | Medium (default) | Small | Large |
|---|---|---|---|
| Spine | 5 px, state tone | 5 px | 5 px |
| Photo | 96 px square, full-bleed crop, no inset | 32 px | 108 px |
| Band 1 — context (32 px) | **state code** (`RDY` `URG` `PKD` `OOS` `SHP`) · platform mark · order # (mono) · bin · ship-by / `LATE nd` | — | 36 px |
| Band 2 — identity (32 px) | title (sans bold 15, one line, ellipsis) · condition · **QTY n** right-pinned | — | 36 px |
| Band 3 — facts (32 px) | select box · price · SKU (mono) · Pick assignee · Pack assignee · next action (`→ Pack`, `→ Scan out`, `→ Clear hold`) | — | 36 px |
| Small = one 32 px line | spine · 32 px thumb · code · order # · title · qty · ship-by · pick · pack | ✓ | |

- **State code + tone** come from the `LIFECYCLE` map in `@cycleforge/design-tokens`
  (`packages/design-tokens/src/lifecycle.ts`: ready → info `RDY`, urgent → warning `URG`, packed →
  fulfillment/purple `PKD`, out of stock → danger `OOS`, shipped → success/green `SHP`). Map the
  order's workflow stage (the one the current Status cell reads, `GridStatusCellValue` / the
  orders workflow stage badge) onto a `LIFECYCLE` key in **one** place; never a page-local tone
  table. Colour is never the only signal. Urgent text uses `text-mode-warn` (`#8a5f00`). Screen
  readers get the full label.
- **Rules / surfaces:** 1 px `#cacbc5` between bands, 1 px ink bottom rule between rows (match the
  Tauri `.work-row`), radius 0, no shadows, no hover lift. Labels mono 9–10 heavy uppercase
  0.08 em; IDs/SKU mono bold 12–13.
- **Selection:** 2 px ink outline on the selected/open row (not a fill). Out-of-stock rows get the
  one tinted fill (danger tint) + hatched spine.
- **Seed groups:** parent record, children indented under a shared spine (keep `QueueGroupRow`
  semantics: group totals).
- **Inline edits** stay in their bands, instant commit (ship-by via `DateRangePickerField
  variant="compact"`, staff via `AssigneeCombobox` through `StageStaffAssignPopover`, per
  AGENTS.md §4).
- **Open:** row body click → right rail (triage mode, already wired by `RightRailHost`). Select box
  and inline controls stop propagation.
- **Motion:** none. No layout animation, no row mount animation.
- **Hit:** desk 32 px minimum for every control; the whole row is the open target.
- **Row zoom control:** S / M / L in the To ship toolbar (replace the `100%` zoom menu if it is the
  same job), persisted per staff for this list through the existing staff preferences path that
  `useOrdersTableLayout` / `staff_preferences.tableColumns` uses — find it, don't add a new store.
- **Dropped on this page:** column resize, column visibility, column drag order.

### Performance ("not a slow SaaS")

- Update `OrdersQueueFirstPaint` to the new Medium geometry so the SSR stand-in matches (no layout
  shift). Keep `UnshippedTable.tsx` / `DashboardOrdersView.tsx` listed as LCP hosts in
  `src/lib/observability/tier1-paint-order.ts` correct for the new host.
- Virtualize with a fixed row height per zoom step (S 33, M 97, L 109 incl. rule) — no measuring.
- No new network requests; same query keys.

## Step 3 — iPhone twin (`ToShipRowView`)

Same slice, so web and iPhone match on the first page. Follows
`docs/handoff/HANDOFF-cross-client-outbound-foundation.md`: no file copies between checkouts and
no SSH Xcode builds.
1. **Precondition:** the iOS source is in `prod` (`apps/mobile-ios`, promoted from `v1-outbound`)
   and the token generator writes `DesignTokens.swift` straight into it. If that has not landed,
   skip this step and say so — do not `scp` the file into `~/Projects/cycleforge-ios`.
2. In `ToShipRowView.swift` (and the `FloorPalette` colours it uses) replace every `Color(red:…)`
   with `DesignTokens` — surfaces from `DesignTokens.Mode.industrial`, spines and codes from
   `DesignTokens.Lifecycle` by meaning. Keep the geometry (5 pt spine, 108 pt photo, 3 × 36 pt
   bands). Fix the PICK button and listing button to 48 pt (they are 36 today).
3. Hand off to the owner: he builds and runs it in Xcode on the MacBook / iPhone Air and returns
   the build result and a screenshot.

## Acceptance

1. `pnpm tokens:check` and `pnpm verify:fast` green (except the known `sessions.ts` typecheck).
2. Screenshots at `http://localhost:3050/shipping/orders` (To ship) at 1440×900 for S, M, L, plus
   one with the right rail open, plus one with a seed group expanded. Auth: copy
   `tests/.auth/admin.json` (mint via `tests/shot.mjs` if stale), `node -e` with
   `require('@playwright/test')` chromium.
3. Behaviour checklist, each verified on the live page: search, filters, sort (URL), page size,
   select + bulk bar, ship-by edit, pick/pack assign, condition edit, qty edit, notes, row → rail,
   seed group totals, OOS tint + hatch, LATE badge, empty state, loading state.
4. `SURFACE_LAW.md:164` amended; industrial canvas token is `#fafafa`; nothing outside this page
   changed visually (spot-check `/pack` and `/m/work` still render).
5. Report: files changed, what was dropped, before/after screenshots, anything that did not map.
