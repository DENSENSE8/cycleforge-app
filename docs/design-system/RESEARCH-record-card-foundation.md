# Research — RecordCard foundation: how the DataTable consumes the field-catalog hierarchy (mapped 2026-09-27)

Step 1 of phase 4 in `HANDOFF-card-list-port.md`. Read-only map; line numbers true on 2026-09-27 — re-verify before editing.


## 1. Types (`src/lib/tables/field-catalog/types.ts` & `src/lib/tables/slot-layout-core.ts`)

### `src/lib/tables/field-catalog/types.ts`
- **`FieldFamily`** (`types.ts:6`): Derived from table definition entity families:
  ```ts
  export type FieldFamily = TableDefinition['entityFamily'];
  ```
- **`FieldDisplayType`** (`types.ts:13-24`): Controls which cell atom paints the fact:
  ```ts
  export type FieldDisplayType =
    | 'id'
    | 'text'
    | 'number'
    | 'tag'
    | 'date'
    | 'person'
    | 'stage_event'
    | 'money'
    | 'note'
    | 'tracking';
  ```
- **`SlotKind`** (`types.ts:27`): Slot bands a fact may occupy:
  ```ts
  export type SlotKind = 'identity' | 'status' | 'subtitle' | 'amount';
  ```
- **`FieldDef`** (`types.ts:33-47`):
  ```ts
  export interface FieldDef {
    id: string; // e.g. 'orders.picked'
    family: FieldFamily;
    label: string;
    displayType: FieldDisplayType;
    slotKinds: readonly SlotKind[];
    iconKey?: string;
    stageLabels?: Readonly<{ done: string; pending: string }>;
    paths?: Readonly<Record<string, string>>;
  }
  ```
- **`FieldCatalog`** (`types.ts:50`): `readonly FieldDef[]`.

### Layout Type Definition (`src/lib/tables/slot-layout-core.ts:4-19`)
Layout types are defined in `src/lib/tables/slot-layout-core.ts`:
```ts
export interface SlotBinding {
  fieldId: string;
}

export interface SlotLayout {
  morph: 'sheet' | 'compound';
  identityFieldId: string;
  statusBindings: SlotBinding[];
  subtitleBindings: SlotBinding[];
  amountFieldId?: string | null;
}
```
- Budgets: `MAX_STATUS_SLOTS = 10` (`slot-layout-core.ts:22`), `MAX_SUBTITLE_SLOTS = 5` (`slot-layout-core.ts:25`).
- Validation: `slotLayoutSchema` Zod strict schema is defined in `src/lib/tables/slot-layout.ts:31-38`, and validated against a catalog in `parseSlotLayout` (`src/lib/tables/slot-layout.ts:40-63`).

---

## 2. Registry & Resolution

### Resolver Signature
Resolution is a typed pure function per family, never generic reflection (`types.ts:30-32`):
```ts
(row: FamilyRow, fieldId: string, ctx?: FamilyContext) => CompoundSlotValue | null
```
- E.g. Orders resolver: `resolveOrdersSlotValue(record: ShippedOrder, fieldId: string, ctx: OrdersSlotContext = {}): CompoundSlotValue | null` (`src/lib/tables/field-catalog/orders-resolve.ts:133-162`).
- Generic feed consumer: `useCompoundSpreadsheet` (`src/components/tables/useCompoundSpreadsheet.tsx:81-82`) receives:
  `resolve: (row: Row, fieldId: string) => CompoundSlotValue | null`.

### Registries
1. **Catalog & Morph Registry**: `SLOT_LAYOUT_TABLES` in `src/lib/tables/org-table-layouts.ts:161-395` maps table layout ID (`tableId`) to `{ catalog: FieldCatalog, morphs: readonly ('sheet' | 'compound')[] }`.
2. **Table Definition Registry**: `TABLE_DEFINITIONS` in `src/components/tables/table-definition-registry.ts:11-13` maps definition ID (`<family>.<view>`) to `TableDefinition`, derived from `REGISTERED_BINDINGS` (`src/components/tables/registered-bindings.ts:49-162`).
3. **Product Default Layouts**: Exported per catalog file as `<FAMILY>_PRODUCT_LAYOUT` (e.g. `ORDERS_PRODUCT_LAYOUT` in `src/lib/tables/field-catalog/orders.ts:89-101`).

