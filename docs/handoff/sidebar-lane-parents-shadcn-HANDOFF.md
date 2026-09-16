# HANDOFF — Lane parents on the shadcn Sidebar, one nav for phone and desk

**For:** a fresh-context coding agent. Paste this whole file as the prompt.
**Written:** 2026-09-14, after N4 / N5 / N6 / N6b landed in `cycleforge-lanes/prod`.
**Plan of record:** [`docs/todo/nav-lanes-reports-IA-PLAN.md`](../todo/nav-lanes-reports-IA-PLAN.md)
(§1b ledger carries what is already done). Parent program:
[`docs/todo/mobile-first-foundation-PLAN.md`](../todo/mobile-first-foundation-PLAN.md) — its increment
rules bind (≤6 files, strangler, reversible, `verify:fast` green, unbox 56/56, append the ledger).
**Binding law:** [`AGENTS.md`](../../AGENTS.md) ·
[`docs/mobile-first/SURFACE_LAW.md`](../mobile-first/SURFACE_LAW.md) · design-mcp before/after any
`src/**/*.{tsx,jsx,css}` write.

---

## Operator directives (verbatim, binding)

- *"outbound should be a parent and it should display FBA page and shipping"*
- *"the inbound and outbound should display the parents navigation like this sidebar component as
  well, and they should all be under parents for the sidebar"* — followed by the shadcn
  `SidebarProvider → Sidebar → SidebarContent → SidebarGroup → SidebarMenu → SidebarMenuItem →
  SidebarMenuButton / SidebarMenuSub` tree and its `SIDEBAR_WIDTH` / `SIDEBAR_WIDTH_MOBILE` / `⌘B`
  contract.
- *"it must be the same for the mobile and the desktop since all the desktop pages will be mobile
  first"*

---

## 1. Mission in one line

Paint the **lane band** (Inbound · Outbound · Inventory · Products · Sales · Support · Operations) on
the **shadcn `Sidebar*` primitives**, give **Outbound real children (Shipping + FBA)**, and drive
**phone and desk from one registry** so the `/m` drawer and the desk spine cannot disagree.

---

## 2. Ground truth — the decisive finding, verified 2026-09-14

**The two worktrees each hold one half of what the operator is asking for.** Do not rebuild either
half from scratch.

| | `cycleforge-app` (`main`) | `cycleforge-lanes/prod` (here) |
|---|---|---|
| shadcn `Sidebar*` component layer | ✅ **`src/components/ui/sidebar.tsx`, 716 lines**, all primitives (`SidebarProvider`…`SidebarMenuSub`) | ❌ **absent** — `src/components/ui/` holds only `BottomSheet`, `HoverTooltip`, `IconWithTooltip` |
| Spine already consuming it | ✅ `MasterNavView` mounts `SidebarProvider` + `Sidebar`; `SidebarNavList` uses `SidebarGroup` ×10, `SidebarGroupLabel` ×5, `SidebarGroupContent` ×7, `SidebarMenu` ×7, `SidebarMenuItem/Button` ×3 | ❌ hand-rolled: raw `<button>`, `SectionTriggerFace`, `SortableTitleRow` |
| Lane IA | ❌ **old**: `DESK_GROUPS = [{ id:'desks', label:'Workspaces' }]`, `DOMAIN_GROUPS` with `sourcing` separate and `fulfillment` faced *"Shipping"* | ✅ **v3**: no Workspaces parent, lanes are L0 slots, `fulfillment` faced *"Outbound"*, `sourcing` folded into `inbound` |
| Deps | `radix-ui@^1.6.7`, `ui/sheet.tsx`, `hooks/use-mobile.ts` | **`radix-ui` absent**, `ui/sheet.tsx` absent, `use-mobile.ts` absent |

Divergence is real, not "prod is behind": **1429 prod-only commits, 1586 main-only commits, `main` is
not an ancestor.** Both working trees are dirty (`cycleforge-app` has 909 modified files).

