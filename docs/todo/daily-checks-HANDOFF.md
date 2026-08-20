# Daily checklist + daily report — HANDOFF

**Status:** Shipped and working end to end. **Looks empty because the list has 0 items** — see *Start here*.
**Scope of this doc:** only the daily checklist and its report. Nothing else.
**Built:** 2026-08-19. **Verified:** `npm run verify` green; E2E green on `qa-desktop`.

---

## Start here (2 minutes)

The feature renders its empty state until someone adds list items, which is why the
Home page looks untouched. Do this first:

1. Open `/` — it lands on **Home → Daily** (it is the default mode).
2. In "My checks", type into **"Add a daily check…"** and press Add. Add 3–5 real ones
   ("Dock door unlocked", "Label printer has stock", "Scanner batteries charged").
3. Tick them. The report below fills in per person.

**If you do not see the add box**, your role lacks `admin.manage_staff` — the composer
is gated on it (`HomeDailyMode.tsx` → `canManage`). Either grant it, or change the gate.
That is the single most likely reason this looks like nothing happened.

---

## What exists

| Layer | Path |
|---|---|
| Migration (2 tables) | `src/lib/migrations/2026-08-19b_daily_checks.sql` |
| Constraint fix | `src/lib/migrations/2026-08-19c_daily_check_window_bound.sql` |
| Drizzle models | `src/lib/drizzle/schema.ts` → `dailyCheckItems`, `dailyCheckMarks` |
| Types | `src/lib/daily-checks/types.ts` |
| Read model (pure) | `src/lib/daily-checks/report.ts` + `report.test.ts` (9 tests) |
| DB access | `src/lib/daily-checks/queries.ts` |
| API — report | `GET /api/daily-checks?date=YYYY-MM-DD` (`dashboard.view`) |
| API — tick | `POST /api/daily-checks/mark` (`dashboard.view`) |
| API — list CRUD | `POST` / `DELETE /api/daily-checks/items` (`admin.manage_staff`) |
| UI | `src/features/home/HomeDailyMode.tsx` + `useDailyChecks.ts` |
| Wiring | `HomeWorkspace.tsx`, `home-modes.ts` (`DEFAULT_HOME_MODE = 'daily'`), `sidebar-navigation.ts` |
| E2E | `tests/e2e/home-daily-checks.spec.ts` |

Both migrations are **already applied** to the dev DB.

---

## The model, and the parts that are not obvious

**Per person, not per item.** A mark is keyed `(item, staff, day)`, so every staffer runs
the same list and ticks their own copy. That is what lets the report answer *"who still
owes checks"* — the whole reason it exists. A staffer who ticked nothing renders at
`0 / N` rather than being omitted; `report.ts` takes the roster as an **input** precisely
so absence is visible.

**The report is a live read, not a stored artifact.** No nightly job, nothing to freeze.
Stepping the date back re-queries that day. Do not add a `daily_reports` table.

**Items are retired, never deleted.** `effective_from` / `retired_at` is a **half-open
window** — an item is in effect on day D when
`effective_from <= D AND (retired_at IS NULL OR retired_at > D)`. This is what makes a
past report show the list *as it stood that day*. A boolean `active` cannot do that.
Equal bounds = added and removed the same day = in effect on no day (that was the
`2026-08-19c` fix; the original `>` bound 500'd on same-day add+remove).

**Only today is editable.** A past day is a record, not a form.

---

## How to test

```bash
npx tsx --test src/lib/daily-checks/report.test.ts                    # pure read model
npx playwright test tests/e2e/home-daily-checks.spec.ts --project=qa-desktop
npm run verify                                                        # before done
```

The E2E covers the full loop **including same-day remove**, which is the only guard on
the `2026-08-19c` constraint — that bound is a database predicate, so no unit test can
reach it. Do not delete that step.

**Playwright gotcha:** the checkbox is Radix (controlled through the query cache) and
repaints ~160ms after the click. Use `.click()` + `await expect(box).toBeChecked()`.
`.check()` verifies immediately and never retries, so it fails.

---

## Next steps, roughly in order

1. **Seed real items** (above). Until then the surface teaches nothing.
2. **Decide the manage gate.** `admin.manage_staff` may be too tight if shift leads
   should curate the list. It is one string in two routes.
3. **Reorder items.** `sort_order` exists and appends; there is no UI to reorder.
4. **A "nobody has done X" signal.** The report shows per-person progress but nothing
   aggregates "item 3 is unticked by everyone", which is the interesting failure.
5. **Retention/history.** No view older than the date stepper. Fine for now.

---

## Do not

- **Do not add a stored report table or a nightly job.** The report is a query.
- **Do not hard-delete `daily_check_items`.** Retire them, or past reports rewrite history.
- **Do not use `now()::date` for the day.** The server clock is UTC and rolls the day over
  mid-afternoon on the floor. The caller passes the warehouse civil day
  (`getCurrentPSTDateKey()`).
- **Do not let a caller name someone else's `staffId` on a mark.** It comes from the
  session; a mark is an attestation.
- **Do not cite the deleted `checklist_templates` precedent against this.** That was
  dropped because Unbox procedure steps must derive from photo evidence. A daily ops
  check has no evidence to derive from — human attestation *is* the fact being recorded,
  and the mark carries who and when.