---

## 3. Persistence (Saved Views & Cascade)

### Cascade Order (`src/lib/tables/resolve-effective-layout.ts:60-119`)
`resolveEffectiveLayout` applies whole-document last-wins:
$$\text{savedViewLayout} \longrightarrow \text{staffLayout} \longrightarrow \text{orgLayout} \longrightarrow \text{productDefault}$$
Drops stale/duplicate/over-budget bindings and ensures line money/qty locks.

### Storage Layers
1. **Saved Views Table**:
   - Drizzle schema: `savedViews` in `src/lib/drizzle/schema.ts:5188-5216`.
   - Migration: `src/lib/migrations/2026-07-29g_saved_views.sql:28-66`. Polymorphic table with `organization_id`, `staff_id`, `surface`, `name`, `filters` (JSONB).
   - Saved View Layout Storage: Stored inside `filters.layout`.
   - Read: `src/hooks/useSavedViews.ts:76`: `readStoredSlotLayout(row.filters?.layout)`.
   - Write: `src/hooks/useSavedViews.ts:173-175`: `filters.layout = options.layout`.
   - Active View In-Memory Broadcast: `src/lib/tables/saved-view-layout-store.ts:7-40` (`getSavedViewLayout`, `setSavedViewLayout`, `subscribeSavedViewLayout`).
2. **Staff Preferences**:
   - `staff_preferences.prefs.tableLayouts[tableId]` validated by `slotLayoutSchema` (`src/lib/schemas/staff-preferences.ts:270`).
3. **Org Settings**:
   - `organizations.settings.tableLayouts[tableId]` read/written via `readOrgTableLayout` and `nextTableLayoutsMap` (`src/lib/tables/org-table-layouts.ts:404-426`).

---

## 4. Painters (`src/components/tables/compound/**`)

### `CompoundSlotValue` Shape (`src/components/tables/compound/compound-row-model.ts:334-340`)
```ts
export type CompoundSlotValue =
  | ({ kind: 'stage_event' } & CompoundStageStepFacts)
  | { kind: 'value'; text: string | null }
  | { kind: 'person'; staffId: number | null; name: string | null };
```
`CompoundStageStepFacts` (`compound-row-model.ts:347-356`): `{ who: string | null; whoStaffId?: number | null; at: string | null; atInstant?: string | null; station: string | null; }`.

### `CompoundSlotCell` (`src/components/tables/compound/CompoundCells.tsx:1186-1237`)
Props:
```ts
{
  trackKey: string;
  label: string;
  iconKey?: string;
  displayType?: FieldDisplayType;
  stageLabels?: Readonly<{ done: string; pending: string }>;
  view: CompoundRowView;
  assign?: CompoundStageAssign;
}
```
Painting logic:
- **`stage_event`** (`CompoundCells.tsx:1199-1215`): Renders `CompoundStageStep` (`CompoundCells.tsx:1033-1110`).
  - Icon: `SLOT_STEP_ICONS[iconKey ?? ''] ?? Package` (`picked`: `PackageSearch`, `packed`: `PackingModeStandard`, `scanned_out`: `ShippingModeScanOut`) (`CompoundCells.tsx:1180-1184`).
  - Top line: Done verb (`stageLabels.done`) or pending verb (`stageLabels.pending`).
  - Bottom line: formatted timestamp (`formatCompoundStageStampFace`) or "Assigned" or empty dash.
  - Avatar: `StaffAvatar` (`size="sm"`) when assigned/done or empty stage pill (`ITEM_RECORD_MOBILE_STAGE.empty`).
  - Interaction: Pending stage opens `StageStaffAssignPopover` if `assign` is provided.
- **`person`** (`CompoundCells.tsx:1216-1234`):
  - Renders `StaffAvatar` (`size="xs"`) + name in `HoverTooltip`.
  - Empty: renders `<GridCellDash />`.
