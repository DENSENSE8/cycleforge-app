# HANDOFF — Labels & docs: print stations, bulk uploads, quality of life (written 2026-09-27)

Paste the **Prompt** block at the bottom into a fresh session. Everything above it is ground truth
read from the working tree on 2026-09-27. Other sessions edit this worktree concurrently — re-read
every file right before you edit it, never revert what you did not write, never commit or stage
without asking. Dev origin `http://localhost:3050` only (`AGENTS.md` §1).

## 1. Owner rulings this pass encodes (2026-09-27)

1. **One view.** Labels & docs is a fixed-width split: a narrow card rail at the left, the open
   order's documents at the right. No In place / Split / fullscreen toggle (landed — see §2).
2. **Two print stations, two stocks.** Labels and paperwork print at DIFFERENT stations at different
   sizes: one identified station for **4×6 labels** (thermal), one identified station for **packing
   slips + manuals** (letter / A4). Every print on this desk names which station it goes to, and a
   bulk print splits by stock and sends each stock to its own station in one press.
3. **Bulk intake for both stocks.** Bulk upload of shipping-label PDFs (exists) AND bulk upload of
   packing slips, matched to their orders without opening each order.
4. Keys teach on hover only, in a bubble OUTSIDE the control (`HotkeyScrim`, landed).
5. **Views are print jobs, one station each (owner 2026-09-27).** The sidebar views — today
   To print (`1`) · Printed (`2`), bare-digit view keys via `viewKeys: true` — become three:

   | Key | View (sidebar child) | Queue | Station · stock |
   |---|---|---|---|
   | `1` | **Labels** (`labels`, bare route) | every stored shipping label not yet printed | label station · 4×6 |
   | `2` | **Paperwork** (`paperwork`, `?view=paperwork`) | packing slips AND manuals not yet printed — ONE view, slips and manuals together per order | paperwork station · letter |
   | `3` | **Printed** (`printed`, `?view=printed`) | print history of both, newest first, each print naming its station | — |

   A view prints ONLY its own stock: Print all on Labels sends labels to the label station; Print
   all on Paperwork sends slips + manuals to the paperwork station. The documents pane of an open
   card shows only that view's documents (Labels: the order's labels; Paperwork: its slips and
   manuals). No mixed-stock print from a single press except an explicit "Print order (labels +
   paperwork)" verb on the open card, which still splits by station.
6. **Record header: no ✕, Print is the top-right CTA (owner 2026-09-27).** The open card's header
   reads, left to right: title (order number) · … · `1 of 49` · **Print** (ink CTA, the last and
   right-most control). No close ✕ — the rail always has an open card, so there is nothing to
   close to; Esc still leaves a text field but never empties the pane.

## 2. What exists now (landed this pass, uncommitted)

The desk (`/shipping/label-intake`, now under `src/app/shipping/(desk)/label-intake/page.tsx`):
- Contextual sidebar page (`rollout.ts` `contextual`): views **To print** (`pending`) · **Printed**
  (`record`, `?view=record`), Find (desk store), header verbs Print all labels (⌘P) / Upload label
  PDFs (⌘O) as nav intents `labels-docs:print-all` / `labels-docs:upload`
  (`NAV_PAGE_DECLS['label-intake']`, `parity.ts`, `nav-view-icons.ts`).
- `src/features/labels-docs/LabelsDocsDesk.tsx` hosts `TriageCardList` with `record.rail` →
  `DeskRecordPlane listRail` (22rem rail + record). Stage pinned to `in-place`; `TriageSelectBar`
  `viewControls={false}`; no view switch in the record header.
- One card per ORDER (`label-card-model.ts` `labelBands` / `labelCardKeyOf`): order number top-left
  in `OrderNumberIdentity` (platform brand dot to its left), `×qty title` lines, "N labels" when an
  order ships several. Titles come from `print-queue.ts` (order lines via `skuCatalogJoinOnSql` →
  `resolveSkuIdentityTitle`). Order `100618` is genuinely titleless in `orders` (no title, no SKU)
  → "Untitled item".
