# Handoff — MasterNav spine: neutral chrome, flat structure, no "modes"

**For:** implementing agent (Claude Code / Cursor / Codex)
**From:** Cycle Forge engineering
**Date:** 2026-08-02
**Source:** `docs/todo/spine-visual-language-GEMINI-RESEARCH-BRIEFING.md` → Gemini decision brief D1–D5
**Status:** ready — phased, each phase independently shippable
**Lane:** `main` checkout — no ad-hoc branch. Attach to `:3050`. **User owns commits.**
**Product frame:** Cycle Forge multi-tenant reseller-ops SaaS. USAV is dogfood only.

**Paste for a new session:**

```
Read docs/todo/spine-visual-language-HANDOFF.md and execute PHASE A, then stop and
report. Do not start Phase B until the user has looked at Phase A on :3050.

Phase A is the visual layer: neutral spine (delete the 8-hue accent map), icons on
root rows only at stroke 1.5, delete the hover lift.
Phase B is vocabulary: "modes" become child pages, plus the rename table.
Phase C is structure: delete the drill-in, flatten to one scrolling list.

Every phase reverses a ratified ruling and has guards + rule prose that will fail
until you update them. Update the guard AND the prose — never loosen an assertion
to pass, never raise a ratchet baseline. Attach to :3050; never start/restart/kill
the dev server. npm run verify before a phase is done.
```

---

## 0. What this reverses — read before you touch anything

This handoff undoes four decisions that were each ratified with recorded reasoning. That is
allowed — this is pattern evolution, not vandalism — but **every reversal must delete the old
prose, not leave it standing beside the new**. A rules file cannot fail, so a stale ruling is
indistinguishable from a live one.

| Reversed | Where it was ruled | Reversed by |
|---|---|---|
| Per-section accent hues carry section identity | `source-of-truth.md` → MasterNav section accents | D1 |
| Vercel-style drill-in for the spine root | `spine-drill-in-vercel-GEMINI-RESEARCH-BRIEFING.md`; `motion-crossfade.md` → RESOLVED spineDrill | D2 |
| L2 modes keep glyphs at a heavier stroke than L1 pages | `ui-design-system.md` → Nav chrome law | D3 |
| Icon hover/press travel on the 14px glyph | `source-of-truth.md` → MasterNav row hover/press travel | D5 |

**D5 reverses work shipped 2026-08-02, hours before this handoff.** The `spine-polish-4` session
changed that travel from a 2px-right/1px-up diagonal to a clean 2px straight up, and it was
measured working (`translate: 0px -2px` on hover, `0px` on press). D5 says delete it outright.

**D5's stated rationale is wrong and must not be repeated in the commit or the rules.** It claims
the lift "violates reduced-motion design standards." It does not — the class is `motion-safe:`
gated, which is exactly the gate CSS motion needs because the framer `MotionConfig` floor cannot
see a Tailwind transform. The ruling may still be correct on its **real** merit: 2px of movement
under the pointer on a 20-row dense column is visual noise on a structural element that never
moves. Ship it on that reason or not at all.

**This is a genuine fork — decide before Phase A.** Both are defensible:

| | Keep the lift | Delete the lift (D5) |
|---|---|---|
| For | Just shipped, measured, `motion-safe`-correct, gives an otherwise-inert column one moment of life | Structural anchors should not move; the hover *wash* already answers, so the travel is a second answer to one question |
| Against | A second hover signal beside the background wash | Throws away same-day work; the column becomes fully static |

**Recommendation: delete it**, but only alongside D1. Today the wash is nearly invisible
(`hover:bg-surface-canvas`), so the glyph lift is carrying the hover affordance almost alone —
delete it first and hover stops answering at all. D1 gives the row a real neutral wash; once that
lands, the travel is genuinely redundant.

---

## Lineage (read when blocked)

| Doc / file | Role |
|---|---|
| `docs/todo/spine-visual-language-GEMINI-RESEARCH-BRIEFING.md` | The brief that produced D1–D5 |
| `docs/todo/spine-polish-4-HANDOFF.md` | The session immediately before this one (§4 is what D5 reverses) |
| `docs/todo/desk-domain-spine-split-CLAUDE-CODE-PROMPT.md` | Why the eight sections exist and what `desk` / `print` were |
| `src/lib/nav/spine-section-accent.ts` | The accent map + `SPINE_ICON_LIFT_CLASS` (D1 + D5) |
| `src/lib/sidebar-navigation.ts` | `APP_SIDEBAR_NAV` · `SIDEBAR_PAGE_NAV` · `SPINE_SECTIONS` · the mode types |
| `src/components/sidebar/master-nav/SidebarNavList.tsx` | Root map · drill · row renderers |
| `src/components/sidebar/master-nav/MasterNav.tsx` | `drillId` state + auto-drill effect |
| `src/lib/nav/nav-destinations.ts` | Already treats a mode as a first-class destination — the precedent for Phase B |
| `src/lib/nav/command-bar-nav-groups.ts` | ⌘K bands; consumes `spineAccentFor` |
| `src/components/sidebar/master-nav/main-nav-groups.guard.test.ts` | Guards nearly all of this |
| `tests/e2e/sidebar-nav-search.spec.ts` · `sidebar-open-close.spec.ts` | The two specs that drive the spine |

