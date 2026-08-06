# Research briefing — AI-first, template-driven scan stations + Studio authoring (premium SaaS)

**For:** Gemini 2.5 Pro (deep research / architecture adjudication)
**From:** Cycle Forge engineering
**Date:** 2026-08-05
**Repo:** `cycleforge-app` (Next.js App Router · React 19 · Tailwind v4 · Postgres/Neon · TanStack Query)
**Lane:** dogfood `main` — dev server is operator-owned on `:3050`; research only, no server access assumed

> **You do NOT have the codebase.** Every path, table, component API, and measured behavior in this document is embedded. **Do not invent file paths.** Do not claim to have inspected source. If something is marked **(inferred — verify)**, treat it as a hypothesis.

> **What we want back is a RULING plus paste-ready plan text, not a mood board.** Where this brief poses a question, answer with a decision that forecloses the alternative. Where it states a house law, design inside it — or argue explicitly that the law is wrong and say what replaces it. **"It depends" is not an answer we can build from.**

**Deliverable:**
1. A 2024–2026 industry survey of the closest comparable systems (workflow/automation builders, WMS/MES station configuration, no-code app platforms, AI app builders) with named products + citations (§6).
2. **Forced rulings on D1–D14** (§7) — one pick each, no hedging.
3. A filled **premium-SaaS readiness scorecard** with pass thresholds (§8).
4. A **paste-ready phased build plan** (P0–P4, §10) an implementing agent can execute against the embedded gap map without opening the repo, plus a ≤40-line Claude Code P0 prompt.

**Subject:** How to make **scan-station templates + the Studio authoring surface** industry-standard, best-in-class, premium-feeling, and **AI-first** — so any tenant (a solo Amazon/eBay reseller *or* a larger warehouse) can describe their business, get a working operation of scan stations + a workflow graph generated for them, pull from a template gallery, or author their own — and track work / units-per-minute / KPI on premium displays.

**This brief is NOT:** a greenfield design. A large fraction of the machinery already exists and is embedded in §3. This is a **"productize + AI-first + premium-ize a half-built vision"** brief. It is also NOT: a second visual language, a chat-bubble primary surface, sci-fi HUD cosplay, or "rebuild Studio from scratch."

---

## 0. How to use this brief

### 0.1 Three deliverables (keep separate)

1. **Industry standard (2026)** for the four capabilities in §2. Name real systems (n8n, Zapier, Temporal, Retool, Tulip, Make, Zavanta, Salesforce Flow, Vercel v0, Lovable, etc.); cite 2024–2026 sources.
2. **What is right for Cycle Forge.** Reconcile every recommendation against the embedded house laws (§5) and the built-vs-gap map (§3–§4). Do not propose anything that fights the region-contract model or the Kinetic Ledger identity.
3. **A phased build plan.** Ship paste-ready P0–P4 text (§10) mapped to the embedded gaps. An implementing agent must be able to start P0 **without opening the repo**.

### 0.2 Non-goals (DO NOT PROPOSE)

- A second design language beside Kinetic Ledger semantic tokens; a fourth typography slot.
- Chat bubbles as the primary ops surface; an "AI copilot chat" bolted onto Studio as the *only* AI surface.
- A general-purpose no-code app builder. This is a **domain-specific** ops builder (used-goods reseller lifecycle, §1.4).
- Replacing the executable workflow engine or the region-contract archetypes.
- LLM-generated config that bypasses the same Zod/diagnostic validation a human author is held to.
- Raising any Design-System ratchet baseline to pass a guard.

### 0.3 Paste prompt (give this entire file to Gemini)

```
Read the embedded briefing end-to-end: studio-scan-station-templates-AI-first-GEMINI-RESEARCH-BRIEFING.md.

You do not have the codebase. Use ONLY facts embedded in the brief.

Deliver:
1. Industry survey (§6 asks) with named systems + citations (2024–2026).
2. Forced rulings on D1–D14 (§7) — one pick each, no "it depends."
3. Filled premium-SaaS readiness scorecard (§8) for today vs target.
4. Paste-ready phased P0–P4 plan (§10) mapped to the embedded gap map (§4), plus the §10 Claude Code P0 prompt (you may refine P0 scope only).

Reconcile with embedded house laws (§5). Where industry conflicts, pick a side for Cycle Forge and defend it.
Do not invent file paths not listed in §3.
```

---

## 1. Product context (embedded — do not re-derive)

**Cycle Forge** — multi-tenant **reseller-operations SaaS** sold B2B. The unit of value is the **scan station**: a focus-locked bench where an operator scans a barcode/serial and the screen tells them what is true and what to do next. Lifecycle: receive → unbox → triage → test → grade → repair → catalog/list → pack → ship → returns/warranty.

**Target customers span a wide range** — the same product must serve:
- A **solo seller** starting on Amazon/eBay who wants "simple scan stations to track work" out of the box.
- A **larger warehouse** (10–50 staff) that wants custom flows, per-staff stations, and throughput/KPI instrumentation.

**USAV** (Bose audio reseller, ~1–15 person warehouse) is the **dogfood tenant only** — answer for sellable SaaS, not an internal tool.

**Vendor integrations** (Zoho, Zendesk, Ecwid, eBay, Amazon, UPS, …) are **tenant connectors behind capability facades**. Operator copy uses capability nouns or runtime provider labels — never hardcoded vendor product sentences.

### 1.1 Physical bench reality

| Fact | Value |
|---|---|
| Primary desktop | 1080p–1920p landscape at a standing bench |
| Viewing distance | ~3 ft (≈1 m) |
| Posture | Hands on product + scanner/camera |
| Primary input | Barcode wedge / handheld scanner / phone camera |
| Session | Minutes, high repetition, throughput-sensitive |
| Author persona | The **owner** (non-technical) configures in Studio on a laptop; operators run the bench |

### 1.2 Region contracts (binding architecture vocabulary)

Every UI region is exactly **one** of four contracts. This is not a layout skin — it is an I/O + persistence contract.

| Contract | Driven by | Job | Selection | Density |
|---|---|---|---|---|
| **Station** | barcode / wedge / camera | act-and-clear | ephemeral, not URL | `floor` |
| **Workbench** | pointer (mouse) | pick record → edit → persist | durable, URL-addressable | `ops` |
| **Monitor** | filters over a stream | observe only | none | `rollup` |
| **Canvas** | pan / zoom / focus | reshape a definition (draft→publish) | durable focus in URL | `studio` |