- **Value types** (`CompoundCells.tsx:1235-1237`): Calls `compoundSlotPrimary(displayType, text)` (`CompoundCells.tsx:1240-1284`), mapped via `compoundSlotFaceFor(displayType)` (`compound-slot-face.ts:33-47`):
  - `'date'` -> `'age'`: `compoundSlotAgeFace(text)` with hover `compoundSlotInstantFace(text)`.
  - `'tag'` -> `'tag'`: styled rounded badge (`bg-surface-sunken font-mono text-role-micro uppercase text-text-muted`).
  - `'id' | 'tracking'` -> `'code'`: `CopyableCellValue` (mono code with copy button).
  - `'text' | 'number' | 'money' | 'note'` -> `'plain'`: `CompoundLine` inside `HoverTooltip`.
  - Empty/null text: renders `<GridCellDash />`.

### Other Compound Cell Painters (`src/components/tables/compound/CompoundCells.tsx`)
- `CompoundThumb` (`103-122`): `{ view: CompoundRowView }` (square thumbnail with Next/Image or Package fallback).
- `CompoundSelect` (`135-156`): `{ checked, onToggle, label, selectStatus?, onStatusChange?, chrome?, edgeMark? }` (checkbox + edge rail + select face).
- `CompoundItem` (`423-455`): `{ view, subtitleSelects?, subtitleEdits?, onReorderSubtitle?, onOpen? }` (title, strike, flagMark, kitFace, subtitle parts).
- `CompoundFulfillment` (`715-728`): `{ view, onOpenLabels? }` (order ID, platform dot, buyer name, carrier label).
- `CompoundDates` (`833-855`): `{ view, shipByEdit?, orderedAtEdit? }` (calendar delay pill, ordered-at stamp).
- `CompoundState` (`949-960`): `{ view, onOpen? }` (lifecycle state pill over next-step).
- `CompoundActions` (`1288-1300`): `{ onOpen, actions, label }` (three-dot menu).

---

## 5. Families × Pages Table

| Family | Layout ID | Default Morph | Primary Pages (Desktop) | Mobile Surface |
| :--- | :--- | :--- | :--- | :--- |
| `orders` | `orders` | `compound` | `/shipping/orders`, `/shipping/shortage`, `/shipping/shipped` (`src/components/unshipped/UnshippedTable.tsx:796`, `OutboundOrdersLedger.tsx:173`, `OrderCardList.tsx:5`) | `/m/orders` mounts dedicated `MobileToShipQueue` (`AssignedOrders.tsx:28`), no DataTable |
| `orders` (index) | `orders-index` | `sheet` | `/shipping/orders` (floor index face), `/review` (`ReviewPackingTable.tsx:157`, `ReviewPairingTable.tsx:55`) | No mobile DataTable |
| `receiving` | `receiving` | `compound` | `/receiving`, `/receiving/history`, `/unbox`, `/test` (`src/components/station/receiving-grid/receiving-table-definition.ts:25`) | `/m/r/[id]` (custom touch inspection steps) |
| `daily` | `daily` | `compound` | `/dashboard` (Daily shift checklist, `src/features/home/grid/daily-table-definition.ts:24`) | `/m/home` (custom mobile home view) |
| `my-day` | `my-day` | `sheet` | `/dashboard` (My Day desk, `src/features/my-day/grid/my-day-table-definition.ts:25`) | `/m/work` |
| `bins` | `bins` | `sheet` | `/warehouse/bins` (`src/components/warehouse/bins-grid/bins-table-definition.ts:25`) | `/m/bin/[barcode]`, `/m/loc/[code]` |
| `units` | `units` | `sheet` | `/inventory/units` (`src/components/inventory/units-grid/units-table-definition.ts:25`) | `/m/u/[id]` |
| `sku-bins` / `sku-ledger` | `sku-bins`, `sku-ledger` | `compound` | `/inventory/sku/[sku]` (`sku-bins-table-definition.ts:24`, `sku-ledger-table-definition.ts:25`) | None |
| `inventory-events` | `inventory-events` | `compound` | `/inventory/events` (`src/components/inventory/events-grid/inventory-events-table-definition.ts:25`) | None |
| `catalog` | `catalog` | `sheet` | `/products` (`src/components/products/catalog/catalog-grid/catalog-table-definition.ts:25`) | `/m/fnsku/[fnsku]/info` |
| `catalog-link` | `catalog-link` | `compound` | `/review` (`src/features/review/catalog-link/grid/catalog-link-table-definition.ts:25`) | None |
| `walk-in-sales` | `walk-in-sales` | `compound` | `/walk-in` (`src/components/walk-in/grid/walk-in-sales-table-definition.ts:25`) | None |
| `tasks` / `report-tasks` | `tasks`, `report-tasks` | `compound` | `/dashboard` (Tasks tab, `tasks-table-definition.ts:24`), `/studio/automations` (`report-tasks-table-definition.ts:24`) | None |

