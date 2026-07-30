# Research briefing — dock receiving vs. unboxing: our stage boundary leaks, and we think the model is wrong

**For:** Gemini Pro (deep research) — **you have read access to this repository.** Paths below are pointers, not excerpts; read the real files.
**From:** Cycle Forge engineering
**Date:** 2026-07-29
**Scope:** the boundary between **receiving at the dock** (arrival) and **unboxing at the bench** (deconsolidation + item inspection) — how the two are modeled, which entity each writes to, and why evidence captured at one keeps getting attributed to the other. Photo evidence is the *symptom surface*; the boundary itself is the subject. Not the photo library browse UX, not outbound/packing.

## The report that started this

An operator photographs **products they just unboxed** at the bench. The system files those photos as **arrival evidence** — "Arrival · package", receiving glyph, arrival bucket in the unit timeline. Investigation (§3) found this is not one bug. It is the predictable output of a model where **the arrival stage is the fallback value on every path that does not explicitly say otherwise**, and where two modules that both document themselves as the source of truth disagree about what that fallback should be.

**The commercial consequence is not cosmetic.** The `require_one` receive gate (§4.5) counts *only* arrival-package evidence, on the explicit theory that the insurable fact is the box **before it was opened**. Mis-stamped unbox photos silently satisfy that gate. The control that exists to guarantee we hold pre-opening evidence is currently satisfiable by post-opening photos — so for any carton whose only "arrival" photos came from the bench, the insurance is void and the system reports it as present. That is worse than having no gate.

**Bias of this brief:** prefer **collapsing or deleting** concepts over adding them. We already have a five-value stage enum, two stage-resolution modules, three defaulting props, and no desktop item camera. If your answer adds a column, a table, or a capture step, say what it *replaces*. Operator seconds per carton are the scarce resource, not schema.

## Deliverable — four separate answers

1. **The model answer.** Is a free-text `photo_type` stamp the right place for "which station observed this", or is the industry answer that evidence binds to a **receipt event / handling unit**, and the stage is *derived* from what it is bound to? Answer against named WMS models — ASN/inbound delivery, GS1 SSCC handling units, two-step receive-then-putaway, blind vs. ASN receipt, LPN/license-plate. Cite primary documentation.
2. **The boundary answer.** In real inbound operations, where is the line between "dock receiving" and "unboxing/deconsolidation" drawn, and what changes at it — custody, liability, the unit of record, the concealed-damage window? Is our two-street model (`receiving_triage` / `receiving_unbox`, §2) the standard shape or a local invention?
3. **The codebase answer.** Reconcile 1–2 against §3–§5. Give a **deletion-ordered** path: what to remove or merge first, what to make required, what to add only if nothing else works. Verify against the code — §0.1.
4. **The repair answer.** §6 describes ~months of already-mis-stamped rows and a candidate time-based reclassification predicate. Is time-based reclassification of evidence provenance *defensible*, or does rewriting an evidence stamp after the fact destroy the thing that made it evidence? What do records-management and chain-of-custody practice say about correcting a mis-classified evidentiary record?

---

## 0. Method — read this before answering

### 0.1 Verify in the repo before you assert. Not optional.

A prior brief in this series produced phases targeting files that do not exist.

- **Every file path you name must be one you opened.** Infer nothing from naming convention. Mark inference `[UNVERIFIED]`.
- **Quote the evidence** for load-bearing claims: line number, function signature, schema column.
- Every `file:line` in §3–§5 was read on 2026-07-29 against `main` at `22f3d6bda`. **Re-verify them.** If a line has moved or the claim is wrong, say so — that is a useful finding, not a nuisance.
- **Do not attribute reasoning to this brief that is not written in it.** If it is yours, say "my reasoning:".

### 0.2 Search the web for parts 1, 2, and 4. Also not optional.

- Part 1 is a **systems-modeling** question. Answer from SAP EWM / Manhattan / Blue Yonder / Oracle WMS documentation, GS1 standards (SSCC-18, GS1-128, GS1 Logistic Label), and EDI 856/ASN references — not from memory. Where a vendor's term differs from the standard's, give both.
- Part 2 is partly **unwritten operational practice**. Distinguish "what the manual says" from "what a dock actually does", and label which is which.
- Distinguish **large-scale 3PL practice** from **small multi-tenant reseller SaaS**. This repo is the latter: one warehouse, a handful of operators, thousands of serialized units — not a Ware2Go. A model that needs a dedicated receiving clerk per dock door is not available to us.

