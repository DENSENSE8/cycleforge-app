# HANDOFF — Labels & docs: a full split desk, triage only (written 2026-09-27)

Paste the **Prompt** block at the bottom into a fresh session. Everything above it is ground truth
read from the working tree on 2026-09-27. Other sessions edit this worktree concurrently — re-read
every file right before you edit it, never revert what you did not write, never commit without
asking. Dev origin `http://localhost:3050` only (`AGENTS.md` §1).

## 1. Owner rulings this pass encodes

1. **Full split, not floating columns.** The desk built last session floats three cards on an
   off-white canvas (queue · document stage · print rail). The owner accepts the triage corners and
   the floating feel but wants a **full-on split** that **reuses the same components as the other
   desks' in-place / split views** — the To-ship ledger's `DeskRecordPlane` + `DeskPageChrome`
   stage, not a hand-built three-column grid.
2. **Triage only. No industrial view.** Labels & docs is ONE job — show labels and print them. It
   does not need the tight-density industrial face. Triage is corner radius, keybinds and clickable
   buttons; squared-off industrial buttons are never used here. Remove the Desk / Floor switch, the
   industrial refinement of the look, and every Floor path added for this page. In the lane policy
   (`HANDOFF-lane-mode-policy.md`), this route is `triage` (never collapses, never offers Floor),
   even though the Outbound lane is `dual`.
3. **Name.** The page is **Labels & docs** (nav label renamed from "Label intake"; route
   `/shipping/label-intake` and nav id `label-intake` kept so links, `G L` and the Tauri shell keep
   working). Its job: print every stored shipping label (paired to an order or not) and file / print
   the order's packing slips and manuals.
4. Keys teach **on hover only**, through `HotkeyScrim` (pinned in `pinned.json`). No keycaps at rest.

## 2. What exists now (built last session, uncommitted, untracked unless noted)

Server and data (keep; verified live on :3050):
- `src/lib/migrations/2026-09-27r_label_print_events.sql` — **applied** to the `.env` Neon DB.
  `label_print_events` (FORCE RLS, per-org keys). Pending = stored label with no print row.
  Drizzle mirror in `src/lib/drizzle/schema.ts` (`labelPrintEvents`, modified).
- `src/lib/label-prints/` — `contracts.ts` (zod + OpenAPI), `print-queue.ts` (server-only list /
  record / history), `http-client.ts`, `queue-filter.ts` (+ test), `print-route.ts` (+ test: stock
  `label` 4×6 → thermal USB/serial › desktop host › dialog; stock `paper` letter → desktop host ›
  dialog; silent off → dialog), `print-labels.ts` (`printDocuments`: per-stock routes, one browser
  dialog per stock, logs label prints as one batch), `label-raster.ts` (`rasterizeDocument`: PDF or
  image → pages on the stock at 203 dpi; the preview IS the print).
- Routes: `src/app/api/v1/label-prints/route.ts` (GET queue `?view=pending|record`, POST batch log),
  `src/app/api/v1/label-ingestions/[id]/pdf/route.ts`, `…/[id]/prints/route.ts`. OpenAPI
  regenerated (`docs/openapi/cycleforge-v1.json`), route-permission manifest emitted.
- `src/lib/label-ingestions/ingestion-service.ts` — added `readLabelIngestionPdf`.
  `ledger-view.ts` trimmed to `ledgerStatus` / `LEDGER_ACTION_LABEL` / `quarantineCopy` (+ test).
- `src/lib/print/desktop-print-host.ts` — the ONE seam naming a shell: Electron
  `window.cycleForgeDesktop.printHtml` (contract recovered from `git show 270795058^:src/lib/desktop/desktop-host.ts`)
  and Tauri v2 `__TAURI_INTERNALS__.invoke('cf_print_html', { html, options })` — the Tauri command
  is NOT implemented in any shell yet.
- `public/pdfjs/standard_fonts/` — pdf.js standard fonts copied from `node_modules/pdfjs-dist`
  (`PDFJS_STANDARD_FONT_DATA_URL` in `src/lib/manuals/pdfThumbnail.ts`); used by `label-raster.ts`
  and `src/lib/print/printPaperworkPackets.ts` with `useSystemFonts: false`.

Design system (keep, then trim per §3):
- `packages/design-tokens/src/modes.ts` — `MODE_LOOKS['labels-documents']` with per-mode
  `refines` (triage + industrial); regenerated `generated/tokens.css`.
- `ModeRegion` `look` prop (`src/design-system/providers/ModeRegion.tsx`, file was already dirty from
  another session), `look` on `ModeRouteEntry` (`src/lib/routing/mode-registry.ts`),
  `RouteModeRegion` / `ChromeModeRegion`, `src/app/shipping/layout.tsx` apply it.
- `src/design-system/primitives/HotkeyScrim.tsx` + its `pinned.json` entry.

