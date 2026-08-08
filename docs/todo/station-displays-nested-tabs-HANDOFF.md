# Handoff — nested tabs inside the Station Displays column

**Surface:** the right-edge **Displays** push column (`src/components/station/displays/`) on Unbox · Arrival · Testing · Pack · Shipping · Packer review.
**Not in scope:** desk `RightRailHost` inspectors (`components/right-rail/`) — different region, different noun.
**Created:** 2026-08-07

## The job

1. **Enumerate every nested switcher that lives *inside* a Displays leaf** — the tab strips one level below the Root Index. Produce a table: leaf · switcher · verbs · component · what each verb renders · whether it is presence-exclusive.
2. **Decide one grammar for that level and apply it uniformly.** Today the level is mixed: some leaves nest an underline `TabDisplay`, one nests a `segment`, one is presence-exclusive with no strip, and one was deliberately flattened to a stacked dossier.
3. **Guard whatever is decided**, because a rules file cannot fail.

## Known inventory (verify and complete — this is a starting point, not the answer)

| Leaf | Nested switcher today | SoT |
|---|---|---|
| Photos | Move · Send — `TabDisplay appearance="underline"`, default **Move** | `source-of-truth.md` → Station Displays navigation |
| Linkage | Link · Note — same underline parent | ″ |
| Units | Units · Prebox — same underline parent | ″ |
| Ticket | **none** — presence-exclusive (no linked ticket → Claim; linked → Chat) | ″ |
| Claim | New ticket · Link existing — `TabDisplay appearance="segment"` (claim-only child layer) | ″ |
| Inventory | **none** — one stacked dossier (PO · lines · notes · activity) | ″ |

Then sweep the sibling stations: `build-triage-displays.tsx`, `build-testing-displays.tsx`, `PackOrderPanel`, `ActiveOrderWorkspace`, `PackerReviewMode`.

## The tension you must resolve, stated honestly

The research case for keeping lateral tabs is real: stripping them forces vertical drill-downs and costs spatial predictability, and an operator who wants an item's activity log should not have to traverse a hierarchy to reach it.

**But the shipped SoT already ruled the other way for one leaf, on a specific ground:** Inventory stacks PO · lines · notes · activity into a single scroll precisely so there is **no second Back** inside a leaf. That is the same anti-pattern the research names — two back affordances force the operator to work out which layer they are escaping — and this column reached it from the opposite direction.

So the question is not "tabs or no tabs." It is:

> **At which level does lateral movement belong — the Root Index, or inside a leaf?**

Today the Root Index *is* the lateral layer (grouped rows, one keystroke apart, armed marker travels). A nested strip adds a second lateral layer under it. Two lateral layers is the maze; one is navigation.

## Decision framework, mapped onto this column

| | Breadcrumb takeover | Master–detail split |
|---|---|---|
| Maps to | index → full-height leaf (**what ships today**) | index rows left, leaf body right, inside the column |
| Back | single — the leaf's sticky Back → index | none |
| Where tabs live | under the leaf header | in the detail pane header |
| Cost here | the column is ~360–560px; a split inside it starves both panes | needs width the station frame does not have |

**Read the frame before choosing.** The station middle is locked at `STATION_PUSH_CENTER_FLOOR_PX` (720) and Displays takes leftover with a 280px floor — so a true master–detail split *inside the column* is likely not affordable at 1440. That is a measurement, not an opinion: check `src/lib/right-rail/frame.ts` and measure at 1440 and 1920 before recommending it. If the split is unaffordable, the honest answer is breadcrumb-takeover with **at most one** nested strip per leaf, and Inventory's stacked-dossier ruling extends to every leaf whose sections are *reference* rather than *distinct verbs*.

## Hard constraints (do not relitigate)

- **One Back per screen.** The leaf's sticky Back → index is it. A nested strip must never add a second.
- **Displays ≠ inspector.** Operator copy is *Open displays* / *Hide right panel*.
- **Row anatomy on the index is frozen** — icon · label · tone chip, flush-left icon, one control per row, traveling `layoutId` marker. `display/station-workbench.md` → Displays Root Index.
- **Nested strips are industrial `TabDisplay`** (underline, or `segment` for a claim-only child layer) — never soft `TabSwitch` pills, never a second inverse fill stacked under the parent. Guard: `tab-display-displays-hosts.guard.test.ts`.
- **Every declared display stays reachable.** Guard: `station-displays-reachability.guard.test.ts`.

## Answer this before designing

The research asks whether these parent–child relationships are driven by **mouse during auditing** or **sequential barcode scans on a fulfillment line**. For this column the SoT already answers most of it and the answer is *both, at different altitudes*:

- The **centre** is scanner-driven, act-and-clear (Station contract, `display/station.md`).
- **Displays is the Action Plane** — keyboard/wedge mutations on the active entity — while the desk grid/inspector is the Context Plane (`source-of-truth.md` → Station Action vs Context planes).

What is genuinely open, and what you should go measure rather than assume: **how often an operator opens a Displays leaf mid-scan versus between cartons.** If it is mid-scan, lateral depth is expensive and the flattening instinct is right. If it is between cartons, a nested strip is cheap. Neither is currently instrumented — say so plainly if you cannot answer it, rather than picking a pattern and calling it research.

## Files

- Column + index: `src/components/station/displays/`
- Leaf hosts: `PhotosDisplayHost` · `LinkageDisplayHost` · `UnitsDisplayHost` · `InventoryDisplayHost` · `TicketDisplayHost`
- Builders: `line-edit/terminal/unbox-tabs.tsx` · `build-triage-displays.tsx` · `build-testing-displays.tsx`
- Law: `.claude/rules/source-of-truth.md` → Station Displays navigation · `.claude/rules/display/station-workbench.md` → Displays Root Index
- Frame math: `src/lib/right-rail/frame.ts` · `src/lib/right-rail/station-dual-rail.ts`

## Definition of done

A table of every nested switcher, one ruled grammar for the level, the ruling written into both rule files, a guard that fails when a leaf grows a second Back or a soft pill strip, and `npm run verify` green.