### 0.3 Established facts — do not re-litigate

| Claim | Status |
|---|---|
| "Link item evidence to the SKU" | **No.** `items` and `sku_catalog` are two independent numbering schemes whose SKU strings collide. Item evidence links `RECEIVING_LINE` by id. `.claude/rules/source-of-truth.md` → SKU identity. |
| "Put `entity_type`/`entity_id` columns on `photos`" | **Already migrated away.** Polymorphic links live in `photo_entity_links` (2026-06-18; old columns dropped 2026-06-21). |
| "Let operators type the photo category" | **That was a prior bug.** A `caption` → `photo_type` conduit let free text become the evidence stamp. Closed 2026-07. |
| "Validate the stamp client-side" | Insufficient. The write waist validates (`src/lib/photos/service.ts:74-99`). Client checks are UX only. |
| "The display layer is mislabeling photos" | **No — and this matters.** The display layer is honest (§5). It renders the stamp it is given. Do not propose display fixes. |

---

## 1. Product context

**Cycle Forge** is multi-tenant reseller-operations SaaS for used-goods resellers; USAV is the dogfood tenant. Inventory is **serialized** — individual physical units with serials, condition grades, test verdicts, evidence. Inbound arrives as cartons against vendor POs (mirrored from an inventory provider), as marketplace returns, and as local pickups.

Two house laws govern everything below and are non-negotiable:

- **Tenant-from-birth** — every table carries `organization_id UUID NOT NULL`, org-led indexes, `enforce_tenant_isolation()` in its birth migration (`.claude/rules/polymorphic-tables.md`).
- **One module per concern** — read from the named source of truth; never inline, copy, or re-derive its mapping (`AGENTS.md` → Hard laws). §3 is a report of this law being broken twice over.

---

## 2. How we currently model dock vs. bench — read these first

Inbound is modeled as **one spine plus two 1:1 "street" tables**, carton-grain:

| Table | Owns | Key timestamps | Path |
|---|---|---|---|
| `receiving` | the carton spine | — | `src/lib/drizzle/schema.ts` |
| `receiving_triage` | **dock / arrival** street ops | `door_received_at`, `triage_completed_at` | `schema.ts:1634-1656` |
| `receiving_unbox` | **bench / unbox** street ops | `opened_at`, `unboxed_at`, `intake_path` | `schema.ts:1658-1674` |
| `receiving_line` | receipt lines under the carton | `scanned_at`, `unboxed_at`, `received_at` | `schema.ts:1416` region |

`intake_path` (`triage_first | unbox_only | unknown`) records whether the carton went through the dock pass at all — an `unbox_only` carton was never triaged, which is a legitimate and common path.

Surfaces: dock is `/triage` (`src/components/receiving/triage/TriagePanel.tsx`), bench is `/unbox` (`src/components/receiving/workspace/LineEditPanel.tsx`). Both are scanner-driven Station regions (`.claude/rules/display/station.md`); both mount the same identity header SoT.

**Question for you (part 2):** two 1:1 street tables hanging off one carton spine, with a path discriminator for "skipped the dock" — is that the standard decomposition, or is the standard shape a single **inbound delivery** header with *receipt events* against handling units, where "triaged" and "unboxed" are event types rather than tables? What does each buy?

### 2.1 The evidence stage vocabulary layered on top

Five stages, three of them inbound (`src/lib/photos/stages.ts:42-59`, `src/lib/receiving/photo-intent.ts:5-17`):

| Stage id | Station | Entity | `photo_type` | Label |
|---|---|---|---|---|
| `arrival_package` | dock / triage | `RECEIVING` | `receiving_package` | Arrival · package |
| `unbox_carton` | bench, carton chrome | `RECEIVING` | `receiving_unbox_carton` | Unbox · carton |
| `unbox_item` | bench, active line | `RECEIVING_LINE` | `receiving_item` | Unbox · item |
| `testing` | testing | `SERIAL_UNIT` | `testing_photo` | Testing |
| `packing` | pack/ship | `SERIAL_UNIT` ± `PACKER_LOG` | `packer_photo` | Packing |

Note the shape of the problem this creates: **`arrival_package` and `unbox_carton` are the same entity with different strings.** The only thing separating dock evidence from bench evidence is a text value that every layer has to remember to thread. `unbox_item` is separated structurally (different entity) and is correspondingly never confused. **That asymmetry is our central suspicion and part 1 of your deliverable.**

