# Deep-research briefing — Scan Identification Desk Kernel (station-agnostic, mobile-first, per-ID)

**For:** Gemini 2.5 Pro (deep research / architecture adjudication)
**From:** Cycle Forge engineering
**Date:** 2026-09-10
**Repo facts verified against:** `cycleforge-lanes/prod` (live dogfood lane) vs `cycleforge-app` (main worktree). You do **not** have the repository. Use **only** facts embedded here. Do not invent file paths.

> **Author's one-line framing:** We already ingested scan-out as an API. The long-term product is not “more stations.” It is a **desk-vocabulary, per-identification display**: after a scan *or* a role-queued claim (no barcode), the operator sees the exact triage face for that ID on a **mobile-first** surface, with tenant automations/AI compiling **custom identification jobs** onto one kernel — not forking a new floor app per role.

**What we want back:** a **ruling plus a foundation contract**, not a literature dump. Forced picks on D1–D12. A v1 brick small enough to ship without renaming the tree. A paste-ready P0 prompt.

---

## 0. How to use this brief

### 0.1 Four deliverables (keep separate)

1. **Industry survey (2024–2026).** How mature WMS / 3PL / RF / pack-bench / seller-ops products separate (a) barcode identification, (b) role work queues that do not require a scan, (c) tenant-configurable “what this scan means,” and (d) phone vs bench presentation. Name products. Cite primary sources.
2. **Forced rulings D1–D12** (§7) — one pick each. No “it depends.”
3. **Foundation contract** (§8) — the types, invariants, and anti-patterns an implementing agent must not violate.
4. **Phased brick plan** (§9) — P0 is the **only** thing we build next. P1+ exists so we do not accidentally build P3 in P0.

### 0.2 Paste prompt (give this entire file to Gemini)

```
Read scan-identification-desk-kernel-GEMINI-RESEARCH-BRIEFING.md end-to-end.

You do not have the codebase. Use ONLY facts in the brief.

Deliver:
1. Industry survey with named systems + 2024–2026 citations (§6).
2. Forced rulings D1–D12 (§7) — one pick each.
3. Foundation contract: IdentificationResult + JobFace + entry modes, with invariants (§8).
4. P0–P4 brick plan. P0 must be smaller than “rename station → desk” and smaller than “AI scan IDs.”
5. A ≤40-line implementing-agent prompt for P0 only.

Reconcile with embedded laws (§5). Where industry conflicts with house facts, pick for sellable multi-tenant warehouse SaaS and defend it.
Do not invent file paths. Do not propose FilterRefinementBar, hunt tiles, folding Queue/Viewed/History into a funnel, deleting overlay visibility/zIndex.panel, or lowering Lighthouse floors.
```

### 0.3 Non-goals (DO NOT PROPOSE)

- A wholesale string-replace of `station` → `desk` across 40k graph nodes as v1.
- A second visual language, a chat-bubble primary floor, sci-fi HUD.
- LLM **on the scan hot path** (classify/resolve/act in <200ms). AI authors **templates**; the kernel executes **validated config**.
- Merging the floor identification overlay host with the desk-table inspector host (prior industry ruling: two hosts, thin shared waist).
- Polymorphic `entity_type`/`entity_id` columns on `work_sessions` (already refused; identity lives on `ops_events`).
- A fifth region archetype.
- Greenfield mobile app / React Native. Presentation is the existing Next `/m` shell + desk overlay.
- Screenshot baselines as a resume reason. Operator-invented “verdict” UI.

---

## 1. Product (facts)

**Cycle Forge** is multi-tenant **B2B warehouse / fulfillment ops SaaS**. First dogfood tenant is a used-goods reseller; recommendations are for a **sellable platform**, not a five-person internal tool.

Operators: warehouse staff (picker, packer, tester, inbound, scan-out), supervisors, tenant admins who will later **author automations**. Devices: 1080p bench + keyboard-wedge scanners, phones in the aisle, thermal printers. Density identity: Kinetic Ledger (ops density, scan-aware). North star already in-repo: Lighthouse Performance / Accessibility / Best-Practices ≥ 95, LCP ≤ 2500ms; never lower floors to silence a gate.

