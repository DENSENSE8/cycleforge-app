# Handoff — MasterNav spine polish (4 changes)

**For:** implementing agent (Claude Code / Cursor / Codex)
**From:** Cycle Forge engineering
**Date:** 2026-08-02
**Status:** ready to implement — all four are scoped, measured, and located
**Lane:** `main` checkout — no ad-hoc branch. Attach to `:3050`. **User owns commits.**
**Product frame:** Cycle Forge multi-tenant reseller-ops SaaS. USAV is dogfood only.

**Paste for a new session:**

```
Read docs/todo/spine-polish-4-HANDOFF.md and execute §1 → §4 in order.

Four MasterNav spine changes:
1) Search band height → same as a nav row (49px → row height).
2) Sales section accent → green.
3) Workflow Studio → out of the root section list, above the Admin footer row.
4) Icon hover travel → straight UP, not the current up-and-right diagonal.

Compose from the named SoTs — never a page-local twin. Every one of these has a
guard that will fail until you update it; update the guard AND the rule prose,
never loosen an assertion to pass. Attach to :3050; never start/restart/kill the
dev server. User owns commits. npm run verify before done.
```

**Lineage (read when blocked):**

| Doc / file | Role |
|---|---|
| `docs/todo/spine-nav-search-cmdk-HANDOFF.md` | The session that built the current spine search + type ladder |
| `.claude/rules/source-of-truth.md` → *MasterNav section accents*, *row hover/press travel*, *spine type ladder* | The three laws these changes edit |
| `src/lib/nav/spine-section-accent.ts` | Accent map + `SPINE_ICON_LIFT_CLASS` (§2 + §4) |
| `src/lib/sidebar-navigation.ts` | `MAIN_GROUPS` / `SPINE_SECTIONS` / `APP_SIDEBAR_NAV` (§3) |
| `src/components/sidebar/tech/TechRailSearchBar.tsx` | The search band — **shared with station rails** (§1) |
| `src/components/sidebar/master-nav/main-nav-groups.guard.test.ts` | Guards §2 §3 §4 |

---

## 0. Measured baseline

Taken from the running app at 1440×900, spine open (do not re-derive from CSS —
these are computed values):

| Element | Height | Notes |
|---|---|---|
| Section row (`Open {section}` button) | **30px** | `px-2 py-1.5` + 14px `role-body`/leading-tight |
| Search band (`TechRailSearchBar` wrapper) | **49px** | `inset-field` = 8px 12px padding + 32px form + 1px border |
| Search form / input | 32px | `SearchField size="compact"` |

Horizontal insets already agree: the row glyph and the search glyph both start
12px from the column edge (`div.p-1` + `px-2` = 12; `inset-field` px-3 = 12). **So
§1 is a purely vertical problem — do not "fix" the horizontal alignment.**

---

## 1. Search band height → a row's height

**Goal:** the search band reads as one more row in the list, not as a separate
dock. 49 → 32px.

### The constraint that decides the approach

`TechRailSearchBar` is **shared**: the MasterNav spine pins it above
Settings/Admin, and the Testing / Shipping / Unbox station rails pin it below
their carton lists. Its own docblock says so. Two consequences:

- **Do not shrink `SearchField size="compact"`.** That 32px control is the
  station rails' touch target on the floor, and it is a DS primitive with other
  consumers. Shrinking it to hit 30px trades a floor-ergonomics regression for
  2px in one navigator. Out of scope; ask first if you think otherwise.
- **Do not pass a `className` with raw padding from the spine.** `inset-field` is
  a Tier-2 spacing intent, and `ui-design-system.md` is explicit: *"An intent is
  the whole padding story for its element — never stack a raw `p-*` on top"* —
  both survive `cn()` and the intent wins in CSS order, so the override would
  silently no-op.

### Do

Add a **density variant** to `TechRailSearchBar` (the component owns its own
padding story):

- default (station rails) → today's `inset-field`, unchanged
- new variant (spine) → no vertical padding, keeping the 12px horizontal inset so
  the glyph column still lines up

Result: band = the 32px form + border ≈ a 30px row. The 2px delta is invisible
and costs nothing; **do not chase exact parity** by touching `SearchField`.

Pass the variant from `SidebarNavList`'s `<TechRailSearchBar>` mount only.

