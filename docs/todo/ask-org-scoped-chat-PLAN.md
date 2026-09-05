# Ask as a fast, org-scoped warehouse chat (tools + typed CRUD)

**Status:** plan of record for Ask (2026-09-05). Fable 5.1 research prompt: [`docs/eval/FABLE-5.1-ASK-AI-RESEARCH-PROMPT.md`](../eval/FABLE-5.1-ASK-AI-RESEARCH-PROMPT.md). Research **adds sections**; it does not replace locked decisions in §12 / §14.
**Research amendments (2026-09-04):** the Fable 5.1 pass measured the live code and the industry, and appended **§16–§27** below (industry mapping, Grok wire protocol, tool subsetting, catalog storage, CRUD wave 1 decided, review apply/reject, latency hypotheses, probe plan, revised PR order, operator questions, and — operator rulings 2026-09-04 — Ask | Build modes with a CTA in the thread, then the full SaaS mode slice **Ask · Build · Plan** with Plan mode on the ops-plans domain). §1–§15 are unchanged; where a section is refined the refinement lives in §16+ and the report [`docs/eval/FABLE-5.1-ASK-AI-RESEARCH.md`](../eval/FABLE-5.1-ASK-AI-RESEARCH.md) says which side moves.
**Repo:** `cycleforge-app`
**Surface:** Station/desk Ask (`StationAskPane` / `AskThread` → `POST /api/assistant/chat`)
**Goal:** An extremely fast natural-language chat that queries live tables and performs Create / Read / Update / Delete for the signed-in operator — without dumping tables into a vector store, without interpolating English into SQL, and without a second tenancy surface.

---

## 1. What this is (and is not)

This is **not** “pour every table into embeddings and let Grok talk to the digits.” Operational facts (counts, joins, this-week, this-packer) stay in Postgres. The AI talks to a **semantic catalog** (English names for tables, columns, metrics, example questions) and then **executes typed tools** against the live database under the session org.

“Full CRUD” in this codebase does **not** mean a generic `execute_sql` / `INSERT INTO *` tool. CycleForge already forbids that: every AI write must go through `applyAgentMutation` (`src/lib/assistant/mutations/apply-agent-mutation.ts`) with a registered `mutation_kind`, a trust class, and the same permission as the hands-on UI. CRUD here means: **the operator can ask Ask to do anything they can already do on the floor**, and the chat runs the existing domain writers.

| Operator says | System does |
|---|---|
| “How many packages did this packer pack this week?” | Classified COUNT on `packer_logs` (already live) |
| “What’s in this carton?” | Carton product brief (already live) |
| “Who is assigned to order 12345?” | Read tool `get_order_lookup` / `get_assignments` |
| “Always assign Maya to this listing” | `propose_mutation automation_rule.upsert_item_staff` (already live) |
| “Assign this order’s packer to me” | **New** mutation kind wrapping `upsertOrderAssignment` |
| “Mark this carton unmatched / complete triage” | **New** mutation kind wrapping `completeTriage` |
| “Create a staff member named …” | `staff.create` stays **review**-gated (identity master) |

Raw model SQL that writes is out of scope forever. Constrained read-only SQL (SELECT, AST-sanitized, RLS already set) is a **later optional** escape hatch, not the first path.

---

## 2. Current state (what we keep)

Ask already has the right security spine. The plan extends it; it does not replace it.

```
useAssistantChat.send
  → POST /api/assistant/chat   (withAuth, permission assistant.chat)
  → enrichAssistantTurn(org, message, page, staffId)
       carton question + receiving selection → carton brief
       packing-count NL → parameterized packer_logs COUNT
       else local_ops / generic enrich
  → Grok connected, skill has no propose_mutation
       → streamHermesCompletion  (NO tools, phrases the facts block)
  → else Anthropic runAssistantTurn  (tools + propose_mutation)
```

**Keep:**

- Org / staff / permissions from `withAuth` (`ctx`), never the body.
- `tenantQuery` / `withTenantTransaction` + explicit `organization_id = $1`.
- Utterance is classification-only; never concatenated into SQL.
- `runAssistantTool` as the single read chokepoint.
- `applyAgentMutation` as the single write chokepoint.
- Ask transcript: user bubble + unbubbled Grok prose. **No tool-name tiles** in `AskThread` (already removed). Tools run silently; the mouth stays a chat.
- SuperGrok as the default brain (`ensureGrokChatConfig` → `cli-chat-proxy.grok.com`).

**The gap that makes Ask feel dumb today:**

1. Grok **cannot call tools**. `streamHermesCompletion` is plain chat. Read tools and `propose_mutation` only run on the Anthropic loop, and only when the page skill contains the string `propose_mutation`.
2. Fast facts cover packing counts + carton briefing only. Everything else either dumps generic enrich or waits on Anthropic credits.
3. Floor CRUD is almost empty at the AI layer: photo move + listing rules + studio draft + view-layer. No order assign, no receiving triage, no packing complete, no order flags.
4. Review-trust kinds (`staff.create`, `setting.update`, …) insert `proposed` rows but **there is no human apply route**.
5. There is no semantic catalog. `PRODUCT_TABLES` is a UI sheet list, not an AI dictionary. Embeddings exist for **entity search** (`entity_search_docs`, 768-dim) and RAG docs — not for table/column meaning.

---

## 3. Target architecture

Four layers, all in-process, all org-scoped. Fastest layer that can answer, wins.

```
                    ┌─────────────────────────────────────┐
  operator text     │  1. CLASSIFIER  (ms)                │
                    │  packing / carton / known metric    │
                    └──────────────┬──────────────────────┘
                                   │ miss
                    ┌──────────────▼──────────────────────┐
                    │  2. CATALOG RETRIEVE  (ms–tens)     │
                    │  pgvector over descriptions+examples│
                    │  (NOT over packer_logs rows)        │
                    └──────────────┬──────────────────────┘
                                   │
                    ┌──────────────▼──────────────────────┐
                    │  3. GROK TOOL LOOP  (OpenAI wire)   │
                    │  same ASSISTANT_TOOLS + write tools │
                    │  runAssistantTool / applyAgentMutation
                    └──────────────┬──────────────────────┘
                                   │
                    ┌──────────────▼──────────────────────┐
                    │  4. LIVE POSTGRES                   │
                    │  tenant GUC + organization_id       │
                    │  typed SQL inside domain helpers    │
                    └─────────────────────────────────────┘
                                   │
                    Grok phrases the tool/facts result in the thread
```

**Latency budget (QA, local DB, Grok already connected):**

| Path | Target |
|---|---|
| Classified packing/carton fact + short Grok sentence | **< 2 s** first visible token (SQL < 50 ms) |
| Catalog hit + one read tool + Grok sentence | **< 4 s** |
| Write (resolve ids + `propose_mutation` + apply) | **< 6 s** to “done” / “queued for review” |
| Unknown question, 2–3 tool rounds | cap at existing `MAX_TURNS = 8` |

The classified path stays the speed king. Do not replace “this packer this week” with a tool round — that would make the question you just shipped slower.

---

## 4. Layer 1 — classified fast facts (extend, don’t replace)

**Files:** `src/lib/assistant/org-chat-facts.ts`, `enrich-turn.ts`, `carton-ask-brief.ts`

This is the “Grok living in the UI” path: NL regex/classifier → one parameterized `tenantQuery` → facts block → Grok speaks. No tool protocol.

**Next classifiers (same rules: utterance never in SQL; staff from session; org from ctx):**

| Kind | Trigger (text) | Query |
|---|---|---|
| `session_packer_packages` | already shipped | `packer_logs` by `packed_by` + week |
| `org_packages` | already shipped | org-wide pack count |
| `session_tester_units` | tested / I tested / this tech + count + window | `tech_serial_numbers.tested_by` |
| `unshipped_count` | unshipped / to-ship / pending orders + count | existing pending-orders counts (reuse `resolveLocalAiAnswer` data, but **phrase via Grok**, do not short-circuit canned local_ops when Grok is connected) |
| `open_exceptions` | exceptions / holds | `orders_exceptions` org-scoped count |
| carton | already shipped | receiving brief |

**Rule:** a classified hit **skips the tool loop**. That is the speed feature. Add a kind only when the SQL is a closed template.

**local_ops:** today it bypasses Grok with a canned sentence. Keep it as a **facts source**, not a mouth. If Grok is connected, inject the local_ops analysis as a facts block and let Grok speak (same as packing counts). Deterministic SQL, conversational voice.

---

## 5. Layer 2 — semantic catalog (the conversion adapter)

This is the piece that makes tables “naturally interactive” **without copying rows**.

**Do not embed `packer_logs` / `orders` / `receiving_line` rows.** Embed:

1. Table + column descriptions in floor English (“packages” = packing scans in `packer_logs`; “this packer” = signed-in staff).
2. Approved joins (receiving → lines → sku_catalog; packer_logs → staff; orders → shipment → tracking).
3. Metric names (`packages_packed`, `units_tested`, `unshipped_orders`).
4. Few-shot Q → tool or Q → SQL-template pairs.

**Implementation (in-repo, not a new SaaS):**

New module `src/lib/assistant/catalog/`:

- `catalog.yaml` (or TS const, matching `MUTATION_KINDS` style) — reviewed, git-diffable.
- `catalog-embed.ts` — embed descriptions with existing `src/lib/ai/embed.ts` (768-dim, same space as `entity_search_docs`).
- Store: new table `assistant_catalog_docs` **without tenant rows of business data**. Schema catalog is **global** (every org shares `packer_logs` meaning). Optional later: per-org extra synonyms. RLS still: if we ever add org-specific examples, `organization_id` + GUC from birth.
- Tool `lookup_catalog` **or** inject top-k slices into the Grok system fragment each turn (prefer inject for speed: one pgvector query in `enrichAssistantTurn`, no extra tool round).

Reuse: `src/lib/ai/embed.ts`, HNSW pattern from `entity_search_docs` (migration `2026-07-03d`). Do **not** mix 1536-dim RAG chunks with 768-dim catalog.

**Catalog retrieve is classification-adjacent:** if Layer 1 misses, retrieve 8–15 catalog rows, append as `=== WORKSPACE DICTIONARY ===`, then Grok either answers from that or calls a tool named in the slice.

---

## 6. Layer 3 — Grok tool loop (execute tool calls)

**This is the main new engine.** Today Grok is mouth-only. We already have OpenAI-wire tool calling in `src/lib/ai/hermes-tool-call.ts` (forced single tool). Ask needs a **multi-turn streaming** variant of that against SuperGrok (`cli-chat-proxy.grok.com`), reusing the existing registry.

### 6.1 New module

`src/lib/assistant/grok-agent-loop.ts`

Mirror `agent-loop.ts` but on OpenAI `chat/completions` + `tools` + `tool_calls`:

1. Advertise `listAssistantTools(ctx)` + `buildWriteTools(sessionId, …, permissions)` + UI tools, converted Zod → JSON Schema (`z.toJSONSchema` already assumed by tool registry comments).
2. Stream completion with CLI fingerprint headers already used by `ensureGrokChatConfig`.
3. On `delta.content` → emit `delta` (Ask thread).
4. On `tool_calls` → **do not paint tiles in AskThread**. Optionally emit SSE `tool` for `AssistantDock` only; Station Ask stays silent.
5. Execute via `runAssistantTool` / write-tool `run` / `ui_tool` emit — **same chokepoints**.
6. Append `role: tool` results, loop, `MAX_TURNS = 8`.
7. Org/staff never in tool arguments as authority; tools ignore model-supplied org ids if present.

