# HANDOFF — FNSKU reprint on the phone: edge-to-edge dock, label layout, print count (2026-09-25)

Paste this whole file into OMP from `/home/michaelgarisek/Projects/cycleforge-lanes/prod`.
Read first: `AGENTS.md`, `docs/handoff/mobile-ds-law-exoskeleton-HANDOFF.md` (the phone record law),
`src/lib/mobile/detail-hub-law.ts`, `src/design-system/components/DetailDock.tsx`,
`src/lib/print/fnskuLabel.ts`, `src/lib/print/staff-print-bridge.ts`.
Do not commit; the owner commits. The tree carries other lanes' uncommitted work — touch only the
files named here.

## The use case (operator)

A packer scans an Amazon FBA unit label (FNSKU `X00…`) with the phone — or types it, or types just
the 7-character tail (`36X1R51` → `X0036X1R51`) — lands on the FNSKU record, and reprints the FBA
label on the print station (a desk Chrome signed in to CycleForge). Operator, 2026-09-25:

> "great exoskeleton design system for mobile — no padded top, left and right for the buttons, must
> be edge to edge. And for the label, the barcode must be edge to edge and focused in the middle, and
> condition right below the text, not bottom aligned. … I must be able to adjust the count of how
> many I'm printing as well."

## What already exists (built this session, uncommitted)

