# HANDOFF — Child rail alignment, the ⌘K leak, and the mobile-first port ladder

**For:** a fresh-context coding agent. Paste this whole file as the prompt.
**Written:** 2026-09-14, at the end of the session that landed N6c → N6g.
**Predecessor:** [`sidebar-lane-parents-shadcn-HANDOFF.md`](./sidebar-lane-parents-shadcn-HANDOFF.md)
(S1–S5 landed; **S6 is still open** — see §6).
**Ledger of record:** [`docs/todo/nav-lanes-reports-IA-PLAN.md`](../todo/nav-lanes-reports-IA-PLAN.md)
§1b.-1 — every increment below is recorded there with its proof. Read that ledger
before you touch a registry; it is the run log, not a plan.
**Binding law:** [`AGENTS.md`](../../AGENTS.md) › *Sidebar spine* ·
[`docs/mobile-first/SURFACE_LAW.md`](../mobile-first/SURFACE_LAW.md) · design-mcp
before/after any `src/**/*.{tsx,jsx,css}` write.

---

## 0. Do these four things, in this order

> **STATUS 2026-09-15 — tasks 1, 2 and 3 are LANDED (one increment, N6h + N6i).**
> **Start at task 4 (§5): port ONE lane.** What changed:
> - **⌘K leak closed.** `buildCommandBarNavGroups` reads
> `getSidebarNavItems({ permissions })` on both paths; `APP_SIDEBAR_NAV` no
> longer imported there. Pinned by two new assertions in
> `nav-mobile-first.test.ts` (palette both paths · stale saved spine order),
> red proven per §8.4. Two existing palette tests re-pinned to the gated
> contract.
> - **Child rail aligned.** `SPINE_CHILD_RAIL_INSET_CLASS` (`pl-[15px]`) in
> `src/components/sidebar/sidebar-spine.ts`, consumed by the desk group body
> AND the `/m` drawer. **Option 1 was taken** (§3.2): per-row spans kept, X
> moved — `SidebarMenuSub` was NOT adopted, so the AGENTS.md rule stands and
> no operator ruling is owed. Render probes PASS on both surfaces; **still no
> eyeball** (no relay, no Chromium) — §3.4's second criterion is OWED.
> - **Doc debt closed.** Predecessor §5b gained N6d–N6i; §9 gained **Q6**.
> - `verify:fast` green (5/5, boundary 95/95); nav battery 103/103;
> `nav-name-collisions` + `nav-registry` + `spine-section-accent` 23/23; unbox
> 56/56. **`smoke.mjs` is RED — 4 fails, ALL `kiosk` axis, and not from this
> increment:** those checks were authored 2026-09-15 by the parallel kiosk-DS
> session for `server.mjs` reads that have not landed yet (`src/app/kiosk/**`
> and `docs/todo/kiosk-ds-unification-HANDOFF.md` are dirty in-tree). Every
> non-kiosk check passes; nothing here touched a kiosk file, a token axis or a
> design-mcp source. Left alone per §10.1 — do **not** "fix" it. Full note in
> the ledger's N6h/N6i entry. §8.2 still expects "all good", so re-run smoke
> before you trust it as your own baseline.
> - **Q6 is now written down and still unanswered** — ask it before gating
> `floor` or `studio`.

| # | Task | Size | Why first |
|---|---|---|---|
| ~~**1**~~ | ~~**Fix the ⌘K leak** (§2)~~ | ✅ **landed 2026-09-15** | — |
| ~~**2**~~ | ~~**Align the child rail to the parent's icon** (§3)~~ | ✅ **landed 2026-09-15** | Eyeball confirmation still owed |
| ~~**3**~~ | ~~**Close the doc debt** (§4)~~ | ✅ **landed 2026-09-15** | — |
| **4** | **Port ONE lane to mobile-first** (§5) | one lane, one increment | **START HERE.** The operator's stated sequence: *"everything would be ported over one by one."* Recommended: **Inbound** (§5.2). |

Increment rules bind (≤6 files, strangler, reversible, gates green, ledger note
per increment). **One increment per session.**

