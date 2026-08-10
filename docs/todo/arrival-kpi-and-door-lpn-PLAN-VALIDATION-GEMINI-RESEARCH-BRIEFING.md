# Plan validation briefing — Arrival station metrics, and printing a license plate at the door

**For:** Gemini Pro (deep research)
**From:** Cycle Forge engineering
**Date:** 2026-08-09
**Subject:** Two proposals lifted from a WMS-standards review of a **used-goods reseller's** receiving door, written up here as plans and submitted for validation against **industry-standard warehouse management systems**. (K) Adopt **dock-to-stock cycle time** and **receiving accuracy** as the Arrival station's metrics. (L) Print the **carton license plate at the door** instead of at the unboxing bench. Your job is to **validate, amend, or reject** each — not to admire them.
**Status:** **ANSWERED 2026-08-09.** **Plan K — REJECT. Plan L — AMEND to L3 (conditional door
print).** Neither plan is built, and K is not to be built as written. Full verdict, score tables
and Q1–Q10 answers in §7. One open product question came back and is unanswered — §7.4.

**Companion brief:** [`arrival-door-decisions-staging-and-osd-GEMINI-RESEARCH-BRIEFING.md`](./arrival-door-decisions-staging-and-osd-GEMINI-RESEARCH-BRIEFING.md) asks the adjacent question (which *decisions* the door owns). This one is about what the door **measures** and what it **prints**. Do not re-answer that brief.

**Hard framing rule:** Judge only against **industry standards** — named WMS products, WERC/DC-benchmark literature, GS1 and parcel-identity practice, reverse-logistics operations research, citable UX work. **Do not** reconcile against this product's internal design constitution or house naming. Treat §2's facts as **empirical current state verified in source on 2026-08-09**. **A "reject" verdict is a successful outcome of this brief** — both plans were derived from generic WMS literature, and the central risk is that they import pallet-DC assumptions into a parcel-based returns operation where they do not hold.

---

## 0. Method — read before answering

### 0.1 Your job (five deliverables — keep separate)

1. **Verdict per plan.** `ADOPT` · `ADOPT WITH AMENDMENTS` · `REJECT` for K and for L independently, each with the industry evidence that decided it. Lead with this.
2. **Standards audit.** For each metric and each identity practice the plans propose, state: what the standard actually is, what population it assumes, and whether this operation is inside that population (§4).
3. **Candidate scoring** — §0.3, two families, scored on the axes given.
4. **Replacement set (if you reject).** If a proposal fails, say what a mature system would measure or print **instead** for this operation shape. A rejection with no replacement is half an answer.
5. **Adoption sequencing.** For whatever survives: what must exist first, what is measurable on day one, and what needs a data change. Flag anything that requires a schema or process change rather than a UI change.

### 0.2 What this brief is NOT

- Not a dashboard or visualization design exercise. No opinions on tiles, charts, or chrome.
- Not label *artwork* — no opinions on layout, fonts, or symbol size beyond what scannability requires.
- Not thermal-printer hardware selection.
- Not the OS&D or staging-placement questions (companion brief).
- Not a general "what KPIs should a warehouse track" listicle. Only the Arrival station's own metrics are in scope.

### 0.3 Candidates (score both families)

**Family K — what does the Arrival station measure?**

| ID | Candidate | One-line |
|---|---|---|
| **K1** | **Adopt the proposal as written** | Dock-to-stock cycle time + receiving accuracy %, benchmarked against WERC-style quintiles |
| **K2** | **Dock-to-stock only** | Accuracy dropped as undefined for this population (see Q2) |
| **K3** | **Reverse-logistics-native set** | Replace both with metrics that fit unidentified inbound (e.g. identification rate, time-to-disposition, evidence completeness) |
| **K4** | **Repair before extend** | Fix the one metric that exists and has never rendered; add nothing until it does |
| **K5** | **No station metrics** | Measurement belongs on a management/monitor surface, not on the operator's work screen |

**Family L — where does package identity get printed?**

| ID | Candidate | One-line |
|---|---|---|
| **L1** | **Print at the door** (the proposal) | Carton label printed at Arrival; the bench print becomes a reprint |
| **L2** | **Status quo** | Print at the bench only; between door and bench the carton is identified by the carrier's own barcode |
| **L3** | **Conditional door print** | Print only when carrier identity is absent, ambiguous, or shared across several boxes |
| **L4** | **No second identity** | The carrier tracking barcode *is* the license plate; invest in the digital record, not a printed one |
| **L5** | **Two-tier label** | Minimal identity-only label at the door; full label (condition, notes) at the bench |

