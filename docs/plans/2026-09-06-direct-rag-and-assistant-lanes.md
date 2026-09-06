# Direct RAG, Retire the Tunnel, and Lane-Routed Intake — Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Replace the dead NemoClaw RAG tunnel with a direct pgvector query inside Neon, ingest the **548
Bose service manuals that already exist as markdown on avion**, and spend the saved round trip on the two
things operators feel: grounded, citable answers (readability) and fewer clicks to reach them (auto-run on
pin, Enter to insert).

**Architecture:** One corpus (`rag_documents` + `rag_document_chunks`, 768-dim, org-scoped, HNSW cosine),
one embedder (`src/lib/ai/embed.ts`), one retriever (`src/lib/ai/doc-retrieval.ts`, new) injected into the
two consumers that already render grounding — the support drafter (`suggest-reply-core.ts`) and the manual
intercept (`api/ai/chat/stream/route.ts`). Retrieval returns **chunks, not a synthesized answer**: the local
model already generates, so the tunnel's remote synthesis was a second generation behind a WAN hop. Lane
routing is the existing `enrich-turn.ts` cascade turned into a registry once the corpus is real.

**Tech Stack:** Next.js/TypeScript, Neon Postgres + pgvector (HNSW, `vector_cosine_ops`), `embedText` at
`EMBEDDING_DIMS = 768`, Node test runner with `tsx`. **No PDF pipeline required** — see Phase 1.

---

## Confirmed current state (measured 2026-09-06)

### The tunnel is dead and nothing behind it survived

- `POST https://rag.michaelgarisek.com/api/rag/query` → **HTTP 530** in 0.40 s.
- `~/.cloudflared/config.yml` on avion serves `usav-dev` (3050) and `home` (3060) only — **no `rag.`
  hostname**. The origin was the retired WSL guest. No Qdrant container runs on avion (`docker ps`). There is
  **no vector store to migrate** — only code to delete and a DNS record to remove.
- Callers: `src/lib/ai/nemoclaw-rag.ts`, `src/lib/support/suggest-reply.ts:132` (`queryRag:
  queryNemoClawRag`), `src/app/api/ai/chat/stream/route.ts:182` (the `bose_manual` intercept). Env at
  `.env:156` and `.env.example:175`.

### Both consumers already render grounding — they are being fed nulls

- `suggest-reply-core.ts:197-205` catches the throw and sets `rag = null` ⇒ `grounded = false` ⇒
  `resolveConfidence` (line 154) returns **`'low'` unconditionally**, and the prompt receives the literal
  string `"No specific document grounding was found for this question."` **Every support draft in production
  today is ungrounded and chipped low-confidence.**
- `SupportAssistDisplay.tsx:63-80` already defines `CONFIDENCE_CHIP`, `SOURCE_CHIP` (`thread | ocr | catalog
  | rag`) and `LANE_LABEL`. Restoring retrieval lights these up with **zero UI work**.
- `api/ai/chat/stream/route.ts:178-200` already builds a full `AiStructuredAnswer` (`kind:
  'repair_diagnostics'`, confidence bands at 0.7/0.4, `sources[]`, `followUps[]`). Also zero UI work.

### The corpus exists — as markdown on avion, not in the database

`/home/michaelgarisek/Projects/nemoclaw-fork/data/bose-service-manuals/` — **548 `.md` files, 31.8 MB**
(p10 1.4 KB, p50 30 KB, p90 154 KB, max 620 KB). This is what NemoClaw fed Qdrant. Verified structure:

- YAML frontmatter on every file: `source:`, `path:`, `type: bose_service_manual` (548/548).
- **Page boundaries survive as form feeds (`\f`) in 350 of the 523 ingestable files** (12 173 pages) — the
  151SE file has 11, matching an 11-page manual. The remaining **173 are pageless** and need the
  standalone-integer fallback in T1.4; 25 more files are sub-500-byte stubs.
- Sections are ALL-CAPS lines: `SPECIFICATIONS`, `PACKAGING PART LIST`, `MAIN PART LIST`, `DISASSEMBLY
  PROCEDURES`, `SERVICE MANUAL REVISION HISTORY`.
