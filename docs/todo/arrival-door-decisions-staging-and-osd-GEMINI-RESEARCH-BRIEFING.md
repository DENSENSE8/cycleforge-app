# Research briefing — What decisions belong at the receiving DOOR vs the unboxing BENCH in a reverse-logistics operation?

**For:** Gemini Pro (deep research)
**From:** Cycle Forge engineering
**Date:** 2026-08-09
**Subject:** In a **used-goods / refurb reseller** operation (not a pallet DC, not a 3PL), which inbound decisions are industry-standard to make at the **receiving door** — where a carton has been scanned but not opened, and frequently has **no purchase order and no known contents** — versus deferred to the **unboxing bench**, where lines and serials finally exist? Two decision families are in scope: (A) **where the carton physically goes** (staging placement), and (B) **how a discrepancy or damage is recorded** (OS&D capture, grain, and whether it blocks).
**Status:** OPEN — awaiting answer. Consumer: [`arrival-directed-staging-and-dock-osd-PLAN.md`](./arrival-directed-staging-and-dock-osd-PLAN.md), whose §3 decisions are deliberately unanswered pending this.

**Hard framing rule for your answer:** Compare and contrast **only against industry standards** — named products, WMS/RF practice, carrier-claim and freight standards, citable UX and logistics research. **Do not** reconcile against this product's internal design constitution, region contracts, "source of truth" files, house naming, or the linked plan's recommendations. Treat §2's measured facts as **empirical current state an engineer verified in source on 2026-08-09** — not as rules to preserve. Your output will be used **to decide whether the linked plan is built as written, rewritten, or abandoned**; treating its proposals as constraints defeats the brief.

---

## 0. Method — read before answering

### 0.1 Your job (five deliverables — keep separate)

1. **Industry pattern survey (2024–2026).** For inbound receiving, where does mature software put the *placement* decision and the *discrepancy* decision along the dock → stock path? Name products. Cite primary sources. State the dominant pattern, then the conditions under which minority patterns win.
2. **The reverse-logistics delta.** Forward-DC receiving assumes a PO, an ASN, and known contents. Returns/refurb receiving frequently has none of the three. Say explicitly **which forward-DC standards survive that inversion and which are actively wrong for it.** This is the deliverable most likely to change the answer, and the one a generic WMS survey will miss.
3. **Candidate architectures scored** — two independent families, §0.3. Pick one default for each against the shape in §1, with defended switch conditions.
4. **The grain question, answered on evidence.** Is an inbound discrepancy industry-standard at the **shipment / handling-unit** grain, the **receipt-line** grain, or both with reconciliation — and what do systems do when the package is visibly damaged but its contents are still unknown? (§2c is why this matters here.)
5. **Principle pack (industry language only).** Principles this product should adopt for the door, each with: principle name · one-sentence rule · who ships it · an acceptance criterion an engineer can verify at a receiving station. Write them to stand alone — they will replace internal wording.

### 0.2 What this brief is NOT

- Not "adopt full WMS directed putaway because big DCs do it."
- Not a slotting-optimization or ABC-velocity exercise (see §4 — inventory is largely unique units).
- Not pallet/SSCC/EDI-856 ASN integration work.
- Not a visual or component-library question. No opinions on chrome, panels, or tabs.
- Not carrier-claim *legal* advice. Claim **windows and evidence expectations** are in scope as operational facts; contract law is not.
- Not "should this product have a WMS at all."

### 0.3 Candidate architectures (score both families)

**Family D — where does the carton go, and who decides?**

| ID | Candidate | One-line |
|---|---|---|
| **D1** | **Undirected staging** (current state) | Operator freely picks any shelf from a flat catalog; no suggestion; direction happens later, at putaway |
| **D2** | **Advisory suggestion** | System proposes a shelf, operator overrides freely and silently |
| **D3** | **System-directed, reason-coded deviation** | System assigns; overriding requires a reason code (classic WMS directed putaway) |
| **D4** | **Direct the LANE, not the shelf** | System assigns a zone/lane by carton facts; shelf choice stays free within it |
| **D5** | **Defer entirely** | No placement decision at the door; every carton goes to one receiving drop zone and placement is decided at unbox |

