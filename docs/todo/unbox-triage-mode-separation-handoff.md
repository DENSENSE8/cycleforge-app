# Handoff: Unbox ↔ Triage mode separation (wrappers + Playwright)

**For:** Claude Code (or any agent continuing this lane)  
**Lane:** `main` (WS-DOGFOOD)  
**Status:** Partial fix landed (single Unboxed first-open axis). **Remaining:** structural SoC — per-mode wrappers so Unbox and Triage stop sharing one display/sort brain.  
**Do not edit:** the plan file `unbox_single_sort_axis_*.plan.md` (already implemented).

---

## Prompt (paste into Claude Code)

```text
You are continuing Cycle Forge receiving-station work on lane `main`.

## Mission

Unbox (`/unbox`, mode `receive`) and Triage/Arrival (`/triage`, mode `triage`) still share one rail display engine and too many time/sort defaults. That caused the Unboxed list to fight itself (SQL sort → fetcher re-sort → shell re-sort → age fallbacks). A first-open axis patch landed; it is NOT enough.

Goal: **complete separation of concerns per mode** —
1. Each mode owns a **mode wrapper** that owns its time axis, sort policy, scan apply side-effects, and row chrome defaults.
2. Shared primitives stay dumb shells (layout / fetch plumbing / edit-mode) — they must not invent a second time story via defaults.
3. Cover every mode with **extensive Playwright e2e** that asserts the mode contracts (not just "page loads").

Read before coding:
- `AGENTS.md` (SoT + compose→grow; Kinetic Ledger)
- This handoff: `docs/todo/unbox-triage-mode-separation-handoff.md`
- Prior single-axis plan (implemented, do not re-do): preserveServerOrder + unbox_opened_at only
- Worklog: `pnpm worklog:tail`

Constraints:
- Stay on current branch/worktree; user owns commits; never stash.
- Compose/grow SoT — do NOT fork a second SidebarRailShell. Wrap it.
- Unbox and Triage must NEVER share a default `getActivityAt` that falls through to `created_at` / `last_activity_at`.
- Triage door-scan time must never drive Unboxed order or age.
- `npm run verify` green before done; append `pnpm worklog`.
- Prefer mode wrappers + feed descriptors over more boolean flags on the shared base.

## Done when

- [ ] `UnboxRail` / `TriageRail` (names flexible) are the only callers of `RecentActivityRailBase` / `ReceivingFeedRail` for those modes — panel mounts wrappers, not raw feeds with mode-conditional props.
- [ ] Shared base has **no** default activity axis (`last_activity_at ?? created_at` removed or forced required).
- [ ] Unbox: order + age = `unbox_opened_at` only; re-scan opens workspace, does not move row; missing stamp → `—`.
- [ ] Triage: order + age = door-scan / triage recency only; Unbox open stamps never reshuffle triage.
- [ ] Scan apply paths are mode-gated (no cross-feed writes except documented sanctioned mirrors).
- [ ] Playwright matrix below is green (or skipped only with explicit fixture absence + clear reason).
- [ ] `npm run verify` passes.
```

---

## What already landed (do not reopen)

Single Unboxed sort + display axis (first Unbox-open):

| Layer | Behavior now |
|---|---|
| SQL `view=unbox_opened` | `ORDER BY COALESCE(ru.opened_at, ops MAX…)` — no triage `scanned_at` / door fallbacks |
| `buildUnboxReceivedFetcher` | Dedup preserves SQL order; **no** client `.sort(unboxOpenedRecencyMs)` |
| Shell | `preserveServerOrder: true` on `unboxRecent` → identity order |
| Age / popover | `getActivityAt → unbox_opened_at ?? null`; UI shows `—` if null (no `created_at`) |
| Upsert merge | Preserves first `unbox_opened_at`; existing carton stays in place; new prepends |

Tests: `sidebar-rail-shared.test.ts`, `feeds.unbox-opened.test.ts`, `receiving-queries.rail.test.ts`, `build-sql.test.ts`. Verify was green after that pass.

**Why the bug class can still return:** Unbox and Triage still paint through the same `RecentActivityRailBase` with optional feed knobs. The shared default `getRowActivityAt = last_activity_at ?? created_at` remains. One missed `getActivityAt` / flag and Unboxed ages flip to days-vs-minutes again. Mobile e2e still asserts the **old** unbox query (`view=activity&sort=unboxed_newest`), proving contract drift.

---

## Architecture map (current)