---

## 1. Where the sidebar stands right now (measured, not remembered)

### 1.1 The painted spine

Render probe over the real catalog, end of session:

```
LANE HEADERS: Inbound · Outbound · Inventory · Products · Scan Stations

Daily                  L0     1 glyph   no hairline
Media Library          L0     1 glyph   no hairline
▾ Inbound              GROUP  1 glyph   (lane icon)
    Deliveries         child  0 glyphs  │ hairline
    Sourcing           child  0 glyphs  │ hairline
▾ Outbound             GROUP  1 glyph
    Shipping           child  0 glyphs  │
    FBA                child  0 glyphs  │
▾ Inventory            GROUP  1 glyph        ← single-page lane, EXPANDED into
    Ledger … Health    child  0 glyphs  │      the page's own children
▾ Products             GROUP  1 glyph
    Reference … Kit Parts  child 0 glyphs │
▾ Scan Stations        GROUP  1 glyph
    Arrival … Scan out child  0 glyphs  │
Automations            L0     1 glyph   no hairline

31 rows · icon-law violations: 0 · hidden-lane text present? false
```

### 1.2 The five laws now enforced by machines, not memory

| Law | Operator words | Rule module | Gate | MCP face |
|---|---|---|---|---|
| **Icon at the parent level only** | *"icon at the parent level only"* | `DOMAIN_GROUPS[].icon` (`src/lib/nav/lanes.ts`) + `/m` types (`MobileNavChild` has **no** `icon` field) | types + `nav-registry.test.ts` | — |
| **Full ROW ink** — no gray chrome | *"it should display all black, all consistent with the top three items"* | `SPINE_ACCENT` + `SPINE_ACCENT_DATA_ACTIVE` | — | `ds_critique` |
| **A child never wears its parent's name** | *"it should never display the same child and parent name"* | `src/lib/nav/nav-name-collisions.ts` | `Nav names` (**always**) + Unit tests | **`ds_nav_names`** |
| **Mobile-first gate** — no `/m`, no door | *"if it is not mobile friendly, then it should not even display anywhere within the front end"* | `LANE_MOBILE_FIRST` (`src/lib/nav/lanes.ts`) | `Mobile-first` (**always**) + Unit tests | **`ds_mobile_first`** |
| **Single-page lanes EXPAND** | *"create different parents and expand them into different childs"* | `renderLane` in `SidebarNavList.tsx` | Unit tests | — |

`verify:fast` now runs **five** gates: `Lint · Typecheck · Boundary · Nav names · Mobile-first`.

### 1.3 The porting ledger — this is the workflow

`LANE_MOBILE_FIRST` in `src/lib/nav/lanes.ts`:

```ts
inbound:     'desk-only'   // kept by name — port next
fulfillment: 'desk-only'
inventory:   'desk-only'
catalog:     'desk-only'
sales:       'hidden'      // hidden by name
support:     'hidden'
monitor:     'hidden'      // = Operations
```

- `'hidden'` removes the **door**, not the route. `/operations`, `/support`,
  `/dashboard?mode=sales` still resolve for a bookmark, and a test asserts those
  rows are still **in** `APP_SIDEBAR_NAV`. Deleting a surface is Track X.
- `'desk-only'` **still displays** — the operator uses those four today. Hiding
  them would be the gate eating the work it exists to sequence.
- **`floor` (Scan Stations) and `studio` (Automations) are ungated on purpose.**
  Neither was named in the hide/keep lists. See §7 Q6 — ask, do not infer.

### 1.4 Names, after the rename

```
Inbound (lane — direction)
  └─ Deliveries (row — object)   → tabs: On the way · History · PO Mailbox (state)
  └─ Sourcing
```

`incoming` wire id and `/incoming` path are unchanged; the row carries
`keywords: ['inbound', 'incoming', 'arrivals', …]` so ⌘K still answers the
retired word. **Do not "fix" `Deliveries` back to `Inbound`** — the name guard
will fail and it is a written operator ruling.

---

## 2. TASK 1 — the ⌘K leak (✅ LANDED 2026-09-15 — kept as the diagnosis)