*Note on Mobile vs Desktop*: Desktop mounts `DataTable`, `NonlinearTableHost`, and `OutboundOrdersLedger`/`OrderCardList` via `TableSurfaceBinding`. Mobile `/m/*` pages never mount `DataTable` or `SlotLayout`; they render dedicated phone task flows (`MobileToShipQueue`, `MobileOrderRecord`).

---

## 6. AI Chat Mapping (`InlineArtifact.tsx` / `ui-artifacts.ts`)

- **Current Chat Artifact Schema** (`src/lib/assistant/ui-artifacts.ts:75-87`):
  ```ts
  export const artifactTableSchema = z.object({
    kind: z.literal('table'),
    title: artifactTitle,
    columns: z.array(z.string().max(80)).min(1).max(12),
    rows: z.array(z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))).max(200),
    entityHint: z.string().max(60).optional(),
    idColumn: z.string().max(60).optional(),
    identity: artifactIdentitySchema.optional(),
  });
  ```
- **Current Rendering** (`src/components/session/artifacts/InlineArtifact.tsx:244-320`): Renders a raw unvirtualized HTML `<table>` (`InlineTable`) inspecting `numericColumns` and `idColumnKind(column)` (`InlineArtifact.tsx:282`).
- **Mapping to Family + Default Layout for a Card Renderer**:
  1. `entityHint` (e.g. `'order'`, `'unit'`, `'bin'`, `'sku'`) or `identity.href` (e.g. `/shipping/orders?id=...` -> `orders`) resolves to a `FieldFamily`.
  2. The family lookup retrieves the default `SlotLayout` from `SLOT_LAYOUT_TABLES[family]` (`org-table-layouts.ts:161`) and its `FieldCatalog`.
  3. `idColumn` maps to `identityFieldId`.
  4. Rows map into cards via the family adapter / resolver (`resolveOrdersSlotValue`, etc.), replacing or enhancing the raw HTML table with interactive design-system cards.

---

## 7. Card Hardcodes vs Catalog (`OrderCard.tsx` vs `orders.ts`)

`OrderCard.tsx` (`src/components/outbound/orders/cards/OrderCard.tsx`) and `order-card-model.ts` (`src/lib/orders/order-card-model.ts`) currently hardcode multiple fields that the catalog already expresses:

1. **Order Number / ID**:
   - *Catalog*: `orders.order_id` (`orders.ts:7-14`, displayType: `'id'`, slotKind: `['identity']`).
   - *Card*: Hardcodes `OrderAdminLinkAction` wrapping `OrderIdChip` with custom prop wiring (`OrderCard.tsx:722-731`).
2. **Platform / Channel**:
   - *Catalog*: `orders.channel` (`orders.ts:149-156`, displayType: `'tag'`).
   - *Card*: Hardcodes `useOrderChannel()(model.orderId, model.accountSource)` + `BrandIdentityDot` + `platformMetaBrandDot` + `FBA` chip (`OrderCard.tsx:736-749`).
3. **SLA / Ship By**:
   - *Catalog*: `orders.fulfill_by` (`orders.ts:174-181`, displayType: `'date'`).
   - *Card*: Hardcodes `orderSla` (`order-card-model.ts:161-166`) + custom pulsating dot (`SLA_DOT_CLASS[model.sla.tone]`, `OrderCard.tsx:623-652`).
