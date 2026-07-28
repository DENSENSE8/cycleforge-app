# Deep-research briefing — the inverted station: data *consumption* surfaces

**Audience:** Gemini Pro (deep research). You do **not** have the repository. Everything you
need is in this document. Answer with a design thesis + concrete recommendations, not a
literature dump.

**Author's one-line framing:** *"This system is very good at ingesting a scan. It is bad at
the other direction — picking a row in an order list and emitting an artifact (a label, a
pick list, a pack slip). The stations need to be identified and acknowledged differently per
task — inbound, outbound, testing, customer support — and I need to know how the UI grammar
inverts, and how the stations relate to each other."*

---

## 1. The product

**Cycle Forge** is multi-tenant reseller-operations SaaS: a used-goods reseller (eBay,
Amazon FBA, Ecwid, walk-in) receives inbound cartons, triages them, tests units, grades
condition, lists them, then packs and ships outbound orders — plus a customer-support
console and a repair/warranty loop. Warehouse staff work at physical benches with barcode
scanners (keyboard-wedge and camera), thermal label printers, and scales.

The design system is called **Kinetic Ledger**: data-first, dense, state-colored,
scan-aware. Reference points are Linear's calm chrome, Stripe/Carbon ops density, POS/scan
floors, and a node-graph "Studio" canvas. Explicitly *not* document-style whitespace.

### 1.1 The four region contracts (the existing architecture)

Every UI **region** (not page — a page with N jobs is N regions) is assigned exactly one
contract by a mechanical discriminator, first "yes" wins:

| Q | Test | Contract |
|---|---|---|
| Q1 | Does the region react to a **scanner / keyboard-wedge / camera**? | **Station** |
| Q2 | Is the user **observing** a stream/rollup with no intent to edit and no durable selection? | **Monitor** |
| Q3 | Is the primary surface a **node-graph** the user pans/zooms? | **Canvas** |
| Q4 | Otherwise: the user **picks a record and edits it** (durable URL selection, CRUD) | **Workbench** (fallthrough) |

Properties by contract:

| | **Station** | **Workbench** | **Monitor** | **Canvas** |
|---|---|---|---|---|
| Driven by | scanner | pointer | poll/stream | pan/zoom |
| Job | act-and-clear | pick + edit | observe | reshape a definition |
| Selection | **ephemeral, never in URL** | **durable, URL-addressable** | none (filters only) | durable focus in URL |
| What animates | the single active card | the focus detail region | nothing (first-load stagger) | the inspector only |
| Persistence | act-and-clear | CRUD | none | draft → publish |
| Density token | `floor` | `ops` | `rollup` | `studio` |

Hard anti-mix rule: never blend two contracts in one region. The most-cited failure is
"dropping a browsable clickable list into a scan column" — it invites a pointer and steals
focus from the scan bar.

### 1.2 The ingestion loop (the part that works — and the design anchor)

**Unbox mode on the receiving page is the acknowledged crux / source of truth of the whole
design system.** Its lifecycle:

```
MOUNT   → scan bar auto-focuses; global F2 hotkey targets the last-mounted scan bar
          (a LIFO stack — "last registered wins")
SCAN    → wedge/camera fires, Enter submits
CLASSIFY→ a pure classifier maps the raw string to TRACKING | SERIAL | FNSKU | SKU |
          REPAIR | COMMAND, then context-corrects (e.g. if the active order is still short
          on serials, a carrier-unknown "tracking-shaped" code is treated as a SERIAL)
RESOLVE → the entity is fetched and becomes THE active entity
DISPLAY → one active card crossfades in (AnimatePresence mode="wait", keyed on entity id,
          opacity + small y only). The previous card exits first — never two on screen.
RE-FOCUS→ input clears and re-focuses on a 0ms defer; a watchdog re-grabs focus on blur
ACT     → optimistic UI; a per-scan idempotency key (clientEventId) makes retries no-ops;
          pass/fail is a BIG CARD STATE plus an audio/haptic cue, never a corner toast
CLEAR   → completed work auto-hides after a timeout; the bench is visibly ready again
DOWN    → printer/scale/network down are distinct non-blocking banners; scans queue
          durably. Degrade, never block.
```

The right-pane editor that opens after a scan is a named primitive called the **Station
Workbench**: a fixed 720px column with a strict vertical anatomy —

```
progress stepper (completeness, not a wizard lock)
sticky identity bookmark  (carton / order context card, one condensed row)
section tabs              (Overview · Listings · Ticket · Units · Timeline · …)
tab body                  (all tabs stay mounted so form state survives)
feedback band
terminal dock             (ONE sticky primary CTA, resolved from a registry:
                           page × mode × tab → a single "terminal action" view-model
                           with an optional dropdown menu of variants)
```

