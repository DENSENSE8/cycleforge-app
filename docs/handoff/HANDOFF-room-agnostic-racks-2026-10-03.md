# Handoff — Room-agnostic movable racks: identity, labels, move (mobile first, then desktop)

Pin this. Build the phone job first on Mobile V2 and the design-system roots, then port the
same job tree to desktop. Do not start from the desktop label builders, and do not start from
the room.

## 0. Owner decisions (defaults — confirm before printing production labels)

| # | Decision | Default in this handoff | Override changes |
|---|---|---|---|
| D1 | Rack code format | `RK0012` rack, `RK0012-03` shelf, `RK0012-03-02` position | §3 grammar only |
| D2 | Shelf granularity | shelf **level** only; positions only for subdivided bins | §5 create flow |
| D3 | Existing 520 room-coded labels (`C-04-07-3`, `C0407300`) | keep; they still scan. Convert a bay to a rack only when it is adopted or first moves | §8 phase 5 |
| D4 | Location barcode/name uniqueness | migration: unique per organization, not global | §4 migration |

Gate 0: the owner confirms D1–D4. Code may be written before that; no production label is
printed until then.

## 1. The job

A rack is a physical object on wheels. It moves between rooms. Its labels never change.

- **Create a rack:** choose where it stands now and how many shelves → the system assigns the
  next rack number, creates the shelves, and prints one rack placard plus one label per shelf.
- **Move a rack:** scan the rack placard, scan the destination (a room label or a floor spot)
  → only the rack's placement changes. No reprint.
- **Print/reprint:** pick a rack → pick shelves (all by default) → print.
- **Urgency shelves:** a shelf on any rack can carry `arrival_priority_tier` (already live);
  its label shows `Arrival · <tier>`. Arrival placement and `/m/unbox` keep working unchanged.

## 2. First principles

1. **Identity is permanent and meaningless; placement is data.** A barcode identifies a thing.
   It never encodes where that thing is. The room appears on screen, never on the label.
2. **One fact per level.** Room → Rack → Shelf → (Position). Each row points to its parent
   with `parent_id`. The room is derived by walking up. Nothing copies the room downward.
3. **Moving is one write.** Moving a rack updates the rack row. Its shelves follow.
4. **Stock is keyed by location id, not barcode** (`bin_contents.location_id`). Relabelling
   keeps stock intact.
5. **Industry practice:** fixed racking uses zone-aisle-bay-level addresses. Movable racks are
   treated like containers, with a permanent asset ID (GS1 GIAI, AI 8004, for individual assets)
   and their placement recorded in the system. Shelves are addressed relative to the rack. Printed
   location payloads stay GS1: `(414)<GLN>(254)<code>` when the org has a licensed GLN, plain
   DataMatrix of the code otherwise (existing `locationLabelPayload`).
6. **Mobile first.** Every verb above is completable on `/m/*` before any desktop work.
   Desktop adds density and bulk; it does not add a second job tree.

## 3. Current state (evidence, 2026-10-03)

| Fact | Where |
|---|---|
| Scan resolves a location by exact `locations.barcode`; any letter-led string falls back to `bin` | `src/lib/barcode-routing.ts` `routeScan` step 6, `scannedLocationCode`, `unwrapScannedLocation` |
| Location grammar is room-coupled: dashed `^[A-Z]-\d{2}-\d{2}-\d{1,2}(-\d{2})?$`, flat `^[A-Z]\d{7,8}$`, first letter = room `zone_letter` | `barcode-routing.ts` `DASHED_LOCATION_RE`, `LOCATION_FLAT_RE`, `locationCode`, `rackCode`, `parseLocationCodeFlat` |
| Builders compose codes from the room letter | `src/lib/locations/expand-print-run.ts`, `src/components/barcode/{bin-label-printer,rack-printer}/**` |
| Room derived from the code letter in one desk view | `src/components/warehouse/RackDetailView.tsx:44` |
| Room also copied as text onto every shelf row | `locations.room`; writes in `src/lib/neon/location-queries.ts` (~L483, ~L1012–1062) |
| 527 active BIN rows, all `parent_id` = a ROOM; 0 RACK rows (kind allowed, unused) | live DB |
| `locations_barcode_key` and `locations_name_key` are **global** unique indexes | live DB |
| `ops_events.entity_type` CHECK has no `location` value | `src/lib/ops-event-types.ts`, `ops_events_entity_type_chk` |
| Printing: one entry point, faces with optional caption | `src/lib/print/printLocationRows.ts` (`printLocationRowLabels`, `planLocationRowFaces`, `arrivalShelfCaption`), `src/lib/print/printLocationLabel.ts` (`locationLabelToFace`), `src/lib/print/labelFace.ts`, `labelFaceBitmap.ts`, hook `src/hooks/useLocationLabelPrint.ts` |
| Phone label flow starts from the **room** (owner rejected) | `src/components/mobile/v2/stock/MobileV2LocationLabelFlow.tsx`, `MobileV2LocationLabelSteps.tsx`, `location-label-flow-model.ts`, route `/m/stock/labels` |
| Prefixes already taken | `R-` carton, `L-` line, `U-` unit, `H-` tote/LPN, `KIT-`, `T-`, `REP-` |