### 1.1 The vocabulary collision (the actual problem)

The codebase has **at least five overlapping “what is this place” words**:

| Word | Where it lives | What it actually means |
|---|---|---|
| **Station** | `SURFACE_REGISTRY.archetype`, overlay cohort, `StationComposerHost`, folder `src/lib/stations/`, eval `eval:station` | Historically: “scanner-driven floor region” (Q1 of four region contracts) |
| **Desk** | `shipped-desk.ts`, `orders-desk.ts`, comments: “desk vocabulary” for URL params | A **job surface** (To-ship vs Shipped vs Support) — not a physical bench |
| **Session** | `work_sessions`, `SESSION_KINDS` = `scan` \| `task` | Unit of human work. Scan sessions: exactly **one armed** org-wide. Task sessions: N open |
| **Surface** | `SURFACE_REGISTRY` keys: unbox, triage, pickup, pack, test, outbound, support, … | Launchable operator job, permission, route, optional scan classifier |
| **Workbench / Monitor / Canvas** | Same discriminator as Station | Pointer CRUD; observe stream; Studio graph |

**Operator instruction for this program:** long-term, **remove station vocabulary from the product**; speak **desk**. Physical benches still exist. The product object is not “the Pack station”; it is “the identification desk for this job, on this ID.”

Gemini must **not** treat a rename as the foundation. The foundation is a **domain kernel** that desks, overlays, and `/m` pages all consume. Rename is a later mechanical pass once the kernel has one caller.

### 1.2 Dual entry (non-negotiable product shape)

Two honest ways work starts. They must share one identification result.

| Entry | Session kind | Example | Must produce |
|---|---|---|---|
| **Scan-armed** | `kind: 'scan'` + a job type | Wedge/camera fires a tracking barcode at scan-out | IdentificationResult → JobFace |
| **List-claim** (no scan) | `kind: 'task'` | Role=picker, morning pick list, tap an order | **Same** IdentificationResult → JobFace (source=`claim`) |

If Gemini proposes a scan-only kernel, it has failed the brief. If it proposes a list-only WMS, it has also failed.

### 1.3 Per-ID display (the north-star UX)

After identification, the operator sees **one ID’s triage face**: identity, state, blockers, **one terminal verb**, optional secondary verbs. Not a spreadsheet. Not a second mouth. Not a cheat sheet.

This must be **mobile-first**. Desk overlay is the same view-model at floor density, not a fork.

---

## 2. What is already built (verified 2026-09-10)

### 2.1 Scan-out API — **already ported to prod** (do not re-port)

`src/app/api/shipped/scan-out/route.ts`

| Verb | Behavior |
|---|---|
| **POST** | Resolve tracking → order; block `canceled`/`cancelled` (`blocked: true`, no SHIP_CONFIRM); bounded `createdAt` (5 min future skew, 24h back); Zoho-first `imageUrl`; `receivingId` |
| **GET** | History `scope=mine\|all`; UTC `Z` stamps; 503 on query fail |
| **DELETE** | Own scans only; 120 min window; audit **before** delete (`shipment.scan_out.undo`) |

Clients already distinguish cancelled vs shipped (`blk` on focus status; danger tokens). This is the **first job** the kernel should wrap — not a new HTTP surface.

### 2.2 Universal resolver (routing, not receiving)

`GET|POST /api/scan/resolve` (`src/app/api/scan/resolve/route.ts`)

- Cascade: printed handles via `routeScan` (`barcode-routing.ts`) → GS1 → classify (tracking / FNSKU / serial) → unknown.
- Writes **`mobile_scan_events` telemetry only**. Explicit: **never writes `receiving_*`**.
- Returns `kind`, order match outcome (`single|multi|none`), `mobileRoute`.

This is a **classifier + navigator**. It is **not** yet a JobFace. P0 must not collapse resolve into receiving intake.

