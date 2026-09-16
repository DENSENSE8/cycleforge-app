# PLAN — FIND 10x: index reach + the three dead kinds

**Status:** Phases A–D **SHIPPED** in the prod lane (A–C 2026-09-11, D 2026-09-12; see §5 Phase checklist). Only
Phase E (embedding provider) remains — it needs a credential, not code. Migrations `2026-09-11a` /
`2026-09-11b` / `2026-09-12a` are APPLIED to the `lane/prod` Neon branch only; `2026-09-12b` is authored and
awaiting apply. Main has not run any of them.
**Complements:** [`search-investigation-timeline-PLAN.md`](search-investigation-timeline-PLAN.md) (DONE). That plan
built the FIND *display* and put "Search ranking / hybrid index" **out of scope** (§7). This file is that scope,
plus the three declared-but-unproduced stream kinds it left behind.
**Does not re-open:** FIND chrome, Displays refusal, recents refusal, `/m/search` as SoT column, handoff-only writes.

**Paste for a new session:**

> Read `docs/todo/search-10x-index-and-notes-PLAN.md`. The FIND display is DONE — do not redesign it.
> Work is: (A) what enters `entity_search_docs`, (B) the trigger→outbox→worker SOP for new sources,
> (C) producers for the `note` / `exception` / `status` kinds. Lane law applies. Graph-impact
> `buildSearchText` / `drainSearchOutbox` / `presentOrderFindEvents`, never one adapter.

---

## 0. Verdict

The display is not the bottleneck. **Recall is.**

An operator can only investigate a record FIND can *find*. Today FIND resolves six entity types, ranks them
with a keyword arm whose semantic partner is inert, and then paints a case-file whose Notes tab has no
producer. Three separate ceilings, none of them visual:

| Ceiling | Evidence | Cost of leaving it |
|---|---|---|
| **Reach** — 6 of ~26 item-discovery families are indexed | `build-search-text.ts:32-39` CHECK-pinned to `ORDER · SERIAL_UNIT · RECEIVING · SKU · REPAIR · FBA_SHIPMENT` | A warranty claim, a bin, a support ticket, a Zoho item is unfindable by text. Staff fall back to per-desk pickers. |
| **Freshness** — join-table writes do not re-enqueue the parent | `2026-07-03d_entity_search_docs.sql:39-43` (documented, deliberate) | A serial or tracking attached after the last parent write is invisible until the next parent write. |
| **Semantics** — the vector arm is dead org-wide | `2026-08-29d_search_query_log.sql:76-78`: `used_semantic` "currently always FALSE org-wide (entity_search_docs holds 0 embeddings)" | Half the retrieval architecture is paid for and switched off. Typo/paraphrase recall is trigram-only. |

Plus a display gap the FIND plan left behind. **Corrected 2026-09-11 after reading the code, not grepping it:**
an earlier draft of this file claimed `note` and `exception` had *no* producer. That was wrong — both are
produced inside `findEventsFromInventory` (`find-events-from-sources.ts:105`) as a computed `kind`, which a
`grep "kind: 'note'"` cannot see. The real defect was narrower and worth fixing anyway:

| Kind | Before | Finding |
|---|---|---|
| `note` | produced ONLY for `inventory_events` rows typed `NOTE` / `NOTE_ADDED` | The three real note spines — `order_notes`, `thread_messages`, `entity_signals.notes` — reached the stream from none of them. `OrderTimelinePayload.threadMessages` was already fetched on every order and discarded. |
| `exception` | produced ONLY for five `inventory_events` types | `entity_signals` (severity + `reason_code`) and the exception tables do not reach the stream. Still open. |
| `status` | declared in the catalog | **Never had a producer and could not earn one** — the status pin is the hero band and a transition already rides its hop's body. Removed rather than stubbed. |

**10x is: index more families, keep them fresh, turn the vector arm on, and give the three dead kinds a feed.**

---

## 1. Decisions locked