### Acceptance

- [ ] Spine search band measures ~32px; station rails still measure 49px.
- [ ] Search glyph stays 12px from the column edge (unchanged).
- [ ] `npm run test:spacing-guard` green — no new arbitrary-px spacing.
- [ ] `tests/e2e/sidebar-nav-search.spec.ts` still green (it drives this input).

---

## 2. Sales accent → green

**File:** `src/lib/nav/spine-section-accent.ts` → `SPINE_SECTION_ACCENTS.sales`
(currently **rose-600**).

### The collision you must resolve first

**`catalog` already owns `emerald-600`.** So "green" cannot mean emerald without
re-hueing Catalog. Tailwind's `green` ramp is a distinct hue and is the intended
target here.

**Shade is not a free choice.** The map's own docblock states the rule: these
fills carry white 12px caption text, so each must clear **WCAG AA 4.5:1 on
white**. `green-600` is ≈3.2:1 — it fails, exactly like `amber-600` (2.9:1) and
`orange-600` (3.6:1) did. **Use `green-700`** (≈4.6:1), and follow the
established shape for a 700-shade entry (copy `inbound` / `support`, which are
already at 700, not `catalog`, which is a 600).

### Adjacency check — do this, don't skip it

Root order is Analytics Monitor · Scan Stations · Inbound · Catalog · Inventory ·
Fulfillment · Sales · Support · Workflow Studio. After the change the spine
carries **three green-family hues**: `catalog` emerald-600, `inbound` teal-700,
`sales` green-700. Catalog and Sales are separated by two rows, so only one is
ever a solid fill at a time and the risk is low — but look at it on screen with a
Catalog page active and a Sales page active before you call it done.

If they read as the same colour, the fix is to **re-hue Catalog**, not to darken
Sales past 700 (which starts reading black at 12px). Say so in the commit rather
than leaving a near-collision undocumented.

### Do

Replace all 14 fields of the `sales` entry — `activePage`, `modeActive`,
`sectionActive`, `sectionIdle`, `cmdkSelected`, the icon tints, and the rings.
**Leaving even one `rose-*` behind is the failure mode**: the row fills green and
the ⌘K palette still highlights it rose, and nothing type-checks that.

Then update:
- the hue list in the map's docblock (`sales — rose front desk` → green)
- `source-of-truth.md` → *MasterNav section accents* (it enumerates the hues)

### Acceptance

- [ ] No `rose-` string survives in the `sales` entry.
- [ ] Fill is `green-700`; contrast verified against white text.
- [ ] ⌘K palette row for a Sales page highlights green (it reads `cmdkSelected`).
- [ ] `main-nav-groups.guard.test.ts` green.

---

## 3. Workflow Studio → above the Admin row

**Today:** `MAIN_GROUPS[1]` → last entry of `SPINE_SECTIONS` → renders as a root
**section drill** with a chevron, holding two pages (`studio` → `/studio`,
`studio-catalog` → `/studio/catalog`).

**Wanted:** a row in the footer pin band, directly above **Admin**.

### The thing to decide before you touch code

Footer pins render through `renderRow(page, 'bottom', …, { pinned: true })`, and
`showModes = !opts?.pinned && modeCount > 1` — **a pinned row never expands
children.** So moving Studio there as-is would make `/studio/catalog`
unreachable from the spine.

Three options; **(A) is recommended**:

| | Approach | Cost |
|---|---|---|
| **A** ✅ | `studio` becomes `kind: 'bottom'` (a flat pin, like Admin/Settings). `studio-catalog` becomes a **mode** of it in `SIDEBAR_PAGE_NAV` so ⌘K and deep links still resolve it, even though the pinned row does not draw modes. | Catalog leaves the spine surface; still reachable via ⌘K + URL. |
| B | Teach the footer band to render a drill button. | Footer grammar today is flat rows; a chevron there invents a second footer affordance for one section. |
| C | Keep the section, just reorder it below the search band. | Does not match "above the Admin page row" — the footer band is a separate region from the drill list. |

If you take **A**, say in the commit that `/studio/catalog` left the spine — that
is a real reachability change, not a cosmetic move.

### Do (option A)

1. `APP_SIDEBAR_NAV`: `studio` → `kind: 'bottom'`, drop `mainGroup`. Place it
   **before** the `admin` row — the footer renders in array order.
