# Research briefing — inverting the Unbox input locus: the bottom dock becomes the scan waist, the top becomes a display

**For:** Gemini Pro (deep research) — **you have read access to this repository.** Paths below are pointers, not excerpts; read the real files.
**From:** Cycle Forge engineering
**Date:** 2026-07-31
**Repo state:** `main` @ `1c226847d`
**Scope:** the `/unbox` operator bench — *where operator input is entered* and *where its effect is displayed*. Specifically: moving condition-grade, serial capture, and the no-serial waiver **out of the PO-line accordion** (mid-canvas, mouse-reached) and **into a step-driven bottom dock** (scan-reached), with the accordion demoted to a read-only display of what the dock just changed. Not the browse grid, not photo evidence, not outbound.

---

## The report that started this

The operator's account, verbatim in substance:

> "The unbox flow is governed by the ability to move your mouse up to the top of the display, then edit — like selectively product condition, and select the serial-number entry display, then scan the serial number — when it really should be scanning everything in at the bottom and then displaying up top what is changing."

That is a **mouse-travel and focus-ownership complaint**, not a styling complaint. On a bench where the operator's hands hold product and a wedge scanner, the current flow requires: locate the active PO line → click to expand → click the condition pill → click the serial field → scan. Four pointer acquisitions before the barcode goes in.

The proposal is an **input-locus inversion**:

| | Today | Proposed |
|---|---|---|
| **Top-left scan bar** (sidebar) | resolves ticket / PO / tracking **and** doubles as a rail filter; a sibling hook also scans serials into an "armed" line | **ingestion only** — start a new carton / add another carton. Nothing else. |
| **Middle display** (workbench body) | the *editor*: accordion rows with condition pills, serial input, no-serial waiver, per-unit rows | the *display*: one thing at a time, showing what the current step just changed; still mouse-editable as an escape |
| **Bottom dock** (floating composer) | notes textarea + Print/Receive split CTA | **the source of truth for input** — a step machine: condition → serial → … each advanced by scan or click, Enter = continue/skip |
| **Right details panel** | `ReceivingDetailsStack` tabs (progress / items / journeys) | simplified: smaller type, a checklist, click a prior step to go back and edit it there |

**Bias of this brief:** prefer **deleting an input path** over adding one. Unbox already has *two* live serial-entry paths and *two* condition-write paths (§3.3). A third that does not delete a predecessor is a fork, and this repo's constitution forbids that (`AGENTS.md` → "Compose from the named SoT first; grow it when it is wrong. Never fork a page-local twin for the same job"). If your answer adds a surface, say what it **replaces**.

---

## Deliverable — five separate answers

1. **The interaction-model answer.** Is "one prompt at a time, input anchored at a fixed location, Enter advances" the industry-standard grammar for a scanner-driven receiving bench in 2026 — and if so, what is it *called*, and what are its documented invariants? Answer against named systems (SAP EWM RF framework, Manhattan Active WM, Blue Yonder, Oracle WMS Cloud RF, Zebra/Honeywell device UX guidance, voice-directed picking), and against interaction-design standards (GOV.UK "one thing per page", NN/g wizard guidance, ISO 9241-110 dialogue principles). Cite primary documentation. Distinguish **documented spec** from **observed shop-floor practice**.

2. **The locus answer.** Where does a scan-driven bench put its input field — top, bottom, or "wherever the current step is"? The proposal says *bottom, always*. Is bottom-anchored input a mobile-ergonomics finding being over-applied to a desktop bench with a wedge scanner (where the input has no physical location at all, because the wedge types into whatever holds focus)? Address the desktop and the tablet/phone cases **separately** — §6 shows they are not the same product today.

3. **The step-vocabulary answer.** §4.1 is the sharpest conflict in this brief: this codebase **deliberately removed `condition` as a workflow step** on the stated ground that `condition_grade` is NOT NULL with a default, so it is an exception-override, not a decision gate. The proposal makes condition **step 1 of every carton**. Adjudicate. In used-goods reseller receiving specifically, is per-unit grading a mandatory gate or a default-with-exception? What does the industry do when a step is "almost always the same answer"?

