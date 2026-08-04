# Handoff — Upload a sheet, ask a question: AI-native answers over an operator's own data

**Copy everything below the line into a fresh Claude Code session.**
Repo: `cycleforge-app` · attach to `:3050`, never start a server.

**Landed predecessor (this is the non-AI v0 — do not rebuild it):**
[`incoming-bulk-tracking-triage-HANDOFF.md`](./incoming-bulk-tracking-triage-HANDOFF.md), shipped
2026-08-02. Paste N tracking numbers → the list filters to those rows, and a residual report names
every one that is missing or gone, with the reason. That is *this* feature with a one-column text
input and a fixed question set.

---

## The operator problem, in their words

> "I need to upload a CSV or an Excel file and ask a question … if I upload a data sheet with
> tracking numbers I want to check if they are unboxed yet or unfound, or the tracking status is
> delivered but it's not unboxed yet. What's the exact status of a package?" — and then "comparing
> and contrasting **why** it came to that conclusion and **what should be done next**."

Three asks, and they are not equally hard:

| # | Ask | State today |
|---|---|---|
| 1 | Get facts for a list of identifiers | **SHIPPED** — deterministic, see below |
| 2 | Supply that list as an arbitrary spreadsheet | **missing** — the input is a single-column paste |
| 3 | Explain the answer and say what to do next | **missing** — the UI shows chips, not reasoning |

**Read that table before designing anything.** The valuable, correctness-critical half is already
built and is *not* an AI problem. What is missing is an input and a narrator.

---

## What already exists — the compacted context

### The deterministic answer layer (shipped 2026-08-02)

- **`resolveTrackingRemovalStatus`** (`src/lib/receiving/tracking-removal-status.ts`) — a paste list
  → per key: `known` · `reason` · `zoho_status` · `zoho_status_synced_at` · `receiving_id`. ONE
  indexed query for the whole list, `Deps`-injected, unit-tested DB-free.
- **`resolveIncomingRemovalReason`** (`src/lib/receiving/incoming-removal-reason.ts`) — the ONE
  ladder that names why a row left Incoming: `unboxed` · `written_off` · `dock_scanned` ·
  `vendor_received` · `vendor_cancelled` · `aged_out`, physical evidence first.
- **`resolveWatchState`** (`src/lib/receiving/watch-state.ts`) — `delivered_unscanned` ·
  `delivered_not_unboxed` · `in_flight` · `done` · `unknown`. **This is literally the operator's
  "delivered but not unboxed yet" question, already a typed value.**
- **`checkZohoReceived`** (`src/lib/receiving/check-zoho-received.ts`) — the ERP half, three-bucket
  honest (received / not received / **could not determine**).
- **`parseTrackingKeys`** (`src/lib/receiving/tracking-paste.ts`) — the ONE paste splitter; canonical
  keys, dedupe, cap with truncation *reported*.
- **`routeScan`** (`src/lib/barcode-routing.ts`) — the ONE decoder: any string → `{ type, value }`.
  **This is the column classifier you need in Job 1; do not write a second one.**

Measured on real dogfood data (2026-08-02, a 42-tracking operator paste): 41 known, **41 of them off
the default Incoming lane** — 37 unboxed, 2 received upstream, 2 cancelled upstream — and 1 genuine
typo (`74978550791`, an `8` dropped from `874978550791`). The facts are there and they are right.

### The AI layer — the pattern is ALREADY chosen in-house

**`src/lib/ai/search-tools.ts` is the precedent, and its docblock is the architecture:**

> *"the typed tool registry the LLM is allowed to call … Tools return only `SearchHit[]`, never raw
> DB rows."*

- **`hermesToolCall`** (`src/lib/ai/hermes-tool-call.ts`) — forced single tool, temperature 0.
- **`resolveOrgAiConfig`** / `provider.ts` — Hermes in dev, Vercel AI Gateway
  `anthropic/claude-haiku-4-5` in prod. Per-org. Usage recorded via `recordAiUsage`.
- **`intent-router.ts`** — deterministic intent detection *before* any model call.
- **`ops-assistant.ts`** — `resolveLocalAiAnswer` computes locally, `formatAnalysisForPrompt` hands
  the **computed result** to the model to narrate. The split you need already exists here.
- **`AiStructuredAnswer`** (`src/lib/ai/types.ts`) — and this is the finding that shapes the whole
  job:

