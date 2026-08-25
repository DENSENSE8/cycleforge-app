# One rail — a per-staff recent, not a rail per page

> **Question (operator, 2026-08-22):** every page has its own recent rail, they
> all differ, and the per-staff recent already leaks into page-shaped rails.
> Replace them with **one per-staff recent rail** with a search row and a
> filter button on top. What is the cleanest way there?

---

## 1. What is actually inconsistent

There are **14 rail bindings over 7 row types**, all rendering through the same
shell and all disagreeing about what a "recent" is.

| Binding | Row type | "Recent" means |
|---|---|---|
| `unboxRecent` | `ReceivingLineRow` | carton first opened at the Unbox bench |
| `unboxQueue` · `scanned` | `ReceivingLineRow` | door-scanned, priority-sorted — a **queue**, not a recent |
| `viewed` | `ReceivingLineRow` | **you** opened this (`receiving_line_views`) |
| `triageCombined` · `triageUnfound` · `triageDone` | `ReceivingLineRow` | triage state — three **queues** |
| `searchRecent` | `ReceivingLineRow` | **you** opened this (same `viewed` query, different eyebrow) |
| `PackRecentPacksRail` | `PackerRecord` | you packed it |
| `ShippingStaffScanHistoryRail` | `TechRecord` | you scanned it out |
| `LabelsRecentRail` | `ShippedOrder` | recently labelled |
| `PickupSidebarRail` | `PickupLine` | open LCPU orders — a **queue** |
| `ProductLabelsRecentRail` | `LabelPrintFeedItem` | you printed it |
| `FbaItemRail` | `FbaItemRow` | board items by status — a **queue** |

Two different nouns are wearing one costume:

- **Recents** — *records THIS staffer touched*, newest first, per-staff, cross-page.
- **Queues** — *records in a state*, org-wide, sorted by priority or age.

Five of the fourteen are queues. They are not inconsistent recents; they are a
different thing that borrowed the recent rail's chrome. **Any consolidation that
merges them is merging two nouns and will fail.** Split first, then unify.

## 2. The spine already exists — this is consolidation, not invention

Nothing below needs designing from scratch:

| Piece | Where | What it already gives you |
|---|---|---|
| `entity_search_docs` | `2026-07-03d` | org-scoped **display cache**: `entity_type` · `entity_id` · `title` · `subtitle` · `status` · `condition_grade` · `source_platform` · `happened_at`, for ORDER · SERIAL_UNIT · RECEIVING · SKU · REPAIR · FBA_SHIPMENT. **These are exactly the fields a rail row paints.** |
| `SURFACE_ENTITY_TYPES` / `FEED_KEYS` | `lib/surfaces/registry.ts` | the entity + feed vocabulary, already the AI's runtime SoT |
| `staff_rail_exclusions` | `2026-07-03k` | per-staff hide, keyed `(feed_key, entity_type, entity_id)` — already polymorphic |
| `search_recents.entity_type/_id` | `2026-08-22a` (just landed) | a per-staff recent that resolves against `entity_search_docs` |
| `receiving_line_views` | `2026-06-13c` | the per-staff touch log — but only for receiving lines |
| `SidebarRailShell` + `RailRow` + `RailRowMenu` | `sidebar/rail-shell/` | one row anatomy, keyboard nav, peek, ⋮ menu |
| `design-system/components/item-record/` | in flight | a universal record row/card |

The rails are the last page-shaped thing in a stack that is otherwise already
entity-shaped.

## 3. Target: one rail, three layers

### 3a. Store — one polymorphic touch log

Generalise `receiving_line_views` into:

```sql
staff_recent_views (
  organization_id, staff_id,
  entity_type, entity_id,        -- SURFACE_ENTITY_TYPES vocabulary
  touched_at,                    -- last touch; the rail's ONLY sort axis
  touch_kind                     -- opened | scanned | packed | printed | shipped
)
-- UNIQUE (organization_id, staff_id, entity_type, entity_id)  ← one record, one row
```

One row per record per staffer, upserted on touch. `touch_kind` is what lets the
filter button say "only things I packed" without a second table.

Every rail that is really a recent becomes a **writer**, not a reader: Unbox
open, Pack complete, Label print, Scan-out, Search open all `upsertStaffRecent`.
Most already emit the event that would call it.