4. **The codebase answer.** Reconcile 1–3 against §2–§5. Give a **deletion-ordered** path: what to remove or merge first, what to make required, what to add only if nothing else works, each with the `file:line` it touches and the operator-seconds it buys. Verify against the code — §0.1.

5. **The combining answer.** §5 — the operator wants to attach *additional* POs to a carton already in flight, and to combine tickets already assigned to those POs. Is many-PO-to-one-carton (consolidated inbound receipt) a standard WMS shape, and is the *unboxing bench* the standard place to perform that association, or is it a dock/ASN-time concern that has leaked downstream?

---

## 0. Method — read this before answering

### 0.1 Verify in the repo before you assert. Not optional.

A prior brief in this series produced phases targeting files that do not exist.

- **Every file path you name must be one you opened.** Infer nothing from naming convention. Mark inference `[UNVERIFIED]`.
- **Quote the evidence** for load-bearing claims: line number, function signature, prop name.
- Every `file:line` in §2–§6 was read on 2026-07-31 against `main` @ `1c226847d`. **Re-verify them.** If a line has moved or a claim is wrong, say so — that is a useful finding, not a nuisance.
- **Do not attribute reasoning to this brief that is not written in it.** If it is yours, say "my reasoning:".

### 0.2 Search the web for parts 1, 2, 3, and 5. Also not optional.

