# Unbox station — golden scan-bench SoT

> **Promoted 2026-08-09.** Unbox is the **dogfood golden** for every derived-procedure
> scan station. Sibling ports compose this anatomy — they do not invent a second
> centre / dock / Displays language. Port playbook:
> [`station-port-from-unbox.md`](station-port-from-unbox.md).
>
> Inherits: [`station.md`](station.md) · [`station-workbench.md`](station-workbench.md) ·
> [`scan-cockpit.md`](scan-cockpit.md) · [`instrument-panel.md`](instrument-panel.md).
> Hard one-liners live in [`../source-of-truth.md`](../source-of-truth.md); **this file
> holds the exact Unbox walk.**

**Reference implementation:** `src/components/receiving/workspace/LineEditPanel.tsx`

**Cold land (station-first, 2026-08-11):** bare `/unbox` opens the Unboxed MRU
carton (or an empty scan bench) for immediate wedge work. Workbench tables
(Queue · Recent · History) mount only after **Back to list** (`?unboxdesk=1`).
See SoT → Paint content order · `unbox-selection-url.ts`.

---

## The anatomy (one picture)

```
┌─ GlobalHeader ──────────────────────────────────────────────┐
├─ StationContextBar + CartonContextCard (flow, flush) ───────┤
├───────────────┬─────────────────────────────┬───────────────┤
│ Recent rail   │ CENTRE = DO (ops-flow)      │ DISPLAYS =    │
│ (context)     │ PO lines + label preview    │ KNOW cockpit  │
│               │ empty tabs                  │ step→railLeaf │
├───────────────┴─────────────────────────────┴───────────────┤
│ WorkspaceNotesCard bubble + divided Print·Receive (hands)   │
│ (flush procedure floor parked — unbox-work / HANDOFF)       │
└─────────────────────────────────────────────────────────────┘
```

> **Main Unbox dock (2026-08-11):** raised `OmnichannelComposerDock` notes bubble
> with trailing pill Print·Receive + ghost label-note autocomplete. The flush
> two-band procedure floor (`UnboxDockHost` Band 1 step studio · Band 2 pager/%)
> is **parked** on worktree `unbox-work` — see
> [`docs/todo/unbox-dock-procedure-parked-HANDOFF.md`](../../docs/todo/unbox-dock-procedure-parked-HANDOFF.md).
> Arrival still uses `UnboxDockHost`.

> **Dock Band 1 ≠ Workbench Band-1 strip.** When the procedure floor is remounted,
> that Band 1 is the **scan-floor dock**. The page's Workbench strip is a
> different Band-1 — house law in [`../source-of-truth.md`](../source-of-truth.md)
> → **Workbench Band-1 strip** · [`workbench-ops-queue.md`](workbench-ops-queue.md).

| Plane | Holds | Never |
|---|---|---|
| **Centre** | Ops-flow only — `POUnboxingSection` + `UnboxLabelPreview` | Advisory banners, ticket history, claim wizards, `SectionTabsSlider`, centre `ProcedureDeck` |
| **Dock** | Raised notes bubble + trailing Print·Receive (ghost autocomplete) | Flush procedure step studio on main (parked); dual absolute floats |
| **Displays** | Step cockpit (`railLeaf`) + operator browse (Photos · Ticket · …) | Desk `InspectorActionFloor`, a third right-edge region, centre-tab twins of leaf tools |
| **Derivation** | ONE hook: `useUnboxProcedureSteps` | A second procedure store, page-local step state, hand-ticked checklists |

---

## Layers (compose these, never fork)

| Layer | SoT module |
|---|---|
| Host shell | `StationScanPaneHost` + `StationPanelRoot` + `StationWorkbench` (`bodyGap="none"`, `reserveIdentityClearance={false}`) |
| Identity | `StationContextBar` `placement="flow"` + `LineCartonContextSection` → `CartonContextCard` |
| Centre overview | `buildUnboxOverview` → `POUnboxingSection` (`dockOwnsCapture`) + `UnboxLabelPreview` |
| Dual edit loci | Dock owns wedge/scanner; **every editable line** mounts `ActiveLineConditionSerial` → `PoLineCaptureRow` (rest: condition + Serial/Photos; **condition pick → Tags + serial**; Serial open: Tags + `SerialScanField` + Photos; Photos open: Tags + Serial + `ItemPhotoCaptureStrip` / `PhotoStepDockStrip`; found **and** lined unfound; empty stub hides Photos until a line exists; snap, no layout tween) |
| Procedure pointer | `deriveProcedureSteps` / `resolveActiveStep` via `useUnboxProcedureSteps` |
| Dock ACTION map | `UNBOX_STEP_DOCK_CONTROLS` (`line-edit/steps/dock/`) |
| Cockpit KNOW map | `UNBOX_STEP_RAIL_LEAF` (`line-edit/steps/rail/`) |
| Floor host | **Main:** `WorkspaceNotesCard` / Omnichannel bubble + pill Print·Receive. **Parked / Arrival:** `UnboxDockHost` flush instrument |
| Displays | `StationDisplaysPushStack` / `StationDisplaysPushColumn` + `unbox-side-tabs.ts` |
| Macro floor | `UnboxDisplaysActionFloor` → `StationDisplaysActionFloor` (never desk inspector floor) |
| Progress | `UnboxScanProgressControl` `variant="floor"` in Band 2 only — never `GoalRing`, never a floor % twin on Displays |
| Flows | `@/lib/stations/procedure` — `found` / `unfound` / `return` capture orders |

