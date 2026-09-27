# Handoff prompt — port Search to the triage record split (Shopify order-details grammar)

Paste everything below the line into a fresh session.

---

You are porting the **Search** surface (`/search`) of CycleForge to the design-system triage
split, in the `prod` worktree (`/home/michaelgarisek/Projects/cycleforge-lanes/prod`). Read
`AGENTS.md` first. Dev origin is `http://localhost:3050` ONLY (lane unit `cycleforge-lane@prod`).
The owner tests in the real browser phase by phase — make one change set, typecheck + lint the
touched files, tell the owner exactly what changed, and let them verify before the next phase.

Read before touching code:
- `docs/design-system/BRIEF.md` §12 (every desktop route = **triage**; industrial is the phone
  system) and §13 (motion rules abolished; order-card line-1 grammar).
- `docs/design-system/MODE-SPLIT-INVENTORY.md` — `/search` is listed as **No region**,
  "half-styled (/search dossier nests triage)".
- `docs/design-system/HANDOFF-card-list-port.md` — the sibling port (commit rules, dirty tree).
- ~446 dirty paths from several concurrent sessions: never commit without asking; hunk-split
  shared files; re-read a file right before editing it (other sessions edit `OrderCard.tsx`,
  `OrderRecordView.tsx`, `order-link-editors.tsx` concurrently).

## Goal (owner, 2026-09-27)

Search must be a **triage** tool: find anything — any order, product, SKU, serial, tracking,
customer, PO, repair — then read the whole record in one place without hunting.

The selected record follows a **Shopify order-details page**:

```
┌──────────────── 2/3 work column ────────────────┐┌──── 1/3 facts column ────┐
│ Items — photo · title · SKU · qty · condition   ││ Customer — name, contact │
│   · bin · price  (photos large enough to judge) ││ Shipping address         │
│ Shipping / fulfillment — label, carrier,        ││ Platform · order # ↗     │
│   tracking, stages (pick → pack → ship)         ││ Tags / notes             │
│ Timeline — exact, chronological, every event    ││ Ask AI about this record │
│   (audit, station scans, carrier, messages,     ││                          │
│   photos) — BELOW the items                     ││                          │
└─────────────────────────────────────────────────┘└──────────────────────────┘
```

**Progressive disclosure:** the first screen answers "what, who, where is it now". Detail
(full timeline, every photo, raw carrier events, per-line history) opens in place — sections
collapsed to a summary line with a count, expanding on click; never a second page.

## What exists (mapped 2026-09-27 — re-verify line numbers, the tree moves)