**Family E — how is a discrepancy recorded, at what grain, and does it block?**

| ID | Candidate | One-line |
|---|---|---|
| **E1** | **Door capture, carton grain, non-blocking** | Damage/short/over recorded against the package at the door; downstream work proceeds |
| **E2** | **Door capture, carton grain, blocking** | Same, plus a system-enforced hold: the carton cannot be allocated/moved until released |
| **E3** | **Bench capture only** | Nothing recorded at the door; discrepancies are recorded at unbox, where lines exist |
| **E4** | **Dual grain with reconciliation** | Package-level fact at the door, line-level facts at the bench, explicitly reconciled |
| **E5** | **Blind receipt, then discrepancy at putaway** | Operator records what is physically there without seeing expectations; the system computes the discrepancy |

Score 1–5 on each axis; report one table per family. No sixth axis.

| Axis | Meaning |
|---|---|
| **Evidence timeliness** | Does the fact get captured while it is still true, visible, and claimable |
| **Decidability at capture time** | Can the operator actually answer the question with what is in front of them |
| **Downstream trust** | Does a later stage inherit a fact it can rely on, or one it must re-derive |
| **Operator cost** | Touches, decisions, and dwell added per carton at the busiest point of the day |
| **Small-team fit** | Survives a 1–15 person operation where one person may be the whole receiving function |

**ROI ≈ (Evidence timeliness × Decidability × Downstream trust × Small-team fit) / (6 − Operator cost).** Rank within each family, state the winner and the runner-up's win conditions. **Say explicitly whether the two winners are compatible** — a D winner that adds three decisions at the door may not survive alongside an E winner that adds two more.

### 0.4 Sources to cover (minimum)

| Class | Named examples (start here; expand with 2024–2026) | Use for |
|---|---|---|
| **Tier-1 WMS** | Manhattan Active WM, Blue Yonder WMS, Körber, SAP EWM (RF receiving + putaway strategies), Microsoft Dynamics 365 SCM (license-plate receiving, location directives, work templates) | Directed vs suggested placement; deviation handling |
| **SMB / mid-market WMS** | NetSuite WMS, Fishbowl, Logiwa, Extensiv (3PL Central), ShipHero, Cin7, Zoho Inventory | What a 1–15 person operation actually gets shipped to them |
| **Reverse logistics specialists** | ReturnPro / Optoro / goTRG / Happy Returns; returns-processing-center design writeups | The §0.2 delta — receiving without a PO or known contents |
| **Freight / claims standards** | NMFTA and carrier OS&D practice; carrier claim filing windows and evidence requirements (concealed vs visible damage); notation-on-delivery-receipt practice | Whether the door is genuinely the last honest moment |
| **Blind vs informed receiving** | Literature and vendor docs on blind receipt, two-step receiving, and count-integrity | E5, and the decidability axis |
| **Identity at receipt** | GS1 handling-unit / logistics-label practice; license-plate (LPN) receiving | Whether package identity must exist before a package-grain fact can |
| **Benchmarks** | WERC DC Measures, dock-to-stock quintiles, receiving-accuracy targets | Whether added door decisions are affordable |
| **Human factors** | Nielsen Norman on defaults, forcing functions, and mode errors; Don Norman on forcing functions and error-tolerant design; research on override rates for system-suggested defaults | D2 vs D3, and whether reason-coded deviation actually changes behavior |

Where industry splits, give **both** positions with their conditions, then pick a default for §1's shape.

### 0.5 Related briefs in this repo (cite, do not redo)

Use these only to avoid re-answering settled adjacent questions. **Ignore any house-law sections inside them.**