**Studio is a Canvas.** A scan station is a **Station**. The template gallery and node config are **Workbench**. A KPI/throughput wall is a **Monitor**. The AI authoring loop must respect which contract it is writing into.

### 1.3 Kinetic Ledger — binding UI identity (embedded core)

> Cycle Forge UI is **Kinetic Ledger**: data-first reseller ops — dense, state-colored, scan-aware, multi-tenant. **Legible throughput over document calm**; calm chrome (Linear discipline). Industry blend: **ops density (Carbon / Stripe Dashboard) + Linear chrome + POS/scan floors + Studio canvas.**

On a scan bench the identity has a sub-name: the **instrument panel** — chrome that reads live evidence-derived facts back to an operator whose hands are on product (bare progress ring, mono identifiers, derived-procedure step states, headers that *label* rather than *narrate*). Premium here means *legible telemetry*, not decoration.

### 1.4 The domain model any template/graph must speak (embedded from the `reseller-flow` skill)

The canonical unit lifecycle (`src/lib/receiving/workflow-stages.ts` — the numbered-state SoT):

```
① EXPECTED → ② ARRIVED → ③ MATCHED → ④ UNBOXED → ⑤ AWAITING_TEST → ⑥ IN_TEST
   → ⑦ PASSED ──────────▶ (listing/fulfillment) → ⑨ DONE
   → ⑦ FAILED ─▶ disposition routing: ⑧ RTV | ⑧ SCRAP | rework → ⑤
```

Three **orthogonal** axes are NOT stages (never conflate with graph position): **Condition** grade (`conditions.ts`), **Disposition** (ACCEPT/HOLD/RTV/SCRAP/REWORK), **Priority** (`priority_tier`). A graph models *position*; condition/disposition are produced AT nodes and consumed BY edges.

**Invariants a valid reseller graph must satisfy** (the diagnostics engine enforces these — any AI generation must satisfy them too):
1. Everything serialized flows; nothing teleports (no edge skips inspection except an *explicit* BRAND_NEW bypass edge).
2. Every FAILED has a routed exit (dangling fail port = publish-blocking diagnostic).
3. Returns re-enter as intake, not a side table.
4. Channel listing nodes are interchangeable behind one `listed`/`error` port contract.
5. The SKU string is never a cross-system join key.
6. Identity travels with the unit; evidence anchors on `receiving_line_id`.

**Canonical seed templates** (data, importable subgraphs): standard refurb-and-list; test-only consignment; returns triage; FBA prep lane. *"Templates are data. A tenant customizes by rewiring in the Studio."*

### 1.5 Per-staff station slicing (small-team reality)

Small resellers run 1–5 people wearing partial hats. Each station maps to a **permission cluster** (Door/Receiver · Unboxer · Tech · Lister · Packer/Shipper · Owner). A staffer's daily view = the stations they are permitted. The Studio People lens must show full coverage — every node reachable by ≥1 active staff member, or it is a `coverage-gap` diagnostic.

---

## 2. The ask, decomposed into four capability pillars

The user's goal — *"create scan stations with templates; anyone can upload/start their own; add stations per staff; custom flow via Studio; AI-first; premium best-in-class displays; track units/min + KPI"* — decomposes into four capabilities. The whole brief is organized around these.

| Pillar | One-line | Region contract | Built? |
|---|---|---|---|
| **A. Template lifecycle** | Discover → install → author → submit/share → version a template (workflow graph + station compositions + KPIs) | Workbench | Partial (graph yes, stations no) |
| **B. Studio authoring** | A non-technical owner builds/edits/upgrades the operation graph + its stations, self-serve, premium | Canvas | Partial (editing yes, AI/premium no) |
| **C. Scan stations** | Data-driven, per-tenant/per-staff, premium instrument-panel stations that a template can carry | Station | Partial (registry code-locked; premium content code-only) |
| **D. AI-first + displays/KPI** | Describe-your-business → generated ops; AI authoring assist; premium displays with units/min + KPI | Canvas + Monitor | Mostly gap (AI static; KPI thin) |

---

## 3. What is already BUILT (embedded current-state map — do not re-derive)

> This is the single most important section for you to internalize. **Cycle Forge is NOT greenfield here.** Design *forward from* this, and do not re-propose things that exist.

**The load-bearing truth (read this first).** Cycle Forge already has: (a) a **single template clone path** (`installTemplateIntoOrg`); (b) an **executable, versioned, per-org workflow graph** with draft/publish + a diagnostics linter; (c) a **community catalog** with submit→review→publish; (d) a **two-layer station system** (code capabilities + per-org `station_definitions` compositions) with a live in-place block editor; (e) a **mature, tenant-safe, local-first AI substrate** (provider resolution, structured tool-calling, a trust-gated AI→draft-graph mutation chokepoint, and live NL→*incremental*-graph editing); and (f) **premium instrument-panel display primitives**. What is missing is the **connective tissue that makes them a product**: templates don't carry stations; stations aren't data-driven or per-staff; there is no *generator* that turns a business description into a whole graph + stations; the premium bench content is code-only; and there is no live throughput/KPI. **The build here is composition, not invention** — your plan should reflect that.

### 3.C Scan-station system (Pillar C) — a two-layer registry, mostly code-locked

**Definition model is CODE capability + DATA composition, with an explicit boundary:**

- **CODE = the closed capability set** (PR-reviewed, compile-time):
  - `SURFACE_REGISTRY` (`src/lib/stations/surface-keys.ts`) — a **closed** `Record<SurfaceKey,…>` of 10 surfaces (`unbox, triage, incoming, pickup, repair, history, pack, test, outbound, support`). Each declares `route`, `archetype`, `workbenchBranch`, `permission`, `pageKey`, `modeKey`, `scan` policy, `workflowNodeType`, `legacy` alias. A missing entry is a **compile error**; adding a station key requires a code change + guard (`surface-keys.test.ts`).
  - Three registries, populated in code on import (`src/lib/stations/index.ts` → `registerStationBuiltins()`): **Blocks** (`blocks/registry.ts` — only **3 today**: `checklist`, `scan_band`, `rail_feed`), **Data sources** (`data-sources.ts` — 10 built-ins, each wraps an existing GET route + declares a semantic `FieldDef[]` shape), **Actions** (`actions.ts` — 10 built-ins, each a thin descriptor over a route + permission key).
  - **Semantic binding** is the extensibility lever: `FIELD_KINDS` (`po_ref, tracking_ref, order_ref, sku_ref, serial_ref, condition_grade, source_platform, timestamp, money, text, staff_ref`) drive renderer selection + action `appliesTo` matching. Registering an integration's sources+actions lets every existing block render/act on it with zero new UI.
