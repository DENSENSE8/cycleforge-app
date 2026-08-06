# Research briefing — Returns Unbox: should packer + tech history own the centre?

**For:** Gemini Pro (deep research) — **you have read access to this repository.** Paths below are pointers; open the real files. Do not invent modules from naming convention.
**From:** Cycle Forge engineering
**Date:** 2026-08-06
**Subject:** When Unbox is in the **named `return` flow**, where should the operator see the **full outbound lifecycle** of the matched serial — especially **packer photos**, **tech / testing verdicts + photos**, ship/pack stamps, and originating-order facts — relative to the **inbound return procedure** they are executing now.
**Status:** Hypothesis under validation. Product intent: returns feel like a *different job* than PO receiving, so the centre may need to become an **evidence + disposition work surface**, not a PO-line twin with history parked on the right edge.

**Bias:** Prefer **compose / grow existing SoTs** over a new region, a second timeline, or a second right rail. If you recommend centre ownership, name exactly what leaves the centre and what the Displays column still owns. "Show everything in the middle" is not an answer unless it survives Fitts, scan-station paint order, and the Frame column budget.

**Related briefs (do not re-litigate; cite or supersede with a dated note):**

| Brief | Overlap |
|---|---|
| [`photo-evidence-chain-GEMINI-RESEARCH-BRIEFING.md`](photo-evidence-chain-GEMINI-RESEARCH-BRIEFING.md) | Five-stage photo spine (arrival → packing); dispute evidence bar |
| [`unbox-procedure-flows-HANDOFF.md`](unbox-procedure-flows-HANDOFF.md) | Named flows `found` · `unfound` · `return` already implemented |
| [`unbox-station-scan-vs-lookup-GEMINI-RESEARCH-BRIEFING.md`](unbox-station-scan-vs-lookup-GEMINI-RESEARCH-BRIEFING.md) | Scan-as-write vs lookup; Station vs Workbench region split |
| [`carton-inspector-ux-GEMINI-RESEARCH-BRIEFING.md`](carton-inspector-ux-GEMINI-RESEARCH-BRIEFING.md) + [`display/carton-read.md`](../../.claude/rules/display/carton-read.md) | Read surfaces for history; journey thumbs ≠ photo browser |
| Prior chat ruling (2026-08-06) | Full history → existing Timeline Display; process → named `return` procedure; **no second right rail** |

---

## 0. Method — read before answering

### 0.1 Verify in the repo. Not optional.

- Every path you cite must be one you opened. Mark inferences `[UNVERIFIED]`.
- Quote load-bearing evidence: function signature, type union, guard name, SoT table row.
- Do not attribute a product decision to this brief that is not written here; label your own reasoning `"my reasoning:"`.

### 0.2 Search the web for industry / UX parts. Also not optional.

Answer from **named 2024–2026** WMS / reverse-logistics / RMA / serial-traceability systems and published operator-UX research, not memory. Prefer primary docs (Oracle Fusion RMA serial validate, Dynamics Traceability, NetSuite RMA serial lifecycle patterns, ReverseLogix / Happy Returns style intake, Maersk Timeline vs Step Indicator, GS1 EPCIS where relevant).

Distinguish:

- **Warehouse floor operator** (scan → confirm → next) vs **desk investigator** (dispute, warranty, fraud).
- **Referenced return** (RMA / order / prior serial known) vs **blind return**.
- **Multi-tenant reseller SaaS** (this repo) vs mega-3PL.

### 0.3 Established house laws — do not overturn casually

If you recommend violating one, say so explicitly and name the replacement contract.

| Law | Where |
|---|---|
| Scan-station **centre = lines / primary work**; reference tools = right-edge **Displays** | `AGENTS.md` Hard laws · `.claude/rules/source-of-truth.md` → Scan-station centre lines display · Unbox centre (main) |
| **Ticket ≠ Timeline** on station Displays | `source-of-truth.md` → Ticket vs Timeline |
| **One timeline primitive** — `EventTimeline` / `TimelineSection`; adapters only | `.claude/rules/display/reference-timeline.md` |
| **No second right rail**; AI + record share one right-edge slot; Displays push | `AGENTS.md` · Frame column budget · Right-rail modality |
| Named Unbox flows: `found` · `unfound` · `return` (serial-before-condition on return) | `src/lib/stations/procedure.ts` · `docs/todo/unbox-procedure-flows-HANDOFF.md` |
| Order **search feedback** ≠ desk **ShippedDetailsPanel** | `source-of-truth.md` → Order surface by job |
| Paint order P0→P3; LCP work must not hide behind client-only dynamic without SSR stand-in | `source-of-truth.md` → Paint content order |
| Compose from SoT; grow when wrong; never fork a page-local twin | `.claude/rules/pattern-evolution.md` |

