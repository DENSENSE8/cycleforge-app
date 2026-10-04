# Mobile V2 — object-first law, delete list, Fitts budget

**Status:** binding for `/m/*` · **Owner ruling 2026-10-03:** simplify first
(delete list), then build. Dogfood: schema and query changes are in scope when
they make a phone screen faster.

> **Identity → evidence → next verb → progressive disclosure → receipt / undo**

A phone surface shows one object, the evidence that it is the right object, and
the next physical verb. Configuration, identifiers, and rare or destructive
verbs appear only when the operator asks for them. Frequent verbs are one-handed,
scanning is primary, manual entry is always one tap away, and every stored
mutation is reversible, validated, or confirmed.

This file extends [SURFACE_LAW.md](./SURFACE_LAW.md) and
[V2_ARCHITECTURE.md](./V2_ARCHITECTURE.md). Forks it retires are tracked in
[`consolidation-ledger.json`](../design-system/consolidation-ledger.json).

---

## 1. Baseline that drove the list (stock selection, 2026-10-03)

Measured at `:3050`, 430×932 viewport, `/m/loc/C0310300` → tap the first stock row.

| Moment | Requests on the critical path | Cost |
|---|---|---|
| Open a location | `GET /api/locations/C0310300`: three sequential `tenantQuery` calls (location, contents, LPNs) = 9 database round trips | 886–1568 ms for 1.5 kB |
| Same open, in parallel | `GET /api/locations`: every active location in the building, only to compute Previous / Next | 434–576 ms, 127.7 kB |
| Tap a stock row | `GET /api/sku-stock/[sku]`: six queries plus an Ecwid HTTP call (5 s timeout); the sheet reads only `photos` | 819–843 ms |
| The sheet itself | 86 dvh form: Add photo, title + Save + helper copy, photo strip with a Delete under every thumbnail, Move-or-split card with slider and destination field, Set exact count card, Scan for rapid ± changes, inline Delete on-hold SKU, footer Scan destination + disabled Move all | six jobs in one surface |

---

## 2. Delete list (ranked by ROI = removed weight × inverse risk)

`done` = deleted in the 2026-10-03 pass. `queued` = ledger entry with an exit
criterion; build nothing new on top of it.

