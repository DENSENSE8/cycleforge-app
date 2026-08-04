# Handoff — MasterNav spine PHASE B: vocabulary ("modes" → child pages, + the rename table)

**For:** implementing agent (Claude Code / Cursor / Codex)
**From:** Cycle Forge engineering
**Date:** 2026-08-03
**Predecessor:** [`spine-visual-language-HANDOFF.md`](spine-visual-language-HANDOFF.md) — Phases A and C are **DONE**
**Status:** ready, with one blocking decision (§2) and one scope cut you must read before starting (§1)
**Lane:** `main` checkout — no ad-hoc branch. Attach to `:3050`. **User owns commits.**
**Product frame:** Cycle Forge multi-tenant reseller-ops SaaS. USAV is dogfood only.

**Paste for a new session:**

```
Read docs/todo/spine-vocabulary-phase-b-HANDOFF.md and execute it, then stop and report.

Phase A (neutral chrome) and Phase C (flatten) already shipped — §0 says exactly what
changed, and §1 says which parts of the original Phase B brief those changes INVALIDATED.
Read both before you touch anything; three of the nine renames now change nothing an
operator can see.

§2 is a fork you must settle FIRST and state in the commit. B1 is a compiler-guarded
mechanical rename (~200 call sites). B2 is labels only — never an id, href, or permission
string, and never a ?mode= param key or value.

Attach to :3050; never start/restart/kill the dev server. npm run verify before done.
```

---

## 0. What already shipped — the ground you are standing on

Phases A and C landed 2026-08-02/03 and are verified in the running app, not just in the diff.

| Ruling | State |
|---|---|
| Eight section hues deleted → one neutral 3-rung ladder | shipped; guard asserts the **absence** of any Tailwind hue |
| Glyph hover lift deleted; nothing in the spine travels | shipped; measured `transform: none` on every glyph |
| Page glyph stroke 2 → 1.5, incl. both chevrons | shipped; 16 glyphs measured at `1.5px` |
| **Child rows KEEP their glyph** (reverses the original A2) | shipped — see §1.1 |
| Section drill deleted; body is ONE flat map | shipped |
| **A section draws no row at all** — `border-t` + `aria-label` only | shipped — this is what removed `Catalog › Catalog` |
| Children expand for the **active page only** | shipped (reverses "modes stay always expanded") |
| `framerPresence.spineDrill` → `spineBodySwap`; `spineDrillFilter` deleted | shipped |

**Measured at 1440×900 (Playwright, the real runner):** resting map **543px against a 558px
port — it fits**; it overflows only by the active page's own children (Catalog, 7 children:
713px, 155px over). Lateral navigation is one click.

Rule files already rewritten: `source-of-truth.md`, `ui-design-system.md`,
`display/workbench-master-detail.md`, `display/motion-crossfade.md`, `contextual-display.md`.
**Do not re-describe the drill anywhere.** If you find prose that still does, it is a miss —
fix it rather than working around it.

---

## 1. What Phase C INVALIDATED in the original Phase B brief

Read this before the rename table. Two items materially changed and one reversed.

### 1.1 A2 was half-reversed — child rows kept their glyphs

The original Phase A said child/mode rows render no icon. That shipped and was **reversed the
same day at the bench**: a mode row is the switch between one page's siblings, which is the job
the GlobalHeader Mode menu draws *with the same icon set*. Two doors onto one destination must
not disagree about whether it has a face.

What child rows do not get is the heavier 2.25 stroke — at 14px a child glyph would out-draw
its own parent at 1.5. **Do not "restore" the icon-less child row**; the Nav chrome law now
reads *one stroke for every altitude of the spine*.

### 1.2 ⚠️ THREE SECTION RENAMES NOW CHANGE NOTHING VISIBLE — decide before doing them

**Phase C deleted the only surface that rendered a section label.** Sections draw no row; they
contribute a divider and an `aria-label`. Verified: the sole remaining consumers of
`SPINE_SECTIONS[].label` are