---

## Corrections to the brief — do not implement these as written

The research is strong, but three items are wrong on facts only the codebase has. Fix them here,
not at review time.

1. **"Catalog link → Public Link" is wrong.** `catalog-link` is `/review?mode=catalog-link`, the
   workflow for **linking a marketplace listing to a catalog SKU**. It is internal reconciliation
   work; there is nothing public about it. Rename it **"Listing match"** (it pairs with the
   sibling "Pairing", which matches serials to labels). Never "Public Link."
2. **"Fulfillment → Outbound" collides with a live id.** `outbound` is already the page id of the
   Shipping row (`{ id: 'outbound', label: 'Shipping', href: '/shipping/labels' }`), and
   `outboundModeFromPath` / `OUTBOUND_MODE_PATHS` key off it. The *label* rename is good — Inbound
   / Outbound is exactly the pairing the brief wants — but **do not reuse the id**, and expect the
   section and the page to merge into one row under Phase C.
3. **"Analytics Monitor → Live Ops, drop the child" contradicts D2.** The Operations page has four
   real destinations under it (Live · TV · Analytics · History). Dropping the child does not
   flatten it to one link — it flattens it to a parent with four children. Take the label rename
   (`Live Ops`) and let Phase B decide the children like every other page.

Also note, against D1's stated cost: **the ⌘K palette does not depend on hue for grouping.** It
already renders labelled section bands (`CommandBarNavGroup.label` + `sectionIcon`), and
`nav-destinations.ts` already carries a parent `context` string on every row, which the spine's
flat search already renders. The breadcrumb D1 asks for is largely built. The colour can go
without building a replacement.

---

# PHASE A — the visual layer

Independently shippable. No structural change, no renames. **This is where the "generated" read
actually changes**, and it is a day of work against Phase C's week.

*(The brief ranked flattening first, for operational reasons — lateral navigation cost. That is a
real and different argument. Phases are independent, so ship A first for the visual win and let C
follow; nothing here blocks it.)*

## A1 — Delete the 8-hue accent system (D1)

**File:** `src/lib/nav/spine-section-accent.ts`

`SPINE_SECTION_ACCENTS` is a total `Record<SpineSectionId, SpineAccentClasses>` — 8 sections ×
14 fields. **Delete the whole map.** `spineAccentFor()` returns `SPINE_NEUTRAL_ACCENT` for
everything, and should be collapsed to a single exported constant unless a caller genuinely needs
the function shape (check `CommandBar` before deleting the export).

**The neutral treatment**, composed from house tokens only — no page-local hex, no raw shades:

| State | Treatment |
|---|---|
| Active destination | `bg-surface-sunken` (or the nearest neutral fill) + `text-text-default` + the existing `ring-1 ring-inset` hairline |
| Idle | `text-text-default`, icon `text-text-muted` |
| Hover | a **real** neutral wash — this is now the only hover signal, so it must be visible under warehouse glare, not the near-invisible current one |
| Child row active | the same neutral wash at a lower weight; distinguish by indentation and type, not hue |

**Keep the inset hairline ring.** It is what makes an active row read as a seated chip rather than
a swatch, and it survives glare better than a fill alone.

**Verify the active row still clears WCAG AA 4.5:1** at 12px. The old 700 shades existed *for*
that reason; a neutral fill must not quietly fail the same bar. Measure it, do not assume.

**Guard work:** `main-nav-groups.guard.test.ts` asserts each hue by name (`/sky-/`, `/amber-/`, …),
the per-section ring, the amber-700 AA note, and the total-map key check. Rewrite that whole test
to assert the **inverse**: no chromatic hue appears in the spine accent module at all. That is a
stronger guard than the one it replaces — it fails the moment someone re-adds a colour.

**Prose:** `source-of-truth.md` → *MasterNav section accents* (rewrite the row entirely);
`display/workbench-master-detail.md` (drop the hue list); `ui-design-system.md` if it names hues.