**So the job is a port + merge, not a build.** `main`'s `sidebar.tsx` is already adapted to house
law — it imports `HoverTooltip`, `focusRing`, and `SPINE_ROW_DENSITY` from
`@/components/sidebar/sidebar-spine` — so the component layer arrives house-shaped, not stock shadcn.

---

## 3. The structure mapping (what "under parents" means concretely)

Lane → `SidebarGroup`. That is the whole translation:

```
SidebarProvider                     ← MasterNavView (already this shape on main)
└── Sidebar collapsible="none"
    ├── SidebarHeader               ← Daily · Media Library (structural top rows)
    ├── SidebarContent
    │   ├── SidebarGroup            ← LANE: Inbound
    │   │   ├── SidebarGroupLabel   ←   "Inbound"   (disclosure trigger)
    │   │   └── SidebarGroupContent
    │   │       └── SidebarMenu
    │   │           ├── SidebarMenuItem → SidebarMenuButton   ← Inbound desk (/incoming)
    │   │           └── SidebarMenuItem → SidebarMenuButton   ← Sourcing (/sourcing)
    │   ├── SidebarGroup            ← LANE: Outbound
    │   │   └── SidebarMenu
    │   │       ├── SidebarMenuItem → SidebarMenuButton   ← Shipping (/shipping/orders)
    │   │       │                   └── SidebarMenuBadge  ← exceptions count (honest absence only)
    │   │       └── SidebarMenuItem → SidebarMenuButton   ← FBA (/shipping/fba)
    │   ├── SidebarGroup            ← single-page lanes: Inventory · Products · Sales · Support
    │   │   └── SidebarMenu → one SidebarMenuItem wearing the LANE label
    │   ├── SidebarGroup            ← LANE: Operations  (+ Reports when R1 lands)
    │   └── SidebarGroup            ← Scan Stations  (8 benches — see §7 REFUSALS)
    ├── SidebarFooter               ← StaffAccountFooter / MobileAccountFooter
    └── SidebarRail
```

**`SidebarMenuSub` is for a page's own CHILD MODES, not for lanes.** A lane's pages are
`SidebarMenuItem`s in its `SidebarMenu`; `SidebarMenuSub` is where a `SidebarPageNav.children` list
would go for a page that is **not** `deskChrome: true`. Most desks here are `deskChrome`, so they draw
their own tabs and must **not** get a `SidebarMenuSub` — that is the existing law: *"a desk that tabs
its own pages does not need the nav to tab them a second time."*

**Keep the single-page-lane collapse rule** (already shipped in prod): a lane with exactly one page
renders as one row wearing the **lane** label. Four of seven lanes are single-page; a
`SidebarGroupLabel` over a lone `SidebarMenuItem` is a wasted row.

---

## 4. Outbound as a parent — and the two rulings it retires

The operator wants Outbound to show **Shipping + FBA**. That is currently **forbidden twice** in
`src/lib/sidebar-navigation.ts`. Do not just add the row — retire both rulings explicitly, in the
docblocks, citing this handoff:

1. **"`/fba` stays off the spine because it permanently redirects into Shipping (no second front
   door)."** `fba` exists in `SIDEBAR_PAGE_NAV` (`domainGroup: 'fulfillment'`, label *Amazon Prep*)
   but is deliberately absent from `APP_SIDEBAR_NAV`. `/fba` is a `redirect(fbaOutboundHref(…))`.
2. **The `deskChrome` law.** *Amazon Prep* is today a **tab inside the Shipping desk**
   (`outbound.children` → `{ id: 'fba', label: 'Amazon Prep', to: OUTBOUND_MODE_PATHS.fba }`).

**The honest cutover (do this, not a half-measure):**

- Add `fba` to `APP_SIDEBAR_NAV` with `href: '/shipping/fba'` — the **real desk route**, never `/fba`
  (which is a redirect hop and would reintroduce the second front door the ruling was about).
- **Remove `fba` from `outbound.children`.** Otherwise the lane row and the desk tab are two doors to
  one page, which is exactly what ruling 2 forbids. Shipping's tabs become
  **Pending · To ship · Shipped · Exceptions**.