| Piece | File | Today |
|---|---|---|
| Route | `src/app/search/page.tsx` → `src/components/search/SearchFindSurface.tsx` | `?q` & no `?sel` → `SearchBrowseShell`; `?sel=<type>:<id>` → `SearchDetailWorkspace`; `?entry=label` → label intake. No `ModeRegion` at the route root |
| Browse | `SearchBrowseShell.tsx`, `SearchResultsSurface.tsx`, `SearchRefineControls.tsx`, `hits-grid/useSearchHitsSpreadsheet.ts` | full-bleed `DataTable` of hits (comfortable) or `SearchResultRow` list (compact); refine = `?etype` `?chan` `?hstat` `?colsort` (`src/lib/search/search-refine.ts`) |
| Detail switch | `src/components/search/dossier/SearchDossier.tsx` | order (desktop) → `SearchOrderRecord` → `OrderRecordView mode="search"` directly (no queue; phase 1); order (compact) → `SearchOrderDossier`; receiving / unit / sku / repair / fba → bespoke `SearchDossierFrame` (w-56 kinds rail + `<dl>` + `SearchFindStream`) |
| Order record (2/3 + 1/3) | `src/components/outbound/orders/OrderRecordView.tsx` | uses `DeskRecordLayout`; 2/3 items → shipment → labels → documents → timeline; 1/3 customer → facts → buyer note → price → note → conversation (phase 1) |
| Timeline | `src/components/shipped/OrderTimelineSection.tsx`; `src/components/search/dossier/SearchFindStream.tsx` | order timeline mounted by `OrderRecordView` (`timeline` section, every desk); non-order dossiers still use the lighter find-stream |
| Photos | `usePhotoGallery` / `PhotoViewerPortal` (`src/components/shipped/photo-gallery/`), `CardPhoto` in `outbound/orders/cards/OrderCard.tsx` | gallery used only inside find-stream evidence thumbs |
| Split tokens | `src/design-system/tokens/desk-stage.ts` | `DESK_RECORD_COLUMNS_CLASS` / `_MAIN_COLUMN_CLASS` / `_ASIDE_COLUMN_CLASS` / `_COLUMN_CARD_CLASS`, `DESK_SPLIT_LIST_CLASS` / `DESK_SPLIT_RECORD_CLASS`, `FIND_STAGE_BY_DENSITY` |
| Fact rows | `src/design-system/components/record-ledger/EvidenceDisclosure.tsx` (`EvidenceDisclosure`, `EvidenceFactRow`), `RecordFullId`, `RecordIdentity` | canonical facts + 32 px trailing action cell — reuse, do not hand-roll `<dl>` |
| Backend | `GET /api/global-search` (`src/app/api/global-search/route.ts`) → `findRecords` (`src/lib/search/find-records.ts`) → exact/ILIKE `searchAllEntities` (`global-entity-search.ts`) + `hybridSearch` BM25 + pgvector RRF (`hybrid-retrieval.ts`) + relaxation ladder (`query-relaxation.ts`); Redis 60 s cache; `search_query_log`; `POST /api/search/opened`; `/api/identify` paste/scan classifier | limit max 50; entity types in `src/lib/search/search-hit.ts` |
| AI | `src/lib/assistant/tools/read-tools.ts` (`hybrid_entity_search`, `exact_id_serial_search`, `search_notes`), `domain-read-tools.ts` (`get_operations_journey` → `/search?sel=order:N`); UI `src/design-system/ai/*`, `/ai-chat` | the assistant can search; **search cannot reach the assistant** (no Ask-AI on `/search`); `/api/ai/search` is deprecated |
| Command bar | `src/components/CommandBar.tsx` (⌘K, `/api/global-search?limit=12&surface=palette`) | Enter → `/search?q=`; hit → `/search?sel=` |

## Phases (one at a time; stop after each for the owner)