---

## 1. Product context

**Cycle Forge** is multi-tenant reseller-ops SaaS. USAV is the dogfood tenant. Inventory is **serialized**. Inbound Unbox handles:

1. **PO / found** — matched purchase-order lines (vendor inbound).
2. **Unfound** — no PO; classify first.
3. **Return** — customer / marketplace return intake; serial scan identifies the unit that previously shipped.

Returns are commercially different: the operator is not "receiving a new vendor shipment." They are closing a **reverse logistics loop** — validating the unit against what was tested, packed, and shipped, then grading / claiming / restocking.

---

## 2. The hypothesis to validate (state it back in your own words)

### Product hypothesis (owner)

> Because returns are a **completely different process and procedure** from PO receiving, the operator needs **all packer and tech data** (especially packer photos) visible while working the return. The best place may be the **middle / centre display**, not only the existing right-edge Timeline Display.

### Engineering framing (for you to attack)

Split the hypothesis into **two claims** that can independently live or die:

| # | Claim | If true… | If false… |
|---|---|---|---|
| **H1 — Content** | On a genuine return match, **outbound station evidence** (testing + packing photos, tech verdicts, packer stamps, originating order) is **primary work context**, not secondary reference. | That evidence must be **visible without an extra Displays click** at the moment of serial match / grade. | Keep it on Timeline / search feedback / carton-read; centre stays procedure + lines. |
| **H2 — Placement** | The **centre column** of Unbox (main dogfood: PO/unfound lines + label) should **reshape for `return` flow** into an evidence-led / order-journey centre. | Ship a **return-specific centre composition** (still Station contract). | Satisfy H1 with a **pinned evidence band**, match-panel expansion, or auto-open Timeline Units — centre stays lines/procedure. |

**You must score H1 and H2 separately.** A strong H1 with a weak H2 is a useful outcome.

---

## 3. What "all the data from packer and tech" means in this codebase

### 3.1 Photo stages (SoT)

Five-stage spine — `src/lib/photos/stages.ts` (also summarized in the photo-evidence brief):

| Stage | Wire / timeline source | Typical station |
|---|---|---|
| arrival_package | `arrival` | Receiving |
| unbox_carton / unbox_item | `unbox_*` | Unbox |
| **testing** | `testing` → `TEST_PHOTOS` | **Tech** |
| **packing** | `packing` → `PACK_PHOTOS` | **Packer** |

Adapters:

- `src/lib/timeline/unit-photos-events.ts` → `unitPhotosToTimeline`
- Station bucketing: `src/lib/timeline/order-station-sections.ts` (`testing` · `shipping` sections; packing photos map to **shipping**)

Also: order-level `packer_photos_url` on shipped order payloads (`src/lib/search/resolve-search-order.ts`, consumed by `SearchOrderFeedback` gallery merge).

### 3.2 Events / stamps

- Inventory / SAL / audit → `TimelineItem` via adapters under `src/lib/timeline/`
- Testing verdicts & milestones: `TEST_*`, `PipelineStageRow` "Tested" in `SearchOrderStationTimeline`
- Packing / ship: `PACK_*`, packed / scanned-out milestones in `SearchOrderEvidenceColumn`

### 3.3 Serial match (return-specific, already on centre)

`SerialMatchResult` + `useSerialLookup` — under the serial field on return lines:

- Found / not-found
- Unit status · SKU · grade · bin
- **Originating sales order** when the unit was previously `SHIPPED`
- Optional "File return claim" CTA

Paths: `src/components/receiving/workspace/SerialMatchResult.tsx`, `ActiveLineConditionSerial.tsx`, `useLineSerials.ts`.

### 3.4 Where that data already surfaces today (do not invent a fifth place without killing one)

| Surface | Region | What you get | Path / entry |
|---|---|---|---|
| **Unbox centre (main)** | Station work | Lines + condition/serial + **match band**; label preview; dock | `LineEditPanel` / `POUnboxingSection` / `UnmatchedItemsSection` |
| **Unbox Displays → Timeline** | Displays push | Units journeys (stage photo thumbs) · Tracking · Activity | `WorkspaceTimelineTab` → `StationUnitJourneys` |
| **Unbox Displays → Photos** | Displays push | Carton receiving photos (inbound stages) | Photos topic |
| **Search order feedback** | Desk/search | Packing-first station sections + gallery including packer photos | `/search?sel=order:…` · `SearchOrderFeedback` |
| **Desk order inspector** | Workbench | Timeline topic + packer photo sections | `ShippedDetailsPanel` / `OrderTimelineSection` |
| **Carton read** | Read | Unit journey history + carton photo triage | `/carton/[id]` · `CartonUnitJourneyHistory` |