`src/lib/nav/command-bar-nav-groups.ts:74`:

```ts
const base = permissions ? getSidebarNavItems({ permissions }) : APP_SIDEBAR_NAV;
```

**The mobile-first gate lives inside `getSidebarNavItems()`** — deliberately,
because that is the one funnel the spine, ⌘K, `nav-destinations`, the header page
switcher and recents all read. But this call site **bypasses it** whenever
`permissions` is undefined, so a no-arg `buildCommandBarNavGroups()` still emits
Sales / Support / Operations rows under their own band headings. That is a live
breach of *"there should not even be any front end routing or links to it."*

**Fix:** `const base = getSidebarNavItems({ permissions })`. The function already
handles `permissions: undefined` (no permission filtering, gate still applied),
so the legacy semantics are preserved and the gate applies. The
`for (const section of SPINE_SECTIONS)` loop at line 97 is then self-cleaning —
it already does `if (sectionItems.length === 0) continue`, so a hidden lane
cannot paint a band with no rows.

`src/lib/nav/nav-destinations.ts:53` uses `SPINE_SECTIONS.find(...)` as a pure
**label lookup** for an item that can no longer exist. Leave it.

**Accept:** add to `src/lib/nav/nav-mobile-first.test.ts` —
`buildCommandBarNavGroups()` (no args) contains no row from `sales` / `support` /
`monitor`, and no group whose id is one of those. Also assert the other path that
is currently unpinned: feed `resolveSpineMapEntries` the gated items and assert
no hidden-lane page appears as a loose / parent spine row.

---

## 3. TASK 2 — align the child rail to the parent's icon (✅ LANDED 2026-09-15)

**Operator directive (2026-09-14, verbatim):** *"it should display the sidebar
component like this, for example, with the hairline on the left side and aligned
with the icon of the parent to the left of the child and then the name on the
right side."* Pasted reference: the shadcn `Sidebar` docs, whose
`SidebarMenuSub` is `mx-3.5 … translate-x-px border-l px-2.5`.

### 3.1 What ships today

