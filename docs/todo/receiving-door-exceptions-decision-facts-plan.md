# Receiving door exceptions → decision facts + placement policy (plan)

Status: **spec** (not yet built). Owner: receiving + unified-engine.
Related: `docs/operations-studio/UNIFIED-ENGINE-MASTER-PLAN.md` (Track 1 decision/placement),
`docs/receiving-triage-redesign-plan.md`, `.claude/rules/backend-patterns.md` (decision/placement).

## 1. The finding (from the door-scan interview)

Triage receiving is the **door scan / first-eyes** station, not a multi-step wizard. Per the operator:

- Orders **auto-pair**; classification is **auto-set**; "ready" is just the **consequence** of placement.
  → Of the old `Classify → Stage → Pair → Ready` stepper, **only placement actually varies.**
- The signals that matter first — **high-value** and **needed-for-a-special-order** — are **not in the
  backend at all** today. There is "currently no way to display something like this."
- Placement should be captured by a **location-barcode scan OR big mobile-friendly location buttons**;
  the priority *lane* should **auto-derive** from the exception, not be hand-picked per carton.

In WMS terms this is a **dock receipt + directed putaway**: receive → flag exceptions → direct to a
location → confirm placement. A per-carton progress stepper is the wrong primitive. The door screen has
exactly **one required capture** (putaway location) and **a couple of exception flags**.

## 2. Why the engine, not more house rules

We already have the WMS-native substrate — it's just not wired to receiving:

- `src/lib/workflow/decision-eval.ts` (+ `decision-eval-zen.ts`) — the **rule-table evaluator**
  (`facts → thenPort + optional DecisionPlacement`). Operator-editable, first-match-wins.
- `src/lib/workflow/placement-policy.ts` — resolves putaway **from the org's Studio-authored `decision`
  nodes** ("config, not code — edit a decision node in /studio, routing changes with no deploy").
- `src/lib/workflow/placement.ts` — resolves a symbolic placement → a concrete `locations` bin,
  **degrade-not-throw**.
- `src/lib/workflow/nodes/receiving.node.ts` — the receiving step is already a graph node.

Bolting "high value → cage lane" into `triage-lane-policy.ts` / overloading `priority_tier` fuses a
**fact** with a **policy** — the #1 WMS modeling smell, and one-global-default in a multi-tenant product.
The durable move keeps the four WMS layers separated: **attributes (facts) → rules engine → directed
task → event ledger**. We have layers 2–4; the work is feeding layer 1 real facts.

## 3. Governance: build the SoT, then promote to a house rule

Per `AGENTS.md → Never`: *"Encode a net-new architecture only in prose before it exists in code — build
the better SoT, then document it."* So the house-rule edits in §7 **land in the implementation PR with
the code**, not ahead of it. This plan doc is the spec; it is not the law until §5 ships.

## 4. Architecture

```
receiving row / scan-resolve
        │
        ▼
deriveReceivingExceptionFacts(row, deps)   ← NEW pure SoT (src/lib/receiving/exception-facts.ts)
        │   { valueBand, demand, intakeKind, unfound }
        ├───────────────► receivingExceptionPresentation(facts)  ← NEW presentation SoT (banner: label+tone+icon)
        │
        ▼
DecisionFacts (extended)  ──►  resolveDecision (org's receiving `decision` node rules)
        │                             │  thenPort + DecisionPlacement { placement, category, ... }
        ▼                             ▼
   (routing)                   resolvePlacementBin → { binId, binName }   (directed location)
                                      │
                                      ▼
                     door screen: [exception banner] + directed location + confirm/override placement
                                      │ operator scans a location barcode OR taps a big location button
                                      ▼
                     applyTransition({ binId, clientEventId })   ← stamps bin_id on inventory_event (ledger)
```

The banner reads **facts** (the SoT); the directed lane/zone reads the **engine**. Both share the same
fact source, exactly like `triage-focus.ts`'s "single source for each per-step predicate."

## 5. Code spec

