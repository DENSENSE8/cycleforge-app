# Deep Research Briefing — Making an indexed 41k-node code graph *viewable*, binding records to physical locations, uniform CRUD, photos-on-record-id, and site-wide keyboard navigation

**Prepared for:** Gemini Pro / Deep Research
**From:** Cycle Forge engineering
**Domain:** Multi-tenant warehouse & reseller-operations SaaS (Next.js App Router + Postgres), plus the local agent tooling that indexes it
**Date:** 2026-08-18
**Status:** Research request — architecture not yet decided

---

## 0. How to use this briefing

This is a request for a **researched architectural recommendation**, not a summary. Sections 1–6 are the
real system as it exists on disk today: what is built, with exact paths, real counts, and the gaps found by
probing it. Section 7 is the research question, decomposed into five threads. Section 8 defines what a good
answer looks like.

Prioritise **published standards, reference architectures, and documented implementations** over general
advice. Where you recommend a pattern, name the systems that use it and state its failure modes. Where
practice is genuinely contested, present the divergence rather than a synthesis.

Every claim below about the codebase is grounded in a file path you can treat as authoritative. Where a fact
could **not** be verified live, it is marked **[UNVERIFIED]** and why.

---

## 1. The operator's ask, in their words

> "I must be able to query and view the graphs themselves … how exactly would I be able to do this with this
> comprehensive system already made and indexed through. I must be able to attach exact deliverables to
> certain pages — this page must be able to attach data to a physical location. Full CRUD for all data,
> photos that are attached to a record id, and exact full keybind navigation for the website."

That is five distinct threads against one product:

1. **Graph visibility** — the code graph exists and is queryable by agents, but no human can *see* it.
2. **Physical binding** — a page/record must be attachable to a real place in the warehouse.
3. **Full CRUD** — uniform create/read/update/delete across every entity, not the current per-route drift.
4. **Photos on a record id** — already largely built; the vocabulary has drifted from the DB constraint.
5. **Keyboard navigation everywhere** — a wedge-safe leader keyboard exists on ~6 surfaces out of 147 pages.

---

## 2. The product and its scale (measured 2026-08-18)

**Cycle Forge** is multi-tenant SaaS for reseller operations: bulk-buy used consumer electronics, receive,
test, grade, list on multiple channels, then pick/pack/ship individual orders. Inventory is **serialised and
non-fungible** — which specific physical unit went into which order must be provable months later.
Operators work barcode-wedge scanners and label printers, hands busy, at speed.

Measured size of the app repo (`/home/michaelgarisek/Projects/cycleforge-app`):

| Measure | Count |
|---|---|
| API route files (`src/app/api/**/route.ts`) | 936 |
| Route files exporting a mutation verb (POST/PATCH/PUT/DELETE) | 593 |
| …of those referencing `recordAudit` | 218 (~37%) |
| Route files exporting `GET` | 510 |
| Pages (`src/app/**/page.tsx`) | 147 |
| `.tsx` files under `src/` | 1,837 |

Tenancy posture: every org-scoped write is expected to run inside `withTenantConnection` /
`withTenantTransaction` (`src/lib/tenancy/db.ts`), which opens a transaction and sets the
`app.current_org` GUC with `SET LOCAL` so a pooled client can never leak a stale org into the next
checkout. RLS binds against that GUC; **FORCE enforcement is still being rolled out per table**, and only
bites under the non-BYPASSRLS `app_tenant` role.

---

## 3. Thread 1 — The code graph: fully built, fully queryable, completely invisible

### 3.1 What exists

A tree-sitter → Postgres/pgvector code graph, built and served from a **separate** repo:
`/home/michaelgarisek/Projects/Garisek-OS/tools/code-graph/`.

| Piece | File |
|---|---|
| Schema (ported from `nemoclaw-fork/scripts/015_graphify_schema.sql`) | `Garisek-OS/scripts/051_code_graph.sql` |
| Indexer CLI | `tools/code-graph/index-cli.mjs` |
| Parser / indexer | `tools/code-graph/parser.mjs`, `indexer.mjs` |
| Query layer (all SQL) | `tools/code-graph/db.mjs` |
| MCP server (stdio, 7 tools) | `tools/code-graph/mcp-server.mjs` |
| Launcher (resolves node outside a login shell) | `tools/code-graph/run-mcp.sh` |
| Embeddings (Ollama, `snowflake-arctic-embed:m`, 768-dim) | `tools/code-graph/embeddings.mjs` |

Schema shape (`051_code_graph.sql`):

```
graphify_projects (id, name, codebase_path UNIQUE, last_built_at, node_count, edge_count, file_count, status)
graphify_builds   (project_id, started_at, completed_at, status, files_processed, files_skipped, cache_hit_rate)
graphify_queries  (project_id, tool_name, query_text, result_node_count, response_time_ms, queried_at)
graphify_files    (project_id, path, language, sha256, loc)              -- sha256 drives incremental rebuild
graphify_nodes    (project_id, node_key UNIQUE per project, kind, name, file_path,
                   start_line, end_line, signature, doc, exported, embedding vector(768))
graphify_edges    (project_id, src_key, dst_key, kind, file_path, line, resolved)
```