Children already have the hairline (N6f — the desk converged on the `/m`
drawer's `spineRailLineClass`). What is **not** right is its X position:

| | geometry | label x |
|---|---|---|
| Parent row | `px-2` (8px) + 16px glyph + 8px gap | **32px**; glyph spans 8→24, **centre 16px** |
| Child row today | group body `pl-2` (8px) + rail `w-0.5` (2px) + button `px-2` | rail at 8→10px, label **18px** |
| **Target** | rail centred on the parent glyph | rail ≈ **15→17px**, label to its right |

So the rail currently sits ~7px left of where the operator wants it. The fix is a
**derived token**, never an arbitrary literal (`ds_critique` counts literals):
`px-2` (8) + half a 16px glyph = **16px centre** → a 2px rail starts at 15px.
shadcn expresses the same thing as `mx-3.5` (14px) + `translate-x-px`. Put the
number in `src/components/sidebar/sidebar-spine.ts` beside
`SPINE_ROW_ICON_CLASS` with the derivation in its docblock, exactly the way the
deleted `SPINE_CHILD_ROW_INDENT_CLASS` documented `pl-8`.

### 3.2 The decision you must make explicitly (do not guess) — ✅ **OPTION 1 TAKEN**

The pasted reference draws ONE continuous `border-l` on the `SidebarMenuSub`
`<ul>`. This repo draws **one span per row** (`spineRailLineClass`) because the
line is a **state marker**: `border-soft` idle → `text-default` on the row you
are on. A single `border-l` on the list cannot highlight one row.

Two honest options:

1. **Keep per-row spans, move their X** — preserves the active-row mark, matches
   the operator's picture geometrically, keeps `/m` and desk on one token.
   **Recommended.** Document why this deviates from `SidebarMenuSub`'s single
   border.
2. **Adopt `SidebarMenuSub` + `SidebarMenuSubButton`** verbatim — matches the
   reference structurally but **loses the per-row rail highlight**, and collides
   with a standing rule: AGENTS.md says *"`SidebarMenuSub` is for a page's own
   CHILD MODES, never for a lane's pages."* Taking this option means retiring
   that rule, which needs an operator ruling.

Whichever you pick, the `/m` drawer
(`MobileSidebarDrawer.tsx` ~line 215) must move with it — one law, one paint, is
the standing ruling (N6f). Its group body is `pl-2`; it needs the same inset.

### 3.3 Files

`src/components/sidebar/sidebar-spine.ts` (the token) ·
`src/components/sidebar/master-nav/SidebarNavList.tsx` (`renderMenuRow`,
`renderSection`'s `SidebarGroupContent className="pl-2"`) ·
`src/components/mobile/redesign/MobileSidebarDrawer.tsx` (the `pl-2` wrapper) ·
possibly `src/components/ui/sidebar.tsx` if you take option 2.

### 3.4 Accept

- Render probe (recipe in §8) shows every child row carrying the rail, zero
  glyphs, and the rail's inset class present.
- **Eyeball it against the reference**: open a lane and confirm the hairline sits
  under the parent's glyph, not under its left pad. This is the one criterion a
  probe cannot judge, and the operator has now asked for it twice.
- `ds_critique` on both touched `.tsx` files: **no new arbitrary literals**.

---

## 4. TASK 3 — doc debt (✅ LANDED 2026-09-15)

In [`sidebar-lane-parents-shadcn-HANDOFF.md`](./sidebar-lane-parents-shadcn-HANDOFF.md):

1. **§5b status table** is missing rows for **N6d** (full ink), **N6e** (the name
   law + `Deliveries`), **N6f** (the child hairline; `SPINE_CHILD_ROW_INDENT_CLASS`
   deleted) and **N6g** (the mobile-first gate). Its "start at" pointer should
   stay **S6**.
2. **§9** needs **Q6**: *do Scan Stations and Automations stay as they are?*
   Neither was named in the operator's hide/keep lists. Scan Stations arguably
   must stay — the benches **are** the phone surface — and Automations is a
   desktop pan/zoom canvas already in `MOBILE_RESTRICTED_SIDEBAR_IDS`. Both are
   ungated on purpose; hiding either is an inference this session refused to make.
3. Any §5b sentence that still references the **indent** token is wrong — the
   child mark is the rail on both surfaces now.

Do **not** rewrite the plan ledger's historical N6c / N6e entries. Add dated
supersession lines instead; that file is the run log.

---

## 5. TASK 4 — port ONE lane to mobile-first

**Operator directive:** *"they're all not ported to mobile … I need this verified
and so I'll be able to port over one section one by one and identify what I
actually need and what I actually use. And so everything would be ported over one
by one … Products, inventory, outbound, and inbound … must be ported over to a
mobile first design system language. That is next."*

### 5.1 What "ported" means, concretely

A lane flips `'desk-only'` → `'ported'` when **every operator verb in it is
completable on `/m`** (SURFACE_LAW §1), not when a phone-width CSS breakpoint
exists. The flip is **one line** in `src/lib/nav/lanes.ts`, and that line IS the
increment's close-out.

### 5.2 Recommended order and why

| Order | Lane | Reasoning |
|---|---|---|
| 1 | **Inbound** | Already the furthest along: `/m/receiving` (the unbox photo feed) is the U2 ruling's **first keep**, plus `/m/receiving/po/[poId]`, history, and the immersive photo routes. The gap is the `Deliveries` desk itself (`/incoming`: On the way · History · PO Mailbox) and `Sourcing`. |
| 2 | **Outbound** | `/m/work` + `/m/pick` are LIVE/KEPT and already the drawer's Outbound rows. The gap is the Shipping desk's four tabs and FBA (FBA has **no** `/m` surface at all). |
| 3 | **Inventory** | Nine desk children (Ledger · Locations · Replenish · …). Location scanning is a U2 keep, so a slice exists. |
| 4 | **Products** | Seven children, catalog-heavy; the least scan-driven, so the least phone-shaped. |

### 5.3 Rules that bind a port increment

- **Mobile SoT first.** Build the `/m` surface, then let the desk consume it
  (phone-width frame + gutters). Not a shrunk desk. SURFACE_LAW §4.
- **U2 survival table (plan §1.7) governs which routes may get a drawer row** —
  only **LIVE** and **KEPT**. `Add order` (`/m/orders/new`) is **GATED** and lost
  its row for exactly this reason; see §7 Q5.
- **`ds_contract "phone shell for an /m page"` answers `MobileShell`.** Do not
  hand-roll a phone frame; `DeskPageChrome` on `/m` is a refuse.
- Lists on phone are cards + `BottomSheet`, never a `DataTable` as the SoT.
- **Scan keeps its permanent top-right seat** (`MobileScanCta`) — never a row.
- Flip the ledger entry in the SAME increment that lands the surface, so
  `ds_mobile_first` never claims a port that does not exist.

---

## 6. Still open from the predecessor handoff: S6

**S6 — the `/m` drawer becomes a `Sidebar` mobile variant.** The branch already
exists: `Sidebar collapsible="sheet"` in `src/components/ui/sidebar.tsx` renders
the same children into a `Sheet` at `--sidebar-width-mobile` (240px, the spine's
pixel twin, capped `max-w-[86vw]`). Nothing mounts it yet;
`MobileSidebarDrawer.tsx` is still the hand-rolled slide-over.

Keep when you do it: `MobileAccountFooter` in `SidebarFooter` (U1 geometry — no
`border-t`, `elevationClass('raised','soft')`, `min-h-11`), the drag-to-dismiss
gesture, and the `presentation: 'overlay' | 'rail'` split.

---

## 7. Open operator questions — ask, do not guess

| Q | Question | State |
|---|---|---|
| Q1 | Inbound lane / row stutter | ✅ **answered** — `Deliveries` / `On the way`, machine-enforced |
| Q2 | FBA row label | ✅ **FBA** |
| Q3 | `⌘B` for the sidebar trigger | ✅ **no chord at all** — the ported provider binds nothing |
| Q4 | Where the law lives long-term | ⚠️ partial — spine rules are in AGENTS.md; the design-mcp `mobile-first` **refuse cohort** is still blocked in this worktree (no `router.json`) |
| Q5 | `/m/orders/new` — does *Add order* keep a drawer row? | ❗ **open** — removed in S5 per §1.7 GATED + N9; reinstating is one line |
| **Q6** | **Do Scan Stations and Automations stay as they are?** | ❗ **open, new** — never named in the hide/keep lists |

---

## 8. Recipes — how to verify without a browser

**There is no browser in this environment.** The relay extension is not
connected AND no Chrome/Chromium binary exists at `/opt/google/chrome/chrome`.
Every paint claim in the ledger rests on rendered-markup probes. Say so plainly
in your own ledger note; do not imply an eyeball you did not have.

### 8.1 The render probe (this is the honest substitute)

Throwaway `src/lib/nav/__probe-*.tsx`, run with `npx tsx`, **deleted after
reading**. It must live inside `src/` or `@/` aliases will not resolve.

```tsx
import { PathnameContext, SearchParamsContext }
  from 'next/dist/shared/lib/hooks-client-context.shared-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
// Wrap in <PathnameContext.Provider value="/incoming"> + <SidebarProvider>,
// else StaffAccountFooter throws on a null pathname and Sidebar throws on a
// missing provider. Feed it the FULL permission set collected from
// APP_SIDEBAR_NAV[].requires + every SIDEBAR_PAGE_NAV child's requires,
// or `filterPageChildren` drops gated children and whole lanes vanish.
```

Then scan each `<li>` for `<svg` count and the rail / inset classes. That is how
the table in §1.1 was produced.

### 8.2 The gates

```bash
pnpm verify:fast     # Lint · Typecheck · Boundary · Nav names · Mobile-first
npx tsx scripts/nav-name-guard.ts
npx tsx scripts/mobile-first-guard.ts      # prints the porting ledger
node tools/design-mcp/ds.mjs nav-names
node tools/design-mcp/ds.mjs mobile-first
node tools/design-mcp/smoke.mjs            # expect "smoke: all good"

node --import tsx --test \
  src/lib/sidebar-navigation.test.ts src/lib/nav/spine-slots.test.ts \
  src/lib/nav/command-bar-nav-groups.test.ts src/lib/nav/nav-destinations.test.ts \
  src/lib/nav/nav-search.test.ts src/lib/mobile/nav-registry.test.ts \
  src/lib/nav/nav-name-collisions.test.ts src/lib/nav/nav-mobile-first.test.ts \
  src/lib/nav/spine-section-accent.test.ts          # 124 at handoff time

# unbox invariant, EVERY increment — 56 tests:
node --test --import tsx \
  src/components/mobile/receiving/arrival-station-tape.test.ts \
  src/components/mobile/receiving/photo-upload-queue-capture-rehydrate.test.ts \
  src/components/mobile/receiving/photo-upload-queue-in-flight.test.ts \
  src/components/mobile/receiving/complete-carton.test.ts \
  src/components/mobile/redesign/scan-verdict.test.ts
```

### 8.3 design-mcp

The **MCP-surfaced** `ds_*` tools describe `cycleforge-app`, not this worktree
(`.cursor/mcp.json` aims the server there). **Only the local CLI verdict counts:**
`node tools/design-mcp/ds.mjs contract|critique|tokens|boundary|nav-names|mobile-first`.
Run `critique` on each touched `.tsx` **before and after** and compare the problem
sets; a hook denies `src/**/*.{tsx,jsx,css}` writes without a fresh session stamp.

### 8.4 Proving a gate can actually fail

When you add or change a law, **prove the red**: `sed` the registry back to the
violating value, run the guard, show the named violation, restore. A green test
that cannot go red is not a gate. (That is how the name law was verified: the old
labels produced `lane → row: "Inbound" → "Inbound"` and `page → tab: "Inbound" →
"Inbound"`.)

---

## 9. REFUSALS — do not do these

- **Do not un-hide a lane without flipping its `LANE_MOBILE_FIRST` entry**, and
  do not flip an entry to `'ported'` without a real `/m` surface behind it.
- **Do not delete a hidden lane's route.** Hiding a door ≠ deleting a surface;
  that is Track X, per lane, gated.
- **Do not re-face `Deliveries` back to `Inbound`**, or add any child that wears
  its parent's name. `ds_nav_names` will fail and it is a written ruling.
- **Do not reintroduce an indent token beside the rail.** One child mark, both
  surfaces.
- **Do not re-grey the group label.** Upstream shadcn greys it because it is a
  caption; here the lane header is a destination, and quieter ink read as
  disabled. All nav ink is `text-text-default`.
- **Do not add a renderer-side icon map keyed by destination id.** The icon law
  lives in the registries; that map is exactly how the phone and desk diverged.
- **Do not put `SidebarMenuSub` under a `deskChrome` desk** — a desk that tabs its
  own pages must not have the nav tab them a second time.
- **Do not paint a `SidebarMenuBadge` with a fake `0`.** Omit when unknown.
- **Do not dissolve Scan Stations into L0 rows.** `SPINE_SECTIONS`' docblock is
  law: Scan Stations is an INPUT MODEL, the rest are DOMAINS.
- **Do not add a `ds_*` tool that has no shared rule module.** The server's own
  doctrine: *"a tool that answered 'allowed' while nothing enforced anything
  would manufacture confidence."* A tool is a FACE on a machine, never the
  machine.

---

## 10. Two hazards this worktree actually has

1. **A concurrent agent edits this tree.** During the last session
   `SidebarNavList.tsx` gained the expansion ruling and `daily-checks/*` changed
   three times mid-run. Re-`read` before every edit; a stale `#TAG` means the
   file moved under you. Do not revert another session's work — record it.
2. **`src/lib/sidebar/sidebar-spine.ts` is a DEAD, already-diverged twin** of
   `src/components/sidebar/sidebar-spine.ts` (zero importers). Do not mirror
   tokens into it; its deletion belongs to Track C8/X3.
