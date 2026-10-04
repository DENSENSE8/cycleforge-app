# Prompt — stock drill-down (room › aisle › bay) + the object-first delete list (2026-10-03)

Law you inherit (read first): `AGENTS.md` → `docs/mobile-first/SURFACE_LAW.md` (§4 frame law, §5
token families, §6 R1–R10) → `docs/mobile-first/V2_OBJECT_FIRST.md` (delete list, §4 Fitts budget,
§5 stock sheet, §6 picker) → `docs/design-system/CONSOLIDATION_LEDGER.md`.
Dev origin `http://localhost:3050` only; session `tests/.auth/admin.json`. Another session edits this
tree concurrently — re-read before every edit, never revert what you did not write.

> **Identity → evidence → next verb → progressive disclosure → receipt / undo**
>
> Show identity and the next physical action immediately. Reveal configuration only when the operator
> asks. Frequent verbs one-handed, scanning primary, manual entry always available, mistakes recoverable.

---

## 1. Owner ask (2026-10-03)

"This must also apply for stock as well, not just printing out labels. It must not display a long
monolithic list for stock. It must display a per room, then per aisle, then per bay drill down."

The location / bay label builder (`/m/labels`, `src/features/location-labels/`) already walks
Zone › Aisle › Bay › Level › Position with path chips. Stock must walk the warehouse the same way.

## 2. Delete list — audit against the code (one row per owner item)

| Pri | Delete | Replacement | State at handoff |
|---|---|---|---|
| P0 | Monolithic 86 %-height stock sheet | Compact `stock-position-sheet`, stages rest · adjust · move · more (`LocationStockPositions.tsx`) | **done** (D1) |
| P0 | Full-width Add photo button | Camera verb in the sheet's `DetailDock` | **done** (D1) |
| P0 | Delete button under every photo | Preview (hero + two tiles / `+N`) with no destructive control; delete only in `MobileSwipePhotoViewer` behind its armed second press | **done** (D5); "View all" gallery stage in the SAME sheet and `•••` › Manage photos **done** (D19) |
| P0 | Save beside the product title | `InlineEditableValue`: save on Return / blur, `Saving…` / `Saved` / inline error | **done** |
| P0 | "Editable CycleForge title…" copy | Nothing | **done** |
| P0 | Destination field in the resting sheet | Move stage: Scan destination (primary) + typed code beside it | **done** |
| P0 | Scan destination + disabled Move all footer | One Move verb; Move → Scan destination → `Move N to CODE` | **done** |
| P0 | Inline Move-or-split card | Quantity defaults to all; Split inside Move and in `•••` | **done** |
| P0 | Inline delete on-hold SKU | `•••` › last row › `ArmedDangerButton` | **done** |
| P0 | Fixed sheet heights | Content-sized Radix sheet, `SheetBody`, `DetailDock placement="sheet"` | **done** (D13) |
| P1 | A sheet opened over a sheet | In-sheet stages; full-screen viewer for photos | **done** (D14) |
| P1 | Previous / Next location arrows | Title → ordinal room picker | **done** (D15) |
| P1 | Edge swipe as the only sibling path | Picker; swipe is an enhancement with 24 px OS gutters | **done** (D15) |
| P1 | Codes in the primary header | Title · status · quantity · photo first; SKU / location in `•••` copy rows | **done** |
| P1 | Confirm dialogs for reversible edits | Commit + receipt + Undo (moves); autosave (title) | **done** |
| P1 | **`/m/stock` as one flat list of every location in a room, 50 per page behind Previous / Next** | **Drill-down: Rooms › Aisles › Bays › Locations (§3.1)** | **done** (D17) |
| P1 | No path from a location back up the hierarchy | Record subtitle path chips → the stock drill at that level (§3.2) | **done** (D18) |
| P2 | Generic "More settings" screens | Object-specific `•••` stages only | **done** for the stock sheet; hold the line elsewhere |
| P2 | Mobile / desktop forks | One tree + `MobileFirstFrame` (labels done, ledger `location-label-builder-forks` retired) | keep using the ledger |