### 6.2 Route change

`src/app/api/assistant/chat/route.ts`

- If Grok config is live → **always** `runGrokAssistantTurn` (tools on). Stop the `skillNeedsTools → force Anthropic` split once Grok tools are proven.
- Keep Anthropic as fallback when Grok is disconnected (current `resolveOrgAnthropicBrain`).
- Classified facts path still short-circuits **before** the loop when Layer 1 hits (speed).
- System prompt: `buildSystemCore(toolNames)` + `ORG_CHAT_SYSTEM` / `CARTON_ASK_SYSTEM` as a voice overlay + catalog slice + page skill. Grok must be told: call tools for live numbers; never invent; never cite internal ids in the mouth.

### 6.3 Protocol notes

- SuperGrok is OpenAI-wire. Anthropic `tool_use` cannot be reused as-is. One new loop, one registry.
- `hermes-tool-call.ts` stays for PO extraction (forced single tool). Do not overload it for Ask.
- Tests: DB-free, fake `streamTurn` like `agent-loop.test.ts`; assert `runAssistantTool` receives `ctx.organizationId` from auth, not from model args.

---

## 7. Layer 4 — typed CRUD (the write half of “full CRUD”)

### 7.1 Law (do not violate)

From `MUTATION_KINDS` + `registry.test.ts`:

- Trust is **not** chosen by the model.
- `auto` only if **all three**: reversible (captured inverse), non-destructive, already operator-reachable under the same permission.
- Identity / vocabulary / settings masters stay `review` forever (`staff.*`, `reason_code.*`, `setting.*`).
- Widening `auto` = same PR edits `MUTATION_KINDS` **and** the locked list in `registry.test.ts` with a `WIDENED YYYY-MM-DD` comment.
- Evidence: `getMutationTrustStats` (`trust-stats.ts`). No runtime auto-promote.

### 7.2 How a new CRUD verb is added (every time)

1. Domain helper already exists and takes `organizationId` + a tenant client (`upsertOrderAssignment`, `completeTriage`, …).
2. Register `MUTATION_KINDS['work_assignment.upsert_order_staff']` with `permission` copied from the UI route (never looser).
3. Start `trust: 'review'` unless the three auto criteria are obviously true (listing rule / photo move pattern).
4. `dispatchApply` case returns `{ ok, inverse, targetRef }`.
5. Payload Zod in the helper; model cannot pass table names.
6. Page skill teaches the verb (“assign this order to me” → resolve order → `propose_mutation …`).
7. Pin trust in `registry.test.ts`.
8. Domain unit test with `fakes()` (no DB).

**There is no generic `table.insert` / `rows.update` tool.** If a table is not a kind, Ask cannot write it.

### 7.3 First CRUD wave (highest ROI, helpers already exist)

| Kind | Helper | Permission (mirror UI) | Proposed trust |
|---|---|---|---|
| `work_assignment.upsert_order_staff` | `src/lib/work-assignments/upsert-order-assignment.ts` | same as To-ship assign | `auto` if reversible + already on desk; else `review` until proven |
| `order_flag.set` | `src/lib/orders/order-flags.ts` | order flag route | `auto` if UI is one click |
| `receiving.complete_triage` | `src/lib/receiving/complete-triage.ts` | receiving perm | start `review` or `auto` if Unbox already does it with one control |
| `receiving.acknowledge_unbox` | `src/lib/receiving/acknowledge-unbox.ts` | receiving perm | same three-property test |
| `receiving.receive_line_units` | `src/lib/receiving/receive-line.ts` | receiving perm | likely `review` first (creates units) |

**Explicitly later / red:** packing complete that ships, money, delete evidence, publish workflow, outbound send, ingest of whole order files. Those stay UI or `review`.

### 7.4 Review queue (unblock `staff.create` etc.)

`applyAgentMutation` already inserts `status='proposed'`. Missing: a human apply route.

- `POST /api/assistant/mutations/:id/apply` (and reject) gated `studio.manage` or the kind’s permission.
- Reuse `dispatchApply` so apply-from-review is the same writer as auto.
- Keep `actor_kind: 'agent'` on the mutation row (existing T13/LAWS) so trust stats stay valid; record the human as reviewer.
- Wire `AssistantEditsTray.tsx` to Apply / Reject.

Without this, “full CRUD” on masters is a dead letter.

### 7.5 Reads that make writes possible

Follow the photo-move pattern: resolve tools **before** mutate.

Already: `resolve_item_number`, `list_staff`, `resolve_receiving_line_for_order`, `list_receiving_line_photos`, `hybrid_entity_search`, `get_order_lookup`.

Add as needed: `resolve_order` (spoken number → id in this org), `resolve_receiving_carton` (tracking / “this carton”). Never let the model invent ids.

---

## 8. Optional later: constrained SELECT-only SQL

Only after Layers 1–4 are live and catalog coverage is good.

- Read replica or `BEGIN READ ONLY` on tenant connection with GUC already set.
- AST allowlist (SELECT/CTE, no COPY, no INTO, function whitelist, forced LIMIT). Pattern: `agent-sql` / Bruin CTE wrap.
- Inject `organization_id = $org` even though RLS is the backstop.
- Tool name `run_readonly_sql` with permission `assistant.chat` **and** a feature flag. Default off.
- **Never** a write SQL tool.

This is the “chat any table” escape hatch. It is slower and less accurate than catalog+tools (dbt 2026: semantic layer still beats free SQL). Do not lead with it.

---

## 9. UI / mouth

- **Ask stays a chat.** `AskThread`: user bubble, Grok as display copy, empty “Ask about this workspace.” No tool tiles, no working-set, no dual bubbles.
- Station host: Ask occupies the ticket slot (`StationAskPane`). Composer is still `StationComposerHost`.
- Writes that apply now: Grok says “Done — Maya is Pick and Packed on this listing.” WeldedFeedbackPanel stays the staff reaction on the mouth for scan confirms; do not add a second toast for Ask.
- `navigate` / `highlight` UI tools may still fire (row highlight, jump to /pack) without a tile.
- Do not resurrect `ComposerAskStage` working set.

---

## 10. Tenancy and security (non-negotiable)

Every new query and write:

1. `organizationId` / `staffId` from `withAuth`.
2. `tenantQuery` / `withTenantTransaction`.
3. Explicit `AND organization_id = $n`.
4. User text never in SQL (classifier / catalog retrieve / tool args that are Zod-validated identifiers only).
5. “This packer” / “I” = `ctx.staffId`. If null, say no packer is signed in (already implemented).
6. Cross-org staff id fails closed (staff lookup `id + organization_id`).
7. Rate limit already per org (`assistant-chat`).
8. Do not ETL tenant rows into Pinecone or a shared vector namespace.

Embeddings allowed: catalog descriptions (global schema meaning), existing `entity_search_docs` (already org-scoped), notes/photos later (org-scoped). Not packing/order fact tables.

---

## 11. Phased implementation (PR-shaped, mergeable on `main`)

### PR 1 — Grok tool loop (reads)

**Why first:** Unlocks “ask anything the read tools already know” without Anthropic credits. Fast classified path unchanged.

**Files:** `src/lib/assistant/grok-agent-loop.ts` (+ test), `src/app/api/assistant/chat/route.ts`, Zod→OpenAI schema helper, `agent-loop.ts` system core reused.

**Done when:** QA Ask, Grok connected, “look up tracking QA-MOCK-TRK-PO” calls `get_receiving_by_tracking` / carton path; packing-count question still **does not** enter the tool loop; AskThread shows no tool tile; `npx tsx --test` grok-agent-loop + enrich-turn.

### PR 2 — Catalog retrieve in enrich

**Files:** `src/lib/assistant/catalog/*`, migration `assistant_catalog_docs` (if stored), seed of packing/receiving/orders/staff descriptions, inject into enrich-turn, embed job using `src/lib/ai/embed.ts`.

**Done when:** “what tables know about packing?” retrieves `packer_logs` description; packing-count still classified (catalog is miss-path). No business rows in the catalog table.

### PR 3 — More classified facts (speed)

**Files:** `org-chat-facts.ts` + tests. Tester week, unshipped count, exceptions. Route local_ops through Grok phrasing when Grok is connected.

**Done when:** “how many units did I test this week?” is a facts block + Grok sentence, no tools.

### PR 4 — CRUD wave 1 (typed mutations)

**Files:** `registry.ts`, `registry.test.ts` (locked auto list), `apply-agent-mutation.ts`, domain helpers as-is, page-skills for Unbox / To-ship, resolve_order tool if needed.

**Kinds:** `work_assignment.upsert_order_staff`, `order_flag.set`, then receiving triage/ack after the three-property test.

**Done when:** QA admin in Ask: “assign this to-ship order’s packer to me” applies or queues; revert works; permission denial is spoken; no generic SQL.

### PR 5 — Review apply/reject

**Files:** new route `src/app/api/assistant/mutations/[id]/apply/route.ts` (+ reject), `AssistantEditsTray.tsx`, permission registry + route-permission-manifest test (`new-route` skill).

**Done when:** `staff.create` proposal can be applied by a human with `admin.manage_staff`; trust stats still count as agent-originated.

### PR 6 — (optional) read-only SQL hatch

Flagged, AST, replica, off by default. Only if catalog+tools still miss too often.

---

## 12. Key decisions

1. **Postgres stays the SoT.** No warehouse dump into an “AI-native” store. Catalog is the adapter.
2. **Classified SQL beats tools beats free SQL** for speed and safety. Packing-count stays Layer 1.
3. **Grok runs the tool loop** on OpenAI wire; Anthropic is fallback, not the default mouth.
4. **CRUD = named mutation kinds**, never table-level execute. Same permission as the UI.
5. **Ask remains a chat** (no tool tiles). Tools are silent server work.
6. **Trust widening is a PR**, not a runtime promotion. Masters stay review.
7. **Embeddings = dictionary + entity search**, not fact tables. Reuse 768-dim embed pipeline.
8. **Session identity is the security boundary.** “This packer” cannot be a name in the prompt that becomes a SQL bind without an org-scoped staff lookup tool.

---

## 13. Test and eval gates

- Domain tests: `npx tsx --test src/lib/assistant/*.test.ts` (shim for enrich-turn). New grok-agent-loop tests DB-free.
- Mutation: `registry.test.ts` locked auto list; apply-agent-mutation fakes.
- Tenancy: every new SQL asserted to pass `organizationId` as a param (`cap.params`).
- Route: `npm run tenancy:guard:check` if a new route; `new-route` skill for apply/reject.
- Live QA: org `…0002`, `qa-admin@cycleforge.test`, Ask on carton 7114:
  - packing this week → count, no Bose mix-in
  - tell me about this order → Bose/AirPods/Sony brief
  - a read-tool question after PR 1
  - a mutation after PR 4
- UI: `ds_contract` / `ds_critique` on AskThread if chrome changes; no new primitives.
- Do not restart `cycleforge-dev` / `garisek-dev`.

---

## 14. What we will not build

- ETL of live tables into pgvector / Pinecone as the query engine.
- `execute_sql` writes, `DROP`, dynamic table names from the model.
- Per-tenant copy of the schema catalog (unless a tenant truly has a custom schema).
- Tool-calling tiles on Station Ask.
- Forcing Anthropic whenever a skill mentions `propose_mutation` (after PR 1).
- Auto-applying `staff.create` / settings from chat.