- The open card's documents (`use-desk-documents.ts`): every label of the order + packing slips +
  manuals; checked ones print with Enter / the header Print.

Print pipeline (keep; one pipeline):
- `src/lib/label-prints/print-route.ts` — `PrintStock = 'label' | 'paper'`, `STOCK_PAPER`,
  `resolvePrintRoute({ stock, silent, profiles, routedProfileId, host })` → thermal USB/serial ›
  desktop host › browser dialog.
- `src/lib/label-prints/print-labels.ts` — `printDocuments(docs, routeFor, onProgress)`: groups by
  stock, one route per stock, logs LABEL prints to `label_print_events` as one batch.
- `src/lib/label-prints/label-raster.ts` — PDF/image → pages on the stock at 203 dpi,
  `disableFontFace: true` (the USPS "G" fix).
- `src/lib/print/browserPrint.ts` — per-BROWSER printer profiles (`PrinterRole = 'label' | 'paper' |
  'receipt'`), `getRouting()` / `setRoute(role, profileId)`.
- `src/lib/print/print-station.ts` — this computer's named **print station** (`readPrintStation`,
  `setPrintStationName`, remembered target station), and `src/lib/print/staff-print-bridge.ts` —
  realtime jobs to a named station (`StaffPrintRole = 'label' | 'paper'`,
  `StaffPrintPaperDocument = 'shipping_label' | 'packing_slip' | 'manual'`, progress/status events).
  **This is the seam to extend — do not invent a second station model.**
- `src/features/labels-docs/PrinterConnectCard.tsx` — today configures THIS browser's thermal label
  printer + the silent switch only.
- Server logging: `label_print_events` (labels only). Paperwork prints are not logged here;
  `document_print_jobs` (`src/lib/documents/document-print-jobs.ts`) logs To-ship paperwork.

Uploads:
- Labels: `uploadLabelPdf` (`src/lib/label-ingestions/http-client.ts`), multi-file + drag-drop on
  the desk; one PDF = one ingestion (no batch splitter).
- Packing slips / manuals: per order only, `useOrderPaperworkActions(orderId).upload`
  (`src/lib/orders/order-paperwork-client.ts`) from `PaperworkIntakeCard` on the open card.

## 3. What to build

### 3.0 Three views by print job (ruling 5) — do this first
- Sidebar: `SIDEBAR_PAGE_NAV` `label-intake` children become `labels` · `paperwork` · `printed`
  (today `pending` "To print" · `record` "Printed"); `resolveChild` reads `?view=`; the word
  "Pending" stays banned in sidebar copy (`resolve.test.ts` "Picking replaces Pending"). Update
  `NAV_PAGE_DECLS['label-intake'].items`, `parity.ts` view rows, `NAV_VIEW_ICONS`
  (`label-intake.labels` Printer, `.paperwork` FileText, `.printed` History), and
  `src/lib/triage/views/label-intake.ts` — one `TriageViewDecl` per view (unique test id prefixes /
  storage keys; `triage-views.test.ts` enforces).
- Keys: `viewKeys: true` already maps bare `1`–`9` to the painted view order — the order above
  IS the key map (1 Labels · 2 Paperwork · 3 Printed). Confirm in the `?` sheet.
- Server: `/api/v1/label-prints` `view` enum (`LABEL_PRINT_VIEWS` in `contracts.ts`) becomes
  `labels | paperwork | printed`. Labels = today's pending query. Paperwork = paired orders with at
  least one printable packing slip or stored manual not yet printed (needs paperwork print logging,
  §3.1) — one card per order, its documents = slips + manuals. Printed = union of label prints and
  paperwork prints, newest first. Regenerate OpenAPI (`docs/openapi/cycleforge-v1.json`).
- Desk: `LabelsDocsDesk` picks the view's stock; `useDeskDocuments` returns only that view's
  documents; Print all / Enter / the check-set verb print that stock to its station. The card
  anatomy stays (order number top-left, products beneath).