Prior initiative context (read for history, not as current truth): `docs/todo/photo-evidence-chain-INDEX.md` and its five child plans. Its own status notes predate the fixes in §3.

---

## 3. The leak map — every path where bench work becomes dock evidence

### 3.1 Two modules, both self-described SoT, opposite defaults

This is the root. Read both.

**`src/lib/receiving/photo-intent.ts:106-112`** — `receivingUploadStage()`. Carton default is **`unbox_carton`**, and lines 98-104 state the reason verbatim: the capture pipeline runs at the unbox bench, `arrival_package` is the door shot, and *"a bench that defaults to arrival silently satisfies that gate with a photo taken after the box was opened, which is the exact failure this SoT exists to prevent."*

**`src/lib/receiving/photo-scope.ts:61-67`** — `parseReceivingCartonPhotoStage()`. Missing/unknown → **`arrival_package`**, commented "the legacy default".
**`src/lib/receiving/photo-scope.ts:77-84`** — `effectiveReceivingPhotoStage()`. Missing stage → **`arrival_package`**.

Both modules are consumed by the *same* mobile pipeline. The page-level parser runs first and produces an **explicit** `arrival_package`, which `receivingUploadStage` then honors as a caller hint (`photo-intent.ts:111`). **The safe default never fires.** The module that documented the hazard lost to the module that grandfathered it.

### 3.2 The stage is a defaulted safety classification — which this repo already forbids

`.claude/rules/backend-patterns.md` → *"A safety classification is a REQUIRED parameter, never a defaulted one"*, with a worked precedent: `scanKind: UnboxScanKind = 'work'` shipped with 2 of 6 call sites passing a value, so the other 4 silently mis-attributed work. The rule prescribes making it required so the miss becomes a compile error, plus a guard that walks the call sites (`src/app/api/receiving/lookup-scan-wiring.guard.test.ts` is the existing example).

The photo stage violates this rule at six places:

| # | Site | Default |
|---|---|---|
| 1 | `src/components/receiving/workspace/line-edit/ReceivingPhotoButton.tsx:71` | `photoStage = 'arrival_package'` |
| 2 | `src/components/station/entity-context/CartonContextCard.tsx:95` | `photoStage = 'arrival_package'` |
| 3 | `src/components/receiving/workspace/line-edit/LineCartonContextSection.tsx:98` | `photoStage = 'arrival_package'` |
| 4 | `src/components/shipped/photo-gallery/usePhotoGallery.ts:461-466` | fallback upload target → `RECEIVING_PHOTO_PACKAGE` |
| 5 | `src/app/api/receiving-photos/route.ts:250-252` | no `photoType` in body → `RECEIVING_PHOTO_PACKAGE` |
| 6 | `photo-scope.ts:61-67`, `:77-84` | as §3.1 |

**There is no wiring guard test for any of them.** Confirmed by search across `src/lib/photos` and `src/lib/receiving`: unit tests exist (`photo-intent.test.ts`, `photo-scope.test.ts`, `stages.test.ts`, `photo-policy-gate.test.ts`) and they test the *resolvers*, correctly. Nothing tests that the **call sites thread a value**. Every resolver test passes while the product mis-stamps.

### 3.3 Confirmed leaking call sites

Reproduce these; they are the operator's actual path.

**A — mobile PO camera, no stage in the href.** `src/app/m/(shell)/receiving/po/[poId]/page.tsx:86`:
```
const captureHref = `/m/receiving/po/${encodeURIComponent(poId)}/photos`;
```
No `?stage=`. Lands on `src/app/m/(immersive)/receiving/po/[poId]/photos/page.tsx:19` → `parseReceivingCartonPhotoStage(null)` → `arrival_package` → scope → `PhotoUploadQueue` (`src/components/mobile/receiving/PhotoUploadQueue.ts:258`) → `receiving_package`. **This is the shortest path from "operator photographs unboxed products" to "arrival evidence" and we believe it is the reported one.**

**B — share-to-phone handoff, no stage.** `src/components/mobile/receiving/ReceivingShareToPhoneSheet.tsx:80-85` builds `?title=…&poRef=…` and pushes `/m/r/{id}/photos${qs}`. No stage → `arrival_package` at `src/app/m/(immersive)/r/[id]/photos/page.tsx:16`. The desktop operator sends the carton to their phone *from the unbox bench*; the photos come back stamped dock.

**C — Testing bench inherits the arrival default.** `src/components/tech/testing-panel/TestingCartonHeader.tsx:26-70` mounts `CartonContextCard` with no `photoStage`. Testing is two stations *downstream* of the dock. Every carton photo taken there stamps arrival.