## 4. Target model

### Data (one migration, owner-approved per D4)

- Rack = `locations` row, `location_kind = 'RACK'`, `parent_id` = its current placement
  (a ROOM, or a STAGING/floor spot), `barcode = 'RK0012'`, `name = 'Rack 12'`.
- Shelf = `locations` row, `location_kind = 'SHELF'`, `parent_id` = rack,
  `barcode = 'RK0012-03'`, plus the existing `arrival_priority_tier`, `capacity`, `sort_order`.
- Position (only when subdivided) = `location_kind = 'POSITION'`, `parent_id` = shelf.
- Rack number: per-org next number, allocated under `pg_advisory_xact_lock` inside the create
  transaction. No sequence object per org.
- Migration `YYYY-MM-DD_locations_org_scoped_identity.sql` (read
  `.claude/skills/db-migration-author/SKILL.md`; author, dry-run, apply via the runner with owner
  approval):
  - replace global `locations_barcode_key` / `locations_name_key` with
    `(organization_id, barcode)` / `(organization_id, name)` unique indexes;
  - add `'location'` to `ops_events_entity_type_chk` and to `src/lib/ops-event-types.ts`.
- **Room is derived, never copied.** New code reads the room through one SQL helper
  (recursive walk up `parent_id` to the nearest ROOM, org-scoped). The `locations.room` text
  column becomes legacy: new rack/shelf rows do not depend on it. Stop new writers from
  depending on it; existing readers migrate in phase 6.

### Grammar (pure, `src/lib/locations/rack-code.ts`)

```ts
export interface RackAddress { rack: number; shelf: number | null; position: number | null }
export function rackCode(a: RackAddress): string;          // 'RK0012' | 'RK0012-03' | 'RK0012-03-02'
export function parseRackCode(raw: string): RackAddress | null; // accepts dashed/undashed, case-insensitive, GS1 254 payload
export function rackFace(a: RackAddress): { headline: string; sub: string | null }; // 'RACK 12' / 'SHELF 3' / 'POS 2'
```

- `RK` + 4-digit rack (1–9999) + optional `-SS` + optional `-PP`. Must never match
  `LOCATION_FLAT_RE` or `DASHED_LOCATION_RE`; a test proves no collision both ways.
- `routeScan` gains a rack branch **before** the step-6 letter fallback, returning
  `type: 'bin'` with the canonical code, so `unwrapScannedLocation` and every location field
  accept rack codes with no caller change. The GS1 `(414)…(254)RK…` and Digital Link
  `/414/…/254/RK…` forms route the same way.
- `/m/loc/[code]` resolves rack and shelf codes by exact barcode (already true).

### Events

`recordOpsEvent` (`src/lib/ops-events.ts`), entity `location`:
`location.rack.created`, `location.rack.moved` (payload: from/to placement ids and codes),
`location.labels.printed` (rack id, codes, transport). Actor from the server session; origin
from `commitIsPhoneOrigin` (`src/lib/auth/phone-origin.server.ts`); `client_event_id` from the
request for idempotent retries on warehouse Wi-Fi.

### Server (all `withAuth` + permission, tenant-scoped writes in one transaction)