| Decision | Verdict |
|---|---|
| New display surface | **Refuse.** FIND is done. Every result of this plan lands in the existing dossier column. |
| New search route / second index | **Refuse.** One index (`entity_search_docs`), one writer (the outbox worker). |
| Domain helpers call `upsertSearchDoc` | **Refuse.** Trigger→outbox→worker only. A new write site must not be able to forget. |
| `entity_type` as a pg ENUM | **Refuse.** Stays TEXT + named CHECK (`2026-07-03d.sql:8-9`) so the set grows without a rewrite. |
| Denormalized timelines in `entity_search_docs` | **Refuse.** The index finds records; the dossier assembles history. Unchanged from the 2026-07-17 decision log. |
| Identifier relaxation | **Refuse.** A serial miss stays a miss (`find-records.ts:23-28`). Widening reach must not widen identifiers. |
| Notes in the index vs notes on the stream | **Both, different jobs.** Note *text* joins parent `search_text` for recall; note *events* feed the `note` kind for display. |
| Ordering | Reach and freshness before semantics. An embedding over a missing row buys nothing. |

---

## 2. Part A — Index audit: what must be ported

Source: scout census against `build-search-text.ts`, `search-outbox-worker.ts:82-199`, `table-catalog.ts`.

### A1. New entity types (expand the CHECK)

Each costs: one `CHECK` value + one `LOADER_SQL` branch + one builder in `build-search-text.ts` + INSERT/UPDATE
triggers + a backfill enqueue. No new `.tsx`.

| # | Entity | Table | Grain | Identifiers staff type | Why it earns a row |
|---|---|---|---|---|---|
| 1 | `WARRANTY_CLAIM` | `warranty_claims` | claim | `claim_number`, `serial_number`, `source_order_id`, `zendesk_ticket_id` | Already a `PRODUCT_TABLES` sheet and an `entity_threads` anchor. A customer calls with a claim number and FIND cannot resolve it. Highest value of the set. |
| 2 | `SUPPORT_TICKET` | `support_tickets` | ticket | `#42`, `external_ticket_id` | Today only a regex bypass maps `#\d+` to cartons (`support-ticket-search.ts:6-25`). The ticket itself is not a record. |
| 3 | `LOCATION` | `locations` (+`bin_contents`) | bin / room | `barcode`, `name`, `display_name` | Bin barcodes are scanned constantly; `bins` is a mounted sheet. "What is in B-3" is a search, not a report. |
| 4 | `ITEM` | `items` (Zoho mirror) | ERP item | `zoho_item_id`, `sku`, `upc`, `ean`, `name` | **Hazard:** `items.sku` and `sku_catalog.sku` are two schemes that collide on the same strings (`2026-07-22_sku_catalog_provider_item_id.sql:5-9`). Index only with `provider_item_id` join provenance in `subtitle`, never merged into the `SKU` doc. Ship last. |

Not promoted, and why: `testing_results` (a child of a unit — folds into `SERIAL_UNIT`), `receiving_line`
(already aggregated into the parent carton doc), `packer_logs` / `station_activity_logs` / `ops_events`
(audit streams, reachable through the dossier), `photos` (media library job), `user_reported_issues`
(internal dev loop).

### A2. Enrichment of existing docs (no new type, no CHECK change)

Recall wins that cost one loader-SQL join each. These are the identifiers staff hold in their hand today and
cannot search.

| Doc | Add to `search_text` | Source | Gap it closes |
|---|---|---|---|
| `SKU` | `platform_sku`, `platform_item_id` (ASIN / eBay item id), `account_name` | `sku_platform_ids` | An ASIN or eBay listing id finds nothing. |
| `SKU` | `component_name`, `document_title` | `sku_kit_parts` | BOM part names and in-box insert titles are unsearchable. |
| `SKU` | manual `display_name`, `file_name` | `product_manuals` | Manual lookup lives in a separate picker API. |
| `SERIAL_UNIT` | `handling_unit_id` (tote `H-####`), bin `barcode` | `serial_units`, `locations` | Tote and bin scans do not resolve the unit. |
| `SERIAL_UNIT` | failure-mode labels | `unit_failure_tags` → `failure_modes` | "dead hdmi" cannot find the units that failed that way. |
| `ORDER` / `RECEIVING` | `value_text` of non-archived defs | `custom_field_values` | Tenant-defined columns are invisible to search. |
| `ORDER` | `note_text` of recent notes | `order_notes` | **Not indexed today.** The loader selects `orders.notes` (the column), never the `order_notes` table (`search-outbox-worker.ts:85`, 0 hits for `order_notes`). Every staff note written through the notes trail is unsearchable. |
| all 7 anchors | last `thread_messages.body` | `entity_threads` | Conversation content is unsearchable across every family. |