### Acceptance

- [ ] No Tailwind chromatic hue (`sky|amber|teal|emerald|cyan|indigo|green|orange|violet|rose`) survives in `spine-section-accent.ts`.
- [ ] Active row contrast measured ≥ 4.5:1 at 12px; record the value in the commit.
- [ ] Hover is visible without the icon lift (test with A3 already applied).
- [ ] ⌘K palette still groups by section — via its band labels, which were always doing that job.
- [ ] `main-nav-groups.guard.test.ts` asserts the absence of hue, not the presence of specific ones.

## A2 — Icons on root rows only, stroke 1.5 (D3)

**Files:** `src/components/icons/nav-weight.tsx`, `SidebarNavList.tsx`

- Root destinations keep their glyph; **child rows lose theirs entirely** and rely on indentation
  plus the existing 12px-medium type.
- Drop the stroke from 2 → **1.5** at 14px.

**This reverses a hard law.** `ui-design-system.md` → *Nav chrome law* currently reads: *"MasterNav
L1 page rows render SoT page icons (lighter stroke); L2 modes keep glyphs with heavier stroke."*
Rewrite it; do not leave it standing.

**Two things that are NOT in scope and must not be swept:**

- **GlobalHeader chrome icons** carry an explicit exception (`TOP_CHROME_ICON_GLYPH`, stroke ≤ 2.25,
  *"2.75 muddies dense glyphs"*). Leave them alone.
- **`MODE_ICON_GLYPH_KEYS`** enforces that child glyphs are unique. Those glyphs still render in the
  GlobalHeader Mode switcher, so the uniqueness guard stays live even after the spine stops drawing
  them. Do not delete it as newly-dead.

### Acceptance

- [ ] No child/mode row in the spine renders an `<svg>`.
- [ ] Root glyphs at stroke 1.5; GlobalHeader untouched at its own weight.
- [ ] Subordination still legible from indentation + type alone — check at 1440 and at 1280.
- [ ] Nav chrome law rewritten in `ui-design-system.md`.

## A3 — Delete the hover lift (D5)

**File:** `src/lib/nav/spine-section-accent.ts` → `SPINE_ICON_LIFT_CLASS`

Delete the constant and every call site (`SidebarNavList` uses it in four renderers). Hover is
answered by the A1 background wash alone.

**Land this with A1, not before it** — see §0. Deleting the travel while the hover wash is still
near-invisible leaves the row with no hover affordance at all.

**Guard work:** `main-nav-groups.guard.test.ts` has a whole test on this
(*"icon-only CSS lift — no whileHover, no row scale, no weight shift"*), including assertions added
this morning that pin the vertical-only travel. Rewrite it to assert the spine has **no transform
travel at all**, while keeping the still-live half: no framer `whileHover`, no row `scale`, no
hover `font-*` shift. Those three bans are about re-render cost and baseline breakage and remain
correct.

**Prose:** `source-of-truth.md` → *MasterNav row hover/press travel* — rewrite. It currently
describes the exact behaviour you are deleting.

### Acceptance

- [ ] `SPINE_ICON_LIFT_CLASS` is gone, not merely unused (knip will not catch a stale export that a
      call site still imports — delete both ends).
- [ ] Hovering any spine row produces a visible background change and **no** movement.
- [ ] The three still-live bans survive in the guard.

---

# PHASE B — vocabulary

## B1 — "Modes" are child pages. Delete the word.

**This answers the brief's open question, and the answer is already in the code.**

Every `SidebarModeItem` carries `to(): { pathname, params }` and every modeful page carries
`resolveMode(location)`. Those two halves round-trip (`resolveMode(apply(to(m))) === m`, pinned by
`sidebar-navigation.test.ts`). They are **distinct, deep-linkable, reload-safe URLs** —
`/products?view=qc`, `/shipping/ready`, `/warehouse?tab=racks`, `/studio/catalog`.

`nav-destinations.ts` already says so in its own docblock: *"`/products?view=qc` is a place, not a
setting."* The repo ruled a mode is a destination; it just never renamed the concept.

**So: a "mode" is a child page.** The nav vocabulary drops the word.

### The one thing that must NOT change

**`?mode=` as a URL parameter is a live wire contract.** `/dashboard?mode=sales`,
`/support?mode=voicemail`, `/review?mode=catalog-link` are bookmarked, and `getSidebarNavPageId`
parses them to decide which page owns a URL. **Never rename a param key or a param value.** This is
a rename of the *concept and the identifiers around it*, not of the wire.