| Route | Permission | Does |
|---|---|---|
| `POST /api/racks` | `sku_stock.manage` | create rack + N shelves (+ positions), returns rows; `dryRun` returns the planned codes |
| `GET /api/racks?placement=` | `sku_stock.view` | racks with derived room, shelf count, tiered-shelf count |
| `GET /api/racks/[code]` | `sku_stock.view` | rack + shelves + derived room/placement |
| `POST /api/racks/[code]/move` | `sku_stock.manage` | body `{ destinationCode, clientEventId }`; validates destination is a ROOM/STAGING/floor spot in the org; updates rack `parent_id`; one event |
| `POST /api/racks/[code]/shelves` | `sku_stock.manage` | add/remove shelves (remove refused when stock or cartons exist) |

Business logic lives in `src/lib/locations/racks.ts` with injectable deps; routes are thin.
Reuse `PATCH /api/locations/[barcode]/properties` for shelf tier/capacity; do not fork it.

### Printing

- Extend `planLocationRowFaces` / `printLocationRowLabels` in `src/lib/print/printLocationRows.ts`:
  rack codes produce a **rack placard** face (large `RACK 12`, matrix) and **shelf** faces
  (`RACK 12 · SHELF 3`, matrix, `arrivalShelfCaption` when tiered). No room text on any face.
- Payload through `encodePrintMatrix` / `locationLabelPayload` (GLN + AI 254 when licensed).
- Same transport as today (`printLabelFacesJob`; phone route via the existing print path).
  No new transport.

## 5. Mobile V2 surfaces (build first)

Laws: `docs/mobile-first/SURFACE_LAW.md`, `docs/mobile-first/V2_ARCHITECTURE.md` (incl.
"Record display law"). Run `node tools/design-mcp/ds.mjs contract "<job>"` before each file and
`ds critique <file>` after. ESLint `cf-mobile/no-truncated-record-text` must pass with no new
exemptions.

| Screen | Route | Components |
|---|---|---|
| Racks list (door from `/m/stock`, replaces the room-first labels door) | `/m/racks` | `MobileV2Shell` host bar; `MobileRecordCardList` of `MobileRecordCard` (identity `Rack 12`, timestamp = last moved, title = derived room/placement, detail = `5 shelves · 2 arrival`, status = tier summary); floating primary `New rack` (`DetailDock placement="float"`); room only as a filter chip, never a step |
| Rack record | `/m/loc/RK0012` (reuse `MobileV2LocationRecord`, rack branch) | `MobileV2DetailTopBar`; shelves as `MobileRecordCard` (identity `Shelf 3`, status tier with tone); `DetailDock` ≤3 verbs: primary `Print labels`, secondary `Move rack`, overflow `Add shelf`; tap shelf → shelf record (existing urgency fact + `LocationUrgencySheet`) |
| New rack | `/m/racks/new` | `MobileStepProgress`: **Place → Shelves → Review → Print**. Place = scan a room/floor label (`MobileV2ScanInput`) with manual pick fallback; Shelves = count stepper + optional per-shelf urgency; Review = `dryRun` codes as `MobileRecordCard`s; Print = progress + result. One primary verb in `DetailDock`, disabled label names what is missing |
| Move rack | `MobileV2ActionSheet` from the rack record (or scan a placard from `/m/scan` → record → Move) | Step 1 shows the rack + current placement; scan destination with `MobileV2ScanInput` (manual fallback through the same validation); result receipt with Undo (reversible move = receipt + undo, per SURFACE_LAW) |
| Print labels | reshape `/m/stock/labels` to **Rack → Shelves → Print** | reuse `MobileV2LocationLabelSteps` patterns: rack cards → selectable shelf cards (all selected; "Arrival shelves only") → print via `useLocationLabelPrint` |

Scan routing: a scanned `RK…` placard opens the rack record; a scanned shelf opens the shelf.
Arrival placement (`/m/r/[id]/place`) matches a scanned shelf through `normalizeShelfCode`
(`src/lib/receiving/arrival-shelves.ts`), which canonicalizes only the room-coded grammar and
otherwise compares the unwrapped code. Rack shelves therefore match once `routeScan` returns the
canonical `RK0012-03` for every spelling (dashed, undashed, GS1). Add a test for `RK001203` →
`RK0012-03`.

## 6. Desktop port (after the phone job is green)

