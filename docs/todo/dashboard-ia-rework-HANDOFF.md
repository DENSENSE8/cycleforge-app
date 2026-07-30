# `/dashboard` IA rework — handoff: what is left

**Self-contained.** A new session needs only this file. Paste:

> Read `docs/todo/dashboard-ia-rework-HANDOFF.md` and start at §3.

**Row L's as-built carries one unratified deviation, and the URL-isolation work that closed it is
uncommitted** — see [`url-isolation-session-HANDOFF.md`](url-isolation-session-HANDOFF.md) §3.1.

**Companion, not replacement.** [`dashboard-ia-rework-PLAN.md`](dashboard-ia-rework-PLAN.md) stays the
record of *why*; its §9 is the as-built and §10 is the backlog. This file is the **entry point**: what
is closed, what is genuinely left, and the traps that cost time in the last two sessions.

**Status as of 2026-07-30:** Phases 1–3 shipped, §10.1 A–F closed, rows I and J closed, §10.3
deviations ratified. **Rows H · K · L ratified and implemented** (see §3.2–3.4); H and K
**re-verified against `HEAD` 2026-07-30** — `useMasterNavEnabled` has zero references left (the rail
survived the gate's removal, so it is ON, not deleted), and `useSavedViews` no longer writes
localStorage. Apply migrations `2026-07-29g_saved_views.sql` +
`2026-07-29h_drop_legacy_saved_views.sql` before relying on server-backed dashboard/station saved
views. `npm run verify` is **green**.

**Row G is the only row left** — still gated on a research response that has not landed. One row-L
deviation from its ratified verdict is flagged in §3.4 and needs a yes/no.

---

## 0. The four things to internalise

1. **The top axis is DIRECTION, not entity** — ratified into house law
   (`.claude/rules/display/workbench.md` → *The top axis is DIRECTION*). `inbound | outbound`, with a
   three-part predicate for what earns a slot. Do not re-open it; do not propose
   `Orders · FBA · Repair · Sales`. The worked verdicts are in that rule.
2. **Tabs and saved views both ship**, split by *who defines the set* — system-defined lifecycle
   transitions are tabs, operator-defined facet combinations are saved views. Same rule file.
3. **The ownership guard reports only params NO spec declares.** It will never tell you your route is
   missing `q` / `sort` / `search`, because another route owns them. This is how two live `/dashboard`
   defects survived a "done" phase (§2). **Enumerate a surface's full read set separately.**
4. **Verify claims about a module by its CALL SITES, not its docblock.** A component that documents
   itself as "generic and shared" may have zero consumers and already be sitting in
   `knip-baseline.json`. That mistake is in the record below.

---

## 1. Closed — do not redo

| Row | Outcome |
|---|---|
| Phases 1–3 | Shipped, browser-verified. §9 of the plan is the as-built. |
| 10.1 A | `SEARCH_ROUTE_PARAMS` declared. Phase 6's sort/scope keys now collide as a build failure. |
| 10.1 B | `/search` declares its own `SidebarRouteKey`, deliberately absent from `CONTEXT_PANEL_ROUTE_KEYS`. Phase 6 flips it by adding one set member. |
| 10.1 C | Four settled states are house law; `LedgerGridSurface` passes the no-match answer through; Pickup is the first consumer. |
| 10.1 D | `dashboard-search-eviction.spec.ts` 6/6 green on `qa-desktop`, after its central assertion was found vacuous and rewritten. |
| 10.1 E | Not a bug — the `useUrlColumnSort` docblock was already correct. |
| 10.1 F | No dead clear list survives on a spec-backed route; the invariant now guards it. |
| 10.2 I | Axis + tabs/saved-views **decided** → house law. |
| 10.2 J | Sub-routes — closed unless evidence appears. |

---

## 2. What those closures cost, and why the traps matter

Two of §10.1's six rows were **defects**, not follow-through. Both had the same root cause: a contract
was declared without checking it against the code that reads it.

- **`/dashboard` dropped every lifecycle tab at the boundary.** `?unshipped` / `?shipped` / `?packed`
  / `?tested` / `?fba` are *valueless* presence flags read with `.has()`, but were declared
  `paramText`, which rejects `''`. `?shipped` parsed to `""` and the tab silently reverted. It had not
  bitten only because `/dashboard` does not mount `useSurfaceParamHygiene()` — **which is step 6 of
  the migration method**, so the trap was armed for whoever graduated the surface next. Fixed with a
  `paramPresence` schema.
- **`?search=` and two filter facets were undeclared.** `searchScopeHref('ORDER')` hands off to
  `/dashboard?search=`, which `PackedOrdersTable` reads. Root cause: `components/dashboard` was never
  in the ownership guard's `OWNED_TREES`.
- **The e2e spec was vacuous three ways.** `getByRole('link', { name: /^search$/i })` — a mode entry
  is a `button`, it is not in the DOM until the click-opened dropdown opens, and the trigger is not
  mounted until the sidebar is shown. It would have passed with the retired mode fully restored.
  Rewritten to open the menu and assert a **sibling mode is present** before asserting Search is
  absent; mutation-tested. *(The global header does render a `button "Search"` — an unscoped by-name
  query fails for the opposite wrong reason. Scope to the menu.)*

**Generalise:** a guard that cannot fail is worse than no guard, because it reads as coverage. When
you write or inherit one, prove it fails — change the code it guards and watch it go red.

---

## 3. What is left — start here

> **Rows H, K and L now have a briefing:**
> [`dashboard-ia-rows-HKL-GEMINI-RESEARCH-BRIEFING.md`](dashboard-ia-rows-HKL-GEMINI-RESEARCH-BRIEFING.md)
> (written 2026-07-29). Read it before acting on §3.2–§3.4 — it corrects three claims repeated below:
> the panel count is **10**, not ~14; **there is no flag**, so "the dormant code is the cheap
> experiment" is not available as stated (`MasterNavProvider` is hardcoded `enabled` at
> `SidebarShell.tsx:48` + `ContextPanelLayout.tsx:90`, so flipping it turns the rail on for all 10
> panels at once); and `/fba` is **already a redirect**, not a parked page — the precedent for row L's
> answer is inside the FBA domain itself.

