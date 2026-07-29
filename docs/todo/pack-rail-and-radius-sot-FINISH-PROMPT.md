# Pack sidebar rail + Corner-radius SoT — FINISH PROMPT

Hand-off for two threads worked together on `main` (dogfood lane), 2026-07-28.
Both are **functionally complete**. What remains is a commit, and a set of
explicitly-deferred decisions. Nothing here is half-built.

> ⚠️ **The work straddles a commit boundary.** A parallel session committed
> `78b6e61c8 refactor(refresh)` and friends, which swept
> `src/components/station/StationPacking.tsx` (and the
> `PackerPhotoRequestStatus.tsx` deletion) in with it. That file is now
> **tracked and clean**; everything else below is still uncommitted. If you
> `git checkout` the uncommitted files, `StationPacking` is left with a
> `railSlot`/`railFooter` prop nothing passes. Commit or revert them together.

---

## Thread 1 — Pack sidebar recent-packs rail

**Ask:** `/pack`'s sidebar showed a single "Active order" card; it should show a
history of recently packed orders, with the right pane crossfading table →
active order (the Unbox pattern).

**Done:**
- `PackRecentPacksRail` composes `SidebarRecentRailBase` (same shell as
  Unbox/Triage/Testing/Shipping). Packing was the last station without a rail.
- Rows come from `usePackerLogs(packerId, { weekRange })`, so the rail shares
  the page's prefetched `packer-logs` cache with the History table and inherits
  its Ably + `packer-log-added` live patches — no second query.
- Selection dispatches `pack-active-order-changed`; the **already-existing**
  `PackOrderWorkspace` crossfade does the rest. Verified live: 25 rows, click →
  `PackOrderPanel`.
- Rail filter bar wired (`TechRailSearchBar` in a new `railFooter` slot).
  Verified: 25 → 4 on "soundbar" → 25 cleared.
- Phone photo-request **readouts** removed from the sidebar. The request is
  still published on a unit scan and the toast still confirms it.
  `PackerPhotoRequestStatus.tsx` deleted (single consumer).
- History empty state fixed — two stacked bugs:
  1. `PackerTable` passed the **Home task-inbox** empty (`ContextualEmptyState
     state="no-work"` → "No work assigned") as `firstRunEmpty`. It also
     suppressed the shell's "back to this week" reset button, which only renders
     on the `emptyMessage` branch. History is week-scoped ⇒ an empty week is a
     no-results state, not a first run. `firstRunEmpty` removed.
  2. That exposed a duplicate: `PackKpiStrip`'s `HistoryStrip` swapped its tiles
     for a *second* "No packs in this week" banner at zero. Tiles now render at
     0 and the table owns the single empty line.
- Removed the panel's dead `todayCount`/goal fetch (a redundant 100-row
  `/api/packerlogs` call per mount — it only fed the `!embedded` goal bar). That
  orphaned `getStaffGoalById` in `staffGoalsCache.ts`, which was deleted.

**Non-obvious gotcha (pinned in code):** `packer_logs.id` is **NOT unique per
`station_activity_logs` row** — the dual-link path attaches a unit-QR scan to
the active order's packer log, so two rows share one `packer_log_id`. Rail row
ids must be `sal.id` (`packerRecordRailId`); pane→row selection resolves by
*finding* the row whose `packer_log_id` matches. Keying rows by the log id
produced duplicate-React-key warnings.

### ⚠️ Cross-session risk — READ THIS
The parallel session's `refactor(refresh)` commit is migrating
`window.addEventListener('app-refresh-data')` → `useRefreshSignal(...)` from
`@/lib/refresh/bus`. **`usePackerLogs` now has a second consumer** (the rail, on
top of the History table). If `app-refresh-data` / `packer-log-added` are retired
without updating `usePackerLogs`, the rail *and* the History table stop
refreshing live on a scan. Confirm that hook was covered by the migration.

---

## Thread 2 — Corner-radius single source of truth

