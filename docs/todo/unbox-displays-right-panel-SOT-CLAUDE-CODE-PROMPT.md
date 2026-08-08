# Claude Code prompt — Unbox Displays right-panel SoT (locks · docs · imports)

**For:** Claude Code / Cursor Agent migrating any surface to copy Unbox Displays  
**From:** Cycle Forge engineering  
**Date:** 2026-08-07  
**Status:** reference handoff — architecture locked; do not reinvent  
**Lane:** current checkout — no ad-hoc branch. Attach to `:3050`. User owns commits.  
**Product frame:** Cycle Forge multi-tenant reseller-ops SaaS. USAV is dogfood only.

**Companions (read, do not re-litigate):**

| Doc | Role |
|---|---|
| [`.claude/rules/source-of-truth.md`](../../.claude/rules/source-of-truth.md) | Scan-station centre · Displays vs inspector · Frame column budget · Station Displays navigation |
| [`.claude/rules/display/station-workbench.md`](../../.claude/rules/display/station-workbench.md) | Displays Root Index · Flex-Grow Sandwich · Hard Nevers |
| [`.claude/rules/display/right-rail-inspector.md`](../../.claude/rules/display/right-rail-inspector.md) | Desk `RightRailHost` is a **different noun** — never Station Displays |
| [`station-displays-nested-tabs-HANDOFF.md`](./station-displays-nested-tabs-HANDOFF.md) | Nested `TabDisplay` verbs inside a leaf |
| [`displays-vs-inspector-vocabulary-SWEEP-HANDOFF.md`](./displays-vs-inspector-vocabulary-SWEEP-HANDOFF.md) | Operator copy: Open displays ≠ Show inspector |

---

## Paste this into a new agent session

```
Read docs/todo/unbox-displays-right-panel-SOT-CLAUDE-CODE-PROMPT.md end-to-end before
changing Displays / SectionTabsSlider / right-rail on any station or desk.

GOAL
Copy Unbox's right-edge Displays contract exactly. Unbox is the golden:
  - Host = StationDisplaysPushStack (shared SoT under src/components/station/displays/)
  - Nav = Root Index → leaf (NOT SectionTabsSlider density="icon")
  - Centre = ops-flow only (empty workbench tabs); tools live on Displays
  - Open displays ←| ≠ Desk Band 3 Show inspector

DO NOT
- Reintroduce UnboxSectionTabs / density="icon" as primary Displays nav
- Mount Displays leaves on RightRailHost / DetailStackRailRegistrar
- Put Ticket · Photos · Pairing · … on a centre SectionTabsSlider strip
- Fork a second push column shell or add navMode (deleted 2026-08-07)
- Call the Station ←| "inspector" or "details editor"
- Put Checklist on the Root Index (ring-only under the dock)
- Bind Escape on Action leaf legends (column owns Esc)

HARD LAWS
- AGENTS.md + source-of-truth.md + display/station-workbench.md
- Compose from @/components/station/displays — grow SoT, never page-local twin
- npm run verify before done; DS ratchets only go down
```

---

## 1. One sentence

Unbox parks **reference tools** in a right-edge **push column** that drills **Root Index → leaf**, driven by `?display=`, hosted by shared `StationDisplaysPushStack` — never a horizontal icon plate and never a desk `RightRailHost` inspector.

---

## 2. Frame (what Unbox mounts)

```
StationScanPaneHost
├── center        StationPanelRoot → StationWorkbench
│                   tabs = EMPTY
│                   body = PO lines + label preview + dock (ops-flow only)
├── utilityRail   UnboxDisplaysUtilityRailBody     // ONLY when Displays CLOSED
│                   carton ↑↓ + ←| "Open displays" → ?display=index
└── displays      StationDisplaysPushStack         // ONLY when Displays OPEN
                    → StationDisplaysPushColumn    // flex-1 invader (Flex-Grow Sandwich)
                       ├── index → StationDisplayIndexList
                       └── leaf  → StationDisplayLeafHeader + tab.content
                           footer: Filter displays… + →| column-close
```

**Operator nouns**

| Control | Copy | Job |
|---|---|---|
| Station `←\|` | **Open displays** | Open right-edge Displays on Root Index |
| Desk Band 3 | **Show inspector** | Desk `RightRailHost` record peek — different slot |