1. **DONE (2026-09-27, owner verifying) — Triage region + order record grammar.** `/search` was
   already triage via `src/lib/routing/mode-registry.ts` (`RouteModeRegion`; page-level regions
   are retired), so no wrapper was added. `SearchOrderLedger` is deleted; `SearchOrderRecord`
   mounts `OrderRecordView mode="search"` directly (header + `OrderRecordActionStrip` above it;
   lines fetched under the `['orders', …]` key so `useOrderAssignment`'s optimistic patch lands).
   In `OrderRecordView` for every desk: 2/3 = items → shipment → label entries → documents →
   **timeline** (`OrderTimelineSection`, new `timeline` section id); 1/3 = customer (ship-to) →
   facts (platform, order # ↗, listing, tracking, ship by) → buyer note → price → order note →
   conversation. Owner ruled the timeline goes on **every** desk (To ship, Pending, Exceptions,
   Shipped, Search). `DeskStageRecordHeader.onClose` is optional (bare deep link has no ✕).
2. **DONE (2026-09-27, owner verifying) — Photos via the photo peek (owner ruling).** Not a
   new strip: the existing `PhotoPeekFan` (hover fans, click → fan, card → `PhotoViewerPortal`)
   mounts on every order record through `OrderPhotoPeek` (the order-timeline payload's
   `unitPhotos`, newest first — no second fetch). Placement is `DeskRecordLayout`'s new `peek`
   slot: sticky on the LEFT edge of the details rail when the record has one, else the record's
   right edge (split view, narrow stage); the rail/edge clips the tucked cards.
   `PhotoPeekFan placement="inline"` drops its own pane-corner wrapper. Listing (catalog) photos
   are not in the payload yet — unit stage photos only.
3. **PARTIAL (2026-09-27) — Progressive disclosure pass.** Timeline paints the newest 5 events
   with "Show N earlier events" in place (`OrderTimelineSection initialLimit`); Documents and
   Conversation are one-row `EvidenceDisclosure lazy` sections (body + fetch on first open). Each
   line's stage chain folds to a **Fulfilment** row showing the latest done step ("Packed · Tuan ·
   Sep 25, 2:49 PM"); it opens by default only while the line is not scanned out. The bin shows
   as a fact; the full bin list (`/api/locations`, ~128 KB) loads only when the bin picker opens
   (`SearchableSelectField onOpenChange` → `useLocationPickerOptions({ enabled })`). Not yet:
   per-section state surviving J/K; "Show earlier events" unexercised (test orders had ≤5 events).

   **Fixed alongside (owner report, 2026-09-27):** `/search` for `7109` dead-ended on "FBA
   order — Amazon fulfills this order". `resolveSearchOrder` had an `fba` status and the row
   fetchers dropped FBA rows; FBA rows are internal records, so `status: 'fba'` is gone and
   Search fetches with `includeFba`. The search record also lacked an `@container` host (it
   rendered one column), painted "Scanned out" twice, and showed shipped orders as
   "RDY · Ready" (`recordState` now reads `ship_confirmed_at` → `shipped`).

   **Speed (2026-09-27, dev :3050 warm unless noted):** auth floor per authed request
   ~650 ms → ~230 ms (session+overrides+email+roles in one query); `tenantQuery` 4 → 3 round
   trips everywhere; `/api/orders/[id]/timeline` p50 3.8 s → 0.7 s (one-trip reads, parallel
   waves; migration `2026-09-27_perf_audit_logs_org_order_entity.sql` written, NOT applied);
   `/api/orders?orderId=` 0.72 s → 0.28 s, `?q=<order#>` 1.8 s → 0.5 s, lookup 404 1.6 s →
   0.5 s; `/api/global-search` cold 1.3–2.8 s → 0.45–0.95 s (identical rows for 7 inputs,
   96-case engine A/B). The record's timeline now prefetches from `?sel` in parallel with the
   resolve. Request-shape captures (prod build): `docs/performance/request-shape/search-*.json`.

   **Follow-ups (evidence in the captures above; not done in this batch):**
   - ~~`/api/locations` on every record open~~ — done (just-in-time, see above).
   - `/api/staff?active=true` (staffCache singleton) and `?active=false` (StaffColorsProvider,
     React Query) fetch overlapping rosters on every page; unify only with a cache-lifetime design.
   - Record critical path: the `shipped?q` hop is gone for Search (`enrichFromShipped: false`);
     now `orders?orderId` → lines/price/labels. The phone dossier shares the resolve and loses
     the `/api/shipped` re-read too — the record repaints from `/api/orders` rows either way.
   - `idx_audit_logs_org_order_entity_created` is live (ledger row 2026-09-27 22:17 UTC):
     the timeline's audit read went 2.7 ms → 0.07 ms (Index Cond on org + entity_id).
   - Free-text `hybrid-retrieval` SQL 300–580 ms: RLS (`app_tenant`) blocks trigram index use;
     needs a security-definer search function or leakproof predicate — owner decision.
   - `PG_POOL_MAX=5` + 10 s idle timeout: first request after idle pays 0.5–0.7 s of Neon
     WebSocket setup; 15 parallel page-load requests queue on 5 connections in dev.
   - FBA rows: platform reads "Set platform" (empty `account_source`); the action strip offers
     "Mark scanned out" / "Report out of stock" on already-shipped orders.
4. **Browse ↔ record split.** With `?q` and a `?sel`, keep the hit list visible: list on
   `DESK_SPLIT_LIST_CLASS`, record on `DESK_SPLIT_RECORD_CLASS` (or the in-place / split switch
   `DeskRecordPlane` already has). J/K walk hits, Enter opens, Esc returns to the list with scroll
   kept. Hit rows show a thumbnail, entity glyph, identity, status, platform — one grammar across
   entity types (ask the owner whether hit rows adopt the order-card face).
5. **DONE (2026-09-27, owner verifying) — Every entity on the same split.** `SearchDossierFrame`
   (the w-56 "Overview" kinds rail) and `SearchFindStream` are deleted, with the outline model
   (`FIND_OUTLINE_*`, `outlineFromEvents`, `filterEventsByKind`, `presentFindDossier`). Carton,
   unit, SKU, repair, FBA and the compact order all mount `SearchEntityRecord`
   (`src/components/search/dossier/`): `DeskStageRecordHeader` ("Unit 060285Z92840443AE", ✕ back
   to results, handoff buttons) → `DeskRecordLayout` 2/3 = state row, findings, lines (112 px
   photo, SKU identity title, facts, serial → `?sel=unit:` links) then **Timeline**
   (`TimelineSection`, the order record's component, newest 5 + "Show N earlier events");
   1/3 = identity facts (`EvidenceFactRow`, identifiers via `RecordFullId`) then **Related**
   links that keep `?q` (unit → allocated order / catalog SKU; carton → linked order / PO query;
   repair → source order / serial; FBA → FNSKU / SKU; SKU → everything with that SKU). Photos
   ride the same `PhotoPeekFan` peek as the order record. `/api/serial-units/[id]` allocations
   now carry `order_number`. Carton line titles go through `resolveSkuIdentityTitle`.
   Both search records (order + entity) sit on `DESK_STAGE_FIXED_CLASS` (max-w-6xl, centered),
   the To-ship stage measure; they had painted edge to edge (measured at 2560 px: 1152 wide, 704 left).
6. **PARTIAL (2026-09-27) — Search coverage + load ("hammer the API").** Probe (dev :3050,
   `/api/global-search?limit=50`, one real query per kind; rank of the expected record):

   | Kind | Query | Expect | Rank |
   |---|---|---|---|
   | Order # (Ecwid) | `5084` | order 19449 | 1 |
   | Order # (eBay) | `09-15214-46312` | order 19441 | 1 |
   | Order tracking | `9400150106151407891341` | order 19449 | 1 |
   | Order tracking (UPS) | `1ZJ22B104212840785` | order 19441 | 1 |
   | Item number | `175324421` | order 19448 (#5085) | 1 |
   | Customer name / email / phone | `Chris Loughran` / `lockycal@gmail.com` / `7604587772` | order 19449 | 1 |
   | Serial | `060285Z92840443AE` | unit 2191 | 1 |
   | SKU | `00364-WY` | sku 2639 | 1 |
   | Product title | `Bose PS48 Series III Subwoofer` | sku 2639 | 4 (orders first) |
   | PO | `15-15190-56779` | carton 53211 | 1 |
   | Carton tracking | `1Z3Y496R0398693994` | carton 53211 | 1 |
   | Repair ticket / serial | `10063`, `#10063`, `ticket 10063` / `5210AC` | repair 4868 | 1 |
   | Repair customer phone | `714-713-9805`, `(714) 713-9805`, `+1 714 271 2864` | repair 4868 / 4799 | 1 |
   | Support ticket | `#530`, `530`, `ticket 530`, `Ticket #530` | carton 53338 (its linked carton) | 1 |
   | FBA shipment | `FBA-09/25/26` | fba 80 | 1 |
   | Bin | `D-04-08-2-00`, `D0408200` | location 623 | 1 |

   Fixed in the engine (2026-09-27): a bin code decodes as a printed `bin` scan, so it now
   routes to an exact `searchLocations` arm (name or barcode, dashes ignored); repairs match a
   `#`-prefixed ticket and a phone (contact line or linked customer, last 10 digits);
   `ticketPhraseToId` turns "ticket 530" into `#530` (as free text it matched another
   ticket's title). `/search` opens only order/unit/receiving/sku/repair/fba as records
   (`isSearchRecordType`); bin, ticket and warranty hits hand off to their desk instead of a
   `?sel=` "Unknown selection" page. Still to do: listing-URL case, the table as a committed
   eval, and p50/p95 under concurrent typing (single-request dev timings were 0.3–1.6 s warm,
   3–8 s on the first cold pass). Do not raise the 50-hit clamp without asking — paginate with
   a cursor instead.
7. **PARTIAL (2026-09-27) — Route to AI: the assistant rides the search.** Owner ruling: an
   inline composer on `/search`, not a jump to `/ai-chat`. `SearchAssistantFrame`
   (`src/components/search/assistant/`) wraps the desk search: a pill at the foot ("Ask about
   Order 5084…", Motion+ `Typewriter`, ⌘J / Ctrl+J) morphs (shared `layoutId`) into the AI
   composer carrying the record + query as chips; on the first send the conversation pane
   slides in from the LEFT and the record / results stay live on the right. Context =
   `page:'search'`, `selection`, `mode` (the query), an order mention (`orders.id`), and a skill
   line naming the order NUMBER vs the pk (the first probe answered "order 19449 not found"
   until the two were spelled out). `/search?sel=` links in answers re-open the record on the
   right; record cards render inline; ⤢ continues on `/ai-chat?session=`. Verified at `:3050`
   (order 5084: answer + record card + follow-up chip, record still open). Not yet: question-
   shaped queries / ⌘Enter routing to the assistant (7a); the phone (`/m/assistant` stays).

## AI track — ask instead of search (owner, 2026-09-27)

The operator should be able to *ask* ("where is order 4899 now?", "who packed the Bose
Wave remote last week?") and get the same record `/search` shows, without typing into a
search box and clicking through hits. Method: **one retrieval, one record, one eval — two
mouths.** `/search` and `/ai-chat` must never disagree about what exists.

Gap found 2026-09-27: the assistant's `hybrid_entity_search` / `exact_id_serial_search`
(`src/lib/assistant/tools/read-tools.ts`) call `hybridSearch` / `searchAllEntities`
directly, bypassing `findRecords` (relaxation ladder, Redis cache, `search_query_log`). A
query can resolve on `/search` and miss in chat.

Run each step alongside the search phase it shares code with:

| Step | With phase | Change | Proof |
|---|---|---|---|
| A1 Retrieval parity | 6 | One `find_records` tool over `findRecords` (same org scope, axis, relaxation, query log with `surface: 'assistant'`). Delete the two direct-search tools after goldens pass. | The phase-6 per-kind table passes identically through `/api/global-search` and the tool. |
| A2 Pasted id / scan fast path | 6 | An input that `/api/identify` classifies as a bare identifier (paste or wedge scan into the composer) resolves without the model: open the record summary at once; the model only answers follow-ups. | Scan → record under 1 s, no LLM round in the trace. |
| A3 Record summary in chat | 1, 3 | An `open_record(sel)` result renders the record's **first screen** inline (what / who / where now: items with photo, current shipping stage, last event) from the same section data as `OrderRecordView`. "Open full record" goes to `/search?sel=` (or the right rail if the owner picks the drawer; see Q4). Never a chat-only record layout. | Same facts as `/search?sel=order:N`, side by side. |
| A4 Timeline questions | 1 | "When / who / what happened" reads the same events as `OrderTimelineSection` (via `get_operations_journey`). Each claim cites the event time; the answer links `?sel=`. | Golden: "who packed order N", checked against the timeline row. |
| A5 Ask AI from a record | 7 | "Ask AI about this record" opens the composer with an `@order N` mention (existing mention contract: `context.mentions`, kinds `order \| sku \| bin`; add `unit \| receiving \| repair \| fba` in step with phase 5). No free-text context blob. | The mention id reaches the tool call verbatim. |
| A6 Question vs lookup router | 7 | On `/search`: identifier → record (today); question-shaped query or ⌘Enter → assistant with the query. In chat: identifier → A2 fast path; question → model. One classifier (`/api/identify`) for both. | Table of 20 real inputs routes correctly. |
| A7 Shared evals | 6 | Every phase-6 kind query becomes an `ai:eval` golden (`scripts/ai-eval/goldens.ts`: "find <query>" → correct `sel`). Chat misses and zero-hit `search_query_log` rows feed both suites. | `pnpm ai:eval` and the search eval green on the same corpus. |

Rules for the track: the model never types record data. Tools return the data, the UI
renders it (inline for data, right rail for documents). Plain-language labels only. Every
answer about a record links back to `/search?sel=`.

## Rules

- Desktop = triage (BRIEF §12): shadcn new-york radius, neutral palette; industrial only on
  `/m/*`. The compact (`/m`, coarse pointer) dossier must keep working — mobile-first law
  (`docs/mobile-first/SURFACE_LAW.md`): every verb reachable on the phone.
- URL state with `readLiveSearchParams` + `window.history.replaceState`, never `router.replace`
  for quick presses.
- SKU identity: titles and photos via `resolveSkuIdentityTitle` / `SKU_CATALOG_JOIN_ON_SQL` (the
  Zoho item governs) — run `ds_sku_identity` before writing a product title.
- One record, not two: anything the search record shows that the To-ship record should too goes
  into `OrderRecordView` (or a shared section), never a search-only copy.
- Before calling a phase done: `npx tsc --noEmit -p tsconfig.json` (filter to touched files),
  `npx eslint <touched files> --quiet`; `pnpm verify:fast` before handing a batch back.

## Open questions for the owner (ask before the phase that needs them)

1. ~~Phase 1: should the To-ship order record also get the timeline under its items?~~ **Yes — every desk (owner 2026-09-27).**
2. Phase 4: do hit rows adopt the order-card face, or stay a denser table?
3. Phase 5: which related-record links matter most per entity (unit → order, carton → PO, …)?
4. Phase 7: AI answers in a drawer on `/search`, or hand off to `/ai-chat`?
5. Which queries fail today that you hit most — seed the phase-6 eval with them.