**Ask:** pin corner radius to one design-system source. User's constraint,
verbatim: *"this is a UX big change and must be updated slowly to double
checked."* Honoured — **no call-site sweep was done.**

**Root cause found:** `tokens/radii.ts` defined an 8-step scale, emitted it as
`--ds-radius-*` CSS vars… and **nothing consumed it**. `tailwind.config.ts` never
extended `borderRadius`, so every `rounded-*` class resolved to Tailwind stock —
which sat **one step below** the token of the same name (`radii.lg` 12px vs
`rounded-lg` 8px). Any comment pairing a token name with a class name was ~4px
wrong. `station-context-action-pill.ts` did exactly that.

**Steps 1–4, all landed (near-zero pixels moved):**

| Step | What |
|---|---|
| 1 | Renamed `radii.ts` → `radius.ts` (user calls `radii` a typo). Values realigned to Tailwind stock. Dead `--ds-radius-*` emission removed from `css-variables.ts` (zero readers — the same cleanup `spacing` already had). |
| 2 | Role layer: `cornerClass(role)` for `flush\|chip\|row\|control\|field\|card\|canvas\|pill` (0/4/6/8/12/16/24/full) + `nestedCorner(outer, padStep)` / `nestedCornerClass`. Mirrors `elevationClass(role)` / `focusRing(archetype, tone)`. `radius.test.ts`, 8 tests. |
| 3 | Deleted `tailwind.config.ts` `borderRadius.station: '8px'` + migrated its 2 `InstallPrompt` call sites. Radius scale is now **100% stock**. |
| 4 | Station photo + claim pills → `cornerClass('pill')`; `InstallPrompt` container → `cornerClass('field')`. Added `radius-tokens.guard.test.ts`. |

**Step 3 fixed a real bug, not just a duplicate.** `rounded-station` was an
unregistered class group in `cn()` — twMerge could not tell it was a radius, so
it never cancelled a primitive's own `rounded-*`; both survived and CSS order
picked silently. Proven:

```
BEFORE: h-9 gap-1.5 rounded-xl px-3.5 flex-1 rounded-station border   ← both survive
AFTER:  h-9 gap-1.5          px-3.5 flex-1 rounded-lg      border   ← rounded-xl cancelled
```

**The guard** (`radius-tokens.guard.test.ts`, runs in `verify` via
`src/**/*.test.ts`):
1. Arbitrary-radius ratchet — shrink-only per-file map, **12 sites / 8 files**,
   `ds-allow-radius` same-line escape. Also fails if a baseline is too *high*.
2. Keystone — fails if anyone re-adds `theme.extend.borderRadius`.
3. Keystone — pins all 8 role→class mappings and that `nestedCorner` only
   returns roles that have a class.

Its regex catches **side variants** (`rounded-t-[28px]`) that a `rounded-\[`
grep misses — that is how the true count turned out to be 14, not 13.

---

## ⛔ Do NOT do these (decided, with reasons)

- **Do not sweep the ~3,900 `rounded-*` call sites.** They are correct and are
  not bugs to fix on sight.
- **Do not wire `radius.ts` into `tailwind.config.ts`.** It would remap every
  call site at once and rescale the whole app.
- **Do not "fix" radius inside shared primitives** (`TextField`, `RailRow`,
  `IconButton`, `SlicedActionDock`). A primitive's ideal radius depends on
  whichever host it sits in, so setting it there just moves the delta to every
  other call site. User chose "host-side only" for this reason.
- **Do not trust a naive concentric-radius audit.** See below.

### Concentric radius — the rule has TWO preconditions
Learned expensively: a naive `ideal = outerR − gap` audit produced four bogus
worklists this session, and one change made off it (`PoLineRow` 12→16px) had to
be reverted because it broke the row's relationship to its *outer* card while
fixing its inner one. A box that is both container and content sits in a
**chain** — solve the whole nesting path or leave it.

