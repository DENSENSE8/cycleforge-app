# Handoff — pin every scan station to the Unbox SoT (and slim the top context bar)

**Copy the section below the line into a fresh Claude Code / Cursor session.**
Repo: `cycleforge-app` · stay on the checkout's branch · attach to the user's dev
server on **`:3050`** (never start / restart / kill it).
**Do not edit this handoff file** as part of the implementation.

**Prior art — the method this reuses:**
`docs/todo/zombie-code-elimination-HANDOFF.md`. That change deleted measured dead
code, then installed the cheapest enforcement that would have caught it, in this
repo's own idiom (a guard test, never a new toolchain). Same shape here.

---

You are an agent in the Cycle Forge monorepo with **fresh context**.

## Mission

**Unbox is the source of truth for every scan station.** Its chrome, its
primitives, and its procedural flow are the house answer. Triage · Testing ·
Packing · Shipping · Pickup · Repair must compose them, not re-type them.

Two halves, and the first is far cheaper than it looks:

1. **Delete the sidebar twins.** Every station already mounts the SoT identity in
   the middle. The sidebar copy is a *duplicate*, not a missing port.
2. **Slim the top context bar** (`CartonContextCard`, 875 LOC) and finish the
   procedure port that already has its waist built.

## Hard laws (unchanged, and they bind this work)

- **Compose the named SoT; never fork a page-local twin.** A genuinely different
  job earns a **sibling that composes the shared primitive** — that is growth,
  not a fork (`pattern-evolution.md`).