1. **⌘K band headings** (`CommandBarNavGroup.label` in `command-bar-nav-groups.ts`), and
2. the **flat-search `context` line** (`nav-destinations.ts` → `sectionLabel`).

So `Analytics Monitor → Live Ops`, `Scan Stations → Workstations`, and `Fulfillment → Outbound`
are now **⌘K-only renames**. That is not nothing — ⌘K is a real surface — but it is a much
smaller claim than the brief makes, and the brief's stated rationale ("the spine reads as
generated") no longer applies to them at all.

**Do them anyway if they are right on ⌘K's own terms; do not do them because the brief said
so.** Say in the commit which surface each rename actually changes. The page renames (§4) are
unaffected — those labels are still rows on screen.

### 1.3 The repo already ruled on repeated names — cite it, don't re-derive it

`nav-destinations.ts` has carried this since before either phase:

```ts
/**
 * Context is metadata, so it must SAY something the label does not. A page whose
 * name matches its section ("Inbound" inside Inbound) would otherwise render
 * `Inbound / INBOUND` — a second line that repeats the first and reads as a
 * rendering bug rather than as placement.
 */
```

The search layer had already ruled that a name repeating its parent is a bug. The spine simply
had not applied it. Phase C applied it structurally. **Any Phase B rename that would make a
page's name equal its section's name is therefore already wrong** — check before landing one.

---

## 2. THE FORK — settle this first, state it in the commit

**Does `HeaderModeSwitcher` survive B1?**

`display/workbench-master-detail.md` carries a hard law: *"L2 Mode + Recents live in
GlobalHeader — never remount a full-width mode rail as a twin of the header control."* That law
was written when the spine could not reach a mode without drilling. **The flatten changed the
facts:** a page's children are now ordinary spine rows, so the header control is a second door
onto the same destinations.

| | **A ✅ keep it, rename to a page switcher** | B delete it |
|---|---|---|
| For | Answers a different question (*switch within where I am* vs *go somewhere*); survives a collapsed spine | One door, no fork |
| Against | Two doors onto one destination | Loses the in-page switch operators use most |

**Recommendation: A, and the deciding fact is measurable rather than aesthetic.**
`ResponsiveLayout` holds `const [navOpen, setNavOpen] = useState(false)` — **unpersisted**, so
the spine is closed on every cold load. Deleting the header control would leave a bench
operator with no visible way to switch a page's children until they open a column that does not
remember being open. The "two doors" objection is real but it is the cheaper cost.

If you take A, **update the law's wording** so it stops resting on a premise the flatten
retired — it should ban a *twin mode rail*, not assert that the spine cannot reach a mode.

---

## 3. B1 — "modes" are child pages. Delete the word.

The answer is already in the code. Every `SidebarModeItem` carries `to(): { pathname, params }`
and every modeful page carries `resolveMode(location)`; the two round-trip (pinned by
`sidebar-navigation.test.ts`). They are distinct, deep-linkable, reload-safe URLs.
`nav-destinations.ts` says so in its own docblock: *"`/products?view=qc` is a place, not a
setting."* The repo ruled a mode is a destination and never renamed the concept.

### 3.1 The one thing that must NOT change

**`?mode=` as a URL parameter is a live wire contract.** `/dashboard?mode=sales`,
`/support?mode=voicemail`, `/review?mode=catalog-link` are bookmarked, and
`getSidebarNavPageId` parses them to decide which page owns a URL. **Never rename a param key
or a param value.** This renames the *concept and the identifiers around it*, not the wire.

Worth a comment at the seam: `?mode=` on `/dashboard` and `/support` means "which **domain**",
while the nav's `SidebarModeItem` means "which **child page**". Two meanings, one word — which
is itself the argument for dropping the nav-side one.

### 3.2 Scope, with real counts (measured 2026-08-03)

