# Handoff — Global header search: no gray, no white/empty page, no `/search` results-list

## Goal (user's words, across 3 refinements)

1. Searching from the **global header search** must **never paint a gray background** — the
   only loading indicator is the pulsating bar in the search field (`SearchPendingBar`).
2. The empty `/search` body must **never paint a white/blank page** and **never a "Search
   everything" placeholder**. Amazon-like: type → results.
3. **There should be no `/search` results-list page at all.** The results list already lives
   in the header dropdown / ⌘K list; picking a result opens the entity detail
   (`/search?sel=order:…`). Scope decision the user chose:
   **"Detail only, drop the list"** — keep `/search?sel=…` (entity view), remove the blank
   landing AND the `/search?q=` browse list, remove the entry points that lead there
   (the header "Open search" `Maximize2` button, the dropdown "See all results" row, and the
   free-text `→ /search?q=` handoff). Dropdown/⌘K is the only results list.
4. **Verify on `http://localhost:3050` with a real order #** in the authenticated app.

## ⚠️ Why this is handed off — concurrent edit collision

Another session is **actively editing the same files** on the shared `main` lane:
`GlobalFindCombobox.tsx`, `GlobalSearchDropdown.tsx`, and
`src/components/search/search-find-stage.guard.test.ts`. Mid-task it **restored
`openSearchWorkbench` + the `Maximize2` "Open search" button** and rewrote the guard so it now
**requires** `openSearchWorkbench` (`search-find-stage.guard.test.ts:111
assert.match(combobox, /openSearchWorkbench/)`) — which directly conflicts with removing that
entry point. Do **not** keep fighting it on `main`.

**Recommendation:** finish this in a **dedicated worktree lane** (see
`.claude/rules/workflow-safety.md`) once the other session's search work settles, or coordinate
so one session owns the search-find files.

## What is already DONE + verified (safe, self-contained)

All verified on :3050 against the **QA org (org 2)** with real order
`QA-TEST-UNSHIP-PENDING-3` (id **7978**, `/search?sel=order:7978`):

1. **Gray → white shells.** `bg-surface-canvas` → `bg-surface-card` on the full-bleed `/search`
   shells so the resolve window is white, not gray:
   `SearchDetailWorkspace.tsx`, `SearchBrowseShell.tsx`, `src/app/search/page.tsx`
   (`SearchPageFallback`). Verified: 0/25 samples gray during resolve.
2. **Idle teach removed.** Deleted the "Search everything" `IdleTeachEmpty` from
   `SearchBrowseShell.tsx` (blank body when no `?q=`). Guard flipped to
   `assert.doesNotMatch(browse, /Search everything/)` + `/IdleTeachEmpty/`.
3. **Page redirect (no white page).** `src/app/search/page.tsx` `SearchPageContent`: with
   **no `sel` and no `q`**, `router.replace('/dashboard')` and render `null`. `?q=` deep-links
   still render `SearchBrowseShell` (back-compat).
4. **Dropdown "See all results" removed + 0-indexed nav.** `GlobalSearchDropdown.tsx` (dropped
   the See-all `<button>`, `idx = base + j`, removed `onSeeAll` prop + dead recents footer
   `View all recent searches` link + unused `Link`/`History`/`Search`/`FOOTER_LINK`).
   `GlobalFindCombobox.tsx` nav kept consistent: `optionCount = flatPreviewHits.length` (no +1),
   `navigateActive`/⌘Enter use `hits[activeIndex]`, free-text Enter opens the **best hit**
   (`commitHit(top)`) instead of `/search?q=`. `globalSearchHandoffHref` usage removed.
   **These two files are currently mutually consistent** but the concurrent session may
   re-diverge them — re-verify index parity before trusting keyboard nav.
5. **SoT prose updated:** `ui-design-system.md` (~L105) and `source-of-truth.md`
   (`/search` pending-chrome row) now say the empty body is blank, no "Search everything".

