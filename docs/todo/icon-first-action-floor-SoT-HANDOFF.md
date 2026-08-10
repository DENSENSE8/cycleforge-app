# Icon-first action-floor — SoT for EVERY right rail (HANDOFF)

**Status:** OPEN — golden shipped on Unbox Displays; port to all other right rails.
**Date:** 2026-08-09
**Owner intent (verbatim):** the Unbox scan station's new **bottom-dock display method** —
*icons first* (`⋯` overflow · Sync · Print · Edit · red Delete, with `→|` park below) — **must
be the SoT action floor for all the different right rails.**

This is the picture:

```
┌──────────────────────────────────────────────────────────────┐
│   ⋯        ⟳         🖨          ✏️              🗑 (red)      │  ← icon row (h-11, spread)
├──────────────────────────────────────────────────────────────┤
│                                                          →|   │  ← close/park chrome (below)
└──────────────────────────────────────────────────────────────┘
```

Equal fill-width icon columns (the hit target **is** the column), delete far-right, secondary
verbs in the `⋯` overflow, the `→|` park/close chrome on its **own row below** the floor.

---

## 1. The display method (exact contract)

| Concern | Contract | Source |
|---|---|---|
| Shell | `FlushTerminalFooter layout="spread"` — equal `flex-1` peers, **no dead air**, never floating `w-11` islands with a justify-between gutter | `src/design-system/primitives/FlushTerminalFooter.tsx` |
| Peer class | `FLUSH_TERMINAL_SPREAD_PEER_CLASS` (`flex h-full w-full flex-1 items-center justify-center self-stretch p-0`) on **every** control | same file |
| Control | `IconButton size="fill"` — fills the peer column; never `size="touch"` + justify-between, never hand-set `h-*/w-*` | `src/design-system/primitives/IconButton.tsx` |
| Icon-cell face | `SECTION_TAB_ICON_CELL_IDLE_CLASS`; selected/underline = `SECTION_TAB_ICON_CELL_ACTIVE_CLASS` (e.g. Edit while its leaf is open) | `SectionTabsSlider.tsx` |
| Height | `h-11` (matches Unbox dock Band 1) | `StationDisplaysActionFloor` |
| Order | `⋯ More · Sync · Print · Edit · Delete` — **Delete far-right** | golden below |
| Overflow | `⋯` holds secondary verbs (e.g. Resolve when unfound); disabled when none | `station-displays-carton-floor.ts` |
| Delete | **reuse `InspectorFlushDelete`** (red trash, two-click arm) with `FLUSH_TERMINAL_SPREAD_PEER_CLASS border-l-0` — already the shared primitive | `src/components/right-rail/InspectorFlushDelete.tsx` |
| Tooltip | each icon wraps `HoverTooltip` (icons need a label — discoverability) | golden |
| Placement | floor sits **above** the column's close/park chrome (`→|` / Filter footer) — never below it | `StationDisplaysPushColumn` guard |
| Empty | render `null` when no children — never an empty bar | `StationDisplaysActionFloor` |

---

## 2. Golden reference (already built — do NOT rebuild)

| Piece | File |
|---|---|
| Renderer (shell) | `src/components/station/displays/StationDisplaysActionFloor.tsx` |
| Unbox adapter (the screenshot) | `src/components/receiving/workspace/line-edit/UnboxDisplaysActionFloor.tsx` |
| Pure descriptors (primary / overflow) | `src/lib/receiving/station-displays-carton-floor.ts` |
| Mount (floor above close chrome) | `StationDisplaysPushColumn` / `StationDisplaysPushStack` (`actionFloor` prop) |
| Guard (spread golden) | `src/components/station/displays/station-displays-action-floor.guard.test.ts` |

Unbox wires: `⋯ More · ⟳ Zoho inventory Sync · 🖨 Print · ✏️ Edit (opens Linkage) · 🗑 Delete carton`.

---

## 3. What must adopt it — every right-rail action floor

Today there are **two** action-floor grammars; this handoff collapses them to **one display
method**. The desk floors currently render a **labelled cluster** (`FlushTerminalFooter
layout="cluster"` + text buttons + a trailing delete icon). They must become **icons-first
spread**.

Desk consumers (from `DESK_FLOOR_CONSUMERS` in `inspector-action-floor.guard.test.ts`):