- **DATA = per-org composition** in `station_definitions` (`2026-06-11_station_definitions.sql`): one row per `(org, page_key, mode_key, version)`; `config JSONB` holds `slots → block instances → source/action bindings`. Versioned + `is_active` publish semantics (copied from `workflow_definitions`). Slot ids: `['trigger','queue','workspace','advance','header']`. `slots` may be the literal `'legacy'` — the escape hatch to render the original hand-coded tree.
- **The stated boundary:** *"blocks/sources/actions are CODE… what surfaces exist and how they are composed for a given org is DATA."* The `station-block` skill governs it: a new *arrangement* = a `station_definitions` config (no code); a new *feed/button* = a ~15–20-line source/action; a genuinely new display block = "RARE — challenge it twice."

**Composed render path exists end-to-end but is EXPERIMENTAL and OFF by default:**
- `SurfaceGate` (`src/components/surfaces/SurfaceGate.tsx`) queries `/api/surfaces/:key/resolve`; renders `<SurfaceRenderer>` only when the resolver returns `render:'composed'`, else falls through to the legacy hand-coded tree.
- `SurfaceRenderer` lays a **fixed** Station scaffold (trigger top / queue aside / workspace / advance foot) and drops a `<StationSlot>` per region. `StationSlot` reads the active config, renders blocks via `BlockRenderer`, AND carries the **live in-place edit loop** for `stations.manage` holders (pencil → slot outline → dnd-kit reorder → `+ Add block` palette → Config Sheet → Save draft / Publish → `POST /api/stations` + `/api/stations/publish`).
- Gated by `isSurfaceComposedRender` (env `SURFACE_COMPOSED_RENDER`, **default OFF**) **AND** an active non-`'legacy'` composition. All seed compositions (`2026-07-05*`, `2026-07-06e`) are **org-1 (USAV) only** and dormant. **The real production Unbox bench is the hand-coded `ReceivingSurfacePage`/`LineEditPanel` procedure cockpit — not `SurfaceRenderer`.**

**Per-staff assignment is a disconnected, fixed enum:**
- `staff_stations` (`2026-06-02_staff_stations.sql`) = per-staff assignment of a **fixed 5-value CHECK enum** `('TECH','PACK','UNBOX','SALES','FBA')` (one `is_primary` + N secondaries). Drives the header goal chip / switch and NAS photo folders, and Studio People-coverage. It is **entirely separate from `SURFACE_KEYS`**; there is **no join** to `station_definitions`.

**Node-bound stations (soft link, demo-only today):** a composition can bind to a workflow node via `station_definitions.workflow_node_id` (reserved namespace `page_key='studio-node'`, `mode_key=<node_id>`). `SURFACE_REGISTRY` also carries a static `workflowNodeType` per surface so a template with that node type can *conceptually* seed a surface. Wired into Studio L2 zoom via `StudioStationPreview`.

### 3.A Template lifecycle (Pillar A)

**One table backs a template: `workflow_templates`** (GLOBAL / cross-tenant, no `organization_id` — the deliberate "system reference" exception). Columns: `slug` (globally unique), `name`, `description`, `category` (free text), `graph JSONB` (`{nodes,edges}`), `is_system`, `is_default`; curation cols (`2026-07-11c`): `visibility` (`private|org|public`), `review_status` (`draft|submitted|approved|rejected`), `submitted_by_org` (attribution UUID, not an FK), `submitted_at`, `reviewed_at`.

- **A template captures the WORKFLOW GRAPH ONLY.** `graph.nodes[] = {id, type, x, y, config}`; `graph.edges[] = {id, source, sourcePort, target}` (`sourcePort` = routing key). All richer semantics live in `node.config` (`station`, `states`, `slaHours`, grade dims, `channel`, and decision `outputs/rules/defaultPort`). It captures **NO station composition, NO procedures/checklists, NO KPIs/displays, NO seed data.**
- **`installTemplateIntoOrg` (`install-template.ts`) is THE single clone path** — the productized replacement for three older clones; every entry point composes it (`/api/studio/templates/[id]/import`, `/api/onboarding/template`, `importTemplatePackage`, `seedDefaultWorkflowForOrg`, and the legacy `applyTemplateToOrg` shim). It re-mints every node id, remaps edges, org-stamps a new `workflow_definitions` row `is_active=FALSE` at version `MAX+1`, and auto-activates only *system* templates; custom/import/AI always land a draft behind the publish gate.
- **Surface seeding is inert.** For each cloned node whose `type` a surface binds to (`SURFACE_REGISTRY.workflowNodeType`), install inserts a node-bound `station_definitions` **draft with `config='{"slots":"legacy"}'`** — it renders the hand-coded legacy tree; the composition is empty. **The operator still hand-composes every station.**
- **Authoring from a live org exists (graph only):** `submitTemplateFromDefinition` serializes the org's own graph into a `CycleForgeTemplatePackage v1` (`{schemaVersion, metadata, engineCompat.requiredNodeTypes, graph (nodes≤200/edges≤400), surfaceSeeds?}`) and inserts a non-system `submitted` row. Wired to the Studio "Submit to catalog" button. `validateTemplatePackage` is Zod + a semantic check that every node/surface type is *registered* (new capability = platform PR, never a package).
- **Community catalog is real + curator-moderated:** submit → `reviewSubmittedTemplate` (approve → `public`) → clonable by every tenant. Perm `studio.catalog.review`. UI at `/studio/catalog` (`CatalogWorkspace` → `CommunityCatalogWorkbench` + `CatalogReviewWorkbench`). `visibility='org'` reserved/unimplemented.
- **AI here is scaffolding only:** `ai-template-vocab.ts` (`getAiTemplateVocabulary` closed palette + `constrainDraftToVocabulary` sanitizer) has **no live callers**; `/api/onboarding/recommend` **ranks existing template slugs by token overlap — no LLM; the `rerank` hook is never wired.**

### 3.B Studio authoring (Pillar B)

