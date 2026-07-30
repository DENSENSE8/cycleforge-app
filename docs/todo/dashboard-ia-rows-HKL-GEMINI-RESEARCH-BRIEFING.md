# Research briefing — the three undecided IA rows (H · K · L)

**For:** a deep-research pass (Gemini Pro or equivalent).
**Date:** 2026-07-29.
**Asks:** three decisions that `docs/todo/dashboard-ia-rework-PLAN.md` could not make inside its own
scope, because each changes a contract wider than `/dashboard`.

| Row | Question in one line | Why it is not a dashboard task |
|---|---|---|
| **H** | Is L2 (mode) switching a **click-opened dropdown** or a **persistent in-sidebar rail**? | Changes the nav contract for 10 route panels at once |
| **K** | Where do **saved views** live — localStorage, a per-staff JSON bag, or a polymorphic table? | Touches two live tables + a tenancy boundary |
| **L** | How many **front doors** should the FBA board have, and what happens to the old ones? | Spans `/dashboard`, `/fba`, `/shipping` |

**Not in this briefing:** Row G (the `/search` results surface) has its own, already written and still
unanswered — [`search-results-grid-GEMINI-RESEARCH-BRIEFING.md`](search-results-grid-GEMINI-RESEARCH-BRIEFING.md).
Do not re-answer it here. If your analysis of H changes something in G, say so in one line and stop.

---

## 0. How to answer — the evidence standard

The previous briefing in this series produced a correct-sounding recommendation built on **two false
premises**, and both were the same class of mistake: *a claim taken from a module's own docblock
instead of its call sites.*

- It described `SavedViewsControl` as "live and generic — already shipped." It had **zero call sites**
  and was sitting in `knip-baseline.json`. Shape A's entire mechanism was a dead component. *(It has
  since been deleted.)*
- It cited `DashboardViewGroup` as a live emergent entity axis. That type existed when the brief was
  written (`git show 3e42e8462:src/utils/dashboard-search-state.ts`) and had been **deleted in the
  interim** — the brief was accurate when written and the tree moved under it.

So, three rules for this pass:

1. **A component's docblock is a claim, not evidence.** Before you build a recommendation on "X is
   shared / generic / live", grep its importers. This briefing marks every fact `[VERIFIED]` with a
   `file:line` you can re-check, or `[ASSUMED]` where I did not confirm it.
2. **Re-check against current `HEAD`.** Other sessions commit into this tree mid-flight. Two of the
   numbers in the *plan* are already stale and corrected in §1 below.
3. **Recommend a shape, then name what would falsify it.** A recommendation with no disconfirming
   test is not usable — the last one had none, which is why it survived a dead component.

Answer in the shape of §5.

---

## 1. Corrections to the plan's own numbers

Both of these appear in `dashboard-ia-rework-PLAN.md` / `-HANDOFF.md` and are wrong. Do not inherit
them.

**C1 — It is 10 route panels, not "~14".** `[VERIFIED]` `grep -rln useMasterNavEnabled
src/components/sidebar/*.tsx` returns 12 files, of which 2 are infrastructure (`SidebarShell.tsx`,
`ContextPanelLayout.tsx`). The 10 real panels: `Inventory`, `Operations`, `Outbound`, `Packer`,
`Products`, `Receiving`, `Sourcing`, `Support`, `Tech`, `Warehouse`. The "~14" figure comes from
`SidebarShell.tsx:28`'s own docblock — itself an unverified claim, which is the §0 lesson twice over.

**C1b — the citations for it are also wrong.** `[VERIFIED]` The plan cites `ResponsiveLayout.tsx:36`
for the `w-[360px]` context-panel width; the real home is
`src/components/sidebar/context-panel-column.ts:55` (`CONTEXT_PANEL_COLUMN_CLASS`). The width itself
is correct. Re-derive citations before quoting them.