---

## 15. Suggested first slice to implement

**PR 1 (Grok tool loop) + keep Layer 1 packing/carton as-is.** That is the smallest change that makes Ask “query the backend like Grok lives in the UI” for every **existing** read tool (`get_order_lookup`, `hybrid_entity_search`, `get_packing_kpi`, `get_receiving_by_tracking`, …) without inventing CRUD or a catalog yet.

CRUD and catalog are additive once the loop exists; they are useless if Grok still cannot call `runAssistantTool`.

---

# Research amendments — 2026-09-04 (Fable 5.1)

Everything below is **additive**. It does not replace §1–§15 and does not flip the locked decisions in §12 / §14. Source of every measurement and citation: [`docs/eval/FABLE-5.1-ASK-AI-RESEARCH.md`](../eval/FABLE-5.1-ASK-AI-RESEARCH.md). Line numbers refer to the tree at the time of the pass.

## 16. Industry mapping (steal / refuse)

- **pgai semantic catalog (Timescale).** Steal the three catalog kinds — object descriptions, SQL/tool examples, facts — embedded as *meaning* and retrieved per question; steal planner validation (`EXPLAIN`) for the optional §8 hatch only. Refuse letting a generator write free SQL as Ask's primary path.
- **dbt Semantic Layer benchmark (2026-04).** Steal the failure-mode rule: a covered question is answered by a governed definition or **refused**, never by a confident wrong number — tool `ok:false` must reach the operator as "I can't see that", not as an invented count. Steal "modelling moves accuracy most": the catalog is where effort goes. Refuse dbt Cloud as a dependency.
- **Wren AI.** Steal session properties as bound parameters (`organization_id` is chosen by the app, bound by the engine, never concatenated) — already `tenantQuery`'s contract; steal required-vs-optional properties (a missing required org is an error, never an open query). Refuse a second engine re-implementing RLS above Postgres.
- **Cube.** Steal "measures and dimensions by name" as the model's vocabulary (that is what a typed tool is) and compile-time governance (the helper compiles the tenant predicate in). Refuse deploying Cube Core beside Neon for a dozen metrics; revisit past ~40 metrics or when a customer asks for BI.
- **Snowflake Cortex Agents / Databricks Genie.** Steal immutable per-turn tenant attributes (ours is `SET LOCAL` via `set_config(…, true)`, transaction-scoped) and governance-enforced row filters. Refuse copying operational rows into a warehouse.
- **Vanna 2.0.** Steal user-aware tools (identity flows into every tool call — `AssistantToolCtx`) and the per-user audit trail for reads (§22 timing/usage log). Refuse training-and-executing example SQL.
- **Relta.** Steal the refusal rule ("does not generate SQL for any other metrics"). Refuse per-user DuckDB slices — a copy per turn contradicts Postgres-as-SoT.
- **Oracle NL2SQL + Database Tools MCP.** Steal execute-under-the-caller's-identity with the store's permissions (already: `ctx` + FORCE RLS) and separated enrichment vs query connections (owner pool vs `tenantPool`). Refuse an in-process MCP round trip for Ask's own registry.
- **agent-sql / object-capability sandboxing.** Steal the AST sanitiser shape (tenant guard on every table reference, SELECT-only, function allowlist, forced LIMIT) for §8 only. Refuse using either to justify any write SQL.
- **AWS multi-tenant LLM analytics (PAR, 2026-06) + SaaS Factory RLS.** Steal "the LLM never sees the tenant id" (tools ignore model-supplied org ids; ctx is the only source) and transaction-scoped GUCs. Refuse a separate reasoning tier that validates questions before data access — the classifier and the typed tools already bound what can be asked.
- **RAG-MCP / tool-count research.** Steal retrieval-based tool subsetting (≈7 adaptive ≈ 50 fixed; >50 % fewer prompt tokens). Refuse a fixed 41-tool advertisement on Grok.
- **Semantic-caching production study (2026-01).** Steal intent-driven prompt assembly (classifier → subset). Refuse a cross-tenant semantic answer cache.

## 17. Grok tool-loop protocol

**Module:** `src/lib/assistant/grok-agent-loop.ts` (+ `grok-agent-loop.test.ts`). **Shared dispatch:** extract `runWriteTool` from `src/lib/assistant/agent-loop.ts:244` into `src/lib/assistant/tools/dispatch.ts` (`dispatchToolCall(name, rawInput, ctx, writeMap, runTool)`) and have both loops call it — one chokepoint for reads, writes and UI tools. **Schema helper:** `src/lib/assistant/tools/openai-schema.ts` (`toOpenAiFunctionTool`, `toResponsesFunctionTool`; strips `$schema`, keeps `additionalProperties:false`, no `strict`).

### 17.1 Wire adapters (both behind one `GrokLoopDeps.streamTurn` seam)

The SuperGrok proxy's official client uses the **Responses API** (`~/.grok/models_cache.json`: `grok-4.6.api_backend = "responses"`; Grok Build wire analysis: `POST /v1/responses`), while Cycle Forge's working content stream uses `/v1/chat/completions`. PR 0 (§24) picks the adapter; both are specified so the choice is a config, not a rewrite.