That **terminal dock** is important for this research: the system already has a formal,
registry-driven notion of *"what is the one thing this operator finishes with here"* — for
inbound that is *Receive & Print*.

### 1.3 The surface registry

There is a code-level registry of first-class operator surfaces. Abbreviated:

| key | route | declared contract | scan classifier |
|---|---|---|---|
| `unbox` | `/unbox` | station | `unbox` |
| `triage` | `/triage` | station | `triage` |
| `incoming` | `/incoming` | workbench | — |
| `pickup` | `/pickup` | workbench | — |
| `repair` | `/repair` | workbench | — |
| `history` | `/receiving/history` | monitor | — |
| `pack` | `/pack` | station | — |
| `test` | `/test` | station | — |
| `outbound` | `/shipping` | **station** | — |
| `support` | `/support` | **station** *(known mis-declaration; is really a workbench)* | — |

Note the tension already visible in the data: `outbound` and `pack` are declared Stations
but carry **no scan classifier**; `support` is declared a Station and is admitted in a live
planning doc to be a Workbench. A separate order queue lives at `/dashboard` and is a
Workbench (a dense spreadsheet-style grid) with a Monitor KPI region on top.

---

## 2. The actual gap (verified against the code, not assumed)

I checked the repository before writing this. The precise state:

**What exists:**
- A rich family of print primitives: product label, "as-listed" label, receiving label,
  repair label, ticket label, manifest label, handling-unit label, pickup report, outbound
  documents, raw ZPL templates.
- A **bulk** selection bar on the dashboard order rows with a `Print labels` action — but it
  prints a **product/serial label** from the row's SKU, lazily loading the barcode engine.
- Cross-entity fuzzy search (a command-bar / quick-jump) that can *navigate* to an entity.
- A terminal-dock registry, but it is only populated for `unbox`, `triage`, `testing`,
  `shipping`, `repair`, `pickup` — i.e. the **inbound/bench** family.

**What does not exist:**
- **No row-level action affordance in the order grid at all** — no context menu, no row
  overflow menu, no keyboard action. I found zero `ContextMenu` usage in the orders grid.
- **No path from "a row in the order list" to "emit the correct outbound artifact."** The
  only print reachable from a row is the multi-select product-label action, which is not the
  shipping label the operator actually wants.
- **No inverse of the classifier.** Inbound has a formal *scan → entity type → handler*
  dispatch. Outbound has no *entity + intent → artifact/action* dispatch.
- **No station identity per task type.** All stations wear one visual/behavioral grammar
  (scan bar + recents), including the ones that are not scan-driven.

So the user's statement is right in substance, with one correction worth carrying into the
research: **a bulk print path exists, but it is the wrong artifact, reachable only via
multi-select, and there is no single-row or keyboard path.** The gap is architectural
(no emission waist), not merely a missing button.

---

## 3. The conceptual question to research

The system has a well-developed grammar for **ingestion**:

> *unknown physical object → scanner → classify → resolve → one active entity → act → clear*

It has **no** grammar for **emission / consumption**:

> *known entity, already in a list → operator picks it → declares an intent → the system
> produces a physical or digital artifact (shipping label, pick list, pack slip, manifest,
> RMA, invoice, ticket reply) → the item leaves the queue*

These are not the same job flipped. Some asymmetries I want interrogated, not assumed:

| | ingestion (inbound) | emission (outbound) |
|---|---|---|
| Where does identity come from? | the physical object (scan) | the operator's pick (pointer/keyboard) |
| How many entities at once? | exactly one, transient | often **many** (batch: print 40 labels, pick 12 orders) |
| Is the action known in advance? | yes — the bench *is* the intent | **no** — one row supports N intents (print label, pack slip, refund, cancel, message buyer) |
| What ends the interaction? | state transition + card clears | an artifact exists in the physical world |
| Failure mode | wrong scan / 409 conflict | printer jam, wrong label on wrong box — **irreversible in the physical world** |
| Is order meaningful? | no (whatever is in your hand) | yes — pick path, wave/batch sequencing, SLA/cutoff |
| Selection durability | ephemeral | durable (must survive a reload mid-batch) |

The crux question: **is "emission" a fifth region contract, or is it a *recipe* inside
Workbench?** The house rule strongly resists new contracts (Workbench is the deliberate
fallthrough, and an existing internal plan already argues that a "queue/backlog" is a
Workbench sub-recipe, not a new archetype, because it is still pick → edit → persist). But
emission has a property no current contract has: **it produces an irreversible physical
artifact**, and physical irreversibility is exactly what the Station contract's
scan-to-confirm, idempotency, and big-pass/fail machinery exist to manage.

