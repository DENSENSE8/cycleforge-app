# PASTE THIS INTO FABLE 5.1

Copy everything below the line into a **new** Fable 5.1 research session at
`cycleforge-app` root. Do not summarize it first. The model must **web search**
and **open the live trees**. This pass is research + plan amendment only —
**no product implementation**.

Plan SoT (do not rewrite; **add** to it):
[`docs/todo/ask-org-scoped-chat-PLAN.md`](../todo/ask-org-scoped-chat-PLAN.md).

Routing brief (mouth / refuse / oracles — not the product spec):
[`FABLE-5.1-SYSTEM.md`](FABLE-5.1-SYSTEM.md). If that file disagrees with a
`.ts` file, **the TypeScript wins**. Quote the code.

---

You are Fable 5.1. You have **no prior session memory**. You are an AI-systems
researcher (NL2SQL / semantic layers / multi-tenant SaaS agents / Postgres RLS),
not a product designer and not here to rewrite Cycle Forge UI.

**Mission (one line):** web-search 2025–2026 industry practice for multi-tenant
AI chat over operational Postgres, measure what Cycle Forge Ask already does,
then **add missing sections to the plan** so a later coding agent can implement
an extremely fast, org-scoped Ask that executes tool calls and typed CRUD
without dumping tables into embeddings.

Cycle Forge is a 2026 multi-tenant B2B warehouse/fulfillment ops SaaS. USAV is
the first dogfood tenant only. Do not describe it as an internal 5-person shop.

## Repos (read both; code wins)

1. **cycleforge-app** — `/home/michaelgarisek/Projects/cycleforge-app`
2. **Garisek-OS** — `/home/michaelgarisek/Projects/Garisek-OS` (only if a
   finding needs the embed/graph Host; this job is product Ask, not eval
   autonomy).

## Locked decisions (already made — do not relitigate)

These are operator + house law. Confirm they still match the live code. If a
file disagrees, **quote the file** and say whether the plan or the file should
move — do not quietly flip a lock.

1. **Postgres stays the SoT.** Do not ETL `packer_logs` / `orders` /
   `receiving_line` rows into a vector DB as the query engine.
2. **Utterance is classification-only.** Never interpolate operator text into
   SQL. Org / staff / permissions come from `withAuth` `ctx`, never the body.
3. **CRUD = named `MUTATION_KINDS` through `applyAgentMutation`.** No generic
   `execute_sql` writes, no `table.insert`, no model-chosen table names.
4. **Trust classes** (`auto` / `draft_scoped` / `review`) are not chosen by the
   model. `auto` requires reversible + non-destructive + already
   operator-reachable. Masters (`staff.*`, `reason_code.*`, `setting.*`) stay
   `review`. Widening is a PR that edits `registry.ts` **and** the locked list
   in `registry.test.ts`.
5. **Ask is a chat.** `AskThread` = user bubble + unbubbled Grok prose. **No
   tool-name tiles** on Station Ask. Mouth is `StationComposerHost`. Never
   `showModeRow={false}`. Never a second toast; staff reaction stays
   `WeldedFeedbackPanel`.
6. **SuperGrok** (`cli-chat-proxy.grok.com` + CLI fingerprint headers) is the
   default brain. Anthropic is fallback when Grok is disconnected.
7. **Classified facts beat tools beat free SQL** for speed. “How many packages
   did this packer pack this week?” stays a parameterized COUNT, not a tool
   round.
8. **Embeddings = dictionary + entity search**, not fact tables. Reuse 768-dim
   `src/lib/ai/embed.ts` / `entity_search_docs`. Do not mix 1536-dim RAG chunks.
9. Do not restart `cycleforge-dev` (`:3050`) or `garisek-dev` (`:3060`).
10. Do not reconstruct the deleted house-law constitution. Do not invent `pnpm`
    scripts.

## What “done” looks like for THIS research

Two written artifacts. **No implementation** except citation-sized quotes.

### Artifact 1 — research report

Write to: `docs/eval/FABLE-5.1-ASK-AI-RESEARCH.md`

Required sections, in this order:

### A. Files opened + searches run

List every file you opened and every web query you ran (engine + query string +
date of the page if present). Begin the report with this list.

### B. Measured Ask architecture (live code, not the plan)

Cite **paths + actual behavior**. You MUST open at least:

- `src/app/api/assistant/chat/route.ts` — Grok vs Anthropic split,
  `skillNeedsTools`, `streamHermesCompletion`, `enrichAssistantTurn` args
- `src/lib/assistant/agent-loop.ts` — `MAX_TURNS`, `buildSystemCore`, emit
- `src/lib/assistant/enrich-turn.ts`, `org-chat-facts.ts`, `carton-ask-brief.ts`
- `src/lib/assistant/tools/index.ts`, `write-tools.ts`, `types.ts`
- `src/lib/assistant/mutations/apply-agent-mutation.ts`, `trust-stats.ts`
- `src/lib/surfaces/registry.ts` (`MUTATION_KINDS`) + `registry.test.ts` locked
  auto list
