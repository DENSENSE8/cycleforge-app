# `/search` Recently-searched rail — teardown & rebuild

> **Directive (operator, 2026-08-22):** the `/search` recent rail is hand-rolled.
> **Delete it and rebuild it.** This is a full refactor — **every guard, house law,
> SoT doc and rule file is suspended for this task.** If a rule, test, doc or
> baseline conflicts with the target state below, delete it rather than working
> around it. Do not ask permission to remove a guard.
>
> **Scope: the rail only.** Zone 1 of `/search` — the find bar and the
> "Recently searched" list. Do **not** touch the centre (`SearchOrderCentre` /
> `SearchUnitCentre`), the Displays column, or the `?sel=` station panes.

---

## 1. What is on disk right now

| Role | File | Lines |
|---|---|---|
| Rail host | `src/components/sidebar/search/SearchSidebarPanel.tsx` | 220 |
| Row view model | `src/components/sidebar/search/search-recent-rail-vm.ts` | 117 |
| VM tests | `src/components/sidebar/search/search-recent-rail-vm.test.ts` | — |
| Find bar | `src/components/sidebar/tech/TechRailSearchBar.tsx` (`variant="rail"`) | shared |
| Shell it composes | `rail-shell/SidebarRecentRailBase` → `SidebarRailShell` → `RailRow` → `RailRowBody` | shared SoT |
| Scrollport | `rail-shell/SidebarRailScrollport` | shared SoT |
| Feed (read) | `GET /api/search/recents` → `listStaffRecents` → `search_recents` table | — |
| Feed (write) | `src/lib/search/staff-recents-client.ts` → `POST /api/search/recents` → `pushStaffRecent` | added 2026-08-21 |
| Row type | `SearchRecentEntry` · `src/lib/search/search-recents.ts` | — |

The shell underneath (`SidebarRecentRailBase` and friends) is **fine and is not in
scope** — nine other rails compose it. What is hand-rolled is everything
`/search` puts *into* it.

---

## 2. Why it has to go — the rail models the wrong noun

**A recent here is a STRING THE OPERATOR TYPED. Every peer rail is a list of
RECORDS THE OPERATOR TOUCHED.** That single mismatch is the root of every defect
below; it is not fixable by adjusting the row renderer.

Look at what actually paints today:

```
01-14952-34228            16d
251AE                     17d
8211985562918387          18d
085167P32554641AE         21d
806929-0020               21d
9400108106244325286212    21d
1ZY228K59085104384        23d
```

Bare tracking numbers, order ids and SKU fragments as the row **title**, with an
**empty second line**, and an age column counting *how long ago someone typed it*.
Compare `RecentActivityRailBase` (the Unbox rail): row title is a resolved PO /
carton identity, the second line carries quantity + tags, the status dot means a
workflow state, and the age is when the **record** last moved.

### 2a. The row identity is a hash of a string

`searchRecentRowId` (`search-recent-rail-vm.ts:14-25`) folds the entry's uuid to a
positive int because the shell's `getId` returns `number`. Its own comment
concedes collisions "only cost a highlight". A rail whose identity is a hash of a
typed string has no identity.

### 2b. Selection is parsed back out of a persisted URL

`searchRecentSelection` (`:31-38`) takes `topHit.href` / `scopeHref`, runs
`URLSearchParams` over it and reads `?sel=`. **A stored route snapshot is the
selection source of truth.** Consequences, all live:

- Only rows whose stored href already carried `?sel=order:` can open a station.
  A recent that resolved to a unit, carton or SKU re-runs the query instead.
- Any future route change silently orphans every historical row — no error, the
  row just stops opening anything.

The durable facts (`entityType`, `entityId`) exist at write time and are thrown
away in favour of a string.

### 2c. The second line is empty, and that is now correct-but-useless

`searchRecentMeta` (`:57-62`) returns the typed query when a `topHit` exists,
else `null`. It used to fall back to `entry.scopeLabel`, which painted the literal
word "Search" under all 89 dogfood rows; that fallback was **correctly deleted on
2026-08-21**. But nothing replaced it, and no legacy row has a `topHit` — so the
second line is blank for the entire live feed. The screenshot above is the result.

### 2d. The age column answers the wrong question

`getActivityAt={(row) => row.timestamp}` (`SearchSidebarPanel.tsx:191`) is the
*search's* timestamp. `16d` means "you typed this 16 days ago", not "this record
last moved 16 days ago". On a warehouse rail that reads as staleness of the
record, which is a lie.

### 2e. Two stores for one job

| Store | Written by | Read by | Scope |
|---|---|---|---|
| `search_recents` (Postgres) | `staff-recents-client.ts` (restored 2026-08-21) | the `/search` rail | per staff, per org |
| `cf_search_recents_v1` (localStorage) | `useSearchRecents` | the header dropdown (`SearchRecentsDropdown`) | per browser |