---

## 4. Research questions

Answer these directly. Where the answer is "it depends," say what it depends on.

### A. The archetype question
1. Is operator **emission** (pick → intent → physical artifact) a distinct interaction
   contract, or a recipe within pick-and-edit? Argue both sides, then commit.
2. What is the strongest published/industry framing for this inversion? Candidate frames to
   evaluate and either adopt or reject: *object-verb vs verb-object* (noun-first vs
   verb-first interfaces), *direct manipulation vs command*, *pull vs push systems*,
   WMS **pick/pack/ship** vs **receive/putaway**, *batch/wave picking*, and the CLI notion
   of a **selection → operator → sink** pipeline.
3. If emission is a recipe, what is the minimum set of properties that must be declared per
   surface for the shell to render correctly (analogous to the existing
   `archetype` + `scan classifier` fields)? Propose the actual field names and value sets.

### B. Intent resolution — the inverse classifier
4. Inbound has *raw string → entity type → handler*. What is the correct dual for outbound?
   Options to evaluate: (a) a per-row **context menu** of intents, (b) a **verb-first**
   command palette scoped to the current selection ("print label" applied to N selected
   rows), (c) a **terminal dock** whose CTA is resolved from `(surface × selection shape ×
   lifecycle state)` exactly like the inbound dock is resolved from `(page × mode × tab)`,
   (d) an inline per-row **primary next action** column computed from state.
5. How should the system pick the *default* intent for a row, given that lifecycle state
   usually determines it (paid-and-unlabeled → buy label; labeled-unpacked → pack slip;
   packed → manifest/handoff)? What are the ergonomics and failure modes of a
   state-computed default action vs an always-explicit choice?
6. **Multi-select semantics.** When 40 rows are selected and their states differ, what
   should the action bar offer — the intersection of valid intents, the union with per-row
   skip, or a "resolve into batches" step? What do mature WMS/shipping tools (ShipStation,
   Shippo, Amazon Seller Central, Linnworks, Veeqo, Brightpearl) actually do, and which of
   those is right for a 1–20-person reseller rather than a 3PL?

### C. Physical irreversibility
7. What confirmation grammar is correct when the output is a physical label that can be
   stuck on the wrong box? The inbound side uses scan-to-confirm and a big card pass/fail.
   Is the correct outbound dual a **scan-to-verify-after-print** loop (print → scan the box
   → system confirms match) that turns the emission surface *back into a Station* at the
   final step? Evaluate this "emission ends in a verification scan" thesis seriously — it
   may be the unifying answer.
8. How should printer failure, partial batch failure, and reprint be modeled so the operator
   is never guessing which of 40 labels actually came out? What does the literature/practice
   say about print-job reconciliation at a pack bench?

### D. Station identity and differentiation
9. The user's explicit ask: **stations should be "acknowledged and identified differently"
   per task** — inbound, outbound, testing, customer support. What should legitimately vary
   between benches, and what must stay invariant to preserve one product? Propose a
   *tiered* answer: (i) always-shared chrome, (ii) contract-varying behavior, (iii)
   per-station identity (color/glyph/naming/goal metric/empty state) that is safe to vary.