| Rename | To | Refs |
|---|---|---|
| `SidebarModeItem` | `SidebarChildPage` | 2 |
| `SidebarPageNav.modes` | `.children` | ~58 (`.modes`) |
| `resolveMode` | `resolveChild` | 29 |
| `resolveSidebarMode` | `resolveSidebarChild` | 66 |
| `filterPageModes` | `filterPageChildren` | 12 |
| `ModeLocation` / `ModeNavTarget` / `applyModeTarget` | `Child*` | 3 / 4 / 22 |
| `NavDestination.modeId` | `.childId` | ~53 (`modeId`) |
| `useSidebarModeNav` / `useRecentModes` | `useSidebarChildNav` / `useRecentPages` | 19 / 8 |
| `HeaderModeSwitcher` | per §2 | 20 |
| `MODE_ICON_GLYPH_KEYS`, `*_MODE_ICONS` | `*_CHILD_ICONS` | 11 — **do last**, noisy and low-risk |

**~200 call sites. Do this as a mechanical rename with the compiler as the guard, one symbol at
a time, typechecking between each.** Do not hand-edit call sites in bulk, and do not batch two
symbols into one pass — a failed typecheck must name one cause.

### 3.3 Local variables the compiler will NOT catch

`SidebarNavList.tsx` carries `highlightedModeId`, `modeCount`, `hasModes`, `showModes`,
`renderModeLikeRow`, and accent fields `modeActive` / `modeIdle` / `modeActiveIcon` /
`modeIdleIcon` (`spine-section-accent.ts`). These are internal, so nothing breaks if you miss
them — which is exactly why they will be missed. Sweep them in the same pass or the file ends
up bilingual.

### 3.4 Acceptance

- [ ] No identifier in `src/` uses `Mode`/`mode` in the **nav-child** sense. Untouched: URL
      params, the domain `?mode=`, density modes, and every other unrelated use.
- [ ] Every `?mode=` / `?view=` / `?tab=` **param key and value** byte-identical. Prove it with
      a grep diff, not by eye.
- [ ] `sidebar-navigation.test.ts` round-trip green under the new names.
- [ ] Guard + E2E prose updated — several tests say "mode" in assertion messages.
- [ ] Prose updated: `source-of-truth.md`, `display/workbench-master-detail.md`,
      `display/workbench.md`, `contextual-display.md`, `ui-design-system.md`.
- [ ] §2 fork stated in the commit.

---

## 4. B2 — the rename table

**Labels only. Never a page `id`, `href`, or permission string** — ids are referenced by
`getSidebarNavPageId`, the ⌘K registry, and `staff_preferences`.

| Current | New | Why | Visible where |
|---|---|---|---|
| Analytics Monitor | **Live Ops** | drops the compound tech-noun | ⌘K only (§1.2) |
| Scan Stations | **Workstations** | WMS-standard term for a physical bench | ⌘K only (§1.2) |
| Fulfillment | **Outbound** | pairs with Inbound | ⌘K only (§1.2) |
| Scan Stations › Local Pickup | **Will Call** | standard counter-pickup term | spine row |
| Catalog › Labels | **SKU Barcodes** | disambiguates 1 of 3 | spine row |
| Catalog › Catalog link | **Listing match** | ⚠️ **NOT "Public Link"** — see §4.1 | spine row |
| Inventory › Locations › Labels | **Bin Tags** | disambiguates 2 of 3 | spine row |
| Fulfillment › Labels | **Postage** | disambiguates 3 of 3 | spine row |
| Support › Orders | **Inquiries** | distinguishes a customer question from the fulfillment queue | spine row |

**The `Labels` collision is real and verified** — `sidebar-navigation.ts` lines 1016, 1087, 1151
all declare `label: 'Labels'` under three different parents. That is the single highest-value
group in this table, and unlike the section renames every one of them is a row on screen.

### 4.1 Corrections to the original brief — do not implement these as written

1. **"Catalog link → Public Link" is wrong.** `catalog-link` is `/review?mode=catalog-link`, the
   workflow for **linking a marketplace listing to a catalog SKU**. It is internal
   reconciliation; nothing about it is public. **"Listing match"** — it pairs with the sibling
   "Pairing" (serials to labels). Never "Public Link".