```ts
interface AiStructuredAnswer {
  title; summary; confidence; modeLabel;
  metrics?: AiMetric[];              // the numbers
  breakdown?: AiBreakdownRow[];      // the compare/contrast
  sampleRecords?: AiSampleRecord[];  // the rows
  sources: AiSourceReference[];      // ← the citations. REQUIRED, not optional.
  followUps?: string[];
  actions?: AiActionLink[];          // ← "what should be done next"
}
```

**The operator's "why did it conclude that / what next" is already a typed contract.** Nothing new
needs inventing for the answer *shape* — it needs filling from a cohort.

- **Surface:** the assistant is a `RightRailHost` occupant (`renderable?.id === 'assistant'`,
  `RightRailHost.tsx:117`), opened by the GlobalHeader Sparkles. It is the "ask" of the three-icon
  rail (find · be told · ask). **Do not add a fourth icon or a new page.**

### The file-import precedent

`POST /api/orders/import-csv` — *"the client parses the CSV in-browser, picks which detected header
maps to each canonical field, and posts the already-parsed rows + the mapping"*, capped at 10k rows,
org from `ctx` never the body. **The header-mapping UX and the parse-in-browser decision are already
made.** Reuse both.

### What genuinely does not exist

- **No XLSX parser.** The only sheet dependency is `@googleapis/sheets`. CSV parsing today is
  hand-rolled in-browser. See Ask-first #1.
- **No store for uploaded spreadsheets.** The photos platform is for images (`photo_type` is a
  constrained vocabulary and `STAFF`/receiving evidence are its jobs). See the headline decision.

---

## ⚠ Corrections to the first execution blueprint (read this before Job 1)

A returning session proposed a blueprint that was architecturally right and wrong in three specific
places. All three were verified against the code on 2026-08-03; each would have cost a rewrite.

### 1. The 100-key cap is INHERITED, not earned — and enforcing it kills the feature

The blueprint said *"enforce the current 100-key cap"*. That reads the predecessor correctly and
still produces a useless product: a 5,000-row sheet answering 100 rows is not an answer.

**There are THREE caps, for three unrelated reasons. Do not treat them as one number.**

| Cap | Where | Why it exists | Applies to a sheet? |
|---|---|---|---|
| 100 unique keys | `checkZohoReceived` | every key past the cap is an **unanswered live Zoho lookup** — a real per-key network cost | **Yes** — keep it |
| ~100 keys | `?tracking_in=` URL | URL length; ~2KB is the comfortable ceiling | **Only for the deep link**, not the resolve |
| 100 unique keys | `resolveTrackingRemovalStatus` | **none.** `parseTrackingKeys(input)` at line 203 takes the default | **No** |

`resolveTrackingRemovalStatus` is **one indexed query** — `stn.tracking_number_normalized = ANY($1)`
against a unique btree. Its cost is one round trip whether the array holds 10 keys or 5,000. The cap
is there only because it calls the shared parser with the shared default.

**Do:** pass an explicit, higher cap to `parseTrackingKeys` on the local resolve path and batch in
chunks (start at 1,000 per query, measure). **Keep** the 100 cap on the ERP check, which earns it.
**Keep** a URL-sized cap on the deep link, and when the cohort exceeds it, link by cohort id rather
than by key list — do not silently link a truncated subset.

**Don't:** raise the shared default. It is shared with the ERP path, and the whole point of the cap
there is that a miss costs a live call.

### 2. A dependency-free CSV parser ALREADY EXISTS — extract it, do not write a second

The blueprint said *"implement `parse-sheet.ts` … to handle client-side CSV parsing"*. There is
already a correct RFC-4180-ish parser — quoted fields, escaped `""`, commas and newlines inside
quotes, CRLF, missing trailing newline — living as a **module-private function** in
`src/components/orders/CsvOrderImport.tsx` (line 41, `function parseCsv`).

Writing a second one is the exact fork this repo keeps deleting. The predecessor did this move three
times in one day (`tracking-paste.ts`, `watch-state.ts`, `ZOHO_TERMINAL_STATUSES`).

**Do:** extract `parseCsv` to `src/lib/cohort/parse-csv.ts` (dependency-free leaf), have
`CsvOrderImport` import it, and pin the quoted-field cases with a unit test it never had.
**Then** `parse-sheet.ts` composes it. Two consumers, one parser.

