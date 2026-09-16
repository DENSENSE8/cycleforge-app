# PLAN — Mobile-first rebuild: increment program (big restructure, small changes)

**For:** Claude Code / coding agents (one increment per session/lane prompt — never batch)
**Date:** 2026-09-14 · **Supersedes:** the 7-phase version of this file (same day)
**Status:** executed ✅ N1–N3 + B1–B4 + U1–U3 + C1–C2 + H0 + H1a + **N4a** (§2) · H1/H2/H3 ⬤ in tree, unlanded (hook graduation, `/m/home` = Daily, `daily` leaf added — H3's `/m/checklist` deviation is a RULING, see Track H) · next: wire reset-all + retire CTAs into `MobileDailyChecklist` (`.tsx`, needs design-mcp stamp) · then H4 (operator-gated) · A1 next (owner) · C3 queued
**Operator directives (verbatim, binding):** "what's most important for mobile is miniature and small
detailed display logic but first keeping the unbox photo feed and focusing on the routing for the
sidebar navigation identification so first building a solid foundation for this order" ·
"this is a big plan a complete and utter rebuild and restructure treat it like one but small changes
at once." · "this plan is mainly focused on the UI and UX of the mobile app" — Track B is the center
of gravity; D/E are enablers, sequenced behind B-facing value.

**Binding rules:** [`AGENTS.md`](../../AGENTS.md) · [`docs/mobile-first/SURFACE_LAW.md`](../mobile-first/SURFACE_LAW.md) ·
[`ARCHITECTURE.md`](../../ARCHITECTURE.md) · design-mcp before/after UI writes.
**Siblings (do not merge):** [`unbox-capture-stack-PLAN.md`](./unbox-capture-stack-PLAN.md) ·
[`nav-lanes-reports-IA-PLAN.md`](./nav-lanes-reports-IA-PLAN.md) — adds Track **N4+** (lane IA:
Workspaces above Scan Stations, Inbound/Outbound lanes), Track **R** (Reports desk + `/m/reports`
staff day), Track **X** (PO-Mailbox admin deletion). Its N9 and this file's H1 both edit
`MOBILE_NAV_DESTINATIONS` — whichever lands second owns the merge.
**Superseded sibling:** [`station-nav-floor-desk-PLAN.md`](./station-nav-floor-desk-PLAN.md) —
describes a `Main · Stations · More` spine that no longer exists. Do not execute.
**Done (per increment) =** acceptance + `pnpm verify:fast` green, fixing only this-lane regressions.

---

## 0. Locked verdicts (do not re-litigate)

| Decision | Verdict |
|---|---|
| `/m` web app is the mobile SoT | **YES** (SURFACE_LAW §1, binding) |
| Expo may lead the IA | **NO** — native consumes; module map derives from `MOBILE_NAV_DESTINATIONS` |
| Component split | **3 layers**: primitives shared · surface components never cross · logic shared |
| "Complete split" forbids DS/ui kit on `/m` | **NO** — DS pins are sanctioned |
| Shared data layer | **Drizzle-backed HTTP API client** — Supabase is fiction to delete (zero hits in `src/`) |
| Bottom nav | **dormant by fact**; revival reads `useAuth().mobileDisplayConfig` + `MOBILE_NAV_TAB_DESTINATIONS` |

**Mission.** A complete restructure — one routing SoT, an enforced component split, a real shared
layer, one token source, and a native app that consumes all of it — executed as ~25 increments that
each land green, alone, and revert alone. The unbox photo feed is inviolate throughout.

---

## 1. Increment rules (the "small changes at once" contract)

- **R1 — Size ceiling.** One increment = one concern, ≤6 files touched (generated/test files
  exempt). If it needs more, split it.
- **R2 — Strangler, never big-bang.** The old path stays live until the last consumer migrates;
  removal is its own delete-increment (D4, E3). No parallel old+new *writes* — parallel *reads*
  during migration are fine.
- **R3 — Ratchets only shrink.** Boundary exemptions, hand-hex list, Supabase files: each list is
  frozen at baseline; increments remove entries; adding one requires an explicit operator ruling.
- **R4 — Invariants, every increment:** `pnpm verify:fast` green · 56-test unbox feed suite green ·
  after C2: no new boundary crossing · after E1: token-export drift check passes.
- **R5 — One lane per increment.** Commit (or leave dirty in one lane) per increment; never stack
  two subsystems in one increment.
- **R6 — Reversibility.** Any increment reverts to green by reverting itself; no increment is a
  prerequisite for the *correctness* of another, only for its * usefulness*.

---

## 2. Executed foundation (2026-09-14, green — do not redo)

| # | Increment | Result |
|---|---|---|
| N1 | `src/lib/mobile/nav-registry.ts` — destinations + identification predicates + bottom-nav tab SoT | 16 contract tests |
| N2 | Drawer wired to registry (behavior-preserving; icons keyed by id) | render body untouched |
| N3 | Unbox feed regression proof | 56/56 tests |
| B1 | `docs/mobile-first/MINIATURE-CATALOG.md` — atoms/molecules inventory, laws, ranked worklist | catalog committed 2026-09-14 |
| B2 | `station-chrome.test.ts` — tone-vocabulary contracts (9 tests) | 17/17 with model suite · verify:fast green |
| B3 | badge + dots contracts — 17 tests (6 render-markup badge · 11 rail/a11y) | lint clean · verify:fast at close |
| U1 | *(operator-directed, rev 3)* nav bottom bar: hairline → `shadow-elev-soft`, bubble + name with content inset, edge-to-edge shadCN ghost row → `/m/settings` | 6 render contracts · critique clean · verify:fast green (via B4's close) |
| B4 | ProgressDots token fix: `bg-emerald-500`/`bg-blue-500` → `bg-fill-success`/`bg-fill-info` + token-law contract | 12/12 tests · verify:fast GREEN (sibling settled — lifts U1's block too) |
| C1 | boundary gate: `.dependency-cruiser.cjs` + `boundary-guard.ts` ratchet + frozen 100-entry baseline (report-only) | ratchet clean · verify:fast green |
| C2 | Boundary gate wired into verify (`--enforce`, profiles: always) + `ds_boundary` in design-mcp + CLI | ratchet acceptance proven · verify:fast PASSED (3 gates) |
| U2 | *(operator-directed deletion pass 1)* /m/pack + /m/search + /m/home routes + dead components; Menu text gone; nav registry rewired | boundary 100→95 · verify:fast PASSED (3 gates) · unbox 56/56 |
| U3 | *(recovery)* /m/home redirect stub revived auth landing; proxy pack rewrites dropped; exits → /m/work; `/m/scan` prefix restored; landing defaults repointed | verify:fast PASSED (3 gates) · boundary 95/95 · unbox 56/56 |
| H0 | Daily-page **audit executed**: the 3 task systems named, API surface mapped, handoff rewritten fact-grounded (`docs/handoff/daily-tasks-page-HANDOFF.md`) | no code · findings verified against migrations/API/features |
| H1a | Daily **reset-all** across all three layers: `clearDailyCheckMarks` (session-scoped, day-keyed, `withTenantTransaction`), `DELETE /api/daily-checks/mark?date=` (staff from session, day from query, `getCurrentPSTDateKey()` default), `useResetDay` (optimistic) + pure `clearMineFromReport` | 7 new contracts (16/16 with report suite) · `ds boundary` pass ×4 touched files · unbox 56/56 · nav+title+daily-row 22/22 · verify:fast PASSED (3 gates) |
| H1/H2/H3 | **Already in the working tree when this lane opened, uncommitted — do not re-derive:** hook graduation (`features/home/useDailyChecks.ts` → `lib/daily-checks/use-daily-checks.ts`), `/m/home` renders `MobileDailyChecklist`, nav leaf `daily → /m/home` + title `'Daily'`. `/m/checklist` deliberately KEPT (SKU-kit/QC editor, different job). Remaining: no reset-all / retire CTA in the mobile UI | verify:fast PASSED over the whole tree · nav-registry + mobile-context-navigation + mobile-daily-row 22/22 · unbox 56/56 · `ds boundary` pass on `MobileDailyChecklist.tsx` |
| N4a | *(operator-directed IA)* **every spine lane is a parent that expands.** `SidebarNavList.renderLane`: a single-page lane now paints the lane label + that page's `SIDEBAR_PAGE_NAV` children (Sales → Counter · Sales Board · Local Pickup · Repair Service; Inventory 9 · Products 7 · Support 5 · Operations 13) instead of one flat row. Collapse survives only for a childless lone page + `spineFlat`. Supersedes `nav-lanes-reports-IA-PLAN.md` §1.2 collapse rule. **FILE CLAIM: `src/components/sidebar/master-nav/SidebarNavList.tsx` — this edit was overwritten once mid-lane by the concurrent shadcn-`Sidebar*` migration and re-applied in that idiom; re-apply the `lanePages.length === 1` branch if it disappears again.** | 4 new registry contracts (38/38 sidebar, 70/70 with spine+⌘K) incl. **child permission gate** (`walk_in.view` absent → no Counter row) and fail-closed `filterPageChildren(page, undefined)`; children are filtered at `MasterNav.tsx:57` before they reach the spine · `ds_critique` clean (0 arbitrary literals) · **browser-verified** full lane tree + screenshot · Lint ✓ Boundary 95/95 ✓ · Typecheck red is OWNED BY the concurrent daily-checks lane (`features/daily-checks/DailyCheckItemInspector.tsx`, 3 errors) — none in these files |
| DC1 | Daily checklist **cadence · owner · glyph · links · mobile rewrite** (`docs/handoff/daily-checklist-kinds-and-mobile-HANDOFF.md` executed): migration `2026-09-14a` (`kind` recurring/once + one-day window in one statement, nullable `assigned_staff_id`, `glyph` ≤8 chars, TRACKING link shape — string in `label`, null `entity_id`, partial unique index); per-staff report denominators (owned one-off counts only for its owner; non-responsible marks dropped like out-of-effect ones; `totalPossible` = Σ per-staff totals); `daily.kind` (tag, unbound) + `daily.owner` (person, product-bound → avatar on desk) catalog fields; note line composes `Today only · N/M done` (never the state pill); authored order recurring-before-`once`; ONE composer vocabulary `lib/daily-checks/composer.ts` (title · glyph grid+recents · TabSwitch Every day/Just today · owner via StageStaffAssignPopover desk / AssigneeComboboxPanel phone step · collapsed ticket/WO/tracking links with TrackingChip last-8) mounted as desk `DailyComposerRow` + phone `MobileDailyComposerSheet`(+`MobileDailyComposerFields`); mobile sections (recurring, then "Today only" band), once caption + owner avatar on rows, detail sheet Kind/Owner/Links; links hooks moved `features/daily-checks` → `lib/daily-checks/use-daily-check-links` (mobile-legal, desk inspector rewired, old file deleted) | 53/53 daily-family tests (incl. 4 new denominator + 3 row/view/sort contracts) · cohort slot-table GREEN (owner track gained `owner` sort fact — header-sort law) · verify:fast PASSED (3 gates) · unbox 56/56 · nav-registry 15 + mobile-context-navigation 3 · tenancy:audit green · migration applied (13 pending incl. 12 other lanes — operator approved full run) · `ds_critique` clean on all new/edited mobile files |
| DC2 | *(operator 2026-09-15: "just type it in … keep track of zendesk tickets … from one room to another")* **ticket fast path — one field, Enter, done.** A title that is NOTHING BUT a ticket reference (`12345` · `#12345` · `zd 12345` · `ticket #12345` · a Zendesk agent URL; 2-digit floor so "5" stays literal) becomes `Ticket #N` + a real `ZENDESK_TICKET` link + glyph `📋`, **cadence forced to `once`** (a recurring ticket would reappear forever and miss on every future report). Normalized INSIDE `dailyComposerCreateBody` / `dailyComposerError` / `dailyComposerLinkInputs`, so the phone sheet and the desk `DailyComposerRow` inherit it with **zero UI fork**; only the placeholder copy changed on each mount ("Task, or just a ticket number…"). Explicit `ticketId` always wins; idempotent; non-mutating | 10 new contracts (30/30 daily suites) · **browser-verified BOTH surfaces**: phone 390×844 `/m/home` typed `41957` → row `📋 Ticket #41957` under *Today only* → ticked `2 of 7 → 3 of 8` → **survived reload** → `GET /items/17/links` returns `ZENDESK_TICKET:41957`; desk `/` same one-field flow → `Ticket #58884` appeared · `ds boundary` pass ×3 · `ds critique` clean (0 arbitrary literals) · **verify:fast PASSED (5 gates: Lint · Typecheck · Boundary · Nav names · Mobile-first)** |
| DC3 | *(operator 2026-09-15, v1)* **Task \| Ticket switcher + de-iconed phone face + mobile radii + ticket chip slider.** (a) `DAILY_COMPOSER_SUBJECT` + `setComposerSubject` in the shared vocabulary → a `TabSwitch` on BOTH mounts; the Task face keeps typed words verbatim (`recurring`), the Ticket face derives `Ticket #N` + a `ZENDESK_TICKET` link (`once`) so every tick on one ticket joins ONE report row. **The explicit switch REPLACED the DC2 auto-detect** — it could not tell the task "5150" from ticket 5150, and the operator asked for reliability over cleverness; the 2-digit floor is gone with it (the slider offers `#4`, so `4` must commit). Errors speak per face ("Enter or pick a ticket number" / "That is not a ticket number"). (b) NO ICONS: glyph picker removed from the phone mount, rows paint plain titles, fast path sets no glyph (a deliberately picked glyph still survives). (c) New radius family `MOBILE_CARD_CORNER`/`MOBILE_ROW_CORNER`/`MOBILE_CONTROL_CORNER` (rounded-2xl/xl/lg) — `cornerClass()` stays square for desk chrome, `MOBILE_SCAN_*` now alias the family; no raw `rounded-*` written. (d) Plus FAB bottom-right (`IconButton size="touch" radius="pill"`, `aria-label="Add task"`) replacing the centered wide CTA. (e) `MobileDailyTicketSlider` ABOVE the entry field with the house `Ticket` icon per chip and an active-filter readout ("Recent tickets" / "N matching tickets"), fed by the new anchor-free `GET /api/daily-checks/ticket-candidates` (reuses `resolveTicketLinkQueryKind`; the support link route needs an entity anchor a checklist item has none of) | 39/39 daily-lib (14 switcher/parse contracts) + 6/6 row · `ds critique` 0 arbitrary literals on both mobile files · `ds boundary` pass · **browser-verified 390×844**: faces `["Task","Ticket"]`; Task row verbatim + `kind=recurring glyph=null links=[]`; Ticket row `kind=once glyph=null links=[ZENDESK_TICKET:66084]`; `sliderAboveField:true`, 20 chips / 20 icons, typing `4` → "1 matching ticket" · **verify:fast PASSED (5 gates)** |
| DC4 | **Per-task check times exposed — the manager-report prerequisite** (operator 2026-09-15: *"the staff member checked off this checklist at this time, completed this task at this time"*). `DailyCheckStaffRow.markedAtByItemId` (itemId → ISO instant) is now populated by `buildDailyCheckReport`; `daily_check_marks.marked_at` always had it and the builder was **discarding it** — only `lastMarkedAt` (newest) survived, so a per-task timeline was unbuildable without a second query. Earliest wins on duplicates (the first attestation is the one that happened; an optimistic re-render must not move a time the operator already saw). **Bug this exposed and fixed:** `clearMineFromReport` (reset-all) cleared ticks but LEFT the instants, which would have told a manager a task completed at 09:14 that now shows unchecked | 24/24 report+reset (4 new: per-staff instants · earliest-wins duplicate · absent-never-placeholder · reset clears instants while a peer's survive) · verify:fast PASSED (5 gates) |
| FIX | **App-wide 500 unblocked** (not this lane's code): `src/components/ui/input-group.tsx` escaped quotes inside single-quoted Tailwind arbitrary variants (`[&>svg:not([class*=\'size-\'])]`), emitting `\\'size-\\'` and failing CSS parse at compiled `globals.css:14698` → **every route 500'd**. Switched the 3 occurrences to double-quoted strings, matching `command.tsx`. Also recorded: a dev server started without aligned DSNs trips the new `db-single-branch` guard (`.env` `TENANT_APP_DATABASE_URL`/`POSTGRES_URL` name a different Neon branch than `.env.local` `DATABASE_URL`) — start the lane dev server with both exported from `DATABASE_URL` | page renders (`5 of 12 checked`), 0 CSS parse errors · verify:fast PASSED (5 gates) |
| DC5 | *(operator 2026-09-15: "I can open the ticket and reply to the ticket within the mobile app")* **the phone can now answer a ticket.** New `/m/t/[ticketId]` — `MobileTicketThread` (stream of `ConversationMessageCard`, markdown via `renderBlockMarkdown`, authors via `resolveAuthor` on the identity the comments route already enriches server-side) + `MobileTicketReplyDock`, which is CHROME ONLY over `useTicketComposer` (`lib/composer`), so a phone reply and a `/support` console reply assemble the same `SupportReplyVars` through `buildComposerReplyVars`. A PAGE, not a sheet: a focused textarea in a sheet leaves ~40% of the screen for the thread you are answering. The stream is `mt-auto` so a short thread hugs the composer instead of floating under the top bar. The checklist row's ticket glyph became the DOOR to it — but only for `integrations.zendesk`; without the permission it stays a bare MARK, because a door that 403s is worse than an absent one. `/m/t/` added to `OWN_TOP_BAR_PREFIXES`. Desk `TicketComposer` is NOT imported (`src/components/composer` is off-limits to `/m`) and not re-created — the waist is shared, the chrome is not | probe at 390×844: `/m/t/9960` paints subject + `NEW` + author + body + clock; reply intercepted at `/api/zendesk/photo-ticket` carries `{mode:'update',ticketId:9960,isPublic:false}` + the signed body, optimistic echo lands (1→2 cards), draft clears |
| DC6 | *(operator 2026-09-15: "display a pencil icon on the most right of the to-do list row … removing the ID from the mobile display and within the edit it can display the ID top right")* **the row lost its id and gained a pencil.** The bare `#id` handle — the row's only door to detail — is replaced by a 44px `IconButton` pencil hard right; the ticket glyph sits one notch inside it. The id moved into the sheet's own header (title left, id right), which the sheet paints itself because `BottomSheet`'s `title` prop is centred | `mobile-daily-row.test.tsx` 9/9: no `>7<`, `aria-label="Edit …"`, mark-vs-door registers both covered |
| DC7 | **Full item EDIT + REMOVE on the phone** (`docs/handoff/daily-item-edit-delete-HANDOFF.md` executed). `updateDailyCheckItem` + `PATCH /api/daily-checks/items?id=` (`admin.manage_staff`, `AUDIT_ACTION.DAILY_CHECK_ITEM_UPDATE` with before/after — the previous title comes out of the SAME statement via `UPDATE … FROM daily_check_items prev`, so a race cannot report a stale `before`), `useItemActions.updateItem`, and an in-place edit step + two-tap "Remove from the list" confirm inside `MobileDailyDetailSheet` (never a sheet in a sheet). TITLE ONLY: `kind`/`assignedStaffId` feed the per-staff denominator, so editing them re-does the arithmetic of every past report. **Bug the operator caught and this fixed:** the handoff's prescribed `WHERE retired_at IS NULL` guard refuses every `once` item — they are BORN with `retired_at = effective_from + 1` — so rename 404'd and remove silently answered `changed:false` on every one-off, which is every row the Ticket face writes. Both queries now guard on the item's WINDOW on the civil day (`effective_from <= D AND (retired_at IS NULL OR retired_at > D)`), the same window `ITEMS_ON_DAY_SQL` reads; retire stays idempotent because a closed window is not `> D` | probe: once + recurring rename both 200, retired 404, blank 400, row repaints, remove drops it from today and the second remove answers `{ok:true,changed:false}` |
| DC8 | *(operator 2026-09-15, after using DC6/DC7: "I want to implement an easier way to interact with this")* **the sheet lost its modes — the pencil lands IN edit.** Weighed hold-to-edit and rejected it: the row's title is the tick target (`label htmlFor`), so a long-press still fires `click` on release and every aborted edit would write a mark — an attestation with a name and a timestamp on it — plus a hidden gesture teaches nobody and fights scroll. Kept the visible 44px pencil and killed the real friction instead, the TAP COUNT: the sheet now opens with the title field focused and the keyboard up (was: open on facts → press `Edit` → type), facts ride BELOW the field instead of being swapped out by a mode, and the footer is `Remove from the list` + `Save` (no Cancel — dismissing the sheet already is cancel and nothing is written). `scrollBody` + `max-h-[70svh]` is load-bearing: field + 7 facts + footer is taller than 844px minus the keyboard, and this sheet is bottom-anchored, so without the cap it grows off the TOP and Save is unreachable. Facts extracted to `MobileDailyFacts.tsx` (the sheet is the shell, these are its leaves — same split as `MobileDailyComposerFields`). **`TITLE ONLY` is a deliberate narrowing of the handoff's §5.1 `assignedStaffId` and §10 acceptance** — owner-edit deferred, not forgotten: it needs §4's `effective_from = today` guard, and the operator has not asked for it | `ds critique` clean on both files (239 + 120 lines, 0 arbitrary literals) · `ds boundary` pass · PATCH 200 observed at 390×844, sheet closes, row repaints, server persists · verify:fast PASSED (5 gates). **Harness note for the next agent:** the Next dev overlay portal swallows coordinate clicks on this sheet's footer — `click({force:true})` silently no-ops, `dispatchEvent('click')` lands. Not app behaviour |

---

## 3. Increment ledger

### Track H — Daily (operator-directed: `/m/home` becomes the daily checklist)
- **H0** ✅ *(executed 2026-09-14)*: audit. **The three systems:** (1) **Daily** —
  `daily_check_items` + `daily_check_marks`, marks keyed `(org,item,staff,day)`, API
  `/api/daily-checks` + `/mark` + `/items` (+`/links`), desk surface `features/home/HomeDailyMode`
  (rewritten to "Scope 1" the same day by a sibling lane, which already cites this handoff);
  (2) **Tasks** — `staff_todos` + `features/tasks`; (3) **My Day** — `/api/my-day` +
  `features/my-day`. Legacy `task_templates`/`daily_task_instances` in `schema.sql` already dead.
  **Key finding: build NO new schema** — the existing API covers check/add/retire, and per-day
  reset is free (marks are day-keyed); only a `reset-all` endpoint is missing. **Blocking
  constraint:** desk hooks live in `features/home/` — a `/m` import would fail the Boundary gate,
  so `useDailyChecks`/`useToggleCheck` graduate to `src/lib/daily-checks/` first.
- **H1** ⬤ *in tree, unlanded (working tree, uncommitted)*: hook graduation DONE —
  `features/home/useDailyChecks.ts` → `src/lib/daily-checks/use-daily-checks.ts` (git records the
  rename; no shim left behind). **H1a** ✅ *(executed 2026-09-14, this lane)*: the missing
  `reset-all`, all three layers — see §2.
- **H2** ⬤ *in tree, unlanded*: `/m/home` renders `MobileDailyChecklist` (+ `MobileDailyRow`,
  `MobileDailySheets`, `mobile-daily-row.test.tsx`) instead of redirecting to `/m/work`; the stub
  body is gone and the route still resolves, so the auth-landing contract holds.
- **H3** ⬤ *in tree, unlanded*: `daily` is a NEW leading leaf —
  `{ kind: 'leaf', id: 'daily', label: 'Daily', href: '/m/home' }`
  (`src/lib/mobile/nav-registry.ts:57`) — and `getMobileAppTitle('/m/home') → 'Daily'`
  (`src/lib/mobile-context-navigation.ts:40`).
- **H3 DEVIATION FROM THE HANDOFF — deliberate ruling, do NOT "finish" it.** The handoff (§6 H3)
  says *"rename nav Checklists → Daily, `/m/checklist` → redirect stub"*. The landed tree instead
  **KEEPS** the `checklist` leaf → `/m/checklist` (`nav-registry.ts:74`, title map
  `mobile-context-navigation.ts:48`) because that route is the **SKU kit-parts / QC-template
  editor** — a different job that merely shares the word. Daily was ADDED as a new row rather than
  renaming that one. Reasoning is inline at `nav-registry.ts:49-51` (*"Two rows, two verbs; do not
  fold one into the other silently"*) and `mobile-context-navigation.ts:37-39`.
  ~~**A future agent reading H3 as incomplete must not delete the Checklists row**~~ —
  **GATE OPENED, ruling RETIRED 2026-09-15.** The operator gated it directly:
  *"remove the checklist from the mobile display and the checklist components,
  they are old components from the mobile app itself. I'm removing and simplifying the
  display in general so I can build upon a simplified display language."* The row, the
  route (`src/app/m/(shell)/checklist`), `src/components/mobile/checklist/**` (5 files)
  and the now-dead `useResolveCatalogByItemNumber` hook are **DELETED**; the title entry
  and the `/m/checklist` mobile-first prefix are gone, and `MobilePackingSheet`'s
  *Edit kit / QC checklist* CTA went with them. This is **not** H3 as written — H3 wanted
  a redirect stub and a rename; there is no stub, and `Daily` keeps its own row. Kit-parts
  / QC authoring is a desk verb now. Restore recipe + what was kept:
  [`DELETED-MANIFEST.md`](../warehouse-os/DELETED-MANIFEST.md) § *2026-09-15*.
- **H2/H3 remaining delta (next increment):** `MobileDailyChecklist` consumes `useDailyChecks`,
  `useToggleCheck`, and `addItem` only — it wires **neither `useResetDay` nor `retireItem`**, so the
  operator's "reset all" and "delete this" verbs have no CTA yet. That is a `.tsx` write: needs
  `ds_contract` + `ds_critique` and a fresh design-mcp stamp.
- **H4**: consolidate `staff_todos` / `my-day` into Daily — operator-gated, one pass each.

### Track A — adopt the scaffold
- **A1** *(owner-assisted, no code)*: commit `ARCHITECTURE.md` + `apps/` + `packages/` +
  `pnpm-workspace.yaml` as tracked draft; Supabase files get a `FICTION — dies in D4` header.
  **Accept:** authoring commit exists.

### Track B — miniature / small-detail display logic (operator priority)
- **B1** ✅ *(executed 2026-09-14)*: `docs/mobile-first/MINIATURE-CATALOG.md` — inventory with
  laws + test status + ranked worklist (§4 there). Findings already logged: ProgressDots raw
 `bg-emerald-500`/`bg-blue-500` token violation; photo-badge comment drift ("blue" state doesn't
  exist); UnitRow `HoverTooltip` hover-only-on-touch UX flag.
- **B2** ✅ *(executed 2026-09-14)*: `station-chrome.test.ts` — tone maps total over
  `ok/warn/bad`; ground/edge/ring/ink confined to semantic token families; ok untinted;
  one hue family per tone across all maps; eyebrow carries no size/weight/tracking.
  Every documented regression in `station-chrome.ts` is now a failing test, not a story.
- **B3** ✅ *(executed 2026-09-14)*: `MobilePhotoCountBadge.test.tsx` (house `renderToStaticMarkup`
  pattern; **x0 is never a door**, negative clamp, tabular figures, sm/md rungs) +
  `ProgressDots.test.tsx` (`buildDotRail` exported as seam; clamp, compress window, current-
  visibility trade, progressbar a11y face). Badge comment drift fixed. Catalog error corrected:
  the badge has no in-flight state.
- **U1** ✅ *(executed 2026-09-14, operator directive, rev 3)*: `MobileAccountFooter` — no
  `border-t`, `elevationClass('raised','soft')` drop shadow, staff colour+initials bubble
  (`StaffAvatar avatarPhotoId={null}`) + name held by a **content inset** (`px-3` inner wrapper)
  while the shadCN ghost `asChild` row stays edge-to-edge (`px-0`), → `/m/settings`,
  `min-h-11` touch floor. **Gates:** 6/6 render contracts, scoped lint, `ds_critique` clean,
  unbox 56/56 — and `verify:fast` **GREEN** at B4's close once the sibling's receiving/incoming
  grid lane settled (their parse + `historySort` errors gone; U1 files were always clean).
  **Visual debt:** markup-verified, not eyeballed — batch with B4's screenshot pass.
- **B4** ✅ *(executed 2026-09-14)*: `ProgressDots` — done dot `bg-fill-success`, current dot
  `bg-fill-info` (config's solid-fill family: "progress bars, saturated indicators"; the
  status-pill `surface-*` washes vanish at 8px), pending stays `bg-surface-strong`. New token-law
  contract: no raw palette class anywhere in the markup. 12/12 tests, critique clean,
  `verify:fast` GREEN. **Visual debt:** the hue shift (raw palette → themed fills) is
  contract-verified, not eyeballed — dev server down, attach-only rule; batch one screenshot
  pass over the drawer foot (U1) and any dotted flow (B4) when `:3050` returns.

### Track C — boundary gate (protects everything else)
- **C1** ✅ *(executed 2026-09-14)*: `.dependency-cruiser.cjs` (two forbidden rules; type-only
  crossings counted via `tsPreCompilationDeps`) + `scripts/boundary-guard.ts` (report / `--enforce`
  / `--write-baseline`) + `scripts/boundary-exemptions.ts` — **frozen at 100 crossings**. The tool
  beat the manual audit: found 5+ additional reverse crossings (PackerPageContent, PhotoPeekFan,
  BinStockNumpadSheet, useCaptureUploadStatus ×3) and type-only crossings (work-orders/types).
  Ruling recorded: `components/identity` joined the platform layer (ARCHITECTURE.md amended).
  Report-only — C2 wires `--enforce` into verify.
- **C2** ✅ *(executed 2026-09-14, + operator-added DS MCP scope)*: `Boundary` gate in
  `verify-profile.mjs` (`boundary-guard.ts --enforce`, `profiles: 'always'` — the 2026-08-20
  drift-gate deletion is honoured for every OTHER gate; this one law is binding again, ~15s).
  **Acceptance proven live:** removing one exemption → enforce exit 1 naming the NEW crossing;
  restored → exit 0, ratchet clean. **DS MCP:** `ds_boundary` tool + `boundary` CLI subcommand —
  scoped single-file adjudication (`--file … --json`, traversal-stopped cruise, ~3s), baseline vs
  NEW status per crossing; the server header's "shared adjudicator" condition is now met and
  documented. Guard gained `--file`/`--json` modes as the shared rule module. One self-inflicted
  bug fixed en route (absent `--file` fell back to `argv[0]` — the node binary — silently turning
  full-tree runs into scoped cruises of node itself). `verify:fast` PASSED with 3 gates ✓.
- **U2** ✅ *(executed 2026-09-14, operator directive)*: **operator ruling recorded — the mobile
  surface is the unbox photo feed, picks, location scanning, and the identification kernel;
  everything else deletes, one batch at a time, operator-gated.** Pass 1: deleted `/m/pack`,
  `/m/search`, `/m/home` routes + `redesign/Pack.tsx` + Dashboard/MobileAssignedOrdersGroup/
  useAssignedWorkOrders (consumer-closed trio). **Kept on ruling:** checklist (operator will
  repurpose), `packer/` list/row/sheet (desktop `PackerPageContent` imports them), shared photo
  queues/cameras. Rewired: print back-fallback + ScanAgainBar exit → `/m/pick`; dormant tab map
  home/packing → `/m/pick`; nav registry −3 destinations, `/m/home` special-case removed;
  `MOBILE_FIRST_ROUTE_PREFIXES` pruned. Drawer: "Menu" eyebrow gone (rail header strip removed,
  overlay keeps close-X). Boundary baseline **100→95** (5 stales shrunk). Nav tests 15/15, unbox
  56/56, `verify:fast` PASSED (3 gates ✓).
- **U3** ✅ *(executed 2026-09-14, advisory-caught)*: U2's route deletion broke load-bearing
  `/m/home` dependents my `href=`-shaped sweep missed (plain strings, tsc-invisible): QR handoff
  claim, claim fallback, signin role-home/fallback, DesktopRouteShell phone bounce,
  LandingPageCard defaults, OnHoldList backHref, proxy `/pack`→`/m/pack` rewrites, packer photo
  studio returnHref. Fixes: `/m/home` = server `redirect('/m/work')` stub (dependents keep
  working); near-nav exits (ScanAgainBar, print back, OnHold) → `/m/work`; proxy pack/packer
  phone rewrites DROPPED (packing desktop-only); studio returnHref → `/m/work`; LandingPageCard
  option + defaults → `/m/work`; **`/m/scan` prefix restored to MOBILE_FIRST_ROUTE_PREFIXES**
  (lost in the U2 prune — identification kernel). `MOBILE_SEARCH_ROUTE_PARAMS` + its registry
  entry pruned ✅ (routing suites 44/44, unbox 56/56, verify:fast green) — `/m/search` is now
  fully dead: no route, no prefix, no param contract. **H1 handoff written:** `docs/handoff/daily-tasks-page-HANDOFF.md` —
  Daily task page (check/add/delete/reset-all), three-task-system consolidation, `/m/home`
  rewrite, checklist→Daily rename, mobile-first fixed width.
- **C3**: promote `ScanAgainBar` → `components/ui/` (fixes 2 reverse crossings; update 2 importers).
- **C4**: promote `NetworkChip` (2 importers). **C5**: promote `ScanSurface` (1 importer).
- **C6**: move `components/repair/mobile/` (2 files) into the mobile kit.
- **C7**: move `components/layout/MobileRouteShell.tsx` into the mobile kit.
- **C8**: move receiving vocab/types (`station/receiving-constants`, `receiving-line-row` type,
  `label-identify/use*` hooks) into `src/lib/receiving/` (type-only crossings close with them).
- **C9…**: one forward-share split per increment (PhotoGallery, OrderPackChecklist, IntakeCombobox,
  ReasonCodePicker, printer stack, …). **C-last**: the two ratify-or-split rulings (kiosk runtime,
  IdentificationJobFace) — operator decision, then either fork or a ratified exemption entry.

### Track D — shared layer on the real stack
- **D1**: move `apps/mobile/src/scanner/scanner-payload.ts` (+ its test) into `packages/shared`;
  Expo imports `@cycleforge/shared` — first real consumption. **Accept:** `test:scanner` green via
  the package.
- **D2**: typed client for ONE endpoint (`/api/auth/session`) — zod schema + fetch + TanStack hook
  in `packages/shared`, consumed by a Expo settings screen stub. **Accept:** schema test green.
- **D3**: second domain — receiving-lines feed (`/api/receiving-lines`) schema + hook (unbox slice
  depends on this). **Accept:** hook test green.
- **D4**: delete `packages/shared/src/supabase/` + `@supabase/supabase-js` dep + `useTenants`;
  replace with session-backed tenant list hook if still needed. **Accept:** zero supabase strings
  in the workspace; `typecheck` green everywhere.

### Track E — token pipeline
- **E1**: `scripts/export-ds-tokens.mjs` → `packages/shared/src/design/design-tokens.generated.json`
  (+ regen-drift check, report-only). **Accept:** regenerating produces a zero diff.
- **E2**: `apps/mobile/src/theme/tokens.ts` consumes the generated JSON; per-staff accent modeled
  as a resolver, not a constant. **Accept:** `#0b6e4f` and friends gone; typecheck green.
- **E3**: delete any remaining hand-hex constants in `apps/mobile`.

### Track F — Expo vertical slice: unbox photo feed (needs D1+D3, E2)
- **F1**: L2 session/recents screen consuming the D3 receiving hook. **Accept:** renders real feed
  data via shared client.
- **F2**: L3 scan loop on `useHardwareScanner` + shared payload parsing. **Accept:** mock-emitter
  flow walks end-to-end.
- **F3**: L4 carton/context sheet. **F4**: module registration derived from the
  `MOBILE_NAV_DESTINATIONS` shape (Expo `MOBILE_MODULES` rewritten to consume it).

### Track G — `/m` verb gaps (independent; start any time after C2)
- **G1**: add FieldAcquisitions, BinTransfers, ScanHistory-L2 to `MOBILE_FIRST_VERB_GAPS`.
- **G2…**: one verb per increment, `/m` SoT first (ScanHistory-L2 generalizes the
  `/m/receiving/history` pattern); only then extend `MOBILE_NAV_DESTINATIONS` + Expo.

---

## 4. Sequencing

A1 first (nothing settles untracked). Then B and C interleave (B is content, C is protection —
C2 should land before large B/C9+ movement). D1–D3 can run parallel to B/C; E any time after A1;
F strictly after its D/E deps; G independent. When in doubt: the smallest increment that unblocks
the most tracks.

## 5. Standing obligations (every increment)

design-mcp `ds_contract` before / `ds_critique` after any `src/**/*.{tsx,jsx,css}` write ·
`pnpm verify:fast` green · unbox 56-test suite green · cohort evals only if a phase touches the
slot-table / station / shortcut engines · increment note appended to this file's ledger (status
line + date) so the plan is the tracker.