### 5.1 Extend the decision fact vocabulary (`decision-eval.ts`)

Additive-only — every field optional, so existing route-only rules stay byte-identical.

```ts
export interface DecisionFacts {
  grade?: unknown;
  channel?: unknown;
  disposition?: unknown;
  // NEW — receiving/inbound facts:
  valueBand?: unknown;   // 'high' | 'standard'  (pre-bucketed; see §8 ZEN caveat)
  demand?: unknown;      // 'special_order' | 'backorder' | 'none'
  intakeKind?: unknown;  // 'po' | 'return' | 'repair' | 'trade_in'
  unfound?: unknown;     // 'unfound' | 'matched'
}
// DecisionRule.when gains the same optional keys; keep WHEN_KEYS (decision-eval-zen.ts) in sync.
```

### 5.2 The pure exception-facts SoT (NEW `src/lib/receiving/exception-facts.ts`)

Mirrors `triage-focus.ts`: pure, DB-free predicates + a `Deps`-injected async provider for the facts
that need a DB touch. One module both the engine facts **and** the display presentation read.

```ts
export interface ReceivingExceptionFacts {
  valueBand: 'high' | 'standard';
  demand: 'special_order' | 'backorder' | 'none';
  intakeKind: 'po' | 'return' | 'repair' | 'trade_in';
  unfound: boolean;
}

// Pure — from row + resolved threshold:
export function bucketValueBand(unitPrice: number | null, thresholdCents: number): 'high' | 'standard';

// Deps-injected — `demand` needs an open-order lookup:
export interface ExceptionFactDeps {
  highValueThresholdCents: (orgId: OrgId) => Promise<number>;   // org setting (Settings Registry)
  openDemandFor: (orgId: OrgId, skuOrSerial: string) => Promise<'special_order' | 'backorder' | 'none'>;
}
export async function deriveReceivingExceptionFacts(
  row: ReceivingLineRow, orgId: OrgId, deps = defaultDeps,
): Promise<ReceivingExceptionFacts>;

// Adapter → engine facts (so the decision node and the banner never disagree):
export function toDecisionFacts(f: ReceivingExceptionFacts): Pick<DecisionFacts,
  'valueBand' | 'demand' | 'intakeKind' | 'unfound'>;
```

- `valueBand` = `bucketValueBand(unit_price, threshold)`; threshold is an **org setting**, not a hardcode.
- `demand` = open-order lookup for the resolved SKU/serial (cross-dock demand check).
- `intakeKind` / `unfound` reuse the existing `triage-intake-kind.ts` / `pairing_state` predicates.

### 5.3 Presentation SoT for the banner (facts → chrome)

A small map like `condition-tone.ts` / `workflowStageDot` — **no per-view invention**:

```ts
// facts → the loudest thing on the door screen (ordered by severity)
export function receivingExceptionBanner(f: ReceivingExceptionFacts):
  | { key: 'high_value'; label: 'High value'; tone: 'danger'; icon: 'ShieldAlert' }
  | { key: 'special_order'; label: `Special order`; tone: 'accent'; icon: 'Star'; orderRef?: string }
  | { key: 'unfound'; label: 'Unfound'; tone: 'warning'; icon: 'HelpCircle' }
  | null;   // null → no banner; the carton is ordinary
```

Tones from semantic tokens + the lifecycle registry; the banner is `Panel`-composed, never a hand-rolled shell.

### 5.4 Seed a receiving `decision` node in the template graph

Add one `decision` node to the seed workflow definition (installed via `installTemplateIntoOrg`) whose
rules map facts → placement directive. Authored/editable in `/studio` `DecisionRulesEditor`. Example rows:

| when | thenPort | then.placement | then.category |
|---|---|---|---|
| `valueBand=high` | `secure` | `SECURE-CAGE` | `high-value` |
| `demand=special_order` | `crossdock` | `CROSSDOCK-A` | `special-order` |
| `unfound=unfound` | `unfound` | `UNFOUND-STAGE` | `unfound` |
| (default) | `stage` | — | — |