Score 1–5 on each axis; one table per family. No sixth axis.

| Axis | Meaning |
|---|---|
| **Standards fit** | Does a mature WMS actually do this, for this population |
| **Decidability at capture** | Can the fact be computed / the label be printed with what is known at that moment |
| **Operator cost** | Touches and dwell added at the busiest point of the day |
| **Failure visibility** | When it goes wrong, does anyone notice — or does it silently report a wrong number / a duplicate identity |
| **Small-team fit** | Survives a 1–15 person operation with no dedicated receiving clerk |

**ROI ≈ (Standards fit × Decidability × Failure visibility × Small-team fit) / (6 − Operator cost).**

### 0.4 Sources to cover (minimum)

| Class | Named examples | Use for |
|---|---|---|
| **Benchmark literature** | WERC DC Measures (dock-to-stock quintiles, receiving accuracy), Gartner/industry inbound KPI sets | K — what the standard metric *is*, and its assumed population |
| **Tier-1 WMS metrics** | Manhattan Active WM, Blue Yonder, Körber, SAP EWM warehouse monitor / KPI framework | K — what ships as an operator-facing vs manager-facing metric |
| **SMB / 3PL WMS** | NetSuite WMS, Logiwa, Extensiv, ShipHero, Fishbowl | K, L — what a small operation is actually given |
| **Reverse-logistics operations** | ReturnPro / Optoro / goTRG; returns-processing-center throughput studies; published returns cycle-time figures | K — metrics for inbound with no PO; the "10–14 day" returns processing figure and what is measured inside it |
| **Parcel & package identity** | GS1 logistics label / SSCC practice; carrier tracking-number uniqueness and reuse policies; multi-piece shipment identifiers | L — is a second identity standard, or duplicative |
| **License-plate receiving** | Microsoft D365 SCM license-plate receiving; SAP EWM handling units; WMS LPN practice | L — what an LPN buys, and at which moment it is standard to mint one |
| **Human factors** | Research on duplicate/competing identifiers on a package; scan-error and mis-scan literature; NN/g on vanity metrics and dashboards nobody acts on | K, L — failure modes |

Where industry splits, give both positions with conditions, then decide for §4's shape.

---

## 1. The two plans under review

### Plan K — make the Arrival station report dock-to-stock and receiving accuracy

**The argument as written:** dock-to-stock is the chief inbound KPI — industry median 4–6 hours, top quartile under 2, common target under 24 — and receiving accuracy is its standard companion, typically 99.5%+ once barcode scanning is in place. Both timestamps needed for dock-to-stock already exist in this system (a door-scan stamp and a receive stamp), and expected quantity exists on paired POs. The Arrival station currently defines one metric and it is not a standard one.

**Proposed change:** add dock-to-stock and receiving accuracy to the Arrival station's metric strip, benchmarked against published quintiles.

### Plan L — print the carton license plate at the door, not at the bench

**The argument as written:** the standard is blunt — anything arriving without a compliant license plate gets labeled on the spot, and evidence (photos, notes) then attaches to that plate and follows it everywhere. This system prints the carton label at the unboxing bench instead, so between door and bench a carton's only identity is the carrier's tracking number — which is exactly the identifier that fails on the arrivals that most need identity (no PO, wrong carrier, unreadable label).

**Proposed change:** print the carton label at Arrival; the bench print becomes a reprint.

---

## 2. Measured current state (verified in source 2026-08-09)

You do not have the repo. Treat this as ground truth; do not invent behavior.

### 2a. What the Arrival station measures today — effectively nothing

- Arrival's metrics endpoint computes **two** numbers: average age of the current unfound backlog, and the share of cartons saved for unboxing with the pairing question still unanswered.
- Its UI strip renders **only the second**, and returns nothing when it is null.
- **That metric has never rendered.** The flag it depends on (`triage_complete`) is true on **0 of 2474** rows in the dogfood tenant, so the denominator is zero, the rate is null, and the strip has never painted. This is known and documented in a separate handoff; the predicate is considered correct for when the flag starts being set.
- **So in practice the Arrival station displays zero metrics**, and has since it shipped.

### 2b. What the *bench* measures — a real registry, but only counts and ages

The Unbox station has a proper metrics registry — eight metrics, each with a label, value, fraction-of-target, intent, severity, status word, and tooltip:

`opened-today · awaiting-test · stuck · queue-depth · priority · oldest-wait · viewed-today · unfinished`