### 2.3 Printed-ID mobile pages (per-entity, already)

| Route | Entity | Notes |
|---|---|---|
| `/m/u/[id]` | serial unit | Pair with order / move to location; uses last scan from `mobile.scan.recent` |
| `/m/h/[id]` | handling unit (LPN) | Whole-box work without re-scanning each unit |
| `/m/r/[id]`, `/m/rs/[id]` | receiving carton | |
| `/m/b/[barcode]` | legacy bin | Redirects to `/inventory?bin=` |
| `/m/pick`, `/m/pick/[orderId]` | picker | Scan-gate in `useMobilePicker.ts` validates unit/bin/sku |
| `/m/work` | assigned orders list | All / Assigned / Unassigned — **list-claim precursor** |
| `/m/scan` | universal scan entry | Uses resolve → `mobileRoute` |
| `/m/identify` | photo identify | Receiving/pickup; not scan-out |

These pages are **forked UX**, not one IdentificationFace. That fork is the debt P0 starts to close **for one job only**.

### 2.4 Sessions (the real discriminator)

`src/lib/sessions/types.ts`

- `kind: 'scan'` → `scanType` in `{ unbox, triage, pickup, test, pack, outbound }`. **Exactly one armed** per org.
- `kind: 'task'` → no scanType. N open.
- Title is data, never an enum. Reporting must not GROUP BY title.

Closed scan types today are **surface names**. The kernel must introduce a **job id** that can outlive those names (D3).

### 2.5 Surface registry (launch catalog, not the kernel)

`SURFACE_REGISTRY` still declares `archetype: 'station' | 'workbench' | …`. `outbound` is `station` with **`scan: null`** (known tension: declared station, no classifier). Support was corrected to workbench. Overlay cohort (`SCAN_STATION_OVERLAY_COHORT`) lists unbox, triage, pack, test, shipping, scan-out workspaces. **Do not delete overlay `visibility` / `zIndex.panel`.**

### 2.6 Automations today (too narrow for custom scan IDs)

`src/lib/schemas/automations.ts`

Triggers: `order.imported`, `order.item_number_set`, `unit.test_passed`.  
Action: `assign_work` with `work_type` `TEST` | `PACK` only.

There is **no** `scan.resolved` trigger, **no** face composer, **no** tenant-defined barcode grammar. Studio/automations marketplace exists on main as a shell. AI-custom scan IDs are **compiled config**, not chat at the bench.

### 2.7 Scan subject (one-slot noun memory)

`scan-subject-store.ts`: kind `'unit'` only, 120s TTL, consumed by command stickers. Foundation must generalize **subject kind** (order, tracking, HU, location) without making TTL infinite.

### 2.8 Prior rulings to inherit, not redo

| Brief | Ruling to keep |
|---|---|
| Scan vs desk right rail | **C2 thin waist** — two hosts; share tokens/dumb chrome, not one `mode=` mega-host |
| Inverted station outbound | Ingestion loop is strong; **consumption** (pick a row → emit artifact) is the other direction |
| Studio scan-station templates | LLM must pass same Zod/diagnostics as humans; not a general no-code app builder |
| Warehouse OS data model | Polymorphism on **`ops_events`**, not on `work_sessions` |

---

## 3. Target architecture (proposal for Gemini to **adjudicate**, not rubber-stamp)

### 3.1 Three layers (thin waist)

```
┌─────────────────────────────────────────────────────────────┐
│  Presentation (dumb)                                         │
│  /m/id/{job}/{ref}   ·  desk overlay face  ·  (later) print  │
│  Same JobFace view-model. No domain writes.                  │
├─────────────────────────────────────────────────────────────┤
│  Identification Kernel (the foundation)                      │
│  classify → resolve → authorize → face → act                 │
│  IdentificationResult is the SoT. Idempotent. Org-scoped.    │
├─────────────────────────────────────────────────────────────┤
│  Domain writers (existing)                                   │
│  POST /api/shipped/scan-out  ·  pack  ·  receiving  ·  pick  │
│  Kernel never reimplements SHIP_CONFIRM. It calls them.      │
└─────────────────────────────────────────────────────────────┘
```