Never conflate the two.

---

## 3. Import locks (compose these; do not fork)

### Shared host SoT — always from the barrel

```ts
import {
  StationDisplaysPushStack,
  StationDisplaysEdgeToggle,
  STATION_DISPLAY_INDEX,
  STATION_DISPLAYS_HOST_PAD_CLASS,
  StationActionDossierShell,   // Action-plane leaves (Inventory golden)
  StationDenseFactStrip,
  StationActionKeyLegend,
  type DisplayIndexRow,
} from '@/components/station/displays';
```

| Symbol | File | Job |
|---|---|---|
| `StationDisplaysPushStack` | `station/displays/StationDisplaysPushStack.tsx` | Root→Leaf wrapper; Esc pop; filter footer |
| `StationDisplaysPushColumn` | `StationDisplaysPushColumn.tsx` | In-flow `flex-1` invader + resize + overlay when collapsed |
| `StationDisplayIndexList` | `StationDisplayIndexList.tsx` | Grouped status rows + character-select ↑↓ |
| `StationDisplayLeafHeader` | `StationDisplayLeafHeader.tsx` | Sticky Back + title |
| `StationDisplaysEdgeToggle` | `StationDisplaysEdgeToggle.tsx` | `←\|` / `→\|` + Cmd/Ctrl+] |
| `STATION_DISPLAY_INDEX` | `display-index.ts` | `'index'` sentinel (pure module) |
| `DisplayIndexRow` | `display-index.ts` | `{ id, label, subtitle, tone, group }` |
| Action densify | `StationActionDossierShell` · `StationDenseFactStrip` · `StationActionKeyLegend` | Inventory-style Action plane |

**Barrel:** [`src/components/station/displays/index.ts`](../../src/components/station/displays/index.ts)  
**Pure index helpers stay deep-importable** (`display-index.ts`) so domain vocab modules remain React-free.

### Unbox domain — station-local vocabulary + builders

| File | Symbols | Job |
|---|---|---|
| `…/line-edit/unbox-side-tabs.ts` | `UnboxSideTab`, `UNBOX_DISPLAY_INDEX` (= `STATION_DISPLAY_INDEX`), `UNBOX_STRIP_TAB_ORDER`, gates, `parseUnboxDisplayNav`, `resolveUnboxDisplayNav`, nested parsers | Pure URL/vocab |
| `…/line-edit/terminal/unbox-tabs.tsx` | **`buildUnboxSideTabs`**, `buildUnboxOverview`, `buildUnboxStepDock` | Leaf `SectionTab[]` bodies |
| `…/line-edit/unbox-display-index.ts` | **`buildUnboxDisplayIndexRows`** | Enriched Root Index rows |
| `…/line-edit/hooks/useUnboxDisplayView.ts` | URL ⇄ optimistic paint for `display` + nested params | Waist |
| `…/UnboxDisplaysUtilityRailBody.tsx` | Closed-state `←\|` host | Utility rail |
| `…/LineEditPanel.tsx` | Mount site | Wires gates → builders → stack |

**There is no `buildUnboxDisplayTabs`.** The leaf builder is `buildUnboxSideTabs`.

### Unbox mount pattern (copy this shape)

```tsx
// LineEditPanel.tsx — conceptual
import {
  StationDisplaysPushStack,
  STATION_DISPLAYS_HOST_PAD_CLASS,
} from '@/components/station/displays';
import { buildUnboxSideTabs } from './line-edit/terminal/unbox-tabs';
import {
  UNBOX_DISPLAY_INDEX,
  resolveUnboxDisplayNav,
  type UnboxSideTab,
} from './line-edit/unbox-side-tabs';
import { buildUnboxDisplayIndexRows } from './line-edit/unbox-display-index';
import { useUnboxDisplayView } from './line-edit/hooks/useUnboxDisplayView';
import { UnboxDisplaysUtilityRailBody } from './UnboxDisplaysUtilityRailBody';

// …
const { open: showDisplays, leaf: activeSideTab } = resolveUnboxDisplayNav(
  requestedSideTab,
  sideGates,
);

<StationScanPaneHost
  center={/* StationWorkbench tabs EMPTY — overview only */}
  utilityRail={
    !showDisplays ? (
      <UnboxDisplaysUtilityRailBody
        onOpenDisplays={openDisplaysIndex} // → UNBOX_DISPLAY_INDEX
        cartonCursor={…}
      />
    ) : undefined
  }
  displays={
    showDisplays ? (
      <StationDisplaysPushStack
        tabs={unboxSideTabs}                 // buildUnboxSideTabs(…)
        activeTab={activeSideTab ?? UNBOX_DISPLAY_INDEX}
        indexRows={displayIndexRows}         // buildUnboxDisplayIndexRows(…)
        onTabChange={…}
        onClose={closeDisplays}
        headerTrailing={displaysCartonCursor}
      />
    ) : null
  }
/>
```

