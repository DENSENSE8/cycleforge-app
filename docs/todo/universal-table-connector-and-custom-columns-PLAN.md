# Universal Table Connector and Custom Columns Plan

**Date:** 2026-08-08  
**Status:** HISTORY DOGFOOD LOCK (2026-08-09) — Unbox History / Receiving only; Orders port reverted.
**Enforcement:** `CUSTOM_FIELD_LIVE_ENTITY_TYPES` + `custom-fields-history-first.guard.test.ts` +
AGENTS.md / source-of-truth.md → *Table engine fan-out (History first)*.  
**Companions:** [`universal-table-connector-and-custom-columns-GEMINI-RESEARCH-BRIEFING.md`](universal-table-connector-and-custom-columns-GEMINI-RESEARCH-BRIEFING.md) · [`unbox-view-switcher-and-custom-fields-HANDOFF.md`](unbox-view-switcher-and-custom-fields-HANDOFF.md)

---

## 1. Executive verdict

**Rule:** Custom fields store in a typed, org-scoped side-table (`custom_field_values`), joined at query-time into a single aggregated JSONB map, and render through a single generic `CustomFieldCell` wired to known `ColumnType`s.

**Search displays:** Reject expanding the flat `/search` feed into a custom-column matrix. Accept reading (b) later — a Workbench grid when search is narrowed to one entity type. Wave 1 does **not** touch `/search`.

**Universal connector:** U2/U3 only. A new *column* of a known type needs zero new cell TS. A new *entity table* still needs a human binding (11-step recipe). Mega-row / SQL introspection (U4) stays killed.

**Per-staff Sheets simplify:** Hide/show (+ widths/paint) via `staff_preferences.tableColumns[tableId]`. True **Create field** = org admin → `custom_field_defs`; then every staff member can hide it personally.

---

## 2. Forced rulings D1–D14 (ratified)

| # | Ruling |
|---|---|
| D1 | **S3** typed side-table (`custom_field_defs` + typed value columns) |
| D2 | Wave-1 row-level fields ship; R1 cross-grain PO report deferred v2 |
| D3 | Search reading **(b)** sequenced later; flat `/search` stays flat |
| D4 | Custom fields stay out of `entity_search_docs` for v1 |
| D5 | Accept **U2/U3** (`cellMapKey` + `CustomFieldCell`) |
| D6 | First entity: **`ORDER`** (via `OrdersGridHost`) |
| D7 | Per-`entity_type` fields do **not** travel across stations |
| D8 | Search-invisible for v1 |
| D9 | One aggregated join / `jsonb_object_agg` hydrate |
| D10 | Custom columns merge at runtime; static `TABLE_COLUMNS` stays system vocabulary |
| D11 | This is Horizon C, Wave 1 |
| D12 | Reuse `saved_views` later for views that include custom columns |
| D13 | R2 sharing/placement orthogonal; Locked tier later |
| D14 | New custom field on orders → **zero new TypeScript files** |

---

## 3. Phased execution — status

### Phase 0 — Sheets hide/show parity — DONE

- `NO_COLUMN_DISPLAY_HOST` emptied; Warranty / Unfound / Tracking-exceptions / Scan-out portal ▦.
- `makeLedgerGridColumnHeader` defaults Sheets right-click hide/unhide when `tableId` is set.
- `OrdersQueueColumnHeader` fork kept.

### Phase 1 — Cell dispatch seam — DONE

- [`src/lib/tables/cell-map-registry.ts`](../../src/lib/tables/cell-map-registry.ts) reads `cellMapKey`.
- [`src/lib/tables/custom-field-keys.ts`](../../src/lib/tables/custom-field-keys.ts) — `custom:*` keys.
- [`src/components/tables/CustomFieldCell.tsx`](../../src/components/tables/CustomFieldCell.tsx) — shared paint/edit.
- Guard/unit: [`src/lib/custom-fields/hydrate.test.ts`](../../src/lib/custom-fields/hydrate.test.ts).

### Phase 2 — Storage S3 + hydrate — DONE

- Migration [`2026-08-08f_custom_field_defs_values.sql`](../../src/lib/migrations/2026-08-08f_custom_field_defs_values.sql).
- Drizzle models on `customFieldDefs` / `customFieldValues`.
- [`src/lib/custom-fields/queries.ts`](../../src/lib/custom-fields/queries.ts) — list/create/archive + `hydrateCustomFieldMaps` / `attachCustomFieldsToRows`.
- APIs: `GET/POST /api/custom-fields/defs`, `DELETE …/defs/[id]`, `POST /api/custom-fields/values`.
- Perm: `settings.custom_fields` (define/archive); value writes use `orders.create` / `receiving.view`.

### Phase 3 — Orders Wave 1 — REVERTED (2026-08-09)

Orders custom-field merge / hydrate / Create field **removed** until Unbox History
is dogfood-verified. Engine + S3 storage stay; APIs reject `entityType=ORDER`.

### Phase 4 — Admin Create field — History only

- [`GridColumnDetailsPanel`](../../src/components/ui/table-column-config/GridColumnDetailsPanel.tsx) **Create field** only when `tableId` is `receiving` / `testing`.
- [`table-entity.ts`](../../src/lib/custom-fields/table-entity.ts) returns `RECEIVING` only.

### Phase 5 — Receiving / Unbox History — LIVE (dogfood surface)

- `GET /api/receiving-lines` attaches `customFields`.
- `ReceivingGridHost` + `renderReceivingGridCell` default → `CustomFieldCell`.
- **Prove here first**, then re-port Orders with the same recipe.

### Phase 6 — Deferred (do not start)

- Single-entity `/search` → `NonlinearTableHost`
- Custom fields in search outbox
- U3 AI authoring; S4 promote-on-heat; column drag-reorder
- R1 cross-grain purchased vs counted report

---

## 4. Portability recipe (any *registered* family)

1. Binding already on the registry (no new `*GridView.tsx`).
2. List API: `attachCustomFieldsToRows(orgId, ENTITY, rows)`.
3. Row type: optional `customFields?: CustomFieldValueMap`.
4. Host: `useCustomFieldDefs(ENTITY)` + `mergeCustomFieldColumns` + pass `columns={merged}`.
5. Row/cell default: `isCustomFieldColumnKey` → `CustomFieldCell` + commit helper.
6. Portal + column menu already from Phase 0.
7. Map `tableId` → entity in `src/lib/custom-fields/table-entity.ts` for Create field.

Still **no** generic `/api/tables/[id]`.

---

## 5. Never

- Mega-row / `GenericLedgerGrid` / U4 introspection
- `custom_fields` JSONB blob on system entity tables
- One SQL join per custom field
- New `*GridView.tsx` / raising `GRID_VIEW_FOREST`
- Mixed-entity `/search` custom-column matrix
- Custom field defs carrying cell JSX, DDL, or new terminal statuses

---

## 6. ROI scoreboard (from research)

| Candidate | Score | Status |
|---|---|---|
| S3 Typed side-table | 31.25 | **Shipped Wave 1** |
| U2 CustomFieldCell | 31.25 | **Shipped Wave 1** |
| U3 + AI authoring | 13.88 | Deferred Phase 6 |
| S4 Promote-on-heat | 11.11 | Deferred |
| U4 Full introspection | 0.16 | Never |

---

## 7. Ask-first (product)

1. Which roles receive `settings.custom_fields` by default?
2. Seed USAV dogfood fields?
3. Locked saved-view tier: layout-only vs filter-only?