- Grain differs per view: Labels rows are label ingestions (today's `LabelPrintRow`, grouped per
  order); Paperwork rows are ORDER DOCUMENTS (`documents` packing_slip rows + stored manuals
  resolved for the order) — its own server read and card model, one card per order, lines = its
  products as today. Printed reads both logs.
- Retire today's ids cleanly: `pending` → `labels`, `record` → `printed` (plus new `paperwork`) in
  `SIDEBAR_PAGE_NAV`, `NAV_PAGE_DECLS.items`, `parity.ts` (update the source text too),
  `NAV_VIEW_ICONS`, `triage/views/label-intake.ts`, `LABEL_PRINT_VIEWS` and every `?view=record`
  link (grep `view=record`, `'record'` in `src/features/labels-docs`). No zombie view ids.

### 3.0b Record header (ruling 6)
- `DeskStageRecordHeader` (`src/design-system/components/DeskStageOverlay.tsx`) paints actions,
  then `n of N`, then ✕. On a rail desk (`DeskRecordPlane listRail`) reorder to `n of N` · actions
  and omit the ✕ — additive and default-off: gate on the plane's existing `listRail`, never change
  the order for other desks. Keep `onClose` wired for Esc-from-text-field only; the host's
  `closeLabel` stays for the auto-open `dismissed` path, or delete that path if nothing can
  dismiss anymore.
- Prove on :3050: header right edge is the Print CTA; `1 of 49` sits immediately left of it; no
  element with the close aria label in the record header.

### 3.1 Two identified print stations (labels · paperwork)
- A station **identity per stock**: which named print station receives 4×6 labels and which
  receives paperwork. A station may be this computer (local thermal / desktop host / dialog) or a
  remote named station reached through `staff-print-bridge` (the Floor-to-station path already used
  by rack / bin / papers jobs). Read `print-station.ts` + `staff-print-bridge.ts` end to end first,
  and how `papers` jobs are claimed (`runPrintJobOnce`).
- Settings home: the org's station registry if one exists (search `print_station` / station
  settings in `src/lib/settings/registry.ts`); otherwise per-workstation choice stored with the
  existing print profile store. Decide with the owner if the stations must be org-wide (preferred —
  every desk prints to "Label printer · Packing bench" by name).
- Desk surface: the `Printers` record group becomes **Print stations** — two rows,
  `Labels → <station> · 4×6` and `Paperwork → <station> · Letter`, each with a picker and a live
  status dot (online / offline / last job). The record's Print verb and the header Print all show
  where each stock goes in their `HotkeyScrim` bubble / notice.
- `printDocuments` routes each stock to ITS station: `routeFor(stock)` resolves to a station, and
  a remote station gets one bridge job per stock (labels batch; paperwork batch), with progress.
- Log every print with its station: add `station_id` / `station_name` to `label_print_events`
  (migration via the `db-migration-author` skill), and log paperwork prints (§4 carry) — either in
  `document_print_jobs` or a sibling — so the Printed view can say "Label → Thermal bench,
  Slip → Packing bench".

### 3.2 Bulk print by stock
- Header split CTA: **Print all labels** (label station) · **Print all paperwork** (paper station)
  · **Print all (labels + paperwork)**; the check-set bar gets the same three verbs (Law 5, same
  verbs at 1 and N) scoped to checked cards.
- Paperwork in bulk needs each checked order's packing slips: batch-read the order documents
  (`/api/orders/{id}/documents`) or add one server read that returns slips for many orders; never
  N sequential fetches on the client for 100 orders.
- Order of output: labels in card order; paperwork in the SAME card order so a packer can marry
  label ↔ slip by position. Print a one-line batch header sheet only if the owner asks.

### 3.3 Bulk uploads
- **Labels** (exists): keep; add per-file result rows (added / already on file / failed) in a
  transient upload tray instead of one notice string; add a **batch-PDF splitter** (one ShipStation
  multi-label PDF → one ingestion per page) — needs a PDF writer (`pdf-lib`), owner approval for
  the dependency.