The page (REPLACE the layout, keep the parts):
- `src/app/shipping/label-intake/page.tsx` → `src/features/labels-docs/LabelsDocsDesk.tsx`.
- Parts in `src/features/labels-docs/`: `LabelQueueCard` (cmdk list, `disablePointerSelection`,
  find + All / No order / Paired), `DocumentStage` (inline document strip with include checkboxes +
  locked preview frame), `PrintCard`, `PairOrderCard` (links through `POST /api/orders/{id}/labels`
  — ShipStation labels only), `PaperworkIntakeCard` (`useOrderPaperworkActions`: slip / manual
  upload, fetch slip from channel), `PrinterConnectCard` (silent switch, connect USB / serial 4×6
  thermal, TSPL/ZPL, Test), `LabelRecordCard` (facts, print log, Apply / Reprocess),
  `use-desk-documents.ts` (label → order → packing slips + manuals), `use-print-routes.ts`,
  `labels-docs-chrome.ts`, `print-faces.ts`.
- Deleted: `src/features/label-intake/LabelIntakeLedger.tsx` (was clean in HEAD).
- Renamed nav label: `src/lib/sidebar-navigation.ts` (2 rows + keywords),
  `src/lib/nav/context/resolve.test.ts:134`, comment in `src/lib/shipping/orders-desk.ts`.

Verified live last session (desk, 1680×980, QA Admin): order 5010 shows `Label · 4×6` +
`Packing slip · Letter` (both checked), rail = Print · Order paperwork · Printers · Label record,
hover scrim 0 → 1, `⌘/Ctrl+Shift+F` flipped to industrial and back. 49 unit tests green;
V1 OpenAPI, nav-name, design-token gates green. `pnpm verify:fast` red only on
`src/lib/auth/pin.ts` (another session's file).

**USPS "G" fix — proven in pdf.js, not yet in the browser frame.** The label's Helvetica is not
embedded; with system fallback fonts pdf.js mis-set the metrics and the service "G" dropped onto
the "USPS GROUND ADVANTAGE" line. Rendering ingestion 52 (`shipstation-se-171758672.pdf`) with the
pdf.js legacy build + `@napi-rs/canvas`, `standardFontDataUrl` = `public/pdfjs/standard_fonts/` and
`useSystemFonts: false` puts the G back in its top-left box, matching the `pdftoppm` reference;
without them the text runs in the wrong face. Still to do: screenshot the desk frame for label 5010
and confirm the `/pdfjs/standard_fonts/*.pfb` requests return 200 (listen at the context level —
pdf.js fetches them from its worker). Related LAN risk: `loadPdfjs` still loads the pdf.js WORKER
from cdnjs; serve it same-origin too.

## 3. What to change

### 3.1 Triage only — remove the industrial path for this page
- `mode-registry.ts`: this route's entry becomes triage-only (lane policy `triage` if that pass has
  landed; otherwise `mode: 'triage'` is impossible under `/shipping`'s `runtime` — keep `runtime`
  plus the look, and make the shipping layout ignore Floor on a route whose entry has a look).
- `modes.ts`: drop `refines.industrial` from `labels-documents`; keep the triage refinement
  (off-white canvas, 13px body, micro spacing, triage 10px / 8px corners). Rebuild tokens
  (`pnpm tokens:build`) — the generated CSS must lose the `[data-mode='industrial'][data-look=…]`
  blocks.
- `ModeRegion.tsx`: drop the optional `mode` on the `look` branch; `RouteModeRegion.tsx` /
  `shipping/layout.tsx`: drop `mode={floor ? 'industrial' : undefined}` on the look branch.
- `LabelsDocsDesk.tsx`: delete the Desk / Floor radiogroup, `FLOOR_KEY` storage,
  `publishDeskFloorActive`, the `isDeskFloorChord` handler and its shortcut row. Delete every
  `industrial:` class in `src/features/labels-docs/*` (`industrial:font-mono`, `industrial:gap-px`,
  `industrial:p-0`, `industrial:shadow-none`, `industrial:border-*`, `industrial:uppercase`).
- A phone / coarse pointer must still render triage here (rounded), not collapse to industrial.

### 3.2 A full split built from the shared stage
Reuse, do not re-grid:
- `DeskPageChrome` (`src/design-system/components/DeskPageChrome.tsx`) — title, tabs
  (Pending / Record as desk tabs with counts), `addSlot` (Upload label PDFs, Print all labels),
  `headerCenter` (print status / route), `view` + `onViewChange` from `DeskStageContext`
  (`in-place` | `split`; never `floor` here), `stage="card"`.