| Rail | File | Current (labelled) | Icons-first target (`⋯` overflow · icon row · far-right 🗑) |
|---|---|---|---|
| Orders | `shipped/details-panel/OrderUpdateDock.tsx` | Assign · Notes · Out-of-stock · Mark shipped + 🗑 | `⋯`(Notes · OOS) · 👤 Assign · 🚚 Ship · ✏️ Edit · 🗑 |
| Incoming | `sidebar/receiving/IncomingDetailsPanel.tsx` | (Sync on chrome) + 🗑 | `⋯` · ⟳ Sync · ✏️ Edit · 🗑 |
| Unfound | `receiving/unfound/UnfoundQueueDetailsPanel.tsx` | Resolve/link + 🗑 | `⋯`(Resolve) · 🔗 Link · 🗑 |
| Bin | `warehouse/BinDetailFlyout.tsx` | edit + 🗑 | `⋯` · ✏️ Edit · 🗑 |
| SKU | `sku/SkuDetailView.tsx` | edit + 🗑 | `⋯` · ✏️ Edit · 🗑 |
| Repair | `repair/RepairDetailsPanel.tsx` | print/edit + 🗑 | `⋯` · 🖨 Print · ✏️ Edit · 🗑 |
| History | `receiving/history/HistoryCartonTriagePanel.tsx` | primary CTA (Print/Open) + More + 🗑 (Phase 1) | `⋯` · 🖨 Print · ✏️ Edit(Open in Unbox) · 🗑 — nearly the Unbox map already |

Icon per verb resolves through `@/components/Icons` (RefreshCw · Printer · Pencil · Trash2 ·
User · Truck · Link2 …). Map each rail's verbs to an icon + a `⋯` overflow for the tail; the
**primary** (readiness-picked) and **overflow** shape mirrors
`stationDisplaysFloorPrimaryAction` / `stationDisplaysFloorMoreItems`.

---

## 4. Unification approach (C2-safe — do NOT merge the hosts)

**Share the display METHOD; keep the HOSTS forked.** The right-edge C2 ruling
(`source-of-truth.md` → *Scan vs desk right-edge*) says desk (`RightRailHost`) and station
(`StationDisplaysPushStack`) stay distinct hosts sharing a thin presentational waist. The action
floor's **rendering** is exactly that waist. So:

1. **Promote the spread icon-first renderer to the shared floor SoT.** Either
   (a) re-point desk `InspectorActionFloor` to render `layout="spread"` icon peers (drop the
   labelled `cluster` path), or (b) extract one shared `IconActionFloor` primitive that both
   `InspectorActionFloor` (desk) and `StationDisplaysActionFloor` (station) compose. **(b) is
   cleaner** — one presentational primitive, two host shells.
2. **Each consumer passes icon peers**, not labelled buttons — `IconButton size="fill"` +
   `FLUSH_TERMINAL_SPREAD_PEER_CLASS`, `⋯` overflow, far-right `InspectorFlushDelete`.
