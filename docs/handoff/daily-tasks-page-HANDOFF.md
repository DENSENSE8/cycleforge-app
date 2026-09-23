# HANDOFF PROMPT — Daily on `/m`: one task system, `/m/home` becomes the daily checklist

**Paste this entire file as your prompt. It is self-contained — you need no other document.**
Written 2026-09-14. Phase 0 audit already executed; its findings below are verified facts.

---

## 1. Mission

Port **Daily** to the phone at `/m/home`: a per-day checklist (tick, add, retire, reset-all) built
on the EXISTING `daily_check_*` store, rename the nav entry Checklists → **Daily**, then
consolidate the three task systems into that one. Mobile-first, fixed width.

## 2. Operator directives (verbatim, binding)

- "rewrite the homepage and make it a daily task page with a check mark And so you would be able to
  ensure that everything is done per day Just like a daily checklist, proper, wholly functioning,
  fully functioning daily checklist Like reset all, check this, add this, delete this"
- "There's already three different task systems that are added in the code base There must be just
  one consolidated to one system"
- "home will be renamed into daily and then daily will be displayed instead of checklist So just
  rename checklist to daily on the mobile page Nav bar and the home nav bar"
- "This display would be primarily focused on mobile so I've fixed width"
- Standing doctrine: "delete components one by one when I say so" — every removal is operator-gated.
- Mobile surface ruling (2026-09-14): the mobile app is the **unbox photo feed, picks, location
  scanning, and the identification kernel** — plus `/m/print` and, after this work, Daily.

## 3. Audit findings (Phase 0, EXECUTED — do not re-derive)

### The three systems

| # | System | Store | Grain | Surface | Logic |
|---|---|---|---|---|---|
| 1 | **Daily** — the winner | `daily_check_items` + `daily_check_marks` (migrations `2026-08-19b/c/d`) | items org-managed; a mark is **(org, item, staff, day)** | `features/home/HomeDailyMode` (rewritten to "Scope 1" 2026-09-14: per-staff list, optimistic tick, strike-through, "N of M checked") | `lib/daily-checks/{queries,report,types,daily-grid-layout}`, field catalog `lib/tables/field-catalog/daily.ts` |
| 2 | **Tasks** | `staff_todos` (migration `2026-06-09`) | one staffer's own list | `features/tasks/TasksWorkbench`, `StaffTaskInspectorRail`, `?task=` | `lib/staff-todos/*` |
| 3 | **My Day** | `GET /api/my-day` | today's cross-queue workbench | `features/my-day/*` (+ watch rail) | `lib/my-day/*` |
| — | legacy, already dead | `task_templates` / `daily_task_instances` in `src/lib/schema.sql` | — | none | marked "unused by any code — do not extend" |
| — | out of scope | `ops_plan_tasks`, `replenishment_tasks` | domain work queues, not personal/daily lists | — | — |

### The API already covers the operator's verbs — build NO new schema