10. Is per-station **color identity** a good idea in a dense ops UI where color already
    encodes *state*? (The house rule is "facts and state drive chrome; chrome never invents
    a second story.") If color is unsafe, what is the right differentiator — glyph,
    typographic label, goal-metric framing, layout skeleton?
11. What is the right **goal/throughput metric** per station type, and how does that metric
    change the empty state? (Inbound: cartons/hour, "ready to scan." Outbound: orders
    remaining before carrier cutoff, "inbox zero." Testing: units verified. Support: oldest
    ticket age / SLA breach risk.) Argue for the metric that actually changes operator
    behavior, not the one easiest to compute.

### E. How stations relate to each other
12. Model the **station graph**: an item flows receive → triage → test → grade → list →
    (sold) → pick → pack → ship, with side loops for repair, return, RMA, and support.
    Where are the genuine handoffs, and what should the UI do at a handoff — deep-link,
    hand off a durable "work object," or nothing?
13. Should there be a **shared cross-station work object** (a "task/assignment" the operator
    picks up and completes) that unifies "the carton I scanned" and "the order I selected"?
    Evaluate against Linear's issue model, Jira's queue model, and WMS *task interleaving*
    (where a single worker is handed a mixed sequence of put-away and pick tasks to
    minimize travel). Is task interleaving desirable at reseller scale, or is it a
    warehouse-scale idea that harms a small team?
14. **Should a station ever be "both"?** Packing consumes an order (emission) but also scans
    each unit into the box (ingestion). Testing consumes a queue of units but is scanner-
    driven. Argue whether these are (a) one region with a hybrid contract, (b) two regions
    on one page each with its own contract, or (c) a sequence: emission surface hands off
    into a station surface.

### F. UI grammar for the inverted direction
15. Propose the **anatomy of an emission surface** at the same level of specificity as the
    Station Workbench anatomy in §1.2 — the vertical layer stack, what is sticky, where the
    terminal action lives, what animates, what stays still, what is keyboard-reachable.
16. What is the correct **keyboard model**? Inbound owns F2 for scan focus (a LIFO stack).
    Outbound is pointer+keyboard. Propose a full keyboard grammar (selection, intent
    invocation, confirm, undo) that provably cannot collide with the scan hotkey, given
    that a wedge scanner may fire at any moment on any page.
17. **Undo.** Inbound is act-and-clear with idempotent retries. What is the honest undo
    model for emission, where the artifact is already physical? (Void-label APIs, reprint
    with a new sequence, a "voided" audit state?) What does the UI owe the operator here?
18. Where does **batch progress** live — a progress card, a queue that drains visually, a
    per-row state column? What is the best-practice display for "34 of 40 labels printed,
    3 failed, 3 skipped" at a bench, seen from three feet away with hands full?

### G. Validation
19. What measurable outcomes would prove the redesign worked (seconds per order, keystrokes
    per label, mis-ship rate, reprint rate, time-to-first-action for a new hire)? Propose an
    instrumentation plan.
20. What are the top failure patterns you would predict for this specific redesign, ranked
    by likelihood × cost?

---

## 5. Non-negotiable constraints

Any recommendation that violates these is out of scope — call it out if you think a
constraint is wrong, but do not silently design around it.

1. **One contract per region.** No blended regions. Splitting a page into two regions is
   always allowed; blending is not.
2. **The scan hotkey stack is sacred.** Any surface that mounts a scan-focus target joins a
   last-mounted-wins LIFO stack. A non-scan surface that registers a scan target silently
   steals the hotkey from the bench the operator is physically standing at. This is a
   correctness bug, not an aesthetic one.
3. **Compose the existing source-of-truth primitives; grow them when they are wrong.** Never
   fork a page-local twin of an existing primitive for the same job. A genuinely *different*
   job may add a new sibling that composes the shared primitive underneath.
4. **Color comes only from semantic state tokens.** No page-local palettes; chrome must not
   invent a second story beside state.
5. **Motion:** opacity + transform only, sub-300ms, ease-out for discrete swaps; never
   animate layout; crossfade exactly one focus surface per region — never the list, map, or
   graph; reduced-motion collapses to a pure fade.
6. **Selection durability follows the contract** — ephemeral for Station, URL-addressable
   for Workbench. A batch in progress must survive a reload.
7. **Multi-tenant.** Never surface cross-tenant data; every query is org-scoped.
8. **Degrade, never block.** A down printer/scale/network must never gate the operator's
   next action.
9. **Unbox mode is the anchor.** Any proposed outbound grammar must be explicable as a
   *dual* of Unbox — an operator who learned Unbox should recognize the shape. Divergence
   must be justified by a real asymmetry from §3, not by novelty.

---

## 6. Deliverable format

Please return:

1. **A thesis** (≤ 250 words): is emission a contract or a recipe, and what is the single
   organizing idea for the inverted direction.
2. **A decision table** in the style of §1.1 that extends the four contracts to cover
   emission — either a fifth row, or a sub-recipe column on Workbench.
3. **The emission surface anatomy** (§F.15), layer by layer, at the specificity of §1.2.
4. **The intent-resolution model** (§B) with a concrete named mechanism, including how the
   default intent is computed from lifecycle state and how multi-select resolves.
5. **A station-differentiation matrix** (§D.9) — invariant / contract-varying / per-station.
6. **The station relationship graph** (§E.12) with named handoff behaviors.
7. **Prior art**, cited: WMS pick/pack/ship UX, shipping platforms (ShipStation, Shippo,
   Veeqo, Linnworks, Amazon Seller Central), POS/kitchen-display systems, Linear/Jira queue
   models, command-palette and object-verb interaction literature, NN/g and Material
   guidance where relevant. For each: what to steal, what to reject, and why at *reseller*
   scale rather than 3PL scale.
8. **Ranked risks** (§G.20) and an **instrumentation plan** (§G.19).
9. **Open questions you could not resolve**, stated plainly.

Prefer decision tables over essays. Where you recommend a pattern, name the mechanism
concretely enough that an engineer could implement it without a second round of questions.
