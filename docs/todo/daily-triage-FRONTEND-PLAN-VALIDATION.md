# Daily triage — Frontend workbench (for validation)

**Status:** Proposal — **needs validation** (do not schedule build until pressure-tested)  
**Created:** 2026-07-31  
**Companion backend plan:** [`daily-triage-BACKEND-PLAN-VALIDATION.md`](./daily-triage-BACKEND-PLAN-VALIDATION.md)  
**Cursor plan:** `~/.cursor/plans/triage_frontend_workbench_c7e2bfc5.plan.md`  
**Handoff (current state + what's next):** [`daily-triage-today-workbench-HANDOFF.md`](./daily-triage-today-workbench-HANDOFF.md)  
**Execution prompt (F0 — SUPERSEDED, describes the rejected first attempt):** [`daily-triage-frontend-F0-EXECUTION-PROMPT.md`](./daily-triage-frontend-F0-EXECUTION-PROMPT.md)  
**Related:**
- [`contextual-my-day-home-plan.md`](./contextual-my-day-home-plan.md)
- [`home-ops-tv-collab-surfaces-plan.md`](./home-ops-tv-collab-surfaces-plan.md)
- [`.claude/rules/contextual-display.md`](../../.claude/rules/contextual-display.md)
- [`.claude/rules/ui-design-system.md`](../../.claude/rules/ui-design-system.md)
- [`docs/settings-registry.md`](../settings-registry.md)

> Validate with operators before implementation. Backend feed/APIs must land (or be stubbed) for F1+. Update the **Validation log** below as checks land.

---

## Verdict (working)

`/` Today becomes the **main daily triage** workbench. The screenshot **My Day** left column is extracted as a shared SoT rail and imported on Dashboard + Unbox. Subscription-born rows (pinned tracking, messages, bad-feedback tickets) appear as filterable tasks. No second feed logic in the client.

**Depends on:** Backend B0–B3 (feed + subscribe), B1 (pin tracking), B7–B8 (messaging + bad feedback) for full surfaces; F0 can start against current `/api/my-day`.

**Out of scope:** Webhooks/migrations/fan-out · email client · Ops TV/Brief · second link UI.

---

## Product UI goals

1. Today = categorized open/done triage (queues + subscription tasks)
2. `MyDayRail` SoT on `/`, `/dashboard`, `/unbox`
3. Filters: urgent · assignee · category · open/done
4. Pin tracking → status updates as triage rows
5. Platform messages + auto bad-feedback tickets visible on Home + Support + entity chips

---

## Phases

### F0 — Rebuild Today on the house SoT shells — **LANDED 2026-08-01**

**The first F0 attempt was rejected on the merits and replaced.** It lifted the
existing markup verbatim into a `MyDayRail` / `MyDayTriagePane` pair — which
preserved a hand-rolled 380px column of `<button>` rows and a hand-rolled detail
pane, i.e. three shells the design system already owns. A "SoT extraction" that
carries the fork forward under a new filename is not an extraction. Today is now
**composed**, and the hand-rolled components are deleted (`MyDayRail`,
`MyDayTriagePane`, `MyDayContextPane`).

| Region | House SoT it composes | Module |
|---|---|---|
| Chrome / facets | `WorkbenchChromeHeader` `density="band"` — lane tabs **All · Do next · Assigned to me · Needs attention** with counts, queue doors in the `right` slot | `MyDayWorkspace` |
| Collection map | `LedgerGridSurface` + `GridSurfaceDescriptor` (`@/design-system/components/grid`) | `grid/MyDayGridView` · `MyDayGridColumnHeader` · `MyDayGridRow` |
| Record plane | `RightRailHost` via `useRegisterRightPanel` (non-modal) | `MyDayTaskInspector` |
| Feed | unchanged — still the one client of `GET /api/my-day` | `useMyDayFeed` |
| Read model | feed → one flat row type (pure, no React) | `lib/my-day/my-day-tasks` |
| Column model | house column SoT + shared geometry | `lib/my-day/my-day-grid-layout` |

**Handoff for the next session:** [`daily-triage-today-workbench-HANDOFF.md`](./daily-triage-today-workbench-HANDOFF.md).

**There is no My Day sidebar, and Home has no page header.** Both were removed
in the same pass:

- The lane rail was a resident 280px column whose whole job was a four-way
  filter over the table beside it. That facet belongs in the table's own chrome
  — where Unbox (Queue/Viewed/History) and Receiving History (All/Unfound) put
  theirs — so it is now a `WorkbenchChromeHeader` band, tab 1 = All, the rest
  the specific lanes. The grid went from ~1000px to 1376px at 1440. The queue
  counts ride the same band's `right` slot as quiet label+count links — they are
  doors to other pages, and the `KpiStrip` heroes they briefly sat in claimed
  they were metrics worth reading.
- Home's `HorizontalButtonSlider` mode band was the exact twin
  `display/workbench.md` forbids ("L2 Mode lives in GlobalHeader… never remount
  a full-width mode rail as a twin of the header control"), and it cost 60px on
  every Home region. Home is now registered in `SIDEBAR_PAGE_NAV` with its six
  modes, so `HeaderModeSwitcher` serves them — the placement `HomeWorkspace`'s
  own docblock had called house-final and deferred. `useHomeMode` lost its
  writer (the header owns the write path; a second writer is how a surface ends
  up with two disagreeing mode SoTs), and `HOME_MODE_ITEMS` / `homeModeLabel`
  are gone — labels and icons live in the nav registry now.

Notes that matter for F1:

- **This is already the plan's `TriageRow` shape** — `myDayTasksFromFeed` is the
  client-side flattening of `assigned` + `interrupts` the amended F1 note calls
  for. When categories land, this module is the single place that changes.
- **Capabilities are declared and all `false`** (`MY_DAY_GRID_CAPABILITIES`):
  no triage wash, no multi-select, no in-cell edit, no Fields menu, no day bands
  — each a decision, registered in `grid-surface-capabilities.guard.test.ts` and
  `grid-column-tier.guard.test.ts` like every other family.
- **The view is URL-durable**: `?scope=` (lane) and `?task=` (selection) were
  already owned by the `/` spec, and `?colsort=`/`?coldir=` are carried, so a
  pasted link reproduces lane + selection + sort. No route-param change was
  needed.
- **Grew one SoT**: `WorkStatus` had no label/tone map, so the old pane rendered
  `status.replace('_', ' ')` in a hardcoded blue chip. Now
  `lib/work-orders/work-status-display`.
- The inspector registers the **stable** occupant id `detail:my-day` (row→row is
  the loop here); it is pure display, so the exception's re-seed/flush
  preconditions hold.

**Mounted on Home Today only.** Dashboard context and Unbox station context each
carry a `// TODO(daily-triage F0→F1): mount MyDayRail here pending OQ1` marker
and **no rendered change** — `src/components/sidebar/DashboardOrdersContextPanel.tsx`
and `src/components/receiving/workspace/LineEditPanel.tsx`. Wiring either shape
now would answer OQ1 by fait accompli instead of by operator validation.

**OQ1 has no ready-made mountable unit any more, and that is honest.** Today's
lanes are a chrome-band facet over its own table, not a portable rail — so
"mount MyDayRail on Dashboard/Unbox" now means deciding what the thing being
mounted *is* (a task list? the grid? a count strip?), which is the question OQ1
was always really asking.

**Validate:** On Dashboard/Unbox, does the rail replace the current context panel, sit above it, or toggle? Station scan-first Unbox — is a personal triage rail welcome or noise?

### F1 — Today main triage display

> **2026-08-01 — schema collision with `home-ops-tv-collab-surfaces-plan.md` resolved; renamed `TriageTask` → `TriageRow`.**
> Full design lives in the backend doc's B3 section. The short version: this is a **client-side flattening of
> the existing, additively-widened `MyDayFeed`** (`assigned` + `interrupts`), not a new backend entity — so
> "categories match backend `TriageTask.category`" below should now read `TriageRow.category`, computed from
> `WorkOrderRow.entityType`/`queueKey` (assignment-sourced rows) or the widened `MyDayInterruptKind` (inbox-sourced
> rows, via the already-shipped `/api/inbox`/`staff_inbox_items`). `ops_plan_tasks`/the home-ops-tv-collab "Tasks"
> mode is untouched — different concept, different URL params, no relation to `TriageRow`.

Workbench list → select → detail:

- Categories match backend `TriageRow.category` (derived, see note above — not a new stored field)
- Open/done + urgency badge
- Detail: grow `MyDayContextPane`; linked order/ticket → non-modal right rail
- Linkage strip: compose Support `LinkageStrip` / context hub

**URL filters:** `?urgent=1&assignee=mine|unassigned|<id>&category=&state=open|done`  
Inbox mode stays deep ledger; Today is the action board. `?assignee=` only meaningfully filters
assignment-sourced rows — inbox-sourced rows (tracking/messaging/feedback) are inherently "mine" by
construction and have no unassigned state; don't let `?assignee=unassigned` silently hide them.

**Row actions:** Start · Mark done · Assign… · Pin/Unpin — **"Mark done" only renders on rows that carry
an `inboxItemId`** (subscription-sourced; calls the existing `PATCH /api/inbox/[id]`). Assignment-sourced
rows have no manual "done" — the underlying work's own status is truth, and completed/cancelled work
already drops out of the feed upstream.

**Validate:** Category IA for floor staff (too many buckets?). Mobile `/m/home` — same rail later or desktop-only v1?

### F2 — Pin tracking UI

`SubscribeToggle` on Incoming tracking detail, order shipped tracking row, triage tracking rows. Copy: “Pin tracking updates” / “Watch status”. Hide when `home_inbox` off.

**Validate:** Which surfaces are highest-value for pin (Incoming vs Shipped vs Unbox)? Spam risk if every status ping shows as a task?

### F3 — Platform messages UI

- Today **Messaging** category
- Support: capability-gated conversation list/mode; escalate via `SupportCreateTicketModal`
- Do **not** use Zendesk composer or claim clipboard as primary marketplace reply UX until send API exists

**Validate:** Is a Support mode enough, or does messaging need its own Home mode? Reply-on-platform CTA acceptable for v1?

### F4 — Bad feedback settings + shared displays

**Settings Registry** (keys from backend B8):

- Auto-create ticket on bad feedback
- Threshold
- Default assignee

Grow `SettingPage` beyond `'receiving'` — registry-driven UI only.

| Surface | Expectation |
|---|---|
| Home Today | Feedback / Support rows; urgent for bad feedback |
| `/support?ticket=` | Focus created ticket |
| Order / Unbox chips | `ticket_links` light up |
| Dashboard / Unbox rail | Assignment interrupts |

**Validate:** Settings under Support vs Integrations? Who may change auto-ticket policy (admin only)?

### F5 — Handoff UX

Routine handoff = **Assign** + optional thread note. Create-ticket modal for net-new helpdesk only. Staff DM stays human chat, not ticket transport.

**Validate:** Does this match how support actually hand off today?

### F6 — Verify

E2E QA org: pin → Today row; bad-feedback ticket on Home + Support; filters; rail on Dashboard/Unbox. DS ratchets + `npm run verify`.

---

## Open questions (fill during validation)

1. MyDayRail placement on Unbox/Dashboard (replace vs compose)? — **Unbox half is no longer open — it's a hard constraint, not a preference.** Repo audit: Unbox's left `ContextPanelLayout` slot is a single-return dispatcher already returning the Queue/Viewed/History rail (`ReceivingSidebarPanel`), and the right edge is a mutually-exclusive stack (Displays/Ticket/Claim/tool/`detail:receiving`) that is already full. There is nowhere to mount a rail on Unbox today without evicting an existing occupant or growing a new region — this needs an explicit "evict X" or "add a region" decision, not a "welcome or noise" judgment call. Dashboard half stays open, but is now two distinct candidates, not one: the left `ContextPanelLayout` (→ `DashboardOrdersContextPanel`) and the right `RightRailHost` `detail:order` occupant — pick one explicitly.
2. Desktop-only v1 for triage pane? — **working answer: yes**, pending operator confirmation. Desktop-first is the existing precedent for every Workbench surface in this app (Products, FBA board, Outbound); the mobile/handheld-first convention from generic warehouse-ops UI belongs to the Station contract (scan-driven, floor density), not this pick+edit board. Confirm floor staff don't expect to triage *from the scan bench* — if they do, that's a Station surface question, not this one.
3. Pin notification fatigue — show all status changes or only delivered/exception? — **working answer: milestone-only** (delivered / exception / delayed). Default-to-silence is the notification-UX consensus: surface a Today row only when the event is subscribed-to *and* time-sensitive/decision-worthy; batch everything else into a digest rather than a live row per carrier scan. Encode this as a backend rule in B1/B3 so it isn't left to UI-side dedup.
4. Messaging: Home category only vs Support mode vs both? — **still open, but sharpened.** Repo audit: Home already ships a live "inbox" mode ("what changed on things I follow") powered by the same `staff_subscriptions`/`SubscribeToggle` machinery this plan wants to extend for messages — decide whether Messaging is a category inside that existing mode or a true third surface before building either, to avoid two overlapping "things I'm subscribed to" views.
5. Can F0 ship before backend B3, with triage pane as a thin shell? — **answered by shipping it (2026-08-01).** Yes: the extraction is display-only, so it carries no dependency on `TriageTask`. The cost is that `MyDayTriagePane` is a named shell around the pre-existing onboarding + context stack rather than a board — it must not be dressed up with placeholder categories before B0–B3 land, or the surface will claim data the feed does not have.

**Still gating F1** (do not start it on the strength of F0 landing):
- Backend **B0–B3** — `TriageTask` does not exist in this repo (`grep -rn "TriageTask" src` → nothing), so there is no `category` / `open` / `done` to build a board from.
- **OQ1** — Dashboard mount is two distinct candidates (left `ContextPanelLayout` vs the right `RightRailHost` `detail:order` occupant); Unbox has no free slot at all. Both need an explicit decision, not a default.
- **OQ4** — messaging surface, unresolved and overlapping Home's existing `inbox` mode.

**Surfaced by research — add to the validate list:**

6. Category IA — cap `TriageTask.category` at 5–7 buckets (Miller's Law: primary IA categories degrade in findability beyond that) and confirm the set via a card-sort with floor staff rather than by assumption. Linear's own Triage view deliberately keeps groupings closed (ordering only) rather than open-ended.
7. Row actions — planned set (Start · Mark done · Assign… · Pin/Unpin) skews toward "do the work," matching Linear's accept/decline/duplicate/snooze pattern except for a Snooze/defer equivalent. If F5 handoff volume turns out high, revisit whether "defer without losing it" needs its own action.

---

## Validation findings — repo audit (2026-08-01)

Complementary to the industry-pattern pass above: this checks the plan's file/component claims against actual code. **Net: F1/F4/F5/F6 are accurately scoped. F0 overstates what's left to extract in one place and understates a real structural blocker in another. F2 proposes a placement that conflicts with an already-shipped house rule.**

**F0 — the "split" is smaller than described, and Unbox has no free slot.** `useMyDayFeed` and `MyDayContextPane` are **already** separate files, imported by `MyDayWorkspace.tsx` — nothing to extract there; the plan lists them as F0 deliverables when they pre-exist (this is presumably why the companion F0 execution prompt could be written already). The actual unextracted piece is the left list (inline JSX inside `MyDayWorkspace.tsx` today) — that's the real `MyDayRail` scope; `MyDayTriagePane` isn't a distinct thing yet, `MyDayWorkspace` plays that role today. Unbox placement is a hard constraint, not an open question — see Open Question #1 above. Also: composing `SidebarRailShell` for `MyDayRail` would be the wrong move even though house law says "compose, don't fork" — that shell's actual prop contract is one homogeneous fetch + per-row optimistic patch + grouping (the recent-activity-feed job), while My Day's data is four heterogeneous shapes (`doNext` single object, `assigned[]`, `interrupts[]`, `queueCards[]` counts) with no per-row patch semantics. Growing a new named shell here is the honest `pattern-evolution.md` call, not a fork — worth stating explicitly so a reviewer doesn't bounce the PR citing the rail SoT.

**F1 — mostly accurate; two gaps.** `MyDayContextPane` exists and already runs through the reduced-motion bridge, so "grow" is the right verb, not "create." Reusing `RightRailHost` will work, but the plan omits the **stable-occupant-id requirement**: a queue-walking inspector (which F1's "select → detail" implies) should register a stable id like `detail:triage-task`, not per-record `detail:triage-task:<id>`, to avoid an exit→empty→enter flash on every arrow-step — the same rule `detail:order`/`detail:receiving` already follow. `LinkageStrip` exists and does the right job but is coupled to `'receiving'|'tracking'` anchor types only — "compose" undersells the bundle-shaping needed once `TriageTask` categories go beyond those two. **URL param collision:** `?category=` already has a live meaning on `/dashboard` (read there as a legacy alias for `?mode=` domain routing) — not active on bare `/` today, but a landmine if this rail is later composed onto Dashboard per OQ1. `urgent`/`assignee` are clean; `state` is reused elsewhere with no live collision.

**F2 — proposes a placement that conflicts with a shipped rule.** `SubscribeToggle` exists and is already used on the Home inbox row, but its own docblock states it's *deliberately excluded from station surfaces (Unbox, Triage, Testing)* per `display/station.md` — station rows don't carry a bell. F2's "triage tracking rows" placement, if that means Station Triage, directly conflicts with this; "Incoming tracking detail" and "order shipped tracking row" are fine (Workbench surfaces). Resolve which one before F2 is scheduled — don't ship both as written. `home_inbox` flag spelling is confirmed exact as used in the doc.

**F3 — low structural risk; one real gap.** Support's `?mode=` dispatcher takes a new branch cheaply. `SupportCreateTicketModal` and the "claim clipboard" reply flow (AI drafts a seller message, copies to clipboard, no send-to-marketplace API exists) are both confirmed real — the plan's caution is well-grounded, not hypothetical. Gap: see Open Question #4 — Home's existing "inbox" mode overlap isn't named in the plan.

**F4/F5/F6 — confirmed accurately scoped.** `SettingPage` is a literal `'receiving'` type today (single registry entry, single render branch) and `docs/settings-registry.md` already anticipates widening it — real but mechanical work, matching the plan's framing. `WorkOrderAssignmentCard` (prev/next carousel, confirm→advance) and `ThreadNoteComposer` (tied to `entity_threads`) both exist and do exactly what F5 assumes. The QA-org E2E pattern in F6 matches `verify.md` exactly.

**Naming collision:** `MyDayRail` — zero hits anywhere in the codebase today, clear to use.

---

## Validation log

| Date | Who | Result |
|---|---|---|
| 2026-08-01 | Claude (chrome parity) | **F0 chrome parity — all four slices LANDED** (`daily-triage-today-chrome-parity-HANDOFF.md`). **(1) Saved views:** `/` now reserves a context column — `home` added to `SidebarContextPanel` + `CONTEXT_PANEL_ROUTE_KEYS`, new `HomeContextPanel` composing `SidebarShell`. The list UI was **generalized rather than forked**: `OutboundSavedViewsList`'s body moved to `@/components/saved-views/SavedViewsList` (storageKey + paramKeys) and Outbound became a thin mode→key resolver. New surface `home_today` added to `SAVED_VIEW_SURFACES` / `GENERIC_SAVED_VIEW_SURFACES` / `STORAGE_KEY_TO_SURFACE`; `paramKeys` = `scope · q · colsort · coldir` (**not** `task` — a selection is not a facet). **(2) Search:** `ToolbarSearchToggle` (DS primitive) in the chrome `search` slot, collapsed at rest, debounced into `?q=`; predicate `searchMyDayTasks` matches title/subtitle/queue/record and deliberately **excludes lane and status** so typing a lane name cannot shadow the tab strip. **(3) Trailing cluster:** `WorkbenchTrailingCluster` with Fields **fully wired** (TableId `my-day` + `TABLE_COLUMNS` entry + `hideKey`s + `fieldsMenu: true` + guard entry + `GridFieldsMenu`); grid now opens lean on `task · lane · record · due` with `queue` / `status` `optional`. Sort and Import/Add are **honest absence** — Today's ordering IS `?colsort=` (one sort param per surface) and nothing creates a Today row. **(4) KPI:** due-horizon band **Overdue · Due today · Upcoming** (the Zoho My Work / Asana shape), civil-day compared in the warehouse zone, filtering via `?filter=`; tile counts are computed post-lane/post-search so each tile promises exactly the rows it yields. Coverage: new `tests/e2e/my-day-today.spec.ts` (qa-desktop, 11 tests) + `my-day-tasks.test.ts` (9 unit tests, green under `TZ=UTC`). |
| 2026-08-01 | Claude (dogfood e2e) | **Bug found and fixed that ONLY reproduces on a real feed: `myDayTasksFromFeed` emitted the top work order twice.** `aggregateMyDayFeed` derives `doNext` (`topWorkOrderForStaff`) and `assigned` (`isMineRow`) from the **same** predicate — actionable ∧ mine — so `doNext` is a POINTER into `assigned`, never a disjoint bucket. The F0 concat therefore duplicated it on any day the operator has assigned work: a React duplicate-key error (`task:REPAIR:3` on the dogfood org), the same task rendered twice, and lane + due-horizon counts inflated by one. Every fixture feed happened to give `doNext` a unique id, which is exactly why nothing caught it — the QA-org run and the stubbed spec were both green through the bug. Fixed by deduping on id in `myDayTasksFromFeed` with `do_next` winning the lane (demoting it would empty the lane the surface is built around); pinned by two regressions in `my-day-tasks.test.ts`. **Verified live on the dogfood tenant** (real feed, real session): the rail, collapsed search + `?q=`, all three KPI tiles, the Fields add/remove of the Queue track, and a real saved-view save→apply→delete round-trip all work; `Everything`/`Do next` now read 1/1 where the duplicate would have made it 2. Also hardened the Fields e2e assertion to key on `[role="columnheader"][data-col=…]` rather than the accessible name — the Fields listbox stays open across toggles by design, and querying the header through the a11y tree with a popover open answered a different question (it returned nothing on dogfood). |
| 2026-08-01 | Claude (chrome parity — what stayed open) | **Blocked on the operator applying the migration:** `2026-08-01a_saved_views_home_today.sql` redefines `saved_views_surface_chk` with the full 11-value union (DROP + re-ADD, never an incremental edit — the `reason_codes_flow_context_chk` regression in `polymorphic-tables.md`). Until it is applied, `POST /api/saved-views` 500s on `home_today` and 1 of the 11 e2e tests (the save round-trip) fails **by design** — verified against the live DB, the error is the CHECK, not the wiring. `surfaces.test.ts` was rewritten to resolve the **effective** CHECK (last-sorting migration that defines it) instead of reading only the birth migration, plus a new never-drops-a-value assertion. **Deliberately NOT built:** `Unassigned` as a KPI tile (real and unshown, but a dispatch number about the team — Zoho puts it on a project dashboard, not My Work) and `Closed today` (no completion signal exists in `MyDayFeed`; waits for B0–B3). **Still open from the prior handoff:** inspector occlusion at 1440px (unchanged — Fields now gives staff a way to shed tracks, which is a partial mitigation, not the decision), OQ1 Dashboard/Unbox mounts, F1 categorized board. **E2E limit stated in the spec header:** the feed body is stubbed because the QA org provisions no `work_assignments`; seeding them into `scripts/provision-qa-org.ts` is the honest follow-up and was not done. |
| 2026-08-01 | Claude (schema-collision resolution) | **F1:** resolved the `aggregateMyDayFeed` collision with `home-ops-tv-collab-surfaces-plan.md` — renamed `TriageTask`→`TriageRow` (derived client-side from the widened `MyDayFeed`, not a new backend entity); the already-shipped `/api/inbox` stays the deep ledger, Today gets a curated `active`-filtered slice; `?assignee=` and "Mark done" scoped to apply only where meaningful (assignment- vs inbox-sourced rows). Full design in the backend doc's B3 section. |
| 2026-08-01 | Claude (repo audit) | **F0:** `useMyDayFeed`/`MyDayContextPane` already exist as separate files — nothing to extract there; real scope is only the left list. Unbox has zero free slots for a rail (both context-panel and right-edge regions are already fully occupied) — a hard placement constraint, not a UX call. `MyDayRail` should be a new named shell, not a `SidebarRailShell` fork (data shapes don't match that contract). |
| 2026-08-01 | Claude (F0 rebuild) | **F0 REBUILT on the house SoT** after the verbatim-lift version was rejected. Today now composes `SidebarShell` (picker) + `LedgerGridSurface`/`GridSurfaceDescriptor` (collection) + non-modal `RightRailHost` (record plane); `MyDayRail` / `MyDayTriagePane` / `MyDayContextPane` deleted. Added the feed→row read model (`my-day-tasks`, the F1 `TriageRow` flattening), the column SoT (`my-day-grid-layout`, frozen pane `select · task`), declared capabilities (all `false`) registered in both grid guards, and a `WorkStatus` label/tone SoT. View is URL-durable on params `/` already owned (`?scope=`, `?task=`) plus the carried `?colsort=`/`?coldir=`. Verified against the dev server at 1440×900: 4 rows + 6 headers, lane click → `?scope=attention` (1 row), row click → `?task=` + `role="region"` inspector (not `dialog`), header click → `?colsort=due`, and a pasted deep-link reproduces lane + selection + `aria-sort=ascending`; selected row carries `bg-blue-50` at the same 37px height as its siblings. `npm run verify` fully green. **Occlusion trade-off:** at 1440px the floating inspector covers the Due/Status tracks — same behavior as the dashboard order inspector, where push was already declined on the merits. |
| 2026-08-01 | Claude (F0 build) | **F0 v1 (superseded — see the rebuild row above).** `MyDayRail` + `MyDayTriagePane` extracted from `MyDayWorkspace` (232 → 58 lines, now a composition root); `useMyDayFeed` untouched; `MyDaySelectedItem` consolidated into `my-day-types.ts` (was declared twice, would have become three). Confirms the audit above: the rail column was the only unextracted piece, and it did **not** compose `SidebarRailShell` — heterogeneous shapes, no per-row patch. Verified on `/` at 1440×900 against the dev server: all four sections render, each row selects (one `bg-blue-50 ring-blue-400` row at a time) and drives the pane to the right detail + CTA (`Open in workspace` / `Investigate`); empty pane returns for no selection. Dashboard/Unbox got `TODO(daily-triage F0→F1)` markers and **zero** rendered change. `npm run verify`: lint / typecheck / unit+DS guards / route-perm / route-auth / schema-drift green; knip red on 4 findings in a concurrent session's files (`OrderRailActions`, `OrderRailShell`, `exception-codes`) — pre-existing, acknowledged in commit `ae9d2a9`, none in F0's files. |
| 2026-08-01 | Claude (repo audit) | **F1:** `MyDayContextPane`/`RightRailHost` reuse is sound but needs a stable occupant id (`detail:triage-task`, not per-record) to avoid exit/empty/enter flash on queue walk. `LinkageStrip` is real but anchor-type-coupled to receiving/tracking only. `?category=` collides with an existing `/dashboard` alias for `?mode=` — fine on bare `/`, a risk if composed onto Dashboard. |
| 2026-08-01 | Claude (repo audit) | **F2:** `SubscribeToggle`'s own docblock excludes it from station surfaces (Unbox/Triage/Testing) per `display/station.md` — the plan's "triage tracking rows" placement conflicts with this if it means Station Triage. Resolve before scheduling. |
| 2026-08-01 | Claude (repo audit) | **F3:** Home already ships an overlapping "inbox" mode on the same subscription machinery — name the relationship to the new Messaging surface before building. F4/F5/F6 confirmed accurately scoped as written; no changes needed. |
| 2026-08-01 | Claude (industry-pattern research) | **Category IA (F1, OQ1):** cap `TriageTask.category` at 5–7 buckets (Miller's Law precedent) and validate the set with a card-sort against real floor staff rather than assuming it. Linear's own Triage view only lets you reorder, not invent new groupings — resolution is a fixed small state set. |
| 2026-08-01 | Claude (industry-pattern research) | **Pin notification fatigue (F2, OQ3):** notification-UX consensus is default-to-silence — surface a task only if explicitly subscribed, time-sensitive, needs a decision only that user can make, or carries context unavailable elsewhere. Recommend pin subscriptions mint a Today row only on milestone events (delivered/exception/delayed), not every intermediate carrier scan; batch the rest into a digest (Notion's pattern) rather than a live ping. Should be encoded in B1/B3, not left to UI-side dedup. |
| 2026-08-01 | Claude (industry-pattern research) | **Settings shape (F4):** standard notification-preference centers split into category / channel / frequency axes — matches the planned auto-create toggle + threshold + default assignee shape already in the doc. No change needed. |
| 2026-08-01 | Claude (industry-pattern research) | **Desktop-only v1 (F1, OQ2):** generic warehouse-ops UI convention leans mobile/handheld-first, but that convention belongs to the Station contract (scan-driven, floor density), not this board. Daily triage is Workbench-shaped (durable URL selection, pick+edit, `ops` density) per `contextual-display.md`, and desktop-first is the existing precedent for Workbench surfaces (Products, FBA board, Outbound) — so desktop-only v1 is consistent with the chosen archetype, not a compromise. |
| 2026-08-01 | Claude (industry-pattern research) | **Row actions (F1):** planned set (Start · Mark done · Assign… · Pin/Unpin) mirrors Linear's accept/decline/duplicate/snooze but skews toward "do the work" over "route the work," which fits an ops-triage board. Flag: if F5 handoff volume is high, consider a Snooze-equivalent (defer without losing) — the one Linear affordance not currently planned. |

---

## Out of scope (frontend)

Webhook handlers · migrations · fan-out worker · general email client · Ops TV / Brief · second polymorphic link UI
