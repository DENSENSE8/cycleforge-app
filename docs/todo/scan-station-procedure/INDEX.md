# Scan-station procedure platform — MASTER INDEX

**Date opened:** 2026-08-02 · **Lane:** WS-DOGFOOD (`main`) · **Status:** ⏸ **PAUSED**
**Successor to** [`unbox-guided-procedure-INDEX.md`](../unbox-guided-procedure-INDEX.md),
whose *Out of scope* reads: *"Other stations (Testing, Packing, Shipping) adopting
`ProcedureStack` — after Unbox proves out"* and *"Studio's Procedure lens rendering the new
steps"*. Unbox has proved out. **This is that work — once the redirect below is settled.**

> ## ⏸ This whole platform plan is paused, 2026-08-02
>
> The shipped Unbox procedure UI (the focus deck, the two-row history stack, the pinned
> items step) does not match the operator's actual intent — a redesign is in flight for
> just the **photo-capture steps**, as a **standalone, disposable prototype** the operator
> can redirect freely without dragging seven lanes' worth of guards along for every
> iteration.
>
> **Do not execute any lane in this folder until that prototype is approved.** Building
> A-2's five stations, D-1's waiver store, or G-1's dock declaration against a deck shape
> that is about to be redrawn is wasted work — worse, it is wasted work that then has to be
> *undone* through the guards this plan asks every lane to add.
>
> **Active document:**
> the LANE docs below. Everything below this
> banner is preserved as-is — the shared decisions (S1–S8), the lane docs, the sequencing —
> and resumes verbatim once the prototype settles the deck's real shape. A lane doc is not
> wrong for having been written before the redirect; B-5 in particular already anticipated
> this ("the only phase an operator has already rejected once") and its refusals/falsifiers
> stay live reference even while paused.

---

## 0. Read this first — the one-paragraph frame

Unbox now has a guided procedure: a declared step vocabulary, one derivation feeding two
views (the centre focus deck and the right-edge checklist), completion derived from facts
the carton carries, and every step's action anchored in the bottom dock. **Exactly one
station has it.** `registerBuiltinProcedures()` registers `unboxProcedure` and nothing
else; nine other surfaces in `SURFACE_KEYS` have no procedure at all.

This plan turns a station feature into a **station platform**: any scan bench declares a
procedure, the same primitives render it, the scan itself is bound to the active step, the
backend records the acts honestly, and Studio is where an owner *authors* the procedure
instead of a PR. Every lane leaves the design-system SoT for scan stations stronger than
it found it — that is a shipping requirement, not a nicety (§4).

---

## 1. The documents

| Doc | Owns | Can start |
|---|---|---|
| **this file** | shared decisions, ownership map, sequencing, the SoT ratchet | — |
| [`LANE-A-procedure-model.md`](./LANE-A-procedure-model.md) | the vocabulary: N stations in `procedure.ts`, variants, the skip/waiver gap, the pointer | **immediately** |
| [`LANE-B-deck-motion-scroll.md`](./LANE-B-deck-motion-scroll.md) | deck geometry, scroll + snap, the optical anchor, clearance, reduced motion | **immediately** |
| [`LANE-C-scan-cues.md`](./LANE-C-scan-cues.md) | what a SCAN means at the active step; per-step classification, pass/fail cues, cadence, focus | after A-1 |
| [`LANE-D-backend.md`](./LANE-D-backend.md) | gate columns, the wire normalizer, the waiver store, receipts, realtime, audit | **immediately** |
| [`LANE-E-studio.md`](./LANE-E-studio.md) | procedure as an authored definition: lens, draft→publish, node types, per-org variation | after A-1 + D-2 |
| [`LANE-G-dock.md`](./LANE-G-dock.md) | the bottom dock as a DECLARED region: zones, per-step control binding, per-station composition | after A-1 |

Each lane doc carries its own phases, its file ownership, its Definition of Done, and its
own *Do not re-open* list. **No lane restates a shared decision from this file.**

---

## 2. What is actually true today (verified 2026-08-02)

A plan that misreports its starting state produces agents that "fix" things that are
correct and skip things that are missing. Verified against the tree, not from memory:

| Thing | State |
|---|---|
| `src/lib/stations/procedure.ts` | **one** procedure registered (`unbox`). `ProcedureDefinition` already carries `surface`, `nodeTypes`, phases, variants |
| `resolveProcedureSteps(proc, variant, phase)` | works, station-agnostic, already the shared resolver for Studio + bench |
| `useUnboxProcedureSteps` | Unbox-specific hook; one derivation, two views. **Not** generic |
| `ProcedureDeck` / `ProcedureChecklist` | DS primitives, domain-free, in `@/design-system/components/procedure` |
| `UNBOX_STEP_BODIES` / `UNBOX_STEP_DOCK_CONTROLS` | Unbox-specific registries. The dock split landed 2026-08-02 |
| **Skip / waiver (D10)** | **designed, NOT shipped.** `deriveProcedureSteps` never emits `skipped`; `ProcedureStepRow` has the state, nothing writes it. `useUnboxProcedureSteps` carries the TODO |
| Gate columns | `condition_graded_at`, `contents_confirmed_at`, `label_previewed_at` all shipped **and** in the `/api/receiving-lines` normalizer |
| `photos.photo_aspect` | two writers: INSERT (`create-photo.ts`) + `PATCH /api/photos/[id]/aspect` (2026-08-02) |
| `checklist_templates` + `/api/checklists` | **deleted 2026-08-01 and stays deleted.** Nothing is ticked by hand |
| Studio procedure surfaces | `StationProcedurePanel`, `StudioStationPreview`, `procedureForNodeType` exist; they READ the declaration. Nothing authors it |
| Other scan benches | Testing / Pack / Shipping / Triage / Pickup have step *state* helpers but **no declared procedure** |
| `ProcedureStepRow.at` | **shipped 2026-08-02.** `deriveProcedureSteps` returns a done-gated instant; the receipt consumes the same resolution instead of re-gating. The **deck renders it; `ProcedureChecklist` does not** — deliberately, the trailing slot carries the count and a timestamp wraps in a 360px column |
| `ProcedureStep.summary` | declared, operator-voiced, on **every** step — and rendered **nowhere**. `captureStepVocabulary` drops it. Free instruction copy for B-5 |
| Deck coverage | `procedure-deck-order.guard.test.ts` (structure) + `unbox-procedure-checklist-coupling.guard.test.ts` (the reachability precondition) + `tests/e2e/unbox-procedure-deck.spec.ts` — **the E2E has never been executed**; it parses and lists, nothing more |
| Card **anatomy** | **rejected at the bench 2026-08-02** — *"the hierarchy and the outlines and the row divs themselves are very AI slop"*. Structure is guarded and correct; the composition is not. Owned by **B-5** |

**The single most load-bearing fact:** the model layer is already station-generic and the
UI layer is not. That asymmetry is why Lane A can start today and Lane C cannot.

---

## 3. Ownership map — this is what makes parallel work safe

Topic boundaries do not prevent collisions; **file boundaries do**. A lane may edit only
the paths it owns. Anything in the shared column follows the protocol below.

| Path | Owner |
|---|---|
| `src/lib/stations/procedure.ts` | **A** |
| `src/lib/receiving/procedure-pointer.ts` · `procedure-focus-store.ts` | **A** |
| `src/lib/stations/procedure-*.guard.test.ts` | **A** |
| `src/design-system/components/procedure/**` | **B** (geometry/motion) — *see split* |
| `src/components/station/workbench/StationWorkbench.tsx` + clearance constants | **B** |
| `src/lib/station-scan-routing.ts` · scan classifiers · `scan-hotkey/**` | **C** |
| `src/components/station/scan-bar/**` | **C** |
| `src/app/api/receiving/**` · `src/app/api/photos/**` · migrations | **D** |
| `src/lib/receiving/derive-*` · gate derivation · receipt read model | **D** |
| `src/components/studio/**` · `src/lib/workflow/**` · `SURFACE_REGISTRY` | **E** |
| `src/design-system/components/procedure/types.ts` (the row/state contract) | **F** |
| `.claude/rules/**` | **F** merges; every lane *proposes* (§4) |
| `src/lib/station-terminal/**` · `SlicedActionDock` · `OmnichannelComposerDock` · `station/terminal/**` | **G** |
| `line-edit/UnboxStepDock.tsx` + per-station dock registries | **G** |
| `src/components/receiving/workspace/line-edit/steps/**` | **whoever the phase names** — hot, see below |

### The three shared files, and the protocol for each

1. **`procedure.ts`** — A owns the file. Other lanes needing a field (C needs `scanKinds`,
   D needs `waiver`, E needs `authored`) **request it in their own doc's §Requests-to-A**
   and do not edit the file. A lands all requested fields in **A-1**, before the other
   lanes need them. This is why A-1 is the only hard blocker in the graph.
2. **`.claude/rules/display/station-workbench.md`** — the hottest file in the repo. Every
   lane writes its rule delta into **its own doc's §SoT delta**, as finished prose. F
   merges them in one pass per phase boundary. Two agents editing this file directly is
   the single most likely way this plan produces a conflict.