- Model identity is in the filename (`151 SE  Service manual`, `1401 Series II Car system service manual`).
- 181 files contain `Disassembly`/`Part List` — the deep-repair subset; the rest are owner's guides and
  shorter service notes.
- The originating PDFs are **not** on either box; the markdown is the source of truth.

**No OCR, no PDF extraction, no `pdfjs-dist` work is required.** This is the single biggest cost reduction
versus the obvious plan.

### `product_manuals` is customer collateral, not a technical corpus

513 rows / 507 active with a public Vercel Blob URL (`HEAD` → 200, `application/pdf`). Measured across all
507: **51.8 MB total, p50 94 KB, max 569 KB, zero files over 1 MB.** Text extraction of a sample returns
QR-insert boilerplate ("Please scan this QR Code… USAV Solutions, 16161 Gothard St…"). Classification by
filename:

| bucket | count |
|---|---|
| QR insert | 208 |
| other | 131 |
| owner manual | 91 |
| packing list | 74 |
| label / template | 3 |

These answer "which insert goes in this box", not "why does the 301 Series V buzz". **Do not ingest them in
Phase 1** — 208 near-identical QR sheets would dominate cosine similarity and poison every repair query.
They come later as `kind='collateral'` behind a lane filter, if a packing lane ever needs them.

### Database state

| Table | Rows | Note |
|---|---|---|
| `rag_documents` / `rag_document_chunks` | **0 / 0** | never populated |
| `entity_search_docs` | 11 716 | **0 have embeddings** — hybrid search is keyword-only in practice |
| `tool_registry` | 0 | tool-forge semantic selection unused |
| `support_tickets` | 358 | **shim only** (`subject_cache`, `status_cache`) — no ticket bodies in Neon |

**Dimension bug that explains the empty tables:** `/api/rag/documents` embeds via `gemini.ts:getEmbedding`
(`text-embedding-004`, 768) and inserts into `rag_document_chunks.embedding` declared **`vector(1536)`**
(`2026-05-24_rag_tables.sql:24`). That insert cannot succeed. `embed.ts` meanwhile pins 768. Three embedding
paths, two dimensions, one impossible column.

Because ticket bodies are not stored, the support lane's corpus is **policy/playbook documents**, not ticket
history. One store, three facets: `service_manual` (548), `policy` (uploads), `collateral` (later).

### Click cost today

Support: open ticket → click **Suggest** (`SupportAssistDisplay.tsx:191`) → wait → click **Use draft**
(`bridge.setDraft`, line 361) → send. Two discretionary clicks per ticket on a path whose grounding is always
empty. The dock owns **⌘/Ctrl+J** (`AssistantProvider.tsx:132`) and ⌘K belongs to the launcher; per
`docs/omni-command-composer.md` ("one field" is the law) **this plan adds no new surface and no new hotkey.**

---

## ROI ordering

| # | Change | Readability | Transmission | Clicks | Cost |
|---|---|---|---|---|---|
| R1 | Direct retriever replaces the tunnel | confidence + source chips start working | 1 WAN hop + 1 remote generation → **1 in-region SQL** | — | 3 files |
| R2 | Ingest 548 markdown service manuals | answers cite manual + page | ~32 MB embedded once, chunks capped per query | — | 1 script + 1 migration |
| R3 | Auto-run on pin + Enter-to-insert | draft present on open | none | **−2 per ticket** | 2 files |
| R4 | Citations deep-link into the manual viewer | one click from claim to page | anchors, not pasted manual text | −1 vs hunting the file | 2 files |
| R5 | Lane registry in `enrich-turn.ts` | right corpus, ≤6 tools instead of ~40 | fewer wasted tool round trips | — | 4 files |
| R6 | Backfill `entity_search_docs.embedding` | semantic half of hybrid finally runs | — | — | 1 worker run |

R1 lands before R2 so the retriever is unit-tested against a seeded corpus before a 548-file ingest, and
because R1 alone converts "always low confidence" into an honest signal.

---

## Phase 1 — Corpus (blocking)