- `kind ∈ file | function | class | interface | type | component | method | variable`
- edge `kind ∈ contains | imports | calls | extends | implements | renders`
- `node_key` is **file-scoped** (`component:src/design-system/primitives/Button.tsx:Button`), deliberately —
  the predecessor builder deduped on bare symbol names and collapsed every same-named symbol in the repo
  into one node.
- Indexes: btree on `(project_id, kind)` and `(project_id, file_path)`, **GIN trigram** on `name`, btree on
  edges by `src_key` and by `dst_key` (traversal walks both directions), and an **HNSW cosine** index on
  `embedding`.

### 3.2 Live measured state of the index

Rebuilt **2026-08-19T02:36:50Z** (incremental: 42 files reparsed, 6,658 unchanged, structure in 25.7s;
embed pass 320 nodes in 33.4s). `graph_stats` for project `cycleforge-app`, status `ready`:

| Totals | |
|---|---|
| files | 6,700 |
| nodes | 41,105 |
| edges | 203,758 |
| nodes carrying an embedding | 41,105 (**100%**) |

Nodes by kind: function 19,093 · file 6,700 · variable 5,565 · interface 4,180 · component 2,781 ·
type 2,378 · method 293 · class 115.
Edges by kind: calls 129,833 · contains 34,405 · imports 30,767 · renders 8,668 · extends 75 · implements 10.

> **Prior readings, for the drift argument in §3.4.** The 2026-08-17T07:14 build measured
> 6,622 files / 35,553 nodes / 173,138 edges / **14,895 embedded (42%)**; a 15:04 build the same day
> measured 6,720 / 41,200 / 204,476. Semantic coverage reached 100% only at the 08-19 build, when the
> embed pass finally ran to completion against a reachable database.

### 3.3 The query surface that exists (MCP tools, `mcp-server.mjs`)

| Tool | What it answers | Backing SQL (`db.mjs`) |
|---|---|---|
| `list_projects` | indexed codebases + counts + last build | `SELECT * FROM graphify_projects` |
| `graph_stats` | totals, nodes-by-kind, edges-by-kind, embedded count | `projectStats` |
| `find_symbol` | name / partial name → `node_key` | trigram `similarity(name, $2)`, exact match first |
| `search_code` | natural-language intent → symbols | pgvector `embedding <=> $2::vector`, HNSW cosine |
| `get_call_graph` | callers (up) or callees (down), depth 1–6, edge-kind filter | recursive CTE with a path-array cycle guard |
| `impact_analysis` | blast radius: every file transitively reaching a symbol, grouped by file, ordered by proximity | recursive CTE walking `dst_key → src_key` over calls/renders/imports/extends/implements |
| `find_path` | how two symbols connect | **BFS in JS, one level at a time, with a global visited set** — a recursive CTE enumerates every *path* rather than every *node* and, at this graph's fan-out, never returns |

### 3.4 A worked query, and what it proves

Target: the design-system `Button` — `component:src/design-system/primitives/Button.tsx:Button`
(`src/design-system/primitives/Button.tsx:94`, a `forwardRef` primitive).

`impact_analysis(depth=2)` → **684 files affected, 788 symbols** (451 at depth 1, 233 at depth 2).
Hottest prefixes: `src/components/receiving` (93) · `admin` (50) · `sidebar` (37) · `mobile` (37) ·
`support` (30) · `fba` (24) · `shipped` (24). Highest fan-out single files: `UnfoundMatchStrip.tsx` (8
symbols), `BoseModelsManagementTab.tsx` (6), `CartonInspectionPage.tsx` (5).

`get_call_graph(direction=callers, depth=2, kinds=[calls,renders])` on the same node → **1,090 nodes** — a
different cut, not a superset relationship with the 684-file impact set.

Two things this exposes, and both belong in the answer:

1. **The same query has now returned three different answers.** 670 files / 757 symbols, then
   684 / 788 forty minutes later, then **676 / 778** against the 2026-08-19 rebuild. The index tracks a
   live working tree, so a graph answer is a **reading at an instant**, not a stable fact — and the drift
   is not monotonic, so "newer is bigger" is not a safe reading either. Nothing in the current surface
   timestamps or versions an answer, so two people running the same query on the same day can legitimately
   disagree and neither can prove which reading they saw.
2. **The payload does not fit a conversation.** The `impact_analysis` responses measured **145 KB** and,
   on the current index, **133 KB**; the callers dump was **344 KB**. All had to be spilled to files on
   disk before they could be read. A 41k-node graph does not have a text-shaped answer.

### 3.5 The gap — there is no viewer

- **No UI exists.** `grep -rl "graphify\|code-graph\|CodeGraph" src` inside the app returns **zero files**.
  The graph is reachable only by an agent holding an MCP client. The operator asking to "view the graphs"
  currently cannot, by any path. **This is the only one of the five threads with no implementation at all.**

**Two blockers found alongside it have since been cleared, and both inform the design:**