| Brief | Already owns (industry angle) |
|---|---|
| `dock-receiving-vs-unbox-GEMINI-RESEARCH-BRIEFING.md` | The door/bench **split itself** — that two stations exist is settled; this brief asks what each one *decides* |
| `unbox-station-scan-vs-lookup-GEMINI-RESEARCH-BRIEFING.md` | Scan vs lookup at the bench |
| `photo-evidence-chain-GEMINI-RESEARCH-BRIEFING.md` | Photo evidence capture and custody |
| `receiving-claim-modal-auto-ticket-GEMINI-RESEARCH-BRIEFING.md` | Claim ticket creation flow (downstream of the fact this brief scopes) |
| `wms-premium-parity-gap-GEMINI-RESEARCH-BRIEFING.md` | Broad WMS parity catalogue — you may narrow, not restart |
| `package-pairing-search-linkage-GEMINI-RESEARCH-BRIEFING.md` | Matching a carton to a PO/order |
| `arrival-kpi-and-door-lpn-PLAN-VALIDATION-GEMINI-RESEARCH-BRIEFING.md` | **Companion, same station:** what the door *measures* and what it *prints*. Shares §1/§4's product shape — do not re-derive it, and do not answer its questions here |

Your unique job: **which inbound decisions the door owns, at what grain, and whether they bind.**

---

## 1. Product context (facts only — not design law)

**Cycle Forge** is multi-tenant **reseller-operations SaaS**; the dogfood tenant refurbishes and resells used electronics. Frame recommendations as **sellable B2B warehouse software for small operations**, not enterprise DC consulting and not a five-person internal tool.

The inbound path has two stations, and the split is already settled (see §0.5):

| Station | Operator posture | What is known there |
|---|---|---|
| **Arrival (the door)** | Standing at the receiving door with a wedge scanner; scans a carrier tracking number as boxes come off the truck | The **package**: carrier, tracking, physical condition, sometimes a matched PO. Often **nothing about the contents** |
| **Unbox (the bench)** | Seated/standing at a bench; opens the carton, grades units, captures serials and photos, prints labels | The **contents**: lines, quantities, conditions, serial numbers |

**The structural fact that drives this whole brief:** a carton at the door frequently has **no PO and therefore no receipt lines at all** — inventory here is inbound used goods, customer returns, and buy-backs, not replenishment against an open order. The system calls these "unfound." So any door-time fact about *what was wrong* has nothing line-shaped to attach to.

---

## 2. Measured current anatomy (verified in source 2026-08-09)

You do not have the repo. Treat this as ground truth; do not invent additional behavior.

### 2a. The door screen today

```text
┌ identity ─ urgency · platform · type · [PHOTO] · [CLAIM] · tracking # ────┐
├ URGENCY            ▸ │  classify pill rows
├ PLATFORM           ▸ │
├ TYPE               ▸ │
├ LINK REPAIR ORDER  ▸ │
├ STAGING ─────────────┤
│   SHELF          [ Select a shelf…            ▾ ]   ← flat catalog, grouped by room
│   PRIORITY LANE  [ Unassigned                 ▾ ]   ← auto-fills from the shelf
├ note ────────────────┤
│   "Note for this item — shows on the sticker center"        [ Save for unbox ]
└──────────────────────┘
```

### 2b. Placement — what exists

- Shelf catalog is a flat list of real bins (`room · row · column · bin_type · zone · barcode · capacity`), presented grouped by room. **No suggestion, no ranking, no occupancy shown.**
- Choosing a shelf **auto-assigns a priority lane** from a small rule table (`PO_STOCKOUT · PO_STANDARD · RETURN · HOLD`) driven by two facts: *is this a return* and *is this priority*. A manually chosen lane always beats the automatic one.
- A **batch mode** already exists: scan a shelf barcode, assign N queued cartons to it at once.
- Live occupancy is computable today — every staged carton is already queried with its location for another feature — but is **not surfaced or used**.
- `capacity` exists on the shelf record but is measured in **stocked SKU units**, not staged cartons. A carton staged at the door writes nothing to that count.
- A separate, unrelated rule table decides the **final inventory bin** at receive time (a single org-default bin, e.g. `UNSORTED`). Dock staging and inventory putaway are distinct concepts here.