`MAX_SEARCH_TEXT = 2000` (`build-search-text.ts:73`) is the budget. Enrichment must be measured against it —
appending past the cap silently truncates the tail, which is where these identifiers would land. **Raise the cap
or rank the parts; do not append blind.**

### A3. Freshness triggers that do not exist

The documented gap (`2026-07-03d.sql:39-43`) plus what A2 adds. Each needs an enqueue trigger resolving the
parent's `organization_id`.

| Join table | Re-enqueues | Blocker |
|---|---|---|
| `tech_serial_numbers` | `ORDER` | none |
| `shipment_links` | `ORDER`, `RECEIVING` | none |
| `shipping_tracking_numbers` | `ORDER`, `RECEIVING` | **CORRECTED:** the "no `organization_id` column" note in `2026-07-03d:39-43` — which this plan repeated — is STALE. The column was added NULLABLE on purpose by `2026-06-14_org_id_phase_b_needs_col_2.sql:58` and is still being healed by the `2026-07-14b` / `2026-07-15b` backfills. Shipped resolution: do NOT trust `stn.organization_id` (that would silently skip exactly the NULL-org rows those backfills exist for) — resolve org AND parent through the four parent links instead. |
| `order_unit_allocations` | `ORDER`, `SERIAL_UNIT` | none |
| `sku_platform_ids` | `SKU` | org is inherited via `sku_catalog_id`; resolve like `fba_shipment_items` does (`2026-07-04a.sql`) |
| `sku_kit_parts` | `SKU` | none |
| `custom_field_values` | `ORDER`, `RECEIVING` | polymorphic — dispatch on `entity_type` |
| `thread_messages` | anchor's type | polymorphic via `entity_threads` |

Precedent to copy exactly: `2026-07-04a_search_outbox_claim_window.sql:64-140` already does this for
`receiving_lines` and `fba_shipment_items`.

### A4. Turn the semantic arm on

`embedding vector(768)` and the HNSW index have existed since `2026-07-03d`; the column is empty org-wide.
The worker already degrades correctly (`search-outbox-worker.ts:503-534`) and already has a retry sweep and a
provider-switch re-embed (`enqueueOrgReembed`). **No code is missing — an embedding provider is unconfigured.**
Resolve the org AI config, then `enqueueOrgReembed(orgId)` and let the sweep fill. Measure with
`search_query_log.used_semantic` flipping non-FALSE.

---

## 3. Part B — Sync SOP (the contract for every new source)

This is the existing pipeline, written down so a new family is added the same way every time. Nothing here is new
machinery; the machinery is the point.

```
parent write (in txn)
  └─ AFTER INSERT / AFTER UPDATE OF <watched cols> WHEN (OLD.x IS DISTINCT FROM NEW.x)
       └─ fn_enqueue_entity_search_outbox('<TYPE>')  → entity_search_outbox (deduped, pending)
                                                         │
/api/cron/search-outbox (5 min, withCronLock, maxDuration 300)
  └─ drainSearchOutbox(batch 50 × maxBatches 10)
       ├─ reset stale claims (claimed_at < now() - 15 min)
       ├─ claim FOR UPDATE SKIP LOCKED, attempts+1, attempts < 5
       ├─ group by org → by type → tenantQuery(LOADER_SQL[type])
       ├─ buildSearchText(type, row)          ← pure, testable, no I/O
       ├─ embed batch (BEST EFFORT — failure upserts with embedding NULL)
       ├─ upsert ON CONFLICT (org, type, id), COALESCE(EXCLUDED.embedding, existing)
       ├─ delete docs whose parent vanished
       └─ mark processed / markFailed (dead-letter at 5 attempts)
  └─ sweepEmbeddingRetries(olderThan 30 min, orgs with a live provider)
```

### Checklist to add one family