- **The MCP registration was broken by a stale path — FIXED 2026-08-19.** `cycleforge-app/.mcp.json`
  registered `command: /home/avion/Garisek-OS/tools/code-graph/run-mcp.sh`, a root that no longer exists
  after the tree moved to `/home/michaelgarisek/Projects/`; `graphify_projects.codebase_path` recorded the
  same dead root. Both are now repointed, and the server was verified over stdio (`initialize` +
  `tools/list` return all seven tools). Note the repoint had to precede the rebuild: `upsertProject`
  conflicts on `codebase_path`, so indexing at the new path against the old row would have **inserted a
  second project** rather than updating the first — duplicating the graph and orphaning its embeddings.
  The path is still a literal absolute string in two places, which is the fragility §7.2 asks about.

- **The database was at its connection ceiling — CLEARED 2026-08-19, cause identified.** `jarvis-db-1`
  (Postgres/pgvector on `127.0.0.1:5433`) runs `max_connections = 100`. It was refusing every connection,
  **including the superuser-reserved slots**. The cause was not the graph tooling: a single container,
  `realtime-dev.supabase-realtime`, held **496 established connections** in a reconnect storm, forking
  backends faster than they exited. Restarting it took backends 496 → 9. Three orphaned `mcp-server.mjs`
  processes (10h+ old, `pg.Pool({max: 6})` each) were also cleared.

  **The ceiling itself is unchanged and remains a hard design constraint.** One misbehaving client can
  still deny the whole database, the pool is still per-spawned-process, and a viewer that fans out
  expansion requests would add exactly this kind of load. The incident is the argument for §7.2's
  connection-architecture question, not a reason to consider it closed.

**Resolved:** the connection breakdown was obtained by reading `/proc/net/tcp` inside the container and
mapping peer IPs to containers, since `pg_stat_activity` was itself unreachable. That technique is worth
keeping — a saturated Postgres cannot be diagnosed through Postgres.

---

## 4. Thread 2 — Attaching a record to a physical location

### 4.1 What exists

`locations` (`src/lib/migrations/2026-04-09_create_locations.sql`, extended repeatedly since) is the
warehouse place registry: `name UNIQUE`, `zone`/`room`, `description`, `barcode UNIQUE` (scannable),
`is_active`, `sort_order`, plus later `parent_id`, `row_label`, `col_label`, `zone_letter`, `warehouse_id`,
`bin_role`, and — from `2026-08-09_locations_location_kind.sql` — a typed hierarchy:

```
location_kind ∈ ROOM | DESK | RACK | SHELF | POSITION | BIN | STAGING | OTHER
```

with real seeded benches (`PACK-ROOM`, `PACK-DESK-01..03`, `PACK-STAGING`). The design ruling is explicit
in that migration: *packing stations are physical DESK rows under a Packing ROOM on the existing locations
map — not a parallel `packing_stations` registry.*

Three different bindings to a place already exist, at three different grains:

| Binding | Table | Grain | Integrity |
|---|---|---|---|
| SKU quantity in a bin | `bin_contents (location_id FK, sku, qty, min_qty, max_qty, last_counted)` | **fungible SKU × bin**, `UNIQUE (location_id, sku)` | real FK to `locations` |
| Loose unit staged at a bench | `unit_pack_placements (unit_id FK → serial_units, location_id FK, placed_at, placed_by_staff_id, source)` + `unit_pack_placement_events` ledger | **one serial unit → one bench**, `UNIQUE (organization_id, unit_id)` | real FKs both sides, `ON DELETE CASCADE`, tenant-scoped from birth |
| Order staged at a bench | `order_pack_placements` (sibling, 2026-08-09b) | order → bench | sibling design |
| Stock putaway of a unit | **`serial_units.current_location TEXT`** | **a free-text string** | **no FK, no constraint** |
| Historic moves | `location_transfers (entity_type 'SKU_STOCK'\|'SKU_RECORD', entity_id, sku, from_location TEXT, to_location TEXT, staff_id, notes)` | **text-named places**, polymorphic entity | no FK either side |

### 4.2 The gap

The system has **two good location bindings and two bad ones, and the bad ones are the oldest and most
load-bearing**. `serial_units.current_location` is a `TEXT` column — the canonical putaway location of a
serialised unit is a string that cannot be joined, renamed safely, or constrained. `location_transfers`
records `from_location`/`to_location` as text as well, so the movement history of stock does not reference
the location registry it describes.

Meanwhile `unit_pack_placements` (three weeks old) does it correctly: FK to `locations`, unique current-state
row, and a separate append-only `*_events` ledger for history. **Two patterns for the same idea now coexist
in one schema.**

Separately, and directly on the operator's phrasing — *"this page must be able to attach data to a physical
location"* — there is **no generic attach mechanism at all**. Every binding above is a bespoke table for one
entity type. There is no way for an arbitrary record or page to declare "I live here", and no
`LOCATION` entity type in the photo hub (§5), so a place cannot even carry a photo of itself.

---

## 5. Thread 3+4 — CRUD and photos-on-record-id

### 5.1 The photo platform (this thread is the most complete)

`photo_entity_links` (`src/lib/migrations/2026-06-18_photos_platform_side_tables.sql`) is a normalised
polymorphic hub — exactly the "photos attached to a record id" primitive the operator is asking for:

```sql
photo_entity_links (
  photo_id BIGINT REFERENCES photos(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL,
  entity_type TEXT NOT NULL,     -- CHECK-constrained vocabulary
  entity_id   BIGINT NOT NULL,
  link_role   TEXT NOT NULL DEFAULT 'primary',   -- primary | claim_evidence | insurance_share
  UNIQUE (photo_id, entity_type, entity_id, link_role)
)
```

Around it: `photo_storage` (1..N locators per photo — gcs / vercel_blob / nas / legacy_url / s3 / r2 /
google_drive, with `sha256_hex`, one-primary partial unique index), `photo_storage_providers` (per-org
default), `photo_analysis` (1:1 enrichment, GIN on metadata), `photo_jobs` (analyze / nas_mirror /
export_drive), and `photo_share_packs` + items (tokenised external sharing with expiry and password hash).

Parent-delete integrity is a **trigger family**: `fn_delete_photos_on_parent_delete` dispatched per entity
type (`TG_ARGV[0]`), e.g. `trg_delete_photos_on_staff_delete`, `trg_delete_photos_on_order_delete`.

Capture provenance is modelled carefully and is worth preserving in any redesign: `photos.created_at` is the
**server-attested insert instant**; `photos.client_captured_at` is the **device-reported shutter instant**,
explicitly *beside* it and never instead of it. `src/lib/photos/queries/list-for-entity.ts` types
`client_captured_at` as a **required key with a nullable value**, deliberately, so a `SELECT` that forgets
the column is a type error rather than a silently-null field in the viewer — the exact way this provenance
was write-only on first landing.

### 5.2 The gap — the vocabulary has forked in three directions

| Source | Entity-type vocabulary |
|---|---|
| `2026-06-18` migration (original CHECK) | RECEIVING, RECEIVING_LINE, PACKER_LOG, SERIAL_UNIT, SKU, SKU_STOCK, BIN_ADJUSTMENT, SHARE_PACK, ZENDESK_TICKET |
| `2026-07-28_photo_entity_links_order_type.sql` | …**+ ORDER** (drop-then-add, plus an `orders` delete trigger) |
| `2026-08-01e_staff_avatar_photo.sql` | drop-then-add listing …**+ STAFF, and NOT ORDER** |
| `src/lib/photos/types.ts` (`PHOTO_ENTITY_TYPES`) | …**+ STAFF, no ORDER** |

Because each migration **drops and re-adds** the constraint with a full literal list, the 08-01e migration
appears to have silently removed `ORDER` from the accepted vocabulary three days after it was added — while
`trg_delete_photos_on_order_delete` remains installed. The TypeScript constant and the DB constraint are two
independent hand-maintained lists of the same vocabulary, with no guard tying them together.

**[UNVERIFIED]** The constraint definition *actually installed in the live database* — the DB was refusing
connections (§3.5), so `pg_get_constraintdef` could not be read. The divergence above is read from the
migration files as committed.

Also absent: **`LOCATION`** as an entity type. A physical place cannot carry a photo, which is the direct
intersection of threads 2 and 4.

### 5.3 CRUD

There is no CRUD framework; there are 936 hand-written route files. The drift is visible in a single file —
`src/app/api/locations/route.ts`:

- it imports `pool` directly from `@/lib/db` rather than going through `withTenantConnection`;
- it resolves the actor itself via a local `resolveCtx` helper reading the session cookie;
- and its `GET` documents the fallback in a comment: *"Anonymous callers (no session) get the legacy
  un-scoped behavior — orgId stays undefined."* — i.e. a caller with no session reads **across tenants**.

Against 593 mutation-bearing route files, only 218 reference `recordAudit`. `DELETE` is exported by 104 route
files; `src/app/api/photos/[id]/route.ts` exports **only** `DELETE` — read and update for a photo live
elsewhere, so even one entity's CRUD is scattered across surfaces rather than presented as one contract.

---

## 6. Thread 5 — Keyboard navigation

### 6.1 What exists, and it is good

`src/lib/keyboard/nav-keys/` implements a **leader-armed, per-region, single-letter** navigation keyboard,
specified in `docs/todo/nav-keys-selection-keyboard-HANDOFF.md` (12 locked decisions, P0–P4 all marked
shipped).

Grammar: `⌘;` (or `Ctrl+;`) → region key → target letter → *(row armed → its secondary actions get letters)*.

Regions (`nav-regions.ts`) are exactly three, mapping the 3-column work frame:
`l` Left rail · `m` Middle (scan + work) · `r` Right (Displays / inspector). Letters are unique **within**
a region only — `p` in Left ≠ `p` in Right. Spine (MasterNav) and GlobalHeader are deliberately **not**
regions; they own `⌘1-9` pins and the page switcher.

The wedge-safety design in `nav-leader-store.ts` is the load-bearing part, and any answer must not break it:

- the leader is a **modifier chord**, so a barcode wedge (which emits no modifiers) can never arm it;
- it is an 8th single owner, not colliding with the seven existing ones (⌘K · ⌘B · ⌘] · ⌘\ · ⌘⇧V · ⌘1-9 · Escape);
- one global `keydown` listener, **capture phase**, `preventDefault` + `stopPropagation` on mapped keys so a
  letter can never fall through into a focused input;
