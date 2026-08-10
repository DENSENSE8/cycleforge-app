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
│ UnboxDockHost — flush two-band floor (hands)                │
│ Band 1: step ACTION  XOR  Print·Receive (settle only)       │
│ Band 2: pager LEFT  ·  procedure-% RIGHT                    │
└─────────────────────────────────────────────────────────────┘
```

> **Dock Band 1 ≠ Workbench Band-1 strip.** The diagram above is the **scan-floor
> dock**. The page's Workbench strip (Pin-list · Inbound · Queue · Recent · History)
> is a different Band-1 — house law in [`../source-of-truth.md`](../source-of-truth.md)
> → **Workbench Band-1 strip** · [`workbench-ops-queue.md`](workbench-ops-queue.md).

| Plane | Holds | Never |
|---|---|---|
| **Centre** | Ops-flow only — `POUnboxingSection` + `UnboxLabelPreview` | Advisory banners, ticket history, claim wizards, `SectionTabsSlider`, centre `ProcedureDeck` |
| **Dock** | One armed ACTION for `activeKey` on Band 1 · dogfood Print·Receive on `data-unbox-dogfood-print` above host | Raised `Panel`, soft pills, Omnichannel composer as the floor, co-mounted terminal + step studio in Band 1 |
| **Displays** | Step cockpit (`railLeaf`) + operator browse (Photos · Ticket · …) | Desk `InspectorActionFloor`, a third right-edge region, centre-tab twins of leaf tools |
| **Derivation** | ONE hook: `useUnboxProcedureSteps` | A second procedure store, page-local step state, hand-ticked checklists |

---

## Layers (compose these, never fork)

| Layer | SoT module |
|---|---|
| Host shell | `StationScanPaneHost` + `StationPanelRoot` + `StationWorkbench` (`bodyGap="none"`, `reserveIdentityClearance={false}`) |
| Identity | `StationContextBar` `placement="flow"` + `LineCartonContextSection` → `CartonContextCard` |
| Centre overview | `buildUnboxOverview` → `POUnboxingSection` (`dockOwnsCapture`) + `UnboxLabelPreview` |
| Dual edit loci | Dock owns wedge/scanner; active line mounts `ActiveLineConditionSerial` for mouse go-back (Condition → Serial → Photos peers) |
| Procedure pointer | `deriveProcedureSteps` / `resolveActiveStep` via `useUnboxProcedureSteps` |
| Dock ACTION map | `UNBOX_STEP_DOCK_CONTROLS` (`line-edit/steps/dock/`) |
| Cockpit KNOW map | `UNBOX_STEP_RAIL_LEAF` (`line-edit/steps/rail/`) |
| Floor host | `UnboxDockHost` — Band 1 + Band 2 flush instrument |
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

**Capture trio law:** Serial → Condition → Photos. Multi-qty Phase 2 = fill every
serial (or waive), then **one** line-level condition + item-photos — not the trio × N.

---

## Per-step contract (exact)

Every capture step declares **ACTION** (dock) **and** **KNOW** (rail leaf) — or is
listed in the matching either-or map with a reason. Guards:
`procedure-step-dock.guard.test.ts` · `scan-cockpit.guard.test.ts`.

| Step key | Label | Gate / evidence | Dock ACTION (`UNBOX_STEP_DOCK_CONTROLS`) | KNOW `railLeaf` | Band 1 geometry |
|---|---|---|---|---|---|
| `classify` | Classify | Intake classified (`isIntakeClassified`) | `ClassifyDockControl` → `TriageClassifySection` | `classify` | **Grows** past `h-11` |
| `arrival_label_photo` | Label photo | ≥1 `arrival_package` · `shipping_label` | `ArrivalPhotosDockControl` → `PhotoStepDockStrip` | `photos` | Left waist + right thirds: Link \| Upload \| Send |
| `arrival_box_photo` | Box photo | ≥1 `arrival_package` · `box_exterior` | `ArrivalPhotosDockControl` → `PhotoStepDockStrip` | `photos` | Left waist + right thirds: Link \| Upload \| Send |
| `packing_material` | Packing material | `unbox_carton` · `packing_material` | `CartonPhotoDockControl` | `photos` | Left waist + photo strip thirds |
| `contents` | Contents | `receiving_unbox.contents_confirmed_at` | `ContentsDockControl` (ack) | `inventory` | Full-height ack segment + wedge Enter |
| `serial` | Serial | Serials filled / waived to expected qty | `SerialDockControl` | `units` | Full-height serial segment (**no** scan-entry wedge — dock owns serial sink) |
| `condition` | Condition | `condition_graded_at` stamp | `ConditionDockControl` (`barDistribute`) | `units` | Grade bar fill + wedge accepts grade codes |
| `label` | Label | `label_previewed_at` | `LabelDockControl` (ack) | **none** — work plane (`UnboxLabelPreview`) | Ack segment; reference-less (declared in `UNBOX_STEPS_WITHOUT_RAIL_LEAF`) |
| `stage` | Location | `receiving_line_putaway.staged_at` (after `label_printed_at`) | `LocationScanDockControl` | **none** — work plane Placement panel | Full-height scan CTA + wedge; middle `UnboxPlacementSection` scrolls into view |
| *(settle)* | — | `activeKey === null` (capture done · not yet printed, or stage done) | *(no step control)* | *(cockpit idle)* | Band 1 empty of terminal — Print · Receive stays on dogfood strip above |

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

Vocabulary: `unbox-side-tabs.ts`. Navigation is Root→Leaf (`?display=`), never a
horizontal icon plate in the centre.

| Leaf | Job |
|---|---|
| Index | Status rows (`STATION_DISPLAY_INDEX`) |
| `listings` · `classify` · `linkage` · `inventory` · `units` · `photos` · `ticket` · `tracking` · `timeline` · `support` · `checklist` | Operator tools + cockpit targets |

**Leaf verb grammar:** armed rows + URL drills (`?photoAction=` / `?linkageAction=` /
`?unitsAction=`) — never a nested parent `TabDisplay` for leaf actions. Photos golden:
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
3. **Active line only** mounts progressive Condition → Serial → Photos peers for
   mouse go-back (`ActiveLineConditionSerial` / `PoLineItemPhotoPeers`).
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
- Deferred: multi-qty true per-unit trio loop (Phase 3); centre ProcedureDeck retirement on any remaining `unbox-work` lane remount.

Indexed by [`../contextual-display.md`](../contextual-display.md)