- Part 1 is a **human-factors and systems** question. Answer from vendor RF/mobile documentation and published HCI standards, not memory. Where a vendor's term differs from the standard's, give both.
- Part 2 has a real empirical literature (thumb-zone / reach studies, Fitts's law, target acquisition). Say which findings transfer to a **standing bench with a wedge scanner and a mouse** and which do not. A finding about one-handed phone reach is not automatically a finding about a warehouse desk.
- Part 5 is partly **unwritten operational practice**. Distinguish "what the manual says" from "what a dock actually does", and label which is which.
- **Scale discipline.** This is small multi-tenant reseller SaaS: one warehouse, a handful of operators, thousands of serialized units. Not a 3PL. A model that assumes a dedicated receiving clerk per dock door, a WES, or a per-station RF gun fleet is not available to us — say so explicitly if your recommendation implies one.

### 0.3 Established facts — do not re-litigate

| Claim | Status |
|---|---|
| "Just make the accordion prettier / denser" | **Out of scope.** The complaint is locus, not density. A denser accordion still costs four pointer acquisitions. |
| "Add a second focus-locked scan input" | **Constrained, not free.** `.claude/rules/display/station.md` §3 makes focus-lock the load-bearing station behavior, and `src/lib/scan-hotkey/store.ts:95-99` gives the global focus hotkey (default **F2**) to the *most-recently-registered* target (`registerScanTarget`, consumed via `useRegisterScanTarget`). Two live scan inputs on one bench is a focus-ownership design problem you must solve, not a detail. |
| "Selection should be URL-addressable" | **No.** Station selection is ephemeral by contract (`display/station.md` §5). The carton overlay is keyed on carton identity, not a `?id=`. |
| "Use a modal wizard" | **No.** Modal blocks the next scan. `display/station.md` §11 bans hard-dismiss modals that gate the scan loop. |
| "Animate the accordion rows into the dock" | **No.** House motion law is opacity + transform only, never layout (`display/motion-crossfade.md`). A collapse via `grid-template-rows` / the `collapseHeight` preset is the only sanctioned height animation. |
| "Ship it behind a second visual language" | **No.** Kinetic Ledger tokens only (`.claude/rules/kinetic-ledger.md`). |

---

## 1. Product context

**Cycle Forge** is multi-tenant reseller-operations SaaS for used-goods resellers; USAV is the dogfood tenant. Inventory is **serialized** — individual physical units with serials, condition grades, test verdicts, evidence. Inbound arrives as cartons against vendor POs (mirrored from an inventory provider), as marketplace returns, and as local pickups.

`/unbox` is a **Station** region by house contract (`.claude/rules/display/station.md`): scanner-driven, act-and-clear, one active entity at a time. Its right pane is additionally the **golden Station Workbench** — the reference implementation every sibling station (Triage, Testing, Shipping, Pack, Pickup, Labels, Support, Review, Repair) is ratcheted against by CI guards (`src/components/station/workbench/station-workbench-chrome.guard.test.ts`, config in `station-workbench-chrome-config.ts`).

**That is the single biggest constraint on your answer.** Unbox is not a page that can be redesigned locally. Its chrome *is* the SoT nine other stations compose. A change to the dock's role, the workbench slot contract, or the identity band propagates to all of them or it forks the family. Say which of your recommendations are Unbox-local and which are family-wide.

Two house laws are non-negotiable:

- **One module per concern** — read from the named SoT; never inline, copy, or re-derive its mapping.
- **Compose → grow the SoT → compound** (`.claude/rules/pattern-evolution.md`). A genuinely different job may add a **sibling that composes the same primitive**; duplicating a primitive for the **same** job is the banned fork.

---

## 2. The four zones as they exist today — read these first

Route: `src/app/unbox/page.tsx` → `SurfaceGate` → `ReceivingSurfacePage` (`src/components/receiving/ReceivingSurfacePage.tsx:85-90`), which mounts `RouteShell` with `actions={<ReceivingSidebarPanel />}` (left rail) and `history={<ReceivingDashboard />}` (work canvas).

### 2.1 Zone A — top-left scan bar (the sidebar band)

`ReceivingSidebarPanel.tsx:97-104, 174-178` composes three hooks: `usePoContext` (active carton + `armedLineId`), `useSerialScan`, `useTrackingScan`. The visible band is `UnboxScanBand` (`ReceivingScanBands.tsx:76-101`) → `ReceivingUnboxScanBar`.

- Three arm-able modes — Ticket # / Tracking # / PO # (`ReceivingUnboxScanBar.tsx:24-47`).
- **Un-armed submits `'auto'`** and the server deep-scans all three before creating a carton (`:93-98`). The leading icon is a *hint only* (`:53-61`).
- `useTrackingScan.ts` is **660 lines** of resolution orchestration — the real ingestion waist.

**The proposal keeps this zone and narrows it.** That is the least contentious part. But see §4.4: it is not currently ingestion-only.

### 2.2 Zone B — the middle display (workbench body)

`ReceivingDashboard` → `UnboxLineWorkspace` (`src/components/receiving/unbox/UnboxLineWorkspace.tsx`) holds a browse underlay (`UnboxWorkspaceView`, the Queue/Viewed/History grid) with the focused carton overlay crossfading on top, keyed on **carton** identity (`:102-119`, `:146-196`). Line→line inside one carton is deliberately an in-place update, not a remount (`ReceivingLineWorkspace.tsx:67-74`).

The overlay is `LineEditPanel` (`src/components/receiving/workspace/LineEditPanel.tsx`), the golden Station Workbench:

```
StationPanelRoot                                  (:509)
├── StationContextBar  ← absolute-float identity  (:468-495)
└── StationWorkbench                              (:512-610)
    ├── tabs      → UnboxSectionTabs              (:518-529)
    ├── (scroll body: the active tab's panel)
    ├── feedback  → WorkspaceActionFeedbackSlot   (:530-537)
    ├── footer    → ReceiveFeedbackRegion         (:538-565)
    └── dock      → see 2.3                       (:566-609)
```

Tab vocabulary: `overview · classify · po-note · checklist · units · tracking · listings · timeline · support` (`terminal/unbox-terminal.tsx:23-33`).

### 2.3 Zone C — the bottom dock

Two shapes, branched at `LineEditPanel.tsx:572-609`:

- **`overview` tab** → a single elevated shell floating over the canvas: `slicedActionDockWrapperClass({ docked: false })` wrapping `WorkspaceNotesCard` (auto-saving carton notes) with the Print/Receive split CTA mounted **inside its footer** as `<StationTerminalDock embedded>`.
- **every other tab** → a full-width in-flow `StationTerminalDock` band.

The composer is `StationComposerDock` (`src/design-system/primitives/StationComposerDock.tsx`) — ChatGPT-style: auto-grow textarea + utility footer. **Enter commits** (`:46-55`, `handleStationComposerKeyDown`); Shift+Enter inserts a newline. On Unbox overview, `LineNotesCard.tsx:133-140` maps that commit to *save note, then fire the Receive primary*, and the tooltip says so verbatim: `'Receive (Enter) · Shift+Enter for newline'` (`:343`).

**This is the zone the proposal promotes to source of truth.** Today it owns notes + the terminal commit. It owns no per-unit data capture at all.

### 2.4 Zone D — the right details panel

Two different things occupy the right edge, and the brief must not conflate them:

- **Station-scoped push columns** — `ReceivingTicketStack` / `ReceivingClaimStack` (`LineEditPanel.tsx:631-650`). These *squeeze* the workbench in-flow; they are mutually exclusive with each other.
- **`ReceivingDetailsStack`** (`src/components/station/ReceivingDetailsStack.tsx`) — the non-modal `detail:receiving` float, tabs `progress | items | journeys` (`:34`). Its `progress` tab renders `ReceivingCartonPipeline`, whose steps are **`scanned → unboxed → received`** (`src/components/station/receiving/ReceivingCartonPipeline.tsx:9-13`) — i.e. *carton lifecycle*, not *operator task*.

**Note the vocabulary mismatch you must resolve in part 3.** The right panel's pipeline is carton-lifecycle (`scanned/unboxed/received`). The proposal wants the right panel to be a **task checklist** mirroring the bottom dock's steps (condition → serial → …). Those are two different step vocabularies with two different owners. Which one belongs on the right?

---

## 3. The input-locus problem — where capture actually lives

### 3.1 The chain, exactly

`LinePoItemsSection.tsx:216-217` injects `ActiveLineConditionSerial` into the accordion's `activeRowSlot`. `PoLineRow.tsx:373-418` renders that slot as the active row's **second row**, inside a `collapseHeight` body, gated on `!readOnly && isActive && !activeCollapsed`.

`ActiveLineConditionSerial.tsx:94` then branches on quantity:

- **multi-qty (`quantityExpected > 1`)** → `ReceivingUnitRows` — one selectable row per physical unit, each with its own grade + serial, plus an icon-only `NoSerialControl variant="check"` (`:112-171`).
- **single-qty** → `SerialCard` — integrated `ConditionPills` + serial input + a `NoSerialControl` under the field (`:173-242`).

`SerialCard.tsx:234-241` autofocuses its input, keyed on `focusKey={lineId}`.

**So the capture surface is mid-canvas, inside a collapsible row, inside a scrolling tab body, and its position moves as rows reorder.** `PoLineRow.tsx:52-57` even ships a softened layout spring for exactly that sibling-reorder motion. That is the physical fact behind the operator's complaint: the target is not at a stable screen location, so it must be reacquired by eye and pointer every time.

**Question for you (part 2):** is "the input field is wherever the active record is" a defensible pattern that this UI merely executes badly, or is a **fixed input locus** a hard invariant of scan-driven work? If the latter, name the standard that says so.

### 3.2 The two writes the dock would have to absorb

- **Condition** — `LinePoItemsSection.tsx:231-234`: `onConditionChange` → `c.setCond(next)` **and** `c.patch({ condition_grade: next })`. Optimistic local + PATCH.
- **Serial** — `:229`: `onSubmitSerial` → `c.enqueueSerial(sn, grade)` (queued write, `useLineSerials.ts`).
- **No-serial waiver** — `:241`: `onSerialAbsentChange` → `c.commitSerialAbsent(...)`, plus a bulk stamp of empty unit rows on the multi-qty path (`ActiveLineConditionSerial.tsx:158-165`).

All three are already delegated up to the controller. **The write waist does not need to move — only the surface that calls it.** That is the strongest argument that this refactor is presentational rather than architectural, and you should test it: is there anything in the *data* model that forces capture to sit next to the row it writes to?

### 3.3 There are already two serial paths and two condition sources — this is the fork risk

| Path | Entry | Target selection | Write |
|---|---|---|---|
| **Sidebar serial scan** | `useSerialScan.ts:58-80` | `armedLineId` from `usePoContext` | `POST /api/receiving/scan-serial` |
| **Accordion serial input** | `SerialCard` / `ReceivingUnitRows` | the *active* row | `c.enqueueSerial` → `useLineSerials` |

And condition has a **default that is not a decision**: `useUnboxLineController.ts:80-81` seeds `cond` to `USED_A` (or `USED_A` unconditionally when `receiving_source === 'unmatched'`), re-seeded on row change at `:131-133`.

**Adding a third capture surface without deleting one of these is the fork this repo's constitution forbids.** Part 4 must be deletion-ordered. Our own instinct is that the sidebar serial path (`useSerialScan` + `armedLineId`) is the one the bottom dock should *replace* — but we hold that loosely, because `armedLineId` is the only mechanism today that lets a scan reach a line the operator has not clicked. **Push on this.**

---

## 4. The collisions the proposal creates — adjudicate each

These are not objections. They are places where the proposal and the current code state opposite things, and one of them has to give.

### 4.1 Condition-as-step-1 vs condition-was-deliberately-removed-as-a-step

`src/components/receiving/workspace/derive-receiving-step-states.ts:1-12` defines the whole step vocabulary as **`photos · serial · print`**. Lines `47-55` state why `condition` is absent, verbatim:

> `condition_grade` is NOT NULL with a default, so the pill always shows a grade (the auto-A UX). It's an assumed default disposition operators only override for exceptions, not a per-line decision gate. … (This removed the frontend↔backend mismatch where the pill read "A selected" but the dot read "not set".)

The same file also removed `scan` on the ground that *reaching the workspace is the scan*.

The proposal reintroduces condition as the **first** step, entered by scan or click, before anything else.

**Adjudicate, and be specific about the cost.** If grading is genuinely default-A-with-exception, making it a mandatory step adds one confirmation per carton × every carton — the opposite of the stated goal. If grading is genuinely a per-unit judgement that the auto-A default has been quietly hiding, then the current stepper is under-reporting real work and the removal was wrong. Used-goods reseller receiving is the domain that decides this; answer for that domain, not for new-goods distribution. If the answer is "it depends on the intake type" (vendor PO vs marketplace return vs local pickup), say what it depends on — this repo already models those separately.

Also note: `ReceivingProgressStepper.tsx:12-16` says the shared stepper is **"Not mounted in the Unbox/Triage workspace chrome."** The Unbox bench has **no visible step indicator today**; `activeStep` is computed (`LineEditPanel.tsx:154-165`) and used only to nudge focus. So the proposal is not "change the stepper" — it is "introduce one, and make it drive input."

### 4.2 Enter is already bound to the terminal commit

Proposal: **Enter = skip to next step / continue.**
Today: **Enter = save note + print & receive** (`LineNotesCard.tsx:133-140`; tooltip at `:343`; the primitive's contract at `StationComposerDock.tsx:46-55`).

These cannot both be true in the same focused control. Options we can see, none obviously right:

- Enter advances; the terminal commit moves to a distinct key or an explicit button press only.
- Enter advances **until the last step**, where it commits — a "wizard Enter" that changes meaning at the end. (Is a key whose meaning depends on position defensible under ISO 9241-110 *self-descriptiveness* / *conformity with user expectations*?)
- The step machine is not a text input at all, so Enter never reaches the composer — but then where does the operator type a note?

**RF-terminal precedent is the thing we most want here.** On a classic RF screen, Enter submits the current field and advances; the *transaction* completes when the last field is submitted. Is that the model, and does it survive being hosted inside a chat-style composer that also owns free text? Or is hosting a step machine inside a text composer the actual mistake?

### 4.3 Two focus-locked scan inputs on one bench

`.claude/rules/display/station.md` §3 makes focus-lock the load-bearing behavior: one bar, auto-focused, re-focused after every submit, with a global hotkey target registered via `useRegisterScanTarget` — and the store is explicit that **"the most-recently-registered target is the one the hotkey focuses"** (`src/lib/scan-hotkey/store.ts:95-99`).

The proposal creates two: the top-left ingestion bar and the bottom step input. A wedge scanner types into whatever has focus. If the operator's last interaction was the top bar and they then scan a serial, the serial goes into the ingestion resolver.

**We need a rule, not a mitigation.** Candidates to evaluate: (a) focus follows the machine — no carton open → top bar owns focus; carton open → dock owns it, top bar becomes click-to-focus only; (b) one input, whose *meaning* is contextual (the scan classifier already exists: `src/lib/station-scan-routing.ts`, `detectStationScanType`); (c) two inputs with distinct hotkeys. What do multi-transaction RF benches actually do? Note that option (b) — one input, context decides — is arguably what the current `'auto'` mode (§2.1) already is, which would make the proposal's split a *regression* rather than a simplification. Test that reading.

### 4.4 "Scan bar for new orders only" is a narrowing, and something has to catch what falls out

Today the top bar also (i) filters the recent rail as you type, (ii) resolves a scan onto an *already-open* carton, and (iii) shares a hook file with the serial path. Narrowing it to ingestion removes paths operators may be using. Enumerate what is lost and where each lost capability lands. Specifically: **when the operator scans a tracking number for a carton that is already open on screen, what should happen?** Today `UnboxLookupReceipt` (`UnboxLineWorkspace.tsx:161-175`) covers the editor with a read-only "already unboxed" receipt.

### 4.5 The multi-qty branch does not linearize cleanly

A linear step machine (condition → serial → next) is a natural fit for a **single-qty** line. `ActiveLineConditionSerial.tsx:112-171` shows the multi-qty case is a *loop* over N physical units, each with its own grade and serial, plus a line-level waiver that bulk-stamps empty units.

A bottom dock showing "one thing at a time" has to express: which unit am I on, how many remain, and how do I jump back to unit 3 of 8. **This is the part of the proposal we believe is least worked out.** Is the industry answer a per-unit loop with an explicit counter ("Unit 3 of 8"), a handling-unit/LPN abstraction that makes the loop implicit, or "receive by exception" (default all, capture only the deviations)?

### 4.6 Read-only top + still-editable top is a bidirectional binding

The proposal says the middle display becomes a read-only reflection of the dock, **and** that the operator can still edit it by mouse. That is two writers to one state again — precisely the condition that produced §3.3.

If the top stays editable, what is it? Our reading: it is the **record plane** and the dock is the **in-cell/step plane**, which this repo already has a law for — `.claude/rules/display/workbench.md` → *Action planes*: "the record plane stays a complete superset wherever the [other] plane is conditionally unavailable." Evaluate whether that law resolves it cleanly or whether a station bench needs a different rule than a collection surface.

### 4.7 The "smaller font size / better readability" instruction is self-contradictory as stated

Smaller type is not more readable at 3 feet on a warehouse monitor. The repo's type system caps weight at 600 and binds a condensed cut to the eyebrow/micro roles precisely so dense chrome stays legible without shrinking (`.claude/rules/source-of-truth.md` → Typefaces). Interpret the intent — we read it as *less visual weight and fewer competing elements*, not *smaller px* — and say what the correct lever is (hierarchy, color contrast, element count) under the constraint that raw px and `font-bold` are both guard-enforced bans.

---

## 5. Combining POs and tickets onto a carton in flight (deliverable 5)

The operator's second ask: *"immediate inbox updates would include adding and combining different purchase order numbers with tickets that are already assigned, combining the tickets as well for the purchase orders."*

What exists today:

- **`CartonMatchHub`** (`src/components/receiving/workspace/line-edit/CartonMatchHub.tsx:3-14`) — the unified Package-Pairing + auto-match surface shared by Unbox / Testing / Arrival. Its header states the current linkage rule: *"Multi-link: order/PO collapses the picker; tickets stay on `ReceivingTicketChip`."*
- **`UnfoundMatchStrip`** (`:3-25`) — four resolution actions for an unfound carton: Return # search, Zoho re-fetch, Amazon reverse-tracking, Find ticket. Explicitly *operator-initiated only; nothing runs on the scan path.*
- **Ticket link waist** — `src/lib/support/ticket-link.ts`, `create-ticket-linkages.ts`, `ticket-link-query.ts`. `.claude/rules/source-of-truth.md` → *Link triggers* documents three hard-won rules here (pin the trigger to the section header; seed the picker from the record in hand but treat the seed as a **search term, never a typed id**; never substitute a different target for a typed id).
- **Carton-add** — `CartonAddPopover` / `CartonAddAction` / `CartonAddInline`.

Questions:

1. Is **many-PO-to-one-carton** a standard inbound shape (consolidated shipment / multi-PO receipt), and what is it called? What does the standard model bind the receipt to — the carton/handling unit, or an inbound-delivery header that *references* several POs?
2. Is the **unboxing bench** the standard place to make that association, or is it an ASN/dock-time concern that has leaked downstream because our dock pass is optional? (`intake_path` in `receiving_unbox` records `triage_first | unbox_only | unknown` — cartons legitimately skip the dock.)
3. **Ticket combining** is helpdesk merge semantics, not WMS. When a carton links two POs that each already carry a ticket, is the right answer to merge the tickets, to link both to the carton, or to leave them separate and let the carton be the join? What breaks in each?
4. Does any of this belong in a **step machine** at all, or is it exception handling that must stay out of the linear path? The `UnfoundMatchStrip` header's "nothing auto-runs on scan" reads like a lesson already learned — confirm or challenge.

---

## 6. Mobile-first is aspirational here — check the premise

The operator asks for a *"mobile first source of truth, bottom bar updating logic."* The premise does not currently hold:

- `ReceivingSurfacePage.tsx:47-79` — the `md:hidden` mobile branch of `/unbox` is a **photo-only feed** with a camera FAB. It contains no editor.
- `src/app/m/(shell)/unbox/page.tsx` → `RedesignedMobileReceive` — a **scan-entry** page (tracking scan → verdict rows), not a carton editor.
- The desktop bottom dock is an `absolute` float over a scroll canvas with reserved clearance (`LineEditPanel.tsx:517`, `slicedActionDockWrapperClass({ docked: false })`). That is not a mobile bottom bar; it is a desktop dock that happens to sit low.

So "mobile-first" here means **designing a surface that does not exist**, then back-porting its grammar to desktop — not porting desktop down.

**Question:** is that the right order? A bottom-anchored step machine is a strong mobile pattern (thumb reach, one-handed) and a *weaker* desktop pattern (the desktop bench has a wedge scanner and a mouse; input has no physical location, and bottom-anchored controls are the furthest point from a top-anchored display). Does designing mobile-first here import an ergonomic constraint the desktop bench does not have — and if so, does the resulting desktop layout still beat today's? Answer with the reach/target-acquisition literature, and be explicit about which findings transfer.

Also relevant: any new mobile route must join `MOBILE_ALLOWED_PREFIXES` (`src/lib/sidebar-navigation.ts:208`) and carry E2E coverage against the **QA org**, never the dogfood tenant (`.claude/rules/verify.md`).

---

## 7. Our straw proposal — attack it

Do not accept this. It is here so your answer has a target.

1. **Introduce a `UnboxStepMachine` module** — a pure, dependency-free state module (`step`, `canAdvance`, `advance(input)`, `goTo(step)`), sibling to `derive-receiving-step-states.ts` and composing `deriveLinearStepStates` rather than forking the walk. Vocabulary per intake type, not one global list.
2. **Mount it in the dock**, replacing the notes textarea as the dock's *primary* content when a step is active; notes demote to a step or to an insert action.
3. **Delete the sidebar serial path** (`useSerialScan` + `armedLineId`) and route all serial capture through the dock → `c.enqueueSerial`. One serial waist.
4. **Demote the accordion body to read-only display** — `LinePoItemsSection.tsx:216` stops passing `ActiveLineConditionSerial`; `PoLineRow`'s `activeRowSlot` renders a summary. Mouse editing survives at the **record plane** (`ReceivingDetailsStack` / the tab body), per the action-planes law.
5. **Narrow the top bar to ingestion**, and give the dock the F2 target whenever a carton is open.
6. **Rebind Enter**: advance while steps remain; commit only on the terminal step, with the disabled reason surfaced as today.
7. **Right panel becomes the checklist** — click a done step to return to it; the carton-lifecycle pipeline (`scanned/unboxed/received`) stays but stops being the only thing there.

Rank these by operator-seconds-per-carton saved per unit of engineering. Say which are wrong. **If (3) alone recovers most of the benefit, say so plainly** — we would rather delete a path than build a machine. Conversely, if the step machine is right but the *dock* is the wrong host (§4.2), say where it belongs instead.

---

## 8. Non-goals — do not propose

- Restyling the accordion in place (§0.3).
- A modal or blocking wizard (§0.3).
- A second design language, page-local hex, raw `z-[N]`, hand-set control boxes, or `font-bold` — all guard-enforced (`.claude/rules/ui-design-system.md`).
- Layout animation (width/height/padding) outside the sanctioned `collapseHeight` / deliberate-push cases (`display/motion-crossfade.md`).
- URL-addressable station selection (§0.3).
- A second condition→label or status→tone map. Condition labels come from `src/lib/conditions.ts`, tones from `src/lib/condition-tone.ts`.
- Raw `UPDATE … current_status`. Status changes go through `transition()` (`.claude/rules/backend-patterns.md`).
- Raising or relaxing any `npm run verify` ratchet baseline — including the Station Workbench chrome guards. Baselines only shrink.
- Anything that requires forking `StationWorkbench`, `StationComposerDock`, or `SlicedActionDock` for Unbox alone. Grow the primitive or add a sibling that composes it.

---

## 9. Shape of the answer we want

- **Five labeled sections** matching the deliverables. Part 4 as a **deletion-ordered** list: remove / merge / make-required / add-only-if-necessary, each with the `file:line` it touches and the operator-seconds it buys.
- Every codebase claim carries a path you opened and a line number. Inference marked `[UNVERIFIED]`.
- Every industry claim carries a citation, with **"documented spec"** vs **"operational practice"** distinguished, and vendor terminology mapped to standard terminology where they differ.
- A separate short section: **which of these changes are Unbox-local and which propagate to the other nine Station Workbench adopters** (§1). We will scope the work off that split.
- An explicit list of **things in this brief you believe are wrong**. The three we hold least confidently, in order: §4.1 (whether condition should be a step at all), §6 (whether mobile-first is the right design order for a desktop wedge-scanner bench), and §3.3's assumption that the sidebar serial path is the right one to delete. Push on those.
- A short **"if you only do one thing"** paragraph. We will likely act on that first.