- `resolveChild` on `outbound` must stop returning `'fba'`; `getSidebarNavPageId` must resolve
  `/shipping/fba` to the **`fba`** page id so the spine lights the right row.
- Keep the label *Amazon Prep* or face it *FBA* — operator's words were "FBA page". **Ask if
  unsure**; `SHIPPING_NAV_ICONS.fba` already exists either way.
- Outbound now has 2 pages, so the collapse rule stops applying and it renders as a real
  `SidebarGroup` with a `SidebarGroupLabel`. **That is what makes it a parent** — no extra flag.

**Do NOT re-face the `outbound` page row.** The lane is *Outbound*; the desk keeps *Shipping* for its
header chip, ⌘K and recents. `grep -rln "'Shipping'" src` → 20 files, and `surface-keys.ts`,
`timeline-glyphs.ts`, `order-station-sections.ts`, `milestone-pipeline-types.ts` use "Shipping" as a
**station/milestone** word. Renaming leaks into vocabulary that is not nav.

---

## 5. One nav for phone and desk (the mobile-first half)

**The real problem is two registries, not two components.**

| Surface | Registry today |
|---|---|
| Desk spine | `APP_SIDEBAR_NAV` + `SIDEBAR_PAGE_NAV` (`src/lib/sidebar-navigation.ts`) |
| `/m` drawer | `MOBILE_NAV_DESTINATIONS` (`src/lib/mobile/nav-registry.ts`) |

They already disagree: `/m/work` is the **mobile landing default** and has **no drawer row**; the
drawer has no Outbound grouping at all.

**Target:** the lane band is declared once and both surfaces consume it. shadcn `Sidebar` is built for
exactly this — `useIsMobile()` swaps the same tree into a `Sheet` at `--sidebar-width-mobile`, so
**one component, two presentations**, which is SURFACE_LAW §4's frame law expressed in a primitive.

Constraints that make this legal and safe:

- **`src/components/ui/**` is the platform layer**, so both desk and `/m` may import it without a new
  boundary crossing. The `Boundary` gate is `profiles: 'always'` in `verify-profile.mjs` and the
  baseline is **shrink-only (95)** — check with `ds_boundary <file>` *before* the first import, not
  after. A mobile surface importing a **desktop feature** component is still forbidden.
- **Do not delete `MobileSidebarDrawer` in the same increment as the port.** Strangler: the drawer
  keeps rendering from the registry while the shared lane source lands beneath it, then the drawer
  becomes a thin `Sidebar` mobile-variant mount in its own increment.
- **Scan stays out of the drawer** — permanent top-right CTA (`nav-registry.ts:47-49`, 2026-08-21). A
  `SidebarMenuItem` for Scan is a second door.
- **No bottom nav.** The drawer replaced it; reviving one needs an operator ruling, not a component.
- **Lane ids must survive being nav keys on both sides.** They already do (`inbound`, `fulfillment`,
  …) — see the **namespace hazard** note in the `SPINE_LANE_SLOT_IDS` docblock before adding any
  `kind: 'domain'` page.
- **`⌘B` must not collide.** prod binds `⌘;` (nav-keys leader) and `⌘1-9` (pins), and
  `KeyboardShortcutsCheatSheet` owns `?`. Check `src/lib/keyboard/` for a live `⌘B` before wiring
  `SidebarProvider`'s shortcut; if it is taken, the trigger gets a different key and the docblock says
  why.

---

## 5b. STATUS — S1 · S2 · S3 · S4 · S5 landed 2026-09-14

**S1 → S5 are DONE. Start at S6.** The ledger with the measured proof, the
deliberate deviations and the pre-existing failures is
[`nav-lanes-reports-IA-PLAN.md` §1b.-1](../todo/nav-lanes-reports-IA-PLAN.md).
Binding summary so this file cannot mislead the next agent:

| Increment | State | Note |
|---|---|---|
| **N6c** icon at the parent level only | ✅ | New operator ruling; not in §6. Glyph = parent (L0 row or lane header). **The law lives in the REGISTRIES** (`nav/lanes.ts`, and the `/m` types) — never a renderer-side icon map. |
| **S1** port the component layer | ✅ | `ui/sidebar.tsx` + `ui/sheet.tsx`. **No `radix-ui` umbrella** (`@radix-ui/react-slot` + `@radix-ui/react-dialog` are installed). **No `use-mobile.ts`** — `useIsMobile` already lives in `src/hooks/_ui.ts`. |
| **S2 + S3** shell + lanes as `SidebarGroup` | ✅ | One increment: same two files, no useful intermediate. |
| **S4** Outbound gets FBA | ✅ | Row → `/shipping/fba`, faced **FBA**; Amazon Prep tab deleted; `getSidebarNavPageId('/shipping/fba') === 'fba'`; `fba` page gained `railless: true`. |
| **S5** shared lane source for `/m` | ✅ | `src/lib/nav/lanes.ts` is the one lane taxonomy both surfaces import. Drawer group `receiving` → **Inbound**; new **Outbound** group = `/m/work` (KEPT) + `/m/pick` (LIVE). `NAV_ITEM_ICONS` deleted. |
| **N6d** full ROW ink | ✅ | Operator: *"all black, all consistent with the top three items."* `SPINE_ACCENT` + `SPINE_ACCENT_DATA_ACTIVE` live inside `SidebarMenuButton`. **Do not re-grey the group label** — here the lane header is a destination, not a caption. |
| **N6e** a child never wears its parent's name | ✅ | `/incoming` row faced **Deliveries**, first tab **On the way**; wire id + path unchanged, `keywords` carry the retired word. Machine-law: `nav-name-collisions.ts` → `nav-name-collisions.test.ts` → `scripts/nav-name-guard.ts` → **`ds_nav_names`**. Answers Q1. |
| **N6f** the child rail replaces the indent | ✅ | `SPINE_CHILD_ROW_INDENT_CLASS` (`pl-8`) **deleted**, not deprecated. The child mark is `spineRailLineClass` on BOTH surfaces — one element, two colour tokens. Never stack an indent beside it. |
| **N6g** the mobile-first gate | ✅ | `LANE_MOBILE_FIRST` (`nav/lanes.ts`) is the porting ledger; the gate is applied inside `getSidebarNavItems`, the one funnel. Hidden: Sales · Support · Operations. Kept `desk-only`: Inbound · Outbound · Inventory · Products. Gate `Mobile-first` (**always**) + **`ds_mobile_first`**. |
| **N6h** the child rail's COLUMN | ✅ | Rail moved from the parent's left PAD to the parent's GLYPH column via one derived token, `SPINE_CHILD_RAIL_INSET_CLASS` (`pl-[15px]` = `px-2` + half a 16px glyph − half a 2px rail), consumed by the desk group body AND the `/m` drawer. Operator: *"aligned with the icon of the parent."* Per-row spans kept over `SidebarMenuSub`'s single `border-l` so the active row can still be marked. |
| **N6i** the ⌘K gate leak | ✅ | `buildCommandBarNavGroups` fell back to raw `APP_SIDEBAR_NAV` with no permission set and shipped Sales · Support · Operations bands to the unauthenticated path. Now reads `getSidebarNavItems({ permissions })` on both paths; pinned in `nav-mobile-first.test.ts` (palette + stale-saved-spine-order). |
| **S6** drawer → `Sidebar` mobile variant | ⏭ | **Next.** `Sidebar collapsible="sheet"` is already the mobile branch, waiting for a mount. |

**§3's "keep the single-page-lane collapse rule" is SUPERSEDED.** A later
operator ruling (2026-09-14, landed by a parallel session) expands a lone page
into its own children instead: *"create different parents and expand them into
different childs."* Only a childless or `spineFlat` page stays a flat row. §3 and
§4's collapse sentences predate that.