- **Entry** `/studio` → `StudioShell`; state in an app-wide `StudioWorkspaceProvider`; **URL is the SoT** (`?v=<defId>&focus=<nodeId>&z=0|1|2&lens=…`).
- **Gating:** the tier/plan gate is **dormant** (`studio-gate.ts` permissive unless `STUDIO_ENTITLEMENT_ENFORCED`; `StudioUpgradePrompt` is a stub). **RBAC is the real gate:** `studio.view` = view, `studio.manage` = edit/publish. The **active/published version is always read-only** — you must mint a *draft* version to edit anything (`editing = manager && !isActive`).
- **What an owner can do (on a draft):** create draft ("Edit as draft"); add node (click-to-add from palette); edit node config (schema-driven `NodeConfigForm`: number/bool/string→select); edit decision rules (`DecisionRulesEditor`: ports + when/then over `grade/channel/disposition` + default port); add/remove/rewire edges + move nodes (raw React Flow); delete node; sticky-note annotations; **save draft (manual — no autosave)**; publish (**step-up required** + blocking server diagnostics; `PUBLISH_BLOCKED` → `gaps` lens); discard.
- **Node → station binding is thin.** At zoom **L2**, `StudioNodeStationEditor` edits **only the `queue` slot** (DnD blocks + palette + config sheet), with its **own** draft/publish cycle. Other slots (trigger/workspace/advance/header) and the **procedure/checklist/displays are code-owned, read-only** (`StationProcedurePanel` is a pure projection). **Friction:** `z` is forced to L1 while a graph draft is open → the L2 station editor is unreachable *during* graph editing; graph-authoring and station-authoring are two disjoint modes with separate machinery.
- **Observe/diagnose is strong:** semantic zoom L0 business map ⇄ L1 flow ⇄ L2 station (L3 never built); lenses `build/static/live/flow(Flow²)/people/gaps/procedure`; a client `runDiagnostics` re-lints on every edit (error blocks publish); **Simulate** is a pure client ghost-run (zero engine writes; wears a Sparkles icon but is deterministic routing, not AI).
- **AI in Studio today:** the global dock assistant reaches Studio (registers `STUDIO_SKILL` + focused-node context; absorbs the inspector on desktop-lg) and **can edit the draft graph via chat** (`propose_mutation`/`revert_mutation`, `draft_scoped` trust) — but it **requires a draft already created in the UI, cannot create the draft or publish, and lands opaque mutations with no inline canvas diff.** There is **no LLM call anywhere in `src/app/api/studio` or `src/lib/studio`** → **no describe-to-build.**

### 3.W Workflow engine (backbone under A/B/C)

- **Schema (`2026-06-03_workflow_graph_layer.sql`):** `workflow_definitions` (per-org, versioned, `is_active`, `UNIQUE(org,name,version)`, `annotations`, `is_default`); `workflow_nodes` (`id TEXT` = client canvas uuid **re-minted on every save/publish/clone**, `type`, `position_x/y`, `config JSONB`, **no org — parent-scoped**); `workflow_edges` (`source_port` = the routing key); `item_workflow_state` (the **pointer**, not a status store — `current_node_id`, `status active|blocked|done|error`, `context` accumulates node outputs, one per unit; canonical status still on `serial_units.current_status`); `workflow_runs` (append-only exec log).
- **Node types = a CODE registry of ~13 thin adapters.** `NodeDefinition = {type,label,icon,category,outputs,configSchema?,run(ctx)}`. Builtins: `receiving, inspection, repair, data_wipe, list_ebay, list, pack, kit_verify, ship, returns, rtv, parts_harvest, decision`. The `stationNode()` factory's `run()` does **no domain work** — it maps an event → an output port; the engine owns ROUTING, `src/lib/*` owns WORK. **A tenant/template cannot add a node type without code (platform PR); the AI vocabulary is explicitly closed to registered types.**
- **Execution is an OBSERVER, strangler-gated.** `advanceItem` = `lock → run node → record → emit → park/route`; routing is pure first-match on `(node, port)`. `tapWorkflow` fires **after** the domain mutation commits (fire-and-forget, idempotent, enrolls on `unit_received`). **Many fulfillment taps have no firing site yet** (`pack/ship/kit_verify/list_ebay`). `applyTransition` (the unified mutate-and-tap chokepoint) and the fulfillment taps are **flag-gated OFF by default.** Decision nodes route a `when→thenPort` table over `grade/channel/disposition` (optional GoRules ZEN WASM behind a default-OFF flag, self-guarding to the in-house matcher).
- **Config validation is hand-rolled and weak:** `validate-config.ts` is a shallow ad-hoc checker (**not Zod, not real JSON Schema**) — it rejects only a *present* property of the wrong declared type / off-enum; **extra and omitted keys pass; a node type with no `configSchema` accepts any object; decision `rules` get zero write-time validation.** The template *envelope* is Zod-validated, but per-node `config` inside the graph is not.
- **Diagnostics (`diagnostics.ts`) are the operation linter:** `unreachable-node`, `dead-end-port`, `no-station`, `port-fan-out`, `decision-no-rules`, `decision-port-undeclared`, `station-unmapped-role/unknown-action`, `integration-disconnected/stale`, `invalid-config`. **Error severity blocks publish** — but they run **only at publish**, not at edit/generation time (client runs topology rules only).

### 3.D AI infrastructure + displays/KPI (Pillar D)

**AI substrate (mature, tenant-safe, local-first — and mostly idle for authoring):**
- **SDK:** `ai@^7` (AI SDK **v7**), `@ai-sdk/openai-compatible`, `@ai-sdk/react`, `@anthropic-ai/sdk`, `@google-cloud/vision`, `zod@^4` — everything speaks OpenAI wire format.
- **Config resolution is the real waist:** `resolveAiConfig(capability)` (prod default = **Vercel AI Gateway**, chat `anthropic/claude-haiku-4-5`, embed `text-embedding-3-small@768`) + `resolveOrgAiConfig(orgId,capability)` (per-org **BYOK** chain `ai_gateway→openai→anthropic→ollama→env→null`, vault/KMS).
- **Invocation is NOT unified — four mechanisms:** raw `fetch`; **`hermesToolCall`** (the structured-output waist: one forced tool, temp 0, returns parsed-but-**unvalidated** args — *caller owns validation*); **AI SDK v7 `streamText`+`tool()`** used **only in `/forge`** (the "forge beachhead", validated Zod tools, `stepCountIs(6)`); and the raw `@anthropic-ai/sdk` streaming tool loop in the dock assistant (`claude-opus-4-8`, reads `ANTHROPIC_API_KEY` directly — an inconsistency vs `/forge`). **`generateObject`/`streamObject` are never used.**
- **Live AI surfaces:** dock assistant (read + `studio.manage` write tools), `/forge` plan agent, support reply suggest (3-way grounded, confidence-capped), photo vision/OCR (per-org provider, local-first), the deterministic support vision loop (decode→search, never synthesizes a hit), hybrid search (embed only, LLM never inline), sourcing research, Zendesk drafts, onboarding recommend (**no LLM**), local-ops fast path (**no LLM**).
- **Safety primitives all present:** `checkRateLimitForOrg`, capability gating, tenant-framed prompts (never a hardcoded vendor brand), a **required-no-default** vision lane (`local-only` default), server-side signed URLs, `recordAiUsage` metering, audit on all AI mutations.
- **AI authoring TODAY:** a **live NL→workflow-graph EDIT** path exists — the dock's `propose_mutation`/`revert_mutation` funnel through **one chokepoint `applyAgentMutation`** with a 3-tier trust model (`auto` / `draft_scoped` / `review`) and node-level writers (`workflow_draft.add_node/…/set_annotations`). *"Add a QC node and wire it after receiving"* already works. **"Describe your business → generate the whole ops graph" does not.**