### T1.1 Migration `2026-09-06_rag_corpus_768.sql`

- `ALTER TABLE rag_document_chunks ALTER COLUMN embedding TYPE vector(768)` — free, the table is empty. Drop
  and recreate `idx_rag_document_chunks_embedding` (HNSW `vector_cosine_ops`) after the type change.
- `rag_documents`: add `source_kind text NOT NULL DEFAULT 'upload'` (`service_manual | policy | collateral |
  upload`), `source_ref text`, `title text`, `model_tokens text[]`, `content_hash text`,
  `UNIQUE (organization_id, source_kind, source_ref)`.
- `rag_document_chunks`: add `page integer`, `section text`, `char_len integer`.
- Indexes: `(organization_id, source_kind)`, GIN on `model_tokens` — the metadata prefilter is what stops a
  548-manual cosine search from returning the wrong model's crossover spec.

**Acceptance:** `\d rag_document_chunks` shows `vector(768)`; HNSW index present; `/api/rag/*` still compiles.

### T1.2 One embedder

Delete the Gemini embedding calls from `src/app/api/rag/documents/route.ts` and `src/app/api/rag/search/
route.ts`; both use `embedText`. Remove `getEmbedding`/`getEmbeddingsBatch` from `src/lib/ai/gemini.ts`
(generation helpers stay).

**Acceptance:** a document uploaded through `/api/rag/documents` produces rows in both tables — impossible today.

### T1.3 Archive the corpus out of the fork checkout

`nemoclaw-fork/data/` is a fork working tree, not a durable home, and 32 MB of proprietary Bose documents does
not belong in git. Mirror the 548 `.md` files to Vercel Blob under `manuals-md/` (private) with a manifest;
`BLOB_READ_WRITE_TOKEN` is already configured. After ingest the DB holds the text; Blob is the re-ingest source.

**Acceptance:** manifest lists 548 entries with sha256; a random file round-trips byte-identical.

### T1.4 Ingest script `scripts/ingest-service-manuals.mts`

Per file:

1. Parse YAML frontmatter (`source`, `type`); title = filename without extension.
2. **Pages, in priority order.** Split on `\f` — measured: **350 of 523 ingestable files carry form feeds**
   (12 173 pages total). For the other **173** (including the three largest: `L1 Model I` at 604 KB,
   `BUILT-INvisible`, `Personalized Amplification System`), fall back to standalone monotonic integer lines
   as page breaks — verified present in `L1 Model I` (lines 76, 115, 149, 192, 238, 282 → 2,3,4,5,6,7) —
   accepting a break only when the value increments by 1 and sits ≥20 lines after the previous one. If
   neither signal exists, write `page: null` and cite by section. **Never infer a page number.**
3. Within a page, split on ALL-CAPS section headings; carry the last-seen heading as `section`. Chunk to
   ~1200 chars with 150 overlap **without crossing a page boundary**, so `page` never lies.
4. Extract `model_tokens` from the filename and the first page (`151 SE`, `1401`, `Series II`, `Lifestyle 35`)
   for the prefilter; normalize case and spacing.
5. `embedText` in batches of 64; upsert `rag_documents` (`source_kind='service_manual'`, `source_ref` =
   stable slug) + chunks. Idempotent on `content_hash`; flags `--limit`, `--dry-run`, `--only <slug>`.
6. Skip and report files under 500 bytes rather than writing junk chunks — **25 of 548 fall below it**
   (`Wave Radio Schematic 1993`-class stubs, 1 chunk each).

**Sizing, simulated over the real corpus** (`/tmp/chunkprobe.mjs`, 523 docs after the 500-byte skip):
**33 647 chunks**, 64.3 per document average, 410 max, **526 embedding batches** at 64/request. Budget the
full run accordingly; it is one-time.

**Acceptance:** `--limit 5 --dry-run` prints page/section/chunk counts with no writes; a real `--limit 5`
yields chunks whose `page` matches the form-feed count on a form-feed file and `null` on a pageless one; the
full run reports `processed / skipped / failed` and lands within ±10 % of 33.6 k chunks.

---

## Phase 2 — Direct retrieval, tunnel deleted

