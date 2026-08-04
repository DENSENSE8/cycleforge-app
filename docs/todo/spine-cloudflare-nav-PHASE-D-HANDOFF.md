# Handoff — MasterNav spine PHASE D, executed: the measurement, the fallback, and the two operator redirects

**For:** the next implementing agent (Grok / Codex / Cursor / Claude Code)
**From:** the Phase D session
**Date:** 2026-08-03
**Predecessors:** [`spine-visual-language-HANDOFF.md`](spine-visual-language-HANDOFF.md) (A + C, shipped) ·
[`spine-vocabulary-phase-b-HANDOFF.md`](spine-vocabulary-phase-b-HANDOFF.md) (B, **committed** `e627e3d3e`) ·
[`spine-cloudflare-nav-HANDOFF.md`](spine-cloudflare-nav-HANDOFF.md) (D, the brief this executes)
**Status:** code complete, guards green (64/64), **but the geometry probe has NOT been re-run since the last two
changes** — that is your first job and it may fail. See §1.
**Lane:** `main` checkout, no ad-hoc branch. Attach to `:3050`. **User owns commits — nothing here is committed.**

**Paste for a new session:**

```
Read docs/todo/spine-cloudflare-nav-PHASE-D-HANDOFF.md and execute §1 first, then stop and report.

Everything in this doc is UNCOMMITTED and sits on top of ANOTHER uncommitted phase
(§2). Do not redo either, and do not revert them while cleaning up.

§1 is the open risk: the spine grew a section header row and lost its eyebrow
AFTER the last geometry measurement, so the ceiling budget in
tests/e2e/sidebar-open-close.spec.ts may now fail. MEASURE before you touch
anything else, and never raise the budget to make it pass — it ratchets down.

Attach to :3050; never start/restart/kill the dev server. npm run verify before done.
```

---

## 0. What this phase was asked to decide, and what it decided

The operator said the spine's trailing numbers "seem like a notification display — it's distracting", and
pointed at Cloudflare's nav as the target shape. The brief's §4 made the whole phase conditional on a
**measurement**: two-line rows roughly double row height, and the map was already thought to be tight.

**The measurement was taken, in the real runner, and it ruled against the two-line pattern.** The brief's
§4.3 fallback shipped instead. Then the operator redirected twice mid-session (§5) — those redirects are
also implemented, and they are the least-verified part of this tree.

---

## 1. ⚠️ DO THIS FIRST — the probe has not seen the last two changes

`tests/e2e/sidebar-open-close.spec.ts` carries a geometry probe (added this phase) with a **shrink-only
per-route budget** for rows that fall below the fold:

```ts
{ name: 'floor — no page expanded',        route: '/reports',  belowFoldBudget: 0 },
{ name: 'ceiling — Catalog, 7 children',   route: '/products', belowFoldBudget: 1 },
```

Those budgets were calibrated against a measured run. **Two changes landed after that run and neither has
been measured:**

1. The Scan Stations **eyebrow** (`px-2 pb-0.5 pt-1`, ~22px) became a **section header row**
   (`px-2 py-1.5`, ~30px). That is **roughly +8px of map**, in the section that sits FIRST.
2. `SpineTopPins` moved into the 40px band. This should cost the map **nothing** — the band is outside
   the scrollport — but that is a prediction, not a measurement.

The ceiling had **47px of overflow and exactly 1 row below the fold** before those changes. +8px does not
obviously cross a row boundary, but it is within noise of doing so.

```bash
npx playwright test tests/e2e/sidebar-open-close.spec.ts --project=desktop --reporter=list
```

**If the ceiling now reports 2 rows below the fold, do NOT raise `belowFoldBudget`.** Baselines only shrink
(`.claude/rules/verify.md`). The honest fixes, in order of preference:

- **Default Scan Stations to COLLAPSED when it does not own the active page.** The state and the control
  already exist (`collapsedSections` in `SidebarNavList`); only the initial value would change. This
  reclaims eight rows on every non-bench page and is the reason the section was made collapsible at all.
- Tighten the section-header row to `py-1` so it costs what the eyebrow did.
- Report it and leave it — 47px of scroll on the single widest page is a different order of problem from
  the 335px the two-line pattern would have cost everywhere.

---

## 2. ⚠️ You are standing on TWO layers of uncommitted work

Nothing below is committed. `e627e3d3e` (Phase B) is the last commit.