Two properties matter for Plan K:

- **Every one is a count or an age.** None is a *duration between two stamps* (a cycle time), and none is a *rate against an expectation* (an accuracy). Both proposed metrics are new **kinds**, not new entries.
- **A metric doubles as a row filter.** The registry's stated contract is that the predicate computing a metric's count is the same predicate that filters the table when an operator clicks the tile — "a row's membership must never be answered two different ways." A duration or a rate has no obvious row-membership meaning, so either the contract bends or these metrics are a different class of object.

### 2c. Timestamps that exist

A door-received stamp on the triage record; per-scan timestamps; operational event timestamps (first/last scan); and receive-time stamps at the bench. Dock-to-stock is computable today without a schema change.

### 2d. Expected quantity

Receipt lines carry `quantity_expected` and `quantity_received`. **But a receipt line only exists when one is created** — automatically for PO-paired cartons, and otherwise only when a human explicitly adds one. The read model has a documented concept of **"placeholder rows for lineless unmatched cartons"**: an unidentified carton is a real, tracked object with **no lines and therefore no expected quantity at all**.

### 2e. Printing today

- The carton label encodes a per-tenant Digital Link (`https://{slug}…/m/r/{id}`) as a DataMatrix, with the human-readable handle `R-{id}` beside it. **It needs only the carton's internal id and the tenant slug** — no PO, no lines.
- The availability rule for a carton label is already `has a carton OR has a scan value OR has a payload` — i.e. **it does not require lines today**.
- The label's content fields are: internal id, tenant slug, PO/RCV id, platform, optional ticket number, tracking number, **centre note text**, **condition code**, and receiving type. Everything on that list is known at the door **except the condition code**, which is a per-item grade that does not exist until a unit is inspected.
- **All printing lives at the bench.** Every print call site is under the unboxing workspace. Arrival has no print entry point.
- **The door screen already authors the label's centre text.** Its note field is labelled "shows on the sticker center."
- **A deliberate prior decision exists and is documented in code:** *"The note is not printed on Arrival; it carries to Unbox and displays there as the item's internal note."* Plan L reverses a choice someone already made on purpose. Weigh it accordingly — but note the reasoning behind that choice is not recorded, only the choice.
- Every payload form ever printed is pinned permanently in a test table, because **nothing is ever reprinted onto existing stock** — a warehouse full of old labels is the installed base.

---

## 3. Research questions (answer all)

### K-side

**Q1 — Is dock-to-stock the right primary for a *parcel-based* operation?**
Published dock-to-stock benchmarks assume scheduled pallet deliveries against an ASN, where "the shipment" is a discrete arrival event with a start boundary. Here parcels trickle in continuously from small-parcel carriers, all day. Is dock-to-stock well-defined in that setting, what is the accepted start boundary (carrier delivery scan? first internal scan? door scan?), and do the published quintiles transfer at all — or would quoting them be a category error?

**Q2 — Is "receiving accuracy" even defined when most inbound has no expectation?**
Receiving accuracy is `actual ÷ expected`. §2d says a large share of cartons have **no expected quantity in the system at all**. Is the standard metric therefore (a) computed over the PO-paired subset only, and honestly labelled as such; (b) replaced by a different integrity measure for unidentified inbound; or (c) meaningless here and better dropped? What do returns-processing operations actually measure in its place?

**Q3 — Operator-facing or manager-facing?**
Do mature WMS put cycle-time and accuracy metrics on the **operator's own work screen**, or on a supervisor/monitor surface? Is there evidence about whether showing a throughput clock to the person being clocked changes behavior — and in which direction? (K5 exists because of this question.)

**Q4 — The dead-metric precedent.**
§2a: this station already shipped a metric that has never once rendered, and nobody noticed until someone read the code. What does that predict about adding two more, and what acceptance criterion should gate a metric's introduction so it cannot ship dead? Answer this concretely — it is the strongest argument for K4.

**Q5 — Reverse-logistics-native metrics.**
If K1/K2 fail, what do returns and refurb operations measure at intake? Candidates to evaluate, not a menu to accept: identification rate (share of arrivals resolved to a known order/PO), time-to-disposition, evidence completeness at receipt, unidentified-backlog age, claim-eligibility rate. Which are standard, which are invented, and what is actually benchmarkable?

### L-side