**Desk vocabulary (product copy):** Identification Desk, job, face, claim, armed scan.  
**Code names (P0):** keep `StationComposerHost` / overlay cohort file names until a dedicated rename PR. Gemini should rule **product vs identifier** (D2).

### 3.2 IdentificationResult (draft type — Gemini may refine fields, not delete invariants)

```ts
type IdentificationSource = 'scan' | 'claim' | 'print_handle' | 'deep_link';

type IdentificationResult = {
  organizationId: string;
  clientEventId: string;          // idempotency; retries are no-ops
  source: IdentificationSource;
  raw?: string;                   // omitted on claim
  classifiedAs: string;           // tracking | gs1_unit | order_id | …
  entity: { type: string; id: string };
  job: string;                    // e.g. 'scan_out' — NOT a surface key forever
  blocked: boolean;
  blockReason?: string;           // e.g. canceled
  face: JobFace;
};

type JobFace = {
  title: string;
  subtitle?: string;
  imageUrl: string | null;
  state: 'ready' | 'blocked' | 'done' | 'ambiguous';
  facts: Array<{ label: string; value: string }>;
  primary: { verb: string; href?: string; mutate?: string }; // one terminal verb
  secondary: Array<{ verb: string; href?: string }>;
};
```

Invariants:

1. **Org-scoped.** No cross-tenant resolve.
2. **Idempotent** on `clientEventId` (+ org).
3. **Blocked ≠ success.** Cancelled scan-out is a face, not SHIP_CONFIRM.
4. **Ambiguous** (`multi` match) is a face with **pick**, not a silent first-hit.
5. **Claim and scan** produce the same `entity` + `job` when the operator is doing the same work.
6. **Kernel does not write receiving** for scan-out (resolve law).
7. **One armed scan job** app-wide still holds; claiming a pick list does not arm scan-out.

### 3.3 Why scan-out is P0 (the only first brick)

| Criterion | Scan-out |
|---|---|
| Writer exists and is production-shaped | Yes (POST/GET/DELETE, undo, block) |
| Classifier is narrow | Tracking → order |
| Terminal verb is one | Ship confirm |
| Mobile list precursor | GET history + `/m/work` |
| Does not require photo capture / kit BOM / receiving lines | Yes |
| Overlay cohort member | Yes — keep shell law |

**Not P0:** picker morning list as a new product (it is P1 **on the same kernel**). **Not P0:** AI-generated barcode grammars. **Not P0:** renaming `SCAN_STATION_OVERLAY_COHORT`.

### 3.4 Picker morning list (P1, specified now so P0 stays compatible)

Role=picker: `task` session; queue from assignment rules (today: automations `assign_work` TEST|PACK only — **gap**). Tapping a row = `source: 'claim'` with `job: 'pick'` and the same face contract. Scan-gate in `useMobilePicker` becomes **optional confirmation**, not the only door.

---

## 4. Gap map (honest)

| Capability | Today | Gap |
|---|---|---|
| Scan-out mutate | Strong | No shared JobFace type; UI is scan-out-specific |
| Universal resolve | Strong router | No job, no blocked face, no claim source |
| Per-ID mobile | Many `/m/{letter}/[id]` pages | Forked; no `/m/id/{job}/{ref}` |
| Role queues | `/m/work`, `/m/pick` | Not the same face; automations can’t assign PICK |
| Tenant barcode grammar | Printed handles + GS1 + classify | Not data; not AI-authored |
| Studio templates | Half-built vision (prior brief) | Must compile to kernel, not emit React |
| Copy: station vs desk | Mixed | Product glossary not enforced |
| Overlay vs inspector | C2 | Do not unify hosts while building kernel |

---

## 5. House laws (design inside these, or explicitly replace one)

