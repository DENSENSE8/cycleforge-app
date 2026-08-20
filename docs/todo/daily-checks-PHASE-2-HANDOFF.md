# Daily checks Phase 2 — report → Operations · full-width checklist + right inspector

**Status:** Not started. Spec + live context. Phase 1 (the checklist + report) is
built, seeded and working — see [`daily-checks-HANDOFF.md`](./daily-checks-HANDOFF.md).
**Written:** 2026-08-19. Every path below was opened and confirmed.

---

## The ask, in four parts

1. **The report leaves Home.** Port the day's report to the **Operations** page as
   its own mode. Not a tab inside Daily, not "Today's report" on `/`.
2. **The checklist goes full width.** It is `mx-auto max-w-3xl` today.
3. **Left = checklist, right = a real inspector.** The right panel is a
   comprehensive detail display in the shape of the Unbox right panel — including
   **connections**, e.g. the ticket linked to a check.
4. **Add button moves to the top right** of the checklist surface.

Framing from the requester: *"this is like an enterprise grade software that you
must close the gaps."* Treat thin/placeholder states as gaps to close, not as
done.

---

## READ THIS FIRST — the one decision that gates the work

**There is no connection model. `daily_check_items` cannot link to anything.**
Confirmed against the live DB:

```
daily_check_items : id · organization_id · title · sort_order ·
                    effective_from · retired_at · created_at · updated_at
daily_check_marks : id · organization_id · item_id · staff_id ·
                    marked_on · marked_at · note(text, nullable)
```

That is the whole schema. There is no ticket id, no entity reference, no link
table. So part 3 ("display connections … ticket connection to the task") is **not
a UI task** — it needs a schema first, and that decision belongs to the requester
before any component is written:

- **Option A — typed link table** (`daily_check_item_links`: `entity_type` /
  `entity_id`, org-led unique index). The house pattern for exactly this; read
  [`docs/rules/polymorphic-tables.md`](../rules/polymorphic-tables.md) and use the
  `db-migration-author` skill. Expand → code → contract: **the migration lands
  first** (`.claude/rules/backend-patterns.md`).