3. **Hosts keep their own behavior:** desk resize/park keys (`⌘\` + `]`), station edge chord
   (`⌘]`), AI occupancy, visit-history — all unchanged. Only the floor's *look* unifies.
4. **`InspectorFlushDelete` is already shared** — no change; it's the far-right peer everywhere.

**Do not** import the desk `InspectorActionFloor` shell into a station host, or mount
`StationDisplaysActionFloor` on `RightRailHost` — that's the host merge C2 forbids. Unify the
*primitive underneath both*, not the shells.

---

## 5. Where the `→|` park goes — DEFAULT: A (method only)

The screenshot shows `→|` on its **own row below** the icon floor. On **station** that already
holds (floor above the close-chrome footer) and stays. On **desk** rails, park currently lives in
the **top** `DeskRailChromeRow` (`→|` leads the top cluster — a deliberate ruling:
`right-rail-inspector.md` → "close leads the chrome cluster / a Park never sits beside a Delete").

**Decision — default is A. Migrate desk rails on A without asking; B is opt-in only.**

- **A — method only (DEFAULT):** adopt the icons-first floor on desk rails; **leave desk park in
  the top chrome.** The floor is icons; park stays where the desk ruling put it. This is what the
  owner unified — the *display method* (icons-first spread) — not the whole column geometry, so it
  is the smallest change that satisfies the directive and it keeps the existing desk rulings
  ("close leads the top cluster", "Delete never sits beside Park") intact by construction: park is
  a row away, at the top. Station keeps its bottom `→|` (unchanged). One method, two host
  geometries — consistent with the C2 host fork in §4.
- **B — full arrangement (opt-in, needs its own ruling):** move desk park to a bottom `→|` row
  below the floor, matching the screenshot's column exactly. Bigger change; it **reopens** the
  top-chrome ruling and the "Delete never beside Park" rule (Delete would sit on the row directly
  above park — re-check the mis-click argument). Do **not** do B as part of this migration; raise
  it as a separate desk-chrome ruling if a stakeholder wants the identical column on desk.

Net: the owner said the *display method* must be SoT everywhere — A delivers that. B changes desk
*column geometry* too, which is a separate decision, so it stays out of the default path.

---

## 6. Guards + SoT to reconcile

- **`inspector-action-floor.guard.test.ts`** currently pins the desk floor as `layout="cluster"`
  (labelled). That assertion must change to the spread/icons-first contract (or the shared
  primitive), and keep the `DESK_FLOOR_CONSUMERS` list (all 7 must compose the unified floor).
- **`station-displays-action-floor.guard.test.ts`** is the spread golden — keep; broaden its
  scope to the shared primitive if you extract one.
- **`right-rail-inspector.md`** currently says desk `InspectorActionFloor` = cluster/labelled and
  *"Still never import desk `InspectorActionFloor` into Displays."* Update: the **display method**
  unifies to icons-first spread across all rails; the **host fork** (desk shell ≠ station shell)
  stays. Rewrite the "Action floor SoT (desk)" + "Station Displays carton Macro (fork)" blocks so
  they describe one shared icon-first method with two host shells.
- **`source-of-truth.md`** → the InspectorActionFloor consumer line + the C2 table: same reconcile.

---

## 7. Traps (learned from the golden)

- **The hit target is the column, not a floating icon.** Use `size="fill"` +
  `FLUSH_TERMINAL_SPREAD_PEER_CLASS`; never `size="touch"` + `justify-between` (dead air), never
  a `w-11` island. The station guard bans both.
- **Delete stays far-right** and stays `InspectorFlushDelete` (two-click arm, red). Don't turn it
  into a `⋯` item.
- **Overflow `⋯` leads** (far-left) and is disabled when it has no items — don't hide the column
  (keeps the row geometry stable).
- **Icons need tooltips** — every peer wraps `HoverTooltip`. This is also the Phase-3 keyboard
  discoverability hook (badge the shortcut in the tooltip).
- **Floor above close chrome** — the `→|`/Filter footer renders *below* the floor
  (`StationDisplaysPushColumn` guard: `footerPos > floorPos`).
- **`null` when empty** — never an empty bar.

---

## 8. Do this next (ordered)

1. **Proceed on §5 default A** — icons-first floor on desk rails, desk park stays in the top
   chrome (station keeps its bottom `→|`). Only pursue B if a stakeholder opens a separate
   desk-chrome ruling.
2. **Extract the shared primitive** (§4 option b): one `IconActionFloor` both hosts compose;
   move `FLUSH_TERMINAL_SPREAD_PEER_CLASS` + the icon-cell face + descriptor shape into it.
3. **Migrate History first** (it already has the floor + is the closest map) as the desk golden,
   then Orders → Incoming → Unfound → Bin → SKU → Repair, one rail per change.
4. **Reconcile guards + SoT** (§6) in the same changes; baselines only shrink.
5. **Verify** each rail: icons render, `⋯` overflow, delete arms + fires, tooltips present, park
   works, `npm run verify` green, and a Playwright smoke per rail on the QA org.

---

## 9. Collision note (2026-08-09)

The station floor files (`StationDisplaysActionFloor`, `UnboxDisplaysActionFloor`,
`station-displays-carton-floor.ts`) and the desk floor files are being **actively edited by
parallel sessions on the shared `main` tree**. Before starting, land/receive their in-flight work
(or take a worktree lane — `WORKTREE-LANES.md`) so this migration doesn't collide. Reference
`docs/todo/history-inspector-action-floor-and-keybinds-PLAN.md` for the History floor context.