Note the collision that makes this confusing and worth a comment in the code: `?mode=` on
`/dashboard` and `/support` means "which **domain** am I looking at", while the nav's `SidebarModeItem`
means "which **child page**". Two different meanings, one word — which is itself an argument for
dropping the nav-side one.

### Scope of the rename

| Rename | To |
|---|---|
| `SidebarModeItem` | `SidebarChildPage` |
| `SidebarPageNav.modes` | `.children` |
| `resolveMode` / `resolveSidebarMode` | `resolveChild` / `resolveSidebarChild` |
| `filterPageModes` | `filterPageChildren` |
| `ModeLocation` / `ModeNavTarget` / `applyModeTarget` | `ChildLocation` / `ChildNavTarget` / `applyChildTarget` |
| `NavDestination.modeId` | `.childId` |
| `useSidebarModeNav` / `useRecentModes` | `useSidebarChildNav` / `useRecentPages` |
| `HeaderModeSwitcher` | see the fork below |
| `MODE_ICON_GLYPH_KEYS`, `*_MODE_ICONS` | `*_CHILD_ICONS` (icon registries — rename last, they are noisy and low-risk) |

**Do this as a mechanical rename with the compiler as the guard**, one symbol at a time,
typechecking between each. Do not hand-edit call sites in bulk.

### The fork you must settle first: does the GlobalHeader Mode switcher survive?

`HeaderModeSwitcher` is the L2 control in the GlobalHeader, and `display/workbench-master-detail.md`
carries a hard law: *"L2 Mode + Recents live in GlobalHeader — never remount a full-width mode rail
as a twin of the header control."* If children become ordinary spine rows, that control is now a
**second door onto the same destinations**, which is the fork this repo bans everywhere else.

| | A ✅ | B |
|---|---|---|
| | Keep it, rename to a **page switcher**; it stays the fast in-page switch and the spine is the map | Delete it; the spine is the only door |
| Cost | Two doors onto one destination — but they answer different questions (*switch within where I am* vs *go somewhere*) | Loses the one-key in-page switch operators use most; the spine may be collapsed to 0 width |

**Recommendation: A.** The spine is unpersisted and starts collapsed on every load, so deleting the
header control would leave a bench operator with no visible way to switch a page's children at all.
Say which you took in the commit.

### Acceptance

- [ ] No identifier in `src/` contains `Mode`/`mode` in the *nav-child* sense (URL params, the domain
      `?mode=`, and unrelated uses like density modes are untouched).
- [ ] Every `?mode=`/`?view=`/`?tab=` **param key and value** byte-identical to before.
- [ ] `sidebar-navigation.test.ts` round-trip still green under the new names.
- [ ] Prose updated: `source-of-truth.md`, `display/workbench-master-detail.md`,
      `display/workbench.md`, `contextual-display.md` all say "child page", not "mode".

## B2 — The rename table

Labels only. **Never change a page `id`, `href`, or permission string** — ids are referenced by
`getSidebarNavPageId`, the ⌘K registry, and `staff_preferences`.

| Current | New | Why |
|---|---|---|
| Analytics Monitor | **Live Ops** | Drops the compound tech-noun; the altitude is implied |
| Scan Stations | **Workstations** | WMS-standard term for a physical bench |
| Scan Stations › Local Pickup | **Will Call** | Standard counter-pickup term |
| Catalog › Labels | **SKU Barcodes** | Disambiguates 1 of 3 |
| Catalog › Catalog link | **Listing match** | ⚠️ NOT "Public Link" — see Corrections |
| Inventory › Locations › Labels | **Bin Tags** | Disambiguates 2 of 3 |
| Fulfillment | **Outbound** | Pairs with Inbound. Label only — the `outbound` id is taken |
| Fulfillment › Labels | **Postage** | Disambiguates 3 of 3 |
| Support › Orders | **Inquiries** | Distinguishes a customer question from the fulfillment queue |

**Pressure-test before adopting: "Fulfillment › Orders → Queue".** The brief recommends it; I would
not ship it. "Queue" is the most overloaded word in this product — the Unbox strip already has a
Queue tab, and every station has one. A word that means "a list of work" everywhere cannot identify
one list. Prefer **"To ship"**, which names the work. Take the brief's version only if you can show
"Queue" is unambiguous in context.

**`DEAD_SECTION_LABELS` in the guard bans `Floor`, `Desk`, `Stock`, `Misc`, `Other`** as
unpredictable grab-bags. `Workstations` is a real place, so it is fine — but confirm the guard's
`Scan Stations` assertion is updated rather than deleted.

### Acceptance