| Verb | Endpoint | Semantics that matter |
|---|---|---|
| see today | `GET /api/daily-checks?date=YYYY-MM-DD` | live read, no nightly job; returns `items` + report incl. `mine.doneItemIds` |
| check / uncheck | `POST /api/daily-checks/mark` | `staffId` comes from the **session**, never the body; idempotent upsert on `(org,item,staff,day)`; deliberately unaudited — the table IS the attribution trail |
| add | `POST /api/daily-checks/items` | appends live **from today**; never back-dated (a back-dated item would make yesterday's report show a miss) |
| delete | `DELETE /api/daily-checks/items?id=` | a **retire** (`retired_at`), not a delete — past reports must keep rendering the item |
| reset all | **missing — you add it** | `DELETE /api/daily-checks/mark?date=` → delete the caller's marks for that day; same session-scoped `withTenantTransaction` pattern as `/mark` |
| per-day reset | **free by construction** | marks are day-keyed, so a new civil day is an empty list. Day = `getCurrentPSTDateKey()` (warehouse civil day) — **never `now()::date`**, the server clock is UTC and would roll over mid-afternoon |

### Two decisions already made for you

1. **No new migration, no fourth system.** Daily's schema is the SoT; the phone is a second surface.
2. The desk Daily was deliberately descoped to "Scope 1"; its parked grid apparatus
   (`features/daily-checks/*`, `features/home/grid/*`, `DailyComposerRow`) stays on disk, deletion
   operator-gated. **Do not delete any of it as part of this port.**

### The one blocking constraint

The desk hooks are `features/home/useDailyChecks` + `features/home/DailyChecklistRow`. A `/m` page
importing from `features/home/` is a **boundary violation** that fails the verify gate. Graduate the
data hooks to `src/lib/daily-checks/` (logic layer — shared by law); each surface keeps its own row
component.

`features/tasks/TasksWorkbench`'s docblock argues Daily and `staff_todos` must stay split ("two
stores, two questions"). **The operator has overridden that.** Consolidation is the instruction —
do not re-litigate from that comment.

## 4. Repo state you inherit (verified)

- `/m/home` is currently a **server redirect stub → `/m/work`** (`src/app/m/(shell)/home/page.tsx`).
  It is load-bearing infrastructure: QR handoff claim (`api/auth/qr/handoff/claim` redirectUrl),
  `(shell)/claim` fallback, signin role-home + fallback, `DesktopRouteShell`'s phone bounce off
  desktop-only paths, and `LandingPageCard`'s mobile default all land there. **Your page replaces
  the stub body. `/m/home` must never 404.**
- `/m/pack` and `/m/search` are deleted (route, prefix, and param contract). Packing is desktop-only;
  proxy no longer rewrites `/pack`/`/packer` for phones.
- **Nav SoT:** `src/lib/mobile/nav-registry.ts` → `MOBILE_NAV_DESTINATIONS` (the drawer renders from
  it; active-route predicates `isLeafActive`/`isGroupActive`/`isChildActive` live there too).
  Current leaves: `orders-new`, `picks`, the `receiving` group, `print`, `checklist`.
  Tests: `src/lib/mobile/nav-registry.test.ts`.
- **Titles:** `src/lib/mobile-context-navigation.ts` → `getMobileAppTitle`.
- **Route prefix registry:** `src/lib/mobile/mobile-first-surface.ts` → `MOBILE_FIRST_ROUTE_PREFIXES`.
- **Mobile kit:** `src/components/mobile/**`; compact display primitives are catalogued in
  `docs/mobile-first/MINIATURE-CATALOG.md` (tone maps, photo-count badge, progress dots, rows).

### Laws that bind this work (inlined — the essentials)

**Component split** (`ARCHITECTURE.md`, enforced):
- Platform primitives, shared by every web surface: `src/design-system/**`,
  `src/components/ui/**`, `src/components/Icons`, `components/identity`, `components/providers`,
  `components/error`.
- Surface components **never cross**: `src/components/mobile/**` + `src/app/m/**` on one side;
  desktop feature dirs (`station/`, `receiving/`, `features/*`, `search/`, `kiosk/`, …) on the other.
- Logic is shared: `src/lib/**`, `src/hooks/**`, `src/contexts/**`, `src/utils/**`.
- Type-only imports count as crossings. Shared vocabulary/types/hooks belong in `src/lib/**`.

**Mobile surface law** (`docs/mobile-first/SURFACE_LAW.md`, essentials):
- One job per screen; one primary CTA, sticky, in the thumb zone; ≥44px hit targets
  (`min-h-11` / `IconButton size="touch"`).
- Fixed-width phone column on large viewports (`max-w-sm`/`max-w-md` with DS spacing) — never a
  second desktop IA.
- No hover-only affordances; no dual interactive trees.
- Semantic tokens only — no raw hex, no bare Tailwind palette steps (`bg-emerald-500` etc.).
  Solid indicator fills use the `fill-*` family; status washes use `surface-*`.
- Disabled CTAs name what is missing.

**Design-system protocol:** call `ds_contract` (or `node tools/design-mcp/ds.mjs contract "<job>"`)
BEFORE writing a component, `ds_tokens <axis>` before typing any literal, and `ds_critique <file>`
after editing. Project hooks deny `src/**/*.{tsx,jsx,css}` writes without a fresh design-mcp session
stamp.

## 5. Close-out chain — run for EVERY increment

```bash
# 1. the increment's own tests (colocated, node:test + renderToStaticMarkup)
pnpm exec tsx --test <your new .test.tsx>

# 2. nav contracts (if you touched the registry)
pnpm exec tsx --test src/lib/mobile/nav-registry.test.ts

# 3. the unbox photo feed invariant — 56 tests, must stay green
pnpm exec tsx --test \
  src/components/mobile/receiving/arrival-station-tape.test.ts \
  src/components/mobile/receiving/photo-upload-queue-in-flight.test.ts \
  src/components/mobile/receiving/photo-upload-queue-capture-rehydrate.test.ts \
  src/components/mobile/receiving/complete-carton.test.ts \
  src/components/mobile/redesign/scan-verdict.test.ts

# 4. boundary law (per-file adjudication while you work)
node tools/design-mcp/ds.mjs boundary <file>

# 5. the gate: Lint · Typecheck · Boundary
pnpm verify:fast
```

The Boundary gate runs `scripts/boundary-guard.ts --enforce` against the frozen baseline in
`scripts/boundary-exemptions.ts` (95 entries, **shrink-only**): a NEW crossing fails the build; a
fixed crossing must have its exemption line removed in the same increment.

Append every completed increment to the ledger in `docs/todo/mobile-first-foundation-PLAN.md`
(Track H). Increment rules: one concern, ≤6 files, lands green alone, reverts alone.

## 6. Phases
> **Status as of 2026-09-14 close of the H1a lane — read before executing.**
> H1's hook graduation, H2's `/m/home` page, and H3's nav+title rename are **already in the working
> tree** (uncommitted): `src/lib/daily-checks/use-daily-checks.ts` (git rename from
> `features/home/`), `src/components/mobile/daily/{MobileDailyChecklist,MobileDailyRow,MobileDailySheets}.tsx`
> + `mobile-daily-row.test.tsx`, nav leaf `{ id: 'daily', label: 'Daily', href: '/m/home' }`,
> `getMobileAppTitle('/m/home') → 'Daily'`. **Do not rebuild them.**
> H1's missing `reset-all` is now done at all three layers (query helper, `DELETE` handler, hook).
> **One deliberate deviation from H3 below — a RULING, not unfinished work.** `/m/checklist` was NOT
> turned into a redirect stub and the `Checklists` leaf was NOT renamed: that route is the SKU
> kit-parts / QC-template editor, a different job that merely shares the word. `Daily` was ADDED as
> a new leading leaf instead (`nav-registry.ts:57`), and `Checklists` still points at
> `/m/checklist` (`nav-registry.ts:74`, title map `mobile-context-navigation.ts:48`). The reasoning
> is inline at `nav-registry.ts:49-51` — *"Two rows, two verbs; do not fold one into the other
> silently"* — and `mobile-context-navigation.ts:37-39`.
> ~~**Do not read H3 as incomplete and delete the Checklists row**~~ — **SUPERSEDED
> 2026-09-15: the operator gated it and the row is DELETED**, along with the route,
> `src/components/mobile/checklist/**` (5 files) and the dead
> `useResolveCatalogByItemNumber` hook. Still NOT H3 as written: there is no redirect stub
> and `Daily` was not renamed onto that path — the surface is simply gone, because the
> operator is *"removing and simplifying the display in general."* Restore recipe and the
> kept-on-purpose list: [`DELETED-MANIFEST.md`](../warehouse-os/DELETED-MANIFEST.md)
> § *2026-09-15*.
> **Real remaining delta:** `MobileDailyChecklist` wires neither `useResetDay` nor `retireItem`, so
> "reset all" and "delete this" have no CTA. Start there.


**H1 — graduate the data layer (no UI).** Move `useDailyChecks` / `useToggleCheck` from
`features/home/` to `src/lib/daily-checks/`; update the desk importer (clean cutover, no shim). Add
the `reset-all` endpoint + query helper. *Accept:* desk Daily behaviour unchanged, `ds_boundary`
clean on both surfaces, gate green.

**H2 — build `/m/home` = Daily.** Replace the redirect stub with the page: today's list in
`sortOrder`, optimistic tick/untick with strike-through, add row, retire, reset-all, "N of M
checked". Fixed-width phone column; sticky primary CTA; compose catalogued primitives. Render
contracts in a colocated `.test.tsx` (pattern: `src/components/ui/tracking-chip-last8.test.tsx`).
*Accept:* `/m/home` renders Daily and never 404s; all auth-landing entry points still work.

**H3 — ~~rename + rewire~~ DONE DIFFERENTLY, and now MOOT.** The plan was: checklist leaf →
`{ id: 'daily', … }`, `/m/checklist` → redirect stub, retitle. What actually happened: `Daily`
landed as a NEW leaf (H3 deviation, 2026-09-14), then the operator **deleted** `/m/checklist`
outright (2026-09-15) rather than stubbing it. Net state: one `daily` leaf → `/m/home`, no
`checklist` leaf, no stub, no `'Checklists'` title. `MOBILE_NAV_TAB_DESTINATIONS` **ids** were
left alone throughout (the admin card and stored per-staff configs reference them) — that part
of H3 still stands and still holds.

**H4 — consolidate (operator-gated, one pass each).** Fold `staff_todos` (Tasks) and the `my-day`
feed into Daily, or obtain an explicit operator ruling that one survives as a separate personal
list. The dead `task_templates`/`daily_task_instances` SQL can go first — nothing imports it.

## 7. Hard rules

- No fourth task system. No new schema for daily state.
- No new boundary crossings. `/m/home` never 404s. The unbox 56-test suite stays green.
- Marks are session-attributed and day-keyed — never accept a `staffId` from a client, never use the
  server clock for the day key.
- Retire ≠ delete for items; past reports must keep rendering what the list was that day.
- Deletions are operator-gated, one component per pass — ask, don't sweep.
