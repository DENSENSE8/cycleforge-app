# Handoff — Scan Station "next action" headline and label placement (2026-10-06)

Paste this whole file as the first message of a fresh session in `~/Projects/cycleforge-lanes/prod`.

---

## Goal

After every scan, each Scan Station must tell the operator, in one big line at the top left of the center pane, **what to physically do next with the thing in their hand** — and where it goes. The printed label must still be visible, but it is too big today. Move it to the top right and make it smaller.

Operator example (Arrival / Unbox):

- A **return** or an **unfound** carton → **"Place on the Return rack"**.
- A **tracked purchase** → the carrier decides the rack: UPS → **UPS rack**, USPS → **USPS rack**, FedEx → **FedEx rack**.

The headline answers three questions in order: **what is it** (the scan was identified as a tracking / return / unfound / order / unit), **where did it come from** (carrier, vendor, channel), **where does it go** (the rack, tote, bench, or next station).

---

## First principles — the job of each station

The recent rail, the scan modes and the verbs stay **contextual per station** (operator ruling 2026-10-06). Do not unify stations. What every station shares is chrome (`StationWorkbench`, `StationContextBar`, `CartonContextCard`, `ScanBandShell` / `StationScanBar`, `RailRowMenu`). This headline is a new shared slot; what it says is each station's own.

| Station | Route | The thing in hand | The decision after the scan | Physical next step the headline must say |
|---|---|---|---|---|
| Arrival | `/triage` | A sealed carton at the door | Expected purchase, return, or unfound? | Return / unfound → Return rack. Purchase → the carrier's rack (UPS / USPS / FedEx). |
| Unbox | `/unbox` | An opened carton and its units | Do contents match the PO? Is it a return? | Return / unfound → Return rack. Received → the tote or bin the label says. Today's static line is "Label printed? Scan the bin QR it goes to". |
| Quality control | `/test` | One unit | Pass, fail, or secondary test? | Pass → stock / pre-box. Fail → repair bench or claim. |
| Picker | `/pick` | An order's pick list | Where is each unit, and is it the right one? | The next bin to walk to; when the order is complete → the Packing bench. |
| Packing | `/pack` | A picked order, a unit label, or an FNSKU | Is the kit complete? Is it FBA? | Seal the box, then place it in the scan-out staging for its carrier; FBA → combine into the FBA shipment. |
| Scan-out | `/shipping/scan-out` | A sealed, labelled box | Is it shippable (not held, not already shipped)? | Hand it to the carrier, or put it in that carrier's hopper. |

[INFERENCE — confirm with the operator before coding] The QC, Picker, Packing and Scan-out next steps above come from code reading, not an operator ruling. Arrival and Unbox are the operator's own example.

---

## Current state (read these before editing)

### Center pane, per station

- Unbox: `src/components/receiving/workspace/LineEditPanel.tsx` → `StationContextBar placement="flow"` + `LineCartonContextSection` → `CartonContextCard`; `StationBandStack` Items band (`POUnboxingSection`) then the **Label band** `UnboxLabelPreview` (`src/components/receiving/workspace/line-edit/UnboxLabelPreview.tsx`) hosted by `WorkspaceLabelPreviewCard` (`src/components/labels/WorkspaceLabelPreviewCard.tsx`, `chrome="procedure"`), painted by `LabelFacePreview` (`src/design-system/components/LabelFacePreview.tsx`) with `fit="host"`, so it **fills the column width** under the PO lines. That is the "too big" label. Dock: `WorkspaceNotesCard`; CTA "Print & receive".
- Arrival: `src/components/receiving/triage/TriagePanel.tsx` — identity, `POUnboxingSection` (`serialScan={false}`), dock `ArrivalCartonNotesEntry`, CTA "Save for Unbox". No label surface. Location staging is in the Displays push stack (`ArrivalLocationsLeaf`).
- Quality control: `src/components/tech/TestingPanel.tsx` — `TestingCartonHeader`, `TestingPoUnboxingSection`, `TestingVerdictBar`, then the same `UnboxLabelPreview` label band; CTA "Pass + Print" (`resolveTestingTerminal`).
- Picker: `src/components/tech/ActiveOrderWorkspace.tsx` — `ShippingEntityContextHeader`, `ShippingScanWorkspace` → `ShippingSkuSerialRows`, `UpNextActionDock`. No label surface.
- Packing: `src/components/packer/PackOrderPanel.tsx` — `PackOrderIdentity`, `PackPapersStatusCard` (feedback slot), `OrderPackChecklist`. No dock; the scan column drives it.
- Scan-out: `src/components/outbound/scan-out/ScanOutActivePanel.tsx` — `ShippingEntityContextHeader`, status chip (Scanned out + Undo / Not found / Already shipped), `IdentificationJobFace`, `ScanOutComposerDock`.

### The "next action" today is static

`src/lib/nav/next-actions.ts` `PAGE_NEXT_ACTIONS` is one hard-coded sentence per page, shown in the header's top-left at rest (e.g. `receive: 'Label printed? Scan the bin QR it goes to'`). It never knows what was scanned. Dynamic hints live inside each controller (`useUnboxLineController`, `useTestingLineController`, `useScanOutStation`).