| # | Delete | Replacement | State |
|---|---|---|---|
| D1 | The monolithic stock sheet in `LocationStockPositions.tsx` (Add photo slab, title Save + "Editable CycleForge title…" copy, Move-or-split card, resting destination field, Set exact count card + its copy, "Scan for rapid ± changes", inline delete section, two-button footer) | Compact stock position sheet (§5): identity header, evidence preview, one dock — Camera · Adjust · Move | done |
| D2 | `GET /api/sku-stock/[sku]` on every row tap (six queries + Ecwid) | `photoIds` per content row in `GET /api/locations/[barcode]`; zero requests on tap | done |
| D3 | `GET /api/locations` (whole building, 128 kB) on every location open | `walk { position, total, previous, next }` in the same location payload | done |
| D4 | Three sequential `tenantQuery` reads (9 round trips) in the location GET | Parallel `tenantQueryOneTrip` reads keyed by barcode (one round trip of latency) | done |
| D5 | `SkuLinkedPhotoStrip`'s bespoke `<a target="_blank">` tiles, a Delete button under every thumbnail, and its `/api/sku-stock` fetch | Pure preview over the record's `photoIds`; tiles open the phone viewer (`MobileSwipePhotoViewer`: swipe paging, pull-down dismiss); delete lives only in the viewer behind its armed second press | done |
| D6 | Four hand-rolled `fetch('/api/transfers')` writers (`LocationStockPositions`, `MobileScanIdentify`, `StockLedger`, `BinRowDetailsSheet`) | `src/lib/inventory/stock-transfer-client.ts` — one writer; phone moves end in a receipt with Undo (reverse transfer) | done |
| D7 | Source-text tests that pinned implementation: `mobile-on-hold-stock-contract.test.ts` (test ids, `enterKeyHint`, ref names) and `api/transfers/route.test.ts` (regexes over SQL text and `writeLedgerDelta(` counts) | Nothing; behaviour is proved against the running app | done |
| D8 | `/m/stock/detail` running the full room stock query (≤1000 rows) to issue one redirect | Point lookup of the row's location barcode | done |
| D9 | Correlated `serial_units.current_location` scans in `getStockByLocation` (no index): 223 ms of DB time per `/m/stock` load | `idx_serial_units_org_current_location` (0.8 ms) | done |
| D10 | Desk-dense `StockQtySlider` (32 px steppers + slider) on the phone, and the one-off `FnskuCopiesStepper` | `TouchQtyStepper` (design system, `min-h-mode-hit-cta` cells) for count, split, and label copies; `FnskuCopiesStepper.tsx` deleted | done |
| D11 | Stale `mobile-sheet-roles.ts` gate reference in SURFACE_LAW §7 (gate deleted in 270795058) | Text removed | done |
| D12 | `transferBinQty` as 8 sequential statements (~85 ms each) plus realtime publish and `inventory_events` awaited before the response: 1.8–3.2 s per move | One data-modifying statement in the tenant transaction; fan-out and the activity event in `after()`: 0.56–1.0 s, same 200 / 404 / 409 contract | done |
| D13 | Two phone sheet systems: Radix `ui/sheet` (V2 record sheets with fixed `h-[82–92dvh]`) and house `BottomSheet` (43 consumers) | One Radix sheet (owner ruling 2026-10-03): `SheetContent side="bottom"` content-sized by default, `size="full"` for full-screen tasks, `SheetBody` scroll region, `DetailDock placement="sheet"` floor; `BottomSheet.tsx` deleted, 43 consumers moved, `ConfirmSheet` → `src/components/ui/ConfirmSheet.tsx`; 0 `SheetContent` with fixed `h-[NNdvh]` | done (ledger `mobile-sheet-systems` retired) |
| D14 | Child "More actions" sheets opened over a record sheet (Allocate, location LPN sheet) | An in-sheet stage with Back, as the stock sheet does. Allocate: one staged sheet, photo in `MobileSwipePhotoViewer`, paperwork inline (`MobileV2OrderPaperworkPanel`) — exactly one `[role=dialog]` in every stage at 430×932. Location record: every sheet opens from the page; the LPN sheet's verbs navigate, none opens a sheet | done |
| D15 | Previous / Next arrows and edge swipe as the only way to reach a sibling location | Tappable location title → ordinal location picker (§6); `DetailDock`'s `cursor` prop deleted with its last consumer | done |
| D16 | App-shell fan-out on every `/m` open: `print-stations` ×2, `inbox/tech-queue` (≈1 s), `inbox/support`, `staff-messages`, `station-commands/aliases` before the record arrives | Lazy-load per surface; the record read goes first. Cold `/m/loc/C0310300` at 430×932: 14 → 10 requests (non-touch), 9 on a touch phone; inbox ×3 and aliases no longer fire on `/m` (aliases load with a station scan bar or on an unknown `CMD-*` scan); `print-stations` once, after idle, and not at all on a phone with no paired printer | done |
| D17 | `/m/stock` as one flat list of every location in a room (up to 5000 rows read, 50 per page behind Previous / Next `RecordCursor`, a room chip strip, a default-room redirect) | Drill-down Rooms › Aisles › Bays › Locations (§8): one short ordered list per level, `PathChips` up the hierarchy, the room level reads only the room facets | done |
| D18 | No path from a location back up the warehouse | `PathChips` under the record bar: room › aisle › bay › level, each opens that drill level (the title picker stays the lateral move) | done |
| D19 | Photos only reachable one at a time through the viewer | In-sheet `photos` stage (grid of every photo) from the preview's `+N` tile or `•••` › Manage photos; Back · Add photos in the dock; delete stays in the viewer behind the armed press | done |

### Refactor list (keep the behaviour, change the owner)

| Refactor | Why |
|---|---|
| `LocationQtyStrip` + `TakeReasonChooser` move under the sheet's **Adjust** stage; the strip's duplicate identity band (thumb, title, SKU, On hold) is deleted | Counting is a task, not a resting state; identity has one owner, the sheet header |
| Split is a `TouchQtyStepper` inside **Move**, opened on request | Default quantity is all; a slider is a steering task (§4 F7) |
| Manual destination entry lives inside **Move** beside Scan | Scan-first, manual-always (§3) |
| On-hold title editing = tap the title (save on blur / Return / dismissal) | No Save CTA, no helper copy |
| Delete placeholder = `•••` → last row, `ArmedDangerButton` | Rare and irreversible: far, small, armed |

---

## 3. Behavioural roots (contracts, not components)