1. **Corners must interact** — both insets at a corner must be `< outerR`. If
   padding ≥ the outer radius, the arcs are geometrically independent and any
   inner radius is fine. **89% of flagged "violations" were this.** It once told
   me to square off a card, which would have been a visible regression.
2. **Inner must be corner-nested with near-uniform inset** — not a mid-stack
   list row, not a full-bleed band. This is why all 25 sidebar rail rows flagged.

With both guards: unbox + pack audit **0 findings at 8px**; 3 remain at 1px
(3–5px, inside `IconButton` / `SlicedActionDock`) — deliberately left.

The corrected audit script lives only in this session's scratchpad. If it is
wanted long-term it needs promoting to `scripts/` — it is a manual tool (needs a
running dev server + auth), **not** a CI gate.

---

## Verification state

Green for everything in this work: **typecheck 0 errors**, `radius.test.ts` +
`radius-tokens.guard.test.ts` **11/11**, station-workbench / surface-box /
spacing / typography guards pass, changed files lint clean.

**`npm run verify` does not go fully green, and none of it is from this work:**

| Gate | Owner |
|---|---|
| Lint (4 unused-import errors) | parallel session's `refactor(refresh)` — `PackerDashboard`, `dashboard-sidebar-hooks`, `useRepairs`, `useWorkOrderAssignment` |
| Unit tests / Typecheck (intermittent) | verify raced live edits; both pass standalone on a settled tree |
| Dead-code (knip) | parallel session's untracked files (`SidebarNavList.tsx`, `useSidebarPin.ts`, `src/lib/routing/*`) |
| Route-permission drift | pre-existing untracked `/api/kiosk/dev-autopair` |

**Re-run `npm run verify` on a quiet tree before committing** — that was never
possible during this session.

One baseline edit to be aware of: `knip-baseline.json` has **one line renamed**
(`radii.ts|Radii` → `radius.ts|Radius`), carrying an already-accepted entry
through the rename. The count is unchanged; no baseline was raised.

---

## Files

**Committed already** (swept into the parallel session's commits):
`src/components/station/StationPacking.tsx` · deletion of
`src/components/station/PackerPhotoRequestStatus.tsx`

**Uncommitted — modified:**
`knip-baseline.json` · `tailwind.config.ts` ·
`src/components/PackerTable.tsx` · `src/components/packer/PackKpiStrip.tsx` ·
`src/components/sidebar/PackerSidebarPanel.tsx` ·
`src/components/station/InstallPrompt.tsx` ·
`src/components/station/entity-context/station-context-action-pill.ts` ·
`src/components/station/packer-record-mappers.ts` ·
`src/design-system/primitives/Panel.tsx` (comment only) ·
`src/design-system/tokens/css-variables.ts` ·
`src/design-system/tokens/index.ts` · `src/lib/staffGoalsCache.ts` ·
`src/design-system/tokens/radii.ts` → `radius.ts` (rename + rewrite)

**Uncommitted — new:**
`src/components/sidebar/packer/PackRecentPacksRail.tsx` ·
`src/components/sidebar/packer/pack-record-rail-vm.tsx` ·
`src/design-system/tokens/radius.test.ts` ·
`src/design-system/tokens/radius-tokens.guard.test.ts`

*(`src/components/packer/PackActiveIdentityChips.tsx` and
`pack-listing-identity.ts` are pre-existing untracked files — only an unused
`export` keyword was dropped in each, to clear knip.)*

---

## Next actions

1. Confirm `usePackerLogs` was covered by the `refactor(refresh)` migration
   (see the cross-session risk above). **Highest priority — silent breakage.**
2. `npm run verify` on a quiet tree; expect only the parallel session's items.
3. Commit thread 1 and thread 2 separately — they are independent.
4. Optional, only if wanted: promote the corrected concentric audit to
   `scripts/`; migrate more surfaces to `cornerClass` one at a time with a
   screenshot each.