**C2 — There is no flag. The "cheap experiment" is not available.** `[VERIFIED]` The handoff says
*"the dormant code is the cheap experiment if you want evidence first."* But `MasterNavProvider` is
mounted with a **hardcoded** `enabled` at both mount points — `SidebarShell.tsx:48` and
`ContextPanelLayout.tsx:90`. `MasterNavContext.tsx:12` is `createContext(false)`; the provider always
passes `true`. The docblock at `MasterNavContext.tsx:5-11` still describes a flag ("Lets P2 swap in
the master nav behind a flag") that no longer exists.

Consequence: flipping the dormant rail on is **not** a one-page experiment. The provider wraps the
whole shell, so editing those two call sites turns the rail on for **all 10 panels simultaneously**.
A single-page trial needs new code (a per-route override). Factor that cost into your H answer.

---

## 2. Row H — dropdown vs. persistent rail for L2 mode switching

### 2.1 What exists today `[VERIFIED]`

- **L2 switching is a click-toggled dropdown** under the nav header trigger. `[VERIFIED]`
  `MasterNavView.tsx:193-196` (`handleModesToggle` → `setModesOpen(prev => !prev)`), wired at `:212`
  (`onModesClick`), rendering `ModesPanel` at `:244`.
  **Beware the comments here:** `MasterNav.tsx:144` and `:159` both call it a *"hover dropdown."*
  That is stale — the handler is a click toggle. A third instance of the §0 lesson, found while
  writing this briefing. Trust `MasterNavView.tsx`, not those two comments, and if your answer turns
  on open-cost, note that opening costs a **deliberate click**, not a hover.
- **Every one of the 10 panels still contains a complete, working in-sidebar mode rail**, gated off
  behind `!masterNavEnabled`. Reference shape (`OutboundSidebarPanel.tsx:27-51`):

  ```tsx
  {!masterNavEnabled && (
    <div className={sidebarHeaderPillRowClass}>
      <HorizontalButtonSlider items={OUTBOUND_MODE_ITEMS} value={mode}
        onChange={(id) => updateMode(id as OutboundMode)}
        variant="nav" dense className="w-full" aria-label="Shipping mode" />
    </div>
  )}
  ```

- The mechanism was **deliberately switched off** when mode switching consolidated into MasterNav.
  Reversing a completed house migration is **Ask-first** under `AGENTS.md`, and giving `/dashboard`
  alone a rail while 9 siblings keep the dropdown is *two shapes for one job* — a named **Never**.

### 2.2 The distinction the original research missed — read this before answering

The external research that started this thread proposed an **L2 rail of "VIEWS + RECENTS"** at
240px. The dormant code is **not that**. It is a **row of L2 mode pills for the page you are already
on** (`Labels · Ready · FBA · Scan out`), in the sidebar header.

Those are different products:

| | Dormant code (exists) | Researched proposal (does not exist) |
|---|---|---|
| Answers | "which mode of *this page*" | "which *domain / saved view* am I in" |
| Replaces | the MasterNav dropdown | the master–detail **picker** |
| Cost | flip 2 call sites (all 10 panels at once, per C2) | new component + X1 below |

So "the mechanism already exists, fully implemented" — the plan's §0 headline — is **true of the mode
pill row and false of the proposed rail.** Please answer for the mode pill row, and treat the
VIEWS+RECENTS rail as a separate proposal that must first answer X1: *on `/dashboard` the context
panel holds the outbound order picker (`UnshippedSidebar`), so a two-item domain rail in that column
would displace the Workbench master–detail picker. Where does the picker go?* The house answer is
that a rail sits **above** it (`SidebarShell headerAbove`) — which is exactly the dormant slot.
The column is `w-[360px]` `[VERIFIED]` `src/components/sidebar/context-panel-column.ts:55`, not the
240–300px the research assumed.

### 2.3 What to research

1. **Industry:** for an ops console with 15 L1 pages and ~74 L2 modes, is L2 better as always-visible
   chrome or a click-opened menu? Discriminate by **switch frequency** and **modes-per-page**, not by
   taste. Linear, Retool, Shopify admin, Carbon/Stripe-dashboard patterns are the comparison set.
2. **The specific trade this app faces:** MasterNav gives one consistent switcher for every page and
   costs a click plus a hidden layer. The pill row costs ~40px of sidebar header on every page and
   makes modes self-advertising. With **1–15 staff on a warehouse floor** and modes-per-page ranging
   from 2 to 6, which loses less?
3. **Is "both" coherent** — pills for pages with ≤N modes, dropdown above N — or is a
   cardinality-conditional switcher exactly the "two shapes for one job" the house bans?
4. **If the answer is dropdown (keep today's behavior):** the 10 dormant rails become dead code
   carrying a false docblock. Should they be **deleted** in the same change that ratifies the
   decision? Argue it — the plan's stated fear is losing a cheap experiment, but per C2 that
   experiment does not exist in the form the handoff claims.

**Falsification test to name:** what observation on the floor would prove the chosen shape wrong?

---

## 3. Row K — where saved views live

### 3.1 What exists today `[VERIFIED]`

**Three implementations of one concept.**

| # | Implementation | Storage | Scope | Sharing | Consumers |
|---|---|---|---|---|---|
| 1 | `useSavedViews` (`src/hooks/useSavedViews.ts`) | **localStorage** | per **browser** | none | 2 — `OutboundSavedViewsList`, `TableOptionsMenu` |
| 2 | `operations_saved_views` (`2026-06-24_…sql`) | Postgres | org + `staff_id` | `is_shared` | `/operations` |
| 3 | `media_library_saved_views` (`2026-07-01_…sql`) | Postgres | org + `staff_id` | `is_shared` | `/ops/photos` |

- #2 and #3 are **byte-for-byte the same table under two names** — #3's migration header says
  *"Mirrors `2026-06-24_operations_saved_views.sql` exactly."* Both carry
  `enforce_tenant_isolation()`, org-led indexes, and ownership-scoped mutations
  (`saved-views-queries.ts` in each of `src/lib/operations/` and `src/lib/photos/`).
- **The operator-visible defect:** a `/dashboard` saved view is per-browser, so it does not follow a
  staffer to the floor tablet, while an `/operations` view does. Same word, two different promises.

### 3.2 The option the plan did not consider `[VERIFIED]`

`staff_preferences` (`2026-06-21_staff_preferences.sql`) is **already** the house's per-staff
server-side preference store: one row per `(organization_id, staff_id)` holding a `prefs JSONB` bag.
It already persists `tableColumns` (per-staff grid column deltas) and `focusScanHotkey`. Adding a
`savedViews` key is a **zero-migration** option.

Its limit is precise and load-bearing: the row is **per staff**, so there is no clean way to express
`is_shared` (an org-wide view visible to everyone). #2 and #3 both have that column.

So the real question is not "unify or not" — it is **which of three storage shapes is right, and is
org-wide sharing a requirement or a feature nobody asked for?**

| Shape | Migration cost | Device-portable | Supports `is_shared` | Leaves duplication |
|---|---|---|---|---|
| A — polymorphic `saved_views` (`entity_type`/`surface` discriminator) | New table + migrate 2 live tables | yes | yes | no |
| B — `staff_preferences.savedViews` key | **none** | yes | **no** | yes (#2, #3 remain) |
| C — keep the split; document it | none | no (dashboard stays per-browser) | n/a | yes |

### 3.3 Constraints you must respect

- `.claude/rules/polymorphic-tables.md` gives the contract shape A must match (named CHECK
  discriminator, BIGINT id, `entity_type`/`entity_id` naming, org-led unique indexes, parent-delete
  integrity, tenant-from-birth, modeled in Drizzle in the same PR) — **but that same doc explicitly
  declines to retroactively migrate existing surfaces.** Shape A therefore needs an argument for why
  saved views are the exception, not just an appeal to tidiness.
- Tenancy is **Ask-first**. Any answer that moves data between tables must say what happens to rows
  that already exist in #2 and #3 and how the cutover avoids a window where a staffer's views vanish.

### 3.4 What to research

1. **Is org-wide view sharing a real requirement** for a 1–15 person reseller op, or an inherited
   enterprise assumption? If it is not, shape **B** is free and the polymorphic table is over-build.
   Check what `is_shared` is actually *used for* on `/operations` and `/ops/photos` before answering.
2. **Industry:** are saved views normally per-user-private, team-shared, or both-with-a-toggle in
   comparable ops tools? Does the answer change below ~20 seats?
3. **Is per-browser ever the right answer?** A named "view" that silently differs per device is
   arguably a bug in the concept, not a storage tier. Say so if you think the localStorage tier
   should not exist at all.
4. **If A:** what is the discriminator — one row per `(surface, staff)` with a `surface` CHECK
   (`'dashboard' | 'operations' | 'media_library' | …`)? Note this is a *typed-fact* table, not a
   parent-pointing polymorphic reference, so `entity_type`/`entity_id` may not be the right naming —
   resolve that against the contract rather than assuming.

---

## 4. Row L — how many front doors should FBA have?

### 4.1 The plan states this question too narrowly

The plan frames row L as *"where should an old `?fba` bookmark land — Shipping mode or 404?"* The
code says the real question is bigger: **FBA currently has four front doors and two different board
components.** `[VERIFIED]`

| Door | What it does | Component |
|---|---|---|
| `/shipping?mode=fba&fbaMode=` | the primary UX (`sidebar-navigation.ts:729-735`) | `FbaShipmentsTable` via `ShippingWorkspaceView.tsx:106` |
| `/shipping/fba` | renders the board directly (`src/app/shipping/fba/page.tsx`) | **`FbaWorkspace`** — a *different* component, 1 consumer |
| `/fba` | **already a redirect** to `/shipping?mode=fba`, preserving `?mode=`→`fbaMode` + `openShipmentId` | — |
| `/dashboard?fba` | vestigial; no nav entry constructs it | `FbaShipmentsTable` via `DashboardOrdersView.tsx:130` |

Two findings that change the framing:

- **`/fba` is not a "parked page."** Both the plan and the handoff call it that. It is a
  `redirect()` whose own docblock reads *"permanent rehome to Outbound FBA mode (surface split)"* —
  it already solved, inside the FBA domain itself, exactly the bookmark-preservation problem row L is
  stuck on. **The precedent for the answer is one directory over.**
- **There are two board components.** `/shipping/fba` renders `FbaWorkspace`; `/shipping?mode=fba`
  renders `FbaShipmentsTable`. Whether these are the same surface with different chrome or a genuine
  fork is `[ASSUMED]` — I did not diff them. **Do that first**; it may dominate the answer.

### 4.2 What to research

1. **How many doors should one board have?** Give a rule, not a verdict: when is a second route to
   the same surface legitimate (deep-link, permission boundary, embedded vs. standalone) and when is
   it a fork?
2. **Are `FbaWorkspace` and `FbaShipmentsTable` one surface or two?** If one, which survives, and
   does the `/shipping/fba` route keep existing as a redirect (the `/fba` precedent) or disappear?
3. **`?fba` on the dashboard:** it fails the ratified top-axis predicate (see §6 — FBA already owns a
   home). Confirm deletion, and say whether it gets the `/fba` redirect treatment or is simply
   dropped. Note the cost of dropping: an old `?fba` bookmark silently renders the **Pending** tab —
   the operator lands somewhere they did not ask for, with no signal.
4. Cross-check against [`page-consolidation-station-first-GEMINI-RESEARCH-BRIEFING.md`](page-consolidation-station-first-GEMINI-RESEARCH-BRIEFING.md)
   Q4 (merge list) and Q6 (target nav) — that briefing already calls FBA *"already relocated"* and
   *"a completed consolidation we can hold up as the template — or a warning."* Decide which it is.

---

## 5. Answer in this shape

For **each** of H, K, L:

1. **Verdict** — one sentence, one of the named shapes (or a named alternative).
2. **Why** — the two or three facts that decide it. Cite `file:line` for anything about this codebase.
3. **Falsification** — what observation would prove the verdict wrong.
4. **Deletion list** — what this verdict lets us delete. A verdict that deletes nothing and adds a
   layer needs to justify the net growth.
5. **Migration path** — ordered, each step independently shippable and reversible. For K, name the
   cutover behavior for rows already in the two live tables.
6. **Blast radius** — files/routes touched, and which of the house Ask-first boundaries it crosses
   (tenancy, status machine, audit, search waist, shared-primitive public API).

Then, once at the end:

7. **Anything in §1–§4 you found to be wrong.** This briefing's own claims are marked `[VERIFIED]`
   with line numbers precisely so you can falsify them. Saying "your C2 is wrong, here is the flag"
   is a better outcome than a confident answer built on it.

---

## 6. Hard constraints — do not propose these

Ratified house law. Overturning one needs a cited file that makes the rule wrong, not an argument
from general principle.

- **The top axis is DIRECTION (`inbound | outbound`), not entity.** Ratified 2026-07-29 into
  `.claude/rules/display/workbench.md` → *The top axis is DIRECTION*, with a three-part predicate for
  what earns a slot (owns a distinct collection surface · is a Workbench region · has no home
  elsewhere). Do not propose `Orders · FBA · Repair · Sales`.
- **Tabs vs. saved views is settled:** system-defined lifecycle transitions are tabs; operator-defined
  facet combinations are saved views. Same rule file. Row K is about *storage*, not the boundary.
- **One tab strip per `WorkbenchChromeHeader`.** No nested tabs.
- **Never mount an always-open `SearchField`** in a chrome-header search slot — `ToolbarSearchToggle`
  is the SoT; the one sanctioned exception is `/ops/photos`.
- **KPI tiles filter, never select.**
- **A scanner-driven surface is a Station, not a Workbench** — do not merge `/unbox` into the
  dashboard's inbound domain. This is the anti-mix rule in `.claude/rules/display/contextual-display.md`.
- **Baselines only shrink** (`npm run verify` ratchets). Never raise one to land a change.
- **Tenancy, the status machine, audit, and the search waist are Ask-first.**

## 7. Reading order

Start here, in order — the first two are the *why*, the third is the current state:

1. [`dashboard-ia-rework-HANDOFF.md`](dashboard-ia-rework-HANDOFF.md) — §0 (the four things to
   internalise) and §3 (the four remaining rows with their gates).
2. [`dashboard-ia-rework-PLAN.md`](dashboard-ia-rework-PLAN.md) — §0 (the verdict that started this),
   §2 (corrections X1–X5, several of which bear directly on row H), §10.2 (the row table).
3. `.claude/rules/display/workbench.md` — the ratified axis + tabs/saved-views rules in §6 above.
4. `.claude/rules/polymorphic-tables.md` — the contract shape K's option A must satisfy.
5. [`dashboard-entity-axis-GEMINI-RESEARCH-BRIEFING.md`](dashboard-entity-axis-GEMINI-RESEARCH-BRIEFING.md)
   — **spent.** Read only for its §4 error record, so the two false premises are not re-derived.