1. **Expand the CHECK** on `entity_search_docs` **and** `entity_search_outbox`. Both, or the trigger fails at runtime.
2. **Add the builder** in `build-search-text.ts` with its loader-row contract in the docblock. Facets are typed
   columns, never jsonb.
3. **Add `LOADER_SQL[TYPE]`** — org-scoped `WHERE organization_id = $1 AND id = ANY($2::bigint[])`. Aggregate
   1:many joins in a LATERAL so the outer SELECT stays GROUP-BY-free (the `RECEIVING` precedent).
4. **Add INSERT + UPDATE triggers.** Split them (an INSERT trigger cannot read `OLD`). The `UPDATE OF` column
   list **must mirror the fields the builder reads** — that sync is stated as law in `2026-07-03d.sql:36-37`.
   Double-guard with `WHEN (... IS DISTINCT FROM ...)`: sync writers blanket-SET unchanged COALESCE values every
   poll, and `UPDATE OF` alone re-embeds the whole tenant every interval.
5. **Add the parent-delete trigger** to `fn_delete_entity_search_docs_on_parent_delete`. Every discriminator,
   no silent gaps — the `work_assignments` lesson.
6. **Tenant-from-birth:** `organization_id UUID NOT NULL`, `enforce_tenant_isolation()`. A row that cannot name
   its org is not indexed (the enqueue fn already returns early on NULL).
7. **Backfill by re-enqueue**, never by direct write:
   `INSERT INTO entity_search_outbox … SELECT … ON CONFLICT … DO NOTHING`.
8. **Migration hygiene:** dated immutable filename in `src/lib/migrations/`, idempotent DDL, `ROLLBACK:` and
   `VERIFY:` blocks in the header. Apply with `pnpm db:migrate` **inside the lane**.

### Operational invariants

- **Freshness SLA:** enqueue ~0 ms (in-transaction); keyword live within one drain (≤5 min); embedding
  best-effort same drain, else ≤30 min via the sweep. State this to operators; do not promise real-time.
- **Poison rows** dead-letter at 5 attempts with `last_error` retained. A growing dead-letter count is the
  alarm that a loader or builder is wrong.
- **Never block the doc on the embed.** Keyword must go live even when the provider is down.
- **Idempotency:** re-processing re-upserts the same doc. A crash between claim and mark leaves the row
  pending; `attempts` counts the retry.

### Verification (run in the lane, serverless)

```bash
npx tsc -p tsconfig.json --noEmit
node --import tsx --test src/lib/search/build-search-text.test.ts
node --import tsx --test src/lib/search/find-records.test.ts src/lib/search/hybrid-retrieval.test.ts
node --import tsx --test src/lib/search/find-events-from-sources.test.ts
node --import tsx --test src/components/search/dossier/search-dossier-contract.test.ts
node "$GARISEK_OS_ROOT/tools/eval-engineering/cursor-eval.mjs" --root . --fast
```

SQL probes after apply:

```sql
-- enqueue fires exactly once
UPDATE <parent> SET notes = notes WHERE id = <id>;
SELECT count(*) FROM entity_search_outbox WHERE processed_at IS NULL;
-- reach and health
SELECT entity_type, count(*), count(embedding) FROM entity_search_docs GROUP BY 1;
-- queue is not silently dying
SELECT count(*) FROM entity_search_outbox WHERE attempts >= 5 AND last_error IS NOT NULL;
```

---

## 4. Part C — Progressive disclosure: mount, don't build

The requested IA — a simple mobile core, four tabs, deep data behind disclosure — **is the shipped FIND column.**
It is not missing; it is named differently and it is on the right side of the argument about where it lives.

| Requested | Shipped equivalent | Citation |
|---|---|---|
| Mobile-first simple core | `/m/search`, Class **B** SoT column; desktop consumes the same module | FIND plan Phase 4 |
| Progressive disclosure | Outline chips filter the stream; nested carrier hops; evidence opens in the existing viewer | Phase 2–3 |
| **Overview** tab | Outline with no kind selected = full stream + qty/facts ledger | `filterEventsByKind(events, null)` |
| **Timeline** tab | The chronology *is* the document — not a tab beside it | Locked verdict §0 |
| **Notes** tab | `note` kind — **declared, never produced** | gap, below |
| **More detailed info** | `bind` + facts/qty ledger — thin; deep specs unsourced | gap, below |

