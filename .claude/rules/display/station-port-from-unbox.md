# Station port from Unbox — identify · remove · compose

> **How to lift a sibling scan station onto the Unbox display method.**
> Golden contract: [`unbox-station.md`](unbox-station.md). Column shell tiers:
> [`station-workbench.md`](station-workbench.md). Pattern-evolution law:
> **promote Unbox first, port one station at a time, delete the old path**
> ([`../pattern-evolution.md`](../pattern-evolution.md) §6).

**Applies to:** Arrival · Testing · Pack · Shipping (and later Pickup / Repair).
**Does not apply to:** Labels (intentional centre tabs) · desk Workbench inspectors ·
carton-read `/carton` · non-procedure benches without a capture walk.

---

## The rule in one line

> Find every surface that does Unbox's job differently → **retire it** (delete or
> allowlist-shrink) → **compose** the Unbox-named modules with station-local
> maps (dock ACTION · railLeaf · Displays index) — never a page-local twin.

A prose-only "we use Displays now" claim is not a port. The retirement is not done
until the old path is **deleted**, or a guard names the **exact** surviving call
sites and only shrinks.

---

## What "Unbox method" means (acceptance)

A station is ported when **all** of these hold (or are an explicit Tier C carve-out
in `station-workbench.md`):

| # | Layer | Pass condition |
|---|---|---|
| 1 | **Identity** | `StationContextBar` `placement="flow"` + entity adapter above `StationWorkbench`; `bodyGap="none"`; `reserveIdentityClearance={false}` |
| 2 | **Centre** | Ops-flow only — that station's exact triage/I/O; **empty** mid-canvas tabs for reference tools; no advisory strips / dossiers / ticket history |
| 3 | **Dock** | Flush two-band floor host patterned on `UnboxDockHost` (`gap-0` · hairline · Band 1 ACTION XOR terminal · Band 2 pager + progress when procedure exists). No raised soft `Panel`, no Omnichannel as the floor shell |
| 4 | **Right edge** | `StationDisplaysPushColumn` for KNOW / browse — never `RightRailHost` for station tools; never a third region |
| 5 | **Procedure** (if derived) | ONE derivation hook; step→ACTION map + either-or; step→`railLeaf` map + either-or; cockpit auto-follow yields to close/browse |
| 6 | **Guards** | Station-local guards flip from "pins the fork" to "pins the Unbox grammar"; family baselines **shrink**; never raise |

---

## Identify — smell checklist

Run these greps on the target panel (and its dock / overview builders). Each hit
is a candidate twin unless the station's Tier carve-out names it.

### Centre smells (DO pollution)

```bash
# Advisory / dossier in the locked middle
rg -n 'WorkflowRecommendationsStrip|NeedsAttention|SectionTabsSlider' \
  src/components/<station>

# Soft / raised chrome that Unbox banned on the work plane
rg -n 'Panel.*radius=|elevation=\"raised\"|OmnichannelComposerDock' \
  src/components/<station>
```

| Smell | Unbox replacement |
|---|---|
| Centre `SectionTabsSlider` for Photos · Ticket · Pairing · Timeline | Displays leaf + `openDisplays(...)` |
| `WorkflowRecommendationsStrip` / amber banners / rollup strips | Displays leaf or identity trailing — never centre |
| Mid-canvas Pairing / Claim wizard | Displays (`linkage` / `ticket`) |
| Centre `ProcedureDeck` list as hero | Dock ACTION + cockpit `railLeaf` (deck stays parked) |

### Dock smells (hands pollution)

| Smell | Unbox replacement |
|---|---|
| Raised `Panel` / `rounded-2xl` dock shell | Flush `*DockHost` copying `UnboxDockHost` geometry |
| Omnichannel / chat composer as the procedure floor | `DenseComposeFields` notes mode inside the flush host |
| Terminal always visible beside step CTA | XOR — terminal only when `activeKey === null` (or station has no procedure) |
| Content-sized CTA chips + `gap-*` air | Full-height abutting segments |
| Tab-id → dock CTA coupling | Step derivation / settle state only |

### Right-edge smells

| Smell | Unbox replacement |
|---|---|
| Detail still in centre tabs while Displays also exists | Delete the centre twin; Displays alone |
| `RightRailHost` for station tools | `StationDisplaysPushStack` |
| Desk `InspectorActionFloor` on Displays | `StationDisplaysHeaderActions` |
| Per-entity occupant ids on a queue walk | Stable occupant id (preconditions in SoT — ask first) |

### Procedure smells

| Smell | Unbox replacement |
|---|---|
| No derivation; progress is vanity KPI | Station procedure module + gates + ONE hook |
| Two lists of steps (Studio vs bench) | Single `@/lib/stations/procedure` declaration |
| Hand-ticked "I photographed X" | Evidence-derived gates only; person stamps only for read-acks |
| Cockpit store separate from step pointer | `railLeaf` from the same hook as `activeKey` |

---

## Remove — retirement discipline

1. **List the twins** (file paths) before editing.
2. **Wire the Unbox-shaped replacement** behind the same panel entry.
3. **Delete** the old component / import / centre tab / raised dock — or add a
   shrink-only allowlist line with a dated reason.