### Sibling stations (already composing the host)

| Station | Panel | Tab builder | Shared imports |
|---|---|---|---|
| Arrival | `TriagePanel.tsx` | `buildTriageDisplayTabs` (Pairing only) | barrel + reuse `UnboxDisplaysUtilityRailBody` |
| Testing | `TestingPanel.tsx` | `buildTestingDisplayTabs` | barrel |
| Pack | `PackOrderPanel.tsx` | panel-local | barrel |
| Shipping | `ActiveOrderWorkspace.tsx` | local | barrel |
| Review | `PackerReviewMode.tsx` | local | barrel |

Domain leaves stay in the station builder; **never** copy Unbox leaf hosts into a second push shell.

---

## 4. URL / state machine (locked)

| `?display=` | Column | Body |
|---|---|---|
| *(absent)* | **CLOSED** | Utility rail: carton ↑↓ + ←\| → index |
| `index` | **OPEN** | Root Index (`StationDisplayIndexList`) |
| `<leaf>` | **OPEN** | Leaf header + `tab.content` |

**Esc / Back / hotkey**

| Action | Behavior |
|---|---|
| Esc on leaf | → index |
| Esc on index | → close (clear `display`) |
| Back (`StationDisplayLeafHeader`) | → index |
| →\| / ⌘/Ctrl+] | Close whole column from any stage |
| Type in footer filter on leaf | Pop to filtered index |

**Nested URL params** (cleared on every `setDisplay` rewrite):

| Param | Leaf | Values |
|---|---|---|
| `photoAction` | photos | `actions` \| `move` \| `send` (legacy `browse` → actions) |
| `linkageAction` | linkage | `link` \| `note` |
| `ticketAction` | ticket | written for hygiene; **presence wins** body |
| `claimMode` | ticket/claim | `create` \| `link` |
| `unitsAction` | units | `units` \| `prebox` |
| `inventoryAction` | — | **retired** — cleared on write |

**Legacy aliases** (rewritten in `useUnboxDisplayView`):  
`pairing` / `po-note` → `linkage`; `claim` → `ticket` (+ claim).

**Mutual exclusion:** opening Displays closes `detail:receiving` + assistant; assistant / details overlay yields Displays. Never dual full-width right columns.

**Line change:** clear open Displays when `row.id` changes.

**Optimistic paint:** `useUnboxDisplayView` writes pending before `router.replace` (same click-commit pattern as Open displays).

---

## 5. Every Unbox display leaf (locked catalog)

**Index-visible order** (`UNBOX_STRIP_TAB_ORDER`, PO-identity first):  
Listings → Classify → Pairing → Inventory → Units → Photos → Ticket → Tracking → Timeline → Support  

(`checklist` is in `UNBOX_SIDE_TAB_ORDER` but **stripHidden / ring-only** — never an index row.)