Two corrections to the brief, both load-bearing:

1. **The four tabs cannot be a left-hand nav that routes.** Desktop paints the outline as a narrow left column,
   but it *filters one stream*; it never navigates. Tab-routing by entity type is the explicitly named contrast
   class the FIND research refused (WMS tab-routing), and a second navigation IA re-forks the chrome that Phase 1
   spent a session unforking.
2. **Do not add a "three dots" menu to result rows.** Search rows have zero `⋮` by design — click-to-select is
   the whole interaction. Disclosure belongs in the dossier, not on the row.

### C1. Give `note` a producer

Sources exist and are org-scoped; none is wired.

| Source | Anchor | Note |
|---|---|---|
| `order_notes` | `order_id` | internal ops annotations, append-only |
| `thread_messages` via `entity_threads` | 7 entity types incl. `SERIAL_UNIT`, `ORDER`, `RECEIVING`, `WARRANTY_CLAIM` | already merged by `journey.ts:512-555` for work surfaces — reuse the **data**, not the chrome |
| `entity_signals.notes` | polymorphic, GIN `notes_tsv` | the "why" spine: `return_reason`, `test_fail_reason`, `triage_outcome`, `buyer_note` |

Add `findEventsFromNotes(...)` beside the existing emitters, emitting `kind: 'note'` with author + stamp.
Per §1.1 of the FIND plan a note is **inline text in the stream** — never a composer. FIND stays handoff-only.

### C2. Give `exception` a producer

`entity_signals` (severity, `reason_code`) and `receiving_exceptions` / `orders_exceptions` already carry the
blocking facts. Face is a high-contrast block with resolution state; click is **handoff**, never inline resolve.

### C3. Decide `status` honestly

`status` is a declared kind, but the status **pin** is already the hero band. Either emit status-transition
events into the stream, or **remove `status` from `FIND_EVENT_KINDS`.** A kind that can never render is a
lie in the outline catalog and in the contract test. Prefer removal unless transitions earn a row.

### C4. Deep specs for "More detailed information"

Once A2 lands, the same rows feed the dossier facts: `sku_platform_ids` (channel crosswalk), `sku_kit_parts`
(BOM + insert docs), `product_manuals`, `gtin`/`upc`/`ean`, `custom_field_values`. Read-only facts in the
outline ledger. Any *edit* is a handoff to the owning desk, and on a desk it is `DeskStageOverlay` — Center
Lock Q5, never a dialog or a right-rail detail plane.

---

## 5. Phase checklist

Reach and freshness first — a ranked list of rows that do not exist is not a ranking problem.

### Phase A — Notes on the stream (display, no migration) — ✅ SHIPPED
- [x] `findEventsFromThreadMessages` → `kind: 'note'`, wired into `presentOrderFindEvents`.
      Zero new fetch: `OrderTimelinePayload.threadMessages` was already on the wire and discarded.
      Visibility is the noun (`internal` → Note, `public` → Reply), mirroring `threadMessagesToTimeline`
      so FIND and the workplace timeline never disagree about what a row is called.
- [x] Resolved C3: `status` **deleted** from `FIND_EVENT_KINDS` + `FIND_OUTLINE_LABEL`.
- [x] Tests: 4 new cases — noun split, whitespace flattening, author omitted when unknown, 140-char
      preview truncation, blank/undated rows dropped, and kind omitted when the order has no notes.
- [ ] **Still open:** `order_notes` and `entity_signals` on the stream (neither is in any dossier payload —
      needs route work, not an adapter); `findEventsFromExceptions` from `entity_signals`; unit/carton
      note coverage (`SerialUnitDetailPayload` and `CartonInspectorEvent` carry no threads).

### Phase B — Freshness triggers (§A3) — ✅ SHIPPED (`2026-09-11a`)
- [x] STN org resolved through parents, not the nullable column (see §A3, corrected).
- [x] Triggers on `tech_serial_numbers`, `shipment_links`, `order_unit_allocations`, `shipping_tracking_numbers`.
- [x] Backfill narrowed to docs that actually have join rows — the sweep does not re-embed the whole index.
- [x] **Verified live on `lane/prod`** (each probe in a rolled-back transaction): tsn→ORDER 1,
      order_notes→ORDER 1, sku_platform_ids→SKU 1, oua→ORDER+SERIAL_UNIT 2, stn→ORDER 1,
      and the anti-churn guard — a no-op re-SET of an unchanged value enqueues **0**.