**Gap the hypothesis asserts:** on Unbox `return` flow, after a serial match, packer/tech evidence is **reachable** but not **centre-primary** — operator must open Displays Timeline (or leave the station for search / carton-read) while still grading the return.

---

## 4. Current Unbox anatomy (verify)

### 4.1 Main dogfood centre (not procedure-deck hero)

From `.claude/rules/display/station-workbench.md` + `source-of-truth.md` → Unbox centre (main):

```
Identity (StationContextBar + CartonContextCard)
Centre: PO lines OR unfound/return lines  (+ SerialMatchResult under serial on return)
        UnboxLabelPreview
Dock: notes + Print · Receive
Displays (right push): Ticket · Photos · Linkage · Classify · … · Timeline (overflow)
```

Procedure deck / step dock remains primary on the **`unbox-work`** lane, not main.

### 4.2 Return flow vocabulary

`src/lib/stations/procedure.ts`:

- `resolveUnboxFlow`: **return > unfound > found**
- `RETURN_CAPTURE`: serial **before** condition (names the unit before grading)
- `needsClassify` when return + still unpaired

Handoff: `docs/todo/unbox-procedure-flows-HANDOFF.md`.

### 4.3 Timeline Display already folds tech + pack photos into unit journeys

`StationUnitJourneys` loads per-serial journey events + `unitTimelinePhotosQuery` (arrival / unbox / **testing** / **packing** thumbs). That is the existing "full serial history" station surface — **on the right edge**, behind a Displays topic (often overflow).

---

## 5. Competing options (you must pick a winner and kill the rest)

Score each on: operator seconds to first packer photo after a match; Fitts / eye travel; Frame width; paint order / LCP; SoT compliance; dispute / fraud value; cognitive load vs PO unbox muscle memory.

| ID | Option | One-line |
|---|---|---|
| **A** | **Status quo + polish** | Centre = lines + `SerialMatchResult`; deep-link match CTA → Displays Timeline Units (auto-open, serial-filtered). |
| **B** | **Centre evidence band (pinned)** | After match, a **pinned** packer+tech evidence strip (thumbs + verdict + packed stamp) above or below the active line — still lines-first. Grow `SerialMatchResult`, do not replace centre. |
| **C** | **Return-specific centre composition** | When `flow === 'return'`, replace PO-line centre with an **order/unit dossier** (station-sectioned history + photos) + disposition controls; lines become secondary or dock-adjacent. |
| **D** | **Centre = ProcedureDeck + evidence** | On return (or unbox-work), ProcedureDeck remains hero; active step body embeds outbound evidence for the matched serial. |
| **E** | **Leave station** | Match CTA → `SearchOrderFeedback` or carton-read for full packer/tech; Unbox stays inbound-only. |
| **F** | **Second right rail / inspector** | Explicitly evaluate and **almost certainly reject** under Frame laws — only defend if you overturn the law with a migration plan. |

**Forbidden non-answers:** "tabs for everything"; "a dashboard in the middle"; a second `EventTimeline` fork; stuffing floor history into Ticket.

---

## 6. Industry questions (web research)

Answer with named systems + citations:

1. **RMA / returns receiving UX:** When a serial is validated against a prior shipment, do floor UIs put **outbound pack/test evidence** in the **primary work column**, a **side pane**, or only on **exception**?
2. **Oracle / NetSuite / Dynamics / Blue Yonder / Manhattan / Körber / Softenginestyle** returns: what is shown at serial-match confirmation vs full genealogy?
3. **Dispute / fraud / warranty:** Which photos win "not as described" / wrong-item / damage-after-ship claims — **packer outbound**, **tech**, **inbound return**, or all three in sequence? Does the operator need them **while grading**, or only when filing a claim?
4. **Maersk / NN/g / warehouse serialization UX:** Timeline vs step indicator — when does history become the work surface?
5. **Cognitive switching cost:** Same bench, same Unbox route, PO in the morning / returns in the afternoon — do industry systems **reshape the centre** by intake type, or keep one anatomy with contextual panels?

---

## 7. Codebase questions (repo research)