---

## Named flows (capture order)

Declaration: `FOUND_CAPTURE` / `UNFOUND_CAPTURE` / `RETURN_CAPTURE` in
`src/lib/stations/procedure.ts`. Org SOP may reorder capture keys via
`receiving.unboxFlowCaptureOrder` — both deck surfaces re-derive; never a second list.

| Flow | Capture walk |
|---|---|
| **Found** | Arrival → Shipping label → Box → Packing → Contents → **Serial → Condition → Item photos** → Label |
| **Unfound** | **Classify** + Found walk |
| **Return** | Same trio order as Found (serial before condition) |

Phases outside capture:

| Phase | Steps | Home |
|---|---|---|
| **Intake** | `scan` | Station scan bar (already done when the panel opens) |
| **Commit** | `print` · **`stage`** · `receive` | Print · Receive on dogfood strip `data-unbox-dogfood-print` (always-on; Band 1 trailing null). After print, Band 1 arms **`LocationScanDockControl`** (`stage`) — wedge scans a putaway barcode; middle scrolls to Placement confirmation. Never sticky-lock / collapse the capture centre. |

**Capture trio law:** Serial → Condition → Photos (dock procedure order). Centre
face is invariant **`PoLineCaptureRow`** per editable line — **new scan mounts
collapsed Tags (`USED_A` default) + open `SerialScanField`** (optimistic);
**hover Tags expands** full `ConditionPills`; **grade click selects (never
clears), collapses Tags, keeps serial open**. **Photos expands in-row**
(`[ Tags | Serial | ItemPhotoCaptureStrip ]` — Link \| Upload \| Send, same
dock strip; Link opens the Photos → Link Displays leaf — `PhotoLinkDisplay`, Photos → Link nest (`photoAction: 'link'`): **Link to** carton step (Shipping label · The box ·
Packing material) or PO item · **Link as** aspect (item targets only) · shared
`PhotoAttachGrid` → claim-stage / aspect / reassign — a right-rail drill via
`receiving-open-photo-link`, **never** a popover. Guard:
`item-photo-link-display.guard.test.ts`). Found and lined unfound
share this face when `dockOwnsCapture`; empty return stub mounts Serial only
until a line exists. Dock Band 1 stays procedure instruments; under-row is
mouse go-back (snap mount). Qty roll-up over the display cap keeps
`BulkQuantityPanel` Apply under the capture face.

---

## Per-step contract (exact)

Every capture step declares **ACTION** (dock) **and** **KNOW** (rail leaf) — or is
listed in the matching either-or map with a reason. Guards:
`procedure-step-dock.guard.test.ts` · `scan-cockpit.guard.test.ts`.

| Step key | Label | Gate / evidence | Dock ACTION (`UNBOX_STEP_DOCK_CONTROLS`) | KNOW `railLeaf` | Band 1 geometry |
|---|---|---|---|---|---|
| `classify` | Classify | Intake classified (`isIntakeClassified`) | `ClassifyDockControl` → one-row Continue (h-11) | `classify` (`TriageClassifySection` KNOW) | Fixed `h-11` — never `expandBand` (editor is Displays only) |
| `arrival_label_photo` | Label photo | ≥1 `arrival_package` · `shipping_label` | `ArrivalPhotosDockControl` → `PhotoStepDockStrip` | `listings` | Left waist + right thirds: Link \| Upload \| Send |
| `arrival_box_photo` | Box photo | ≥1 `arrival_package` · `box_exterior` | `ArrivalPhotosDockControl` → `PhotoStepDockStrip` | `listings` | Left waist + right thirds: Link \| Upload \| Send |
| `packing_material` | Packing material | `unbox_carton` · `packing_material` | `CartonPhotoDockControl` | `listings` | Left waist + photo strip thirds |
| `contents` | Contents | `receiving_unbox.contents_confirmed_at` | `ContentsDockControl` (ack) | `inventory` | Full-height ack segment + wedge Enter |
| `serial` | Serial | Serials filled / waived to expected qty | `SerialDockControl` | `units` | Full-height serial segment (**no** scan-entry wedge — dock owns serial sink) |
| `condition` | Condition | `condition_graded_at` stamp | `ConditionDockControl` (`barDistribute`) | `units` | Grade bar fill + wedge accepts grade codes |
| `label` | Label | `label_previewed_at` | `LabelDockControl` (ack) | **none** — work plane (`UnboxLabelPreview`) | Ack segment; reference-less (declared in `UNBOX_STEPS_WITHOUT_RAIL_LEAF`) |
| `stage` | Location | `receiving_line_putaway.staged_at` (after `label_printed_at`) | `LocationScanDockControl` | **none** — work plane Placement panel | Full-height scan CTA + wedge; middle `UnboxPlacementSection` scrolls into view |
| *(settle)* | — | `activeKey === null` (capture done · not yet printed, or stage done) | *(no step control)* | *(cockpit idle)* | Band 1 empty of terminal — Print · Receive stays on dogfood strip above |