**Displays / KPI (instrument surfaces polished; throughput layer thin):**
- **Bench displays (polished):** `ScanStationProgressRing` (bare 16px, no numeral — hardcoded-hex debt), the `ProcedureDeck` focus deck (premium, but parked on the `unbox-work` lane; main Unbox centre is PO lines + label), `ProcedureChecklist`, the Displays push column (no metric tab), `StationContextBar`, and the Unbox chrome KPI band (the *only* KPI surface on the bench — counts, not throughput).
- **The only per-operator metric is `computeLaborThroughput`** (`unitsPerLaborHour` = units advanced ÷ clocked hours, **batch, 7-day, Monitor-only**). `workflow_node_stats` holds **daily per-node** `queue_depth`/`completed_count` (never per-operator, never per-minute). Operations ROI shows a *"Units/hour by staff"* `DistributionTable` — a %, not a leaderboard. `GoalRing` is a **scan-count-vs-target** header chip.
- **Live** = phone→bench photo capture is real (`useReceivingPhotosRealtimeRefresh`), but realtime drives **invalidation only** — there is no live metric tick.
- **TV board** (`OperationsTvBoard`, `?tv=1`, flag `ops_tv_board`) is a **task/plan backlog** board (due/overdue/in-progress), wall-scale `KpiTile size="wall"` — **not** throughput/UPH/operator pace.
- **DS primitives** (`KpiTile`+wall, `KpiStrip`, `DeltaChip`, `MetricRing`, `MetricTile`, `OpsKpiBand`, procedure family, motion roles) are rollup-oriented, carry hardcoded-hex ring debt, and offer **no bench-scale glanceable counter / pace gauge**.

### 3.R Roadmap already in flight (embedded — reconcile with it)

- **`studio-driven-operator-surfaces-refactor-plan.md`** — an in-progress preproduction root refactor whose thesis is *exactly this brief's vision*: every operator surface becomes a first-class, per-org "sharded" surface fed/mapped by the Studio's template/mapping system, with `nav_definitions` per-org overrides. Receiving family piloted (unbox/triage/incoming graduated to first-class routes behind `SurfaceGate`); pack/test still on legacy routes. Explicitly cites `station_definitions`, `workflow_templates`/`workflow_definitions`, `SURFACE_REGISTRY`, the `station-block`/`ops-studio` skills.
- **On signup**, `seedDefaultWorkflowForOrg` + `seedOrgCatalog` run (`/api/auth/signup`) — every new org already gets a default workflow graph. The incoming-station seed (`2026-07-06e`) notes the intended long-term home: *"new-org provisioning should clone this template per org… this migration seeds ONLY org #1."*
- **Onboarding** (O0–O2 shipped): read-time, self-dismissing `GettingStartedChecklist`; steps complete because data exists, never a clicked "done."

---

## 4. The gap map (embedded — the spine of the build plan)

> Every gap is tagged to a pillar. The build plan (§10) must close these. Cite them by tag.

**Three structural gaps gate everything else — rule on them first (D1–D5):**
1. **Templates don't carry stations** (A1 / C6) — "create scan stations from a template" is a promise the data model cannot keep today.
2. **Stations are code-locked and singleton-per-org** (C1 / C2 / C4) — you cannot add a station, instance one per staff, or express the premium bench as data.
3. **There is no generator** (D-AI1 / W1) — "AI-first" has every dependency except the call site, and the config a generator would emit is not machine-describable.

Everything else (premium displays, live KPI, gallery polish, safety rails) is high-value but **downstream of these three**.

### 4.C Scan-station gaps

- **C1 — Surfaces are code-locked; you cannot add a station without a deploy.** `SURFACE_KEYS`/`SURFACE_REGISTRY` is a closed compile-time set guarded by a test. A tenant can re-arrange an *existing* surface's blocks, but "add a new scan station / route" requires editing code. There is **no data-driven surface table** (the plan deliberately declined to birth `page_definitions`, overloading `station_definitions.page_key`).
- **C2 — No per-staff / per-tenant station INSTANCES.** `(org, page_key, mode_key)` is unique → exactly one composition per surface per org. `staff_stations` is a fixed 5-value enum disconnected from surfaces. Nothing lets a tenant instantiate "Testing Bench 2" or assign a *custom* station to a staffer. **"Add more scan stations per staff" has no schema.**
- **C3 — Composed render is experimental and unproven at parity.** Gated OFF by default; all seeds org-1-only. The production premium bench (procedure focus deck, instrument panel, Displays push column, dock) is **NOT expressible** in the 3-block registry + fixed scaffold. `SurfaceRenderer`'s trigger/queue/workspace/advance layout cannot reproduce it.
- **C4 — The premium station content is 100% code-only and NOT composable.** `procedure.ts` declares every Unbox step `composed: false` — the rich derived procedure (flows found/unfound/return, capture-order overrides, photo aspects, per-unit steps) is hand-coded over hand-coded routes. A projection of only the composable parts *"would render a correct, near-empty diagram — worse than none."* A template/tenant cannot author or reorder it.
- **C5 — Blocks are not template-serializable in behavior.** A composition carries a slot map of *registered id strings*; block `component`/source `parse`/action `body` are code. A shared template can carry an arrangement but never a *new* display block.
- **C6 — Per-tenant station-composition template cloning is UNBUILT.** `install-template.ts` clones `workflow_templates` → `workflow_definitions` but **never touches `station_definitions`** (verified: grep of onboarding/templates/tenancy for `station_definitions` is empty). "Create scan stations from templates" has graph templating (built) but station-composition templating / per-org clone (not built).
- **C7 — Three "station" vocabularies drift:** `staff_stations` enum (TECH/PACK/UNBOX/SALES/FBA) vs `SURFACE_KEYS` (10 keys) vs `workflowNodeType` (receiving/inspection/pack/ship). Any "add a station" feature must reconcile taxonomies that don't map 1:1.

