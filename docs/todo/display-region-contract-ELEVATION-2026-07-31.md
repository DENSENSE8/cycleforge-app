# Display region contract — ELEVATION draft (2026-07-31)

**Status:** ratified in interview, **not yet law**. Docs-only. No `src/**` change proposed here.
**Supersedes on landing:** `.claude/rules/contextual-display.md` (region half), `.claude/rules/display/station.md`,
`.claude/rules/display/kiosk-shell.md`, and the archetype half of `.claude/rules/kinetic-ledger.md` law 2.
**Does not touch:** Kinetic Ledger tokens, density modes, motion law, or any DS primitive. This elevates
**region I/O + persistence + update/display law** only.

Every ruling below was decided by the owner in interview on 2026-07-31. Lines marked `[DERIVED]` follow
from those rulings but were not separately ratified. Lines marked `[UNVERIFIED]` are inference about the
codebase that a reader must confirm before acting.

---

## Artifact 1 — Product frame

> **Cycle Forge is a station OS.** It turns a company's operating procedure into something a bench can
> execute. An owner authors the **Procedure** once on a Canvas; every bench renders the *next prescribed
> action* for the unit in the operator's hands; every step emits **measured timing**; a live Monitor shows
> the owner where labor-minutes are being lost against industry benchmarks and sends them back to the
> Canvas to change the Procedure. The unit of money is **labor-minutes per unit processed**, with
> **claim/dispute recovery** second — and when they conflict, **correctness wins**. Used-goods reseller
> operations is the *first vertical*; USAV is the dogfood tenant; neither is the product.

**Roles** (job-bound contracts, so these are *typical users*, never gates):
buyer = owner-operator (splits ~40 staff) · floor operator = executes the Procedure ·
desk operator = burns down a backlog · CEO = watches, never edits · author = reshapes the Procedure.

**Non-negotiable loops (9):** arrival → unbox + evidence → serialize → test/grade → **listing handoff** →
pack → ship → support/claims → returns.

**Out of product forever:** a marketplace listing editor. Cycle Forge produces listing *readiness* and
hands off to a channel; it does not compose or publish the listing.

**Consequence:** `AGENTS.md` line 1 ("multi-tenant reseller-ops SaaS") now describes the **vertical**, not
the product. See Artifact 5.

---

## Artifact 2 — The elevated region contract

### The two nouns that did not exist before

| Noun | Is | Lives in | Authored by |
|---|---|---|---|
| **Procedure** | the *conditional, per-unit next step* — what to test next, what goes in this box, the exact arrival flow | `workflow_definitions` / `workflow_nodes` / `workflow_edges` ([schema.ts:4045](../../src/lib/drizzle/schema.ts:4045), [4061](../../src/lib/drizzle/schema.ts:4061)) | **Canvas**, draft → publish |
| **Composition** | the *static layout* of a bench — ordered slots → block instances | `station_definitions.config` ([schema.ts:4225](../../src/lib/drizzle/schema.ts:4225)) | station builder, versioned + `is_active` |

**A Station renders its Composition, filled with the Procedure step resolved for the unit in hand.**
The seam already exists: `station_definitions.workflow_node_id` ([schema.ts:4232](../../src/lib/drizzle/schema.ts:4232))
and `SURFACE_REGISTRY.workflowNodeType` ([surface-keys.ts:92](../../src/lib/stations/surface-keys.ts:92)).

**Why the split is load-bearing:** the Procedure *branches* — `workflow_edges` carries named output ports, so
an inspection node's `fail` port points at the repair node. `station_definitions.config` is one static layout
per `(org, page_key, mode_key)` and has no branch. Putting the Procedure there would have required inventing
a second branching engine beside the one that ships.

### The Procedure loop (the product, in four arrows)

```
  Canvas  ──author──▶  Station  ──emit timing──▶  Monitor  ──diagnose──▶  Canvas
 (define)            (execute)                  (measure)               (revise)
```

Every contract below exists to serve one arrow, or to hold the entities the arrows move.

### The discriminator — re-based on JOB, not mechanism

Run **per region**, not per page. First yes wins.