Desktop consumes the same lib, API and job order. It may add density; it may not add a verb
the phone lacks (SURFACE_LAW §1, §4).

| Phone | Desktop |
|---|---|
| Racks list | Inventory › Locations: a `Racks` tool beside Manage, using the shared desk `RecordCard` (`src/design-system/components/record-card/RecordCard.tsx`) multi-height list, not a `DataTable` density=row grid |
| Rack record | desk record plane (`DeskRecordPlane`) showing the same shelves, tiers, placement and the same three verbs |
| New rack | the same four steps in a phone-width center column (SURFACE_LAW §4 frame law), or the desk form wrapping the same step model (`src/lib/locations/racks.ts`) |
| Move rack | same two-scan flow; desk adds keyboard/wedge entry of the destination |
| Print | `LocationsManagementTab` per-row Print + bulk print through `printLocationRowLabels` |

`RackDetailView.tsx` stops deriving the room from the code letter and reads the derived
placement.

## 7. Deletions (same change set, clean cutover)

- Room-first step and room grouping in `MobileV2LocationLabelFlow.tsx` / `MobileV2LocationLabelSteps.tsx` / `location-label-flow-model.ts`.
- Room-from-code-letter lookup in `RackDetailView.tsx`.
- Any new reader of `locations.room` text added after this handoff (use the derived room helper).
- Record a consolidation-ledger entry (`docs/design-system/consolidation-ledger.json`) for the
  remaining `locations.room` readers and the legacy room-coded builders
  (`expand-print-run.ts`, bin/rack label builders) with exit criterion "every location read derives
  its room from parent_id".

## 8. Phases

| Phase | Output | Depends on |
|---|---|---|
| 1 | `rack-code.ts` + routeScan branch + tests (no DB) | — |
| 2 | Migration (D4 + `location` entity type), applied with owner approval | Gate 0 |
| 3 | `racks.ts` + routes + tests with injected deps | 1, 2 |
| 4 | Print faces (placard, shelf) + tests | 1 |
| 5 | Mobile V2 screens (§5) + 390×844 screenshots | 3, 4 |
| 6 | Desktop port (§6) + deletions (§7) | 5 |
| 7 (optional, D3) | Adopt an existing aisle-bay into a rack: create the rack row, re-parent its shelves, keep or reprint their barcodes; stock untouched | 3 |

## 9. Definition of done

1. A rack is created on a phone, its placard and shelf labels print, and no label contains a room.
2. Moving the rack to another room with two scans changes only the rack's placement; scanning a
   shelf afterwards shows the new room; stock and urgency tiers are unchanged; no reprint.
3. `RK` codes route from raw, dashed, GS1 AI and Digital Link scans; existing `C0407300` /
   `C-04-07-3` labels still route; collision tests pass both ways.
4. Two organizations can each own `RK0001` (per-org uniqueness proven by a test against the
   unique indexes or a transaction-scoped DB smoke that rolls back).
5. Arrival placement onto a rack shelf and `/m/unbox` ordering work with rack shelves.
6. Every phone verb exists on desktop through the same lib/API; desktop adds no verb.
7. Events `location.rack.created|moved` and `location.labels.printed` are recorded with
   server actor and phone origin.
8. No truncated record text; `ds critique` clean on new UI files; nav-name law holds
   (`Racks` lane child must not repeat its parent's name).
9. `pnpm verify:fast` green, or every red gate attributed to another session's file with path.

## 10. Verification

- Unit (node:test, `--import ./scripts/register-server-only-shim.cjs`): rack-code grammar and
  collisions, routeScan rack branch, rack number allocation, move validation (destination kinds,
  cross-org refusal, idempotent `clientEventId`), face planning (placard vs shelf, tier caption).
- Live at `http://localhost:3050` with `tests/.auth/admin.json` (`cf_sid`), 390×844: screenshots of
  every §5 screen. Writes against the lane DB only inside a transaction that rolls back, or on
  explicitly synthetic rows that are deleted afterward and reported.
- Print transport stubbed in smoke; assert produced faces and payloads.

## 11. Out of scope

- Relabelling the existing 520 room-coded locations (phase 7 is opt-in per rack).
- Rack capacity planning, slotting optimization, floor maps.
- Changing stock, pick or pack logic.
- A second print transport or a second location list API.