1. After a return serial match, **how many clicks / topics** to see packing-stage thumbs today? Trace `SerialMatchResult` → `WorkspaceTimelineTab` → `StationUnitJourneys` → `unitTimelinePhotosQuery`. Is Timeline even visible in the strip without overflow ⋮?
2. Does `StationUnitJourneys` already include **tech + packing** photos for a matched serial, or only inbound receiving photos? Quote the merge path.
3. Does Unbox Displays **Photos** topic show **outbound** packer/tech photos, or only receiving-scoped uploads? Quote `photo-scope` / list filters.
4. What does `SearchOrderFeedback` show that Unbox Timeline does **not** (or vice versa) for the same serial/order?
5. If Option C ships, which **guards / SoT rows** break? List concrete guard files (`unbox-right-edge-chrome`, `displays-p3-defer`, station-workbench chrome, scan-station centre lines, etc.).
6. Paint / LCP: pulling order timeline + unit photos into the centre on carton open — what is the Tier-1 / P1 implication for `/unbox`?

---

## 8. Decisions you must take a side on

For each: **current behavior**, **strongest steelman for the hypothesis**, **strongest steelman against**, **your verdict**, **migration order if change**.

| # | Decision |
|---|---|
| **D1** | Is H1 true for dogfood returns volume — is packer/tech evidence **primary** at grade time? |
| **D2** | Prefer Option **A / B / C / D / E** (kill the others). |
| **D3** | If centre changes for `return` only: is **intake-conditional centre anatomy** allowed under Station region law, or does it create an unguardable twin of Unbox? |
| **D4** | Should match confirmation **auto-open** Timeline Units vs embed thumbs in `SerialMatchResult`? |
| **D5** | Packer photos: treat as **timeline media rows** (journey) vs **disposition photo band** (carton-read twin) vs **both** with different questions (see carton-read dual-photo ruling). |
| **D6** | Originating **order dossier** (search feedback shape) inside Unbox vs deep-link out — when is leaving the station correct? |
| **D7** | Blind / not-found serial: what centre shows when there is **no** packer/tech history? |
| **D8** | Does "completely different process" justify a **named return centre template** in Studio later, or only a modifier on the existing Unbox shell? |

---

## 9. Deliverable format

Return **five separate answers**:

1. **Industry benchmark (2026)** — named systems; where outbound evidence sits on returns receiving UIs; when centre vs side pane wins.
2. **Codebase gap analysis** — what packer/tech data is already one Displays click away vs truly missing; quote paths.
3. **Verdict on H1 and H2** — independent scores with confidence.
4. **Winning option (A–E)** — layout sketch (ASCII), what the centre *stops* being, Displays remaining job, SoT/guard deltas.
5. **Deletion-ordered migration** — Phase 0 (no layout change) → … ; each phase must leave `npm run verify` green in principle; name guards to grow.

**Anti-patterns in your answer we will reject:**

- A second right rail "for history"
- A returns-only timeline component
- "Put SearchOrderFeedback in the Unbox centre" without reconciling Order surface-by-job
- Centre that is a dashboard of KPIs + photos + lines + procedure with no single primary question
- Raising ratchet baselines to pass

---

## 10. Suggested read order (repo)

1. `AGENTS.md` — Hard laws (scan-station centre, Displays vs inspector, order surfaces)
2. `.claude/rules/source-of-truth.md` — Unbox centre · Scan-station centre · Ticket vs Timeline · Paint content order
3. `.claude/rules/display/station-workbench.md` — Unbox Displays push · Procedure deck lane split
4. `.claude/rules/display/reference-timeline.md` — one timeline primitive
5. `.claude/rules/display/carton-read.md` — journey thumbs vs photo band (two questions)
6. `src/lib/stations/procedure.ts` + `docs/todo/unbox-procedure-flows-HANDOFF.md`
7. `src/components/receiving/workspace/SerialMatchResult.tsx`
8. `src/components/station/workbench/WorkspaceTimelineTab.tsx` + `StationUnitJourneys.tsx`
9. `src/lib/timeline/unit-photos-events.ts` + `order-station-sections.ts`
10. `src/components/search/order-feedback/SearchOrderFeedback.tsx` + `SearchOrderStationTimeline.tsx`
11. `src/components/receiving/workspace/line-edit/unbox-side-tabs.ts` (Timeline strip visibility / overflow)
12. Guards: `unbox-right-edge-chrome.guard.test.ts`, `displays-p3-defer.guard.test.ts`, `ticket-timeline-split.guard.test.ts`

---

## 11. One-sentence success criterion

A correct answer tells an engineer **exactly** where the first packer photo appears after a return serial match — centre, Displays, or another route — and which existing surfaces **lose** that job so we do not grow a twin.