### 3. `hermesToolCall` sends exactly ONE tool — a three-tool registry cannot be driven by it

The blueprint listed `cohort_status_breakdown` · `cohort_rows_where` · `cohort_compare` "adhering to
the precedent in `search-tools.ts`". The precedent does not do what it looks like it does:
`SEARCH_TOOLS` is an exported array of three, but `runAskAiSearch` passes **one** —
`tool: hybridEntitySearchTool` — and `hermesToolCall` hardcodes a single-element `tools` array with
`tool_choice: 'required'` (and the docblock explains why: small models answer in prose otherwise,
and `"required"` is the portable form across LM Studio and OpenAI-compatible gateways).

So there is no multi-turn tool loop in this codebase today. Pick one, deliberately:

| Option | Shape | Verdict |
|---|---|---|
| **A — one tool, discriminated param** | `cohort_question({ kind: 'breakdown' \| 'rows_where' \| 'compare', … })` | **Recommended.** Keeps `hermesToolCall`, temp 0, forced call, one round trip |
| B — deterministic router first | `intent-router.ts` picks the tool, then one forced call | Also house-consistent; more code for the same answer |
| C — AI SDK v7 `generateText` multi-tool loop | the `ai@^7` dependency is present | A second AI driver beside `hermesToolCall`. **Ask first** |

**Whichever you pick, the model still only chooses WHICH QUESTION.** The cohort id and the tenant are
supplied by the server from `ctx`, never by the model.

---

## The headline decision: the file is a COHORT, not a context dump

**Three layers, and only the third is a model.**

```
   file ──▶ 1. INGEST (deterministic)  ──▶ 2. RESOLVE (deterministic) ──▶ 3. NARRATE (LLM)
            rows + column classification     typed facts + counts          summary · why · next
            routeScan / parseTrackingKeys    existing resolvers            AiStructuredAnswer
            NO model                         NO model                      NEVER computes a number
```

1. **Ingest** — parse in the browser (the `import-csv` precedent), classify each column by running
   the app's own `routeScan` over a sample of its values, and propose a mapping the operator can
   correct. A column is a tracking column because the decoder says so, not because a model guessed
   from the header text. Emit a **cohort**: `{ type: 'tracking', keys: string[] }`.
2. **Resolve** — the cohort goes to the *existing* typed resolvers. Every count, every bucket, every
   reason comes from SQL. This layer is testable, org-scoped by `tenantQuery`, and is the only layer
   allowed to state a fact.
3. **Narrate** — the model receives the **structured result**, never the sheet and never raw rows,
   and produces `summary` / `breakdown` / `followUps` / `actions`.

### The one rule that makes this safe

> **The model never counts, never joins, and never sees a row it could misread.**
> If the answer says "37 of 42 were unboxed", the 37 came from a `COUNT`.

This is not caution for its own sake — it is the same discipline the repo already applies to the ERP
check (three buckets, because "we could not determine" is not "no") and to the removal-reason ladder
(one derivation, two consumers). An LLM that recomputes either would be a second, unpinnable answer.

---

## Best industry-standard way to do this, as of 2026

The question was asked directly, so here is the direct answer and the reasoning.

**The consensus pattern is tool-calling over a narrow typed waist, with deterministic aggregation
and mandatory citations.** Concretely, for "upload a sheet and ask about it":

| Step | Standard practice 2026 | Why |
|---|---|---|
| Parse | Deterministic parser, in-browser or in a sandboxed worker | A model parsing CSV is the most expensive possible way to split on commas |
| Classify columns | Sample values → the app's own entity recognizer; model only to *break ties*, operator confirms | Header text lies (`Ref`, `#`, `Number`); values do not |
| Load | The sheet becomes a queryable relation (temp table / DuckDB / an in-memory Arrow table), not prompt text | Enables real joins, and cost stops scaling with row count |
| Answer | **Typed tools**, permission- and tenant-scoped, returning typed results | The model chooses *which question*, never *which SQL* |
| Aggregate | In SQL/code, always | Model arithmetic over many rows is unreliable and unauditable |
| Cite | Every claim links to the rows behind it | An ops answer nobody can check is not an answer |
| Present | The result set as a real grid the operator can act on, prose as the *caption* | The next action is usually on a row |

**Three alternatives, and why each is worse here:**