### 2c. Discrepancy — what exists

- A complete OS&D vocabulary exists and is seeded per tenant: `NO_PO · CARRIER_MISMATCH · SHORT · OVER · DAMAGED · WRONG_ITEM · RETURN_NO_ORDER`, plus separate narrow vocabularies for photo-policy waivers, loss write-offs (`LOST_IN_TRANSIT · EMPTY_BOX · MISDELIVERED · STOLEN`), and QA failures (`DEFECTIVE · INCOMPLETE`).
- **Two storage grains exist:**
  - **Package grain** — one code on the carton record. Written today by exactly **one** automatic writer at scan time (`NO_PO` / `CARRIER_MISMATCH`). No operator-facing path.
  - **Line grain** — a full exception table with reason, notes, ticket linkage, status, and actor. Rich, audited, and **requires a receipt line**.
- **Nothing OS&D-shaped is exposed on the door screen.** Every operator-facing exception path in the product today lives at the bench or later.
- Photo capture at the door exists (the camera in the identity bar), and the bench's first procedure step is defined as *reading the door's photo evidence* rather than re-shooting it.
- A photo-evidence policy gate exists (`require_one` / `require_per_item`) but runs at **receive** time — the end of the bench, not the door. **Its stated theory is directly relevant to Q4:** the gate counts *only* arrival-package evidence, on the explicit premise that **the insurable fact is the box before it was opened**. So this product has already committed, in code, to the door being evidentially special — but has shipped no door-time control that records *what* was wrong, only photos.
- A claim affordance (`CLAIM`) already sits in the door's identity bar, and the exception record already carries a helpdesk ticket reference.

### 2d. What the door measures today

One number: the share of cartons saved for unboxing while still unpaired. **Dock-to-stock is not surfaced anywhere**, although both timestamps exist (a door-scan stamp and a receive stamp).

---

## 3. Research questions (answer all)

### Q1 — Is dock staging a *directed* activity in industry at all?
Directed putaway is well documented for **stock**. Is directed placement of an **unopened, not-yet-received carton** standard practice, or does industry universally treat the dock as an undirected staging/drop zone with direction beginning at putaway? If the latter, D1/D5 may beat everything and the linked plan's §1 should be abandoned rather than built. Answer this before scoring.

### Q2 — Suggested vs system-directed, and does reason-coded deviation earn its cost?
Where placement *is* directed, do mature systems **assign** (deviation requires a reason code) or **suggest** (silent override)? What is known about override rates and about whether requiring a reason changes behavior versus just adding a keystroke? Answer for a 1–15 person operation specifically — the enterprise answer may not transfer.

### Q3 — What facts do systems actually key placement on, and which are knowable at the door?
Enumerate the standard inputs (velocity, dimensions, weight, hazard class, temperature, lot, destination, cross-dock demand). Then mark which are **knowable about an unopened carton of unknown used goods**. If most standard inputs require knowing the contents, say so plainly — that is a finding, not a gap in the research.

### Q4 — Is the door the last honest moment for damage?
Carrier claim windows and evidence expectations: what is standard for **visible** versus **concealed** damage, and does the industry treat notation at receipt as materially strengthening a claim? Is there a defensible case that capturing damage at the door is worth added dwell — or is photo-at-receipt sufficient and the door control redundant?

### Q5 — Package grain vs line grain for a discrepancy
When the box is visibly damaged but its contents are unknown, what grain do mature systems record against — shipment, handling unit, receipt line, or a package-level fact later reconciled to lines? Is a package-grain discrepancy a **first-class record** in standard data models, or a stopgap? (This is the single most load-bearing answer for §2c.)