- refuses to arm while a text input holds focus; **1500 ms** idle timeout; pointerdown / blur / tab-hide /
  Escape cancel; a **30 ms** inter-key **scan-burst detector** (faster than human ⇒ it's a wedge ⇒ drop nav);
- an unmapped key exits nav mode **without swallowing** the keystroke;
- while armed it `pushOverlay()`s the overlay-stack so ambient scan/record keyboards stand down;
- **never binds bare digits** — digits stay for pins, quantities, and scans. Nav keys are letters only.

Keymap resolution (`resolveNavKeymap.ts`) is pure and DB-free: each target declares an identity-stable
`navKey` next to its label; live resolution uses it if free in the visible set, else walks a deterministic
fallback ladder. Two build-time guards enforce the law: `nav-key-uniqueness.guard.test.ts` (per-region
declared-key uniqueness across the region's **full possible** target set) and `nav-leader-owner.guard.test.ts`
(single binder, not one of the seven, no bare digits). Hints are **reveal-on-arm only** — a transient
overlay, never a permanent per-row chip, to protect list density.

There is also a `?` cheat sheet (`KeyboardShortcutsCheatSheet.tsx`) built from the same registries the
handlers read — so it cannot drift — which disables itself on `/photos` because the photo library already
owns `?`.

### 6.2 The gap — it is a waist with six consumers

`useNavRegion` / `useNavMode` are consumed outside `src/lib/keyboard` by exactly these surfaces:

```
src/components/station/displays/StationDisplayIndexList.tsx
src/components/station/displays/StationArmedVerbList.tsx
src/components/photos/photo-inspector/PhotoBatchInspectorPanel.tsx
src/components/receiving/unbox/UnboxWorkspaceHeader.tsx
src/components/receiving/workspace/line-edit/PhotosActionsArmedList.tsx
src/components/receiving/workspace/line-edit/useUnboxMiddleCartonNav.tsx
src/components/sidebar/SidebarRailShell.tsx
```

Seven files, against **147 pages**. The handoff's own rollout rule is "port one region per change", and the
ported surfaces are Displays, the sidebar rail, Unbox middle, and the photo inspector. The operator's ask —
*"exact full keybind navigation for the website"* — is the generalisation of a proven mechanism from ~5% of
the surface area to all of it, and the three-region model is currently tied to a specific 3-column work
frame that most of those 147 pages do not have.

---

## 7. The research question

> **Core question.** Given a system that already has (a) a complete, incrementally-rebuilt 41k-node /
> 204k-edge code graph with vector embeddings, reachable only by agents over MCP; (b) a warehouse location
> registry with a typed hierarchy and two competing binding patterns; (c) a normalised polymorphic photo hub
> with a forked type vocabulary; (d) 936 hand-written API routes with ~37% audit coverage; and (e) a proven,
> wedge-safe leader-keyboard on 7 of ~1,800 component files — **what is the correct architecture to make all
> five legible and operable by a human, and in what order should they be built?**

### 7.1 Rendering a 41k-node / 204k-edge graph a human can actually use

- **What is the state of the art for code-graph visualisation at this scale?** Assess what
  **Sourcegraph** (and SCIP/LSIF), **GitHub code navigation**, **Sourcetrail** (archived — say why it
  died and what that implies), **CodeSee**, **Moose/Glamorous Toolkit**, **CodeScene**, and
  **Understand (SciTools)** actually render, and at what node counts they stop being useful.
- **Never draw the whole graph.** What are the established alternatives — seeded neighbourhood expansion,
  hierarchical edge bundling, dependency **matrix** (DSM) views, treemap-of-packages with edge overlay,
  layered Sugiyama for call chains? Which of these survive a 684-file impact set, which is the *typical*
  answer here, not the worst case?
- **Which rendering stack** for a Next.js app: server-rendered SVG, `d3-force` in a worker, Cytoscape.js,
  Sigma.js/graphology (WebGL), regl/deck.gl, or a Graphviz/`dot` WASM pipeline? Give the honest node-count
  ceiling for each in a browser tab, and the interaction cost (hover, select, expand) at that ceiling.
- **Where should the compute live?** The traversals are already recursive CTEs in Postgres (§3.3) and
  `find_path` had to be moved *out* of SQL into JS BFS because a recursive CTE enumerates paths, not nodes.
  Does that argue for a graph database (Neo4j / Memgraph / Apache AGE as a Postgres extension), or is the
  pragmatic answer to keep Postgres and push layout to the client? What does adopting AGE actually cost when
  the same DB already holds pgvector embeddings and the traversal indexes?
- **The graph is a moving target** (§3.4: 670 → 684 for the same query 40 minutes apart). What is the
  reference pattern for **versioned/immutable graph snapshots** so a shared link renders what the sender
  saw? Content-addressed builds, a `build_id` foreign key on every node/edge row, or bitemporal
  (`valid_from`/`valid_to`) rows? Compare storage cost and query complexity for a repo rebuilt many times a
  day.
- **Semantic coverage is now 100%** (41,105 of 41,105 nodes embedded, as of the 08-19 rebuild) — but it sat
  at 42% for two days because the embed pass could not reach its database, and nothing surfaced that. What
  is the right policy — embed everything, embed only exported symbols, or embed lazily on first miss — and,
  more importantly, how should a UI **communicate** partial semantic coverage so a user never reads
  "no results" as "does not exist"? A viewer that silently searches a 42%-embedded index is worse than one
  that refuses to search.
- **The payload problem.** A single answer was 145 KB of JSON. What is the reference API shape for a graph
  explorer — cursor-paged neighbourhoods, a summarise-then-drill contract, or server-side aggregation to
  file/package grain with symbol detail on demand? What do the tools in the first bullet actually put on
  the wire?

### 7.2 Whether the graph explorer belongs *inside* the product

This is a genuine fork and we want a defended answer, not a hedge.

- Option A: a **route inside cycleforge-app** (e.g. `/dev/graph`), reading the `garisek` database directly.
  Consequences: a second datasource in a multi-tenant app whose whole tenancy model is org-GUC + RLS, and a
  developer tool shipped in an operator's product.
- Option B: a **separate local tool** in `Garisek-OS` (its own small server + UI), sharing nothing with the
  product but the DB.
- Option C: **neither** — an MCP-served rendering, where the agent produces a self-contained artifact
  (SVG/HTML) per query and the human views that.

Argue one. Address specifically: authentication (the app's auth is org/staff-scoped and a code graph is not
org-scoped data), the RLS/GUC posture, deployment (this DB is a local Docker Postgres, not the app's Neon
instance), and who maintains the viewer.

- **Related:** what is the correct way to make the MCP registration robust against relocation? Both dead
  paths have been repointed by hand (§3.5), but the design is unchanged — an absolute path in `.mcp.json`
  and a second absolute path in `graphify_projects.codebase_path`, which drifted apart once already and
  silently disabled the whole integration. Is the answer repo-relative resolution inside `run-mcp.sh`, an
  env indirection, a `${workspaceFolder}`-style variable, or registry-lookup-by-name? **What do MCP client
  implementations actually support today** — specifically, does any client expand variables in the
  `command` field, or is `env` the only indirection available? A related trap: `embeddings.mjs` defaults to
  `OLLAMA_URL=http://127.0.0.1:11434` while the running Ollama binds `172.17.0.1:11434` (the Docker
  bridge), so the embed pass fails unless the caller happens to override it.
- **The connection ceiling is a design constraint, not a bug to file.** `max_connections = 100`, with
  `pg.Pool({max: 6})` **per spawned MCP process** and one process per client. It was fully saturated on
  2026-08-18 by a single unrelated container (§3.5) — cleared by restarting it, but nothing prevents a
  recurrence, and the graph tooling has no backpressure, no retry policy, and no way to distinguish
  "database is down" from "someone else took every slot". What is the
  correct architecture — PgBouncer in transaction-pooling mode (and what breaks: prepared statements,
  session GUCs, advisory locks?), a single long-lived graph service that every MCP client talks to over
  HTTP, or per-process pool caps of 1–2? A UI that fans out expansion requests makes this **worse**, so the
  answer must come before the viewer.

### 7.3 Attaching a record — and a page — to a physical location

- **Unify or federate?** The schema now holds a correct pattern (`unit_pack_placements`: FK + unique
  current-state + `*_events` ledger) and a legacy one (`serial_units.current_location TEXT`,
  `location_transfers` with text endpoints). Should there be **one** generic
  `entity_location_placements (entity_type, entity_id, location_id, …)` polymorphic table, or **N** typed
  sibling tables per entity, one per parent? Weigh referential integrity (a polymorphic table cannot have a
  real FK to its parent; the codebase's own `polymorphic-tables.md` already prefers a real FK where the
  parent is singular) against the combinatorial cost of N tables and N trigger families — the photo hub
  chose polymorphic-with-CHECK-and-trigger-dispatch and is now paying for it in vocabulary drift (§5.2).
- **What does WMS practice prescribe** for the location↔inventory binding — **SAP EWM** (storage bin, HU),
  **Oracle WMS Cloud** (LPN/location), **Manhattan**, **Blue Yonder**, **Odoo** (`stock.quant` as
  quantity-at-location), **Fishbowl**? Specifically: is "current location" a *column on the thing* or a
  *row in a placement ledger*, and where does each place the historical record?
- **Location identity over time.** Bins get renamed, racks get rebuilt, rooms get renumbered. `locations.name`
  and `locations.barcode` are both `UNIQUE`. What is standard practice for a stable internal location id vs a
  human/scannable label that changes, and how do historical placements stay true after a relabel?
- **The "page attaches data to a physical location" ask.** Interpret and design this. Is it (i) any record
  gaining a location field, (ii) a *page/route* being addressable from a scanned location barcode — scan
  `PACK-DESK-02`, land on that bench's page — or (iii) a place having its own record with photos, documents,
  and attached deliverables? Recommend a model. Note that scanning already exists as a first-class input
  (`locations.barcode`, wedge scanners everywhere) and that `LOCATION` is **not** in the photo entity
  vocabulary, so (iii) currently cannot even hold a photo.
- **Hierarchy queries.** `locations` is self-referencing (`parent_id`) with a typed
  `location_kind`. For "everything in this room, recursively" — recursive CTE, materialised path/`ltree`, or
  nested sets? At a warehouse's node count this is small, but the *answer* should say what breaks first
  when a second and third warehouse arrive (`warehouse_id` already exists).

### 7.4 Uniform CRUD across 936 routes

- **What is the reference pattern for retrofitting uniformity onto hand-written Next.js App Router
  handlers?** Compare: a generated CRUD layer (PostgREST, Hasura, Supabase's auto-API) beside the bespoke
  routes; a typed route factory (`createCrudRoute({table, schema, permissions, audit})`); tRPC or Server
  Actions replacing REST for internal surfaces; or a codemod that wraps existing handlers. Given 936 files,
  what is the *migration* strategy, not just the target?
- **Making the cross-cutting concerns unskippable.** Tenancy (`withTenantConnection`), permission
  (`requireRoutePerm`), audit (`recordAudit` — 218/593), and validation are today four things a route author
  must remember. What is the pattern that makes forgetting one **impossible** rather than merely
  discouraged — a wrapper that owns the request lifecycle, a lint/guard test that fails CI on an unwrapped
  export, or DB-level enforcement (RLS FORCE + audit triggers) that makes the app layer non-authoritative?
  What do teams who have done this at this scale report as the failure mode?
- **The `/api/locations` case specifically:** a `GET` that falls back to un-scoped, cross-tenant reads when
  no session is present, in a product whose whole isolation model is the org GUC. Is the correct move a
  hard-fail-on-missing-org policy, and what is the standard way to find every remaining instance — a guard
  test that greps for direct `pool` imports in `src/app/api`, a runtime assertion, or RLS FORCE on every
  table so the DB refuses?
- **DELETE semantics.** 104 route files export `DELETE`. `locations` has `is_active` (soft delete); photos
  cascade via `ON DELETE CASCADE` plus a trigger family. What is the defensible rule for *which* entities
  hard-delete vs soft-delete in a system whose records are commercial evidence (warranty claims, marketplace
  disputes), and how should soft-delete interact with the `UNIQUE` constraints already on `locations.name`
  and `locations.barcode`?

### 7.5 Site-wide keyboard navigation

- **Generalising three regions to 147 pages.** The `l`/`m`/`r` model maps a specific 3-column work frame.
  What is the right generalisation — a **region declared per layout** (so each page's shell names its own
  regions), a **DOM-landmark-derived** region set (`<nav>`/`<main>`/`<aside>`, i.e. ARIA landmarks as the
  region vocabulary), or a **route-config registry**? Which of these keeps the per-region uniqueness guard
  meaningful when the target set is dynamic?
- **What do the mature keyboard-first web UIs actually do?** Analyse **Vimium/Vimperator** (2-char hints —
  explicitly rejected here, examine whether that rejection survives at 147 pages), **Superhuman**,
  **Linear**, **Height**, **Notion**, **Gmail**, **Slack**, and **Cmd-K palettes** generally. Where is the
  boundary between a **command palette** (search-then-act, scales infinitely, no memorisation) and
  **positional hints** (fast, muscle-memory, does not scale past a screenful)? This system has **both**
  (⌘K palette + ⌘; nav keys) — what is the correct division of labour?
- **Discoverability at scale.** The `?` cheat sheet is generated from the same registries the handlers read.
  At 147 pages, does a global sheet stay usable, or does it need to become contextual — and what is the
  evidence on how operators actually learn keyboard systems (progressive disclosure, hint-on-hover,
  nudges after N mouse uses)?
- **Accessibility.** A capture-phase listener that `preventDefault`s letters, and `aria`-invisible transient
  hint overlays, interact with screen readers and with browser/OS shortcuts. What does **WCAG 2.2** require
  here — specifically **2.1.1/2.1.2** (keyboard, no trap), **2.1.4 Character Key Shortcuts** (single-letter
  keys must be remappable or disableable or focus-scoped — note this system's letters are leader-gated,
  assess whether that satisfies 2.1.4), and **2.4.11 Focus Not Obscured**? What must a leader-armed
  single-letter system provide to conform?
- **Remapping.** Decision 6 in the handoff fixes letters to a target's identity ("`p` always = Photos").
  Should operators be able to remap? If yes, where does a per-user keymap live, and how does it interact
  with the build-time uniqueness guard that currently proves no collision exists?
- **Electron.** The handoff declares the design "web-first, Electron-ready" and defers global/unfocused
  capture to a later track. What actually changes in an Electron shell — which browser chord conflicts
  disappear, what does `globalShortcut` buy on a warehouse terminal, and does that change *any* decision that
  should be made now rather than later?
- **The wedge constraint is non-negotiable.** Barcode wedge scanners emit keystrokes with no modifiers, at
  machine speed, into whatever has focus. The current mitigations are a modifier leader, a 30 ms burst
  detector, a 1500 ms idle timeout, letters-only, and scan-route suspension while armed. Is there published
  practice (warehouse/retail POS/clinical systems) that does better — HID-level device separation, a scanner
  prefix/suffix protocol (STX/ETX, AIM identifiers), or Keyboard Lock / WebHID? What would each cost here?

---

## 8. What a good answer contains

1. **A recommended architecture for a graph viewer** — chosen rendering stack with its node-count ceiling,
   the API shape that keeps a response out of six-figure byte counts, the snapshot/versioning model, and a
   defended answer to §7.2's inside-the-product / separate-tool / artifact fork.
2. **A connection-architecture recommendation** that keeps the graph queryable under
   `max_connections = 100` when an unrelated client misbehaves — stated *before* any viewer work, with the
   specific trade-offs of transaction pooling against this codebase's use of `SET LOCAL` GUCs, and a
   position on per-process pool caps for stdio MCP servers.
3. **A single location-binding model**, as concrete Postgres DDL, that either unifies
   `unit_pack_placements` / `bin_contents` / `serial_units.current_location` / `location_transfers` or
   deliberately federates them — with the migration path for the two text-grain legacies, and an explicit
   position on polymorphic-hub vs typed-siblings given what the photo hub's vocabulary drift already cost.
4. **A CRUD uniformity strategy** with a named target pattern, a mechanical migration path for 936 route
   files, and the enforcement mechanism that makes tenancy/permission/audit unskippable — plus what to do
   about the cross-tenant anonymous read in `/api/locations`.
5. **A resolution of the photo-vocabulary fork** — one authority for `entity_type` (DB CHECK, TS constant,
   or generated-from-one-source), the guard that keeps them tied, and a position on adding `LOCATION` (and
   restoring `ORDER`).
6. **A keyboard-navigation generalisation plan** — the region model that scales to 147 pages, the palette /
   positional-hints division of labour, WCAG 2.2 conformance specifics, and the remapping story — that does
   not weaken any of the five wedge-safety properties in §6.1.
7. **A build order across all five threads**, with the dependency argument. (Our prior: connection
   architecture → graph API shape → viewer; and location-model unification before any "attach to a place"
   UI. Contest that if it is wrong.)
8. **A named list of what the recommended design still cannot do**, and what it would cost to add later.
9. **Citations throughout** — standards documents (WCAG, GS1 where relevant), vendor architecture
   documentation, and real implementations. Where practice diverges, present the divergence.

Prefer specificity over completeness. A precise, defended recommendation on §7.1–7.2 (the graph viewer, which
is the thread with no implementation at all) and §7.3 (the location model, which has two conflicting
implementations) is worth more than even coverage of all five threads.

---

## 9. Appendix — verification notes

Two states are recorded because the system changed mid-investigation: the graph was unreachable on
2026-08-18 and was repaired and rebuilt on 2026-08-19.

| Claim | How it was established | Status |
|---|---|---|
| Graph totals (6,700 / 41,105 / 203,758 / 41,105 embedded) | `graph_stats` over MCP after the rebuild | live, 2026-08-19T02:36:50Z build |
| Prior totals (6,622 / 35,553 / 173,138 / 14,895) | `graph_stats`, 08-17T07:14 build | superseded, kept for the drift argument |
| Button impact 670 → 684 → 676 files | `impact_analysis` depth 2, three runs across two builds | observed |
| Button callers 1,090 nodes | `get_call_graph` callers, depth 2, `[calls, renders]`, 08-17 index | superseded by the rebuild |
| Impact payload 145 KB / 133 KB | byte length of the raw MCP responses | measured |
| Route/page/component counts | `find` + `grep -rlE` over `src/` | measured 2026-08-18 |
| `max_connections = 100` | `postgresql.conf` inside `jarvis-db-1` | measured |
| Saturation cause: 496 conns from `realtime-dev.supabase-realtime` | `/proc/net/tcp` inside the container, peer IPs mapped via `docker inspect` | measured 2026-08-18, cleared 2026-08-19 |
| `.mcp.json` + `codebase_path` pointed at a dead root | read from both, both repointed and re-verified over stdio | fixed 2026-08-19 |
| 32 indexed files no longer on disk | `fs.existsSync` over every `graphify_files.path`; pruned before rebuild | measured — note the indexer never prunes these on its own |
| No graph UI in the app | `grep -rl "graphify\|code-graph\|CodeGraph" src` → 0 files | measured |
| Nav-keys consumers (7 files) | `grep -rln "useNavRegion\|useNavMode" src` outside `lib/keyboard` | measured |
| Photo entity-type fork | read from the three migrations + `src/lib/photos/types.ts` | **from source, not from the live DB** |
| Live `chk_photo_entity_links_entity_type` definition | **not checked** | **[UNVERIFIED]** |

**On that last row.** The photo tables live in the application's **Neon** database
(`ep-shiny-hall-adz0n0nu-pooler…`), not the local `garisek` graph database — so the 08-18 saturation was
never the reason it went unverified; it simply was not queried, and connecting to the live tenant database
was out of scope for this investigation. Verify before acting on §5.2 with:

```sql
SELECT pg_get_constraintdef(oid) FROM pg_constraint
 WHERE conname = 'chk_photo_entity_links_entity_type';
SELECT count(*) FROM photo_entity_links WHERE entity_type = 'ORDER';
SELECT tgname FROM pg_trigger WHERE tgname = 'trg_delete_photos_on_order_delete';
```

If `ORDER` is absent from the constraint while rows carrying it exist, that is a live data-integrity
problem and takes priority over everything else in §7.
