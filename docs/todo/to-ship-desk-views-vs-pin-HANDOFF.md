# To-Ship desk: rail-less redesign + pin-vs-views scope fix — HANDOFF

**Status:** code + guards + docs done, uncommitted. **Owner:** none assigned yet.
**Branch/lane:** `main` (dogfood cleanup task, not a topic lane).

> **UPDATE (2026-08-09, later same day) — the Views control MOVED to Band 3.**
> This handoff's §5 originally called Band-1 `leading` (a bare **Star** icon)
> the "final correct state." It was superseded the same day: saved views now
> live on **Band 3 trailing find** (immediately right of the search bar) as a
> flush **Bookmark** icon, and `OutboundViewsMenu` is now a **thin adapter over
> the shared `WorkbenchViewsMenu`** — the house-wide ops-queue control also used
> by Incoming · History · Unbox · Shipping · Testing · Pack (all "never Band-1
> leading"). This matches the SoT's own ruling (a saved view is an **inner
> refinement** — a named filter combination — not an outer scope beside the
> lifecycle tabs) and an independent Gemini industry-standards pass
> (`to-ship-saved-views-control-placement-GEMINI-RESEARCH-BRIEFING.md`), which
> landed on the same placement. The pin-vs-views **scope** lesson below is
> unchanged and still correct; only the Views *placement/treatment* specifics in
> §5 and "Verified" were stale and are corrected inline.

## What this thread did, in order

1. **Audited the To-Ship left rail** against a Gemini pattern-survey report
   (Zendesk/Linear/Shopify-Admin triage IA). Found the rail duplicating
   Band-1 lifecycle tabs and Band-2 KPI facets (report P1/P5/P8), plus two
   misplaced cards (`ThroughputRoiCard`, `GettingStartedChecklist` — P6/P10).
2. **Deduped the rail** to its one legitimate facet (`mine`), backed by a new
   ownership map `OUTBOUND_FACET_OWNER` (tabs\|kpi\|rail) so a stage/attention
   facet can't silently re-enter the rail. Deleted the two misplaced cards.
3. **Went rail-less (Pattern E)** for `/shipping/orders` + `/dashboard`
   outbound domain — `isRaillessOrderFeedSurface` → `useIsRaillessOrderFeed` →
   `ContextPanelLayout` `hasPanel`. Table reclaims the ~360px column, same
   mechanism `/search` already used.
4. **Two wrong placements for saved views**, both corrected in-session:
   - **Wrong #1:** put a standalone `OutboundViewsMenu` in the desk's Band-1
     `leading` slot (top-left, before the tabs) — this part was fine, but
     framed as "the pin button's replacement," confusing the user.
   - **Wrong #2:** merged saved views into `HeaderPinsSwitcher`'s dropdown as a
     second `[Pins | Saved views]` tab, and **suppressed the pin button in the
     GlobalHeader** on the rail-less desk (gated on `useIsRaillessOrderFeed`)
     so it wouldn't duplicate. User correctly rejected this: *"pin this page
     should still display in the global header — one is website wide and one
     is page wide."*
5. **Final, correct state (this handoff's baseline):**
   - `HeaderPinsSwitcher` — **fully reverted** to its original form. Renders
     unconditionally in the GlobalHeader on every route. No tabs, no
     `useSavedViews` import, no gating on the rail-less predicate.
   - `OutboundViewsMenu` — **a thin adapter over the shared `WorkbenchViewsMenu`**
     (flush **Bookmark** icon; tooltip + `aria-label` carry the active view name),
     mounted in the desk's **Band-3 `views` slot** (`OutboundTriageBand`,
     immediately right of the "Filter orders…" search, before the inspector
     toggle) — **never Band-1 `leading`**. Resolves `paramKeys`/`storageKey` via
     `outboundSavedViewsConfig(mode)`. Imports nothing from `HeaderPinsSwitcher` /
     `useQuickAccess`. *(Original session shipped this as a standalone Star button
     in Band-1 `leading`; superseded — see UPDATE at top.)*
   - Deleted `current-surface-saved-views.ts` (the resolver that only existed
     to feed the now-reverted tabbed pin dropdown — genuinely orphaned, not
     archived).
6. **Wrote the durable SoT law** so this class of mistake — conflating a
   website-wide control with a page-wide one because they happen to sit near
   each other — can't recur silently. See "SoT ruling" below.

## Current file state (uncommitted)