- **Packing slips** (new): drop N PDFs on the desk (or a paperwork drop zone); match each to its
  order by (a) filename containing the order number, (b) text extracted from the PDF (pdf.js
  `getTextContent`, already loaded) matching an order number / marketplace ref, (c) manual pick for
  the rest. Show a review tray: file → matched order (platform + number) → confirm all. Writes go
  through the existing per-order slip upload (`/documents/upload`) so the order record, audit and
  realtime stay the one writer. Unmatched files never attach silently.

### 3.4 Quality of life (pick with the owner; each small)
- Card: printed state as a quiet check on the card in To print after a print (before the refetch
  moves it to Printed), and a reprint count in Printed.
- `P` on a hovered / open card prints that card; `Shift+P` prints the check-set (verify against
  `NavGoKeys`, segment chords and the card keys X / Space / J / K before binding).
- Keep the preview on the label when the open card changes by J/K (today it resets to doc 0 —
  correct), but remember the paperwork checkboxes per order across a session.
- "Missing slip" chip on a card whose order has no packing slip (count in the pairing chip row:
  All · No order · Paired · **No slip**), so bulk paperwork never silently skips an order.
- Empty-state action: "Upload label PDFs" / "Upload packing slips" buttons in the all-clear.
- Station offline → the Print verb says so and offers the dialog fallback in one click.

## 4. Open items carried from `HANDOFF-labels-docs-split.md` §4 / §6
- Uploaded PDF labels without a ShipStation shipment id cannot be paired (needs a writer).
- Paperwork prints are not logged (folded into §3.1 here).
- Multi-label batch PDF uploads as one ingestion (folded into §3.3).
- Tauri must register `cf_print_html`; Electron shell is not in this repo.
- First real 4×6 thermal print not observed (raw path rotates 180°).
- `pinned.json`: `DeskRecordPlane listRail`, `TriageRecordSlot.rail`, `TriageSelectBar
  viewControls` and the label family once a second desk uses them.