| Root | Law | Repo owner today |
|---|---|---|
| ObjectIdentity | One clearly identified object per surface; human title first, codes on request | Sheet header / `MobileV2DetailTopBar` |
| ActionPriority | One primary verb, ≤2 supporting verbs, the rest disclosed | `DetailDock` |
| CompactRecordSheet | Content-sized; grows by stage; never a miscellaneous form | Stock position sheet (§5) |
| BottomActionDock | Thumb reach, safe-area aware, non-sticky inside a sheet; floating buttons — no ground, no rule, `ACTION_DOCK_TOP_GAP` above and `ACTION_DOCK_LIFT` below (owner 2026-10-03) | `DetailDock placement="sheet"` |
| OverflowCommands | Rare contextual verbs; destructive last | In-sheet `•••` stage |
| EvidencePreview | Existence + count of evidence; no editing controls | `SkuLinkedPhotoStrip` (preview face) |
| EvidenceViewer | Viewing, paging, deletion | `MobileSwipePhotoViewer` |
| ScanOrEnter | Scan and typed entry reach the same server validator and audit | Move stage + `/m/scan?intent=location` |
| OrdinalLocationPicker | Physical order, not page numbers | `MobileV2LocationPicker` + `GET /api/locations?room=` (§6) |
| InlineAutosave | Saving… / Saved / inline error; no Save button | On-hold title |
| OperationalTransaction | Actor, source, destination, qty, idempotency key, reversal | `/api/transfers` + `stock-transfer-client.ts` |
| RiskPolicy | Safe edits autosave; reversible mutations commit with Undo; irreversible actions confirm | §7 |
| AdaptivePresentation | Same states and API contract on web, SwiftUI, Compose | `docs/mobile-first/swiftui/` |