**Layer 1 — the previous session's Phase D prep** (described in `spine-cloudflare-nav-HANDOFF.md` §1):
Scan Stations moved first in `SPINE_SECTIONS`; `sectionDrawsHeader()` added; Home/Search/Media/Chat left
the spine; the org band deleted (band kept, empty); guards rewritten.

**Layer 2 — this session.** Files touched:

| File | Change |
|---|---|
| `SidebarNavList.tsx` | count badge deleted · nesting rail on child rows · collapsible section header · `data-spine-scrollport` probe handle |
| `SpineTopPins.tsx` **(new)** | Home · Search · Media · Chat, moved from `HeaderTopPins.tsx` (**deleted**) |
| `MasterNavView.tsx` | the empty 40px band now hosts `SpineTopPins` |
| `GlobalHeader.tsx` | `HeaderTopPins` unwired + a comment saying why it must not come back |
| `main-nav-groups.guard.test.ts` | 3 guards rescoped, 1 guard added (no-badge) |
| `station-nav-groups.guard.test.ts` | eyebrow/subgroup rationale updated |
| `tests/e2e/sidebar-open-close.spec.ts` | §1 fallout fixed · geometry probe added |
| `.claude/rules/source-of-truth.md` | queue-depths row re-argued |

**Guards: 64/64 green. Typecheck: clean.**

---

## 3. The measurement — the phase's most durable artifact

Real runner, `--project=desktop`, 1440×900. **Not modelled** — every previous number in this phase's
lineage was `rows × an assumed row height`, and two of the three assumptions were wrong.

| | floor (`/reports`, nothing expanded) | ceiling (`/products`, Catalog + 7 children) |
|---|---|---|
| port height | 685px | 685px |
| map content | **562px** | **732px** |
| headroom | +123px | **−47px** |
| rows | 17 | 24 |
| page row / child row | 30px / 24px | 30px / 24px |
| two-line row (measured) | 42px → **+12px/row** | 42px → **+12px/row** |
| **projected all-two-line** | **766px (overflows by 81)** | **1020px (overflows by 335)** |
| below the fold | 0 | 1 (`Support`) |

**Three corrections to the brief's modelled numbers, all of which mattered:**

- The port is **685px, not ~558px**. The brief under-measured it by 127px.
- The map is **562px at the floor**, not 737px — the brief's 737 was really the *ceiling* (measured 732),
  so it had accidentally modelled the worst case as the resting case.
- A two-line row costs **+12px, not +14–16px**, because the second line is `role-micro`.

**And the brief's headline prediction was right anyway:** it guessed the two-line map would land "near
1000px". Measured: **1020px**. That is the number that killed the pattern.

**How the two-line cost was priced:** by rendering one and measuring it, not by assuming. The spine's
search-results list *already* draws the exact target pattern (bold label over a muted parent line), so the
probe types a query and measures a real result row. It deliberately measures one that **has** the second
line — `contextFor()` returns `null` when the parent would merely repeat the label, and an earlier version
of this probe measured one of those and priced a two-line row at +6px, which was wrong by half.

**73 of 81 destinations carry a context line** (`buildNavDestinations` over the live registry), so
"every row gains a line" is the honest model, not a worst case.

---

## 4. What shipped (brief §3 + §4.3)

### §3 — the trailing count badge is deleted

The operator's read was correct. A right-aligned pill of digits is the universal *unread work* affordance;
ours meant **structural cardinality** — how many child pages a page has — which never changes and is
learned once. It was spending the loudest slot in the column on the least urgent thing on the row.

**The cardinality is not lost.** It moved to `aria-label` ("Catalog — 7 pages"), where a screen reader
needs it and nothing competes for attention. Guard: *"no trailing count badge; cardinality moves to the
accessible name"*, which pins **both** halves — the badge's absence and the accessible name's presence.

### §3.2 — the SoT row that depended on the badge

`source-of-truth.md` → *Per-staff queue depths* argued that live depths belong in `InboxQueueLinks` partly
because **the spine's trailing slot was already taken**. Deleting the badge vacated that slot and retired
that leg. The row now rests on the one leg that survives, and says so plainly:

> `nav-search.ts` re-ranks the whole registry on every keystroke, and that is safe *only* because the
> registry does no I/O — a live depth on a nav row makes navigation depend on a query.

It also records, deliberately, that **the spine is now MORE hospitable to a depth badge than when this was
first ruled** — the slot is empty and the shape is free — and that a future reversal must argue the I/O
point, not merely notice the vacancy. Two of the original three legs are dead; hiding that would leave the
next agent defending a ruling on reasons that no longer exist.