### Phase C — Doc enrichment (§A2) — ✅ SHIPPED (`2026-09-11b`)
- [x] SKU: `sku_platform_ids` (platform_sku / platform_item_id / account) + `sku_kit_parts` via LATERALs.
- [x] ORDER: the `order_notes` TABLE (5 newest, ≤600 chars) — previously only `orders.notes` was indexed.
- [x] ORDER: **allocated serials** (`order_unit_allocations` → `serial_units`, RELEASED excluded). Found
      while auditing trigger gap #2: doc serials came only from the LEGACY `tech_serial_numbers` ledger,
      so a unit bound the modern way was on the order in the database and unfindable by typing its serial.
      This is also what makes the `order_unit_allocations` triggers earn their re-embed cost.
- [x] SERIAL_UNIT: `handling_units.code` (tote).
- [x] `MAX_SEARCH_TEXT` kept at 2000 — bounded at SOURCE with `LEFT()` per aggregate instead, and every
      builder now orders short high-selectivity identifiers ahead of unbounded prose. Live max length is
      1250 (RECEIVING); **0 docs at the cap**, so raising it would buy nothing today.
- [x] **Verified live:** worker drained 25/25 then 1/1, `failed: 0` — the enriched SQL (new LATERALs +
      widened GROUP BY) executes against Postgres. Docs now carrying each new source: order_notes trail 6,
      SKU platform id 2, allocated serial 1.
- [ ] **Not proven:** the tote path — `0` units in the lane branch have a `handling_unit_id`, so there is
      no live row to demonstrate it. Covered by unit test only; do not claim it works on real data.
- [ ] **Not done:** `custom_field_values` and thread bodies in the index (dropped from this wave).

### Phase D — New entity types (§A1) — ✅ SHIPPED (`2026-09-12a`, `2026-09-12b`)
- [x] `WARRANTY_CLAIM` and `SUPPORT_TICKET`: CHECK on BOTH tables, builder, loader SQL,
      INSERT/UPDATE/DELETE triggers with `UPDATE OF` mirrored to the builders, `search-hit` DB↔UI
      vocabulary + href, backfill re-enqueue. Applied to `lane/prod`.
- [x] **Verified live:** both CHECK constraints now carry the two values; 2 triggers each on
      `warranty_claims` and `support_tickets`; 358 tickets enqueued and drained `failed: 0`. A ticket doc
      indexes BOTH spellings an operator types — `#9293` and bare `9293` — because the keyword arm is a
      literal trigram match and a bare id is an n-gram the `#` form does not contain.
- [x] Widening `SearchHitEntityType` forced exhaustive-`Record` updates in `search-refine.ts`,
      `interop/search-identifiers.ts`, `interop/gs1-keys.ts` and `global-entity-search.ts`. `claim` and
      `ticket` got their OWN `InternalEntityKind`s rather than being folded onto `order`, which would have
      made `urn:cycleforge:order:<claimId>` assert something false about the id it carries.
- [ ] **Warranty path unproven on data:** all 5 `warranty_claims` rows in this lane are soft-deleted, and
      the backfill correctly filters `deleted_at IS NULL` — so 0 docs exist. The guard is right; there is
      simply no live claim to demonstrate. Do not claim it works on real data.
- [x] **`LOCATION` shipped (`2026-09-12b`, authored — parent applies):** `locations` is the ninth
      discriminator. CHECK widened on BOTH `entity_search_docs` and `entity_search_outbox` (all eight live
      values preserved), `buildLocationDoc` + `LOADER_SQL.LOCATION`, INSERT/UPDATE/DELETE triggers with
      `UPDATE OF` mirrored to the builder, backfill by re-enqueue only. The BARCODE leads the canonical
      text — it is what is printed, scanned and typed. A retired bin is NOT filtered out (the opposite call
      from `warranty_claims.deleted_at`): a deactivated shelf still wears its label, so it stays indexed and
      reads back as `INACTIVE` / `LOCKED FOR COUNT` instead of silently vanishing.