Guard `src/components/search/search-find-stage.guard.test.ts` was **passing 14/14** at last run
(note: it's being edited concurrently).

## What is LEFT to finish "drop the list" fully

The blocker to a clean finish is the **entry point that survives**: the header **`Open search`
`Maximize2` button** (`openSearchWorkbench` in `GlobalFindCombobox.tsx`) navigates to
`/search?q=` → renders `SearchBrowseShell` (the list). The concurrent guard requires it.

Two paths:

- **Path A (small, keep back-compat):** remove the `Maximize2` button
  (`GlobalHeaderSearch.tsx` pass `showOpenWorkbench={false}`; drop `openSearchWorkbench` +
  `openWorkbench` + `Maximize2` import in the combobox) and update the guard to **not** require
  `openSearchWorkbench`. Keep `SearchBrowseShell` mounted only for `?q=` deep-links (nothing in
  the UI routes there). Lowest blast radius. **Coordinate with the concurrent session first** —
  they just restored this on purpose.
- **Path B (full delete, big blast radius ~15 files):** delete `SearchBrowseShell.tsx` +
  `SearchResultsSurface.tsx`; make the page redirect for **all** no-`sel` (including `?q=`);
  move the `search:chrome`/`search:primary` paint marks into `SearchDetailWorkspace`; update
  every guard that READS those files:
  `search-find-stage.guard.test.ts`, `sidebar-search-bar.guard.test.ts`,
  `optimistic-url-param.guard.test.ts`, `rail-search-trailing.guard.test.ts`,
  `search-result-grid.guard.test.ts`, plus `src/lib/observability/tier1-paint-order.ts` (L94
  lists `SearchBrowseShell.tsx`) + its guard; shrink the knip baseline; delete
  `globalSearchHandoffHref` + its `search-hit.test.ts` cases if orphaned. Recents `scopeHref`
  (`searchRerunHref` → `/search?q=`) should rerun into the field, not the list.

Recommend **Path A** unless the user wants the `/search?q=` route physically gone.

Also decide **bare `/search` from nav:** if a "Search" nav row links to `/search`, the redirect
sends it to `/dashboard`. Preferable: that nav row focuses the header field instead. Check
`sidebar-navigation.ts`.

## How to test on :3050 (QA org / org 2, no PIN — I'm not allowed to type a PIN)

QA owner login (no PIN): `POST /api/auth/account/signin`
`{ "email": "qa-admin@cycleforge.test", "password": "CycleForge-QA-local!" }` → org
`…0002`. Real order: `QA-TEST-UNSHIP-PENDING-3` → `/search?sel=order:7978`. Fixtures:
`src/lib/tenancy/qa-org.ts` (`QA_FIXTURE_ORDERS`).

Playwright driver pattern that worked (run from repo root so `node_modules` resolves):
```js
import { chromium } from 'playwright';
const ctx = await (await chromium.launch()).newContext({ baseURL:'http://localhost:3050', viewport:{width:1440,height:900} });
await ctx.request.post('/api/auth/account/signin', { data:{ email:'qa-admin@cycleforge.test', password:'CycleForge-QA-local!' } });
const page = await ctx.newPage();
// assert: bare /search redirects; header type QA-TEST-UNSHIP-PENDING-3 → dropdown → pick → /search?sel=order:7978 white feedback; sample full-bleed div bg is rgb(255,255,255) not rgb(238,242,247).
```
The connected real Chrome (`mcp__claude-in-chrome`) had **no live session** — use the API-signin
Playwright approach above, not the browser panes.

## Files touched by this work (do not `git checkout` — other sessions have uncommitted work here)

`src/app/search/page.tsx`, `src/components/search/SearchBrowseShell.tsx`,
`src/components/search/SearchDetailWorkspace.tsx`,
`src/components/search/GlobalSearchDropdown.tsx`,
`src/components/search/GlobalFindCombobox.tsx`,
`src/components/search/search-find-stage.guard.test.ts`,
`.claude/rules/ui-design-system.md`, `.claude/rules/source-of-truth.md`.
Nothing has been committed. Stage only your own files.