### T2.1 `src/lib/ai/doc-retrieval.ts` (new)

```ts
export interface DocChunkHit {
  text: string;          // capped at 900 chars, whitespace-collapsed
  score: number;         // 1 - cosine distance
  documentId: string;
  title: string;         // '151 SE Service manual'
  page: number | null;
  section: string | null;
  href: string | null;   // /manuals/<slug>?page=N#c<chunkIndex>
  kind: 'service_manual' | 'policy' | 'collateral' | 'upload';
}

export async function retrieveDocChunks(
  orgId: OrgId,
  query: string,
  opts: { kinds?: DocKind[]; modelTokens?: string[]; topK?: number; minScore?: number },
  deps?: Partial<DocRetrievalDeps>,   // { embed, query } — injectable, tests do no network
): Promise<DocChunkHit[]>;
```

Each rule is a transmission or readability decision:

- **Metadata prefilter first, vector second.** With `modelTokens` known (from `extractParams`'
  `modelNumber`/`item_number`), filter by `model_tokens && $tokens` before ordering by `embedding <=> $1`.
  Fall back to unfiltered only when the filtered set is empty, and flag those hits so the caller can say
  "no manual for that model — closest match is…".
- `topK` 6, `minScore` 0.35. Below the floor return `[]`; an empty array is what makes evidence-gated
  refusals possible.
- **Max 2 chunks per document**, so one verbose manual cannot fill the context.
- 900-char cap per chunk, ~5 KB per block. The tunnel shipped a synthesized paragraph plus chunks on a 30 s
  WAN budget (`AbortSignal.timeout(30_000)`); this is one in-region query.
- Throws only on embed/DB failure, never on "no results".

**Acceptance:** unit tests cover floor filtering, per-document dedupe, char cap, prefilter-then-fallback,
empty query. No network.

### T2.2 Swap both consumers, delete the client

- `suggest-reply.ts:132` — `queryRag` adapts `retrieveDocChunks(orgId, q, { kinds: ['policy',
  'service_manual'] })`. Chunks carry real `score` so `resolveConfidence` gets a true `ragTopScore`; sources
  become `title · p.N`. **`answer` is dropped**; `suggest-reply-core.ts:202-205` sets `grounded =
  chunks.length > 0` and composes `groundingBlock` from chunk text.
- `api/ai/chat/stream/route.ts:178-200` — the `bose_manual` intercept calls `retrieveDocChunks` with
  `kinds: ['service_manual']` and the model tokens `extractParams` already produces. Keep the existing
  `AiStructuredAnswer` shape and the 0.7/0.4 bands; `sources[]` become `{ label: title, detail: 'p. N ·
  DISASSEMBLY PROCEDURES', href }`.
- **Delete** `src/lib/ai/nemoclaw-rag.ts`; move/replace `RagChunk`/`RagQueryResult` (referenced at
  `suggest-reply-core.ts:28`) with `DocChunkHit`. No shim, no re-export.
- Remove `NEMOCLAW_RAG_URL` from `.env:156` and `.env.example:175`; delete the `rag.michaelgarisek.com` DNS
  record. Nothing to stop on avion — the hostname was never in this box's ingress.

**Acceptance:** `grep -rin nemoclaw src .env .env.example` → no matches. A support suggestion with a matching
policy doc returns `confidence != 'low'` and ≥1 `rag` chip. A manual question returns `repair_diagnostics`
with page-accurate sources. Both degrade to today's ungrounded behavior when retrieval is empty.

---

## Phase 3 — Clicks and citations

### T3.1 Zero-click grounding on pin
`SupportAssistDisplay.tsx` auto-runs `suggest` on mount when the ticket is pinned (ticket id resolved and a
customer question exists). Once per ticket id, aborted on unmount, suppressed if the operator has already
typed. Manual **Suggest** remains as re-run. **−2 clicks per ticket.**

### T3.2 Enter inserts the draft
Focus lands on the draft; `Enter` calls the existing `bridge.setDraft(result.suggestion, { mode: 'public' })`,
`Esc` calls `suggest.reset()`. Same chokepoint as the button — the human still sends.