- `src/lib/ai/hermes-tool-call.ts` — existing OpenAI-wire forced tool call
- `src/lib/integrations/grok/oauth.ts` — SuperGrok headers / proxy
- `src/lib/tenancy/db.ts` — GUC + `tenantQuery`
- `src/lib/ai/embed.ts`, `src/lib/search/hybrid-retrieval.ts`,
  `entity_search_docs` in `src/lib/drizzle/schema.ts`
- `src/components/composer/AskThread.tsx`, `StationAskPane.tsx`,
  `src/components/assistant/useAssistantChat.ts`
- `src/lib/assistant/page-skills.ts`
- Domain writers named in the plan: `upsert-order-assignment.ts`,
  `complete-triage.ts`, `acknowledge-unbox.ts`, `receive-line.ts`,
  `order-flags.ts`

For each: what a packing-count question does today vs a write verb vs a
generic “look up this tracking”. State whether Grok can call tools (yes/no,
with the branch that proves it).

### C. Industry research (web search is mandatory)

Search the **live web** (2025–2026). Do not rely on training cutoff. Run at
least these queries (plus any you add). Quote URLs.

Must-run queries:

1. `multi-tenant AI SaaS natural language to SQL row-level security 2026`
2. `semantic layer vs text-to-SQL Cube dbt Cortex Analyst 2026`
3. `Wren AI multi-tenancy RLS session properties`
4. `Vanna AI multi-tenant identity row-level security`
5. `pgai semantic catalog text-to-SQL postgres` (Timescale)
6. `do not embed database rows for NL2SQL structured data RAG`
7. `Relta DuckDB sandbox LLM SQL multi-tenant`
8. `agent-sql sanitise LLM SQL tenant WHERE`
9. `Oracle NL2SQL Database MCP server generate vs execute`
10. `OpenAI chat completions tool_calls streaming Grok xAI`
11. `StackAI postgres text-to-SQL agent`
12. `dbt semantic layer vs text-to-SQL 2026 benchmark`

For each relevant system, fill:

| System | What it actually does | Fit to Cycle Forge pooled-RLS org | Steal | Refuse |
|---|---|---|---|---|

Cover at least: Wren AI, Cube, dbt Semantic Layer / MetricFlow, Snowflake
Cortex Analyst, Databricks Genie, Vanna, Timescale pgai semantic catalog,
Relta, Oracle NL2SQL+MCP, agent-sql, StackAI, db-ally / IQL, AWS SaaS Postgres
RLS guidance.

**Questions the search must answer (not a survey — a decision per question):**

1. Is the conversion adapter a **semantic catalog** (descriptions + examples)
   or a **row embedding warehouse**? Side with one. Cite why row embeddings
   fail on “packages this packer this week.”
2. Where do embeddings belong in a pooled multi-tenant app — catalog, entity
   search, or both? How do serious products tag `tenant_id` / namespaces?
3. How do production systems stop LLM SQL from crossing tenants? Rank:
   session GUC + FORCE RLS, AST rewrite injecting `org_id`, per-user DuckDB
   slice, CTE pre-filter. Map each onto `tenantQuery` / `app.current_org`.
4. Should writes ever be free SQL? What do Relta / Wren / Vanna / Cycle Forge
   `MUTATION_KINDS` agree on?
5. OpenAI-wire tool loops on Grok/xAI: any 2026 docs on `tool_calls` streaming
   vs Anthropic `tool_use`? Risks for `cli-chat-proxy.grok.com`?
6. Latency: how do production NL2SQL stacks hit **<2 s**? Classifier /
   semantic cache / pre-agg vs always-tool. Does that support keeping Layer 1
   classified facts?
7. Metric layers (Cube / MetricFlow) vs typed tools (`get_packing_kpi`): for
   a warehouse OS with 30 existing assistant tools, is a Cube deploy worth it
   or is an in-repo YAML catalog enough for 12 months?
8. MCP as the execute plane (Oracle 2026): we already have
   `src/lib/mcp/tool-server.ts` over `ASSISTANT_TOOLS`. Should Ask’s Grok loop
   call the in-process registry or round-trip MCP? Pick one.

### D. Gap analysis of the current plan

Read `docs/todo/ask-org-scoped-chat-PLAN.md` after measuring the code.

For each plan section 1–15: **confirm / refine / missing**. Rank new gaps
**P0 / P1 / P2**. Each gap: (1) file, (2) what fails, (3) what an Ask turn
would do wrong today, (4) whether industry already solved a cousin.

You MUST investigate at least these (confirm, refute, or refine — do not copy
unread):

1. **Grok has no tool loop.** `streamHermesCompletion` is content-only. Write
   verbs force Anthropic via `propose_mutation` in the page skill string.