- **Stuffing the sheet into context.** Fails past a few hundred rows, cannot join to your operational
  data *at all* (the sheet does not know what is unboxed), and any count is a guess. This is the
  approach most demos use and the reason most demos do not ship.
- **Text-to-SQL.** The failure mode is not a syntax error — it is a *plausible* query against the
  wrong column, returning a confident wrong number. It is also the one caller that cannot be
  code-reviewed, and this codebase deliberately puts `organization_id` in a GUC so that no query
  author can forget tenant scoping. Generated SQL is exactly the author you cannot trust with that.
- **RAG / embedding the rows.** Retrieval is for prose. A spreadsheet is already structured; turning
  rows into vectors to search them is strictly worse than querying them, and it makes counting
  impossible.

**The 2026-specific shift worth naming:** the industry moved from "give the model the data" to
"give the model *verbs*". The verbs are your existing domain functions. This repo is already there
for search (`search-tools.ts`); the job below extends the same waist to cohorts.

---

## Job 1 — Ingest: file → cohort

- **`src/lib/cohort/parse-csv.ts`** — the EXTRACTED `parseCsv` (see correction 2). Leaf, no imports.
- **`src/lib/cohort/parse-sheet.ts`** (new, pure): `{ headers, rows }` → `SheetCohortDraft`.

### Column classification — the specifics

`routeScan(raw: string): ScanRoute | null` takes ONE string and returns a route or null. It is pure
and cheap (a regex ladder plus a URL parse), so sampling it is fine — but be deliberate about the
sample:

- Sample up to **25 non-empty values** per column, not the whole column. A 5,000-row sheet classified
  exhaustively is 5,000 × columns decodes for an answer the first 25 already gave.
- A column's type is the **modal non-null decode**, with `confidence = matches / sampled`.
- **Headers are a tie-breaker only, and that ordering is the point.** Real operator sheets label the
  tracking column `Ref`, `#`, `Number`, `AWB`, or nothing at all. Values do not lie; headers do.
- A column that decodes to **mixed** types (some `tracking`, some `serial`) is `ambiguous` — surface
  it as unclassified and let the operator choose. Do not pick the majority silently.
- **The operator confirms the mapping before anything resolves** (the `import-csv` mapping UX,
  already built). This is not a courtesy: a misclassified column produces a confident answer about
  the wrong entity, which is the worst failure this feature can have.

### Keys, caps, truncation

- Compose **`parseTrackingKeys`** for the tracking column — the same splitter, so the sheet path and
  the paste path can never disagree about what a tracking number is (a single cell may itself hold
  two numbers; the splitter already handles that).
- Pass an **explicit cap** (correction 1). Report `requested` / `applied` / `truncated` exactly the
  way `IncomingBulkTrackingPanel` already does — `verify.md` → no silent caps.
- Carry the **original cell string** beside the canonical key. The predecessor learned this the hard
  way: echoing `1Z999AA101` at an operator who typed `1z999-aa1 01` makes a matching row look like a
  different number. `parseTrackingKeys` already returns `display[]` index-aligned to `keys[]`.

### Ephemerality

**The cohort is EPHEMERAL. Do not persist the spreadsheet.** It is an operator's own file, often
carrying a vendor's or a customer's data, and keeping it buys nothing the resolved cohort does not.
Persist at most `{ type, keys[], created_at, staff_id }` scoped to the org, with a short TTL — and
only if a "re-run yesterday's question" story actually appears. **Ask-first before adding a table.**

A cohort id is still needed *within the session* so a tool can name a cohort without shipping 5,000
keys through the model. An in-memory / cache-backed handle keyed by `(orgId, staffId, id)` is enough,
and it is org-scoped like everything else.

## Job 2 — Resolve: cohort → typed facts

- **`src/lib/cohort/resolve-cohort.ts`** — dispatch by cohort type to the *existing* resolvers.
  Tracking → **`resolveTrackingRemovalStatus`**, which already composes `resolveIncomingRemovalReason`
  and `resolveWatchState` internally. Call the top of that stack, not the three separately. Add
  SKU / order / serial arms later, each composing its own existing SoT.
- **Never write a new query for a fact that already has a resolver.** If a resolver's shape does not
  fit, grow it (`pattern-evolution.md`); do not fork it.