### Q6 — Should a damage flag block?
Standard quality-hold/quarantine is a system-enforced interlock. For **inbound damage of unknown contents** in a small resale operation, is blocking standard, or is it reserved for regulated goods (food, pharma, aerospace)? What is the failure mode of blocking in a one-person receiving function, and what is the failure mode of not blocking?

### Q7 — Blind receiving
Does E5 apply here? Blind receipt is a count-integrity control that assumes an expectation to hide. With no PO on many cartons there may be nothing to be blind to — but where a PO *does* exist, does industry recommend hiding it at the door?

### Q8 — Affordability
Every added door decision costs dwell at the busiest moment. Against dock-to-stock benchmarks, roughly what decision budget does a receiving station have per carton before throughput degrades? Express as a range with its assumptions, and say which of the D/E winners fits inside it.

---

## 4. Constraints that are product facts (not house taste)

Treat these as fixed. A recommendation that violates one is out of scope, not bold.

- **Single site, small teams.** Target tenant is 1–15 people. One person may be the entire receiving function for a shift. No dedicated OS&D clerk, no QA department, no dock scheduler.
- **No pallets, no SSCC, no EDI 856.** Goods arrive as individual parcels via small-parcel carriers. Pallet-ASN-shaped answers do not apply.
- **Inventory is largely unique.** Used and refurbished units, mostly serialized. ABC velocity slotting has little to bite on; size, fragility, and workflow lane do.
- **A large share of cartons have no PO** and therefore no receipt lines at the door.
- **Wedge barcode scanners.** Keyboard-emulating; the operator's hands are on the carton. Anything requiring precise mousing at the door is expensive.
- **Photo capture at the door already exists** and the bench already consumes it.
- **The OS&D vocabulary is fixed** — the four codes a door control would use already exist and are seeded per tenant. Recommending new codes is possible but costly; say so if you do.
- **Desk monitors ~1440px.** Not RF handhelds, not tablets.
- **Tenants are resellers, not 3PLs.** No client-facing SLA reporting obligations.

---

## 5. Deliverable format (mandatory)

```
# Door vs bench inbound decisions — industry research

## Executive verdict
Winner in family D · winner in family E · are they compatible · one paragraph each

## Score tables
| D candidate | Evidence timeliness | Decidability | Downstream trust | Operator cost | Small-team fit | ROI |
| E candidate | … same axes … |

## Industry survey
### Placement: dock staging vs putaway
### Discrepancy: where in the path, at what grain
### The reverse-logistics delta (what does NOT transfer from forward DC)

## Answers to Q1–Q8

## Grain model recommendation
Package vs line vs dual, with the standard data-model shape and citations

## Principle pack (industry language only)
| # | Principle | Rule (1 sentence) | Who ships it | Acceptance check at a receiving station |

## Verdict on the linked plan
Build as written · rewrite · abandon — for each of its two halves, with reasons

## Ask-first
Only where a recommendation needs a product decision not derivable from industry + §1–§4
```

---

## 6. Closed for *this research* (do not recommend)

Out of scope for this deliverable, not eternal product bans:

- Replacing the domain status machine, or new terminal statuses.
- Pallet/SSCC/EDI-856 ASN integration.
- Dock-door appointment scheduling (no dock doors — parcels arrive continuously).
- RF handheld hardware procurement or a native mobile receiving app.
- Slotting optimization / ABC velocity analysis (see §4).
- Redesigning the bench. This brief is about what the **door** owns; the bench is the residual.

You **may** conclude that one or both halves of the linked plan should not be built. That is a valid and useful answer — say it plainly, with the industry evidence, rather than softening it into a phased recommendation.

---

**End of briefing.** Prefer primary sources dated 2024–2026. Prefer named products and citable standards over anonymous "best practice." Where forward-DC and reverse-logistics practice disagree, show both and pick for §1's shape — a returns operation receiving unidentified parcels, not a DC receiving pallets against an ASN.