## 3. Build

### 3.1 `/m/stock` drill-down (replaces the flat list + `RecordCursor` paging)

One screen, the level is the URL (hierarchical push: system Back and the path chips both go up):

| URL | Shows | Row → |
|---|---|---|
| `/m/stock` | Rooms (room facet: locations count). No stock query at this level | `?room=` |
| `/m/stock?room=R` | Aisles of R in order — `Aisle 03` · bays · units · SKUs · hold / cleanup marker; then one **Other locations** row for codes that are not room-coded (STORAGE-A, RK racks, unlocated) | `?room=R&aisle=3` (or `&aisle=other`) |
| `/m/stock?room=R&aisle=3` | Bays in order — `Bay 10 (Left)` · levels · units · SKUs · markers | `&bay=10` |
| `/m/stock?room=R&aisle=3&bay=10` | Locations in the bay, walk order (level, position) — face · units · SKUs · markers | `/m/loc/<code>` (back returns here) |
| `&aisle=other` | The non-room-coded locations of R | `/m/loc/<code>` |

- Path chips at the top (`Rooms › Zone 3 - Parts › Aisle 03 › Bay 10`), every finished chip jumps up.
  Same chip face as the label builder's `StepPills` (design-system `Button`, ≥44 px).
- Rows are full-width ≥48 px targets (F3), text wraps (no truncate — record display law), a chevron.
- Contextual search (the shell's search) escapes the hierarchy: inside a room any query lists the room's
  matching places flat; at the room level (no stock loaded) a typed or scanned code opens that location and
  words narrow the rooms. Clearing it returns to the level.
- Server: no `room` → room facets only (no 5000-row read). `room` → that room's rows; `aisle` numeric →
  the existing `aisle` filter narrows the server read. The room default redirect is deleted.
- Doors kept: Racks, Manage (with `bin.remove`), and **Print labels** → `/m/labels` (prefilled with
  the bay when one is open: `?code=` the bay's first location).
- Deleted: `PAGE_SIZE` paging, `RecordCursor` on this screen, the room chip strip (the room level replaces it).

### 3.2 Location record → up the hierarchy

`MobileV2LocationRecord` (room-coded codes only): a path row under the top bar —
`Zone 3 - Parts › Aisle 03 › Bay 10` — each chip opens `/m/stock?room=…&aisle=…&bay=…`. The title keeps
the lateral picker (D15); the path is the vertical one.

### 3.3 Photos: View all in the same sheet

`stock-position-sheet` gains a `photos` stage: the preview's `+N` / a "View all" control and `•••` ›
**Manage photos** open a grid of every photo inside the same sheet (Back in the dock); a tile opens the
full-screen viewer; delete stays in the viewer behind its armed second press (permanent →
confirm, never on dismiss). No second sheet.

## 4. Non-goals

No new stock read or schema; no change to `/api/transfers`, the viewer, or the label builder.

## 5. Acceptance (430×932 at `:3050`)

1. `/m/stock` shows rooms only; tap Zone 3 - Parts → aisles; Aisle 03 → bays; Bay 10 → its locations;
   a location opens `/m/loc/C0310300` and its X returns to Bay 10. No list longer than one aisle's bays /
   one bay's locations; no Previous / Next paging.
2. Path chips jump back to any level; system Back walks up one level.
3. Search "C0310300" lists that location inside Zone 3 - Parts, and opens it from the room level.
4. The location record shows the room › aisle › bay path; each chip lands on that drill level.
5. Stock sheet: `•••` › Manage photos and the `+N` tile open the in-sheet `photos` stage; exactly one
   `[role=dialog]`; the viewer opens over it and closes back to it.
6. `pnpm verify:fast` green except other-session failures; `ds_critique` clean on changed UI files;
   V2_OBJECT_FIRST §2 gains D17–D19 rows; SURFACE_LAW §8 stock row updated.