- **Batch, and keep the batching invisible** — one `CohortResult` however many queries it took.
- **A failed batch must not read as an empty one.** `resolveTrackingRemovalStatus` deliberately
  *rejects* on lookup failure rather than returning `[]`, because "none of these exist" is a stronger
  claim than the lookup can make. Preserve that: a partial failure is `degraded`, never a smaller
  answer. Same three-bucket honesty the ERP check ships.

Output shape — the ONLY source of every number downstream:

```ts
interface CohortResult {
  cohortId: string;
  type: 'tracking';                    // widen as arms are added
  stats: { requested; applied; truncated; known; not_found; hidden };
  buckets: Record<IncomingRemovalReason | 'on_lane', number>;  // counted in SQL
  rows: TrackingRemovalStatusRow[];    // per key, carrying `tracking` (original) + `key`
  degraded?: { reason: string };       // a lookup failed — say so, do not shrink the answer
}
```

## Job 3 — Narrate: cohort result → `AiStructuredAnswer`

Driver: see correction 3 — **one tool, discriminated param**, `hermesToolCall`, temperature 0,
`tool_choice: 'required'`, provider from `resolveOrgAiConfig(orgId, 'chat')`, usage recorded with
`recordAiUsage`. The model runs on the **explicit Ask path only**, never on a keystroke
(`search-tools.ts` locked decision 4).

### `formatAnalysisForPrompt` takes a COMPLETE answer — mind the direction

Its signature is `formatAnalysisForPrompt(analysis: AiStructuredAnswer): string`, and it reads
`analysis.summary` in its first three lines. So the flow is **not** "hand the model facts and let it
write the answer". It is:

1. Build a **complete** `AiStructuredAnswer` deterministically, including a mechanical `summary`
   ("42 tracking numbers · 37 unboxed · 2 received upstream · 1 not found").
2. `formatAnalysisForPrompt` renders it into the prompt.
3. The model **rewrites the prose and adds the reasoning** — it never sees a number that is not
   already in that struct.

The mechanical summary is also the **fallback**. If the model call fails, times out, or the org has
no chat provider (`resolveOrgAiConfig` returns null and `runAskAiSearch` throws today), the answer
still renders. The AI layer is strictly additive: an operator whose provider is down still gets their
cohort.

### Exact fill map — who authors what

| Field | Author | Note |
|---|---|---|
| `kind` | code | needs a **4th union member** (`'cohort_summary'`); today it is `'shipping_summary' \| 'notice' \| 'repair_diagnostics'`. Additive, but a shared type — name it in the PR |
| `title`, `modeLabel` | code | — |
| `metrics[]` | **code** | `{label, value, detail?}` — every value a string rendered from a SQL count |
| `breakdown[]` | **code** | `{id, label, value: number, detail?, href?}` — this IS the compare/contrast; `href` deep-links the bucket |
| `sampleRecords[]` | **code** | `{id, primary, secondary?, href?}` — the rows |
| `sources[]` | **code** | `{id, label, detail?}` — **there is no `href` field**; it is a label-level citation. Row linking is `breakdown.href` / `sampleRecords.href` |
| `confidence` | **code, derived** | see below — never model-chosen |
| `summary` | code first, **model rewrites** | the only free prose |
| `followUps[]` | model | strings; harmless if imperfect |
| `actions[]` | **code proposes, model may only SELECT** | `{label, href}` — see hardening |

### Narration hardening — the failure the constraint list does not cover

"The LLM never calculates" is necessary and **not sufficient**. A model handed correct numbers can
still write a false sentence about them — "most of these are fine" over 37 unboxed of 42, or "nothing
needs attention" when one is written off. Three mitigations, strongest first:

1. **The grid is the answer; prose is the caption.** When the two disagree the operator sees the
   grid. This is why Job 4 is not garnish.
2. **`actions[]` is a closed set.** The model must not author an `href`. Code computes the candidate
   actions — they are all `?tracking_in=` / `?incview=removed` deep links it already knows how to
   build — and the model may only choose among them, or none. A model-authored URL is an invented
   destination.
3. **Bound the prose.** The system prompt states that every number in the summary must appear
   verbatim in the supplied metrics, and that severity may not be characterised beyond the buckets.

### Confidence is DERIVED, not chosen

`AiConfidence = 'high' | 'medium' | 'low'`. Compute it from the residuals, in code:

- `low` — `degraded` is set, **or** `not_found / applied > 0.2`, **or** the cohort was truncated.
- `medium` — any `not_found`, or a column classified below ~0.8 confidence.
- `high` — everything resolved, nothing truncated, classification unambiguous.