### 4.A Template-lifecycle gaps

- **A1 — Templates carry the graph, not the station.** No station composition, procedures/checklists (code-declared), KPIs, displays, or seed data are captured. `surfaceSeeds` in the package envelope are *validated but not applied on import*. Install seeds empty `'{"slots":"legacy"}'` station drafts → "create scan stations from a template" does not actually configure a station. **This is the same gap as C6, from the template side.**
- **A2 — No upload/export UI.** `GET /api/studio/definitions/[id]/export` and `POST /api/studio/templates/import-package` exist but have **zero client callers** — a user cannot upload a `.json` template or export/share one. "Anyone can upload their own template" is unbuilt.
- **A3 — No template versioning / lineage.** No version column; a "new version" is a new slug-suffixed row. No edit-in-place of a published template; no link between a submission and its source definition.
- **A4 — No premium gallery.** No ratings / install counts / usage analytics; no author identity beyond a raw `submitted_by_org` UUID (shown verbatim); free-text `category`; no featured/trending; no pricing/entitlement.
- **A5 — Orphan rows on failed import** are tolerated (non-system INSERT is a global write outside the tenant tx).

### 4.B Studio-authoring gaps

- **B1 — No describe-to-build.** The scaffolding (`ai-template-vocab`, the `recommend-template` rerank hook, `constrainDraftToVocabulary`) exists but nothing renders "tell me how your shop runs → here's a draft graph."
- **B2 — AI config-assist is chat-only and clunky:** can't create a draft or publish, needs `definitionId` hand-fed, lands un-previewed mutations; no inline "suggest config / explain node / wire this to fulfillment" affordances in the inspector or canvas.
- **B3 — Canvas friction for a non-technical owner:** no auto-layout/tidy/snapping; click-to-add (not drag-from-palette); engineer vocabulary everywhere (mono type ids; `grade/channel/disposition/ports/bins`); **no undo/redo, no autosave**; the two disjoint edit modes (§3.B).
- **B4 — Station authoring is the thinnest part of the core promise:** only the `queue` slot is editable; procedure/checklist/displays are code-owned read-only; **there is no live station PREVIEW** (`StudioStationPreview` shows block/source/action *metadata*, not the rendered operator screen) — the owner can't see what staff will see.
- **B5 — No premium self-serve packaging:** gate dormant, upgrade prompt a stub; no guided first-run "build your first flow" wizard *inside* Studio; fragmented template homes (Library import vs onboarding chooser vs community workbenches vs unsurfaced export); no mobile/tablet form.

### 4.W Workflow-engine gaps

- **W1 — `config` is not machine-describable for an LLM.** There is **no per-node-type structured schema** an LLM could use to generate valid config; the AI vocabulary hands the model only `type/label/category/outputs`. Decision routing facts are hardcoded to `grade/channel/disposition`. → AI can pick node types + wire ports, but cannot safely author config.
- **W2 — Validation gaps make generated output unsafe by default:** decision tables unvalidated at write; the shallow config checker passes extra/omitted keys; diagnostics run **only at publish** → an AI (or human) draft can be structurally broken (unreachable nodes, dangling fail ports) until someone tries to publish.
- **W3 — The engine is not universally executing.** All unified-engine flags OFF + `disposition:'undecided'`; fulfillment-tail taps (`pack/ship/kit_verify/list_ebay`) have no firing sites. A template today carries **topology + station bindings + decision routing**, but the fulfillment half is documentation, not execution — undercutting "templates that carry a real executable flow."
- **W4 — Reliability is best-effort:** `tapWorkflow` is fire-and-forget; the reconciling `workflow_tap_outbox` is flag-gated OFF (undecided); the advance lock has a `NULL_LOCK` fallback. A dropped tap is *observable*, not *recovered*.
- **W5 — Node ids are ephemeral** (re-minted every save) → anything AI-authored that references a node id is invalidated on the next edit.
- **W6 — Node types are code-locked (~13).** A new capability an AI describes ("wipe to a named standard", "consign to a third party") is a platform PR, never generated.

### 4.D AI-first + displays/KPI gaps

**AI-first gaps (the substrate is built; the *generator* is the missing middle):**
- **D-AI1 — No NL → whole-graph / whole-template generation.** `getAiTemplateVocabulary` + `constrainDraftToVocabulary` are pure scaffolding with **no LLM caller**; `recommendTemplates` is a static token-overlap ranker of *existing* templates (its LLM `rerank` hook is never passed). Nothing turns a business description into a `TemplateGraph` + station config.
- **D-AI2 — No structured-generation waist for graphs.** `hermesToolCall` (unvalidated) is used only for flat metadata/classification; no schema/tool emits a validated graph. `generateObject` is unused.
- **D-AI3 — No AI config-assist and no template-gallery semantic search** (hybrid search covers ops entities, not the template catalog).
- **REUSABLE (idle, ready — the plan should compose these, not rebuild):** the `suggest-reply-core` **core+deps** pattern (pure, DB-free-testable); `hermesToolCall` **or** AI-SDK-v7 `streamText`+`tool()` as the emitter + `ai-template-vocab` as the tool schema + `constrainDraftToVocabulary` + `validateTemplatePackage` as the gate; the **`applyAgentMutation` trust chokepoint + `workflow_draft.*` writers** (a generator can emit a mutation sequence into a reviewable draft — free audit/revert); `resolveOrgAiConfig`; the AI-SDK-v7 engine proven in `/forge`. **Every dependency a generator needs already exists — only the call site is missing.**

**Displays / KPI gaps:**
- **D-KPI1 — No per-operator units-per-minute/hour anywhere live.** `station_activity_logs` is written but never aggregated into a rate; the bench shows only procedure completion + count KPIs.
- **D-KPI2 — No throughput/pace on the scan bench at all**, and no live metric stream (realtime is invalidation-only).
- **D-KPI3 — Displays are NOT template/config-driven for KPI.** Station blocks are only `checklist/rail-feed/scan-band` — there is **no `metric`/`kpi`/`gauge`/`stat` block**. Dashboard/Unbox KPIs are hardcoded arrays.
- **D-KPI4 — No leaderboard/gamification, no owner-facing KPI/target config**, and the TV board shows task backlog, not performance.
- **D-KPI5 — Tokenization debt** (two rings with page-local hex) blocks "premium" polish. (Note: `StationGoalBar`, referenced in the house rules, **does not exist in code** — treat that doc line as stale.)