```
M  .claude/rules/display/workbench-ops-queue.md
M  .claude/rules/source-of-truth.md
M  AGENTS.md
M  src/components/dashboard/OutboundWorkspaceHeader.tsx
M  src/components/layout/GlobalHeader.tsx           (reverted to original)
M  src/components/layout/HeaderPinsSwitcher.tsx      (reverted to original)
M  src/components/saved-views/SavedViewsList.tsx     (added optional hideHeader prop — still used by OutboundViewsMenu)
M  src/components/unshipped/OutboundSavedViewsList.tsx
M  src/components/unshipped/OutboundSidebarFilterMap.tsx
M  src/components/unshipped/UnshippedSidebar.tsx
M  src/components/unshipped/outbound-rail-dedup.guard.test.ts
M  src/components/unshipped/outbound-sidebar-shared.ts
M  src/components/ui/table-options/TableOptionsMenu.tsx (reverted trigger-face experiment)
M  src/lib/sidebar-navigation.ts
D  src/components/dashboard/ThroughputRoiCard.tsx
?? src/components/dashboard/OutboundViewsMenu.tsx
?? docs/todo/to-ship-desk-views-vs-pin-HANDOFF.md   (this file)
```

Note: the working tree also has **many unrelated files modified by other
concurrent sessions** (station/displays, right-rail, docs/portfolio, etc.) —
do not sweep those into this thread's commit. Stage explicitly by path.

## Verified

- `outbound-rail-dedup.guard.test.ts` — **11/11 pass** (post-move). Asserts
  (among other things): `HeaderPinsSwitcher` renders unconditionally in
  `GlobalHeader` and never imports `useSavedViews`/`role="tab"`;
  `OutboundViewsMenu` is **not** in Band-1 `leading` and **is** in the Band-3
  `views` slot, adapting `WorkbenchViewsMenu` over `outboundSavedViewsConfig`;
  `OutboundViewsMenu`/`WorkbenchViewsMenu` never import
  `useQuickAccess`/`HeaderPinsSwitcher`. Placement is also pinned by
  `band3-views.guard.test.ts` (flush Bookmark icon, `views` slot after find) and
  `band1-house-chrome.guard.test.ts` (Views off Band-1 leading, house-wide).
- `header-pins-hotkey.guard.test.ts` (single ⌘/Ctrl+1–9 owner) — **4/4 pass**.
- `header-mode.guard.test.ts` (GlobalHeader zone contract) — **25/25 pass**.
- `tsc --noEmit` clean on every touched file.
- `eslint` clean on every touched file.
- `knip` — no dead-code findings on the new/changed files (confirmed
  `current-surface-saved-views.ts` was genuinely orphaned before deleting it).
- **Live-verified on `:3050` via Playwright + `tests/.auth/qa-admin.json`**
  (no credentials touched by the agent): two distinct controls, two different
  scopes — Pin in the GlobalHeader (website-wide), Bookmark "Saved views" on
  Band 3 right of the search field (page-wide). Opened both dropdowns
  independently: Pin → "Pin this page / No pins yet" only; Views → "No saved
  views yet… / Save current view" only. No cross-contamination. *(Original
  verification observed the Band-1 Star at `top:38`; re-verify against the
  Band-3 Bookmark after the move.)*

## SoT ruling added (the "never again" part)

New subsection in `source-of-truth.md` → **Left-edge occupant** → *A control's
SCOPE decides its home*:

- A comparison table: page-pin (website-wide, `useQuickAccess`, GlobalHeader,
  unconditional) vs. saved views (page-wide, `useSavedViews`, the page's own
  chrome).
- The rule, stated from the failure: **a control's home is decided by its
  scope, never by which button already exists nearby or which button's
  dropdown "has room."**
- Explicit bans matching the two wrong attempts this session made: never
  suppress/relocate/gate the website-wide page-pin for a page-scoped reason;
  never grow its dropdown a second tab for a page-scoped concern, even gated.
- Mirrored (shorter) into `AGENTS.md` (hard law) and
  `display/workbench-ops-queue.md` (Left slot + composition diagram).

## Open items / next steps

1. **Commit + push** — not yet done. Stage exactly the file list above (this
   thread's files only), commit, and push through the normal `npm run verify`
   pre-push gate — do not bypass it.
2. **Optional follow-up (not started):** port the same rail-less + Views
   pattern to other `ops-queue` desks if/when they grow saved views (Sales,
   Inbound). `isRaillessOrderFeedSurface` is written as the named extension
   point for this.
3. **Optional polish:** `OutboundViewsMenu`'s popover chrome
   (`AnchoredLayer` + `HeaderChromeMenu`) is hand-wired inline in the file
   rather than factored into a shared "page-scoped popover button" primitive.
   If a second page-wide control appears (e.g. a Catalog desk's own saved
   views), consider promoting the shell — but not before a second consumer
   exists (compose-before-grow).

## Reference

- Guard: `src/components/unshipped/outbound-rail-dedup.guard.test.ts`
- SoT: `.claude/rules/source-of-truth.md` → Left-edge occupant
- Constitution: `AGENTS.md` (hard laws section)
- Recipe doc: `.claude/rules/display/workbench-ops-queue.md`