- **A retirement is not done until the old path is DELETED, or a guard names the
  exact surviving call sites** (`pattern-evolution.md` → Always #6). Every ruling
  below lands as a guard entry, not as prose.
- **`npm run verify` before done. Never raise a ratchet baseline to pass.**
- **The user manages commits.** The git index is **shared with concurrent
  sessions** — run `git diff --cached --name-only` before every commit and
  unstage anything that is not yours. Never `git stash`. Prefer
  `git commit -m … -- <exact paths>`; a directory pathspec will sweep a
  neighbour's in-flight file.
- **Station contract:** a Station is scanner-driven, one transient entity, the
  active card is the **middle** (`display/station.md`). A browse list or an
  identity display in the scan column is the anti-pattern that doc opens with.

## Measured state (2026-08-02 — re-measure, the tree moves fast)

### The identity layer is HEALTHIER than it looks

All five adapters compose the SoT card, and all mount in a workspace panel:

| Adapter | LOC | Composes `CartonContextCard`? | Mounted by |
|---|---|---|---|
| `LineCartonContextSection` | 230 | yes | `LineEditPanel:656`, `TriagePanel:282` |
| `TestingCartonHeader` | 70 | yes | `TestingPanel:386` |
| `ShippingEntityContextHeader` | 124 | yes | `ActiveOrderWorkspace:135`, `LabelsOrderWorkspace:329` |
| `PackOrderIdentity` | 88 | yes | `PackOrderPanel:264` |
| `ReviewOrderIdentity` | 59 | yes | `PackerReviewMode` |
| `PickupEntityContextHeader` | — | **MISSING** | Pickup composes no station chrome at all |

**So do not "port identity to the SoT" — it is already there.** The defect is
that three stations *also* render the entity a second time, in the sidebar.

### The actual violation: the entity is rendered TWICE

| Station | Middle (correct, SoT) | Sidebar (hand-rolled twin) |
|---|---|---|
| **Testing** | `TestingCartonHeader` | `TestingSidebarPanel` (481) → `TestingScanBar` + `TestingScanSessionFeedback` (76) |
| **Shipping** | `ShippingEntityContextHeader` | `sidebar/tech/ShippingScanBand.tsx` → `ActiveOrderScanFeedback` at **L163 and L174** |
| **Packing** | `PackOrderIdentity` | `PackerSidebarPanel` (50) mounts **the whole `StationPacking`** (772) — scan bar, goal bar, `OrderPackChecklist`, active order |

Unbox is the control: `ReceivingSidebarPanel` contains **no** identity, and
`LineEditPanel:654` mounts `StationContextBar` above `StationWorkbench`.

### Composition matrix — what never left Unbox

Composed by most stations: `StationWorkbench` · `StationContextBar` ·
`SectionTabsSlider`/`buildSectionTabs` · `StationTerminalDock`.

**Unbox-only, zero siblings:** `UnboxPushColumn` (5 uses) ·
`ScanStationProgressControl` · the procedure hooks (7) · `ProcedureDeck` ·
`OmnichannelComposerDock` (3).

**Zero adoption:** Pickup and Repair compose *nothing*. They never joined the
family; they are not drifting from it.

### The procedure waist ALREADY EXISTS — and declares one surface

`src/lib/stations/procedure.ts` (486) is a **surface-keyed registry**:
`ProcedureDefinition` · `getProcedure(surface)` · `resolveProcedureSteps(def,
input, phase)`. Unbox already flows through it —
`deriveProcedureSteps` (in `components/receiving/workspace/derive-capture-step-states.ts:419`)
is `resolveProcedureSteps(getProcedure('unbox'), input, 'capture')`.

It declares **exactly one** surface: `'unbox'` (line 250).
`registerBuiltinProcedures()` registers exactly one procedure.

The render primitives are already station-agnostic:
`design-system/components/procedure/{ProcedureDeck, ProcedureChecklist}`, and
`UnboxProcedureChecklist` is already a thin adapter over the DS one.
`SurfaceKey` already carries `triage`, `pickup`, `repair`.

**So pinning a station's procedure is mostly writing a `ProcedureDefinition` —
not a rewrite.** That is the single most important fact in this document.

### Hand-rolled procedural twins (~2,000 LOC)

- **Packing** — `packing/OrderPackChecklist.tsx` (315) +
  `PackChecklistLineRow.tsx` (412) + `lib/packing/order-pack-checklist.ts` (348)
- **Testing** — `tech/sku-testing/{ChecklistSection (147), ChecklistStepRow
  (124), StepValueControl (93), useChecklistEditor (183)}`
- **Receiving alone has three step derivations** — `derive-capture-step-states`
  (434) · `derive-receiving-step-states` (141) · `derive-unfound-step-states` (57)
- Repair `RepairIntakeStepper` (95) · Shipping `PackoutChecklistCard` (133) ·
  `stations/blocks/ChecklistBlock` (174)

### Dead / duplicate inside the family

- `src/components/station/StationScanBar.tsx` is a **2-line re-export shim** of
  `station/scan-bar/StationScanBar.tsx`, with one importer (`StationFbaInput`).
  Two doors, one destination — `knip` cannot see it.
- `components/mobile/station/MobileScanConfirmation.tsx` (205) — unreachable.
- **The four per-station scan bars all correctly compose `ThemedStationScanBar`.**
  That layer is healthy. **Leave it alone.**

---

## Part 1 — Delete the sidebar twins (start here; each is one PR)

### The ruling to implement

**A Station renders its active entity in exactly ONE region: the middle.** The
scan column carries the scan bar and the recent rail — never an identity card,
never a session summary, never a checklist. Two renders of one entity is not a
redundancy, it is two things that can disagree, in the surface whose whole job is
telling an operator what is in their hands.

### 1A. Shipping — smallest, do it first

`sidebar/tech/ShippingScanBand.tsx` mounts `ActiveOrderScanFeedback` twice
(L163, L174). `ActiveOrderWorkspace:135` already renders
`ShippingEntityContextHeader` in the middle. Remove both sidebar mounts.

**Check before deleting:** `ActiveOrderScanFeedback` is *also* the Station
active-card primitive named in `display/station.md` §6 (big pass/fail card). Its
correct home is the station's focus surface, not the sidebar band. Verify whether
any other surface mounts it as an active card before assuming it is dead.

### 1B. Testing

`TestingScanSessionFeedback` (76) shows tracking ↔ SKU + serials in the sidebar
while `TestingCartonHeader` shows identity in the middle. Fold whatever fact the
middle genuinely lacks into `TestingCartonHeader` (it is 70 LOC — there is room),
then delete the sidebar display.

**Do not simply delete the serial strip without checking it.** `SerialPreviewStrip`
is the prepack handoff picture for the packer; if that fact has no home in the
middle, it needs one before the twin goes.

### 1C. Packing — biggest, do it last

`PackerSidebarPanel` (50) mounts the entire `StationPacking` (772) — a whole
scan station inside a sidebar. `PackOrderPanel:264` already renders
`PackOrderIdentity` in the middle.

This is a real decomposition, not a delete: `StationPacking` owns the scan bar,
the goal HUD, `OrderPackChecklist` and the active order. Split it — scan bar +
rail stay in the sidebar (that is the Unbox shape), everything else moves to the
workspace panel.

### 1D. The guard that stops it recurring

`station-sidebar-identity.guard.test.ts` — walk `src/components/sidebar/**` and
fail on any panel that renders an identity/active-entity display
(`CartonContextCard`, `ActiveOrderScanFeedback`, `*SessionFeedback`,
`StationPacking`, `*OrderIdentity`). Seed the allowlist with today's violations
so it lands green, then **shrink-only** — identical to every other ratchet.

Without this the whole PR is a prose retirement (`pattern-evolution.md` #6).

---

## Part 2 — Slim the top station context bar

`CartonContextCard` is **875 LOC** and is the SoT for the bar in the screenshot:
`‹ · HIGH · UNFOUND · PO · listing · # · location · CLAIM · 📷+`.

Three things to investigate — **measure before cutting, and confirm each with the
user:**

1. **Three densities, one of them declared legacy.** `density: 'card' | 'bar' |
   'bar-stacked'`. The docblock calls `card` "(legacy)" — a retirement claimed in
   prose with nothing enforcing it. Find the surviving `card` call sites; either
   migrate them or write the shrink-only allowlist.
2. **`bar-stacked` has exactly one consumer.** The docblock says "Unbox opts in;
   every other adapter [does not]". A two-row density serving one surface is a
   single-consumer primitive — `pattern-evolution.md` says that is the *easiest*
   kind to unify, not a reason to keep a third mode.
3. **Empty tracks reserve width for facts that do not exist.** On the UNFOUND
   carton in the screenshot, the listing and `#` slots render dashed placeholder
   rails. `ui-design-system.md` → *Never reserve height a body has not asked for*
   is the same principle on the other axis; `source-of-truth.md` → *Honest
   absence* says a missing fact renders `—`, not a reserved rail. Decide
   deliberately: a placeholder that marks an **actionable gap** (scan a PO here)
   is legitimate chrome; one that merely pads the row is not.

**Do not slim by deleting facts an operator needs.** The card is dense because
the surface is dense (its own docblock: "operations-heavy"). The target is fewer
*modes* and honest absence — not fewer facts.

---

## Part 3 — Pin the procedural flows

Order matters; each step is cheap only because the previous one landed.

1. **Lift the runtime derivation into the waist.** `deriveProcedureSteps` lives
   in `components/receiving/workspace/derive-capture-step-states.ts` — a
   receiving-local file — while the registry it calls is already shared. Move the
   derivation beside `lib/stations/procedure.ts` so a non-receiving station can
   call it without importing a receiving component directory.
2. **Declare a `ProcedureDefinition` per surface** — `triage`, `testing`,
   `packing` — and `registerProcedure` each. The step vocabularies differ; the
   waist does not.
3. **Swap the bespoke checklists onto `ProcedureDeck` / `ProcedureChecklist`.**
   Packing's `OrderPackChecklist` + `PackChecklistLineRow` (727 LOC of view) and
   Testing's `sku-testing/*` (547) become step bodies.
4. **Collapse the three receiving derivations** into the one waist.

**A caution worth holding.** A packing kit-BOM verification and an unbox evidence
capture may be genuinely **different jobs**. The house rule is that a different
job earns a sibling that *composes the shared primitive*. The target is one
derivation waist and one deck/checklist renderer with different step
vocabularies — **not one merged procedure**. If a station's steps will not fit
`ProcedureStep`, that is a signal to grow the type, or to stop and ask — not to
force the surface through it.

---

## Part 4 — Dead / duplicate cleanup (fold into any PR above)

- `src/components/station/StationScanBar.tsx` — 2-line shim; retarget
  `StationFbaInput` at `station/scan-bar` and delete it.
- `components/mobile/station/MobileScanConfirmation.tsx` (205) — verify, delete.
- **Pickup and Repair**: decide explicitly. Either they join the family (a
  `PickupEntityContextHeader` adapter + `StationWorkbench`) or they are declared
  non-Station in `station-workbench-chrome-config.ts`. `RepairIntakeForm` is
  already in `STATION_WORKBENCH_ADOPTION_EXEMPT` "until remount" — that exemption
  has no date on it, which is the flag-lifecycle smell in another costume.

After each PR: `npm run knip:baseline`, commit **only if the count went DOWN**;
`npm run debt` to confirm no ratchet rose.

---

## Explicit non-goals

- Re-porting identity to `CartonContextCard`. **It is already composed by all
  five adapters** — the defect is the sidebar duplicate.
- Touching the four per-station scan bars. They correctly compose
  `ThemedStationScanBar`.
- Merging Packing's and Unbox's procedures into one vocabulary.
- Deleting facts from the context bar to make it shorter.
- Raising any ratchet baseline, `--no-verify`, or a new toolchain.

## Definition of done

- [ ] 1A / 1B / 1C landed — no `sidebar/**` panel renders an active entity
- [ ] `station-sidebar-identity.guard.test.ts` green with a shrink-only allowlist
- [ ] Context-bar density modes reduced **or** a written decision why all three stay
- [ ] `card` density either migrated or guarded with its surviving call sites named
- [ ] At least one non-Unbox `ProcedureDefinition` registered and rendering on the DS deck
- [ ] `StationScanBar` shim deleted; Pickup/Repair status explicitly declared
- [ ] `station-workbench-chrome.guard.test.ts` baselines unchanged or lower
- [ ] `npm run verify` green (attribute foreign red gates, do not inherit them)

## Paste prompt (short)

> Read `docs/todo/station-sot-consolidation-HANDOFF.md` and execute Part 1
> (1A → 1B → 1C → 1D), then Parts 2–4. Re-measure first — the numbers are from
> 2026-08-02. Key fact: all five identity adapters ALREADY compose
> `CartonContextCard` and mount in the middle, so Part 1 is deleting sidebar
> duplicates, not porting. Do not touch the per-station scan bars (they compose
> the SoT correctly). Land each ruling as a guard entry, never as prose.
> `npm run verify` before done; never raise a baseline; commit with exact
> pathspecs (the index is shared).