**D — any receiving gallery without an explicit target.** `usePhotoGallery.ts:461-466` derives `RECEIVING + receiving_package` from a bare `receivingId`. The comment says carton links may not carry `receiving_item` — true, and it picks the wrong one of the two remaining options.

**E — the legacy attach route.** `POST /api/receiving-photos` (`route.ts:250-252`) defaults carton → `receiving_package`. Reached by the desktop NAS picker via `src/lib/nas-photos.ts:188-192`, which resolves the stage through `effectiveReceivingPhotoStage` — §3.1's arrival default again.

Correctly wired, for contrast: `LineEditPanel.tsx:455,490` pass `photoStage="unbox_carton"`; `TriagePanel.tsx:272` region and its peek at `:329-334` pin `package` deliberately; the mobile item route (`src/app/m/(immersive)/receiving/po/[poId]/item/[itemId]/photos/page.tsx:66-71`) pins `unbox_item` explicitly. **The three surfaces that were built with the stage in mind are right. Every surface that merely inherited a default is wrong.** That is a model problem, not a diligence problem.

### 3.4 The desktop bench has no item camera at all

`ReceivingPhotoButton` documents an item mode — `receivingLineId` + `photoStage="unbox_item"` (`ReceivingPhotoButton.tsx:5-8, 88-93`). **No call site passes `receivingLineId`.** `CartonContextCard.tsx:623-630` passes only `receivingId`, `staffId`, `poRef`, `photoStage`, `onSendToTicket`. The codebase admits it at `LineEditPanel.tsx:620-626`: *"Item evidence (RECEIVING_LINE + receiving_item) currently has NO desktop capture surface."*

So a desktop operator unboxing a carton is offered exactly one camera, and it is carton-scoped. **Even with §3.1–§3.3 fully fixed, photos of individual products would land on the carton as `unbox_carton` — the right station, the wrong grain.** The only correct item capture path in the product is a mobile route reached by drilling PO → item → photos.

**Question for you:** is "no per-line capture on the primary bench" a UI gap, or the tell that the grain is wrong — i.e. that at the bench the unit of record should already be the *unit/LPN*, not the receipt line?

---

## 4. What the mis-stamp costs

### 4.1 through 4.4 — the honest layers

The write waist validates (`src/lib/photos/service.ts:74-99` → `validatePhotoWrite`, `src/lib/photos/stages.ts:91-105`). But it validates the **matrix**, not the **stage**: all three carton types are legal on `RECEIVING`, so `receiving_package` from the Testing bench is a well-formed write. The waist cannot catch this class of error by construction — it does not know which station is asking. Consider whether it should.

`POST /api/photos/upload` (`src/app/api/photos/upload/route.ts:89`) takes `photoType` from the form as an opaque string. There is no notion of "requesting surface" anywhere in the request.

### 4.5 The gate — where it becomes money

`src/lib/receiving/photo-policy.ts:150-164`. Under `require_one`, only `cartonPhotoCounts.package` satisfies. Lines 27-35 state the theory: *"the insurance value is the box as it arrived, before it was opened."* Counts are assembled server-side by `sqlCartonStagePhotoCount` (`src/lib/photos/queries/receiving-list.ts:181-192`), correctly pinning entity **and** `photo_type` per stage.

The evaluator is right. The gate is right. **The inputs are contaminated**, so a carton whose only arrival-typed photos were shot at the bench passes a gate designed to prove the opposite. And the blocker copy at `:161` — *"unbox and item photos do not count"* — will never fire for exactly the cartons that most need it, because their unbox photos are *typed* as arrival.

There is a second-order effect worth your attention: the evaluator's `hasOtherEvidence` branch exists to *explain the confusion to the operator*. The mis-stamp makes the confusion invisible instead. **A control that fails silent is the failure mode to design against.**

---

## 5. The display layer is honest — do not propose display fixes

Verified faithful renderers of whatever stamp exists:

- `src/lib/timeline/timeline-glyphs.ts:113-115` — `ARRIVAL_PHOTOS` → receiving glyph, tooltip "Arrival", with the comment that arrival is the pre-unbox shot and therefore rides the receiving glyph rather than unbox. Correct reasoning applied to a wrong input.
- `src/lib/timeline/unit-photos-events.ts:44-72` — source → tone / event-type / order, five buckets, arrival first.
- `src/lib/photos/display-names.ts:25-27` — filename slugs `arrival` / `unbox-carton` / `unbox-item`. **The mis-stamp is baked into NAS filenames**, so it has already left the database.
- `src/lib/photos/stages.ts:53-59` — the label map.