**Scan-first, manual-always.** A typed code is not a degraded scan. Both paths
commit through `postStockTransfer` → `POST /api/transfers`: same permission
(`bin.adjust`), same idempotency key, same ledger and `inventory_events` row.
The scanned path additionally verifies the label at `/api/locations/[code]/verify`
before committing; the typed path is validated by the transfer itself (an
unknown code is a 404 with the server's message, shown inline).

---

## 4. Fitts budget (binding for every `/m` verb)

Movement time $MT = a + b \log_2\left(\frac{D}{W} + 1\right)$. On a phone, $D$
is measured from the **previous touch**, not from the screen centre, and the
thumb rests in the bottom third. Every rule below lowers $D/W$ for frequent
verbs or raises it on purpose for dangerous ones.

| Rule | Law |
|---|---|
| F1 Frequency × distance | The most frequent verb of a stage has the largest target and the shortest reach: the full-width primary on the safe-area floor (`DetailDock` sheet primary, `size="xl"`). Supporting verbs sit directly above it. |
| F2 Sequence adjacency | The control that finishes step *n* sits where step *n + 1* begins. Row tap opens a sheet whose dock is under the same thumb; **Move** becomes **Scan destination** in the same cell; the receipt's **Undo** appears at the bottom. |
| F3 Minimum width | Coarse pointers: `--mode-hit` 48 px, `--mode-hit-cta` 48–56 px. Icon-only: `IconButton size="touch"` (44 px) is the floor (WCAG 2.5.5). The whole row is the target, never its chevron. |
| F4 Inverse Fitts for destruction | Irreversible verbs get a *long* reach and a deliberate second press: `•••` → last row → `ArmedDangerButton`. Never adjacent to the primary, never in the dock. |
| F5 Corners are for rare verbs | Top corners hold close and `•••` only. No frequent verb in the top quarter of the screen. |
| F6 Zero-distance input | Scanning removes target acquisition; identifiers are scanned first. Manual entry is one tap away in the same stage. |
| F7 Steering | No precision tunnels: no actionable horizontal strip inside a vertical scroll, no slider as the only quantity input. Steppers with 48 px cells and a keypad; slider only for an optional split. |
| F8 Hick–Hyman | ≤3 visible verbs per stage; each stage shows only its own choices. |
| F9 Edges belong to the OS | No custom edge swipe as the only path (iOS back, Android system gestures). Swipe may enhance a visible control. |
| F10 Keyboard and focus | Content-sized sheets; no fixed `h-[NNdvh]`. A focused field and the dock stay above the virtual keyboard (WCAG 2.4.11). A typed code commits from the keyboard's own **Go** key (`enterKeyHint="go"`) — the nearest target while typing. |
| F11 Recovery is movement time | Undo within reach beats a confirm dialog for reversible work: one tap vs. two plus reading. |
| F12 Budget | Every job documents taps + scans. Stock selection: *Move all* = row → Move → scan (2 taps + 1 scan); *Add photos* = row → Camera (2 taps); *Count +1* = row → Adjust → + (3 taps). |

---

## 5. Stock position sheet (the first V2 surface on this law)

`src/components/mobile/location/LocationStockPositions.tsx`. One Radix sheet,
content-sized, one stage at a time; no sheet is ever opened over it.

| Stage | Body | Dock (secondary · primary) |
|---|---|---|
| `rest` | Thumbnail · title (tap to rename when on hold) · On hold · quantity · `•••`; evidence preview (hero + two tiles or `+N`) | Camera · Adjust · **Move** |
| `adjust` | Scan-backed: take reason + `LocationQtyStrip` (± bursts, 123 keypad). Manual: `TouchQtyStepper` | Scan-backed: **Done**. Manual: Back · **Set count to N** (disabled reads `Count is N`) |
| `move` | "Moving all N" + Split (→ `TouchQtyStepper`, 1…N); "Or type a location code" | Back · **Scan destination** → becomes **Move N to CODE** when a code is typed |
| `more` | Split quantity · Edit title (on hold) · Manage photos (when there are any) · Copy SKU · Copy location · Product, history and locations (`/m/products/[sku]`) · Delete placeholder (last, armed; disabled until the count is 0) | Back |
| `photos` | Every photo as a grid (from the preview's `+N` tile or `•••` › Manage photos); a tile opens the viewer | Back · **Add photos** |

Photos: a preview or grid tile opens the phone's full-screen swipe viewer (paging,
pull-down or Dismiss to close; delete only for on-hold stock). The sheet ignores
outside presses and Escape while the viewer is open, so the viewer never
dismisses the record under it.

Receipts: `Moved N to CODE` + Undo (reverse transfer, new idempotency key).
Count changes keep their existing toast. Photo deletion stays an armed
confirmation because `DELETE /api/photos/[id]` is permanent.

---

## 6. Ordinal location picker (D15)

The location title opens an ordered picker of the current room (aisle → bay →
rack → shelf → bin): current row centred and selected, code search, recents,
switch in place. Lateral moves (Bay 2 → Bay 3) use the picker; drilling
(room → aisle) is navigation. The `walk` block on the location payload is the
seed; the picker reads the room's ordered list on open, not on page load.

- Title: `MobileV2DetailTopBar onTitlePress` — the whole title block is one
  ≥44 px control with a chevron-down.
- Picker: `src/components/mobile/v2/stock/MobileV2LocationPicker.tsx`, one
  content-sized Radix bottom sheet, mounted only while open. Rows are 48 px,
  grouped under sticky aisle headers, each with its loose units and LPN count.
  Search ignores case and separators and accepts a scanned (GS1-wrapped) code;
  the keyboard's Return opens the first match. Recents are the last locations
  this tab opened (sessionStorage `cf:m-location-recents`).
- Read: `GET /api/locations?room=<room>` → `{ room, locations: [{ barcode,
  name, face, units, lpns }] }` in walk order (same filter and order as `walk`);
  the unfiltered `GET /api/locations` response is unchanged.
- Swipe: the page follows the finger and the neighbour's code peeks in from
  that side; past 28 % of the width or a flick (> 500 px/s) commits and the
  neighbour slides in, otherwise it springs back. The neighbour's record is
  prefetched while the finger is down. Touches that start within 24 px of
  either screen edge (F9), on a control, or on the filter strip are not walks.

---

## 7. Risk policy

| Change | Policy |
|---|---|
| Rename an on-hold product | Autosave on blur / Return / sheet dismissal |
| Count ± | Burst commit with the existing pending line and cancel |
| Move stock | Commit, then receipt + Undo (reverse transfer) |
| Delete a photo | Armed second press in the viewer (permanent) |
| Delete an on-hold placeholder | `•••` → armed second press; server refuses while stock remains anywhere |

---

## 8. Stock drill-down (D17, D18)

Owner 2026-10-03: stock is never one long list. `/m/stock` walks the warehouse
the way it stands — the same address path the label builder (`/m/labels`) uses.

| URL | Level | Row → |
|---|---|---|
| `/m/stock` | Rooms (room facets only — no stock read) | `?room=` |
| `?room=R` | Aisles in order (bays · units · SKUs · hold / cleanup), then **Other locations** for places that are not room-coded (racks, totes, staging) | `&aisle=N` / `&aisle=other` |
| `?room=R&aisle=N` | Bays in order, `Bay 10 (Left)` (levels · units · SKUs) — the server read narrows to the aisle | `&bay=N` |
| `?room=R&aisle=N&bay=N` | The bay's locations in walk order (level, position) | `/m/loc/<code>`, whose X returns here |

- `PathChips` (design system) head every level: `Rooms › Zone 3 - Parts › Aisle 03 › Bay 10`; system Back
  walks up one level. The location record carries the same chips (room › aisle › bay › level) as its
  vertical path; its title picker (§6) is the lateral one.
- The shell's search escapes the hierarchy: inside a room it lists the room's matching places flat; at the
  room level a typed or scanned code (`C-03-10-3`, `C0310300`, GS1) opens that location.
- Doors: Labels (`/m/labels`, prefilled with the open bay), Racks, Manage (`bin.remove`).
- Model: `src/lib/inventory/stock-drill.ts` (pure folds over `summarizeStockLocations`).