3. **`steps/**` (Unbox bodies + dock controls)** — A phase may name it; when two do, the
   later one rebases. Never two lanes in the same phase.

**If a lane finds it needs a file it does not own: stop, and write the request into your
doc.** Reaching across is how the last four handoffs in `docs/todo/` ended up describing a
tree that no longer matched.

---

## 4. The SoT ratchet — a lane is not done until it raises the floor

The user's standing instruction: *constantly raise the source of truth for the design
system for scan stations*. Made concrete, so it is checkable rather than aspirational.

**Definition of Done, every phase in every lane — all four, or it is not done:**

1. **Code** that works.
2. **A guard** that fails when the next person undoes it. Prose is a recipe; a test is a
   law (`CLAUDE.md`). A phase that cannot state its guard has not found its invariant yet.
3. **A rule delta** — the finished sentences for `.claude/rules/`, in the lane doc's
   §SoT delta, ready for F to merge. **Never a rule describing code that is not merged**
   (the 2026-08-02 dock-section incident: a ruled, present-tense section for code that did
   not exist, demoted within a day, and only un-demoted by being built).
4. **A generalisation check** — one paragraph answering: *what did this make possible for
   the NEXT station?* If the answer is "nothing", the work was a station patch and belongs
   in `docs/todo/` as a handoff, not in this plan.

**Baselines only shrink.** No lane raises a ratchet baseline to land a phase
([`verify.md`](../../../.claude/rules/verify.md)).

---

## 5. Shared decisions — every lane inherits these

Numbered `S*` so lanes cite rather than restate. These are settled; changing one is an
INDEX edit plus a note to every lane.

### S1 — One declaration, N stations. Never a second vocabulary.

`procedure.ts` is the only ordered step list in the product. A station gets a procedure by
**registering one**, not by authoring a parallel array. `derive-*-step-states` modules keep
their half of the split — they own **gates** (what counts as done), never sequence.
`procedure-divergence.guard.test.ts` generalises to every registered procedure in A-2.

### S2 — Completion is DERIVED. Nothing is ticked by hand.

The org-editable `checklist_templates` list was deleted because a box got ticked when
someone remembered to tick it. A step is done when its **fact** exists: a photo of that
aspect, a serial, a grade, a classification, an acknowledgement stamp. This survives every
lane, including Studio: an owner may author *which steps exist*, never *that a step is
done*.

**Corollary that keeps biting:** a step with no fact needs a **real column**, not a tick
row. Three exist (`condition_graded_at`, `contents_confirmed_at`, `label_previewed_at`) and
all three shipped broken once — written by the route, selected by the builder, read by the
gate, and dropped by the API normalizer, so the pointer parked forever with nothing
throwing. `receiving-lines-procedure-gates.guard.test.ts` exists because of that. **Any new
gate column is a Lane D phase, and the normalizer is part of it.**

### S3 — A skip is a WAIVER, not a tick, and it never opens a server gate

Designed in the predecessor's D10, **not shipped**. A skip records that a person decided to
move past — never that the work happened. It composes the one waiver shape this codebase
has (`serial_absent` + a Class-D `reason_codes` code). `skipped` is a fourth state, drawn
distinctly from `done`, forever. `require_one`, `transition()` and receive validation stay
unaware of skips: if the org requires an arrival photo, skipping leaves receive blocked —
**and the surface says so at the point of skipping**, never at the end of the carton.

### S4 — The card READS; the dock ACTS

Ruled 2026-08-02, shipped for Unbox. A step card carries no action button; the active
step's control lives in the dock's leading zone. Two reasons: the hand is already in that
band, and **a card scrolls while the dock does not** — a control at a scroll-dependent
position is a control you have to look for. Guard: `procedure-step-dock.guard.test.ts`.

**The dock is therefore a first-class display region, not a backdrop** — it is where every
step's action lives, so it varies per station *and* per step and must be declared rather
than assembled in a panel file. That is **Lane G**, which owns its four zones (notice ·
leading step-action · pager · composer+terminal), the per-step control binding, and the
`clearance` the host must reserve for it. B owns the deck the dock makes room for; the two
meet at exactly one number.

**Two zones are never step-scoped, and the split is the whole safety property:** the
**composer's write target** (a grain decision — `receiving_line.notes`, never the printed
`label_note`) and the **trailing terminal** (the commit — "Receive" means the same thing on
every step). The leading zone is step-contextual precisely so those two do not have to be.

### S5 — Nothing on a scan surface takes focus