### 3b. Read — one endpoint

```
GET /api/staff/recents?limit=&q=&type=&kind=&since=
  staff_recent_views ⋈ entity_search_docs  (org+staff scoped, RLS)
  anti-join staff_rail_exclusions
  ORDER BY touched_at DESC
```

Returns one uniform row: `{ entityType, entityId, title, subtitle, status, grade, platform, touchedAt, touchKind }`.

`q` is free — `entity_search_docs.search_text` is already the indexed haystack
the global search uses, so the rail's search row costs no new index.

### 3c. Render — one row, adapters only for tone

`SidebarRecentRailBase` binds that single feed. Per-entity code shrinks to a
registry mirroring `RAIL_STATUS` / `RAIL_QTY`:

```ts
RECENT_ENTITY = {
  RECEIVING:   { dot, href: id => `/unbox?recvId=${id}`, facts },
  ORDER:       { dot, href: id => `/search?sel=order:${id}`, facts },
  SERIAL_UNIT: { … },
}
```

No `renderRowMain` per rail, no per-rail fetcher, no per-rail query key.

## 4. The rail's own chrome

```
┌──────────────────────────────┐
│ 🔍 search        ⚙ filter  ⋮ │   ← one band, resident
├──────────────────────────────┤
│ ● Title            ⋮ / 4h    │
│   subtitle · qty              │
└──────────────────────────────┘
```

The search row and filter button already exist as the **scan bar in Preview
stance** (`ReceivingSidebarPanel` → `receivingRailBandSlot`): typing filters the
rail, the facet popover rides the right edge, and the edit pencil now sits
beside it. Promote that band out of the receiving panel into the rail shell and
it serves every station. Filter facets become: entity type · touch kind · age.

## 5. Order of work (expand → code → contract)

1. **Split the nouns.** Rename the five queues so nobody merges them by
   accident: `unboxQueue`, `scanned`, `triage*`, `pickup`, `fba` are
   **queue rails**, and they keep their own feeds. Recents-only from here.
2. **Migration (additive, safe to ship alone):** `staff_recent_views` +
   `upsertStaffRecent`. Backfill from `receiving_line_views` and
   `search_recents`.
3. **Write path first.** Every recent-producing action starts upserting. Ship
   this and let the table fill for a week while nothing reads it — you get a
   real feed before you bet a surface on it.
4. **The endpoint + one rail component.** Mount it on ONE station behind a flag,
   beside the existing rail, and compare them live.
5. **Move the band up** — search + filter into the rail shell.
6. **Swap station by station**, deleting each old feed's fetcher, query key and
   row renderer as it goes.
7. **Contract:** drop `receiving_line_views`, the `viewed` / `searchRecent`
   feeds, `RecentActivityRailBase`'s per-domain renderers, and
   `railExclusionFeedKey` (the exclusion becomes keyed by entity, not feed).

Steps 1–3 are independently shippable and reversible. Do not start at 6.

## 6. What this fixes for free

- **`staff_rail_exclusions` becomes universal.** Hide/Delete are receiving-only
  today purely because the feed-key vocabulary is receiving-only. Key the
  exclusion by `(entity_type, entity_id)` and every rail gets Hide.
- **The ⋮ menu stops being per-feed.** `RAIL_ROW_ACTIONS` collapses into
  `RECENT_ENTITY[type].actions`.
- **One place to be fast.** LCP on the data-heavy workbenches is one
  post-hydration fetch per rail; one rail is one query to stream server-side.

## 7. Decisions only the operator can make

1. **Is a recent per-staff or per-station?** A shared bench tablet signed in as
   one staffer makes "mine" wrong. Per-staff is proposed; per-(staff, station)
   is the alternative and it changes the unique key.
2. **What counts as a touch?** Opening a record is obvious. Is *scanning* it at
   a door? *Printing* its label? If everything counts, the rail is a firehose;
   if only "opened", the Pack and Label rails lose their content.
3. **How long is a recent?** A trailing window (7d?) or a fixed N per staffer.
   Without one, the table grows forever and the rail's tail is dead weight.
4. **Do the five queue rails keep their own chrome, or become saved filters on
   the one rail?** The second is tidier and is a much larger change — the
   queues carry priority sort, facets and multi-select that recents do not.