### 3.1 Row G — Phase 6, the `/search` results surface *(the largest remaining build)*

Phase 1 created `/search` and did not finish it: evicting Search to its own route made its
hand-rolled result list a first-class page with nowhere to hide.

**Gated on** [`search-results-grid-GEMINI-RESEARCH-BRIEFING.md`](search-results-grid-GEMINI-RESEARCH-BRIEFING.md)
— deliberately, because the three candidate shapes differ by an order of magnitude in cost. Do not
guess the shape.

Groundwork already in place, so the build starts clean:
- `SEARCH_ROUTE_PARAMS` exists — declare new sort/scope keys there and the ownership guard catches a
  collision with `/support`'s `status`/`range`/`type` or `/dashboard`'s `sort`/`open` at build time.
- `/search` has a real route key; giving the results grid a filter rail is one line
  (`CONTEXT_PANEL_ROUTE_KEYS`).
- The four-settled-states contract is house law, and `LedgerGridSurface` now takes
  `emptyMessage` / `searchEmptyMessage` / `isSearching` — a search results grid is precisely the
  surface that needs the no-match answer.
- `CATEGORY_TABS` in `src/components/search/search-tabs.ts` is a scope vocabulary with **no URL param
  yet**. If Phase 6 wants `?scope=`, declare it on the spec.

### 3.2 Row H — Phase 4, L2 mode rail — **DECIDED 2026-07-29**

**Verdict:** persistent in-sidebar rail. Tear out MasterNav L2 `ModesPanel` / `MasterNavProvider`;
keep MasterNav L1 page switching. Research:
[`dashboard-ia-research-briefing-HKL.md`](dashboard-ia-research-briefing-HKL.md).

**Two-shapes reading:** the house Never bans *permanent forks of one job*. It does **not** block
migrating to a higher-quality SoT when some call sites lag. Destination SoT for L2 is the rail;
unfinished pages are tracked migration debt, not a second sanctioned shape. Do not leave ModesPanel
alive “for the gaps.”

**Ship now:** un-gate the **10** panels that already have dormant rails; delete ModesPanel +
`MasterNavContext`.

**Follow-ups (not blockers):** rails for dashboard / review / walk-in; Inventory pills 2→5 SoT modes;
Sourcing Analytics pill vs `SIDEBAR_PAGE_NAV` drift.