- **Q1 — ACT-AND-CLEAR?** Does the region take **one transient entity**, act on it, and clear — with
  selection that is **never URL-addressable**? → **Station.**
  *A scanner is the typical input, not the definition.* A touch counter (Kiosk) qualifies. A backlog with
  durable selection does not, whatever it is holding.
- **Q2 — ONE DURABLE ENTITY, READ-FIRST?** Is the region the identity / evidence / history of **exactly one**
  durable entity, with **no collection to navigate** and no in-region CRUD as its primary job? → **Record.**
- **Q3 — OBSERVE MANY?** Observing a live or historical stream / rollup, **no durable selection**, nothing
  persists, filters are throwaway URL params? → **Monitor.**
- **Q4 — DEFINITION GRAPH?** A spatial node-graph the user pans / zooms / focuses, edited **draft → publish**?
  → **Canvas.**
- **Q5 — DEFAULT** → **Workbench.** Pick a record from a collection and edit it; durable URL selection; CRUD.

**Order is load-bearing.** Record must precede Monitor (a single-entity read otherwise satisfies "observe,
persists nothing"). Canvas must precede Workbench (a graph edit otherwise falls through to CRUD).

**What changed from the old Q1.** It keyed on `inputModel === 'scanner'`
([archetype.ts:51](../../src/lib/stations/archetype.ts:51)) — a mechanism. Under job-binding that is illegal, and
it produced two live defects: `/support` declares `archetype: 'station'` with `scan: null`
([surface-keys.ts:244](../../src/lib/stations/surface-keys.ts:244)), and Kiosk had to be exiled from all four
contracts for the sole reason that it has no scanner ([kiosk-shell.md](../../.claude/rules/display/kiosk-shell.md)).
Both are fixed by the re-base: Support fails Q1 on selection durability regardless of input; Kiosk passes Q1
on the job.

### At a glance — five contracts

| | **Station** | **Record** | **Workbench** | **Monitor** | **Canvas** |
|---|---|---|---|---|---|
| Job | execute the next Procedure step | know everything true about one entity | pick a record + edit it | observe | reshape the definition |
| Typical input | scanner (also touch counter) | pointer | pointer | filter | pan / zoom / focus |
| Primary payload | **the prescribed next action** | identity · evidence · history | the collection | stream / rollup | the graph |
| Payload source | **Procedure** (workflow graph) | the entity | the collection query | org-scoped events | `workflow_definitions` |
| Cardinality | one **transient** entity | one **durable** entity | many | many | a graph |
| Selection | ephemeral, **never URL** | the entity **is** the region | **durable URL** | none (filters only) | durable `?focus=` |
| Persistence | act-and-clear | **none in-region** (escape to write) | CRUD | none | draft → publish |
| Density | `floor` | `ops` | `ops` | `rollup` | `studio` |
| What crossfades | the active card | the record body | the focus detail region | drill only | the inspector |
| Metrics allowed | session + queue **only** | record completeness **only** | queue health | **all org rollup** | definition lint |
| Emits | **measured per-step timing** | — | — | — | — |
| Goldens | `/unbox`, `/pack` | `/carton/[id]`, order inspector | `/support`, `/products` | `/operations` | `/studio` |
| Anti-example | `/support` (durable selection) | Unbox `LineEditPanel` (work chrome) | `/receiving/history` (read-only) | `/dashboard` (edits) | `/carton/[id]` (not a graph) |

---

### Station — `resolve step → display instruction → act → measure → clear`

**Primary payload is the prescribed next action**, not a fact stack. This is the single largest change in
this document. Today [station.md](../../.claude/rules/display/station.md) describes the active card as a *fact
stack resolved via SoTs* — what was scanned. The elevated law says the card's first job is **what to do
next**, read from the Procedure; entity facts are secondary and belong to the adjacent **Record** region.

- **Composition** comes from `station_definitions`; **Procedure** comes from the workflow graph. A bench never
  hardcodes its own step sequence.
- **Selection is ephemeral and never URL-addressable.** A `?id=` on a bench means it is not a Station.
- **Timing is measured, not asserted.** Every step emits a real per-step duration; this is a *data* contract,
  not a display rule, and it is what Monitor reads live. `[DERIVED]` The natural carrier is the existing
  station-activity / inventory-event spine plus a step-boundary timestamp; the exact table is unspecified
  here. `[UNVERIFIED]`
- **Labor-minutes judges the display.** Any affordance that adds operator seconds is a **defect** unless it
  removes more seconds than it costs. This bans confirmations, celebratory toasts, decorative KPI, and
  "are you sure" on a bench.
- **Correctness outranks labor-minutes.** When a gate prevents a wrong-item ship or a mis-attributed scan, it
  stays even though it costs seconds. `PackChecklist` scan-to-confirm is correct under this rule.
- **Metrics: session feedback + queue health only.** This-shift throughput and what's left in front of the
  bench. Org rollups, trends, and benchmark comparisons on a bench are a defect.
- **Outcome is Station; state is Record.** The emerald pass / rose fail / amber exception card reports the
  *step just performed* → Station. "3 photos, serial on file, PO linked" is accumulated entity state → Record.
- **Kiosk is a Station recipe**, not an exile: touch input, customer-facing density, attract/idle/reset. Its
  act-and-clear + ephemeral + one-transient-entity shape is Station's row exactly.
- **Mobile is the same Station at a different density.** One law, two densities — never a parallel vocabulary.

**Inherits unchanged from today's `station.md`:** focus-lock loop and the F2 target stack, scan
classification, idempotency (client mints, server honors), station-down degrade-not-block, and the
active-card crossfade. `[DERIVED]` Scan-target registration becomes a **recipe capability**, not a contract
property — so a surface can no longer claim the global hotkey by mis-declaring its archetype.

### Record — `address one entity → read everything true → escape to write`

**New contract.** It closes the gap `contextual-display.md` already admits under *Open questions*
("durable read-record URLs — observe-first with a work escape; not Station Workbench and not classic
Monitor rollup").

- **The entity is the region.** The URL addresses it; there is no in-region selection to change. If there is a
  collection to pick from, it is a Workbench, not a Record.
- **No in-region persistence.** Writes happen by **escaping** to the contract that owns them — exactly **one
  quiet control** (`openInUnboxHref` is the shipped pattern). Never repeated "Open in X" CTAs.
- **Metrics: record completeness only** — photos / serial / fields on *this* entity. Never org rollups.
- **Two homes, one contract:** the standalone page (`/carton/[id]`) and the **right-rail inspector** on a
  Workbench page (`detail:order`, `detail:receiving`). `[DERIVED]` This is why the inspector is non-modal:
  a Record region floats beside the Workbench collection without squeezing it, because the operator's
  context — sibling rows, KPI strip — is exactly what a scrim would hide.
- **Which contracts may float a Record inspector:** Workbench yes (that is the pairing). Monitor **no** — a
  durable single-entity slot is a durable selection, and Monitor has none. Station **no** — its identity
  region is in-flow chrome, not a float. `[DERIVED]`
- **Never lobotomized work chrome.** A Record is not a work panel with the edits stripped out; it is a
  different assembly over the same read model and atoms.
- **Honest absence and honest disposition.** Missing facts render `—`, never `"N/A"`. Exceptions outrank
  `lifecycle.done` — a record never claims "settled" while exceptions hold.

### Workbench — `select → edit → persist`

Unchanged in contract; **two recipes** now named explicitly.

| | **catalog** | **queue** |
|---|---|---|
| the list is | browsed | burned down |
| drains? | no | yes — items leave when resolved |
| ordering | name / relevance | oldest / SLA / priority |
| leading band | search + facets | search + assignee + **remaining, oldest age** |
| empty state | "no products yet" | **inbox zero** |
| goldens | `/products`, `/incoming` | `/support`, `/review` |

- **Support triage and catalog enrichment share the queue recipe.** Same contract; they differ in entity and
  actions, not in behavior.
- **A queue band must never mount `StationScanBar` and never call `useRegisterScanTarget`** — last-mounted
  wins the global F2 stack, so a ticket filter would silently steal the hotkey from the bench an operator is
  standing at. This is a correctness rule, not a style rule.
- Everything else in [display/workbench.md](../../.claude/rules/display/workbench.md) survives: URL-as-state,
  degrade-not-fail, action planes, the four settled states, one sticky layer per scroll port.

### Monitor — `filter → stream → read` (now live, still terminal)

- **Live is allowed.** Push / socket / SSE may back a Monitor. The old "no live socket per row" line was a
  *performance prescription wearing a contract's clothes* and is repealed. Transport choice is unspecified —
  see Open questions.
- **"Per station" is a FILTER, never a selection.** `?station=pack` is throwaway. The moment a Monitor grows
  a durable single-entity slot it is a Workbench + Record page and must be split.
- **Strictly terminal: clicks navigate, never mutate.** A tile links out to the region that owns the write —
  Canvas to change the Procedure, Workbench to reassign. No inline pause / reassign / re-prioritize.
- **Org-scoped only.** The cross-tenant ban survives intact: a tenant's Monitor shows that tenant's facts.
  Benchmarks are *industry reference values*, not other tenants' rows.
- **Metrics: all org rollup + benchmark.** Monitor is the only contract that may show them.

### Canvas — `graph → lens → focus → inspect → publish`

- **Canvas is the authoring altitude for every Station's Procedure.** It is not parked and not exile-able:
  delete Canvas and every bench loses its payload source.
- Draft → publish; published is read-only; Simulate never writes.
- **Metrics: definition lint only** (`Diagnostic` per node, the `gaps` lens).
- Repaint overlays on lens/zoom; **never crossfade the graph.**

---

### Split-component law (regions)

1. **A page has no contract. Its regions do.** N jobs → N regions → N contracts.
2. **A region has exactly one contract and one payload source.** Mixing procedure-derived and entity-derived
   data in one region is the defect job-binding exists to prevent.
3. **Crossfade the singular focus surface only** — never the collection map, the stream, or the graph.
4. **Reference decompositions:**

| Page | Regions |
|---|---|
| `/unbox` | **Station** (instruction + outcome) · **Record** (carton identity / evidence) · **Workbench** (browse table beneath) |
| `/carton/[id]` | **Record** (primary) · one quiet **escape** control to the owning Station |
| `/dashboard` | **Monitor** (KPI strip) · **Workbench** (orders grid) · **Record** (order inspector) |
| `/operations` | **Monitor** only |
| `/studio` | **Canvas** (graph) · **Record** (node inspector) `[DERIVED]` |

5. **The focus shell is contract-neutral.** The anatomy currently called *Station Workbench* (identity bar →
   section tabs → terminal dock) is an **assembly any contract may compose**, not evidence of a contract.
   It is renamed on landing — see Artifact 5.

### Old → new noun map

| Old | New | Note |
|---|---|---|
| four archetypes | **five contracts** | Record added |
| Q1 `inputModel === 'scanner'` | Q1 **act-and-clear + ephemeral + one transient entity** | job, not mechanism |
| Station "active card = fact stack" | Station "active card = **prescribed next action**" | fact display moves to Record |
| *(unnamed)* | **Procedure** | workflow graph, Canvas-authored |
| *(unnamed)* | **Composition** | `station_definitions.config` |
| "Station Workbench" (shell) | contract-neutral focus shell | name asserted a contract it did not own |
| Kiosk = exile | Kiosk = **Station recipe** | touch input, customer density |
| durable read = open question | **Record contract** | gap closed |
| Monitor "no live socket" | **live allowed, still terminal** | performance rule ≠ contract rule |
| Workbench (undifferentiated) | Workbench **catalog** \| **queue** | recipe split, not a contract split |

### Open questions — labeled honestly

1. **Multi-region pages vs contract-named spine sections.** The owner ratified renaming spine sections to
   contract names (Artifact 6, R6). A page with three contracts has no single section. **Tie-break rule
   proposed:** a page files under the contract of its **primary region** — the region that, if deleted,
   deletes the page's reason to exist. **Known defect:** cardinality lands roughly Canvas 1 · Record 2 ·
   Monitor 2 · Station 6 · Workbench 14+, so the Workbench section will need internal sub-grouping, which is
   very likely the old Overview / Library / Stock nouns returning as sub-eyebrows. Unresolved.
2. **Dogfood boundary was never answered** (Gate A Q7). Standing candidate: the receiving family sharing one
   `pageKey: 'receiving'` across six mode keys ([surface-keys.ts:108](../../src/lib/stations/surface-keys.ts:108))
   is USAV's org chart leaking into the surface registry, and should not become house law for a station OS.
3. **Live transport unspecified** — WebSocket vs SSE vs fast poll for the CEO board. Contract permits any;
   cost discipline (Neon CU-hours) is a separate axis.
4. **Does `workflow_nodes.config` already carry enough to render an instruction?** `[UNVERIFIED]` If not, the
   Procedure needs a per-node instruction payload before Station's primary payload can be honored.
5. **Settings / Admin fit no contract cleanly.** They are pick-and-edit, so Workbench by fallthrough, but they
   are configuration of the app rather than of the operation. Left as Workbench; flagged.
6. **Where step timing is stored** — see Station, above. `[UNVERIFIED]`

---

## Artifact 3 — Metrics & updates matrix

**Metric classes** (closed taxonomy — a metric with no row here has no home and may not ship):

| Class | Means | Home | Allowed secondary | Forbidden on |
|---|---|---|---|---|
| **Session feedback** | this scan / this shift; pass·fail·exception; throughput now | **Station** | — | Record, Monitor, Canvas |
| **Queue health** | remaining, oldest age, SLA at risk | **Workbench** (queue recipe) | **Station** (what's in front of this bench) | Record, Canvas |
| **Record completeness** | photos / serial / fields present on *this* entity | **Record** | Station (as the adjacent identity region) | Monitor, Canvas |
| **Org rollup + benchmark** | history, KPI, trend, industry comparison, live per-station throughput | **Monitor** | — | **Station, Record, Workbench** |
| **Definition lint** | per-node `Diagnostic`, coverage gaps, unreachable steps | **Canvas** | — | Station, Record, Monitor |

**Write classes:**

| Write | Home | Notes |
|---|---|---|
| Procedure step outcome (act-and-clear) | **Station** | idempotent, client-minted key, server-honored |
| Record CRUD | **Workbench** | optimistic add/edit; confirm-then-commit deletes |
| Definition draft → publish | **Canvas** | published is read-only |
| **Any write at all** | **never Monitor, never Record** | Monitor links out; Record escapes out |

**The two hard lines this matrix draws:**

- *Metric on a write surface* → allowed only if the operator can act on it **within the next 60 seconds**.
  That is the whole justification for session + queue on a Station and the whole reason org rollup is banned
  there.
- *Write on an observe surface* → never. Monitor navigates; Record escapes. Both keep the click, neither
  keeps the mutation.

**Ban list (agent-enforceable one-liners):**

- No org rollup, trend, or benchmark chrome inside a Station region.
- No confirmation, celebratory toast, or "are you sure" on a Station — unless it prevents a wrong write.
- No `useRegisterScanTarget` / `StationScanBar` outside a Station region.
- No `?id=`-style durable selection inside a Station region.
- No mutation from a Monitor region — link out instead.
- No collection browse inside a Record region.
- No second "Open in X" CTA on a Record — one quiet escape.
- No edit affordance on a Monitor row.
- No page-local photo viewer, timeline, or search engine — compose the SoT.
- No metric class absent from the table above.

---

## Artifact 4 — Gap matrix (codebase debt)

Today's column is from `SURFACE_REGISTRY` unless noted. **This is a debt ledger, not a work order** — no code
change is proposed in this session.

| Surface | Today | Elevated | The lie / gap | Later, one line |
|---|---|---|---|---|
| `/support` | `station` + `scan: null` ([surface-keys.ts:244](../../src/lib/stations/surface-keys.ts:244)) | **Workbench** (queue) | A scanner contract with no scanner; gets a scan column that can steal F2 | re-declare `workbench` + `collection: 'queue'` |
| `/review` | **no registry entry**; renders scan column via nav `kind` | **Workbench** (queue) | Classified by a nav bucket, not a contract | add a registry entry |
| `/incoming` | `workbench` | Workbench (catalog) | Registry is right; the **column** is wrong — nav `kind` overrides it ([sidebar-navigation.ts:362](../../src/lib/sidebar-navigation.ts:362)) | resolve column from registry |
| `/pickup`, `/repair` | `workbench` | Workbench (catalog) | same | same |
| `/receiving/history` | `monitor` | Monitor | same — a read surface wearing a scan bench | same |
| `/unbox`, `/triage` | `station` | **Station + Record + Workbench** (3 regions) | Declared as one contract; is three. Instruction payload not yet Procedure-driven | declare regions; bind card to Procedure |
| `/pack`, `/test`, `/shipping` | `station` | Station (+ Record identity) | Identity band is Station furniture today; is a Record region | split the identity region |
| `/carton/[id]` | *(no registry entry)* | **Record** | The contract it needs did not exist; `contextual-display.md` lists it under Open questions | add registry entry, contract `record` |
| `/o/[orderId]`, `detail:order` | *(no entry)* | **Record** | Same; non-modal float is already the right shape | same |
| `/dashboard` | *(no entry)* | **Monitor + Workbench + Record** | Direction axis (`inbound`/`sales`) is a third vocabulary with no stated mapping to contracts | declare regions; restate axis in contract terms |
| `/operations` | *(no entry)* | Monitor | Correct in spirit; live-per-station not built | add entry; wire live feed |
| `/studio` | *(no entry)* | Canvas + Record | Canvas treated as parked; it is the Procedure author for every bench | add entry; promote in docs |
| `/kiosk`, `/kiosk/v2` | exiled by `kiosk-shell.md` | **Station** (touch recipe) | Exiled solely for lacking a scanner — a mechanism test | fold `kiosk-shell.md` into a Station recipe |
| `/products`, `/ops/photos`, `/search` | *(no entries)* | Workbench (catalog) | Registry covers 10 of ~20 operator surfaces | extend `SURFACE_KEYS` |
| `/m/*` | *(no entries)* | same contracts, mobile density | Implicit today; `station.md` states it in prose only | state as law |
| `/settings`, `/admin` | `kind: 'bottom'` | Workbench (flagged) | No contract fits app-configuration cleanly | see Open question 5 |

**Structural gaps, not per-surface:**

- `ARCHETYPE_IDS` has four members ([archetype.ts:16](../../src/lib/stations/archetype.ts:16)); the elevated law has five.
- `SurfaceDefinition` declares **one** `archetype` for a whole surface; the law is per-**region**. The type needs
  a `regions[]`, or the registry keeps lying about every multi-region page.
- `pickArchetype()` Q1 tests a mechanism ([archetype.ts:51](../../src/lib/stations/archetype.ts:51)).
- Nothing binds a Station's rendered instruction to `workflow_nodes`. The seam exists; the wire does not.
  `[UNVERIFIED]`

---

## Artifact 5 — Agent migration note (docs-only PR shape)

1. **`AGENTS.md`**
   - Product paragraph: "multi-tenant reseller-ops SaaS" → **station OS**, reseller ops named as the first
     vertical, USAV as dogfood only.
   - Hard laws, add three one-liners:
     *"Procedure is Canvas-authored (workflow graph); Composition is `station_definitions`. A bench renders
     Composition filled with Procedure."* ·
     *"A page has no contract — its regions do. One contract, one payload source, per region."* ·
     *"Metrics live where the operator can act on them within 60 seconds; org rollup is Monitor-only."*
   - Read-when-it-touches table: add a **Record** row → new `display/record.md`.
2. **`.claude/rules/kinetic-ledger.md`** — law 2 becomes *"Archetypes are **job-bound** region contracts (I/O +
   persistence), **five** of them."* Law 4 gains: *"Instruction resolves via the Procedure; facts resolve via
   the entity — never mixed in one region."*
3. **`.claude/rules/contextual-display.md`** — replace Step A discriminator with the five-question job-bound
   form; replace the at-a-glance table; add the split-component law and the old→new noun map; move
   `carton-read` and `kiosk-shell` out of *Open questions* (both now have homes).
4. **New `.claude/rules/display/record.md`** — the Record contract, absorbing and generalizing
   `display/carton-read.md` (which becomes the golden recipe inside it).
5. **`.claude/rules/display/station.md`** — rewrite the payload section (prescriptive primary, facts →
   Record), add the measured-timing emission rule, the labor-minutes-judges-the-display rule and its
   correctness-wins exception, and the session+queue metric ceiling. Fold `kiosk-shell.md` in as the
   touch/customer recipe.
6. **`.claude/rules/display/station-workbench.md`** → rename to a contract-neutral focus-shell doc. All
   guard names, allowlists and baselines inside it keep working; only the noun changes. **Do not** reduce a
   baseline while renaming.
7. **`.claude/rules/display/workbench.md`** — name the catalog | queue recipes; add the queue band's
   never-register-a-scan-target rule.
8. **`.claude/rules/display/monitor-and-canvas.md`** — repeal the no-live-socket line; add *filter-not-
   selection*; add *strictly terminal*; keep the cross-tenant ban.
9. **`.claude/rules/source-of-truth.md`** — new rows: **Procedure** · **Composition** · **Region contract
   declaration** (registry) · **Metric class → home contract**.

**Ratchets to name later (do not implement in the docs PR):**
`surface-region-contract.guard.test.ts` (every registry entry declares `regions[]`; a `scan: null` entry may
not declare a Station region) · `station-metrics.guard.test.ts` (no org-rollup import inside station dirs) ·
`monitor-terminal.guard.test.ts` (no mutation hook inside Monitor views) · `record-readonly.guard.test.ts`
(generalize the existing `carton-inspector.guard.test.ts`) · `spine-contract-section.guard.test.ts` (each nav
row's section matches its surface's primary region contract).

**Acceptance test** — *an agent reading only `AGENTS.md` + `contextual-display.md` can classify any new
surface without asking.* Dry run:

| Surface | Walk | Result |
|---|---|---|
| `/support` | Q1 no (durable selection) · Q2 no (collection) · Q3 no (persists) · Q4 no | **Workbench**, queue recipe ✓ |
| `/kiosk` | Q1 yes (act-and-clear, one transient txn, ephemeral) | **Station**, touch recipe ✓ |
| `/carton/[id]` | Q1 no (durable) · Q2 yes | **Record** ✓ |
| `/operations` | Q1 no · Q2 no · Q3 yes | **Monitor** ✓ |
| `/studio` | Q1–Q3 no · Q4 yes | **Canvas** ✓ |
| Unbox instruction card | Q1 yes | **Station** ✓ |
| Unbox identity band | Q1 no (durable carton) · Q2 yes | **Record** ✓ |

Passes.

---

## Artifact 6 — Refused simplifications

| # | Neat idea | Why it fails |
|---|---|---|
| R1 | *Rename Workbench → Desk* to converge with the spine | False convergence. Spine **Desk** = Review + Support; contract **Workbench** also covers Products, Incoming, Pickup, Dashboard. Two Desks meaning different things reads clean and lies. Renaming the **shell** kills the real collision. |
| R2 | *"Do NOT add a fifth archetype"* ([plan:60](station-column-archetype-split-plan.md:60)) | **Scoped, not overruled.** Its argument was "a queue is still pick→edit→persist, so Workbench is correct" — true, and catalog\|queue stays a recipe. **Record is not pick→edit→persist**; it is observe-one-durable-entity, so the ban's reasoning does not reach it. |
| R3 | *Keep `inputModel === 'scanner'` as Q1* | A mechanism cannot discriminate job-bound contracts. It is why `/support` could declare `station` with `scan: null` and why Kiosk was homeless. |
| R4 | *Parallel mobile law* | Two glossaries drift on first contact. Mobile is a density, not a contract. |
| R5 | *Let Monitor do "light command" writes* | Any durable write makes the region a Workbench under Q5. Keeping the click and dropping the mutation preserves both the contract and the convenience. |
| R6 | *Spine stays place-based, contracts stay a separate axis* — **my recommendation, overruled by the owner** | Recorded, not silently applied. Owner reaffirmed contract-named nav sections after being shown the multi-region-page conflict. Written as specified; the conflict and the cardinality skew are logged as Open question 1 with a primary-region tie-break rule. |
| R7 | *All scan feedback is Station* | Re-mixes procedure-derived outcome with entity-derived state in one region — the exact thing job-binding forbids. Outcome → Station, state → Record. |
| R8 | *Split support into its own contract* | Support and catalog enrichment are both pointer-driven, queue-shaped, AI-assisted pick→edit→persist over a draining backlog. They differ in entity and actions, not behavior. One recipe. |
| R9 | *Put the Procedure in `station_definitions.config`* | The Procedure **branches**; `station_definitions` is static layout per `(org, page, mode)` and has no branch. `workflow_edges` already carries conditional routing. Would have birthed a second branching engine. |

---

**Codebase is subordinate to this document. Drift is a bug.**