The wedge owns focus. Every pointer control hands it back (`receiving-focus-scan`, 60ms
defer). A control that eats the wedge is the most expensive bug on these surfaces because
the failure is **silent** — scans go into a button instead of the bar and nothing errors.
Lane C owns making this a guard rather than a convention.

### S6 — Motion at scan cadence is latency

Step advance fires 9–24 times per carton. Opacity + transform only; `motionRole.swap.scan`
(the `duration: 0` exit) for step swaps, never `swap.focus`. **Never animate layout** on
these surfaces — the sanctioned exception is a deliberate operator-requested push toggle,
which a step advance is not. The trailing terminal never animates at all: it is the one
thing that must not move while a hand is going for it.

### S7 — Two views, one derivation

The hazard was never two views; it was two **derivations**. Any surface showing procedure
state reads the station's one hook. A mirror that computes its own answer drifts, and at a
bench a display that lags the scan is worse than none — the operator trusts it and
re-shoots.

### S8 — Per-step duration stays refused

There is no `step_started_at`; the gap between completions is not time-on-step. And a timed
operator has a direct incentive to **waive** steps (S3), so the timer would corrupt the
record the procedure exists to produce. Carton-open → received is honest and renders once,
on the receipt. Do not re-open without a new column and a labour-practice decision.

---

## 6. Sequencing

```
                    ┌─────────────────────────────────────────┐
   A-1 procedure.ts field surface (scanKinds · waiver · authored)
   ── THE ONLY HARD BLOCKER. Land it first, land it complete. ──
                    └───────────────┬─────────────────────────┘
                                    │
        ┌───────────┬──────────┬─────┼─────┬──────────┬──────────┐
        ▼           ▼          ▼     ▼     ▼          ▼          ▼
   A-2 N stns   B-1 deck   C-1 scan→step  D-1 waiver  F-1 types  G-1 declare
   A-3 pointer  B-2 scroll C-2 cues       D-2 receipt F-2 guards G-2 renderer
                B-3 anchor C-3 cadence    D-3 realtime F-3 rules G-3 per-step
                B-4 chklst C-4 products   D-4 absence             G-4 notice
                B-5 anatomy ◄── the only phase an operator has already rejected once
        │           │          │           │          │          │
        │           └──── clearance ───────┼──────────┼──────────┘
        └───────────────────┬──────────────┘          │
                            ▼                         │
                     E-1 Studio lens  ◄──── D-2 ──────┘
                     E-2 authoring (draft→publish)
                     E-3 per-org variation  ◄──── G-1 (dock authoring)
                            │
                            ▼
                     SECOND STATION (Testing) — the proof
```

**B and G meet at exactly one number** — the dock's scroll clearance. B owns the values, G
stores only the variant name. That is the whole interface between them; if a second
coupling appears, one of the two lanes has reached across.

**A-1 is the only hard blocker**, and it is deliberately small: it adds *fields*, not
behaviour. B, D and F can then run fully parallel; C needs A-1's `scanKinds`; E needs A-1
plus D-2's receipt shape.

**The second station is the acceptance test for the whole plan.** Testing adopting the
platform with **no new primitive and no new rule** is what proves this was a platform and
not six coordinated patches. If Testing needs a new DS component, a lane got it wrong —
find out which before adding the component.

---

## 6b. Staffing — how many agents, at what effort

**Not one agent per lane, and never seven at once.** Seven concurrent agents on this tree
produce merge conflicts faster than progress: the concurrency cap is ~10, but the *useful*
cap here is set by how many can touch `procedure.ts`, `station-workbench.md` and `steps/**`
without colliding. The ownership map (§3) makes 4–5 safe. Beyond that the marginal agent
spends its time rebasing.

### The waves

| Wave | Agents | Lanes | Why this grouping |
|---|---|---|---|
| **0** | **1** | A-1 | The only hard blocker. One agent, alone, on a field surface every other lane types against. Two agents here is two people editing one interface |
| **1** | **4** | B · D · F · G | Fully disjoint file ownership. B↔G share one number (clearance) and nothing else |
| **2** | **2** | A-2/A-3 · C | C needs A-1's `scanKinds`; A returns for the second procedure. Run C beside A, not inside it |
| **3** | **2** | E · F (standing) | E needs A-1 + D-2 + G-1. F has been running the whole time |
| **4** | **1** | Testing adoption | The acceptance test. **One agent, deliberately** — if it needs help, the platform failed |

Peak concurrency **4**. Total distinct agents across the plan: **6–8**, most of them
sequential re-entries rather than simultaneous.

### Effort per phase

Effort tracks *how much is undecided*, not how much code moves. A transcription phase at
`xhigh` burns budget re-deriving settled decisions; a ruling phase at `medium` ships a guess.