---

## 5. Binding house laws (design INSIDE these or argue explicitly to replace)

1. **Region contracts are I/O contracts, not skins.** Scanner → Station; pointer → Workbench; observe → Monitor; reshape-a-definition → Canvas. The AI loop writes into a contract; it must not blur two.
2. **Facts/state drive chrome.** Derived-procedure steps go `done` only when evidence exists. No hand-ticked completion. AI-generated config still resolves through the same evidence gates.
3. **Compose named shells; grow the SoT when wrong; never fork a page-local twin.** "Blocks = code, arrangement = data."
4. **Status changes only via `transition()` / `applyTransition()`**; `orgId` from `ctx`, never the body; org-scoped writes through `withTenantTransaction`.
5. **One motion engine, reduced-motion floor is automatic.** Crossfade only the singular focus surface (active card / detail pane / overlay), never the collection map / graph.
6. **Kinetic Ledger tokens only** — semantic color/spacing/type/z-index/focus/elevation from the SoT; three type cuts (sans/condensed/mono); weight capped at 600; no page-local hex.
7. **A safety classification is a required parameter with no default.** Anything that decides what a customer sees, whether a photo leaves tenant hardware, or which surface a row belongs to is required, never defaulted — applies to LLM lanes too.
8. **A shared prompt must not name a vendor brand.** Tenant framing resolves from org settings; generic fallback.
9. **`npm run verify` before done; never raise a ratchet baseline to pass.** E2E asserts against the QA org, not the dogfood tenant.

---

## 6. Industry survey asks (name systems, cite 2024–2026)

Answer each with named products + what specifically to adopt/reject for Cycle Forge.

1. **Visual workflow/graph builders for non-technical owners** — n8n, Make, Zapier, Temporal UI, Windmill, Node-RED, Salesforce Flow Builder. What makes graph authoring feel *premium and legible* rather than an engineering tool? Canvas ergonomics, auto-layout, inline validation, "publish/version" UX.
2. **AI-first / natural-language → workflow generation** — Zapier AI, Make AI, n8n AI Assistant, Gumloop, Lindy, Vercel v0, Lovable, Bolt. How do the best ones convert a plain-English business description into a *valid, editable* graph? Where do they gate/verify generated output? Where do they fail (the "confident but wrong graph")?
3. **WMS/MES station & SOP configuration** — Tulip, Zebra, Manhattan Active, Toast/Square POS station config, Katana, Fulfil. How is a "station"/"process step" made data-driven and per-role without a deploy? How do they template a plant/warehouse and clone it per site?
4. **Template galleries / marketplaces for operational content** — Notion template gallery, Retool template library, Airtable, Zavanta/SOP libraries, Salesforce AppExchange. Curation, versioning, community-submit, install-into-my-workspace, forking. What earns trust in a template gallery?
5. **Premium operator displays + throughput/KPI** — Amazon/warehouse pick-rate boards, Tulip dashboards, factory andon/TV boards, POS KPI. Units-per-hour per operator, pace rings, leaderboards without turning a bench into surveillance. What is "best-in-class premium instrument feel" in 2026?
6. **Self-serve config that stays safe** — how do the best platforms let a non-technical owner change a live operation without breaking it (draft/simulate/publish, validation, rollback, blast-radius)?

---

## 7. Forced decisions (rule on each; no hedging)

> `[D-station]` tags map to §4 gaps.

- **D1 — Data-driven surfaces vs registry.** Should `SURFACE_KEYS` stay a closed code registry (tenant only rearranges existing surfaces) or become data-driven so a tenant can mint a *new* station/route? If data-driven, what is the minimum table (`surface_definitions`?) and how does routing/permission/archetype stay safe? *(C1)*
- **D2 — Per-staff/per-tenant station instances.** How do we express "Testing Bench 2" / a custom station assigned to a staffer? Reconcile the three vocabularies (C7). Is `staff_stations` extended, replaced, or joined to compositions? *(C2, C7)*
- **D3 — Can the premium bench ever be composed?** The production procedure cockpit is `composed:false`. Do we (a) keep premium benches hand-coded and only *template their parameters* (flows, capture order, photo aspects, KPI), (b) invest in richer blocks so `SurfaceRenderer` can express them, or (c) a hybrid "parametric premium block"? *(C3, C4, C5)*
- **D4 — Template payload.** What exactly does a template capture beyond the workflow graph? Must "create scan stations from templates" clone `station_definitions` too (C6)? Define the serialized template envelope (graph + station compositions + KPI config + seed catalog + persona) and the versioning story.
- **D5 — AI generation target.** When an owner describes their business, does AI generate (a) a workflow graph only, (b) graph + station compositions, (c) a full template envelope? What is the validated output schema and which existing validation (Zod + diagnostics) must it pass before it can be published?
- **D6 — AI structured-generation waist.** Is there one place to add `generateObject`-style structured generation, and should template/station generation reuse it? (Reconcile with the embedded AI-infra findings.)
- **D7 — Draft/simulate/publish for AI edits.** An AI edit is still an edit. Must every AI change land as a *draft* the owner reviews + simulates + publishes — never a live mutation? Rule the guardrail.
- **D8 — Community vs curated gallery.** Should tenant-authored templates be shareable cross-org (community), curated-only, or private-per-org for v1? What's the trust/curation model?
- **D9 — KPI/throughput ownership.** Is units-per-minute/hour per operator a first-class, template-configured metric on a station, or a Monitor-only rollup? Where does per-operator pace live without becoming surveillance? *(displays gap)*
- **D10 — Premium display parity.** What is the minimum set of premium display primitives a *templated* station must offer to feel best-in-class (progress ring, procedure deck, KPI tile, live capture)? Which are DS-ready vs must be built?
- **D11 — Onboarding entry.** Does the AI "describe your business → generated ops" loop live in first-run onboarding, in Studio, or both? How does it reconcile with the shipped `seedDefaultWorkflowForOrg` + `GettingStartedChecklist`?
- **D12 — Tiering.** Which capabilities are gated (StudioUpgradePrompt tiers) — authoring, AI generation, community publish, per-staff stations? What's free-in-trial vs paid?
- **D13 — Blast radius / safety.** How does a non-technical owner change a live operation safely (validation, simulate, rollback, coverage/diagnostic gates as publish blockers)?
- **D14 — Scope for v1 "AI-first."** Given the embedded gaps, what is the smallest AI-first slice that is genuinely premium and shippable (e.g., "describe → generate graph → review/simulate → publish" with station compositions as P2), vs the full vision?