- `DeskRecordPlane` (`src/design-system/components/DeskRecordPlane.tsx`) — `list` = the label
  queue (mounted once, fixed width, never remounted between views), children = the open label's
  record: the document stage (strip + locked preview) with the print rail beside it inside the
  record. `recordKey` / `DESK_RECORD_KEY_ATTR` for focus return, `indexLabel` `n of N`,
  `actions` = Print (Enter) · Pair / Paperwork verbs, `summary` for split-with-nothing-open
  (pending count, unpaired count, where the next press prints).
- Study the reference consumers first: `src/components/outbound/orders/OutboundOrdersLedger.tsx`
  (`<DeskRecordPlane` at ~l.390), `src/design-system/components/record-ledger/RecordLedger.tsx`
  (~l.242), `src/components/repair/RepairTable.tsx` (~l.194), `src/components/desk/DeskPageLayout.tsx`,
  and `src/components/outbound/orders/OrderRecordView.tsx` for how a record composes sections.
- Match the To-ship data density exactly: the triage card list (`OrderCardList.tsx`,
  `src/design-system/components/triage-card-list/*`, `TriageListBody`), record header actions
  (`OrderRecordHeaderActions`), and the handoffs below for row facts, lead fact, disclosure and
  density. The label row's lead fact is the order (or "No order"); row facts: tracking (last 8 via
  the house identity chip — `OrderNumberIdentity` / `TrackingIdentity` in
  `src/components/ui/OrderIdentityChips.tsx`), carrier, arrival / last print.
- If `TriageViewDecl` (`src/lib/triage/views/`) is the landed view-spec home, declare this page as a
  view there (job: "print this label and its paperwork"; lead: order; verbs: Print, Pair, Upload
  slip / manual; empty: "Every stored label is printed") instead of hard-coding facts in the list.
- Keep the queue keyboard-first: find field holds focus, ↑↓ walk, Enter prints the open record's
  checked documents, J/K walk records in split (the plane's convention), `⌘/Ctrl+P` print all
  pending in the filter, `⌘/Ctrl+O` upload. Hover never moves the highlight. Keys only on hover
  (`HotkeyScrim`). Check `NavGoKeys` / `NavRecentsList` before binding anything new (⌥digits are
  taken; bare digits are view keys).

### 3.3 Read before building (density + triage methods)
- `docs/design-system/HANDOFF-lane-mode-policy.md` — dual vs triage-only lanes; record this page as
  triage-only inside a dual lane.
- `docs/design-system/HANDOFF-triage-views.md` and `HANDOFF-view-spec-layers.md` — the six layers
  (entity · fact · state/verb · view spec · presentation · paint); density is presentation, never
  paint; no `industrial:` to hide content.
- `docs/design-system/HANDOFF-triage-family-contract.md`, `HANDOFF-card-list-port.md`,
  `HANDOFF-record-card-families.md`, `HANDOFF-record-card-foundation.md`,
  `HANDOFF-desk-record-actions.md`, `HANDOFF-order-card-list.md` — the card list and record
  families this page should wear.
- `docs/design-system/HANDOFF-paperwork-print-shipstation.md` — the To-ship Labels walk, paperwork
  packets and print fallback; the desk's document printing must agree with it (one print pipeline,
  not two).
- `docs/design-system/MODE-SPLIT-INVENTORY.md`, `HANDOFF-mode-governance.md` / `-2.md` — the mode
  law and ESLint gates (`rounded-none` literal and page-level `ModeRegion` are lint errors).
- `docs/refactors/sidebar/HANDOFF-contextual-page-port.md` and
  `HANDOFF-outbound-sidebar-verify.md` — whether Pending / Record become sidebar views
  (`?view=` is already URL-bound; `docs/refactors/sidebar/PARITY.md` §label-intake still describes
  the old ledger — update it).
- `node tools/design-mcp/ds.mjs contract "<job>"` before any new part; `ds_tokens <axis>` for values.

## 4. Open items (carry, do not silently drop)
- Uploaded PDF labels (no ShipStation shipment id) cannot be paired from the desk — `linkOrderLabel`
  is ShipStation-keyed. Needs a new writer (ingestion → LINKED + `shipping_label_purchases`
  `linked_manually` row + tracking) or an owner decision.
- Document prints (packing slips, manuals) are not logged; only labels hit `label_print_events`.
- A multi-label ShipStation batch PDF uploads as ONE ingestion (no splitter; would need a PDF writer
  dependency).
- Tauri shell must register `cf_print_html`; Electron shell is not in this repo (removed in
  `270795058`).
- First real 4×6 thermal print not observed: the raw path rotates 180° (house 2×1 convention).
- `pinned.json`: add the split desk parts once a second page uses them; the `HotkeyScrim` entry is in.

## 5. Verification
- `npx eslint --quiet <your files>`, `npx tsc --noEmit -p tsconfig.json` (only `pin.ts` may be red,
  another session), `node --import tsx --import ./scripts/register-server-only-shim.cjs --test
  src/lib/label-prints/*.test.ts src/lib/label-ingestions/ledger-view.test.ts
  src/lib/routing/mode-registry.test.ts src/lib/nav/context/resolve.test.ts`, `pnpm verify:fast`.