| id | Index label | Group | Builder body | Visibility gate | Nested in-leaf nav | Notes |
|---|---|---|---|---|---|---|
| `index` | *(Root — not a leaf)* | — | `StationDisplayIndexList` + `buildUnboxDisplayIndexRows` | column open, no leaf | — | `?display=index` |
| `listings` | Listings | verification | `ListingLinksTab` | `!isUnfound` | Leaf-local `SectionTabsSlider` OK (sources) — **not** column nav | |
| `classify` | Classify | verification | `TriageClassifySection` (eager) | always (`hasClassifyTab`) | — | |
| `linkage` | Pairing | verification | `LinkageDisplayHost` | `receiving_id != null` | **Link** (`CartonMatchHub`) · **Note** (Zoho) if `hasPoNoteTab` | |
| `inventory` | Inventory | assets | `InventoryDisplayHost` | `receiving_id != null` | **None** — stacked Action dossier | Change PO → Linkage; `StationActionDossierShell` |
| `units` | Units | assets | `UnitsDisplayHost` | serials \| qty expected | nested **Units · Prebox** | |
| `photos` | Photos | assets | `PhotosDisplayHost` (dynamic P3) | always | `TabDisplay` nested: **Actions · Compare · Move · Send** | Actions = keyboard-armed list (`PhotosActionsArmedList`); identity pill opens Displays (no hover toolbar) |
| `ticket` | Ticket | context | `TicketDisplayHost` (dynamic P3) | always | **Presence-exclusive:** no ticket → Claim (`ReceivingClaimPanel`); ticket → Chat. No Chat·Claim strip | `ticketAction` hygiene only |
| `tracking` | Tracking | context | `TrackingNumbersTab` | not local-pickup | — | |
| `timeline` | Timeline | context | `WorkspaceTimelineTab` (+ audit when active) (dynamic P3) | tracking \| units \| receiving_id | Audit nests under Timeline | |
| `support` | Support | context | `SupportContextHub` (dynamic P3) | always | lazy when active | |
| `checklist` | Checklist | — | `UnboxProcedureChecklist` | always (body) | — | **Ring-only** via `UnboxScanProgressControl` under dock; `stripHidden: true` |

### Index tones (`buildUnboxDisplayIndexRows`)

| Leaf | Tone summary |
|---|---|
| ticket | no ticket → `action` “Claim needed”; else `ok` “Linked ticket” |
| photos | count / None / Carton photos |
| linkage | Paired `ok`; unfound unpaired → `action`; else neutral |
| classify | empty → `action` “Not set”; else `ok` label |
| inventory | unpaired → `action`; else `recv/exp` or “PO · lines · notes” |
| units | serial count |
| listings / support / tracking / timeline | mostly neutral; return intake timeline → `action` |

### P3 deferred hosts (`dynamic()` in `unbox-tabs.tsx`)

Ticket · Photos · Timeline · Support · ReceivingAuditPanel.  
Eager: Linkage · Inventory · Classify · Units · Listings · Tracking · Checklist sections.

---

## 6. Docs that lock the law

Read these before changing nav:

1. **`source-of-truth.md`**
   - Compact table → **Scan-station centre lines display**
   - **Displays vs inspector** (operator nouns, ⌘], no RightRailHost for Displays)
   - **Station Displays navigation** — Root→Leaf; no `navMode`
   - **Frame column budget** / Flex-Grow Sandwich (centre ~720 lock; Displays `flex-1`)
2. **`display/station-workbench.md`**
   - Unbox centre empty tabs; Displays push list
   - **Displays Root Index** (row anatomy, armed cursor, Esc, gated leaves, `←\|` → index)
   - Hard Nevers
3. **`display/right-rail-inspector.md`**
   - Desk `detail:order` may *twin the grammar* but lives on `RightRailHost` — different product noun

---

## 7. Guards that ratchet the contract

Run / extend these — never weaken:

| Guard | Locks |
|---|---|
| `…/line-edit/unbox-displays-drilldown.guard.test.ts` | Index sentinel; no checklist on index; stack = IndexList+LeafHeader; utility opens index; `indexRows`; no `navMode`; Inventory ≠ RightRailHost |
| `…/station/displays/station-displays-reachability.guard.test.ts` | Every stack mount: no `navMode`; 2+ displays → edge opens Index |
| `…/station/displays/station-display-index.guard.test.ts` | Index list / stack contracts |
| `…/station/displays/station-displays-keyboard-ownership.guard.test.ts` | List keys vs ambient ↑↓ |
| `…/station/displays/station-displays-toggle-hotkey.guard.test.ts` | ⌘] only on edge toggle |
| `…/station/displays/station-action-dossier.guard.test.ts` | Action densify; Esc not on leaf; Inventory golden |
| `…/station/workbench/station-centre-ops-flow.guard.test.ts` | No centre advisory; Unbox mounts stack |
| `…/receiving/workspace/claim-display-fill.guard.test.ts` | **No** `UnboxSectionTabs` / **no** `density="icon"` as Displays navigator |
| `…/line-edit/displays-p3-defer.guard.test.ts` | P3 dynamic hosts |
| `…/line-edit/unbox-displays-flush.guard.test.ts` | Flush leaf bodies (no glass WorkspaceCard) |
| `…/receiving/workspace/unbox-right-edge-chrome.guard.test.ts` | Utility ↔ open exclusivity |
| E2E | `tests/e2e/unbox-displays-column.spec.ts`, `unbox-flush-display.spec.ts` |