- [ ] Zero `id` / `href` / `requires` changed.
- [ ] "Labels" now means exactly one thing in the nav; grep proves it.
- [ ] Guards updated for every changed label (several assert labels by string).
- [ ] `DEAD_SECTION_LABELS` still bans the grab-bags.

---

# PHASE C — structure

## C1 — Delete the drill-in (D2)

Six of eight sections hold exactly one page. The drill costs a click to reveal a row with the
section's own name — hierarchy with no content.

**Target:** one scrolling list. Sections become **non-interactive group headers**; their pages are
rows beneath. Multi-page groups (Workstations, Inventory) collapse in place; single-page groups
merge header and row into one link.

### What has to go

- `drillId` state in `MasterNav` + the auto-drill effect
- `renderRoot` / `renderDrill` in `SidebarNavList`; `MasterNavView`'s drill props
- `framerPresence.spineDrill` / `framerTransition.spineDrill` — **delete from `motion-framer.ts`
  too**, and remove the RESOLVED section in `motion-crossfade.md`. A preset with no consumer that
  a rules file still documents is exactly the fork `pattern-evolution.md` Always #6 is about.
- `spineSectionIdForPage`'s **drill** role — it still answers "which group heading does this row sit
  under", so keep the function, retire only the drill semantics.

### What must survive

- **The mixed axis.** Workstations must not be reachable only through the domain of the records it
  touches. Preserve it with a `border-t` divider between the Workstations block and the domain
  groups, per D2.
- **The row cascade** (`spineRowStagger*`) — it keys on the section id; with no drill, decide whether
  it fires on mount or not at all. A cascade on every cold load is time-to-interactive spent on rows
  the operator knows the position of; that reasoning is already in `SidebarNavList`'s docblock.
- **Hollow-group suppression.** `isSidebarPageReachable` + the empty-group rule must still drop a
  group whose every page is permission-filtered. Absent, never disabled.

### Test fallout — expect to rewrite, not tweak

- `main-nav-groups.guard.test.ts` — many assertions on `ChevronRight`/`ChevronLeft`, `onDrillChange`,
  the drill title, `key={drill-rows-${section.id}}`.
- `tests/e2e/sidebar-nav-search.spec.ts` — `SECTION_MAP` is `[role="group"][aria-label="Sections"]`;
  *"at rest the body is the section map"* and *"every result is an addressable destination, never a
  drill button"* both assume the drill.
- `tests/e2e/sidebar-open-close.spec.ts` — the open/close and edge-peek specs.

### Acceptance

- [ ] No drill state anywhere; one scrolling list at rest.
- [ ] The full list fits at 1440×900 without scrolling — **measure it in Playwright**, not the
      preview pane (`verify.md` → *Measure in the real runner*). If it does not fit, say so and stop;
      that is a finding, not something to solve with a scrollbar.
- [ ] Lateral navigation (Inbound → Support) is **one** click.
- [ ] Workstations still visually separated from the domain groups.
- [ ] `spineDrill` presets deleted from code *and* from `motion-crossfade.md`.

---

## Verify

```bash
npm run verify
npx playwright test tests/e2e/sidebar-open-close.spec.ts \
  tests/e2e/sidebar-nav-search.spec.ts \
  tests/e2e/cmdk-palette.spec.ts --project=desktop
```

Then look at it on `:3050` with the spine open. **A1's hover visibility and A2's subordination
legibility are judgement calls a green suite cannot confirm** — and both are the difference between
this landing and reading as unfinished.

**Do not** raise a ratchet baseline to make a gate pass — baselines only shrink.

**Red gates that are NOT this work** (other sessions in the shared tree — report, do not inherit or
fix). As of 2026-08-02 these were live and belong to the Unbox procedure-checklist session:

- `derive-capture-step-states.test.ts` — failures from a new `label` procedure step
- route-permission drift — `/api/receiving/lines/[id]/label-previewed` not in the manifest
- knip — `PROCEDURE_CHECKLIST_ROW_PX`, `UnboxProcedureChecklistProps`
- `dialog-shell.guard` — hand-rolled modal shells, from the right-rail push-inspector work

Re-check which are still live before you start; do not assume this list is current.

---

## Out of scope — say no to these

- **Changing the typeface or adding a second one.** The 14px-semibold / 12px-medium ladder is
  structurally sound and was bumped deliberately last week. The brief agrees.
- **Tooltips to explain a label.** If a label needs a tooltip, the label is wrong — fix the word.
- **Re-litigating the eight sections themselves.** Membership was ratified 2026-08-01; this handoff
  changes how they are *drawn and named*, not which pages belong where.
- **Touching the region contracts** (Station / Workbench / Monitor / Canvas). Nothing here reaches
  Layer A.