A model that grades its own confidence grades it high. The predecessor's whole ERP-check design rests
on the opposite instinct: unknown is its own bucket, and it must not be filed under "no".

## Job 4 — Surface

- Entry: the assistant rail (`id: 'assistant'`), plus an **"Upload a sheet"** action beside the paste
  box in `IncomingBulkTrackingPanel` — the operator who pastes 40 numbers is the operator who has a
  file of 400.
- The answer renders as a **`LedgerGrid` cohort** (a real grid, with the `zoho` and removal-reason
  columns the bulk-paste lane already promotes), captioned by the narrative. Not a wall of prose.
- Actions deep-link with `?tracking_in=`; over the URL cap, link by cohort id instead of a truncated
  key list (correction 1).
- **Mind the right edge.** `RightRailHost` renders ONE occupant. The assistant dock and the paste
  panel are both occupants, so a cohort answer must not try to be a second permanent one — and note
  the host currently double-renders for ~240ms when its frame flips push→overlay (found 2026-08-02;
  transient, self-clearing, and the reason the predecessor's E2E waits on `toHaveCount(1)`).

### Testing contract

- **DB-free unit tests** for `parse-csv` (quoted fields, embedded commas/newlines, CRLF, no trailing
  newline), `parse-sheet` (modal classification, ambiguous column, header tie-break) and
  `resolve-cohort` (batching, `degraded` propagation, derived confidence) — `Deps`-injected, the
  shape `tracking-removal-status.test.ts` already uses.
- **A golden cohort fixture** — one CSV committed under `tests/fixtures/`, asserted end to end
  through Jobs 1–2 with NO model. That is the regression net for every number the UI shows.
- **E2E on the QA org**, shape-based: upload → mapping → grid, and a `degraded` render. Never
  count-based (`verify.md`).
- **Do not test the model's prose.** Assert the struct; the sentence is not a contract.

---

## What a wrong answer looks like, and what catches it

The constraint list ("no AI math, no prompt stuffing") describes what must not happen. This describes
what *will* go wrong anyway, per layer, and what has to be in place to notice.

| Layer | The wrong answer | Why it is dangerous | What catches it |
|---|---|---|---|
| Parse | Quoted field with a comma splits into two columns | Silent column shift — every downstream fact is about the wrong cell | `parse-csv` unit tests; the extracted parser already handles it |
| Classify | A `Ref` column of PO numbers read as trackings | **Confident answer about the wrong entity.** The worst one — everything below is correct *for the wrong question* | Modal decode over values + **operator confirmation**; `ambiguous` never auto-picks |
| Keys | Cell holds two numbers, one is dropped | An operator's row silently unaccounted for | `parseTrackingKeys` handles multi-value cells; `requested`/`applied` must reconcile |
| Cap | 5,000-row sheet answers 100 | Reads as "the rest are fine" | `truncated` reported in the UI, never only in a log |
| Resolve | Lookup fails, returns `[]` | "None of these exist" — a stronger claim than the query made | Reject → `degraded`; **never** shrink the answer |
| Resolve | Key not found reported as "not removed" | Absence conflated with a state | `known: false` is its own bucket, already |
| Narrate | Correct numbers, false sentence ("most are fine") | The prose is what a hurried operator reads | Grid is the answer; bounded prose; closed `actions` |
| Narrate | Model invents a plausible deep link | An action that goes nowhere, or somewhere wrong | `actions[]` chosen from a code-computed set |
| Narrate | Model grades its own confidence `high` | Removes the one signal that says "check this" | `confidence` derived in code |

**The pattern across the table:** every dangerous failure is a *confident* one. None of them throws.
That is the same shape as the three defects the predecessor shipped and had to fix — a normalizer
that dropped a column, a rules file that described a retired path, a lane that hid rows with no
explanation. Loud failures are cheap here; quiet ones are the whole risk.

---

## Ask-first

1. **XLSX library.** Nothing in the repo parses it. SheetJS's npm `xlsx` is stale (the project moved
   distribution off npm); `exceljs` is MIT and heavier. Both are client-side here, so it is a bundle
   decision as much as a licence one. **Do not add either without asking.**
2. **Persisting cohorts** — any new table is a schema change (`polymorphic-tables.md` contract) and
   the default answer above is *don't*.