4. **Flip the guard** that previously pinned the fork (e.g. Testing's
   `testing-qc-dock.guard.test.ts` "never UnboxDockHost" becomes "must match
   flush Unbox geometry").
5. **Run** `npm run verify` — family baselines must not grow.

`knip` cannot see a fork whose doors are both imported. Only a guard answers
*"is this the only way in."*

---

## Port — station-local maps (compose, don't copy)

Do **not** import Unbox's capture vocabulary wholesale into Testing or Pack.
Each station owns:

| Map | Unbox reference | Sibling duty |
|---|---|---|
| Procedure declaration | `src/lib/stations/procedure.ts` (`unbox`) | Own `surface` + flows (e.g. `testing-procedure.ts`) |
| Gate / derive | `derive-capture-step-states.ts` | Station gates over the same linear walk primitive |
| Hook | `useUnboxProcedureSteps` | `use<Station>ProcedureSteps` — same shape: `activeKey`, `railLeaf`, `focusStep`, realtime evidence |
| Dock ACTION | `steps/dock/index.ts` | `steps/dock/` either-or twin |
| Rail KNOW | `steps/rail/index.ts` | Per-station `railLeaf` either-or |
| Displays index / tabs | `unbox-side-tabs.ts` + builders | Station `build*DisplayTabs` / index rows — same push stack |
| Floor host | `UnboxDockHost` | Shared geometry primitive **or** station host that matches the flush contract (prefer growing a shared `StationProcedureDockHost` when the second consumer lands) |

### Shared shells (always compose)

- `StationScanPaneHost` · `StationPanelRoot` · `StationWorkbench`
- `StationContextBar` · `CartonContextCard` (or order adapter)
- `StationDisplaysPushStack` / `StationDisplaysPushColumn`
- `StationDisplaysHeaderActions` · `StationDisplaysEdgeToggle`
- `STATION_WORKBENCH_*` / Flex-Grow Sandwich (`STATION_PUSH_CENTER_FLOOR_PX` = 720)
- Terminal via `useStationTerminalAction` + `STATION_TERMINAL_REGISTRY` (or typed exempt)

---

## Per-station scorecard (2026-08-09 audit)

| Station | Centre | Dock | Displays | Procedure | Next delete / port |
|---|---|---|---|---|---|
| **Unbox** | Golden | `UnboxDockHost` | Full + cockpit | Full | — |
| **Arrival** | Door-flow OK (items + Classify) | Flush `UnboxDockHost` + dogfood Save | Pairing only | Staging in Band 1 | Advisory strip out; notes stay Unbox-only |
| **Testing** | Lines + label OK | Raised `TestingDockHost` | Full | Vocab only | Replace dock; add derivation + railLeaf; flip `testing-qc-dock.guard` |
| **Pack** | Checklist + papers/rollup debt | Terminal-exempt | Photos·Timeline·Listings | N/A | Move papers/rollup off centre; keep exempt |
| **Shipping** | Pack·Units tabs + banners | `UpNextActionDock` preview | Condition·Timeline·Listings | N/A | Strip advisory; decide Units→Displays |
| **Labels** | Centre tabs **by design** | In-flow terminal | No push | N/A | Registry slice only — do **not** force Displays |

Detail paths and greps: keep this table honest when a port lands (shrink rows, don't soft-check).

---

## Recommended port order

1. **Arrival** — done (2026-08-09): centre advisory out; flush `UnboxDockHost` + dogfood Save; Staging Band 1; notes Unbox-only.
2. **Testing** — flush dock → procedure hook → `railLeaf` cockpit (named port target in `station-workbench.md`).
3. **Pack** — centre chrome only; keep terminal-exempt.
4. **Shipping** — advisory out; Pack·Units redesign only with an explicit ops-plane decision.
5. **Labels / Packer review** — registry / hand-VM only (FOLLOWUPS), not anatomy clone.

Never port N stations in one pass. Never pre-port cockpit to a station that still
has a raised dock or centre advisory.

---

## Agent checklist (copy into the PR)

```markdown
### Station port — <name>
- [ ] Smell grep run; twin list attached
- [ ] Centre = ops-flow only (no SectionTabsSlider for Displays tools)
- [ ] Dock = flush Unbox geometry (or Tier C exempt documented)
- [ ] Displays = StationDisplaysPush*; Macro = StationDisplaysHeaderActions (top band, ⋮ last)
- [ ] Procedure maps (if any) either-or guarded; one derivation
- [ ] Old twin DELETED or shrink-only allowlist
- [ ] Station guard flipped; family baselines shrunk
- [ ] `npm run verify` green
```

---

## Related

- Golden: [`unbox-station.md`](unbox-station.md)
- Cockpit: [`scan-cockpit.md`](scan-cockpit.md)
- Shell tiers: [`station-workbench.md`](station-workbench.md)
- Older structural siblings (motion / tabs): `docs/todo/unbox-SIBLING-PATTERNS.md`
- Registry follow-ups: `docs/todo/station-workbench-port-FOLLOWUPS.md`

Indexed by [`../contextual-display.md`](../contextual-display.md)