**Q6 — Is the carrier tracking barcode already a sufficient license plate?**
This is the crux. A parcel arrives bearing a unique, machine-readable carrier identifier. LPN practice comes from pallet/handling-unit contexts where no such identifier exists. Under what conditions does industry mint an **internal** identity for an item that already carries an external one? Address specifically: tracking-number reuse over time, multi-piece shipments sharing one number, unreadable or missing labels, and returns arriving with no carrier record at all.

**Q7 — What does moving the print earlier actually buy, and what does it cost?**
Between door and bench, what operations need to address the carton by identity — and can they use the carrier number? Weigh against: a second barcode on the same box (mis-scan risk), the printing step's own dwell, label stock and printer availability at a door that may not have one, and §2e's incomplete content (no condition code at the door).

**Q8 — Two identities on one package.**
If both a carrier label and an internal plate are present, what is standard practice for avoiding mis-scans — obscure the carrier label, place the plate on a specified face, use distinct symbologies, or something else? Is there evidence on error rates for multi-barcode packages?

**Q9 — Does the evidence-follows-the-plate claim require a *printed* plate?**
Plan L leans on "photos attach to the plate and follow it everywhere." In this system, photos already attach to the carton's internal record at the door with no printed label involved. Is the printed plate load-bearing for evidence custody, or is that argument really about **digital** identity, which already exists here?

**Q10 — Reversing a documented decision.**
§2e records a deliberate choice not to print at Arrival, with the choice preserved but not its reasoning. What are the most likely industry-grounded reasons an operation would deliberately defer printing to the bench, so the team can check whether those reasons still hold?

---

## 4. Constraints that are product facts (not house taste)

A recommendation violating one of these is out of scope, not bold.

- **Single site; 1–15 person tenants.** One person may be the entire receiving function for a shift. No receiving clerk, no dock supervisor, no analyst.
- **Parcels, not pallets.** Small-parcel carriers, continuous arrival, no dock doors, no appointments, no SSCC, no EDI 856.
- **A large share of inbound is unidentified at arrival** — no PO, no expected quantity, sometimes no known sender.
- **Inventory is largely unique serialized used goods.** Not replenishment stock.
- **Wedge barcode scanners; desk monitors ~1440px.** Not RF handhelds.
- **Condition is not knowable at the door.** It is a per-unit judgement made at the bench after inspection.
- **Nothing printed is ever reprinted onto existing stock.** Any label format change is permanent and additive to an installed base.
- **The tenant is a reseller, not a 3PL** — no client SLA reporting obligation, so no external consumer for a cycle-time number.

---

## 5. Deliverable format (mandatory)

```
# Arrival metrics + door license plate — plan validation

## Verdicts
Plan K: ADOPT / AMEND / REJECT — one paragraph, with the deciding evidence
Plan L: ADOPT / AMEND / REJECT — one paragraph, with the deciding evidence

## Score tables
| K candidate | Standards fit | Decidability | Operator cost | Failure visibility | Small-team fit | ROI |
| L candidate | … same axes … |

## Standards audit
| Proposed thing | What the standard actually is | Population it assumes | Applies here? | Source |

## Answers to Q1–Q10

## Replacement set
What to measure / print instead, where a proposal was rejected

## Adoption sequencing
Day-one measurable · needs a data change · needs a process change

## Ask-first
Only where a call needs a product decision not derivable from industry + §2–§4
```

---

## 6. Closed for *this research* (do not recommend)

Out of scope for this deliverable, not eternal bans:

- Dock-door appointment scheduling (no dock doors).
- Pallet / SSCC / EDI-856 work.
- RFID.
- A new analytics or BI surface, warehouse data model, or reporting stack.
- Changing what the bench prints, beyond whether it becomes a reprint.
- Labour-management or per-operator productivity scoring. Explicitly excluded: §4's team size makes individual measurement a personnel matter, not a metrics one.

You **may** conclude that either plan is a pallet-DC standard incorrectly imported into a parcel returns operation, and should not be built. Say it plainly, with the evidence, rather than softening it into a phased adoption.

---

**End of briefing.** Prefer primary sources dated 2024–2026, and named products and standards over anonymous "best practice." Where forward-DC and reverse-logistics practice disagree, show both and decide for §4's shape — a small reseller receiving unidentified parcels one at a time, not a distribution centre receiving pallets against an ASN.

---

## 7. ANSWER (received 2026-08-09)

Verbatim verdicts and reasoning below; the engineering read-out follows in §7.3.

### 7.1 Verdicts