### 3.3 Row K — unify saved-views storage — **DECIDED 2026-07-29**

**Verdict:** Shape A — polymorphic `saved_views` table (org-scoped, `staff_id`-owned, `is_shared`,
`surface` CHECK). Explicit waiver of polymorphic-tables’ “does not migrate existing surfaces” for
this consolidation. Port `useSavedViews` off localStorage. Research:
[`dashboard-ia-research-briefing-HKL.md`](dashboard-ia-research-briefing-HKL.md).

### 3.4 Row L — FBA front doors — **DECIDED 2026-07-29 · AS-BUILT 2026-07-30**

**Verdict:** one canonical route (`/shipping/fba` → `FbaWorkspace`), one redirect (`/fba`). Delete
vestigial `/dashboard?fba` (falls through to Pending). Delete `FbaShipmentsTable` after cleaning the
`/test` Shipping FBA tab. Research:
[`dashboard-ia-research-briefing-HKL.md`](dashboard-ia-research-briefing-HKL.md).

**As-built — verified 2026-07-30.** All of the verdict landed via other sessions: `'fba'` is gone from
`DashboardOrderView`, the `/test` Shipping FBA tab is cleaned (`ShippingWorkspaceTab` is now
`pending | history`), and `FbaShipmentsTable` no longer exists.

> ⚠️ **One DEVIATION from the verdict, pending ratification.** The verdict says delete the vestigial
> `/dashboard?fba` and accept that it *falls through to Pending*. As built, it now **client-redirects to
> `/shipping/fba`** (`isRetiredFbaView` / `retiredFbaViewTarget` in `lib/dashboard/dashboard-domains.ts`,
> wired in `app/dashboard/page.tsx`). Rationale: the fall-through silently lands an old bookmark on an
> unrelated tab, and this is the **third instance** of an existing mechanism — `?warranty=` → `/support`
> and `?mode=search` → `/search` are already wired the same way in the same file — so it composes rather
> than invents. It carries nothing across, because the dashboard's `?open=` is an ORDER id while the
> board's `openShipmentId` is a SHIPMENT id. Browser-verified (`/dashboard?fba` → `/shipping/fba`,
> `?shipped` untouched) and unit-tested. **Either ratify this as the final shape or revert it to the
> plain fall-through — it is one effect plus one flag to remove.**

**FBA param groundwork (2026-07-30).** `/fba` correctly has **no route param spec** — it is a
server-side `redirect()`, not a surface, the same treatment `/tech` and `/packer` get as aliases. Do not
"complete the isolation tier" by giving it one. What a redirect *does* need is the hand-off guarantee:
every param it forwards must be declared by the DESTINATION, or `/shipping/fba`'s boundary parse drops
it on arrival and the bookmark loses its focus and filters. That list is now
`FBA_LEGACY_REDIRECT_FORWARDED_PARAMS` in `lib/fba/fba-modes.ts`, asserted against the `/shipping/fba`
spec by `fba-modes.test.ts` (mutation-verified: remove `draft` from the spec and the test names it).
Same defect class as `/walk-in`'s legacy deep-links, which was caught only after the fact.

### 3.5 §10.3 — CLOSED 2026-07-29

All three shipped deviations were verified against current code and ratified as final shape — no
follow-up work. See `dashboard-ia-rework-PLAN.md` §10.3 for the file:line evidence.

1. Outbound recents are a **capped footer** (`DashboardRecentsFooter`, 5-entry cap, own scroll box) —
   ratified; the order feed is already the domain's picker.
2. The inbound attention band rides the **chrome slot** because `ReceivingLinesTable` self-scrolls and
   the shell body has no scroll port of its own — ratified; outbound's sibling correctly differs
   because it doesn't have that constraint.
3. `DashboardReceivingView` **redirects** on permission denial rather than deleting the gate — ratified
   as the safer reading of C10 (navigation removed, authorization kept).

---

## 4. The entity-axis briefing is spent — do not re-run it