1. Four region contracts remain. “Desk” is **product vocabulary**, not a fifth archetype unless D1 picks a rename of `station` → `floor_loop` in code.
2. Exactly one armed **scan** session per org.
3. Overlay cohort: never delete `visibility` / `zIndex.panel` to silence critique.
4. Slot-table funnel: do not fold Queue/Viewed/History into the filter funnel. Identification is **not** the table engine.
5. Filter icon is `DataTableFilterMenu`, always mounted. Forbidden: `FilterRefinementBar`, hunt tiles.
6. Dumb gun desks: `StationComposerHost` + `showModeFaces={false}` (keep context ring). Do not invent a second mouth.
7. Ship-by in cells: `DateRangePickerField variant="compact"` (out of scope for this kernel).
8. Tenancy: every resolve/act is `organization_id` scoped.
9. AI config: same Zod as human authors.
10. Lighthouse floors ratchet **up**, never down.

---

## 6. Industry questions (Gemini must answer with named systems)

Cover at least:

- SAP EWM RF vs Fiori desktop (device profiles, shared logic)
- Manhattan / Blue Yonder / Körber operator UX notes (where public)
- ShipHero / ShipStation / Extensiv pack vs admin
- Amazon AFE / warehouse “eaches” vs problem-solve (public engineering blogs)
- Tulip / Tulip players vs Retool (composable ops UIs — **warn** against general no-code)
- n8n / Temporal / Salesforce Flow for **compiled** automations vs runtime LLM
- Scandit / Socket Mobile scan UX latency budgets
- Progressive Web App warehouse apps (2024–2026) vs native RF
- GS1 Digital Link as **identity**, not as a page framework

Questions:

1. What is the dominant 2026 pattern for **scan vs claim** sharing one work object?
2. Where do tenants customize “what a barcode means” — data tables, Groovy/ABAP, or visual builders? What fails in SaaS multi-tenant?
3. What is a safe latency budget for classify+resolve on a phone (p95)?
4. How do best-in-class products show **blocked** identification (cancelled, already shipped) without toast-only UX?
5. When should a morning list **not** require a scan (loss-prevention vs throughput)?

---

## 7. Forced rulings (Gemini: one pick each)

**D1.** Product noun for Q1 scanner-driven regions:  
(A) keep code `station`, copy `desk`  
(B) rename archetype id to `identification_loop` in one PR with kernel  
(C) drop Q1; everything is workbench  

**D2.** File/module `src/lib/stations/` in P0:  
(A) freeze; new code in `src/lib/identification/`  
(B) move overlay cohort into identification now  
(C) alias-only re-exports  

**D3.** `job` id namespace:  
(A) reuse `SCAN_SESSION_TYPES`  
(B) new closed enum `identification_jobs` starting `{ scan_out }`  
(C) free-string tenant jobs from day one  

**D4.** P0 HTTP:  
(A) wrap scan-out only with a typed `IdentificationResult` in TS + one GET face endpoint  
(B) new `/api/identification/resolve` that calls scan-out + scan/resolve  
(C) only a client adapter, no new route  

**D5.** Ambiguous matches:  
(A) JobFace `state: 'ambiguous'` + picker  
(B) 409 JSON only  
(C) first hit wins  

**D6.** Morning pick list:  
(A) P1 on same face contract; P0 only scan-out scan+history claim  
(B) P0 includes picker list  
(C) picker stays scan-gated forever  

**D7.** AI custom scan IDs:  
(A) Studio compiles barcode grammar + face mapping to Zod; runtime is deterministic  
(B) LLM classifies each scan  
(C) per-tenant forked Next pages  

**D8.** Automations trigger to add first (not in P0 unless trivial):  
(A) `identification.completed`  
(B) `scan_out.confirmed` only  
(C) none until P2  

**D9.** Mobile URL:  
(A) `/m/id/scan-out/{orderId}` consuming JobFace  
(B) reuse `/m/work` + overlay only  
(C) new `/m/scan-out` page forked from desktop  

**D10.** Overlay host vs `/m` page:  
(A) one view-model component, two mounts  
(B) duplicate faces  
(C) mobile-only until desk dies  