**KNOW on the DO plane — the moving outline.** The KNOW column above is the
right-edge Displays cockpit. On the **in-line capture face** (`PoLineCaptureRow`,
controller-active line only) the DO plane carries its own step pointer: the
dock's `activeKey` stamps `data-active-step` and a `2px` inset accent outline
snaps around the segment / condition it names — **`serial` → serial segment ·
`condition` → condition host · `item_photos` → photos segment** (the other
`activeKey`s have no in-line target, so nothing lights). Same `activeKey`, no
second store; inset + instant so the flush bar never shifts. SoT:
[`../source-of-truth.md`](../source-of-truth.md) → Unbox centre (main) ·
Active-step outline. Guard: `active-step-ring.guard.test.ts`.

Catalog-only (not on the default Found / Unfound / Return walk — door Label/Box
own shipping + exterior; item evidence is Displays-side): `shipping_label_photo`
· `box_photo` · `item_photos`. Dock/body registries stay wired for lineage /
Studio honesty.

### Photo stage law (never confuse)

| Step | Stage stamp | Why |
|---|---|---|
| `arrival_label_photo` · `arrival_box_photo` | `arrival_package` + door aspect (`shipping_label` / `box_exterior`) | Door pre-open evidence; a bench `unbox_carton` shot here would void the receive gate |
| `packing_material` (and catalog carton trio) | `unbox_carton` + aspect | Bench evidence after open |
| `item_photos` (catalog-only) | `unbox_item` + aspect set | Unit evidence; required aspects = org policy |

### Acknowledgement stamps (person-only facts)

`contents` · `condition` · `label` are **not** hand-ticked evidence claims — they
record that a human **read** something. Columns:
`contents_confirmed_at` · `condition_graded_at` · `label_previewed_at`. Never
backfill; a pre-existing carton reads pending (one tap away).

### Dual scan loci

| Locus | Job | Home | Chord |
|---|---|---|---|
| **Ingest** | New Ticket · Tracking · PO | Left `StationScanBar` | Insert / **⌘.** |
| **Procedure** | Current carton beat | Dock Band 1 **left waist** (`UnboxDockScanEntry` / serial) | `receiving-focus-scan` / `⌘; m → s` |

Never overload **⌘.** for the dock. Procedure waist stays left even when photo
tools mount to its right (`UNBOX_PHOTO_STRIP_KEYS`).

### Wedge / Enter routing (`UnboxDockScanEntry`)

Hidden only on `serial` and `classify` (those own Band 1 alone — serial field
**is** the waist). Mounted on every other capture/commit step, **including photo**.

| `activeKey` | Enter meaning |
|---|---|
| `condition` | Accept grade code |
| `contents` / `label` | Acknowledge |
| Photo strip keys | Advance / skip (neighbour) — compact cell, no placeholder |
| Other advance keys | Advance / skip per sink |

---

## Dock flush floor (geometry — NEVER regress)

Host = `w-full` · `p-0` · `gap-0` · `items-stretch` · `STATION_COLUMN_FOOTER_SEAM_CLASS`.
Every control is a **full-height abutting segment**. Content pad lives *inside* a
segment. Guard: `unbox-dock-one-shell.guard.test.ts`.

| Zone | Contract |
|---|---|
| Band 1 procedure waist | Compact `w-8` scan cell (collapse-strip twin — Plus idle · glow + caret · **no placeholder**) — **always left** on shared-entry steps |
| Band 1 photo | Left compact waist + right `PhotoStepDockStrip` (three labeled thirds); never “Enter to continue”; never icon-only camera; never photo-only full-band fill |
| Band 1 other CTAs | `flex-1` full-height segment |
| Band 1 terminal | Embedded only on settle — `rounded-none h-11`; never soft pill; never co-mounted with an active step studio |
| Band 2 pager | Full-width; sentence-case label **LEFT**; white `bg-surface-card` |
| Band 2 progress | `data-unbox-dock-progress-cell` (`w-8`) **RIGHT**; `variant="floor"`; **only** metric on the floor |