**§5's registry plan needs one correction:** the phone's ROWS cannot mirror desk
lane pages — there is no `/m/shipping` or `/m/fba`, and inventing one is a new
surface, not a registry refactor. What S5 shared is the lane TAXONOMY (label +
parent icon) over mobile-surviving routes only.

**§7 gains a refusal: do not row up a GATED `/m` route.** `Add order`
(`/m/orders/new`) **lost its drawer row in S5**, and the next agent should
inherit the tension, not one side of it: the row was **pre-existing** (§1.7 line
28 notes *"`orders-new` has a drawer row today"*) while the same table's N9
consequence says *"the drawer may only row up LIVE and KEPT routes."* The law
reads against carrying it into a new lane; continuity reads for keeping a live
door. It shipped removed because the written law is the only recorded decision.
The route still resolves and `matchPrefixes` still claims `/m/orders`, so
reversing this is one line in `MOBILE_NAV_DESTINATIONS`. Inbound's three GATED
rows (`Consult`, `?mode=local-pickup`, `?mode=repair`) are still standing —
§1.7 sequences those behind U4 → U5 → N9.

**§2's ground-truth table is now partly stale**: `src/components/ui/` holds ~80
files here (`button`, `dialog`, `popover`, `command`, `calendar`, …), not three.
Re-measure before trusting any "absent in prod" claim in this file.

**§6's S1 recipe was wrong in three places** — do not repeat it if S1 is ever
revisited: prod's spine is drag-resizable so upstream's `fixed` overlay + gap
machinery and its `offcanvas`/`icon`/`floating`/`inset` modes were dropped (the
host owns width/collapse/persistence); `SidebarRail` + `SidebarTrigger` were
dropped for the same reason; `SidebarMenuSkeleton` was dropped because it picks a
`Math.random()` width during render (hydration mismatch).

**§9 answers, settled by measurement:**

- **Q2 (FBA label):** **FBA** — the operator's own word.
- **Q3 (`⌘B`):** **no chord at all.** The ported provider binds nothing, so it
  cannot collide with `⌘;`, `⌘1-9` or `?`. Nothing to decide.
- **Q1 (Inbound stutter):** still open — the lane and its `/incoming` row are
  both faced *Inbound*. Needs an operator ruling, not an inference.
- **Q4 (where the law lives):** the spine rules are now in
  [`AGENTS.md`](../../AGENTS.md) › *Sidebar spine*. The `mobile-first` refuse
  cohort is still blocked in this worktree (no `router.json`).
- **NEW — `/m/orders/new`:** keep the *Add order* drawer row (needs a §1.7
  exception) or leave it removed? See §5b. Nothing else in the drawer depends on
  the answer.

---

## 6. Increments (each green alone, ≤6 files)

**S1 — port the component layer.** Cherry-pick from `cycleforge-app`: `src/components/ui/sidebar.tsx`,
`src/components/ui/sheet.tsx`, `src/hooks/use-mobile.ts`, and add `radix-ui` to `package.json`
(prod has `class-variance-authority` and `@radix-ui/react-dialog` already; `radix-ui` is **absent**).
Do not port `main`'s `sidebar-navigation.ts` — prod's v3 IA is the one that survives.
**Accept:** `pnpm verify:fast` green · `ds_boundary src/components/ui/sidebar.tsx` shows no NEW
crossing · nothing mounts it yet.