---

## 8. Hard Nevers (copy into any migration PR)

1. **No** `SectionTabsSlider density="icon"` as **primary** Displays / inspector topic plate when migrating to Unbox SoT — use Root Index.
2. **No** `RightRailHost` for Station Displays leaves.
3. **No** centre strip for Ticket · Photos · Pairing · Inventory · …
4. **No** `navMode` prop / leaf-only stranded columns.
5. **No** Checklist index row — progress ring only.
6. **No** Escape handlers on Action leaf key legends.
7. **No** `InspectorActionFloor` on Station Displays (desk Macro only).
8. **No** dual permanent right columns (AI + Displays).
9. Leaf-local nested nav is OK (`TabDisplay density="nested"`, Listings’ own slider) — **column-level** primary nav is not.

---

## 9. How to migrate another page (recipe)

When bringing a surface onto this SoT (e.g. Orders desk `detail:order`, Support inspector, Labels, My Day Watch):

1. **Keep the shared host** — mount `StationDisplaysPushStack` (or desk twin that still drills Index→leaf). Do not revive the icon plate as the navigator.
2. **Add a pure vocab module** (like `unbox-side-tabs.ts`) that aliases `STATION_DISPLAY_INDEX` — never re-type `'index'`.
3. **Add `buildXDisplayTabs` + `buildXDisplayIndexRows`** — tabs supply icons/bodies; index rows supply subtitle/tone/group.
4. **Wire URL** with an optimistic hook patterned on `useUnboxDisplayView` (`?display=`).
5. **`←\|` / Open → index** when the station declares 2+ displays; contextual jumps may skip to a leaf.
6. **Centre stays ops-flow** (or desk table) — tools move into leaves.
7. **Extend guards** in `station-displays-reachability` + a domain drilldown guard.
8. **`npm run verify`** green before done.

### Surfaces still on `SectionTabsSlider` (migration backlog)

See prior inventory — priority twins of Unbox plate:

1. `/shipping/orders` — `ShippedDetailsPanel` (`detail:order`)
2. `/support` — `SupportContextDetailPanel`
3. `/unbox` · `/incoming` — `IncomingBulkTrackingPanel`
4. `/forge?watch=1` — `MyDayWatchRail`
5. `/shipping/labels` — `LabelsOrderWorkspace`
6. Nested leftovers: `ListingLinksTab`, `WorkspaceTimelineTab`, `ShippingScanWorkspace`, `SupportOrdersFocusHost`, `/carton/[id]` `CartonPhotoTriage`

---

## 10. Known SoT vs code footnote

Docs sometimes say “gated leaf → fall back to **index**.”  
Unbox `resolveUnboxSideTab` today falls back to the **first visible strip tab**. If you change resolvers, align docs + guards in the same PR — do not silently fork.

---

## 11. Verify

```bash
npx tsx --test \
  src/components/receiving/workspace/line-edit/unbox-displays-drilldown.guard.test.ts \
  src/components/station/displays/station-displays-reachability.guard.test.ts \
  src/components/station/displays/station-display-index.guard.test.ts \
  src/components/station/displays/station-action-dossier.guard.test.ts \
  src/components/receiving/workspace/claim-display-fill.guard.test.ts

npm run verify
```

Eyeball on `:3050` `/unbox`: closed utility `←\|` → Root Index → leaf → Esc → index → Esc → closed; contextual open (e.g. Photos) may skip index; Checklist only from under-dock ring.