2. **Zod → OpenAI JSON Schema** for `listAssistantTools` is assumed, not
   proven. Find whether `z.toJSONSchema` is already used. Name the helper to
   add.
3. **Streaming `tool_calls` on SuperGrok** may 400 or drop `tool_calls` deltas.
   Specify a probe (QA cookie, one `get_order_lookup` advertisement) and a
   fallback (non-stream tool round, then stream the final sentence).
4. **Catalog table tenancy.** Plan says global schema catalog. `orgIdCol()` +
   `enforce_tenant_isolation()` is the birth law for new tables. Resolve:
   platform-owned catalog (no org) vs dogfood-org rows vs a non-tenant table
   with an explicit LAWS exception.
5. **Review kinds have no apply route.** `staff.create` inserts `proposed`.
   Tray exists. Name the missing route + permission.
6. **CRUD wave 1 trust.** For each named helper, read the UI route permission
   and whether an inverse exists. Recommend `auto` vs `review` with the three
   properties — do not rubber-stamp the plan’s “maybe auto.”
7. **local_ops short-circuit** still bypasses Grok. Plan wants facts-not-mouth.
   Trace `enrich-turn.ts` + chat route and specify the exact branch change.
8. **Prompt cache / system size.** `buildSystemCore` + 30 tool schemas may
   blow first-token latency. Industry: retrieve catalog slice, advertise 6–12
   tools not 40. Propose a tool-subsetter keyed off catalog retrieve.
9. **Eval / receipt.** Ask has no cohort. What is the minimum QA proof
   (cookie + SSE) vs a new eval? Do not invent `eval:cohort ask`.
10. **xAI tool-calling vs Hermes forced-tool.** `hermes-tool-call.ts` is
    `tool_choice: required` and local-only. Can it be a building block or must
    Ask get a new multi-turn streamer?

Add gaps you find in code that this list missed. No generic “needs better
prompts.”

### E. What NOT to add (foundation to extend)

- `runAssistantTool` / `applyAgentMutation` / `tenantQuery` as the only
  chokepoints
- `MUTATION_KINDS` widening protocol
- `entity_search_docs` + `hybrid_entity_search` for record lookup
- `org-chat-facts` classified path
- `AskThread` occupancy in `StationAskPane`
- SuperGrok connector in `organization_integrations`

### F. Additive plan (the point of this pass)

Patch `docs/todo/ask-org-scoped-chat-PLAN.md` by **appending** new sections
starting at **§16**. Do not delete §1–§15. Do not flip locked decisions. You
may add a “Research amendments (YYYY-MM-DD)” note at the top pointing at §16+.

§16+ must include, with file paths and acceptance tests:

- **§16 Industry mapping** — one paragraph per steal/refuse from section C
- **§17 Grok tool-loop protocol** — request/response shapes, streaming vs
  buffered tool rounds, headers, timeout, how `tool` SSE is suppressed on
  Station Ask
- **§18 Tool advertisement subsetting** — how catalog retrieve picks the 6–12
  tools for this turn
- **§19 Catalog storage decision** — table vs TS module vs both; tenancy;
  embed job; seed contents for packing/receiving/orders/staff
- **§20 CRUD wave 1, decided** — each kind: permission string copied from the
  real route, trust class, inverse, test file
- **§21 Review apply/reject** — `new-route` shaped handler, who may apply
- **§22 Latency budget, measured hypotheses** — what to time on QA (enrich ms,
  first Grok token, tool round trip)
- **§23 Probe plan** — curl/QA cookie scripts; carton 7114 packing vs product
  vs a read-tool question; do not kill :3050
- **§24 Revised PR order** — keep PR 1 = Grok tool loop unless research
  proves a blocker; if blocked, name the spike PR 0
- **§25 Open questions for the operator** — only decisions you cannot make
  from code + industry (yes/no cards, max 5)

### Artifact 2 — the amended plan

The file `docs/todo/ask-org-scoped-chat-PLAN.md` with §16+ appended.

## Method

1. Open the files in §B. Quote. Do not guess CLI names (`package.json` wins).
2. Run the web searches in §C. Save URLs.
3. Trace three fictional turns through **today’s** code, then through the
   amended plan:
   - “how many packages were packed by this packer on this week?”
   - “look up tracking QA-MOCK-TRK-PO”
   - “assign this order’s packer to me”
4. Side with **in-repo catalog + typed tools** vs **buy Cube/Wren** — one
   paragraph, a decision, not a survey.
5. Keep the amendment implementable. File paths. Schema fields. Fail-closed
   tenancy.

## Refuse

- Implementing `grok-agent-loop.ts` in this pass
- Dumping tables into pgvector
- `execute_sql` writes
- Tool tiles on AskThread
- A second composer mouth
- New markdown constitutions
- Restarting dev servers
- Writing Operator verdict into eval LEDGERs

Begin by listing files opened and searches run. Then write the report, then
append §16+ to the plan.