2. `APP_SIDEBAR_NAV`: remove `studio-catalog` (or also make it `kind: 'bottom'`
   if it must stay a visible row — but then it sits in the footer too, which is
   probably not what anyone wants).
3. **`SIDEBAR_PAGE_NAV` must agree on every shared membership field.** This is a
   documented trap: `MasterNav`'s `toPageNav` merges the two registries and the
   MODE registry wins, so a disagreement ships one answer silently while the
   other reads as documentation. Guard: *"agree on every shared membership
   field"*.
4. `MainGroupId` / `MAIN_GROUPS` / `SPINE_SECTIONS`: drop `studio`. `MainGroupId`
   becomes `'monitor'` alone.
5. `SPINE_SECTION_ACCENTS` is a **total** `Record<SpineSectionId, …>` — removing
   the section id is a type error until you delete the `studio` entry too.
   Delete it; violet returns to the palette.
6. `spineSectionIdForPage` — confirm `/studio` no longer resolves to a section.

### Acceptance

- [ ] Root drill list is 8 sections, ending at **Support**.
- [ ] Footer band reads **Workflow Studio · Admin · Settings**, in that order.
- [ ] `/studio` still highlights its footer row when active.
- [ ] ⌘K still finds Studio (and Catalog, if kept as a mode).
- [ ] `main-nav-groups.guard.test.ts` + `station-nav-groups.guard.test.ts` green —
      both assert `SPINE_SECTIONS` order and membership.

---

## 4. Icon hover travel → straight up

**File:** `src/lib/nav/spine-section-accent.ts` → `SPINE_ICON_LIFT_CLASS`.

Today the 14px leading glyph moves **up AND right** on hover:

```
motion-safe:group-hover:translate-x-0.5   /* +2px right */
motion-safe:group-hover:-translate-y-px   /* −1px up    */
motion-safe:group-active:translate-x-px   /* +1px right */
motion-safe:group-active:translate-y-0
```

**Wanted:** vertical only — the glyph lifts, it does not drift toward the label.

### Do

Drop both `translate-x-*` steps and put the travel on Y. Suggested:

```
motion-safe:group-hover:-translate-y-0.5   /* 2px up  — was 1px up + 2px right */
motion-safe:group-active:translate-y-0     /* press settles back to rest       */
```

2px up reads at a glance where 1px did not, and removing the X drift stops the
glyph from crowding the label it sits beside.

**Keep everything else about this token:**

- `motion-safe:` stays — the framer `MotionConfig` reduced-motion floor covers
  `motion.*` elements only, so a CSS transform needs its own gate.
- Still CSS, never a framer `whileHover` — that is a React re-render per
  `mousemove` across ~20 rows for travel the compositor gives free.
- Still the **glyph only**. Never a row-level `scale` (breaks the baseline dense
  siblings align to) and never a hover `font-*` shift (reflows text under the
  pointer).

### Also update

`source-of-truth.md` → *MasterNav row hover/press travel* still describes
`translate(2px, -1px)` hover / `(1px, 0)` press. Leaving that is the same class
of defect the ⌘K tooltip had — prose advertising behaviour the code no longer
has.

### Acceptance

- [ ] No `translate-x` remains in `SPINE_ICON_LIFT_CLASS`.
- [ ] Hover lifts the glyph vertically; press returns it.
- [ ] Reduced motion: no travel, accent wash + icon tint still answer.
- [ ] SoT line matches the new values.

---

## 5. Verify

```bash
npm run verify
npx playwright test tests/e2e/sidebar-open-close.spec.ts \
  tests/e2e/sidebar-nav-search.spec.ts \
  tests/e2e/cmdk-palette.spec.ts --project=desktop
```

Then look at it on `:3050` with the spine open — §2 and §4 are judgement calls
that a green test suite cannot confirm.

**Red gates that are NOT this work** (other sessions in the shared tree — report,
do not inherit or fix):

- `dialog-shell.guard` — hand-rolled modal shells 40 → 41, from the right-rail
  push-inspector work (`RightRailHost.tsx`, `pane-header/blocks.tsx`)
- anything under `src/lib/interop/**` (GS1 / EPCIS wave)

**Do not** raise a ratchet baseline to make a gate pass — baselines only shrink.