### §4.3 — the fallback, and what was deliberately NOT taken

Shipped: **counts removed** · **left nesting rail** (a border, so it costs no height) · rows **stay
single-line**.

Not taken, with reasons:

- **Two-line rows** — 1020px against a 685px port. This is the whole §4 ruling.
- **"Tighter/quieter type"** — the spine type ladder is a committed ruling (`source-of-truth.md` →
  *MasterNav spine type ladder*, bumped off an all-12px spine on 2026-08-02 for measured legibility
  reasons). Re-tightening it would silently reverse that.
- **A chevron on the section header** was originally out of scope for the fallback — until the operator
  asked for exactly that (§5).

**The rail is drawn per row, not per group,** and that is deliberate: child pages arrive inside a `<ul>`,
but station-subgroup members arrive as flat siblings of every other page in the section, so there is no
element wrapping only them. Adjacent rows carry no vertical margin, so per-row segments abut into one
continuous line in both shapes; the active row's segment darkens. The row fill starts *inside* the rail so
a hover wash cannot swallow the line.

---

## 5. The two operator redirects (mid-session) — the least-verified work here

### 5.1 Scan Stations is a "top drill", like Locations

> *"just like the locations, its a top drill update the same thing for scan stations"*

`Locations` is a page row whose 5 children nest under it. Scan Stations was an **eyebrow** over 7 benches.
It is now a **collapsible section header** — glyph + label + disclosure chevron.

**This is not the deleted drill coming back, and the distinction is the whole reason it is allowed.** The
2026-08-02 flatten deleted a header you *entered*, which charged a click to reveal a row carrying the
section's own name (`Catalog › Catalog`). This one **navigates nowhere**: it toggles `aria-expanded` on the
block beneath it. A section is still not a place. The guard pins that — `renderSectionRow` must not contain
`onNavigate`.

It also still draws **only** through `sectionDrawsHeader`, so it is Scan Stations alone (7 benches, none
called "Scan Stations"). Over `Catalog` it would reprint the duplicate the flatten removed.

Constraints honoured:
- The **Receiving subgroup header stays** — firmly pinned by `station-nav-groups.guard.test.ts`, and on the
  same predicate ("does the name ADD something?").
- The chevron is a **rotated `ChevronDown`**, never a `ChevronRight` swap — the drill's back/forward
  chevrons are banned by guard, and a rotation reads as one control changing state.
- The rotation is `motion-safe:`, because the framer `MotionConfig` floor governs `motion.*` only and
  cannot see a Tailwind transition.

**Default is expanded**, and see §1 — flipping that default is the cheapest fix if the ceiling now fails.
State is session-scoped (`SidebarNavList` stays mounted across in-app jumps; it resets on a hard reload,
the same lifetime `navOpen` has). If the operator wants it durable, that is a `staff_preferences` change,
not a localStorage one.

### 5.2 Home · Search · Media · Chat moved into the spine's 40px band

> *"move the icons home, search, media, and chat to the top header bar above the scan stations"*

They were already in the GlobalHeader (Layer 1 put them there), so this was ambiguous and was **asked**.
The operator chose the **spine's own 40px top band** — the strip left empty when `OrgWorkspaceControl` was
deleted, which sits directly above Scan Stations.

**The cost was stated before the choice and was accepted:** `ResponsiveLayout` holds `navOpen` in an
unpersisted `useState(false)`, so the spine is closed on every cold load and these four are not on screen
until it is opened. That is the exact reachability argument that put them in the header hours earlier.

**What makes the band the right home anyway:** its height is the header seam, not content — so as icons
they cost the map **nothing**, where as rows they cost it 137px.

`HeaderTopPins.tsx` was **deleted, not left beside its successor** (a fork whose doors are both imported is
invisible to knip). The component is `SpineTopPins` — named for the job, not the birthplace, the same
correction `StationComposerDock` → `OmnichannelComposerDock` got. Guard pins **one** home: present in
`MasterNavView`, absent from `GlobalHeader` and `GlobalHeaderActions`.

---

## 6. Guards changed — read this before "fixing" one

Four guards were **rescoped rather than deleted**. Each was correct about what it protected and wrong only
about how widely it swept:

| Guard | Was | Now |
|---|---|---|
| child row keeps `pl-7` | pinned the indent literal | pins the **rail** (`ml-4 border-l`) + the active-segment contrast. Same contract: a child row is visibly inset by something that survives greyscale. |
| type ladder pins `tabular-nums` | pinned the badge's own type | the rung is **gone**, not resized — its absence is pinned by the new no-badge test |
| "no accordion" bans `ChevronDown` / `aria-expanded` file-wide | file-wide | scoped to **`renderPageHeader`**. A page row is not an accordion — clicking it navigates. A *section* is the opposite case: not a destination, so a fold-only control is the honest affordance. File-wide would have banned the one place the chevron belongs. |
| "no transform travel" bans `rotate-` file-wide | file-wide | `translate-` / `scale-` stay banned outright (both move a **row**). `rotate-` is allowed in exactly one shape, asserted by exact match: `['-rotate-90']`. A chevron facing its own state is not travel — nothing changes position. |

One guard was **added**: no trailing count badge, and cardinality present in the accessible name.

---

## 7. Verify — and what is red that is NOT yours

```bash
npm run verify
npx playwright test tests/e2e/sidebar-nav-search.spec.ts tests/e2e/sidebar-open-close.spec.ts tests/e2e/cmdk-palette.spec.ts --project=desktop
```

Last full E2E run before the §5 redirects: **26/26 passed.** Guards after the redirects: **64/64.**

**Pre-existing red, confirmed against a baseline captured before this session touched anything:**

- **Doc catalog drift** — caused by another session's new
  `docs/todo/scan-station-procedure/HANDOFF-step1-photo-capture.md`. `.claude/rules/` is not catalogued at
  all, so the `source-of-truth.md` edit here cannot cause it. **Do not run `portfolio-sot-sync.mjs` and
  commit the result** — that sweeps another session's pending doc into your change. (This session ran it to
  identify the cause, then restored the file.)
- **knip / typecheck / unit tests flapped red and green mid-session** on `OrdersGridView.tsx`,
  `WorkbenchTrailingCluster`, `usePackerOrderPane.ts`, and a `PackActiveIdentityChips.tsx` that was deleted
  *while ESLint was reading it*. All of it is another session's grid-column and packer work. It was green by
  the end. **Re-check what is still live before you start; report pre-existing failures rather than
  inheriting or fixing them.**

**Environment notes that cost time here:**

- The **dev server on `:3050` died mid-session and came back on its own.** Never start, restart, or kill it
  — a broken dev server is a thing you report. If Playwright reports `ECONNREFUSED ::1:3050`, check
  `lsof -nP -iTCP:3050 -sTCP:LISTEN` before concluding anything about the code.
- `grep` is aliased to **`ugrep`, which serves a stale cache**. Use `rg` for anything that drives an edit.
- The Browser pane has **no authenticated session**; do not try to sign it in. For a visual check, drive
  Playwright with `tests/.auth/admin.json` as `storageState`.

---

## 8. Out of scope — say no to these

- **Re-litigating the two-line row pattern** without a new measurement. The numbers are in §3; a
  counter-argument needs its own run, not an opinion.
- **Raising `belowFoldBudget`** to land a layout change. It ratchets down.
- **Putting a live queue-depth badge in the slot the count vacated** (§3.2) — separate ruling, real per-render
  I/O cost, and it must not ride in on a presentation change.
- **Re-adding Home/Search/Media/Chat to the GlobalHeader** while `SpineTopPins` exists. One home.
- **A section header for a section that fails `sectionDrawsHeader`** — that reprints `Catalog › Catalog`.
- **Making the section header navigate.** It discloses. A section is not a place.
- **Deleting the 40px spine band** — it is the top-chrome seam that puts the spine's hairline on the
  header's Y, and it now has content besides.
- **Re-tightening the spine type ladder** to buy vertical space (§4.3).

---

## 9. Still open

- **§1 — re-measure.** The only blocking item.
- **The ceiling overflows by 47px even at rest** (1 row below the fold on `/products`). Pre-dates this
  phase. The collapsible section is the lever that can close it; defaulting Scan Stations collapsed when it
  does not own the active page would reclaim eight rows.
- **Collapse state is session-scoped.** Durable would be `staff_preferences`, not localStorage.
- **The brief's §5 hover quick-nav on the sidebar toggle was NOT built**, per its own recommendation. Three
  objections stand: it would undo the reachability reason the icons moved; hover alone is
  keyboard-unreachable; and that corner already owns a 2-second left-edge dwell that opens the spine — two
  answers to one gesture in one corner. Revisit only after the edge-dwell collision is resolved.
- **No screenshot of the final state exists.** The visual check was blocked first by an unauthenticated
  browser pane and then by the dev-server outage, and the last E2E run predates the §5 redirects.