3. **Raising the SHARED default cap** in `tracking-paste.ts` — that constant is shared with the ERP
   check, whose cap is earned (each key past it is an unanswered live Zoho call). Ask before touching
   it. **Passing a higher explicit cap to the local resolver is NOT this** and needs no permission —
   see correction 1; that call site simply takes the default today.
4. **A second AI provider or model tier** for this path — `resolveOrgAiConfig` owns that today.

---

## Gap ledger

| # | Gap | Where | Status |
|---|---|---|---|
| 1 | Facts for a list of identifiers | receiving resolvers | ✅ shipped 2026-08-02 |
| 2 | "Delivered but not unboxed" as a typed value | `watch-state.ts` | ✅ shipped |
| 3 | Why a row left, one derivation | `incoming-removal-reason.ts` | ✅ shipped |
| 4 | Typed AI tool waist | `search-tools.ts` | ✅ exists (search only) |
| 5 | Answer shape with citations + next actions | `AiStructuredAnswer` | ✅ exists, unused for cohorts |
| 6 | **Spreadsheet → cohort** | — | **Job 1** |
| 7 | **Cohort → typed facts** | — | **Job 2** |
| 8 | **Cohort tools + narration** | — | **Job 3** |
| 9 | **Upload entry + grid answer** | — | **Job 4** |
| 10 | XLSX parsing | — | **Ask-first #1** |

**Sequencing: 6 → 7 → 9 → 8.** Ship the deterministic cohort with a grid answer and NO model first —
it already answers the operator's literal questions. Add narration last, when there is something
true to narrate.

---

## Read before writing code

- `AGENTS.md` + `.claude/rules/workflow-safety.md` — never start/restart `:3050`; the user commits
- `.claude/rules/source-of-truth.md` → Cross-entity search (the `hybridSearch` waist — never a second engine)
- `.claude/rules/backend-patterns.md` → route skeleton, `orgId` from `ctx`, tenant GUC
- `.claude/rules/build-gotchas.md` → bundle altitude (a client parser must not drag `server-only`;
  this bit the predecessor — a *dynamic* import still counts as a client-graph edge)
- `.claude/rules/verify.md` → `npm run verify`; E2E on the QA org; **no silent caps**
- **`src/lib/ai/search-tools.ts`** — read the docblock; it IS the architecture. (It cites
  `docs/ai-search-modernization-plan.md` §12, and so do `api/ai/retrieve` and the search-outbox cron
  — **that file does not exist in the repo**. Do not go looking for it; the source is the source.)

## Done means

- [ ] `parseCsv` EXTRACTED to a leaf and composed by both `CsvOrderImport` and the sheet path — one parser
- [ ] Columns classified by sampled `routeScan` values, headers only as a tie-break, `ambiguous` never auto-picked
- [ ] The operator confirms the mapping before anything resolves
- [ ] The cohort resolves through `resolveTrackingRemovalStatus` — no new query for an existing fact
- [ ] A 1,000-row sheet answers 1,000 rows (batched), not 100
- [ ] Counts come from SQL; the model never computes one
- [ ] `confidence` derived in code; `actions[]` chosen from a code-computed set, never model-authored
- [ ] A failed lookup renders `degraded` — never a smaller answer
- [ ] Over-cap, not-found and unresolved rows REPORTED per key, the way the paste panel reports them
- [ ] The answer renders as an actionable grid; the model's prose is the caption
- [ ] The whole of Jobs 1–2 works with NO model configured (mechanical summary is the fallback)
- [ ] A golden CSV fixture pins Jobs 1–2 end to end
- [ ] `npm run verify` green — attribute pre-existing red to other lanes before inheriting it

## Never

- Put the spreadsheet's rows in the model's context.
- Let the model write SQL, or choose the tenant.
- Let the model produce a number that did not come from a query.
- Build a second identifier classifier, a second paste splitter, or a second search engine.
- Persist an operator's uploaded file without asking.
- Ship an answer with no citation — an ops answer nobody can check is not an answer.
- Let the model author an `href`, or grade its own `confidence`.
- Return an empty result where a lookup FAILED. Absence and failure are different claims; that
  distinction is the whole reason the ERP check has three buckets instead of two.
- Auto-pick a column type the values disagree about. A confident answer to the wrong question is the
  most expensive thing this feature can produce.