**Plan K — REJECT.** The proposal imports forward-logistics, pallet-based metrics into a
reverse-logistics, parcel-based flow. Dock-to-stock benchmarks (WERC) assume scheduled ASNs
with clear start boundaries; small parcels arrive in a continuous trickle. Receiving accuracy
is **mathematically undefined** for unidentified inbound — there is no expected quantity.
Tier-1 WMS reserve cycle-time and accuracy rates for **manager-facing monitors, not operator
work screens**.

**Plan L — AMEND to L3 (conditional door print).** Blanket door printing adds dwell, risks
mis-scans from dual barcodes, and contradicts the condition code being knowable only at the
bench. But relying wholly on the carrier tracking number fails when that label is absent,
unreadable, or shared across a multi-piece shipment. Standard practice for this profile:
mint an internal plate **only when carrier identity is compromised or missing**; otherwise
defer to the bench.

### 7.2 Score tables

| K candidate | Standards fit | Decidability | Operator cost | Failure visibility | Small-team fit | ROI |
|---|---|---|---|---|---|---|
| K1 Adopt as written | 1 | 1 | 2 | 2 | 2 | 1.0 |
| K2 Dock-to-stock only | 2 | 5 | 2 | 3 | 3 | 15.0 |
| K3 Reverse-logistics-native | 4 | 4 | 1 | 4 | 4 | 51.2 |
| K4 Repair before extend | 3 | 5 | 1 | 4 | 4 | 48.0 |
| **K5 No station metrics** | 5 | 5 | 1 | 5 | 5 | **125.0** |

| L candidate | Standards fit | Decidability | Operator cost | Failure visibility | Small-team fit | ROI |
|---|---|---|---|---|---|---|
| L1 Print at the door | 3 | 3 | 4 | 3 | 2 | 27.0 |
| L2 Status quo | 4 | 5 | 1 | 4 | 4 | 64.0 |
| **L3 Conditional door print** | 5 | 5 | 2 | 4 | 4 | **100.0** |
| L4 No second identity | 3 | 4 | 1 | 2 | 4 | 19.2 |
| L5 Two-tier label | 2 | 4 | 5 | 4 | 1 | 32.0 |

### 7.3 Findings that change how the station is built

- **Q3 — a throughput clock on an operator screen is an anti-pattern here**, and the reason is
  specific to this flow: it incentivises rushing scans and bypassing exceptions, "which is
  lethal in a reverse flow where exceptions are *the work*." Operator screens get actionable
  queues (backlog count, oldest item); rates and cycle times go to a manager surface.
- **Q4 — the acceptance criterion for any new metric is a data-validation gate.** Before merge,
  a query must prove the metric computes to a non-null, non-zero-variance value on current
  historical data. A metric whose denominator is always zero does not ship. This is the direct
  answer to §2a's dead metric and applies to every future metric, not just these two.
- **Q5 — the reverse-logistics replacement set:** identification rate (share of arrivals paired
  to an origin), **time-to-disposition** (arrival → final routing decision — *not* dock-to-stock),
  and unidentified-backlog age.
- **Q6 — carrier tracking numbers are recycled every ~120–180 days**, which is the concrete
  failure mode behind the L3 amendment. Combined with master tracking numbers on multi-piece
  shipments and damaged labels, that defines exactly when an internal plate is earned.
- **Q9 — the evidence-custody argument for a printed plate does not hold.** Photos already map
  to a digital carton id at the door, so the chain is unbroken; the printed plate is a physical
  pointer to that record and can be produced later.
- **Q10 — the prior "do not print at Arrival" decision is vindicated** on three grounds we had
  not recorded: wasted partial labels (condition code missing), printer provisioning at the
  door, and dwell (1s to scan a carrier barcode vs 5–10s to print and apply).

### 7.4 ⚠ Open product question — needs an answer before L3 is scoped

> L3 requires hardware at the door **strictly for edge cases**. What is the hardware budget and
> footprint reality at Arrival — is there physical space and budget for a printer that may be
> used on 5–10% of daily volume?

Unanswered. **L3 is not scopeable until it is** — and the answer may push toward L2 (status quo)
if the exception rate is low and no printer can live at the door. Sizing input: instrument the
carrier-identity exception rate (missing / unreadable / shared tracking) before buying anything.

### 7.5 What this does NOT settle

The rejection of K is about **which metrics and on whose screen**. It does not rule on whether
the existing dead metric should be deleted or repaired — the answer says remove it from the
Arrival UI, which is a UI change, while `triage-complete-never-true-HANDOFF.md` still owns the
question of why the flag is never set.