```
/unbox|/triage → ReceivingSurfacePage → ReceivingSidebarPanel + ReceivingDashboard
ReceivingSidebarPanel
  └─ ReceivingRailBody(mode)
        ├─ mode=triage → TriageSidebarBody → TriageCombinedList / …
        │                    └─ ReceivingFeedRail(feed=triage*)
        └─ else (unbox) → ReceivingFeedRail(feed=unboxRecent)
                              └─ RecentActivityRailBase   ← SHARED DISPLAY BRAIN
                                    └─ SidebarRecentRailBase / useSidebarRail
                                          └─ SidebarRailShell + RailRow

Right pane (already mode-wrapped — mirror this on the left):
  UnboxLineWorkspace vs TriageLineWorkspace + StationWorkbench / entity-context

Feeds SoT: src/lib/receiving/rail/feeds.ts
Scan apply: scan-apply.ts + useTrackingScan.ts (intakeSurface unbox|triage)
Cache:     src/lib/queries/receiving-queries.ts (mergeRailRows, upsert*, invalidate*)
SQL:       src/lib/receiving/lines/build-sql.ts
```

### Feed inventory

| Feed id | Surface | Sort / label axis | Notes |
|---|---|---|---|
| `unboxRecent` | Unbox sidebar dock | SQL first-open; `unbox_opened_at`; `preserveServerOrder` | **Fixed** — keep |
| `unboxQueue` | Unbox workbench Queue | `view=scanned` + priority | Cross-reads triage intake — not Unboxed |
| `scanned` | Triage Prioritize | same SQL as queue; `scope=triage` cache | |
| `triageCombined` | Triage sidebar default | Fetcher `recencyMs` **and** shell default activity | **Double axis — fix** |
| `triageUnfound` / `triageDone` | Triage tabs | Stub fetchers | Need explicit `getActivityAt` |
| `viewed` | Unbox workbench | `getViewedAt` | |

**Shared identity chrome (OK to share):** `CartonContextCard` / `StationContextBar` from `@/components/station/entity-context` — same carton facts, different station chrome around them. Right pane already follows Unbox golden + Triage adapter; **sidebar rail does not**.

**Must NOT share:** time axis, sort policy, scan optimistic row shape, which RQ segments get upserted, popover age fallbacks, default `RAIL_STATUS` grammar if it blurs “At dock” vs “opened”.

---

## Coupling hotspots (fix / wrap these)

| File | Symbol | Why it's wrong for SoC |
|---|---|---|
| `RecentActivityRailBase.tsx` | `getRowActivityAt` default | Falls through to `created_at` — Unbox flicker root |
| `RecentActivityRailBase.tsx` | One component for all receiving rails | Mode behavior = optional props; easy to miss |
| `ReceivingFeedRail.tsx` | Thin feed→base binder | Correct direction, but Unbox/Triage still mount it directly with the same base |
| `useSidebarRail.ts` | `sortRowsByActivity` + patch path | Generic; Unbox needs identity forever; Triage needs recency — policy must live in mode wrapper / feed, never silent default |
| `feeds.ts` | `triageCombined` | Fetcher sorts via `recencyMs` (`received_at→last_activity_at→scanned_at→created_at`); shell ages via default `last_activity_at??created_at` — **two axes in one rail** |
| `feeds.ts` header comment | Still says unboxRecent = “unboxed ∪ new-scanned ∪ unfound” | Stale mental model; Unboxed is `view=unbox_opened` only |
| `scan-apply.ts` / `receiving-sidebar-shared.ts` | Shared stub builders | Triage stubs can stamp `unbox_opened_at` / Unbox stubs stamp door fields — split by mode |
| `scan-apply.ts` | `upsertUnboxQueueRows` from triage | Intentional cross-write buried in scan-apply — extract **`UnboxQueueBridge`** |
| `receiving-queries.ts` | `mergeRailRows` freezes `unbox_opened_at` | Correct for Unboxed; dangerous if Triage rows share the same merge with accidental stamps |
| `tests/e2e/mobile-unbox-list.spec.ts` | `view=activity&sort=unboxed_newest` | **Out of date** vs desktop `unbox_opened` + first-open |

Thin seams that already hint at wrappers (grow these):

- `TriageRecentRail`, `TriageCombinedList`, `TriageUnfoundList`, `TriageDoneList`
- `ReceivingRailBody` (mode switch) — promote Unbox branch to `UnboxSidebarBody` / `UnboxRailDock` parallel to triage