---

## 8. Premium-SaaS readiness scorecard (fill: today vs target)

For each row, rate **today** (from §3) and set a **target** + pass threshold.

| Dimension | Today | Target / threshold |
|---|---|---|
| Add a station without a deploy | **Impossible** — closed code registry (C1) | ? |
| Per-staff / per-tenant station instances | **None** — one composition per surface per org; `staff_stations` is a disconnected 5-value enum (C2/C7) | ? |
| Templates carry stations (not just graph) | **No** — seeds empty `'legacy'` drafts; `surfaceSeeds` unvalidated-applied (A1/C6) | ? |
| Author a template from a live org | **Yes, graph-only** — "Submit to catalog" (A); no versioning (A3) | ? |
| Community / gallery discovery | **Yes** — curated `/studio/catalog` submit→review→publish; no ratings/usage/lineage (A4) | ? |
| AI: describe-business → valid ops | **No** — `recommend` is static token-overlap; only NL→*incremental* graph EDIT exists (D-AI1) | ? |
| AI edits gated as draft→simulate→publish | **Partial** — dock AI edits are `draft_scoped` + revertable, but need a pre-made draft and can't publish (B2) | ? |
| Premium station display parity (templated) | **Code-only** — `procedure.ts` is `composed:false`; not expressible in the 3-block registry (C3/C4/C5) | ? |
| Units/min per operator + KPI | **No live UPH** — only batch 7-day labor-hour, Monitor-only; no template `metric` block (D-KPI1/D-KPI3) | ? |
| Non-technical-owner safety (validate/rollback) | **Partial** — diagnostics block publish + Simulate ghost-run + step-up, but run only at publish; config checker weak (W2) | ? |

---

## 9. Files this work will touch (embedded — do not invent others)

- Stations: `src/lib/stations/{surface-keys,contract,archetype,surface-resolver,surface-workflow-node,procedure,data-sources,actions}.ts`, `src/lib/stations/blocks/*`, `src/components/surfaces/{SurfaceGate,SurfaceRenderer}.tsx`, `src/components/stations/StationSlot.tsx`, `src/app/api/stations/*`, `src/app/api/surfaces/[key]/resolve/route.ts`.
- Templates: `src/lib/studio/{install-template,template-catalog,template-package,submit-template,import-package,seed-org-workflow,template-surfaces,ai-template-vocab}.ts`, `src/app/api/studio/templates/*`, `src/app/onboarding/*`, `src/app/api/onboarding/{template,recommend}/route.ts`.
- Studio: `src/components/studio/*`, `src/lib/schemas/studio.ts`.
- Workflow engine: `src/lib/workflow/*`, migrations `workflow_definitions`/`workflow_nodes`/`workflow_edges`/`workflow_templates`/`workflow_node_stats`.
- AI infra: `src/lib/support/{suggest-reply,reply-persona,analyze-core}.ts` (reuse pattern), provider resolution.
- Displays/KPI: `src/design-system/components/procedure/*`, `src/design-system/components/monitor/*`, `src/components/station/ScanStationProgress*`, `workflow_node_stats`, `station_activity_logs`.
- Skills/rules: `.claude/skills/{ops-studio,station-block,workflow-node,reseller-flow}/SKILL.md`, `.claude/rules/*`.
- In-flight plan: `docs/todo/studio-driven-operator-surfaces-refactor-plan.md`.

---

## 10. Phased build plan (fill — paste-ready P0–P4 + Claude Code P0 prompt)

> Gemini finalizes this against the §7 rulings, but the sequencing is heavily constrained by §4: **P1 (template payload) and P2 (data-driven stations) are the load-bearing rework; P0 is the AI slice that needs neither and can ship first.**

- **P0 — "Describe your operation → a reviewable draft graph."** The smallest genuinely-AI-first *and* genuinely-premium slice, precisely because **every dependency already exists** (§4.D REUSABLE). A new server route takes a business description → `resolveOrgAiConfig(orgId,'chat')` → AI-SDK-v7 `streamText`+`tool()` (or `hermesToolCall`) constrained by `getAiTemplateVocabulary()` → `constrainDraftToVocabulary` → emit a sequence of `workflow_draft.*` mutations through `applyAgentMutation` into a **new draft** the owner reviews on the canvas, runs through **Simulate**, and publishes through the **existing diagnostics gate**. No schema change, no station rework; reuses trust/audit/revert. Surface it in **onboarding *and* Studio**. Closes D-AI1; de-risks D5/D6/D7 by proving the loop before the payload grows. **Guardrail (D7): AI output is always a draft, never a live mutation.**
- **P1 — Template payload carries the station (close A1 / C6 / D4).** Extend the template envelope + `installTemplateIntoOrg` + surface seeding to clone real `station_definitions` compositions (plus KPI/procedure params), not empty `'legacy'` seeds; apply `surfaceSeeds` on import; add versioning/lineage (A3) and an upload/export UI (A2).
- **P2 — Data-driven + per-staff stations (close C1 / C2 / C4 / C7).** Rule D1/D2 first: the minimal `surface_definitions` (or the chosen alternative) + station instances + reconcile the three station vocabularies. Largest rework; unblocks "add a station" and "add a station per staff."
- **P3 — Machine-describable config + generation-time validation (close W1 / W2).** Per-node-type JSON Schema an LLM (and a human) author against; run diagnostics at generation/edit time, not only at publish.
- **P4 — Premium templated displays + live KPI (close C3 / C5 / D-KPI1–5).** A `metric`/`gauge` station block; a live per-operator UPH pace instrument from `station_activity_logs` / `inventory_events`; owner-facing KPI/target config; a throughput TV board; tokenize the two hardcoded-hex rings.

**§10 Claude Code P0 prompt (≤40 lines, paste-ready):** *(Gemini writes — must compose the reusable pieces named in P0, land the generator as a `*-core.ts` + `*-deps.ts` pair, gate on `studio.manage`, rate-limit via `checkRateLimitForOrg`, meter via `recordAiUsage`, and never publish — the owner publishes.)*

---

## Appendix — open verification items

- (inferred — verify) exact template envelope columns; whether `workflow_templates` curation carries station compositions.
- (inferred — verify) whether any Studio surface calls an LLM today vs. static vocab.
- (inferred — verify) whether `workflow_node_stats` already computes per-operator throughput or only per-node counts.