The user-visible "arrival tag" is the display layer correctly reporting a corrupt write. Every one of these files would need to *lie* to hide it.

---

## 6. The repair question (deliverable part 4)

Unknown volume of `RECEIVING`-linked rows stamped `receiving_package` that were shot at the bench. We have not counted; assume months.

A candidate predicate exists in the data:

- `photos.client_captured_at` — device shutter clock (`schema.ts:1095`), nullable.
- `photos.created_at` — server insert.
- `receiving_unbox.opened_at` — bench queue entry (`schema.ts:1661`).
- `receiving_triage.door_received_at` — first dock scan (`schema.ts:1638`).

**A carton photo captured after `receiving_unbox.opened_at` cannot be arrival evidence.** That is a provable statement about physical order, not a heuristic. Reclassifying those to `receiving_unbox_carton` would restore the gate's meaning.

`src/lib/receiving/photo-intent.ts:231-241` (`remapReceivingPhotoTypeOnMove`) and `src/lib/photos/reassign-receiving-photo.ts` already exist for entity moves and establish that re-stamping is a supported operation.

**But we are not sure we should.** Three things we want you to take seriously rather than wave at:

1. Rewriting an evidence stamp after the fact means the stamp is not a record of *what the operator asserted*, it is a record of *what we later inferred*. For a claim artifact, is that a repair or a contamination? Cite records-management / chain-of-custody practice.
2. `client_captured_at` is nullable and `created_at` can lag capture arbitrarily (the mobile queue persists across refreshes — `PhotoUploadQueue.ts` localStorage rehydration). What is the correct treatment of rows the predicate cannot decide? Silently leaving them arrival-stamped reproduces the original bug in a smaller set.
3. `intake_path = 'unbox_only'` cartons never had a dock pass. Is an arrival stamp on those *meaningful at all*, and does that change the answer?

Alternative framings to evaluate against re-stamping: leave rows immutable and add a derived/attested provenance field; deprecate the arrival bucket for historical rows and gate only forward; treat the legacy set as explicitly "unclassified" rather than choosing between the two stages.

---

## 7. Our straw proposal — attack it

Do not accept this. It is here so your answer has a target.

1. **Delete the arrival default everywhere.** Make stage required at all six §3.2 sites. Compile error, not a comment.
2. **Make the surface declare itself, not the stage.** Capture surfaces pass a station/region identity; the stage is *derived* from it by one function. A surface cannot get the stage wrong because it never names one.
3. **Add a wiring guard** per `backend-patterns.md`: a test that parses the call sites of every capture surface and every `?stage=` href and fails on a missing value. `lookup-scan-wiring.guard.test.ts` is the pattern.
4. **Bind evidence to a receipt event, not a string.** If a photo links to the dock receipt or the bench open event, the stage is a join, not a stamp — and a bench photo *cannot* be arrival evidence because the bench event is what it points at. This is where we most want part 1's answer.
5. **Give the desktop bench an item camera** — or conclude from §3.4 that the bench grain should be the unit/LPN and build that instead.
6. **Repair per §6**, or deliberately do not.

Rank these by dispute-outcome value per unit of engineering. Say which are wrong. **If (4) makes (1)–(3) unnecessary, say so plainly** — we would rather delete the stage vocabulary than harden it.

---

## 8. Non-goals — do not propose

- Display/label changes (§5).
- A new photo-type free-text field, or operator-typed categories (§0.3).
- SKU-string linkage of item evidence (§0.3).
- Removing the write-waist validation to make anything pass.
- Raising or relaxing any `npm run verify` ratchet baseline (`.claude/rules/verify.md` — baselines only shrink).
- Anything requiring a dedicated receiving clerk per dock door (§0.2).

---

## 9. Shape of the answer we want

- Four labeled sections matching the deliverables. Part 3 as a **deletion-ordered** list: remove / merge / make-required / add-only-if-necessary, each with the `file:line` it touches and the dispute-outcome it buys.
- Every codebase claim carries a path you opened and a line number. Inference marked `[UNVERIFIED]`.
- Every industry claim carries a citation, with "documented" vs "operational practice" distinguished.
- An explicit list of **things in this brief you believe are wrong**. §2.1's asymmetry claim and §7's item-4 are the two we hold least confidently — push on them.
- A short **"if you only do one thing"** paragraph. We will likely act on that first.