## 5. Verification
- `npx eslint --quiet <files>`, `npx tsc --noEmit -p tsconfig.json` (`src/lib/auth/pin.ts` is
  another session's red), `node --import tsx --import ./scripts/register-server-only-shim.cjs
  --test src/features/labels-docs/*.test.ts src/lib/label-prints/*.test.ts src/lib/triage/views/*.test.ts
  src/lib/nav/context/*.test.ts`, `pnpm verify:fast`.
- Live on :3050 with Playwright, one sign-in saved to `/tmp` storageState. Intercept every write
  (`page.route`) — never print, pair or upload real dogfood labels; to prove a bridge job, stub the
  bridge publish and assert the payload (station id, stock, document ids, order). Prove: two
  stations shown and pickable; a mixed bulk print produces exactly one label batch → label station
  and one paperwork batch → paper station, in card order; a bulk slip drop of 3 files lands in the
  review tray with correct order matches and one explicit unmatched. Delete throwaway probes.

## 6. Outcome (2026-09-28)

Owner decisions: stations are per-staff (existing bridge roster) AND an org registry, both built;
`pdf-lib` approved. Built in order §3.0 → §3.3; §3.4 proposed, not built.

- **Views** `labels` (bare) · `paperwork` · `printed` in `src/lib/sidebar-navigation.ts`,
  `NAV_PAGE_DECLS['label-intake']` (per-view split CTA: `labels-docs:print-labels` ⌘P /
  `:print-paperwork` ⌘P on Paperwork / `:print-all` / `:upload` ⌘O / `:upload-slips`), `parity.ts`,
  `NAV_VIEW_ICONS`, `LABEL_INTAKE_{LABELS,PAPERWORK,PRINTED}_VIEW`. Server: `listPrintDeskQueue`
  (`print-queue.ts`) — discriminated `LabelPrintQueue`; Paperwork = one `PaperworkPrintRow` per paired
  order, slips + manuals resolved in one statement. Log: `label_print_events.station_id/_name`, new
  `paperwork_print_events`, `POST /api/v1/paperwork-prints` (migration `2026-09-28_print_station_logs`).
- **Desk** rows/cards: `src/features/labels-docs/desk-rows.ts` (`DeskRow`: label rows keep their
  ingestion id, paperwork rows the NEGATED order id; Printed marries both on one order card).
  Presses: `desk-press.ts` `planPress` (per stock: this computer → `printDocuments`; another station
  → bridge jobs of ≤ `MAX_STATION_DOCUMENTS`; blocked → says why), `marryByCardOrder` (paperwork in
  label card order). Check-set verbs: Print labels · Print paperwork · Print both.
- **Record header**: `DeskStageRecordHeader rail` (from `DeskRecordPlane listRail`) paints
  `n of N` then the verbs, no ✕; the desk's close is a no-op (Esc never empties the pane).
- **Stations**: `print_stations` registry (migration `2026-09-28s_print_stations`, heartbeat from
  `StaffPrintBridgeMount`, org assignment columns, `PUT /api/v1/print-stations/assignment` needs
  `settings.hardware`), org channel `org:{id}:printstation:{stationId}` (token grant with
  `print.label`), bridge grain `documents` (ids only; the station rebuilds URLs and runs the one
  pipeline, logging with its own station). Desk hook `usePrintStations`; card `PrintStationsCard`.
- **Uploads**: `upload/` — label tray with pdf-lib page splitter; slip matcher (filename › PDF text ›
  manual pick) with a review tray; slips file through `uploadOrderDocument`.

Proved live on :3050 (all writes intercepted, Ably print-station publishes captured and dropped):
header right edge is Print with `1 of 49` left of it and no Close; keys 2/3/1 switch views; two
stations shown and pickable; checking 3 cards and Print both produced exactly one `documents` job
(3 labels, card order) → Thermal bench and one (2 slips, same order) → Packing bench; 3 slip files →
2 matched (filename, PDF text) + 1 "No order named — pick one", Confirm all held; a 2-page label PDF
→ two uploads `-p1` / `-p2`. Printed rendered from a synthesized log (dev has 0 prints).

Still open: a real two-browser station round trip (ack + print) is unobserved; first real 4×6
thermal print (raw path rotates 180°); Tauri `cf_print_html`; unpaired PDF labels without a
ShipStation id cannot be paired; `pinned.json` entries for `listRail` / `viewControls` / the label
family; `package-lock.json` not updated beside `pnpm-lock.yaml` for pdf-lib.

---

## Prompt

You are continuing the CycleForge **Labels & docs** desk (`/shipping/label-intake`) in
`/home/michaelgarisek/Projects/cycleforge-lanes/prod`. Read `AGENTS.md`, then
`docs/design-system/HANDOFF-labels-docs-print-stations.md` (this file) end to end, then
`docs/design-system/HANDOFF-labels-docs-split.md` §6 and `HANDOFF-paperwork-print-shipstation.md`.

Owner rulings: the desk is one fixed-width split (rail left, documents right; no view toggle —
already landed). Labels and paperwork print at **two different identified print stations** at
different sizes: one station for 4×6 labels, one for packing slips / manuals. Every print names its
station; a bulk print splits by stock and sends each to its own station in one press. The sidebar
views are the print jobs, under bare keys **1 Labels · 2 Paperwork · 3 Printed** — Labels prints
only 4×6 labels to the label station; Paperwork holds packing slips AND manuals together (one view,
one card per order) and prints them to the paperwork station; Printed is the history of both. Add
bulk upload for packing slips (matched to orders, reviewed before attaching) beside the existing
bulk label upload. Keys teach on hover only (`HotkeyScrim`, a bubble outside the control). The
open card's header has no ✕: `1 of 49` then the **Print** CTA, right-most.

Extend the existing print-station seam (`src/lib/print/print-station.ts`,
`src/lib/print/staff-print-bridge.ts`) and the one print pipeline
(`src/lib/label-prints/print-labels.ts` / `print-route.ts`) — no second station model, no second
pipeline. Build §3.0 → §3.0b → §3.1 → §3.2 → §3.3 in order, verifying each on :3050; propose §3.4 items to the
owner with a one-line cost each before building them. Carry §4 explicitly. Report what you proved
and what is still red, and do not commit or stage without asking.