2. **"Fulfillment → Outbound" must not reuse the id.** `outbound` is already the page id of the
   Shipping row (`{ id: 'outbound', label: 'Shipping', href: '/shipping/labels' }`), and
   `outboundModeFromPath` / `OUTBOUND_MODE_PATHS` key off it. Label only.
3. **"Analytics Monitor → Live Ops, drop the child" is not available.** Operations has four real
   destinations (Live · TV · Analytics · History). Take the label; leave the children.

### 4.2 Pressure-test before adopting: "Fulfillment › Orders → Queue"

The brief recommends it. **I would not ship it.** "Queue" is the most overloaded word in this
product — the Unbox strip has a Queue tab and every station has one. A word meaning "a list of
work" everywhere cannot identify one list. Prefer **"To ship"**, which names the work. Take the
brief's version only if you can show "Queue" is unambiguous in context.

### 4.3 Acceptance

- [ ] Zero `id` / `href` / `requires` changed. Grep-prove it.
- [ ] "Labels" means exactly one thing in the nav; grep proves it.
- [ ] No renamed page label equals its section's label (§1.3).
- [ ] `DEAD_SECTION_LABELS` still bans `Floor`, `Desk`, `Stock`, `Misc`, `Other`.
      `Workstations` is a real place, so it is fine — but confirm the guard's `Scan Stations`
      assertion is **updated, not deleted**.
- [ ] Guards updated for every changed label (several assert labels by string).

---

## 5. Left over from Phase C — a finding, not a task

**The flat map overflows by up to 155px when a many-child page is active** (Catalog, 7
children: 713px content / 558px port). The resting map fits at 543px. The overflow is the
active page's own children, sitting directly under the row the operator is on.

This was reported, not solved. **Do not open it as part of Phase B** — it is a separate
judgement about whether the active page's children should scroll into view, collapse, or be
capped, and it needs bench observation rather than a rename. If it turns out to matter, it gets
its own handoff.

---

## 6. Verify

```bash
npm run verify
```

```bash
npx playwright test tests/e2e/sidebar-nav-search.spec.ts tests/e2e/sidebar-open-close.spec.ts tests/e2e/cmdk-palette.spec.ts --project=desktop
```

Then look at it on `:3050` with the spine open. **B2 is a copy change — a green suite cannot
tell you whether a word is the right word.** Read the map top to bottom as an operator who has
never seen it.

**Do not** raise a ratchet baseline to make a gate pass — baselines only shrink.

**Red gates that are NOT this work.** As of 2026-08-03 the tree holds another session's
receiving/support work. Knip showed 6 findings under `src/hooks/useRequesterProfile.ts`,
`src/lib/interop/gs1-keys.ts`, `src/lib/neon/sku-catalog-queries.ts` and
`src/lib/support/requester-profile.ts`. **Re-check which are still live before you start; do
not assume this list is current, and do not inherit or fix them** — report which failures are
pre-existing.

One housekeeping note: `docs/portfolio/DOC-CATALOG.md` + `INDEX.md` were regenerated
(`node scripts/portfolio-sot-sync.mjs`) during Phase C to clear a stale doc-catalog gate. Those
files were already modified by another session; the sync is deterministic regeneration from
`docs/`, so nothing was clobbered.

---

## 7. Out of scope — say no to these

- **Re-litigating Phase A or C.** The hues, the lift, the drill and the section header rows are
  ruled and guarded. A rename does not reopen them.
- **Changing the typeface or adding a second one.** The 14px-semibold / 12px-medium ladder is
  structurally sound and was bumped deliberately.
- **Tooltips to explain a label.** If a label needs a tooltip, the label is wrong — fix the word.
- **Re-litigating the eight sections themselves.** Membership was ratified 2026-08-01; this
  changes what they are *called*, not which pages belong where.
- **Touching the region contracts** (Station / Workbench / Monitor / Canvas). Nothing here
  reaches Layer A.