### T3.3 Manual viewer + citation links
The source PDFs do not exist on either box, so citations cannot point at a blob. Add `GET /manuals/[slug]`
rendering the stored markdown with `?page=N` scroll anchors and `#c<chunkIndex>` highlight, and make `rag`
source chips link to it. One click from a claim to the passage that backs it; today the tech opens the file
by hand.

**Acceptance:** clicking a `rag` chip opens the right manual scrolled to the cited page with the chunk
highlighted.

---

## Phase 4 — Lane registry (after the corpus is real)

Convert the `enrich-turn.ts:165-188` if-chain into `src/lib/assistant/lanes/`: `carton`, `org_chat`,
`local_ops` (existing branches, now `pin` predicates) plus `support_reply` and `repair_procedure`. Lane =
`{ id, patterns, pin, params, retrieve, tools, system, requiresEvidence }`; the router returns
`{ lanes, confidence, abstained, stage }`. Stage 0 = pins (ticket id, open `/repairs`, resolved sku);
Stage 1 = the **normalized** lexical score — today `detectIntents` (`intent-router.ts:206`) compares raw hit
counts, so the 8-pattern `bose_manual` lane outranks a 5-pattern lane on noise alone. Add Stage 2 (exemplar
centroids via `embedText`) only if the confusion matrix demands it.

`repair_procedure` sets `requiresEvidence: true`: empty retrieval ⇒ "no manual for that model" instead of an
invented torque spec — the same gate as `invented_ids_zero` in the CycleForgeAI harness.

**Acceptance:** every existing branch has a lane plus a test asserting unchanged behavior; the two new lanes
expose ≤6 tools out of the ~40 advertised today.

---

## Phase 5 — Backfill and measurement

- Run the embedding worker over `entity_search_docs` (11 716 rows, 0 embedded) so `usedSemantic` can ever be true.
- **Retrieval goldens:** 20 repair questions with a known manual (and page, where the file has page markers);
  assert the right document is top-3, and the page within ±1 for the 350 form-feed manuals. Run against the
  real corpus after ingest.
- **Router goldens:** add `expect_lane` to `~/CycleForgeAI/evals/cycleforge-v1/golden.jsonl`, plus a
  confusion matrix and a `routing_accuracy >= 0.95` gate in `scripts/eval_server.py` beside the existing five
  gates. Route accuracy is scored separately from answer quality — a good answer from the wrong corpus is a
  failure.

---

## Out of scope (recorded, not done here)

- **507 collateral PDFs** (`product_manuals`): ingest later as `kind='collateral'` behind a lane filter. 208
  are near-identical QR inserts and would poison repair retrieval.
- `MANUAL_SERVER_URL=http://127.0.0.1:3001` (`src/lib/manual-server.ts:34`) — nothing listens on 3001 on
  avion. Second dead local bridge; retire it after auditing its callers.
- `product_manuals` linkage debt: 498 of 513 rows `unassigned`, 9 with `sku_catalog_id`, 2 with a
  `google_file_id`. Affects collateral routing only.
- MLX serving/adapter work — `~/CycleForgeAI/docs/mlx-vs-cuda-eval-and-port.md`.

## Verification commands

```bash
# corpus present and shaped
psql "$DATABASE_URL" -At -c "select source_kind, count(*) from rag_documents group by 1"
psql "$DATABASE_URL" -At -c "select count(*), avg(char_len)::int, max(page) from rag_document_chunks"
psql "$DATABASE_URL" -c "\d rag_document_chunks" | grep embedding        # expect vector(768)

# tunnel gone
grep -rin nemoclaw src .env .env.example && echo FAIL || echo OK

# retrieval
npx tsx --test src/lib/ai/doc-retrieval.test.ts
curl -sS localhost:3050/api/rag/search -H 'content-type: application/json' \
  -d '{"query":"151 SE crossover part list","limit":5}' | jq '.results[] | {similarity, page, section}'

# source corpus sanity (avion)
ls ~/Projects/nemoclaw-fork/data/bose-service-manuals/*.md | wc -l        # 548
```