**S2 — mount the shell.** `MasterNavView` wraps `SidebarProvider` + `Sidebar collapsible="none"`
(copy `main`'s shape). Geometry still comes from the host — `SidebarNavList` owns no width.
**Accept:** spine renders identically to today; `ds_critique` no new problems.

**S3 — lanes become `SidebarGroup`.** Replace `renderLane`'s hand-rolled `SectionTriggerFace` +
`renderSection` with `SidebarGroup` / `SidebarGroupLabel` / `SidebarGroupContent` / `SidebarMenu` /
`SidebarMenuItem` / `SidebarMenuButton`. Keep: the single-page collapse rule, `desks/<laneId>`
collapse keys, `useSpineSectionCollapse`, empty-lane omission, and the dnd-kit invariant
(`SortableContext items={spineOrder}` — every slot id must resolve to exactly **one** node;
`spine-slots.test.ts` asserts this).
**Accept:** the four probe cases in the plan's §1b ledger still paint identically · drag still reorders
lanes · `eslint` clean.

**S4 — Outbound gets FBA** (§4, including both ruling retirements and the tab removal).
**Accept:** spine shows `Outbound › Shipping · FBA` · `/shipping/fba` lights the FBA row, not To-ship ·
Shipping desk shows 4 tabs · the `resolveChild(apply(to(child))) === child` round-trip invariant holds.

**S5 — shared lane source for `/m`.** Derive the drawer's groups from the lane registry instead of
hand-written `MOBILE_NAV_DESTINATIONS` entries; add the missing **`/m/work`** row. Respect the U2
survival standing in the plan's §1.7 — only **LIVE**/**KEPT** routes get a row, and `/m/unbox`,
`/m/receive`, `/m/triage` are **DELETE** (Track U), so do not row them up on the way out.
**Accept:** `nav-registry.test.ts` green · exactly one active row per location · unbox 56/56.

**S6 — the drawer becomes a `Sidebar` mobile variant.** Delete the hand-rolled slide-over; keep
`MobileAccountFooter` in `SidebarFooter` (U1 geometry law: no `border-t`, `elevationClass('raised','soft')`,
`min-h-11`).
**Accept:** phone drawer and desk spine render from one tree · fixed phone column on `lg+` per
SURFACE_LAW §4 · boundary baseline **shrinks or holds**.

---

## 7. REFUSALS — do not do these

- **Do not dissolve Scan Stations into L0 rows.** `SPINE_SECTIONS`' docblock is law: *"Scan Stations
  is an INPUT MODEL; the rest are DOMAINS."* The grouping encodes the **scan-first vs pointer-first
  interaction contract** (the superseded `station-nav-floor-desk-PLAN.md` §1 researched and locked
  this), and eight benches as top-level rows would re-flood the map the lanes just cleaned up.
  It needs an explicit operator ruling, not an inference from "lanes are parents".
- **Do not mount stock shadcn `sidebar.tsx`.** Port `main`'s adapted copy: `HoverTooltip`,
  `focusRing`, `SPINE_ROW_DENSITY`.
- **Do not add a second nav registry.** The whole point of S5 is removing the one that exists.
- **Do not put `SidebarMenuSub` under a `deskChrome` desk** (§3).
- **Do not paint a `SidebarMenuBadge` with a fake `0`.** `DeskPageTab.count` law: omit when unknown.
- **Do not point the FBA row at `/fba`** — that is the redirect hop the "no second front door" ruling
  was about.

---

## 8. Close-out, every increment

```bash
pnpm verify:fast                                  # Lint · Typecheck · Boundary (95 baseline)
node --import tsx --test src/lib/nav/spine-slots.test.ts          # 26 incl. dnd + namespace invariants
node --import tsx --test src/lib/sidebar-navigation.test.ts       # 34
node --import tsx --test src/lib/nav/command-bar-nav-groups.test.ts  # 8
node --import tsx --test src/lib/nav/nav-destinations.test.ts src/lib/nav/nav-search.test.ts
node --import tsx --test src/lib/mobile/nav-registry.test.ts      # S5/S6
node tools/design-mcp/smoke.mjs                   # expect "smoke: all good"
```

**design-mcp caveat that will bite you.** The MCP-facing `ds_critique` / `ds_contract` describe
**`cycleforge-app`, not this worktree** — `.cursor/mcp.json` aims the server at that checkout. It
reported *795 lines* for a 620-line file and returned `@/components/ui/sidebar` as if it existed here.
**Only the local CLI verdict counts:**

```bash
node tools/design-mcp/ds.mjs contract "<job>"
node tools/design-mcp/ds.mjs critique <file>      # run before AND after; compare problem sets
```

`src/components/mobile/**` is now a registered primitive home and the mobile pins are in
`pinned.json`, so `ds_contract "phone shell for an /m page"` answers `MobileShell` — use it.

**Visual proof is owed and currently impossible.** The dev server answers on `:3050` but the omp
browser relay extension is not connected (`omp browser-relay install`, badge must read "on"). Every
nav increment so far is verified by throwaway probe over
`getSidebarNavItems()` → `migrateSpineSlots` → `resolveSpineMapEntries`, **not by eye**. Either fix the
relay and screenshot the spine, or state plainly in the ledger that the paint is unverified.

---

## 9. Open operator questions — ask, do not guess

1. ~~**`Inbound` lane contains a row also faced `Inbound`**~~ **ANSWERED &
   ENFORCED (2026-09-14).** Operator: *"it should never display the same child
   and parent name."* The lane keeps **Inbound** (direction); the `/incoming`
   row is faced **Deliveries** (object) and its first tab **On the way**
   (state); wire id and path stay `incoming`, and `keywords` carry the retired
   word so ⌘K still answers "inbound". The older ruling *"Face is Inbound
   everywhere"* is retired — it is what produced the stutter. Now machine-law:
   `src/lib/nav/nav-name-collisions.ts` (rule) → `nav-name-collisions.test.ts`
   (verify **Unit tests** gate) → `scripts/nav-name-guard.ts` (CLI) →
   **`ds_nav_names`** (MCP face). Covers lane→row, lane→expanded child,
   page→desk tab and `/m` group→row on both surfaces.
2. ~~**FBA row label:** *FBA* or *Amazon Prep*?~~ **ANSWERED: FBA**, the operator's own word (S4).
3. ~~**`⌘B`** for the sidebar trigger?~~ **ANSWERED: no chord at all** — the ported provider binds
   nothing, so nothing can collide with `⌘;`, `⌘1-9` or `?` (S1).
4. **Where does the law live long-term** — prod's monolith `tools/design-mcp/server.mjs` has no
   `router.json`, so the `mobile-first` refuse cohort (plan §1b.4) cannot be enforced here. Port the
   Garisek engine shim into prod, or author cohorts in `cycleforge-app`? *(Partial: the spine rules
   now live in [`AGENTS.md`](../../AGENTS.md) › Sidebar spine; the refuse cohort is still blocked.)*
5. **`/m/orders/new` — does *Add order* keep a drawer row?** S5 **removed** it: §1.7 marks the route
   **GATED** and the same table's N9 consequence is *"the drawer may only row up LIVE and KEPT
   routes"*, so carrying a pre-existing anomaly into a lane I was authoring would have re-granted it
   by coat-tails. Continuity argues the other way — it is a live door today. The route still
   resolves and `matchPrefixes` still claims `/m/orders`, so **reinstating the row is one line in
   `MOBILE_NAV_DESTINATIONS`**; removing Inbound's three remaining GATED rows (`Consult`,
   `?mode=local-pickup`, `?mode=repair`) is sequenced behind U4 → U5 → N9. See §5b.
6. **Do Scan Stations and Automations stay as they are?** — NEW, opened by N6g.
   `LANE_MOBILE_FIRST` gates the seven DOMAIN lanes; `floor` (Scan Stations)
   and `studio` (Automations) are **ungated on purpose** because the operator's
   hide list (*"hide the operations, support, and sales"*) and keep list
   (*"keep the products, inventory, outbound, and inbound"*) named neither.
   Both readings are defensible and neither is mine to pick: Scan Stations
   arguably **must** stay — the benches ARE the phone surface, so gating them
   would hide the one lane that is already mobile-first — while Automations is
   a desktop pan/zoom canvas already listed in `MOBILE_RESTRICTED_SIDEBAR_IDS`,
   which is the profile the gate exists to hide. `isLaneVisible` returns true
   for an id with no ledger entry, so the current behaviour is "both display",
   and `nav-mobile-first.test.ts` excludes exactly these two ids from its
   "no lane escapes the ledger" assertion. Adding either one is a one-line
   flip; inferring it is not.