- **Option B — ship the inspector over facts that already exist** (who ticked it
  and when, the per-item roster, the mark `note`, the item's effective window),
  and add connections in a later pass.

**Do not invent a link column inline to make the panel look full.** A right panel
that renders fabricated relationships is worse than one that renders four honest
facts.

---

## Live context — what is true in the tree right now

**Phase 1 is seeded and verified.** Five real items exist in the USAV dogfood org
(ids 7–11, `sort_order` 0–4, `effective_from` 2026-08-19, none retired):

```
Label printer loaded — test label prints clean
Scan guns charged and paired
Receiving dock clear and swept
Packing station stocked — boxes, tape, void fill
Carrier pickup confirmed for today
```

Two are ticked by Michael (items 7 and 9). `GET /api/daily-checks?date=2026-08-19`
returns `items: 5 · totalDone: 2 · totalPossible: 80 · mine 2/5`, with every
un-ticked staffer present at `0/5` and least-done sorting first. The read model is
proven end to end — you are moving a working surface, not finishing a broken one.

**Home was cut to two modes in the same session (uncommitted).** `inbox` and
`tasks` were deleted; `forge` moved to its own `/forge` route with the Plans spine
pin repointed and `ROUTE_PERMISSIONS` gaining `/forge → operations.plans.view`.
Unit tests green: nav 24/24, route-params 30/30, forge-view 2/2. **None of it is
committed** — `git status` before you start.

**⚠ The tree does not currently build.** A concurrent session is mid-refactor and
has STAGED deletions of the table-engine modules (`*-table-definition`,
`*GridColumnHeader`, `*GridRow`, `*-grid-layout`) across ~15 surfaces. `/` itself
500s because `query-mode-routes.ts` → `repair-display-sort.ts` →
`@/lib/repair/repair-grid-layout` (deleted). 65 typecheck errors, none in the
daily-checks or Home files. **This is not yours to fix.** Until it resolves:
`npm run verify` cannot pass, and browser work on `/` is blocked. The
daily-checks **API routes still compile and serve** — that is how the seed above
was written.

---

## What exists

| Layer | Path |
|---|---|
| Surface (checklist + report, one file) | `src/features/home/HomeDailyMode.tsx` |
| Data hooks | `src/features/home/useDailyChecks.ts` |
| Read model (pure) + tests | `src/lib/daily-checks/report.ts` · `report.test.ts` (9 tests) |
| DB access | `src/lib/daily-checks/queries.ts` |
| Report API (`dashboard.view`) | `src/app/api/daily-checks/route.ts` |
| Mark API (`dashboard.view`) | `src/app/api/daily-checks/mark/route.ts` |
| Item CRUD (`admin.manage_staff`) | `src/app/api/daily-checks/items/route.ts` |
| E2E | `tests/e2e/home-daily-checks.spec.ts` |
| **Operations mode vocabulary** | `src/components/sidebar/operations/operations-sidebar-shared.ts` |
| **Operations mode router** | `src/features/operations/workspace/OperationsWorkspace.tsx` |
| **Operations nav children** | `src/lib/sidebar-navigation.ts:1010` |
| **Right-rail host** | `src/components/right-rail/RightRailHost.tsx` |
| **How to claim the slot** | `src/components/right-rail/useRegisterRightPanel.ts` |
| **The inspector to copy** | `src/features/my-day/MyDayTaskInspector.tsx` |
| Frame budgets | `src/lib/right-rail/frame.ts` (`MIN_WORK_SURFACE_PX` = 784) |
| Panel lifecycle / closer | `src/lib/right-rail/panel-store.ts` · `src/lib/right-rail/close.ts` |

---

## Part 1 — the report becomes an Operations mode

Operations is already a five-mode surface with the vocabulary in one file. Adding
a mode is a known shape, done in three places that must move together:

1. `operations-sidebar-shared.ts` — add to `OperationsMode`, `OPERATIONS_MODES`,
   and `parseOperationsMode`. **All three, or the switcher and the parser
   disagree about which mode owns the URL.**
2. `sidebar-navigation.ts:1010` — a child entry **and** the matching branch in
   `resolveChild` (it is a hand-written if-chain, not derived).
3. `OperationsWorkspace.tsx` — the render branch.

**The permission gap you must close.** `/operations` is gated `operations.view`;
the report API is gated `dashboard.view`. A role with one and not the other gets
a page that renders and then 403s. Decide explicitly: widen the API gate, gate
the new mode, or accept and handle the 403 as a typed empty state. Do not leave
it to chance — `npm run verify` will not catch this.

**Keep the report a live query.** Phase 1's hard law stands: no stored report
table, no nightly job. Moving the surface does not change the read model —
`buildDailyCheckReport` is pure and already tested; reuse it untouched.

---

## Part 2 + 4 — full-width checklist, add button top-right

- Drop `mx-auto max-w-3xl` (`HomeDailyMode.tsx`, the wrapper around both panels).
- The composer is currently a **bottom row inside the checklist Panel**. Moving it
  to the top right means the panel's header row — which today holds the
  `MY CHECKS` eyebrow and the `n of N` count. Keep the day stepper where it is;
  it is the surface's title band, not a checklist control.
- Composing `Button` from `@/design-system/primitives` with `focusRing('field')`
  on the input is already correct in this file — keep it. No `className` hue or
  radius overrides (`AGENTS.md` → *Do not paint over primitives*).

**Full width and the right rail interact.** The rail **pushes**; it does not float
over the work. With the inspector open, the centre must stay ≥
`MIN_WORK_SURFACE_PX` (784). "Full width" means the checklist fills the centre
column, not that it ignores the rail's budget.

---

## Part 3 — the right inspector

**Compose the host; never build a second one.** The laws that will fail review:

- **One `RightRailHost`, one occupant slot.** Claim it with
  `useRegisterRightPanel` — the same call `MyDayTaskInspector` makes for Today.
  Never a page-local `fixed right-0 z-panel` element.
- **One closer.** `RightRailHost` paints the single `X` (top-right) and
  `closeRightPanel()` runs teardown. The child view must not mount a second close
  — not a header twin, not a footer `→|` beside a submit CTA.
- **`modal: false`, pushed, not floating.** Follow `MyDayTaskInspector`'s options.
- Read [`docs/rules/display/right-rail-inspector.md`](../rules/display/right-rail-inspector.md)
  before writing the component. For the Unbox reference the requester named, the
  right-edge SoT is `StationDisplaysPushColumn` (`src/components/station/displays/`).

**Selection is URL state**, like every other inspector here — `?item=` on the
Daily surface, parsed per-route. Declare it in `query-mode-routes.ts` under `/`;
an undeclared param is dropped at the boundary (that is how `date` was silently
lost until it was declared this session).

---

## The E2E — re-anchor it, do NOT delete the remove step

`tests/e2e/home-daily-checks.spec.ts` asserts on `[data-testid="daily-report"]`
in two places, and porting the report breaks both:

- **line ~61** — `REPORT.getByText('(you)')`, proving the viewer's own row exists.
  This assertion should **move to the Operations spec** with the report.
- **line ~79** — the final `expect(REPORT).toBeVisible()`. Its purpose is not the
  report: it proves *the surface survived the retire write* (a 500 on retire used
  to leave it mounted but stale). **Re-anchor it to the checklist panel; do not
  drop it.**

**The same-day add+remove step stays.** It is the only guard on the
`2026-08-19c` half-open window constraint — a database predicate no unit test can
reach. Deleting it to make the spec green is the one unacceptable outcome here.

**Playwright gotcha (still true):** the checkbox is Radix and repaints ~160ms
after the click. Use `.click()` + `await expect(box).toBeChecked()`; `.check()`
verifies immediately, never retries, and fails.

---

## How to test

```bash
npx tsx --test src/lib/daily-checks/report.test.ts
npx playwright test tests/e2e/home-daily-checks.spec.ts --project=qa-desktop
npm run verify
```

E2E asserts against the **QA org**, never the dogfood tenant
(`pnpm provision:qa-org` first). The dev server is the operator's on `:3050` —
**attach, never start**.

---

## Do not

- **Do not add a stored report table or a nightly job.** The report is a query.
- **Do not hard-delete `daily_check_items`.** Retire via the half-open window, or
  past reports rewrite history.
- **Do not use `now()::date`.** The warehouse civil day comes from the caller
  (`getCurrentPSTDateKey()`); the server clock is UTC and rolls over mid-shift.
- **Do not let a caller name someone else's `staffId` on a mark.** It comes from
  the session — a mark is an attestation.
- **Do not fork a page-local right panel**, a second close control, or a floating
  card over the work.
- **Do not fabricate connections** to fill the inspector. See the gating decision
  at the top.
- **Do not "fix" the concurrent session's deleted grid modules** to get a green
  build. Report the state; it is not yours.