---

## Target shape: per-mode wrappers

Mirror the right-pane pattern (`UnboxLineWorkspace` / `TriageLineWorkspace`) on the **queue/rail** slot:

```
components/sidebar/receiving/
  unbox/
    UnboxSidebarBody.tsx      # mounts UnboxRailDock only
    UnboxRailDock.tsx         # feed=unboxRecent; FORCES preserveServerOrder + unbox_opened_at
    unbox-rail-policy.ts      # getActivityAt, age label, aria-label, stagger — no triage imports
    unbox-scan-stubs.ts       # matched/unmatched stubs — unbox_opened_at only on first insert
  triage/
    TriageSidebarBody.tsx     # already exists — keep as triage waist
    TriageRailPolicy.ts       # ONE door-scan axis (match fetcher + getActivityAt); preserveServerOrder after fetcher OR single client axis
    triage-scan-stubs.ts      # leadingRow / pending — scanned_at only; NEVER unbox_opened_at
  bridges/
    UnboxQueueBridge.ts       # ONLY sanctioned cross-write: triage match → upsertUnboxQueueRows
  shared/                     # OR keep rail-shell generic
    ReceivingFeedRail.tsx     # dumb binder: requires explicit policy (no default activity)
    RecentActivityRailBase.tsx  # require getActivityAt; delete created_at default
```

Optional promote (after wrappers work): split `feeds.ts` → `unbox-feeds.ts` / `triage-feeds.ts` composing shared fetch helpers.

### Policy contracts (lock these)

| Mode | Sort owner | Stamp | Re-scan | Age if missing |
|---|---|---|---|---|
| **Unbox / Unboxed** | Server SQL only | `unbox_opened_at` (first open) | Open workspace; **no** reorder | `—` |
| **Triage combined / prioritize** | **One** door-scan axis (align fetcher + `getActivityAt`) | `scanned_at` (or documented triage recency) | Per triage rules | triage policy — never `unbox_opened_at` |
| **Unbox Queue** (workbench / door queue) | Triage door membership | Door-scan — **not** Unboxed rail | Separate from Unboxed list | Own feed |

Sanctioned cross-write (keep, lift into `UnboxQueueBridge`):

- Triage matched scan may mirror into **Unbox Queue** (`upsertUnboxQueueRows`) — never into Unboxed membership/order via triage timestamps.

---

## Playwright matrix (extensive, per mode)

Auth: `tests/.auth/admin.json` (global-setup). Prefer desktop project unless noted.

### A. Unbox (`/unbox`) — new or extend `tests/e2e/unbox-rail-order.spec.ts`

| # | Behavior | Assert |
|---|---|---|
| U1 | Unboxed rail loads | `ul[aria-label="Unboxed activity"]` (or current aria) has rows **or** skip with fixture reason |
| U2 | Age axis | Visible age strings match `unbox_opened_at` relative time for sampled rows (API `view=unbox_opened` vs DOM); never show multi-day age when API first-open is minutes |
| U3 | Order matches API | DOM order of carton keys == API order for `view=unbox_opened` (no client reshuffle) |
| U4 | Re-scan stability | Open existing Unboxed carton via scan/deep-link twice; list index **unchanged**; workspace opens |
| U5 | New open prepends | First-open of a carton not in list → appears at top once; subsequent opens stay put |
| U6 | Missing stamp | If a stub has null `unbox_opened_at`, popover/row shows `—` (not `created_at` age) |
| U7 | Isolation | After Unbox scans, Triage combined order/age unchanged when switching to `/triage` (sample N ids) |
| U8 | Refresh stickiness | Keep/extend `unbox-refresh-stickiness.spec.ts` |
| U9 | Stagger | Keep `unbox-siderail-stagger.spec.ts` |

### B. Triage (`/triage`) — new `tests/e2e/triage-rail-order.spec.ts`

| # | Behavior | Assert |
|---|---|---|
| T1 | Combined rail chrome | Triage list mounts; Unbox-only Receive bar **absent** (see `receiving-tech-modes`) |
| T2 | Door-scan axis | Row ages / order follow triage scanned recency API, **not** `unbox_opened_at` |
| T3 | Scan prepend | New triage scan appears per triage policy (leadingRow / top) |
| T4 | Isolation | Unbox Unboxed order unchanged after triage-only scans |
| T5 | Save for unbox | Terminal action present when line open; does not rewrite Unboxed first-open stamp |