Until 2026-08-21 `POST /api/search/recents` had **zero callers** and the DB store
had no writer at all — the rail could only ever paint rows a deleted code path
left behind. The writer is restored, but there are still two stores that can
disagree, with two different lifetimes. **Pick one and delete the other.**

### 2f. The find bar wears the column-FOOTER face

`TechRailSearchBar variant="rail"` resolves `STATION_COLUMN_FOOTER_BAND_FACE`
(`TechRailSearchBar.tsx:327`) — `h-8` + `border-t`, a floor seam — and mounts it
at the **head** of the column, drawing a hairline against the GlobalHeader.
`flush` is silently inert on that variant: `chromeFlush = chrome && flush`
(`:241`), and `chrome` is `variant === 'chrome'` (`:240`).

**Trap:** the obvious fix (`variant="chrome"`) is what once took the full 860px
rail height and squashed the recents scrollport to zero — that variant is `h-full`,
built for a horizontal band. If you switch it, wrap it in a `shrink-0` host and
verify the geometry in a real browser.

### 2g. The feed never wakes on domain change

`SidebarRecentRailBase` accepts `refreshEvents`, `refreshDomains`, `updateEvent`,
`deleteEvent`; the panel passes **none** of them (`SearchSidebarPanel.tsx:178-216`).
`RecentActivityRailBase.tsx:277-281` threads all four. Today the only wake is an
explicit `invalidateQueries` after a write.

---

## 3. Target state

Build a rail of **records the operator recently opened**, not strings they typed.

**Non-negotiable:**

1. **Delete `search-recent-rail-vm.ts` and its test.** No hash-folded ids, no
   href parsing, no string-derived identity survives.
2. **The row is a resolved entity.** Persist `entity_type` + `entity_id` at write
   time and key the row on them. `?sel=` is then *built* from those two fields —
   never parsed back out of a stored URL.
3. **One store.** Choose `search_recents` (per-staff, per-org, survives a browser
   change — the better one) or localStorage, migrate the other's readers, and
   **delete the loser**, including its route handlers, hooks and helpers. Leaving
   both is the current defect.
4. **Row anatomy matches its peers.** Title = the record's identity (product /
   PO / serial), second line = the record's own facts, status dot = a real state,
   age = **the record's** activity, not the search's.
5. **A query with no record still belongs.** An operator who searched and found
   nothing should see that as a distinct, quieter row — not as a bare identifier
   pretending to be a record.
6. **Thread the wake props** (`refreshDomains` at minimum), like every peer rail.

**Keep:** `SidebarRecentRailBase` / `SidebarRailScrollport` / `RailRow` /
`RailRowBody` — the shared shell is correct and nine rails depend on it. Grow it
if it is wrong; do not fork it.

**Keep working** (all landed 2026-08-21, do not regress):
- exactly **one** age render per row — the shell's age column, never a second
  `metaTrailing` formatter
- **no** floating note composer and no `pb-16` clearance — the rail is two bands
- `navRegionId="left"` so the keyboard can walk the rail
- `staff-recents.ts`'s `toEntry` re-resolves `scope_label` on read; never trust
  the persisted column

---

## 4. Reference

`src/components/sidebar/receiving/RecentActivityRailBase.tsx` is the rail to copy
the *shape* of — row identity, peek facts, status semantics, refresh wiring.
Peers worth a look: `PackRecentPacksRail`, `ShippingStaffScanHistoryRail`,
`LabelsRecentRail`.

---

## 5. Verification

`npm run verify` (lint · typecheck · unit) must be green.

**A dev server runs on `:3050` and belongs to the operator — attach, never start
or restart it.** Check the live surface at:

```
http://localhost:3050/search
http://localhost:3050/search?sel=order:12445
```

`tests/e2e/search-station-layout.spec.ts` holds the rail's layout contract:
`boxes.length === 2` (find bar · recents — a third child means a dock crept back),
`find.h < 80` (the `h-full` regression guard), `recents.h > 300`, and a
one-age-per-row spec. **E2E needs the QA org, not the dogfood tenant**
(`pnpm provision:qa-org`, then `--project=qa-desktop`).

If the rebuild changes the rail's band count or row anatomy, **rewrite those
specs to the new contract** — do not weaken them to pass.

---

## 6. Housekeeping

- Work on `main`. Do not create a branch. Do not `git stash`.
- **Another session is active in this tree** — stage only the files you touched;
  `git add -A` will sweep someone else's work into your commit.
- Docs to update when done: `docs/rules/display/search-station.md` (Zone-1 table
  and the rail rulings). Delete any rule there that the rebuild makes false —
  that is explicitly authorised.