### Facts already on the record (inputs to the headline)

- Carrier: `detectCarrierFromTracking` in `src/utils/carrier-patterns.ts` (UPS `1Z…`, FedEx 12/15/20/22/34-digit, USPS IMpb / S10, DHL, Amazon TBA). Use this one detector; do not add another.
- Return: the receiving type (`PURCHASE` / `RETURN` / `TRANSFER`, `classify-pill-options.ts`).
- Unfound: `dockedCartonFlags` / `DOCKED_FLAG_OPTIONS` in `src/lib/receiving/docked-record-state.ts` (`UNFOUND`, `CLAIM`, `SHORT`); `receiving_source = 'unmatched'`.
- QC verdict: the testing controller's verdict (`PASS` / `FAIL` / `SECONDARY`, `TestingVerdictBar`). Ship-by: the order's ship-by (Picker, Packing, Scan-out). Out of stock: `is_out_of_stock` on the Picker preview order. FBA: the active FBA shipment ref (Packing). Staged location: `staged_location_code` on the receiving line (Arrival, Unbox).

### Racks

Racks exist as data (`/api/racks`, `src/lib/locations/racks.ts`, movable rack codes like `RK12`, shelves `RK12-3`). **Nothing maps a destination (Return, UPS, USPS, FedEx) to a rack today.** Vocabulary: Room, Aisle, Bay, Level, Position, Rack, Tote (`H-####`), LPN (`R-*`). Never "Zone". Look words up with `ds_vocabulary` before you paint them.

---

## Requirements

1. **One pure resolver per station, one shared shape.** Add `src/lib/station/next-action/` with a type
   `StationNextAction = { kind: string; headline: string; detail?: string; destination?: { label: string; rackCode?: string }; tone: 'default' | 'warning' | 'danger' }`
   and one pure function per station (`arrivalNextAction(record)`, `unboxNextAction(record)`, …). Inputs are the record facts above; no fetching inside. Each resolver gets a domain unit test (`skill://domain-unit-test`) covering every branch: return, unfound, UPS, USPS, FedEx, unknown carrier, and missing data.
2. **The destination map is data, not code.** Return rack, UPS rack, USPS rack and FedEx rack are org-configured. Add the smallest migration that holds it, for example `station_destinations (organization_id, destination_key, rack_id)` under RLS like every tenant table (`skill://db-migration-author`, `skill://org-scope`), plus a read in the station's existing payload so the headline needs **no extra request**. With no configured rack, the headline still says "Return rack" / "UPS rack" by name, never a blank.
3. **Headline slot — top left of the center pane, big.** Add one `headline` slot to `StationWorkbench` (or `StationContextBar`) rendered above the identity row. Big type from `ds_tokens` (the display/title role, not an arbitrary `text-[Npx]`), at most two lines: the headline (e.g. **"Place on the UPS rack"**) and a muted detail (e.g. "UPS tracking · purchase from Zoho PO-1234"). The tone comes from the resolver (a warning for unfound). It replaces, it does not duplicate: when a record is open, the header's static `PAGE_NEXT_ACTIONS` line is hidden. When idle, the static line stays.
4. **Label — top right, smaller, always visible.** Move `UnboxLabelPreview` out of the band stack into the top-right of the same header row as the headline, at a fixed small size (the 2×1" face at about 1× = 192×96 CSS px, `fit` fixed, not `host`). Click to enlarge or edit keeps working (`LabelFaceSlotOverlay`). Unbox and QC both use it; Arrival, Picker and Scan-out have no label, so the right side is empty there. Packing shows its `PackPapersStatusCard` state there instead (printing / printed / failed), not in the feedback slot.
5. **Mobile.** The same resolver feeds `/m/*` (`docs/mobile-first/SURFACE_LAW.md`): the headline is the first line of the station screen. Packing has no mobile queue (ruling 2026-09-14); do not add one.
6. **Delete what this replaces.** The per-controller hint strings that say the same thing as the resolver go away. `PAGE_NEXT_ACTIONS` keeps only the idle lines.

## Out of scope

- The sidebar recent rails and their row menus. They are per station and handled separately.
- New carrier detection, new print routes, new label templates.
- Lane lifecycle: never start, restart, stop or switch a lane. Prove it on the lane already serving `:3050`.

## Open decisions for the operator (ask before coding them)

- QC, Picker, Packing and Scan-out destinations (the [INFERENCE] rows above).
- Does an unfound carton with a recognised carrier go to the Return rack or the carrier rack? (The operator's example says Return rack.)
- Are DHL and Amazon Logistics racks needed, or do they fall back to a named "Other carrier" rack?

## Done when

- At `/triage` and `/unbox`, scanning a return or an unfound carton shows **"Place on the Return rack"** top left in large type. A UPS, USPS or FedEx purchase shows that carrier's rack. Screenshot each.
- The label sits top right at its fixed small size on Unbox and QC, is still clickable, and the Items band starts directly under the identity row.
- Every resolver branch has a unit test; `pnpm verify:fast` has no new failures. Lint, routes and ring failures in other files belong to other sessions.
- `ds_critique` is clean on every touched UI file.