4. **Quantity**:
   - *Catalog*: `orders.qty` (`orders.ts:48-54`, displayType: `'number'`).
   - *Card*: Hardcodes `×{line.qty}` with `orderRowQtyTone(line.qty)` (`OrderCard.tsx:374-376`).
5. **Condition**:
   - *Catalog*: `orders.condition` (`orders.ts:55-61`, displayType: `'tag'`).
   - *Card*: Hardcodes `{line.condition}` with `conditionGradeTextClass(line.conditionCode)` (`OrderCard.tsx:377-382`).
6. **Bin Location**:
   - *Catalog*: `orders.bin` (`orders.ts:208-214`, displayType: `'text'`).
   - *Card*: Hardcodes `<MapPin />` + `{line.bin.path ?? 'No bin'}` (`OrderCard.tsx:402-405`).
7. **Amount / Price**:
   - *Catalog*: `orders.amount` (`orders.ts:70-76`, displayType: `'money'`).
   - *Card*: Hardcodes `{line.priceEstimate ? '~' : ''}{line.price}` with `text-text-success` (`OrderCard.tsx:407-414`).
8. **Stages & Icons**:
   - *Catalog*: `orders.picked` (iconKey: `'picked'`, stageLabels: `{ done: 'Picked', pending: 'Pick' }`, `orders.ts:15-28`), `orders.packed` (iconKey: `'packed'`, stageLabels: `{ done: 'Packed', pending: 'Pack' }`, `orders.ts:29-41`).
   - *Card*: Hardcodes `STAGE_FACE` (`OrderCard.tsx:244-248`) using `PackageCheck` for pack (different from table's `PackingModeStandard`), `STAGE_ASSIGN` (`OrderCard.tsx:257-260`), and hand-rolls timeline rows (`StageTimelineRow`, `OrderCard.tsx:267-310`).

---

## 8. Gaps for a Generic Card Renderer

To replace bespoke cards with a reusable `RecordCard` consuming `SlotLayout`, the model must bridge these gaps:

1. **Lead Item & Multi-line Hierarchy**:
   - `SlotLayout` assumes flat rows. It has no contract for a **lead item** (photo, title, line facts) + expandable sub-lines (`+N items` accordion in `OrderCard.tsx:842-861`).
   - Lacks a `photoFieldId` in `SlotLayout` (`CompoundRowView.thumbUrl` is currently an unbindable adapter property).
   - Lacks large photo hover-peek specifications (`CardPhoto` in `OrderCard.tsx:187-238`).
2. **Compound Stage Progression vs Independent Slot Tracks**:
   - `CompoundSlotCell` renders each stage fact in its own table column.
   - A card requires a **single stage summary button** (`currentOrderStage` in `OrderCard.tsx:319-354`) showing the active/next stage, plus a popover for the multi-step timeline (QC -> Pick -> Pack) with assignment controls (`StageTimelineRow`).
   - The catalog does not define workflow sequence ordering or assignable functional roles (`technician` vs `packer`).
3. **Leading Edge Rail & Lifecycle Tone**:
   - `OrderCard` has a status rail with `RAIL_VARIANTS` hover breathing (`OrderCard.tsx:55, 688-694`) and hatched diagonal stripes for out-of-stock (`HATCH_STYLE`, line 69).
   - `SlotLayout` currently has no property designating which fact or lifecycle state drives the edge rail.
4. **Responsive Disclosure Priority (`CARD_DISCLOSE`)**:
   - `OrderCard` uses `@container/card` breakpoints (`brand` @md, `label` @xl, `detail` @2xl) to progressively show/hide platform names, buyer text, and timestamps (`OrderCard.tsx:739, 755, 345`).
   - `SlotLayout` bindings are flat lists without priority weights or collapse thresholds.
5. **Card Action Surface**:
   - `OrderCard` supports card-level gestures: Space to open quick look (`OrderCardPeek`), whole-card click to open record plane, SKU batch-select button (`OrderCard.tsx:761-778`), and right-edge checked dropdown (`OrderCardActionMenu`).
   - `CompoundRowAction` only models kebab dropdown items.