**A. Chat Completions** (`POST {baseURL}/chat/completions`):
```json
{ "model": "grok-4.6", "stream": true, "tool_choice": "auto", "parallel_tool_calls": true,
  "messages": [ {"role":"system","content":"…"}, …history…, {"role":"user","content":"…"} ],
  "tools": [ { "type":"function", "function": { "name":"get_receiving_by_tracking", "description":"…", "parameters": {…} } } ] }
```
Stream reader: accumulate `choices[0].delta.tool_calls[]` into a `Map<index, {id, name, args}>` (never an array — relays start at non-zero `index`, vercel/ai#18333); concatenate `function.arguments` fragments; a round is a **tool round** if the map is non-empty at stream end, regardless of `finish_reason` (some relays send `"stop"`, open-webui#21768). Text deltas (`delta.content`) are emitted as `delta` SSE as they arrive. Results go back as `{"role":"tool","tool_call_id":id,"content":JSON}` — one message per call, in call order — followed by the next request. `reasoning_content` deltas are dropped (already the behaviour of `streamHermesCompletion`).

**B. Responses** (`POST {baseURL}/responses`):
```json
{ "model": "grok-4.6", "stream": true, "store": false, "tool_choice": "auto", "parallel_tool_calls": true,
  "input": [ {"role":"system","content":"…"}, …history…, {"role":"user","content":"…"} ],
  "tools": [ { "type":"function", "name":"get_receiving_by_tracking", "description":"…", "parameters": {…} } ] }
```
Events: `response.output_text.delta` → `delta` SSE; `response.output_item.done` with `item.type === "function_call"` → `{call_id, name, arguments}` (xAI documents the call arriving whole; still accumulate `response.function_call_arguments.delta` by `item_id` defensively); `response.completed` ends the round. Results go back as input items `{"type":"function_call_output","call_id":…,"output":JSON}` appended to the **full** `input` re-sent next round. **Never** use `previous_response_id`; always send `store: false` (tenant conversation state must not live on xAI's servers; adds to §14).

**Wire decision (PR 0, measured 2026-09-05 04:07Z, QA org session, `grok-4.6`, one advertised tool):** adapter **A — Chat Completions, streaming** (`stream:true`, `tool_choice:'auto'`, `parallel_tool_calls:true`, `reasoning_effort:'low'`). All four variants returned 200 with a correct `get_order_lookup({trackingNumber})` call; on A the call arrives **whole** in one `delta.tool_calls` chunk at `index 0` with `finish_reason:'tool_calls'`, and the `role:'tool'` follow-up is accepted (final sentence starts streaming ≈0.7 s later). Adapter B works equally (`function_call_arguments.delta` ×1 then `output_item.done` with the whole call; `function_call_output` accepted; `store:false` accepted) but is not needed and carries §25 Q1, so it stays specified, not built. The buffered round (§17.5) is proven on `/chat/completions` (`message.tool_calls`) and stays a fallback. Numbers: §23.B.

### 17.2 Headers, model, reasoning

`aiRequestHeaders(grokConfig, { 'X-Source': 'assistant' })` — i.e. `Authorization: Bearer <session token>`, `X-XAI-Token-Auth: xai-grok-cli`, `x-grok-model-override: <model>`, `x-grok-client-version: 1.0.13` (`GROK_CLI_VERSION`; missing → 426), `x-grok-client-identifier: grok-shell`, `User-Agent`. Model from `ensureGrokChatConfig`. Send `reasoning_effort: "low"` for Ask (proxy default is `high`); PR 0 measures first-token with `low` vs default and the plan records the number. **Measured (PR 0):** time to the tool call 2,288 ms default → 1,331 ms `low` on Chat Completions streaming, 2,393 → 1,372 ms on Responses streaming (−42 %, not halved). Both endpoints accept the field (`reasoning_effort` on chat, `reasoning: { effort }` on responses); reasoning still streams (`delta.reasoning_content`, 109 chars at `low`) and is dropped as today. **PR 1 correction:** the field must also ride the CLASSIFIED phrasing round (`streamHermesCompletion`), which is not part of the loop and was inheriting the proxy default. It is gated on `config.source === 'grok'` because other managed endpoints 400 on params they do not know. Measured effect on that path: 36.6 s → 6.6 s (§23.A).

### 17.3 Loop

1. `history` = `loadAssistantHistory` (20 turns) mapped to wire roles (the Grok branch sends none today — fixed here).
2. System = `buildSystemCore(advertisedNames)` + voice overlay (`CARTON_ASK_SYSTEM` / `ORG_CHAT_SYSTEM` when `prepared.voice` is set) + catalog slice (§19) + `buildContextFragment(context)`. Byte-stable prefix first.
3. Advertised tools = `selectToolsForTurn()` (§18), all converted by the schema helper; write tools only when `ctx.permissions` allows a kind on this page.
4. Round: stream; emit deltas; on tool calls emit `tool_start`/`tool_end` (the SSE `tool` event stays — `AskThread` never reads `activeTool`, `AssistantDock` shows its spinner line; nothing to suppress), execute via `dispatchToolCall` (UI tools → `ui_tool` SSE + acknowledgement), append results, loop. `MAX_TURNS = 8` shared with `agent-loop.ts`.
5. Timeouts: 30 s to first byte, 120 s per round, 10 s per tool, total under `maxDuration 300` with the "ran out of steps" sentence on exhaustion. Per-org round-trip budget logged (§22).
6. `401` mid-loop → `ensureGrokChatConfig` once → retry the round; second 401 → `error` SSE "Grok session expired — reconnect in Settings".
7. Org/staff: tool args never carry authority; `ctx` is the only org; "me" resolves to `ctx.staffId` in the page skill and is re-checked in the kind wrapper.

### 17.4 Route change (`src/app/api/assistant/chat/route.ts`)

Delete the `skillNeedsTools` split (`:189`) once PR 1 lands: Grok connected → `runGrokAssistantTurn` for every non-classified turn; Anthropic only when Grok is disconnected (`resolveOrgAnthropicBrain`). The classified fact paths still short-circuit before the loop. `local_ops` becomes a facts block for whichever brain speaks (§4 amendment, report §D7).

**As built (PR 1):** "short-circuit before the loop" is implemented as a PHRASING ROUND — when enrichment set a voice (carton brief / workspace facts) the numbers are already in the message, so the route streams one completion with **no `tools` array at all** rather than entering `runGrokAssistantTurn`. Advertising 41 tools on a turn whose answer is already computed would make the fastest question in the product the slowest one. `done.mode` stays `hermes` on that path (matching §23.A turn 1) and is `grok` on a real tool turn.

### 17.5 Fallback (buffered tool round)

If PR 0 shows streaming-with-tools fails on the chosen endpoint (HTTP 4xx, or a stream that ends with narration containing a `<tool_call>` block instead of a call): run the tool round **non-streaming** (`stream:false`, the `hermes-tool-call.ts` request shape, `recoverToolArgsFromContent` as the last resort), then stream the **final** completion with `tools` omitted. Remember the working mode per org in memory for one hour (`provider-health` style) so every turn does not pay the failed attempt.

### 17.6 Acceptance tests (DB-free, `npm run test:assistant`)

- Scripted stream: text + one tool call (whole) → `dispatch` called with `ctx.organizationId` from auth, results appended with the matching `tool_call_id`/`call_id`, final text persisted.
- Scripted stream: tool call split across three chunks starting at `index: 1` → accumulated correctly.
- Scripted `finish_reason: "stop"` with a non-empty call map → still a tool round.
- Scripted 400 on the streamed round → fallback path runs non-stream then streams the final; second turn skips straight to fallback (memoized).
- Model-supplied `organizationId` in tool args is ignored (tool receives ctx org).
- `MAX_TURNS` reached → "ran out of steps" text, `ok: true`.
- Responses adapter: `function_call` item + `function_call_output` echo; `store:false` present; `previous_response_id` absent.

## 18. Tool advertisement subsetting

**Module:** `src/lib/assistant/tools/advertise.ts` → `selectToolsForTurn({ page, station, skill, intents, catalogHits, permissions }) : string[]`, applied to both loops.

- **Core (always, if permitted):** `hybrid_entity_search`, `exact_id_serial_search`, `get_order_lookup`, `get_receiving_by_tracking`, `list_staff`, `revert_mutation`.
- **Page pack (static map in the same module, mirrors `page-skills.ts`):** `unbox` → `resolve_receiving_line_for_order`, `list_receiving_line_photos`, `resolve_receiving_carton` (new), `propose_mutation`; `shipping-orders` → `resolve_item_number`, `resolve_order` (new), `get_assignments`, `propose_mutation`; `packing-station` → `get_unit_journey`, `search_notes`, `get_top_reasons`, `get_packing_kpi`; `operations` / `studio` → their existing skill lists; tool-forge gateway tools only when `page === 'tool-forge'`.
- **Catalog-retrieved:** each catalog entry names `tools: string[]`; union the top-k hits' tools.
- **Cap 12**, ordered core → page → catalog; UI tools (`navigate`, `highlight`) always; studio canvas tools only on `studio`.
- `propose_mutation` description lists only kinds ∈ (permitted ∩ page pack verbs); the tool still accepts any permitted kind (description is a hint, `run` is the gate — unchanged).

**Measured baseline:** 41 tools / 26,529 bytes / 3,293-char system core. **Target:** ≤12 tools / ≤8,000 bytes. **Tests:** `unbox` + `['receiving']` → includes the receiving pack and `propose_mutation`, excludes `tool_forge.*` and studio tools; a caller without `receiving.view` never sees receiving tools; wire bytes under the cap for every page in the map.

## 19. Catalog storage decision

**Decision: TS module is the source of truth; a table is the embedding cache; tenancy = platform-owned NULL-org rows with hand-written FORCE policies (the `insight_links` shape), never a non-tenant table and never dogfood-org rows.**

- **SoT:** `src/lib/assistant/catalog/catalog.ts` — `CATALOG: CatalogEntry[]` with `{ key, kind: 'table'|'column'|'join'|'metric'|'example'|'verb', title, floorTerms: string[], description, tools: string[], mutationKinds?: string[], classifier?: OrgChatKind, sqlTemplate?: string, examples: Array<{ q: string; answer: 'classifier'|'tool'|'verb'; ref: string }> }`. Reviewed in git; `catalog.test.ts` asserts every `tools[]`/`mutationKinds[]` name exists in `ASSISTANT_TOOLS` / `MUTATION_KINDS` and every entry has ≥1 example.
- **Cache table:** migration via the `db-migration-author` skill, `assistant_catalog_docs(id bigserial, organization_id uuid NULL /* NULL = platform-owned global row */, catalog_key text, kind text, title text, body text, content_hash text, embedding vector(768), embedded_at timestamptz, created_at, updated_at)`; partial unique `(catalog_key) WHERE organization_id IS NULL`, org-led unique `(organization_id, catalog_key)`; HNSW cosine on `embedding`; **hand-written** `FORCE ROW LEVEL SECURITY` with `tenant_read USING (organization_id IS NULL OR organization_id = current_setting('app.current_org', true)::uuid)` and `tenant_write WITH CHECK (organization_id = current_setting(...)::uuid)`; header copies the `2026-07-03n` "DELIBERATE TENANCY EXCEPTION" block. Not `enforce_tenant_isolation()` (it refuses nullable org and hides NULL rows).
- **Seed/embed job:** `scripts/seed-assistant-catalog.ts` on the **owner pool** (the only path that may mint NULL-org rows): upsert by `catalog_key`, skip when `content_hash` unchanged, embed with `embedText` (768, same space as `entity_search_docs`; never the 1536-dim RAG chunks), record usage via `recordAiUsage`. Run on deploy and by hand.
- **Retrieval:** `retrieveCatalogSlice(orgId, question, k = 10)` in `src/lib/assistant/catalog/retrieve.ts`, called from `enrichAssistantTurn` on classifier miss: one query embed under a 300 ms budget (as `hybrid-retrieval.ts:96`), pgvector cosine over global + org rows, degrade to pg_trgm over `title || floorTerms` when the embed fails. Output: `=== WORKSPACE DICTIONARY ===` block (≤ 1,500 chars) + the union of `tools[]` for §18.
- **Seed contents (v1):**
  - *packing:* `packer_logs` = "packages" (one row per packing scan; `packed_by` → `staff`; `created_at` in the org's warehouse timezone); metric `packages_packed` (classifier `session_packer_packages` / `org_packages`); `get_packing_kpi` = size-weighted pace for one day; examples "how many packages did I pack this week" → classifier.
  - *receiving:* `receiving_carton` = carton; `receiving_line` = expected/received line; tracking lives on `shipping_tracking_numbers` via `receiving_carton.shipment_id` and legacy `receiving_scans`; pairing states UNFOUND/MATCHED/WAIVED in floor words; tools `get_receiving_by_tracking`, `resolve_receiving_carton`, `resolve_receiving_line_for_order`, `list_receiving_line_photos`; verb `receiving_photo.reassign`.
  - *orders:* `orders` = marketplace order; `work_assignments` TEST = Pick slot, PACK = Packed slot; `order_flags` = row flag; tools `get_order_lookup`, `get_assignments`, `resolve_order`; verbs `work_assignment.upsert_order_staff`, `order_flag.set`, `automation_rule.upsert_item_staff`.
  - *staff:* names resolve via `list_staff` (org-scoped); "me"/"this packer" = the signed-in session; ids are never spoken.
- **Per-org later:** synonyms/examples as org-stamped rows in the same table under the write policy; no schema change.

**Acceptance:** with a fake embed, "what tables know about packing?" retrieves the `packer_logs` entry; the packing-count question still hits the classifier before retrieval; `tenancy:coverage` lists the table as a documented exception; no business row is ever inserted (test greps the seed for table names only).

## 20. CRUD wave 1, decided

Permission strings are copied from the routes that already perform the action. Three properties for `auto`: reversible (inverse captured), non-destructive, already operator-reachable under the same permission.

| Kind | Helper | Permission (route) | Trust | Inverse captured by the wrapper | Test file |
|---|---|---|---|---|---|
| `work_assignment.upsert_order_staff` | `upsertOrderAssignment` (`src/lib/work-assignments/upsert-order-assignment.ts`) | `orders.create` — `POST /api/orders/assign` (`route.ts:422`) | **auto** | read prior via `getActiveOrderAssignee(orderId, workType, client)` → inverse `{ orderId, workType, staffId: prior ?? null }` | `src/lib/assistant/mutations/order-assignment-kind.test.ts` + `registry.test.ts` locked list (`WIDENED 2026-…`) |
| `order_flag.set` | `setOrderFlag` (`src/lib/orders/order-flags.ts`) | `orders.create` — `POST /api/orders/[id]/flag` (`requireRoutePerm(req, 'orders.create')`) | **auto** | read `order_flags.flag` for `(org, order)` in the same tx → inverse `{ orderId, flag: prior ?? null }` | `order-flag-kind.test.ts` + locked list |
| `receiving.receive_line_units` | `receiveLineUnits` / `unreceiveLineUnits` (`src/lib/receiving/receive-line.ts`) | `receiving.mark_received` — `POST /api/receiving/mark-received-po` (`:1696`) | **review** | inverse = `unreceiveLineUnits` (409 when a serial has advanced — surface the 409 as "can't undo, units already moved") | `receive-line-kind.test.ts` |
| `receiving.complete_triage` | `completeTriage` | `receiving.scan_po` | **not a kind in wave 1** | none exists (no "uncomplete" writer; 422 without shelf + lane, which chat cannot set) — add only when Arrival gains an undo | — |
| `receiving.acknowledge_unbox` | `acknowledgeUnbox` | `receiving.mark_received` | **not a kind** | set-once milestone, "never re-stamps or overwrites" — no inverse by design and not an operator intent | — |

Wrapper rules for the two `auto` kinds (in `dispatchApply`): (1) `SELECT id FROM orders WHERE id = $1 AND organization_id = $2` first — 404 otherwise; (2) `staff.id + organization_id + active` for any staff id — 404 otherwise; (3) actor = `ctx.staffId`, never a payload field; (4) the helper's own reads gain `AND organization_id = $n` in the same PR (report gap E4), asserted by a `fakes()` domain test on `cap.params`; (5) `afterCommit` → `invalidateOrderViews` for the assignment kind (same as `automation_rule.upsert_item_staff`). Payload Zod: `{ orderId: int>0, workType: 'TEST'|'PACK', staffId: int>0|null }` and `{ orderId: int>0, flag: OrderRowFlagId|null }`. New read tool `resolve_order` `{ orderNumber?: string, orderId?: int }` → `{ id, orderId, title, lane }` in this org (or `ambiguous: [...]`). Page skills: To-ship teaches "assign … to me" → `resolve_order` (or the selected row) → `propose_mutation work_assignment.upsert_order_staff` with `staffId` = the signed-in staff; "flag this as …" → `order_flag.set`. Denials: relay the exact missing permission (existing `write-tools.ts` behaviour).

## 21. Review apply / reject

- **Routes** (new-route skill shape): `src/app/api/assistant/mutations/[id]/apply/route.ts` and `…/[id]/reject/route.ts`. Gate: `requireRoutePerm(req, 'assistant.chat')` as the floor, then inside the helper `MUTATION_KINDS[kind].permission` against `ctx.permissions` (e.g. `staff.create` → `admin.manage_staff`, `setting.update` → `admin.manage_features`). Body: `{ reviewNotes?: string ≤ 2000 }`.
- **Helper:** `applyProposedMutation(mutationId, orgId, reviewerStaffId, permissions, deps)` and `rejectProposedMutation(...)` in `src/lib/assistant/mutations/apply-agent-mutation.ts`: `SELECT … FOR UPDATE` on `(organization_id, id)`; status must be `proposed|under_review|approved` else 409; run `dispatchApply` for the kind (review kinds gain their `case` here: `staff.create` → the staff writer used by `/api/admin/staff`, etc.); on success `UPDATE agent_mutations SET status='applied', applied_by=$reviewer, applied_at=NOW(), review_notes=$notes, extra_audit = extra_audit || {inverse, trust:'review', reviewer}`; `proposed_by_staff_id` stays the proposer so `trust-stats` still counts it as agent-originated. Reject: `status='rejected', review_notes`.
- **Audit:** add `AGENT_MUTATION_APPROVE: 'agent_mutation.approve'` and `AGENT_MUTATION_REJECT: 'agent_mutation.reject'` to `src/lib/audit-logs.ts`; side-effects as apply (audit + ops_event + Ably).
- **Who may apply:** any human holding the kind's permission, including the proposer (the review gate is human-vs-AI, not four-eyes; four-eyes is §25 Q2).
- **Tray:** `AssistantEditsTray.tsx` gains Apply / Reject on `proposed` rows (`ds_contract`/`ds_critique` first; no new primitive).
- **Tests:** DB-free `apply-agent-mutation.test.ts` cases (apply happy path, wrong org 404, wrong status 409, missing permission 403, reject); `route-permission-manifest.test.ts` rows for both routes; `npx tsx scripts/tenancy-guard.ts --check`.

## 22. Latency budget — measured hypotheses

Measured on 2026-09-04 from the dev box to the dev Neon pooler (us-east-1), QA org:

| What | Measured |
|---|---|
| `pool.query('SELECT 1')` (one round trip) | 83–96 ms |
| `tenantQuery('SELECT 1')` (BEGIN + set_config + query + COMMIT) | 340–696 ms |
| three queries on one `withTenantConnection` client | 553 ms |
| classified packing COUNT — Postgres execution (`EXPLAIN ANALYZE`) | **0.034 ms** (Index Scan `idx_packer_logs_organization`, expression filter) |
| `fetchOrgChatFacts` end-to-end | 339 ms |
| `runAssistantTool('get_receiving_by_tracking')` | 356 ms |
| `runAssistantTool('get_order_lookup')` | 355 ms |
| `hybridSearch('QA-MOCK-TRK-PO')` exact bypass (up to 19 queries) | 1,199 ms |
| advertised tool JSON (admin) | 26,529 bytes; system core 3,293 chars |

Hypotheses to confirm on QA (log one `[ask-timing]` line per turn with `enrich_ms, catalog_ms, first_token_ms, tool_round_ms[], tools_advertised, wire_bytes, total_ms`, and `recordAiUsage(context:'ask')`):

- **H1** One tenant connection per turn (threaded through `AssistantToolDeps.query` and `EnrichTurnDeps`) cuts DB time of a two-tool turn by ≥60 %. **Built 2026-09-05 as ROUND-scoped, not turn-scoped** (`src/lib/assistant/tenant-session.ts`): a batch spans one round's tool execution (~350 ms) and the two classified facts queries, and the session holds nothing between rounds. Turn-scoped would park an idle-in-transaction connection on the pooler across every model round trip — up to `MAX_TURNS` of them, a minute or more — which is a worse failure than the latency it saves. Measured per-tool cost inside a batch: 363–424 ms.
- **H2** Identifier questions route to `get_receiving_by_tracking` / `resolve_receiving_carton` (1 query), never `hybrid_entity_search` (19); expect < 100 ms in-region.
- **H3** `reasoning_effort: "low"` on the proxy halves first-token time versus the default `high`; record both. **Measured (PR 0, one tool, §23.B):** −42 % to the tool call (2,288 → 1,331 ms), −33 % to first byte (803 → 683 ms); not halved — keep `low`, and let H4 (subsetting) carry the rest.
- **H4** Tool subsetting (≤12 tools, ≤8 KB) lowers first-token time measurably versus 41 tools; record both on the same question.
- **H5** The classified path from us-east-1 lands first visible token < 2 s with Grok connected; the wrapper, not SQL, is the floor.
- **H6** Range predicate on `created_at` (org timezone computed in Node) + `(organization_id, created_at)` index keeps the COUNT at index-only cost when `packer_logs` grows past the QA fixture size.

## 23. Probe plan (QA, no server restart)

**A. Ask SSE probe — `scripts/probe-ask-sse.mjs`.** Mint a pinless session exactly as `scripts/request-shape.mjs` does (`GET /api/auth/staff-picker` + `POST /api/auth/signin` with `x-tenant-slug: cycleforge-qa`, `AUTH_PINLESS_SIGNIN=true` on `:3050`; take `cf_sid`). Then `POST /api/assistant/chat` with `{ sessionId, message, context }` and print every SSE event with a timestamp. Turns:
1. `"how many packages did this packer pack this week?"` on `context.page='unbox'` with `selection {kind:'receiving', id:7114}` → expect `meta.provider`, deltas, `done.mode` (`hermes` when Grok is the mouth), **no** `tool` event, `Packages packed: N` not a Bose mix-in.
2. `"tell me about this order"` same context → carton voice, product names (Bose / AirPods fixtures), no internal ids.
3. `"look up tracking QA-MOCK-TRK-PO"` → today: no `tool` event, a hybrid-search hit phrased by Grok; after PR 1: `tool` events for the resolver, prose naming **two** cartons (7114 PO-matched, 50540 unmatched).
4. After PR 4: `"assign this order's packer to me"` on `shipping-orders` with a selected order → `tool` `propose_mutation`, `done`, a row in `agent_mutations` with `status='applied'`, then `"undo that"` → `revert_mutation`.

**PR 1 results — `node scripts/probe-ask-sse.mjs`, 2026-09-05, dev server `:3050` (Next dev, not a production build), QA org, QA Admin, Grok connected:**

| turn | what | provider · mode | first visible token | total | tools run |
|---|---|---|---|---|---|
| 1 | "how many packages did this packer pack this week?" (carton selected) | grok · hermes | **6.6 s** (3.3 s after `meta`) | 7.4 s | none — classified, as required |
| 2 | "tell me about this order" | grok · hermes | **11.3 s** (9.9 s after `meta`) | 14.6 s | none — carton brief |
| 3 | "look up tracking QA-MOCK-TRK-PO" | grok · **grok** | **10.3 s** | 12.2 s | `get_receiving_by_tracking` (379 ms), `hybrid_entity_search` (372 ms), then `navigate` |
| 4 | "who is assigned to pick and pack on the oldest unshipped order?" (skill names `propose_mutation`) | grok · **grok** | 14.7 s | 16.3 s | `get_order_lookup`, `hybrid_entity_search`, `get_assignments`, then `navigate` |

- **Turn 3 is the PR-1 acceptance case and it passed as written in §23.A:** Grok called the resolver and named **two** cartons — 50540 (unmatched, exact shipment scan) and 7114 (PO `QA-PO-MOCK-001`, PENDING) — then opened Unbox on 50540 through the `navigate` UI tool. Before PR 1 this turn produced prose with no tool event.
- **Turn 4 proves the `skillNeedsTools` split is gone:** a page skill naming `propose_mutation` now runs on Grok with tools instead of being handed to Anthropic. It answered "nobody" from `get_assignments` rather than guessing.
- **Classified turns still skip the loop** (no `tool` event on turns 1–2), which is the §17.4 requirement and the reason turn 1 is the fastest turn.
- **`reasoning_effort` on the phrasing round was the single biggest win.** The Grok phrasing path (`streamHermesCompletion`) was inheriting the proxy default `high`: turn 1 took **36.6 s** to first token and turn 2 **32.9 s**. Sending `reasoning_effort: 'low'` (only when `config.source === 'grok'`, since other managed endpoints 400 on unknown params) cut them to 6.6 s and 11.3 s, and turn 3 from 18.7 s to 10.3 s. H3's "halves it" is an understatement on this path — it is a 3–5× cut.
- **§3's "< 2 s first visible token" is NOT met yet** and this measurement does not disprove it: `:3050` is a dev server (turn 1's very first request spent 33 s compiling the route), and `meta` alone costs 1.4–3.3 s here before any model call. What the number does show is that the remaining cost is model time under a 41-tool, ~25 KB advertisement — which is exactly what §18 subsetting (H4) is for. Re-measure on a production build after PR 2.
- Per-round DB latency landed at 363–424 ms per tool with the §22 H1 session in place.

**B. Proxy wire probe — `scripts/probe-grok-tools.ts`** (tsx + server-only shim; reads the QA org's SuperGrok config via `ensureGrokChatConfig(QA_ORG_ID)`; **never prints the token**; one advertised tool = `get_order_lookup`'s schema through `openai-schema.ts`; prompt: "Look up tracking 1Z999AA10123456784 using the tool"). Four requests: `/chat/completions` stream on/off, `/responses` stream on/off. Record: status, first-byte ms, whether a tool call arrives, chunk shape (whole vs fragments, starting `index`), `finish_reason`/`response.completed`, acceptance of the `role:'tool'` / `function_call_output` follow-up, and `reasoning_effort` effect. Results go into PR 0's description and a one-line "wire decision" under §17.1.

**PR 0 results — `scripts/probe-grok-tools.ts --both-efforts`, 2026-09-05 04:07Z, dev box → `cli-chat-proxy.grok.com/v1`, QA org session (`connectedVia: host`), `grok-4.6`, one tool (`get_order_lookup`: 543 B chat envelope / 530 B responses envelope, request ≈1 KB), fixture tool result echoed in the follow-up:**

| variant | effort | HTTP | first byte | tool call at | how the call arrived | finish | reasoning on the wire | follow-up (tool result → final text) |
|---|---|---|---|---|---|---|---|---|
| P1 `/chat/completions` stream | default | 200 | 803 ms | 2,288 ms | whole, 1 chunk, `index 0`, `delta.tool_calls` | `tool_calls` | 198 chars `delta.reasoning_content` | 200 · first text 666 ms · total 1,471 ms |
| P1 `/chat/completions` stream | low | 200 | 683 ms | 1,331 ms | same | `tool_calls` | 109 chars | 200 · 797 ms · 1,540 ms |
| P2 `/chat/completions` buffered | default | 200 | 1,964 ms | 1,964 ms | `message.tool_calls[0]` | `tool_calls` | 156 chars `reasoning_content` | 200 · 1,534 ms |
| P2 `/chat/completions` buffered | low | 200 | 1,305 ms | 1,305 ms | same | `tool_calls` | 109 chars | 200 · 1,576 ms |
| P3 `/responses` stream | default | 200 | 1,252 ms | 2,393 ms | `output_item.added` → `function_call_arguments.delta` ×1 → `…done` → `output_item.done` (whole call) | `completed` | 156 chars `reasoning_summary_text.delta` | 200 · 947 ms · 1,724 ms |
| P3 `/responses` stream | low | 200 | 695 ms | 1,372 ms | same | `completed` | 109 chars | 200 · 820 ms · 1,564 ms |
| P4 `/responses` buffered | default | 200 | 5,785 ms | 5,785 ms | `output[]`: one `reasoning` item + one `function_call` | `completed` | (item only) | 200 · 1,555 ms |
| P4 `/responses` buffered | low | 200 | 1,318 ms | 1,318 ms | same | `completed` | (item only) | 200 · 1,401 ms |

Read-outs that shape PR 1:
- Every first round carried **no text** beside the tool call, so the loop must not expect narration before a call, and the `<tool_call>`-in-prose failure mode (§17.5) did not occur once. Arguments were valid JSON with the right key every time.
- `finish_reason` was `tool_calls` on all four chat rounds (the relay `"stop"` quirk did not show); keep the map-non-empty rule regardless. Chat `tool_calls[].index` started at 0.
- No variant re-called the tool after the result; every final answer named order, carrier, product and dates from the fixture and invented no id.
- Both effort fields were accepted (no 400 on the extra key). `store:false` was accepted on `/responses`; whether the proxy honours it is unobservable from the wire, which is why adapter A avoids the question.
- Not measured here: the 41-tool advertisement (H4) — PR 1's `[ask-timing]` line records it before and after §18 subsetting.

Do not restart `cycleforge-dev` (`:3050`) or `garisek-dev` (`:3060`); both probes use the running server or the proxy directly.

## 24. Revised PR order

- **PR 0 — wire spike (½ day).** `openai-schema.ts` + tests; `tools/dispatch.ts` extracted from `agent-loop.ts` (no behaviour change; `agent-loop.test.ts` still green); `scripts/probe-grok-tools.ts` run once; decision recorded in §17.1 (adapter A or B, streaming or buffered). **Done 2026-09-05: adapter A, streaming; no blocker.** Blocker check: if neither endpoint accepts `tools` on the proxy, PR 1 becomes "Anthropic loop for tool turns + Grok for phrasing" and §12.3 is re-opened with the operator (§25 Q5).
- **PR 1 — Grok tool loop (reads)** as §11 PR 1, plus: single tenant connection per turn (H1), history on the Grok path, voice overlay in both loops, `skillNeedsTools` split removed, `probe-ask-sse.mjs`. **Done 2026-09-05** — `grok-agent-loop.ts` (+21 tests), `tenant-session.ts` (+6), route rewired, both probes green; results in §23.A. Two refinements the build forced, both recorded: the H1 session is **round-scoped, not turn-scoped** (§22 H1), and the classified path keeps its own tool-less mouth (§17.4).
- **PR 1b — Ask | Build modes (§26).** Server gate (`askMode`, `draft_mutation`, `offer_action`) rides PR 1 because it decides the advertised tool set; the mode-row track and the thread CTA are a small UI PR behind `ds_contract`.
- **PR 2 — Catalog** as §19 (+ `selectToolsForTurn`, §18).
- **PR 3 — Facts** as §11 PR 3, plus org timezone (report E1), `local_ops` as a facts block (report D7), precedence note (report E6).
- **PR 4 — CRUD wave 1** as §20: two `auto` kinds + one `review` kind, `resolve_order`, `resolve_receiving_carton`, helper org predicates.
- **PR 5 — Review apply/reject** as §21.
- **PR 6 — read-only SQL hatch** unchanged (optional, flagged, agent-sql-shaped sanitiser under FORCE RLS).
- **PR 7 — Plan mode (§27).** Plan read tools + `ops_plan.*` / `ops_plan_task.*` mutation kinds + the member-context facts block + inbox-on-assign; the third face on the Ask track. Depends on PR 1 (loop), PR 5 (review apply for the one `review` kind), and the permission backfill in §27.3.

## 25. Open questions for the operator (yes / no)

1. **Responses API with `store:false`:** if the proxy ignores `store` and keeps conversation state server-side, may Ask still use `/v1/responses` (answer "no" pins adapter A / chat completions even if it needs the buffered fallback)?
2. **Four-eyes on review:** must the human who applies a `review` mutation be someone other than the staff who proposed it?
3. **Permission for chat assignment:** is `orders.create` (what `/api/orders/assign` and `/api/orders/[id]/flag` gate on today) acceptable as the chat permission for `work_assignment.upsert_order_staff` / `order_flag.set`, or should the assignment kind narrow to `work_orders.claim` (the listing-rule permission)?
4. **Org timezone source:** use the org's default `warehouses.timezone` for "this week / today" in Ask (default remains America/Los_Angeles)?
5. **Catalog table in PR 2:** ship the TS catalog with keyword retrieval first (no migration) and add the embedding table in a PR 2b, or land the table in PR 2?

## 26. Ask | Build modes — a CTA in the thread, not a second mouth

**Operator ruling (2026-09-04):** *"implement a mode based ask — Ask only or Build only — then the assistant can do it for me with a CTA button in the chat, just like Cursor composer modes."*

**Model it on Cursor.** Cursor's modes (Ask / Agent / Plan) are the same model with a different **tool allowance**: switching mode "changes the tools the agent is allowed to use, not the model running underneath" (developertoolkit.ai "Agent modes deep dive"; learncursor.dev "Ask vs Agent"). Ask answers and proposes; Agent acts; Shift+Tab rotates modes. Cycle Forge needs two of the three — the proposal Ask mode produces *is* the plan, and the CTA is the apply.

### 26.1 The two modes

| Mode | What the brain may do | Tools advertised (on top of §18's subset) | Writes |
|---|---|---|---|
| **Ask** (default, fail-closed) | answer from facts, look things up, explain, and **offer** a change | read tools + UI tools + `draft_mutation` | none — `propose_mutation` / `revert_mutation` are neither advertised nor executable |
| **Build** | everything Ask does, plus execute typed writes under the trust classes | read tools + UI tools + `propose_mutation` + `revert_mutation` | `auto` kinds apply now, `review` kinds queue — exactly §7 |

Trust classes, permissions and `MUTATION_KINDS` are untouched. A mode can only **narrow** what a turn may do, which is why the client may name it: a body-supplied `askMode: 'build'` still passes every per-kind permission check, and an absent or unknown value is `ask`.

### 26.2 Where the toggle lives (composer, not chat chrome)

- Not a fourth entry in `STATION_COMPOSER_MODES` (`src/lib/composer/station-composer-mode.ts`): Unbox / Ticket / Ask are *destinations* ("where the next input writes to"); Ask | Build is what the Ask destination does. It is a **sub-face inside the Ask face** on `ComposerModeRow` — a two-state segmented track (`Ask · Build`, LAWS F9 "short segmented tracks", `--r-keycap`), painted only while `mode === 'ask'`, and it survives `showModeFaces={false}` the way the Ask face already does (`composer-mode-row.test.tsx` "keeps Ask"). `DeskComposerAskLane` inherits it through `StationComposerHost`; no desk-only twin.
- State: `src/lib/composer/ask-mode.ts` (pure: `ASK_MODES = ['ask','build']`, `parseAskMode`, `resolveAskMode(url, session)`, `askModeLabel`) + `src/components/composer/useAskMode.ts`, persisted like the composer mode: `?askMode=build` in the URL and `cf.askMode` in sessionStorage; **arrival resets to `ask`** (mirror of `stationComposerArrivalMode`). Default `ask`.
- Keyboard: none in v1. Shift+Tab is "the whole keyboard surface" for the composer by ruling (2026-08-31), and a standing keycap on the track is refused by the shortcut cohort; a `?`-painted letter can come later through `pnpm run eval:cohort shortcuts`.
- Words on the track name the outcome, not the mechanism: `Ask` · `Build`. The placeholder in Build mode reads `Tell me what to change…` (`stationComposerModePlaceholder('ask', { askMode })`).

### 26.3 Wire

- `useAssistantChat.send(text, context)` serialises `askMode` alongside `page/station/mode/selection/skill`; `ContextSchema` in `src/app/api/assistant/chat/route.ts` (it is `.strict()`) gains `askMode: z.enum(['ask','build']).nullish()` and `action: DraftActionSchema.nullish()` (below). `AssistantPageContext` (`src/lib/assistant/context-store.ts`) gains the same optional `askMode`.
- Server resolution: `askMode = context?.askMode === 'build' ? 'build' : 'ask'`. Both loops (`agent-loop.ts` and `grok-agent-loop.ts`) take `askMode` and build the tool list from it; the shared `tools/dispatch.ts` (§17) refuses `propose_mutation` / `revert_mutation` in Ask mode with `{ ok:false, code:'mode_readonly', error:'Ask mode cannot change anything — offer the change with draft_mutation.' }` even if the model names the tool. Fail closed on the server, not on the prompt.
- System prompt gains one mode line. Ask: *"You are in Ask mode: you cannot change anything. When the operator asks for a change, resolve the target with the read tools, call draft_mutation once, then describe exactly what would happen and call offer_action once. Never say it is done."* Build: the existing `propose_mutation` guidance from `buildSystemCore`.

### 26.4 `draft_mutation` — the proposal without the write

New write-shaped tool in `src/lib/assistant/tools/write-tools.ts` (`buildDraftTools(sessionId, permissions)`), advertised only in Ask mode:

- Input: `{ mutationKind: string, payload: Record<string, unknown> }` — the same shape as `propose_mutation`.
- Behaviour: `isMutationKind` → the kind's `permission` against `ctx.permissions` (same 403 text as `propose_mutation`) → the kind's Zod payload → the kind's **precheck** (`src/lib/assistant/mutations/prechecks.ts`, one function per kind: order exists in this org, staff active in this org, rule/photo/line resolvable — the same checks `dispatchApply`'s wrappers run first in §20) → returns `{ ok:true, label, mutationKind, payload, trust, wouldApply: 'now' | 'review' }`. It **never** calls `applyAgentMutation`; the fakes test asserts `apply` is not invoked.
- `label` is floor copy produced by the precheck (`Assign you as packer on order …1234`, `Queue for review: create staff Maya`), never an id.

### 26.5 `offer_action` — the CTA in the thread

- A UI tool (client-executed, like `navigate`), in `UI_TOOLS`: `offer_action { label, mutationKind, payload, trust }`. The model calls it once per offered change in Ask mode; the loop forwards it as `ui_tool` SSE and acknowledges it to the model ("Offered to the operator.").
- `useAssistantChat.runUiTool('offer_action')` attaches `action` to the **current** assistant message (`AssistantMessage.action?: { label, mutationKind, payload, trust, state: 'offered' | 'sent' | 'done' | 'failed' }`).
- `AskThread` renders exactly **one** DS `Button` (`src/design-system/primitives/Button`, `ds_contract "CTA under an assistant turn in the Ask thread"` before any tsx; the plan does not pick variant or classes) beneath that assistant turn — `label` as the words, `trust === 'review'` visible in the label. No tool tile, no card, no toast, no popover; `WeldedFeedbackPanel` stays the reaction for scan confirms on the mouth. The button is disabled once pressed and reads `Done` / `Queued for review` from the reply.
- Press → `chat.send(action.label, { ...context, askMode: 'build', action })`. One-shot Build for that turn; the composer's Ask | Build track does **not** flip. The thread reads: operator asked → assistant offered → operator pressed (their bubble is the label) → assistant confirmed.

### 26.6 The fast-apply path (no model round on the press)

When the route sees `askMode === 'build'` **and** `context.action`, it does not need the model to decide anything: it runs the action through the same write chokepoint the model would have used — `buildWriteTools(sessionId, undefined, ctx.permissions)` → `propose_mutation.run({ mutationKind, payload }, toolCtx)` (permission → Zod → `applyAgentMutation`) — then hands the result to the brain as a facts block (`=== ACTION RESULT === Applied now: … / Queued for review: … / Refused: <exact permission>`) and streams one sentence with `ORG_CHAT_SYSTEM`. Target: under 1 s to "Done" from us-east-1 (one tenant transaction + one short completion). If the action fails validation the turn falls through to a normal Build turn so the model can re-resolve. `revert_mutation` stays reachable by saying "undo".

### 26.7 What does not change

- Page skills keep their wording; the mode gate is server-side, so a skill that names `propose_mutation` yields `draft_mutation` + a CTA in Ask mode and a write in Build mode.
- §7's law, the locked `auto` list, and §21's review queue are unchanged; Build mode is the existing write path with a switch in front of it.
- No second composer, no second thread, no standing keycap, no cheat sheet.

### 26.8 Acceptance tests

- `src/lib/composer/ask-mode.test.ts`: default `ask`; `?askMode=build` wins over session; unknown → `ask`; arrival resets.
- `agent-loop.test.ts` / `grok-agent-loop.test.ts`: Ask mode advertises `draft_mutation` and no `propose_mutation`; a scripted `propose_mutation` call in Ask mode is refused with `mode_readonly` and never reaches `apply`; Build mode advertises `propose_mutation` and no `draft_mutation`.
- `write-tools.test.ts`: `draft_mutation` returns `label/trust/wouldApply` for a permitted kind, 403 text for a missing permission, and the fake `apply` is never called.
- Route test (fake brains): a Build turn with `context.action` calls `applyAgentMutation` exactly once with `ctx.organizationId` and no model tool round; a failing action falls through to a model turn.
- `use-assistant-chat.test.ts` (jsdom, `.test.ts`): `ui_tool offer_action` attaches `action` to the streaming assistant message; pressing sends `askMode:'build'` + `action` and marks the message `sent`.
- `composer-mode-row.test.tsx`: the `Ask · Build` track renders only when `mode === 'ask'`, survives `showModeFaces={false}`, and is absent on Unbox / Ticket.
- §23.A probe turn 4 becomes two steps: Ask mode → `ui_tool offer_action` in the SSE and no `agent_mutations` row; press → one `applied` row and a `Done` sentence.

## 27. The SaaS mode slice — Ask · Build · Plan

**Operator ruling (2026-09-04):** *"a detailed slice on the exact modes I'll be able to include for the small business that buys the software: Ask, a manipulate-data mode, and a Plan mode for all staff — they can create projects, link certain staff into the projects, so they all have the context and can all view the plan."*

This section decides the three modes a tenant gets, what each may do, which permission and tier gates it, and how Plan mode rides the **ops-plans domain that already exists on main** — it does not invent a projects table. Everything is measured against the tree on 2026-09-04.

### 27.1 The three modes at a glance

| Mode | Face (Ask track, §26.2) | What the brain may do | Tools advertised (on top of §18 core) | Writes | Who |
|---|---|---|---|---|---|
| **Ask** | `Ask` (default) | answer from facts, look things up, explain, **offer** a change or a plan edit via the CTA | read tools · UI tools · `draft_mutation` | none | every staffer with `assistant.chat` |
| **Build** (the "manipulate data" mode) | `Build` | execute typed writes on operational records under the trust classes | read tools · UI tools · `propose_mutation` · `revert_mutation` (kinds ∩ the actor's permissions) | `auto` now, `review` queued — §7, §20, §21 | the actor's own permissions decide per kind; nothing is looser than the hands-on route |
| **Plan** | `Plan` | plan work **with the team**: create a project, add people, break it into tasks, assign, link tasks to records, report progress — and keep every member's Ask aware of the projects they are on | plan read tools (§27.4) · `list_staff` · `hybrid_entity_search` · `propose_mutation` restricted to `ops_plan.*` / `ops_plan_task.*` kinds · UI tools | `ops_plan.*` / `ops_plan_task.*` kinds only (§27.5) | every staffer with `operations.plans.view`; authoring needs `operations.plans.author` (new, §27.3) |

The Cursor analogy holds one level deeper: **the mode is a tool allowance, not a model**. Plan mode is Build mode with a different allowance and a different vocabulary — it cannot assign a packer or move a photo, and Build cannot create a project. That separation is what lets a small business hand Plan mode to every staffer while keeping Build behind operational permissions.

### 27.2 What already exists (measured; do not rebuild)

- **Domain:** `ops_plans` → `ops_plan_phases` (station-tagged: RECEIVING / TECH / PACK / FBA / LABELS / ADMIN) → `ops_plan_tasks` (open / in_progress / done / canceled, assignee, due, notes, `client_event_id` idempotency) → `ops_plan_task_links` (`work_assignment` | `inventory_event` | `manual`, so a task points at an order, a carton, a unit). Statuses and stations in `src/lib/ops-plans/constants.ts`; rows in `types.ts`.
- **Membership (landed 2026-09-04):** `ops_plan_members` (`2026-09-04_ops_plan_members.sql`, FORCE RLS, PK `(org, plan, staff)`); `createPlan` adds the creator plus `memberStaffIds`; `createTask` / `updateTask` **auto-add an assignee as a member** (`insertPlanMembersOnClient`); `addPlanMember` / `removePlanMember` / `listPlanMembers` in `members.ts`; `POST|DELETE /api/ops-plans/[id]/members` under `operations.plans.manage`.
- **Writers:** `createPlan`, `createPlanFromTemplate` (`PLAN_TEMPLATES`, e.g. `inventory_accuracy_cycle_count`), `updatePlan`, `archivePlan`, `createPhase`, `createTaskForPlan` (ensures the default ADMIN "Tasks" phase), `updateTask` (guarded by `isValidTaskTransition`, reconciles phase + plan status), `claimTask` (409 if already assigned), `completeTask` (assignee or manager), `createTaskLink`, `getTaskContext` — all `withTenantTransaction`, every SQL carries `organization_id`, every staff id verified `id + organization_id + active` (`verifyStaffInOrg`). Errors are named (`INVALID_ASSIGNEE`, `INVALID_TRANSITION`, `ALREADY_ASSIGNED`, `NOT_ASSIGNEE`, `PLAN_ACTIVATE_REQUIRES_TASKS`) and mapped by `mapOpsPlanError`.
- **Routes + permissions:** `GET /api/ops-plans`, `GET /api/ops-plans/tasks`, `GET /api/ops-plans/inbox` → `operations.plans.view`; `POST /api/ops-plans`, `POST /api/ops-plans/from-template`, `POST /api/ops-plans/tasks`, `PATCH /api/ops-plans/tasks/[id]`, members, links → `operations.plans.manage`; `POST …/claim` → `operations.plans.claim`; `POST …/complete` → `manage` or `claim`-as-assignee. Audit actions `OPS_PLAN_CREATE/UPDATE/ARCHIVE`, `OPS_PLAN_TASK_CREATE/ASSIGN/COMPLETE/CANCEL/LINK` exist in `src/lib/audit-logs.ts`.
- **Realtime:** `publishOpsPlanUpdated` on `ops_plans:changes` (events `plan_updated | task_assigned | task_completed | phase_done`); `/api/realtime/token` grants `subscribe` to every holder of `operations.plans.view`. Only the TV board subscribes today (`useOperationsTvBoard.ts`).
- **Surfaces:** Home → Tasks (`TasksWorkbench`, `useProjectTasks` with `scope mine|all` and `planId`, `TasksComposerRow` "New project / Add task"); the desk Ask lane on Home → Tasks already has a **Staff face** (`@Name` → `pingStaffAboutTask` = a `staff_messages` DM with `{surface:'home-tasks', planId, taskId}` context, plus `PATCH assigneeStaffId`) and a **working set** (rows dragged onto the mouth become the Ask's "this / these" and are injected as a skill fragment — `DeskComposerAskLane.tsx`); the Operations **TV board** (`/api/operations/tv-board`, `operations.tv.view`) shows plan progress for the wall.
- **Not this:** the `/forge` master plan (`src/lib/master-plan/`, Yjs MDX, dogfood-only via `FORGE_ORG_ID`) is the engineering plan and its bridge projects into ops-plans one way. Plan mode is the ops-plans domain, for every tenant. Personal `staff_todos` are not projects either.
- **Two task systems, one rule:** `ops_plan_tasks` are project tasks; a *thrown* task is `work_assignments.work_type='FOLLOW_UP'` with an inbox row (`src/lib/tasks/create-task-core.ts`, `notifications/assign-inbox-item.ts`). Plan mode creates project tasks; "throw this to Maya" stays the throwable-task path; a project task can **link** to the thrown assignment through `ops_plan_task_links(link_type='work_assignment')`.

### 27.3 Gaps that block "all staff can create, see and share the plan" (measured)

| # | Gap | Evidence | Fix |
|---|---|---|---|
| G1 | **No default role holds any `operations.plans.*` permission.** Only admins see plans, via the all-permissions short-circuit. | `grep operations.plans` in `src/lib/auth/permissions-shared.ts` and `scripts/seed-roles.mjs` → nothing; admin = `ALL_PERMISSIONS` (`permissions-shared.ts:162`). | Add `operations.plans.author` to `permission-registry.ts` ("Create projects you own; add members and tasks to projects you belong to"); grant `view` + `claim` + `author` to **every** default role in both role SoTs; **backfill migration** for existing orgs (the `roles.permissions` `text[]` is never retroactively widened — see `2026-07-01h_rma_permission_backfill.sql`); keep `manage` (edit/archive anyone's plan, remove members you did not add) for admin + a lead role. Manifest test rows. |
| G2 | **Assigning a plan task notifies nobody.** `updateTask`/`createTask` never write `staff_inbox_items`; only thrown tasks do. | `grep staff_inbox_items src/lib/ops-plans` → nothing; `assign-inbox-item.ts` header documents the explicit-recipient path. | Call `assignInboxItem` (reason `assigned`, `entityType` for a plan task — extend the entity CHECK if `ops_plan_task` is absent, else anchor on the linked record) inside `scheduleOpsPlanSideEffects('task_assigned')`. Membership add gets reason `mentioned`. |
| G3 | **Home → Tasks is not live.** Only the TV board subscribes to `ops_plans:changes`. | `grep ops_plan.updated src/components src/features` → `OperationsTvBoard` only. | `useProjectTasks` subscribes to `getOpsPlansChannelName(org)` and invalidates `['ops-plan-tasks']` / `['ops-plans']` on any event (same pattern as `useOperationsTvBoard`). |
| G4 | **`listPlans` cannot answer "my projects".** No member filter. | `queries.ts:106` filters `status`, `q`, `limit` only. | `listPlans(orgId, { memberStaffId })` joining `ops_plan_members`; Home → Tasks scope `mine` uses it; the Plan-mode facts block (§27.6) uses it. |
| G5 | **The plan page the inbox links to does not exist.** `sourcePath: /operations?mode=plan&planId=…` (`inbox.ts`) has no matching component. | `grep planId src/components --include=*.tsx` → FBA + the Ask lane only. | Plan detail = Home → Tasks filtered to one plan (`/?mode=tasks&planId=…`, a `DeskPageChrome` tab, not a new page); fix `sourcePath`. Phases render as row groups (`singleBand` / `RowGroup` already used there). |
| G6 | **Tier gate would exclude the small business from Ask.** `aiChat` / `aiCopilot` are Growth+ (`plans.ts`), enforcement dormant (`PLAN_FEATURE_ENFORCED`). | `STARTER_FEATURES.aiChat = false`. | §27.8 packaging decision for the operator; until then nothing changes at runtime. |

### 27.4 Plan-mode read tools (GREEN)

New file `src/lib/assistant/tools/plan-read-tools.ts`, registered in `tools/index.ts` `READ_TOOLS`, each `permission: 'operations.plans.view'`, each a thin adapter over `src/lib/ops-plans/queries.ts` through the `deps.query` seam (single tenant connection per turn, §22 H1):

| Tool | Input (Zod) | Returns | Wraps |
|---|---|---|---|
| `list_plans` | `{ scope: 'mine'\|'all', status?: OpsPlanStatus, q?: string }` | plans with progress, member count, my open-task count | `listPlans` (+G4) |
| `get_plan` | `{ planId }` | plan, phases with tasks, members (names only), progress by station | `getPlanDetail` + `listPlanMembers` |
| `list_plan_tasks` | `{ planId?, assignee: 'me'\|'anyone'\|staffId, status?, dueBefore? }` | tasks with plan title, station, assignee name, due, linked records | `listTasksForInbox` |
| `get_task_context` | `{ taskId }` | the task plus every linked record rendered floor-style (order …1234 · carton · unit) | `getTaskContext` + task links + the existing `getOrderLookup` / carton brief formatters |
| `list_plan_templates` | `{}` | template keys, titles, phase counts | `PLAN_TEMPLATES` |

"me" resolves to `ctx.staffId` inside the tool; ids never appear in prose (`ORG_CHAT_SYSTEM` rule).

### 27.5 Plan-mode mutation kinds (YELLOW), decided

All through `propose_mutation` → `applyAgentMutation` → `dispatchApply`; each wrapper verifies plan and staff belong to `ctx.organizationId` before calling the helper; actor = `ctx.staffId`. Permission strings are copied from the routes above (with `author` replacing `manage` where §27.3 G1 introduces it).

| Kind | Helper | Permission | Trust | Inverse | Notes |
|---|---|---|---|---|---|
| `ops_plan.create` | `createPlan({ title, description?, targetDate?, memberStaffIds?, createdByStaffId: ctx.staffId })` | `operations.plans.author` | **auto** | `archivePlan(planId)` — reversible, non-destructive (status `archived`, rows kept), one-click on Home → Tasks | creator becomes a member; status `draft` |
| `ops_plan.create_from_template` | `createPlanFromTemplate(key, { title?, createdByStaffId })` | `operations.plans.author` | **auto** | `archivePlan` | idempotent seeds via `client_event_id` |
| `ops_plan.add_member` | `addPlanMember(planId, staffId, addedBy)` | `author` if the actor is a member or creator, else `manage` | **auto** | `removePlanMember` | `INVALID_ASSIGNEE` → 400 relayed as "no such person here" |
| `ops_plan.remove_member` | `removePlanMember` | `author` only for members the actor added; else `manage` | **auto** | `addPlanMember` | never removes the creator |
| `ops_plan_task.create` | `createTaskForPlan(planId, { title, assigneeStaffId?, dueAt?, notes?, clientEventId })` | `author` (member of the plan) | **auto** | `updateTask({ status: 'canceled' })` — `open → canceled` is a valid transition | assignee is auto-added as member; fires G2 inbox row |
| `ops_plan_task.assign` | `updateTask({ assigneeStaffId, actorStaffId })` | `author` (member) — `claim` when assigning to self via `claimTask` | **auto** | restore the prior assignee (read in-tx) | `ALREADY_ASSIGNED` on claim → relayed |
| `ops_plan_task.complete` | `completeTask(taskId, actor, { isManager })` | `claim` (own task) / `manage` (anyone's) | **auto** | `updateTask({ status: 'in_progress' })` — `done → in_progress` must be added to `isValidTaskTransition` (today it is not a legal transition) | until the transition exists this kind is **review** |
| `ops_plan_task.link` | `createTaskLink(taskId, { linkType, linkEntityType, linkEntityId })` | `author` (member) | **auto** | `deleteTaskLink` (route exists: `DELETE …/links/[linkId]`) | resolvers first: `resolve_order`, `resolve_receiving_carton`, `lookup_serial` |
| `ops_plan.update` | `updatePlan({ title?, description?, targetDate?, status? })` | `manage` | **review** | prior values | status changes (`active`/`paused`/`done`) ripple to every member; a human applies |
| `ops_plan.archive` | `archivePlan` | `manage` | **review** | `updatePlan({ status: prior })` | hides the plan for everyone |

Widening protocol unchanged: each `auto` kind is added to `MUTATION_KINDS` **and** the locked list in `registry.test.ts` with a `WIDENED YYYY-MM-DD` note citing the three properties. Plan mode's `propose_mutation` description lists only `ops_plan.*` / `ops_plan_task.*` kinds; the dispatch refuses any other kind in Plan mode with `mode_scope` (fail closed, like §26.3 `mode_readonly`).

### 27.6 "They would all have the context" — how shared context actually flows

1. **Membership is the roster.** `ops_plan_members` says who is on a project; assigning a task adds the assignee automatically (already true).
2. **Every member's Ask knows their projects.** New Layer-1 fact in `org-chat-facts.ts`: kind `my_projects` (trigger: project / plan / task / due / "what am I on") → one `tenantQuery` joining `ops_plan_members` → `=== YOUR PROJECTS === <title> · <n open tasks, m mine, next due …>` for the signed-in staffer, in **any** mode. On Home → Tasks the desk lane already injects the working set and selection as a skill fragment; the facts block joins it. No tool round, no embeddings.
3. **The plan is the shared document.** `get_plan` renders phases, tasks, owners and progress; Grok summarises it the same way for every member because it is the same rows.
4. **Assignment reaches the person.** G2: an inbox row (`reason: 'assigned'`) on assign, `mentioned` on membership add; the bell + Home Inbox already render both reasons.
5. **Tasks carry the records.** `ops_plan_task_links` tie a task to the order / carton / unit; `get_task_context` renders them in floor words, so "what do I need for this task?" answers with the record, not an id.
6. **Live everywhere.** `ops_plans:changes` is already published on every write and every viewer may subscribe; G3 makes Home → Tasks refresh on it; the TV board already does.
7. **Ping stays a DM.** "@Maya" on the Staff face is a `staff_messages` note with plan/task context — human-to-human, not an AI write; Plan mode may *suggest* a ping via the CTA (`offer_action` with a `ping` action) but the operator presses it.

### 27.7 Where Plan mode lives

- **Track:** the third face on the Ask track (§26.2): `Ask · Build · Plan`. Rendered on desks and Home (where `DeskComposerAskLane` mounts) and on the phone companion; **not** on floor stations (`showModeFaces={false}` stations keep `Ask`, with Build reachable only through the CTA — a packer mid-carton is not planning). Persisted with the same `?askMode=` / session key; arrival resets to `ask`.
- **Home → Tasks is the plan desk.** Creating a project in Plan mode navigates there (`navigate('/', { mode: 'tasks', planId })` UI tool) and highlights the new plan; the Staff face and the working set keep working underneath.
- **Placeholder (I4):** `Plan with the team — name a project, a task, or @someone…`.
- **Voice line:** *"You are in Plan mode. You help this staffer plan work with their team: create projects, add people, break work into tasks with owners and due dates, link tasks to orders and cartons, and report progress. You cannot change orders, cartons, or settings here — say so and offer Build mode if they ask. Never cite ids; name people and records."*
- **Catalog (§19) seed adds a `projects` group:** `ops_plans` = project; phase = station-tagged stage; task = one owner, one due; member = on the roster; examples "make a project for the Q4 cycle count with Maya and Dev" → `ops_plan.create`; "add a task to count aisle 3 by Friday, Dev owns it" → `ops_plan_task.create`; "what am I on this week" → `my_projects` fact.

### 27.8 Tier packaging (decision needed — the matrix as it stands)

`src/lib/billing/plans.ts` today: Starter/Trial (≤10 staff) has `aiChat: false`, `aiCopilot: false`; Growth (≤50 staff) turns both on; Pro adds `automations`; enforcement is dormant behind `PLAN_FEATURE_ENFORCED` and the dogfood org is exempt. The Stripe ladder is "an unmade owner decision" per the file's own comment. Proposed packaging, to be ruled on:

| Tier | Ask | Build | Plan | Review queue |
|---|---|---|---|---|
| Starter | Ask mode: Layer-1 facts + read tools (needs a new `askBasic` feature flag set true on Starter, or `aiChat` moved down) | CTA-only (no standing Build face) — `auto` kinds the actor already holds | full: view · claim · author | no (review kinds return "ask an admin") |
| Growth | full | full Build face | full | yes (§21) |
| Pro | full | full + `automations` (rules from chat) | full + templates authoring | yes + audit export |

Enforcement stays where it is (feature gate + per-org override flag), so this table changes copy and the visible faces, never a security boundary.

### 27.9 Acceptance tests

- `permission-registry.test.ts` + `route-permission-manifest.test.ts`: `operations.plans.author` exists; every default role in both SoTs holds `view` + `claim` + `author`; the backfill migration is listed.
- `plan-read-tools.test.ts` (fake `query`): `list_plans` scope `mine` joins members; `get_task_context` renders linked records without ids; every tool rejects when `operations.plans.view` is absent.
- `apply-agent-mutation.test.ts`: each `ops_plan.*` / `ops_plan_task.*` kind calls its helper once with `ctx.organizationId` and `ctx.staffId`, captures the stated inverse, and the revert replays it; `ops_plan_task.complete` stays `review` until the `done → in_progress` transition test passes in `transitions.test.ts`.
- `registry.test.ts`: locked `auto` list widened with the plan kinds and their three-property notes.
- `org-chat-facts.test.ts`: `my_projects` classifies and the facts block lists only plans the session staffer is a member of.
- `enrich-turn.test.ts`: Plan mode advertises only plan kinds; a scripted `work_assignment.upsert_order_staff` in Plan mode is refused with `mode_scope`.
- `side-effects` test: `task_assigned` writes one `staff_inbox_items` row for the assignee (reason `assigned`), none for the actor.
- `use-project-tasks.test.ts` (jsdom): an `ops_plan.updated` event invalidates the tasks and plans queries.
- QA probe (§23.A, Plan mode): "make a project called Q4 cycle count with Maya" → `ops_plans` row, two `ops_plan_members` rows, a `Done` sentence naming the project; "add a task: count aisle 3, Maya owns it, due Friday" → task `in_progress`, inbox row for Maya, Home → Tasks repaints without reload; as Maya: "what am I on?" → the `YOUR PROJECTS` block names the project and the task.

### 27.10 Operator questions for this slice (yes / no)

1. **Author vs manage:** grant every default role the new `operations.plans.author` (create own projects, add members and tasks to projects they belong to) and keep `manage` for admins and leads — or grant `manage` to everyone?
2. **Complete is reversible:** add `done → in_progress` to `isValidTaskTransition` so `ops_plan_task.complete` can be `auto` (otherwise it stays `review`, which makes "mark it done" from chat wait on a human)?
3. **Starter gets Ask:** move `aiChat` into `STARTER_FEATURES` (or add `askBasic`) so the small-business tier has Ask + Plan out of the box?
4. **Plan on the floor:** confirm Plan mode is hidden on floor stations (desks, Home and the phone only)?
5. **Notify on membership add:** should adding someone to a project write an inbox row (`mentioned`), or only task assignment (`assigned`)?