### C. Cross-mode / contract drift

| # | Behavior | Assert |
|---|---|---|
| X1 | Fix `mobile-unbox-list.spec.ts` | Assert `view=unbox_opened` (or current desktop Unboxed query), **not** stale `view=activity&sort=unboxed_newest` |
| X2 | API views | Extend `receiving-lines-endpoints` / dedicated test: `unbox_opened` ORDER BY has no triage fallbacks in SQL fixture (unit already; e2e can check payload fields present) |
| X3 | Mode smoke | Keep `receiving-tech-modes.spec.ts`; add assertions that Unboxed aria-label / Triage feed titles stay mode-specific |

### D. Fixtures

- Prefer live USAV dogfood rows; if empty, `test.skip` with message.
- Optional seed: tracking + `receiving_unbox.opened_at` known — document in spec header (do not invent vendor-specific product copy).

Run (examples):

```bash
npx playwright test tests/e2e/unbox-rail-order.spec.ts tests/e2e/triage-rail-order.spec.ts tests/e2e/mobile-unbox-list.spec.ts tests/e2e/receiving-tech-modes.spec.ts --project=desktop
```

---

## Implementation order (Claude Code)

1. **Make activity axis required** on `RecentActivityRailBase` / shell — delete `getRowActivityAt` default; fix call sites (Testing rail, Shipping history, every receiving feed).
2. **Fix `triageCombined` double axis** — one door-scan `getActivityAt` aligned with fetcher; prefer `preserveServerOrder` after fetcher sort *or* a single matching client axis (pick one).
3. **Add `UnboxSidebarBody` + `UnboxRailDock`** — move Unbox branch out of `ReceivingRailBody`; hard-code Unbox policy (do not rely on remembering `preserveServerOrder` in the feed alone).
4. **Split scan stubs + extract `UnboxQueueBridge`** — triage stubs never stamp `unbox_opened_at`; Unbox stubs don’t own door-scan vocabulary; triage→Queue mirror is a named bridge.
5. **Harden Triage wrappers** — every triage list passes triage `getActivityAt` explicitly.
6. **Update stale comments + mobile e2e query** to `unbox_opened`.
7. **Playwright matrix** A–C (esp. Unboxed order vs door-scan + Triage recency — current gap).
8. **`npm run verify`** + `pnpm worklog "…" --result done`.

### Files to touch first

- `src/components/sidebar/receiving/RecentActivityRailBase.tsx`
- `src/components/sidebar/receiving/ReceivingRailBody.tsx` → `UnboxRailDock`
- `src/components/sidebar/receiving/ReceivingFeedRail.tsx`
- `src/lib/receiving/rail/feeds.ts` — triageCombined policy + stale comments; later split registries
- `src/components/sidebar/receiving/scan-apply.ts`, `receiving-sidebar-shared.ts`, `useTrackingScan.ts`
- `src/lib/queries/receiving-queries.ts` — keep Unboxed merge freeze segment-scoped
- `src/components/sidebar/receiving/TestingRecentRail.tsx` (must pass explicit activity)
- New: `tests/e2e/unbox-rail-order.spec.ts`, `tests/e2e/triage-rail-order.spec.ts` (or `triage-rail-recency.spec.ts`)
- Fix: `tests/e2e/mobile-unbox-list.spec.ts`

### Out of scope

- Changing COALESCE-once `opened_at` writer
- Station-builder registry rewrite (station-block skill) — wrappers now; registry later if Studio needs it
- Forking `SidebarRailShell`

---

## Compound opportunities

- **Do now:** required `getActivityAt`; triageCombined single axis; Unbox/Triage rail docks; stub split + `UnboxQueueBridge`; fix mobile e2e contract.
- **Promote next:** `ReceivingRailPolicy` type + mode-scoped `unbox-feeds.ts` / `triage-feeds.ts`; mode-scoped status packs if dots stay wrong.
- **Deferred / ask:** migrate Testing/Shipping rails to the same required-policy pattern; Studio station-block data sources for Unboxed vs Triage.

---

## Verify

```bash
npm run verify
# inner loop while editing:
npx tsx --require ./scripts/register-server-only-shim.cjs --test \
  src/components/sidebar/rail-shell/sidebar-rail-shared.test.ts \
  src/lib/receiving/rail/feeds.unbox-opened.test.ts \
  src/lib/queries/receiving-queries.rail.test.ts
```