| Piece | Where |
|---|---|
| Scan class `fnsku` (`X00`+7, no redirect so desk FBA wedges never navigate) | `src/lib/barcode-routing.ts`, `scannedFnsku` / `fnskuFromTail` in `src/lib/scan-resolver.ts` |
| `/m/scan` lands FNSKU on its hub; a typed 7-char tail is confirmed against the catalog first | `src/lib/scan/identify-land.ts`, `src/components/mobile/scan/MobileScanIdentify.tsx` |
| Hub + `/info` (exoskeleton, registered in cohort / top bar / surface / sheet roles) | `src/app/m/(shell)/fnsku/[fnsku]/page.tsx`, `…/info/page.tsx`, `src/components/mobile/fnsku/*` |
| Catalog read (added `condition`) | `GET /api/admin/fba-fnskus/[fnsku]` |
| Print job grain `fnsku` on the staff print bridge (`{ fnsku }` only; the station reads the catalog) | `src/lib/print/staff-print-bridge.ts` |
| Station side: catalog → label → `label_print_jobs` REPRINT (`code128`, `fba_fnsku`) | `src/lib/print/printFnskuStationJob.ts`, host dispatch in `src/hooks/useStaffPrintBridgeHost.ts` |
| The label (Code 128 + FNSKU + title + condition; raw USB raster AND browser-print HTML) | `src/lib/print/fnskuLabel.ts` (raster helpers split out of `labelFaceBitmap.ts`) |
| Simple printer picker (radio rows: printer icon · name · Ready/Offline/Not set up) | `src/components/mobile/print/StaffPrintStationPicker.tsx` (used by FNSKU sheet, repair paperwork, `/m/print`) |
| A desk browser with NO USB printer is a station (Chrome `--kiosk-printing` prints silently); a phone (coarse pointer) with nothing paired never answers | `deskBrowserCanPrint` + `isPrintStation` in the host / bridge |
| Same-browser tabs print a job once (Web Lock + claimed ids) | `runPrintJobOnce` in `src/lib/print/print-station.ts` |
| **Non-production print channel pinned to staff 1** (any staffer on localhost / dev tunnel / Tailscale shares one printer; production stays per signed-in staff) | `printBridgeStaffId` in `src/lib/realtime/channels.ts`, used by `/api/realtime/token` and both bridge hooks. Override: `NEXT_PUBLIC_PRINT_BRIDGE_STAFF_ID` (restart the lane — it is inlined) |
| Sign-in hydration fix (it regenerated the whole tree and tripped React's "script tag" error at `src/app/layout.tsx:116`) | `src/app/signin/page.tsx` — face state starts `false` on both sides |

## Status 2026-09-25 (session 2) — all three tasks built and smoked, uncommitted

- `pnpm verify:fast` green before and after. The dead `staffName` props left by the picker
  change are gone (`FnskuStationSheet`, `MobilePrintPrinterStep`, `MobilePrintWorkspace`,
  `useStaffPrintBridgeClient`).
- Staff-1 pin: a phone signed in as QA 19576 joins `org:…0001:print:1` and hears desks on that
  channel as Ready (two smoke desks, plus four live "Unnamed computer" desks already on it). Not
  re-run with the owner's own staff 1 / 122 accounts — no sessions minted for them.
- Task 1: `DetailDock` is flush — no `px-mode-page pt-2`, no gap, `radius="flush"`, cell
  ring/shadow off, `divide-x divide-mode-rule` (Tailwind 4 draws it as the right border of every
  cell but the last), `pb-safe` for the inset. Measured at 390px on all 7 ported hubs (rs,
  on-hold, carton, loc, fnsku, order, pack): nav 0→390, cells contiguous, 48px tall, radius 0,
  1px rule. `pinned.json` → `DetailDock` hands out the flush bar. Not shot: the glove dock in
  `DirectedPickScreen` (needs a live pick wave).
- Follow-up (operator: "the top rows and the top selection button information must have no
  padding as well … fully edge to edge, with swiping left and right as actions for a later
  date"): `DetailHubScreen` body is `divide-y divide-mode-rule` with no padding or gaps;
  `DetailSummaryCard`, `DetailNav` and `DetailAck` lost their box and radius; every door row has
  a rule under it; `FnskuCopiesStepper` is three flush cells. The hub `content` slot now owns
  its own inset, so `LocationStockList` and `RepairScanCompanion` got `px-mode-page py-mode-page`.
  Measured at 390px on all 7 hubs: the card and every row run 0→390 with radius 0, sit flush on
  each other and are separated by a 1px rule. Swipe actions are NOT built — the full-bleed rows
  are just where they will attach. Not seen with rows: sub-screens that mount `DetailNav` or
  `DetailSummaryCard` inside their own padding (`/m/r/[id]/lines|qc`, on-hold `/locations`,
  `/m/u/[id]`, QC pickers) — they are unboxed now too, and the test records had empty lists.
  → Verified with rows on 2026-09-25 (all inset 16→374, facts still boxed, `/m/on-hold/<sku>`
  paints two headers). Next work: [`mobile-industrial-flatten-HANDOFF.md`](./mobile-industrial-flatten-HANDOFF.md).
- Task 2: both label paths. Raster: 145-module FNSKU at 2 dots/module = 290 of 406 dots,
  58-dot (29-module) quiet zone each side, centred; 3 dots/module would need 495 dots, so on
  2" stock this IS the widest whole-dot barcode. HTML: bars 1.76" of 2" with exactly a
  10-module quiet zone. `zbarimg` reads `CODE-128:X004O69DL9` and `CODE-128:X002LXYGWN` from both
  the captured USB bytes and the HTML render; condition sits on the line under the title.
- Task 3: `copies` on the wire (clamped 1..99, default 1, test in `staff-print-bridge.test.ts`),
  `FnskuCopiesStepper` in the hub `content` slot, dock reads `Reprint 3 labels`, ack
  `Sent 3 labels to …`. Station: HTML = one document with N pages; USB = N `transferOut`s of
  the same raster (a raw run that fails part-way sends only the stickers still owed to HTML);
  one ledger row with `copies: N` (smoked with the ledger intercepted).

## Unverified when session 1 ended (resolved above)

1. The last edits (staff-1 pin, and removing the `staffName` prop from every
   `<StaffPrintStationPicker>` call site) were not type-checked: the run was aborted.
   Run `pnpm verify:fast`. Known reds that are NOT this work: `GlobalDetailStackHost.tsx`
   (`disableMoveUp`), the `Desk surface` guard baselines, and `nav-registry.test.ts`
   (`/m/label-intake`).
2. Prove the staff-1 pin: phone signed in as USAV Owner (staff 122), desk Chrome signed in as
   Michael (staff 1) → the desk shows up as Ready in the phone's Printer sheet.

## Task 1 — edge-to-edge dock (design system, every hub)

`DetailDock` is the exoskeleton's ONE verb bar (`src/design-system/components/DetailDock.tsx`), so
fix it there, not in the FNSKU hub:

- Drop the side and top padding (`px-mode-page pt-2`) and the grid gap. Verbs fill the bar edge to
  edge. Separate adjacent verbs with a 1px rule (`border-mode-rule`), not a gap.
- Keep the safe-area bottom inset, the ≥44px hit (`min-h-mode-hit-cta`), one primary, max three
  verbs.
- Flush cells get square corners (no `rounded-mode` inside a flush bar).
- Update `pinned.json` → `DetailDock` (useWhen/doNot) so the law hands out the flush bar.
- Screenshot every ported hub in `DETAIL_HUB_PEERS` (`src/lib/mobile/detail-hub-cohort.ts`) at
  390px — they all change. Run `node tools/design-mcp/ds.mjs critique src/design-system/components/DetailDock.tsx`.

## Task 2 — label layout (`src/lib/print/fnskuLabel.ts`, both paths)

Change both `drawFnskuLabel` (raster) and `buildFnskuLabelHtml` (HTML):

- **Barcode edge to edge, centred.** Fill the printable width, minus only the Code 128 quiet zone
  (≥10 modules each side — do not remove it, scanners need it). Use whole dots per module on the
  raster (203 dpi): pick the largest integer module that fits, then centre. Keep the bar height
  about the same (~0.36in).
- **Condition directly under the title**, in the same text flow — not pinned to the bottom edge.
- Nothing else changes: FNSKU text under the bars, title ≤2 lines (start…end cut), condition only
  when the catalog has one (never guessed).
- Proof: decode the raster with `zbarimg` (it must read `CODE-128:<fnsku>`) and screenshot the HTML
  fallback. Use `X004O69DL9` (it has a condition) and `X002LXYGWN` (long title).

## Task 3 — print count

- Wire: add `copies` to `StaffPrintFnskuPayload`. The parser clamps it with `clampLabelCopies`
  (`MAX_LABEL_COPIES` = 99, `src/lib/print/labelCopies.ts`) and defaults to 1. Add a case to
  `src/lib/print/staff-print-bridge.test.ts` for the clamp and the default.
- Phone: a count control on the FNSKU hub — a − / count / + stepper in the hub `content` slot above
  the Printer door, default 1. The dock keeps ≤3 verbs; the Reprint label reads `Reprint 3 labels`
  when the count is >1. No new sheet for this.
- Station: N stickers are N plates, not a printer repeat count. The CX418 prints one label for a raster
  job whatever `PRINT N` says — see `expandPlateRun` / `printLabelFacesJob`. For raw, send N jobs (or
  one multi-plate run); for HTML, send one document with N pages. Ledger one `label_print_jobs` row
  with `copies: N`.

## Test recipe (localhost `:3050` only)

- Desk: Chrome started with `--kiosk-printing`, the label printer as the OS default, CycleForge open
  on any desk page. Or pair a USB label printer in Settings → Hardware.
- Phone: `/m/scan` → the **T** control (type) → `36X1R51` → Reprint.
- Playwright: use SEPARATE browser contexts for the desk and the phone. A second page in the same
  context stays on "Loading…". Stub `navigator.usb` to capture raster bytes, or override
  `window.print` to count the HTML path.
- ⚠️ With the staff-1 pin, ANY dev smoke prints on the operator's real staff-1 desk. Before a
  smoke, set `NEXT_PUBLIC_PRINT_BRIDGE_STAFF_ID` to a test staffer (e.g. `19576`, QA Mobile
  Verifier) and restart the lane — or keep the operator's desk closed. Intercept
  `/api/label-print-jobs` in smokes so the ledger is not written.
- The lane is unstable under load (a Turbopack panic, an OOM at 30G). If `:3050` hangs:
  `systemctl --user restart cycleforge-lane@prod`.

## Leave alone / known

- `/m/scan` still logs a nested-`<button>` hydration error: `MobileStationTapeItem` wraps
  `OrderIdChip` / `TrackingChip` inside the row button. Another lane owns it; it recovers inside its
  Suspense boundary and does not trigger the root-layout error.