[`dashboard-entity-axis-GEMINI-RESEARCH-BRIEFING.md`](dashboard-entity-axis-GEMINI-RESEARCH-BRIEFING.md)
produced the row-I ratification. Its axis and tabs-vs-saved-views halves are now house law; its
remaining questions fold into rows K (Q4, saved-view storage) and L (Q6, FBA's homes) or belong to
`page-consolidation` (Q7, Sales).

**Two errors in that brief, recorded so they are not inherited:**

- **`SavedViewsControl` was described as "live and generic."** It was neither — zero call sites, and
  already in `knip-baseline.json`. The control actually on screen is `OutboundSavedViewsList`. The
  claim came from reading the component's docblock instead of its consumers. *(The dead popover has
  since been deleted and the baseline shrank by one.)*
- **`DashboardViewGroup` was cited as a live emergent entity axis.** It **did** exist when the brief
  was written (`git show 3e42e8462:src/utils/dashboard-search-state.ts` line 20) and was deleted in
  the interim — so the brief was accurate at the time and the tree moved under it. Worth knowing
  because its deletion is *evidence for* the ratified direction axis, not against it. The only
  surviving artifact is the vestigial `'fba'` member of `DashboardOrderView` (row L).

Both are the same lesson as §0.4: **check call sites and re-check against current `HEAD`**, especially
in a tree where other sessions commit mid-flight.

---

## 5. Adjacent, unblocked, not part of this plan

**Header Mode + Recents (Receiving pilot):** Row H's persistent rail is superseded for Unbox/Receiving
only by [`header-mode-switcher-UNBOX-HANDOFF.md`](header-mode-switcher-UNBOX-HANDOFF.md) — start at §3.

The URL-isolation refactor ([`nav-routing-refactor-FINISH-PROMPT.md`](nav-routing-refactor-FINISH-PROMPT.md))
shares machinery with this one and has **eight surfaces still un-isolated**:

```
/fba  /inventory  /packer  /review  /sourcing  /tech  /walk-in  /warehouse
```

None has a route param spec, so `applyModeTarget` still takes the legacy copy-forward path for all of
them — the whole query string rides along on a mode switch. That is **correctness work**, not
structure, and it is unblocked today. `/products` is the worked example; the method is §2 of that
file.

This matters here because §10.1 F found four of those routes (`/sourcing`, `/review`, `/inventory`,
`/walk-in`) still carry **load-bearing** hand-written param clear lists — they cannot be deleted until
their surface is isolated, and `route-mode-registry.guard.test.ts` will fail the moment one graduates
while keeping its list.

---

## 6. Definition of done

- [x] Phases 1–3 shipped and browser-verified
- [x] §10.1 A–F closed
- [x] §6 Q3 answered → row I ratified into house law
- [ ] §6 Q5 + Q6 answered → **Phase 6 shipped** (row G)
- [x] §6 Q1 answered **yes** (2026-07-29) → row H: persistent L2 rail; ModesPanel out
- [x] Row K ratified (2026-07-29) → polymorphic `saved_views`
- [x] Row L resolved (2026-07-29) → `/shipping/fba` canonical; delete `?fba` + `FbaShipmentsTable`
- [x] §10.3 deviations ratified (2026-07-29)
- [ ] §9 updated one last time, then the whole plan moved out of `docs/todo/`

*(The `src/app/signin/page.tsx` merge conflict named in the plan's original §10.4 is resolved —
`npm run verify` is green as of 2026-07-29.)*

---

## 7. Hard constraints

- **Do not re-open the direction-vs-entity axis** or the tabs-vs-saved-views boundary. Both are house
  law; overturning one needs a file that makes the rule wrong, cited.
- **Never raise a `verify` ratchet baseline.** Baselines only shrink.
- **Never mount an always-open `SearchField`** in a `WorkbenchChromeHeader` `search` slot — one
  sanctioned exception exists (`/ops/photos`) and a second is Ask-first.
- **One tab strip per workbench chrome header.** No nested tabs.
- **KPI tiles filter, never select.**
- Tenant scoping, the status machine, audit, and the search waist are **Ask-first**.
- **The user owns the dev server** (`:3050`, attach-only via `.claude/launch.json`). Never start,
  stop, or restart one. `pnpm dev` is a plain `next dev -p 3050` — the per-lane port resolver was
  removed 2026-07-29, so Playwright needs no `PW_BASE_URL`.
- **The user manages commits.** Other sessions commit into this tree mid-flight; check ownership
  before assuming a red gate is yours.