Notes escalate via `UnboxDockNotesEntry` + `DenseComposeFields` inside the same host
(notes mode) — never a raised Omnichannel composer as the procedure floor.

---

## Displays (KNOW + browse)

Vocabulary: `unbox-side-tabs.ts`. Navigation is Root→Leaf (local
`useUnboxDisplayView` — Arrival parity), never a horizontal icon plate in the
centre and never `?display=` URL wires.

| Leaf | Job |
|---|---|
| Index | Status rows (`STATION_DISPLAY_INDEX`) |
| `listings` · `classify` · `linkage` · `inventory` · `units` · `prebox` · `photos` · `ticket` · `tracking` · `timeline` · `support` · `checklist` | Operator tools + cockpit targets |

**Leaf verb grammar:** armed rows + local nest drills (`setDisplay(tab, { photoAction | linkageAction })`) — never a nested parent `TabDisplay` for leaf actions. Prebox is an Assets peer leaf (not a Units nest). Photos golden:
`PhotosActionsArmedList`. Inventory stays secondary vertical chrome.

**Cockpit behaviour** (live on Unbox): default-open / swap on `activeKey` change to
`railLeaf`; yields to explicit close until next carton; yields to Index / other leaf
browse until step advances; never steals wedge focus. Detail: [`scan-cockpit.md`](scan-cockpit.md).

**Macro:** `StationDisplaysActionFloor` above close chrome — Edit · Print/Resolve ·
Delete. Never desk `InspectorActionFloor`.

---

## Centre dual loci (mouse + wedge)

When `dockOwnsCapture`:

1. Bottom dock owns scanner / procedure advance.
2. PO meta chips **forward** via `onEditConditionInDock` / `onEditSerialInDock` →
   `focusStep` + select line.
3. **Every editable line** mounts `PoLineCaptureRow` via `PoLineUnitCaptureList`
   (`ActiveLineConditionSerial`) — rest condition + Serial/Photos; Serial expands
   in-row (`ConditionGradeCircle` Tags square + `SerialScanField`); Photos expands
   in-row (`ItemPhotoCaptureStrip` / dock Link \| Upload \| Send). Applies to
   **found and lined unfound** (`dockOwnsCapture`); empty stub hides Photos until
   a line exists. List body mount/update **snaps** (`animateLayout={false}`).
4. `autoFocusSerial` off so the wedge stays dock-owned.
5. Dock + row share controller writes — no third path.

---

## Hard bans (Unbox-specific)

- Remount centre `ProcedureDeck` / `UnboxProcedureDeck` without an explicit product redirect.
- Centre `SectionTabsSlider` for Displays tools (Pairing · Photos · Ticket · …).
- Content-sized chips / soft pills / `gap-*` air in dead Band-1/2 white.
- Co-mount Print·Receive with an active step studio.
- Stamp `arrival_package` from a bench carton/item capture (or the reverse).
- Paint **Received** from raw `quantity_received` — use `inventoryReceivedDisplayQty`
  (Unboxed ≠ Received).
- Fork a second procedure derivation for checklist vs dock.
- Raise any Unbox guard baseline to pass a sibling port.

---

## Guard map (Unbox golden)

| Guard | Pins |
|---|---|
| `unbox-dock-one-shell.guard.test.ts` | Flush floor · XOR terminal · photo strip · Band 2 layout |
| `unbox-dock-scan-entry.guard.test.ts` | Enter routing by `activeKey` |
| `procedure-step-dock.guard.test.ts` | Step→ACTION either-or |
| `scan-cockpit.guard.test.ts` | Step→`railLeaf` either-or + LineEditPanel wiring |
| `unbox-right-edge-chrome.guard.test.ts` | Displays push / utility rail |
| `unbox-displays-drilldown.guard.test.ts` | Armed-row leaf drills |
| `station-displays-action-floor.guard.test.ts` | Macro floor |
| `station-centre-ops-flow.guard.test.ts` | No centre advisory |
| `procedure-divergence.guard.test.ts` | Catalog ↔ gate vocabulary |
| `return-match-evidence.guard.test.ts` | Return evidence stays lines-shaped |

---

## Compound opportunities

- Do now: keep dogfood tuning of `UNBOX_STEP_RAIL_LEAF` at the bench (map is tunable; either-or is not).
- Port next (one station at a time): see [`station-port-from-unbox.md`](station-port-from-unbox.md).
- Deferred: centre ProcedureDeck retirement on any remaining `unbox-work` lane remount.

Indexed by [`../contextual-display.md`](../contextual-display.md)