| Phase | Effort | Why |
|---|---|---|
| **A-1** field surface | **xhigh** | Every downstream type. Cheapest possible thing to get wrong, most expensive to change later |
| A-2 register N procedures | **medium** | Transcription — read the benches out of code that already performs them. Not a design act |
| A-3 pointer + skips | **high** | Pure function, but it is the one answer two readers share |
| **B-1** host contract | **high** | Geometry with a known trap (the basis-less `flex-1`) |
| **B-2** travel | **high** | Needs a bench measurement before a decision, and the measurement is the deliverable |
| B-3 optical anchor | **low** | Deferred. Effort here is *writing down the falsifier*, not building |
| B-4 checklist geometry | **medium** | One question, answered the same way B-1 answered its own |
| **B-5** card anatomy | **xhigh** | The only phase an operator has already rejected in words. Taste + three guards that must stay green |
| **C-1** scan→step | **xhigh** | Safety-critical. A step that force-interprets a payload silently mis-records |
| **C-2** cues | **high** | Design + a genuinely missing modality (audio/haptic) |
| C-3 cadence/focus | **high** | Three silent failure modes; the guards are the hard part |
| C-4 products | **medium** | Deliberately bounded — the interesting half is deferred to E-3 |
| **D-1** waiver store | **xhigh** | Migration + a safety invariant (a skip must never open a gate) |
| D-2 receipt | **high** | Generalising a shipped read model; the instant contract is already ruled |
| D-3 realtime | **medium** | Publish-side sweep over an established pattern |
| D-4 honest absence | **medium** | An audit. Broad, shallow, mechanical |
| **E-1** lens | **high** | Read-only, but it is where A's declarations get checked against reality |
| **E-2** authoring | **max** | The most open-ended work in the plan: draft→publish, diagnostics, and a line that must not be crossed |
| E-3 per-org variation | **xhigh** | Carries C-4's deferred decision (a vocabulary knowable only after the scan) |
| **F-1/F-2** types + guards | **high** | The ratchet itself |
| F-3 rule merges | **medium** | Merging finished prose. High *care*, low *search* |
| F-4 standing sweep | **low** | A checklist, run often |
| **G-1** declare the dock | **high** | Small surface, but zones↔clearance must be impossible to change apart |
| G-2 dock renderer | **high** | An extraction whose acceptance test is "no visual change" |
| G-3 per-step/per-station | **high** | Two different edits that must not be conflated |
| G-4 notice zone | **medium** | Small, and mostly D's payload |

### Three staffing rules that matter more than the table

1. **Never two agents in one lane.** Lanes are file-ownership boundaries; splitting one
   re-creates the collision the map exists to prevent. If a lane is too big for one agent,
   split it into *phases run sequentially*, not agents run in parallel.
2. **F runs continuously, at low effort, between phases.** Its job is the sweep and the
   merge — batching it to the end is how five lanes' rule deltas arrive as one unreviewable
   diff.
3. **Give every agent the INDEX plus its own lane doc, and nothing else.** The shared
   decisions are in §5 precisely so a lane agent does not need to read six sibling plans to
   avoid contradicting them. An agent handed all seven will re-litigate settled rulings.

---

## 7. Out of scope — named, so nobody "finds" them as gaps

- **Mobile procedure parity.** The phone is a second terminal on one station; a separate
  plan. This one must not make it harder — Lane C's scan binding is shared.
- **Non-scan Workbench branches** (`ops-queue`, `service-workspace`). A procedure is a
  Station-contract concept: scanner-driven, act-and-clear. Do not port it to a desk queue.
- **Retiring `derive-*-step-states`.** They own gates and that split is correct (S1).
- **The 3-dot `LinearWorkflowStepper`.** Different altitude (carton completeness in a rail
  row), different job. Leave it.
- **Reopening D12's refusals** (depth pile, scroll-linked animation, per-step timing).
  Lane B carries the one falsifying observation that would re-open the first.

---

## 8. Work-log + lane hygiene

- Read the last ~10 work-log entries before starting (`pnpm worklog:tail`); append one when
  a phase lands (`pnpm worklog "<action>" --result <r>`).
- The dev server is the user's, on **`:3050`** — attach, never start. A broken dev server
  is a thing you **report**, not repair.
- E2E asserts against the **QA org** (`--project=qa-desktop`), never the dogfood tenant.
  Do not `waitForLoadState('networkidle')` on `/unbox` — the realtime channel never settles.
- `npm run verify` before a phase is done. When the tree holds another session's work, run
  the failing gate on **your** files and report which failures are pre-existing rather than
  inheriting or silently fixing them.