- Live on :3050 with Playwright. Sign in ONCE (per-staff limit 10 / 10 min on `/api/auth/signin`),
  save `storageState` under `/tmp`, reuse it. Prove: in-place ⇄ split with the list never
  remounting; the preview never moves while the list scrolls; `data-mode` stays `triage` on desktop
  AND with `hasTouch/isMobile`; no Floor control or chord; hover scrim 0 → 1; the USPS "G" in its box.
  Probes that change the remembered desk view must switch it back; never pair or print real
  dogfood labels (intercept writes with `page.route`). Delete throwaway probes.

## 6. Outcome (2026-09-27, second pass — owner redirect applied)

Owner redirect mid-pass: no hard-coded Pending / Record tabs (the contextual sidebar owns views);
one Find (top-left); the bar is ONE row (select-all · count · All / No order / Paired chips ·
per page · view switch); a narrow list at the left with the documents beside it in every view.

- Page moved under `src/app/shipping/(desk)/` — the Shipping desk frame (`DeskPageLayout bare`)
  paints title, view pills and header verbs. `label-intake` is `contextual` (`rollout.ts`), views
  **To print** (`pending`, bare) · **Printed** (`record`, `?view=record`) in `SIDEBAR_PAGE_NAV`,
  `NAV_PAGE_DECLS['label-intake']` (desk-store Find, intents `labels-docs:print-all` ⌘P /
  `labels-docs:upload` ⌘O), parity rows in `parity.ts`. "Pending" is a banned sidebar word.
- The list is the shared triage face: `TriageCardList` + `RecordCard` (`LabelCard`,
  `label-card-model.ts`), declared as `label-intake.pending` / `.record` in
  `src/lib/triage/views/label-intake.ts`; pairing is the face's cut (`?pairing=`).
- New shared seam: `DeskRecordPlane listRail` + `TriageRecordSlot.rail` — the cards sit in the
  22rem `DESK_TRIAGE_RAIL_CLASS` rail in every view, the record fills the rest
  (`DESK_RAIL_RECORD_CLASS`), the select bar spans both above them. The first label opens on arrival.
- Triage only: `form: true` on the registry entry (the lane-policy `triage` precursor), no
  industrial refinement in `MODE_LOOKS`, `ModeRegion` look never takes a mode override, the
  shipping layout / chrome region never apply Floor to a look route.
- USPS "G": fixed in the browser with `disableFontFace: true` (glyphs as paths) in
  `label-raster.ts` and `printPaperworkPackets.ts`; the pdf.js worker is same-origin
  (`public/pdfjs/pdf.worker.min.mjs`, drift-guarded by `pdfjs-assets.test.ts`).

Third pass (same day): one card per order (order number top-left in `OrderNumberIdentity`,
platform dot left of it, `×qty title` lines), one fixed-width view (no In place / Split toggle),
`HotkeyScrim` is a bubble outside the control.

Next: `HANDOFF-labels-docs-print-stations.md` — views by print job (1 Labels · 2 Paperwork ·
3 Printed), two identified print stations, bulk uploads, QoL. It carries §4 and the
`pinned.json` entries for `listRail` / `viewControls` / the label family.

---

## Prompt

You are continuing the CycleForge **Labels & docs** desk (`/shipping/label-intake`) in
`/home/michaelgarisek/Projects/cycleforge-lanes/prod`. Read `AGENTS.md`, then
`docs/design-system/HANDOFF-labels-docs-split.md` (this file) end to end, then every doc in its §3.3.

Owner rulings: (1) make it a **full split desk that reuses the shared stage** —
`DeskPageChrome` + `DeskStageContext` (in-place / split) + `DeskRecordPlane`, the same components
and data density as the Outbound To-ship ledger — not the hand-built three floating columns; (2)
**triage only** — this page is one job (show labels, print them, file their paperwork), so remove
the Desk / Floor switch, the industrial look refinement and every `industrial:` class and Floor path
added for it; triage means corner radius, keybinds and clickable buttons, never squared-off
industrial buttons, on desktop and on touch; (3) keep the name **Labels & docs**, the route and nav
id; (4) keys appear only on hover via `HotkeyScrim`.

Keep the server, data and print pipeline in §2 — they are verified. Recompose the page parts
(`src/features/labels-docs/*`) into the plane: list = label queue; record = document strip +
locked preview + print rail (Print, Pair to order / Order paperwork, Printers, Label record).
Declare the view in the landed view-spec home if one exists. First verify or fix the USPS "G"
preview (§2). Carry §4 as explicit open items. Verify per §5, report what you proved and what is
still red, and do not commit without asking — stage only your own files when asked.