**D11.** Scan subject store:  
(A) generalize kinds in P1  
(B) P0 extend to `order`  
(C) leave unit-only  

**D12.** Success metric for P0:  
(A) cancelled tracking shows blocked face on phone **and** desk overlay from the same type  
(B) 100% station string purge  
(C) AI-generated ID live on dogfood  

---

## 8. Foundation contract (implementing agents)

An agent may only land P0 if all of these are true:

1. `IdentificationResult` / `JobFace` live in a **dependency-free** module (same altitude as `sessions/types.ts`) — no `@/lib/db`.
2. Scan-out POST remains the **writer**. Kernel maps response → face. No second SHIP_CONFIRM.
3. GET history can open the **same** face (`source: 'claim'`).
4. Tests: cancelled → `blocked`; undo window unchanged; tenancy on every query.
5. No paint rewrite of Pack/Unbox. No overlay visibility deletion.
6. Fast eval green. Slot-table cohort not required unless table files change.
7. `eval:station scan-out` if overlay workspace is touched.

---

## 9. Brick plan (default; Gemini may tighten P0, not expand it)

| Phase | Brick | In | Out |
|---|---|---|---|
| **P0** | Kernel types + scan-out face adapter + one `/m/id/scan-out/[orderId]` (or D9 pick) + history claim | Types, map from existing API, tests, one mobile face | Rename station, picker list, AI, automations triggers, new overlay host |
| **P1** | Picker list-claim on same face; `assign_work` grows `PICK` or a dedicated rule | `/m/pick` consumes JobFace | Custom barcodes |
| **P2** | `identification.completed` automation; subject store kinds | Observability, assign | LLM |
| **P3** | Tenant barcode grammar table (printed prefix → job) authored in Studio, Zod-validated | Custom IDs **without** AI | Runtime LLM |
| **P4** | AI **author** (describe grammar → draft config → human publish) | Copilot for P3 | Hot-path LLM |
| **Later** | Mechanical desk-copy pass; overlay cohort rename; remaining jobs (unbox, pack, test) one job per PR | Vocabulary | Big-bang rewrite |

**Most reliable foundation:** P0 kernel **types + one job adapter**, because every later brick is a new `job` + writer map. Custom AI IDs are **P3–P4 data** on that enum/table, not a parallel app.

---

## 10. Risks Gemini must price

- Renaming `station` in eval/graph/MCP before the kernel exists → months of red gates, zero product.
- Putting LLM on classify → p95 latency and tenant-unsafe hallucination (wrong order shipped).
- Unifying overlay + inspector hosts while adding JobFace → mode errors on the floor.
- Expanding automations `assign_work` without tenancy tests.
- Treating `/api/scan/resolve` as a writer.

---

## 11. Suggested P0 prompt (≤40 lines; Gemini may replace)

```
Implement Identification Kernel P0 for Cycle Forge (prod lane).

Add src/lib/identification/types.ts (IdentificationResult, JobFace) — no db imports.
Add src/lib/identification/scan-out-face.ts mapping scan-out POST/GET JSON → JobFace.
Do not change SHIP_CONFIRM behavior. Cancelled remains blocked face.
Mount one mobile page that renders JobFace for scan-out (no new visual language;
design-mcp contract/tokens/critique before any tsx). Dual entry: scan result and
history row claim share the mapper.
Tests: blocked cancelled; idempotency field present; mapper pure.
Do not rename station modules. Do not touch overlay visibility/zIndex.
Do not fold table funnels. Do not add FilterRefinementBar.
Run cursor-eval --fast. If overlay workspace changes: pnpm run eval:station scan-out.
```

---

## 12. Open product questions (Gemini may recommend; engineering will decide)

- Is “desk” confusing when Shipped is already a desk (archive) and identification is a floor loop?
- Should `job` be org-extensible in P3 or stay closed until 5 first-party jobs exist?
- Does print-handle (`/m/u/123`) skip classify and go straight to `entity` (yes — recommend confirm)?