`placement-policy.ts` already unions every org `decision` node and first-match-wins resolves the
directive; a tenant that authors nothing keeps today's default (route-only) behavior.

### 5.5 Display: retire the stepper, add the door surface

- **Delete** `TriageProgressStepper` from the triage band (`ReceivingLineWorkspace.tsx`). Keep the
  `triage_complete` completion machinery (`markTriageCompleted` etc.) — it drives `TriagePanel` + rail refresh.
- **Add** the door surface in the band's place:
  1. **Exception banner** (`receivingExceptionBanner`) — top, loudest, tone-coded; `null` → nothing.
  2. **Directed location** — the engine-resolved bin/lane as the suggested target.
  3. **Placement capture** — a **location-barcode scan** (Station scan classifier already exists) **OR**
     a **big-button location grid** (mobile-friendly, `size="touch"`), no manual lane pick.
  4. **Placed state** — `Placed · {binName}` replaces "Ready."
- Unfound cartons route to the existing **unfound list** surface — not a per-carton dot.

### 5.6 Backend wiring

Scan-resolve handler (door scan) calls `deriveReceivingExceptionFacts` → `resolveDecision` (via
placement-policy) → returns `{ banner facts, directedBin }` onto the resolved row. Placement confirm
goes through `applyTransition({ binId, clientEventId })` (ledger stamp + idempotency), degrade-not-fail
if the bin symbol is unseeded (`placement.ts` already returns a miss, never throws).

## 6. Non-goals

- No native GoRules JDM engine (stays expression-only WASM — see §8).
- No new priority mechanism — `priority_tier`/`is_priority` stay; the decision node *reads* facts and
  *emits* the lane, instead of us bolting value semantics onto the tier int.
- No removal of the exact fast-paths, the unfound queue, or `triage_complete`.

## 7. House-rule delta (apply IN the implementation PR, per §3)

1. **`source-of-truth.md` + `AGENTS.md` SoT table** — add a row:
   `Receiving / inbound exception facts → src/lib/receiving/exception-facts.ts (feeds decision-eval facts + banner presentation)`.
2. **`.claude/rules/backend-patterns.md`** — extend the decision/placement section with the **decision-fact
   contract**: *"A new domain signal that should drive routing/placement becomes (a) an optional `DecisionFacts`
   key + a pure fact-provider SoT, and (b) rules in the org's `decision` node — never a per-view derived
   boolean, never new semantics crammed onto `priority_tier`. The banner/display reads the fact SoT; the
   lane/zone reads `placement-policy`."*
3. **`.claude/rules/display/station.md`** — one line under the door/first-eyes note: the triage door band is
   `[exception banner] → directed location → placement capture (scan or big buttons) → Placed`, **not** a
   progress stepper (the unbox `ReceivingProgressStepper` stays the unbox surface).

## 8. Caveats / sequencing (strangler, not big-bang)

- **ZEN is expression-only in this build** (equality matches; no `>=` in the table). So `unit_price ≥
  threshold` is **pre-bucketed** into a `valueBand` fact upstream — never a range predicate in the rule.
- **Threshold is org config** (Settings Registry), not a constant — value bands are tenant-specific.
- **Flag-gated rollout**, in order, so nothing regresses:
  1. Ship `exception-facts.ts` + `receivingExceptionBanner`; render the **banner only** (facts sourced,
     stepper still present) behind a flag.
  2. Swap the stepper → the door surface; keep the default placement policy (route-only) so lane behavior
     is unchanged until a tenant authors rules.
  3. Seed the receiving `decision` node in the template; `placement-policy` owns the directed lane/zone.
  4. Retire `triage-lane-policy.ts` hardcodes + any `priority_tier`-bolting into decision-table rows.
- **Fact-sourcing is the real work**, not the engine — `openDemandFor` (cross-dock demand) and the
  threshold setting are the build; the evaluator + placement resolver already exist and are tested.