- [x] **`ITEM` will never exist — decided, not deferred.** `items.id` is a `uuid`;
      `entity_search_docs.entity_id` is `BIGINT` *by law* ("so no future widening",
      `2026-07-03d_entity_search_docs.sql:12-13`). An ITEM type would require widening `entity_id` for all
      nine types and re-cutting the natural unique index, or bolting a surrogate integer key onto the
      provider mirror. Neither is authorised and neither is needed: an `items` row is the inventory
      PROVIDER's copy of a catalog row, so its identifiers (Zoho item number, item name, UPC, EAN, provider
      SKU) now fold into the **existing SKU doc** over the one legal join,
      `sku_catalog.provider_item_id = items.zoho_item_id` (`2026-07-22_sku_catalog_provider_item_id.sql:23-27`).
      The doc stays keyed to the integer `sku_catalog.id`. **Never joined on the SKU string** — `items.sku`
      and `sku_catalog.sku` are independent numbering schemes that collide on the same values
      (`2026-07-22:5-9`), which is also why `item_sku` is indexed as its OWN token rather than assumed equal
      to `sku`. The SQL half is one column (`provider_item_id`) added to the `sku_catalog` UPDATE trigger so
      first-linking a catalog row refreshes its doc, plus a re-enqueue of only the rows that actually gained
      content (`provider_item_id IS NOT NULL` AND the item exists).
- [ ] **Named gaps carried by `2026-09-12b`, not silently skipped:** `bin_contents` is not triggered (its
      parent key is `location_id`, so the generic `NEW.id` dispatch cannot serve it, and it is the churniest
      table in the building — every pick and putaway writes it); `items` is not triggered (same `customers`
      posture the ORDER/WARRANTY docs already carry, and the Zoho poller rewrites `items` on every sweep).
      Both refresh on the next parent write or a re-enqueue sweep.
- [ ] **Bin-contents path unproven on data:** `bin_contents` has **0 rows** in this lane, so the
      contents-of-a-bin tail of `search_text` is correct by construction only. Do not claim it works on real
      data. The barcode/name/room path is covered by unit test.
- [ ] **No id-keyed bin record surface exists:** every bin surface in the app takes a BARCODE
      (`/api/locations/[barcode]`, `?bin=`, `/l/[ref]`), while `searchHitHref` carries an id — so a LOCATION
      hit lands on the Bins list (`/inventory/locations?tab=bins`) rather than a fabricated `?loc=<id>` no
      parser reads. `searchScopeHref` IS a real applied filter (`&q=`, read by `BinsFilterBar`).
      Closing this needs an id-resolving bin route, which is a UI wave, not an index one.
- [ ] Ticket docs are thin here because `support_tickets.subject_cache` is empty in this lane; title falls
      back to `Ticket #<id>`. Data, not code.

### Phase E — Semantic arm — ⛔ BLOCKED (not a code task)
- [ ] Configure an embedding provider for the org; confirm `resolveOrgAiConfig(org,'embed')` non-null
- [ ] `enqueueOrgReembed(orgId)`; watch `count(embedding)` climb
- [ ] Confirm `search_query_log.used_semantic` goes non-FALSE
- **Done when:** a paraphrase that trigram misses returns the right record.
- **Blocker:** needs a provider credential, which an agent must not fabricate. Every drain in this lane
  reports `embedded: 0`, and the index census confirms it — 11,855 docs, **0 embeddings**, across every
  indexed type (eight at census time; `LOCATION` makes nine). The worker, the HNSW index, the 300 ms budget,
  the retry sweep and `enqueueOrgReembed` all already
  exist and degrade correctly; nothing is missing but the key.

---

## 6. Out of scope

- FIND chrome, outline IA, recents, Displays leaves — settled by the FIND plan
- Slot-table cohort, overlay z-index (do not pick up their chrome)
- RAG `rag_document_chunks` (1536-dim, separate space — never merge with the 768-dim entity index)
- Live marketplace proxies (eBay / Ecwid) — external calls, not index rows
- Writing from FIND
