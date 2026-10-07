# Handoff — Quality control: print the unit label instantly, pass in the background (2026-10-07)

Paste this whole file as the first message of a fresh session in `~/Projects/cycleforge-lanes/prod`.

---

## Status — implemented 2026-10-07 (second session)

- Pass prints from the line row alone: `serials[].unit_uid` (projection + `?include=serials`) and `catalog_gtin` (else `generateInternalGtin(sku_catalog_id)`, `src/lib/inventory/internal-gtin-format.ts`). `/api/units/next-id` is off the QC path.
- Press → `printProductLabel` (resolves on dispatch; chunk preloaded on mount) → then ONE keepalive `POST /api/qc/units/[id]/print-pass` → 202 after one INSERT into `qc_print_pass_outbox`. A unit with no id: the route mints it (`ensureQcUnitUid`) and the client prints the id from the 202.
- Job `src/lib/tech/qc-print-pass.ts` (`after()` + cron `/api/cron/qc-print-pass` every minute): print record (`recordUnitLabelPrint`, no status move) → `recordTestVerdict` PASS → DONE. GuardRejected → FAILED at once; other errors retry, FAILED after 5 attempts; FAILED posts a staff-inbox item to the tech.
- `recordTestVerdict`: unit transition + rollup now in ONE tenant transaction (`applyTransition` takes `db`).
- Bugs fixed: 3 (`station_activity_logs` uuid cast), 4 (`attachTechSerial` no longer passes `sku_catalog.id` as `source_sku_id`), 6 (moot), 7 (advance reads the painted line), 8 (QC letters skip while `G` is armed).
- Measured on `:3050` (dev): dock Pass → print frame +5 ms, request +19 ms; `P` → frame +62 ms (50 ms wedge gap), request +79 ms. DB after the job: TESTED, `TEST_PASS`, `testing_results` PASS, `label_print_jobs.unit_uid` = own id, line PASSED/DONE, LABELED event with no status move.
- Migrations applied: `2026-10-07_qc_print_pass_outbox.sql`, `2026-10-07_receiving_line_serial_projection_unit_uid.sql`.
- Bug 5 is not auditable from the DB: `label_print_jobs` always stored the unit's own id; the printed peek lived only in the failing `station_activity_logs` insert.

## Goal

On the Quality control scan station (`/test`), pressing **Pass** (dock button, the Pass segment of the verdict row, `P`, or Enter) must **print the unit label at once**: the silent print, or the browser print dialog when silent print is off, starts in the press's own gesture, with **zero network requests in front of it**. The pass verdict is not acknowledged first. After the print fires, the client sends **one** fire-and-forget request that records the pass and the print, and moves on. The server and the database do the rest as a background job: the verdict, the status transition, the line rollup, the unit id, the print record, the audit rows and the order facts. The tech never waits for any of it.

Operator, 2026-10-07: "It must print out the label instantly without even acknowledging a pass. It must not even go through the pass route itself and just print out the label. And then … mark it as pass, asynchronously. As a background job so you can print out the label and immediately forget about it. And let the database correctly configure everything."

Second ask, still open: **remove the white padding between the edge of the screen and the Fail / Pass buttons.** What the previous session measured on `:3050` (Playwright, line 56171, viewports 1280 / 1500 / 1920 / 2560):

- **The verdict row (Fail · Test again · Pass) is already flush in a fresh render.** `data-testid="testing-verdict-bar"` spans from the sidebar edge (x 240) to the right edge of the window at every width. It has 0 padding and 0 margin, and so do its 13 ancestors, through `data-testid="testing-station-center"` and beyond. The only padding in the chain is `pb-56` at the bottom of the band column. It is 44 px tall, the same as its buttons. The segments are equal thirds with no gap. If the operator still sees side padding on this row, their open tab is running the old bundle, which had `px-3 py-2` on `TestingVerdictBar.tsx`: hard-reload and re-check.
- **The white space inside each inactive segment is the button's own fill** (`bg-surface-card`, white, with a 1 px tinted ring). Fail's word and key are centered in a white third of the screen, so from the edge of the screen to "Fail" reads as white padding. Possible fix: a tinted fill for inactive segments (rose / blue / emerald, as on the active face), or segments that shrink to their content.
- **The Pass CTA in the composer is inset 43 px from the right edge** (1920 px viewport; pane right edge x 1920 → button x 1877), through four layers:
  1. `data-testing-dock-float`: `px-4 sm:px-6` = 24 px. `TestingPanel.tsx`, the `dock` wrapper built from `slicedActionDockWrapperClass({ docked: false })`.
  2. `station-composer-host` child: `px-3` = 12 px (the `StationComposerHost` column).
  3. `omnichannel-composer-dock`: `p-1.5` = 6 px, plus a 1 px border, `rounded-2xl`, raised (`WorkspaceNotesCard chrome="raised"`).
  4. The button itself: `px-6` (24 px) of inner padding around "Pass P".

  Vertically the composer card sits 6 px inside its border, plus `pb-[max(0.25rem,env(safe-area-inset-bottom))]`.
- **Confirm with the operator which white they mean** (the row's white fills, or the composer's 43 px inset around Pass) before you change the shared `StationComposerHost` / `WorkspaceNotesCard` chrome. Unbox and Arrival mount the same composer. Run `impact_analysis` on it first.

---

## Lane rules (AGENTS.md — binding)

- Test only through `http://localhost:3050`. Never start, restart, stop or switch a `cycleforge-lane@…` unit, and never run `next dev`.
- **Known lane state on 2026-10-07:** the running `:3050` server (pid 1297044, started 23:28:55 PDT on 10-06) answers `409 transition LABELED → TESTED not allowed` and `LABELED → IN_TEST`. The edit allowing both moves is on disk in `src/lib/inventory/state-machine.ts` and in the route's compiled chunk (`.next/dev/server/chunks/src_lib_1g5rb10._.js`), and `guard('LABELED','TESTED')` run in-process returns `{ ok: true }`. Ask the operator to restart the lane, then re-test. Unit **2969** (`066563z43211438ae`, line 32612) stays stuck in `LABELED` until then. Unit 2970 on the same line (`TESTED`) works end to end.

---

## Route audit — what one Pass press does today (traced 2026-10-07)

Measured on `:3050` with the Neon round trip at about 85 ms (a warm `SELECT 1`).

### On opening a line (before any press)

| Request | Time | Purpose | Notes |
|---|---|---|---|
| `POST /api/units/next-id` `{ sku, sku_catalog_id, serial_unit_id }` | 0.5–1.3 s | Label preview: GTIN, plus the unit's own `unit_uid` (`existing: true`) or a peek at the next id | `src/app/api/units/next-id/route.ts`. In dev it fires several times per open (StrictMode, plus the preview reset effect in `useTestingLineController.ts`). |
| `GET /api/serial-units/:id/checklist` | 0.6–1.2 s | QC checklist | |
| `GET /api/qc/receiving-lines?view=testing_opened` | 0.7–1.1 s | Rail | Re-fires on every `testing-result-recorded` event |
| `GET /api/qc/seller-claimed` | about 1.3 s | Seller-claimed condition | |
| `GET /api/receiving/recent-staged-location`, `recent-label-note`, `/api/receiving-photos` | 0.4–0.6 s | Dock chrome | |
| `POST /api/receiving/zendesk-claim/preview` | — | Claim chip | |
| `POST /api/v1/print-stations` | 0.3–0.7 s | Print-station heartbeat | |

### On Pass (`handlePrimary` in `src/components/tech/hooks/useTestingLineController.ts`)

1. **The verdict (not awaited since 2026-10-07):** `handleSlotVerdict(row.id, serial, 'PASS')`
   - paints PASS optimistically (`dispatchTestingLineUpdated` plus `patchSiblingUnitStatus`) and pins the active slot;
   - then sends `POST /api/serial-units/:id/test` → `recordTestVerdict` (`src/lib/tech/recordTestVerdict.ts`). This now takes **1.5–1.8 s** (it was 3.2–4.6 s). In order:
     - `Promise.all`: the verdict mapping (a read of `organizations.settings` when `UNIFIED_ENGINE_VERDICT_CONFIG` is on) and the unit read through the view `v_serial_unit_origins`;
     - `applyTransition` → `transition()` in `src/lib/inventory/state-machine.ts`. This is its own transaction with the tenant setting: lock with `FOR UPDATE`, `guard()`, `UPDATE serial_units`, `INSERT inventory_events`. The engine tap is skipped here and deferred.
     - a legacy-path `appendInventoryEvent`, only when `UNIFIED_ENGINE_APPLY_TRANSITION` is off (it is on in `.env`);
     - the line rollup, as a **second** transaction: lock `receiving_line FOR UPDATE`; tally through `serial_unit_provenance`; upsert `receiving_line_testing`; `transitionReceivingLine` when the workflow status changes;
     - then the response.
   - Work deferred with Next `after()` (the `defer` argument of `recordTestVerdict`):
     - `attachTechSerial`
     - `testing_results` insert
     - fail signals and the support-ticket auto-link
     - `tapWorkflow`
     - `passAllocateUnitToPendingOrder`
     - `refreshOrderStageFacts` (measured **590 ms**)
     - `refreshReceivingUnitStageFacts` (**284 ms**)
     - `recordAudit` from the route
   - Per-press `client_event_id` = `testing-verdict-{unit}-{verdict}-{uuid}`. A fixed id used to replay the first press on every later one.
2. **The print:** `issueAndPrintLabel()`.
   - If the preview allocation is not loaded yet, it **awaits `POST /api/units/next-id` first** (0.5–1.3 s). This is the last network wait in front of the print for a unit that already has an id.
   - If the unit has no `unit_uid` yet (`existing: false`), it **awaits `POST /api/post-multi-sn`** (2.1–2.2 s) to mint one, then prints the minted id.
   - Otherwise `printProductLabel()` (`src/lib/print/printProductLabel.ts`) runs synchronously: silent print is on by default (`isSilentPrintEnabled`) through `printLabel` into a hidden frame, and `reserveLegacyPrintPopup` covers older WebKit. Measured: the frame appears 20 ms after the press. Then `/api/post-multi-sn` runs in the background.
   - `POST /api/post-multi-sn` (`src/app/api/post-multi-sn/route.ts`, 2.1 s) does, in order:
     - a `station_activity_logs` insert, which **fails on every call**: `operator does not exist: uuid = text`;
     - `upsertSerialUnit` with `target_status_on_create_only` (an existing unit keeps its status);
     - `attachTechSerial`, which **fails on every call**: foreign key `tech_serial_numbers_source_sku_id_fkey` (it passes `sku_catalog.id` into `source_sku_id`);
     - `recordInventoryEvent('LABELED')`;
     - a `label_print_jobs` look-back to set `is_reprint`, then the insert.
3. **The advance:** `advanceAfterPrint()` moves to the next unverdicted slot; when the line is complete it fetches `GET /api/receiving-lines?receiving_id=…&include=serials` for the next open sibling.

### Measured press → feedback (2026-10-07, unit with an id)

| | Time |
|---|---|
| Verdict painted | 0.15–0.21 s |
| "Passed · label printed" toast | 0.22 s |
| Print frame created | 0.24 s |
| Verdict save finishes on the server | 1.5–1.8 s, in the background |
| Print record finishes on the server | 2.1–2.2 s, in the background |

---

## What "instant" still lacks — the target design

1. **Print from data already on the client.**
   - The label needs: the unit id, the GTIN, the title, the serial, the condition, the color and the org slug. Today the unit id and GTIN arrive through `/api/units/next-id` after the line opens.
   - Put `unit_uid` in the line's serial projection (`rlt.serial_projection` → `serials[]`, built in `src/lib/receiving/serial-projection.ts`; `ReceivingLineRow.serials` already declares `unit_uid?`) and the catalog GTIN on the line row (`sku_catalog.gtin`; `getOrCreateInternalGtin` mints one when it's missing).
   - The `serial_projection` change needs a backfill — a migration under `src/lib/migrations/`.
   - Then the press prints with no request at all, and `/api/units/next-id` is no longer on the print path.
2. **A unit with no id must not block the print.** Decide with the operator:
   - (a) mint `unit_uid` for every unit at receiving, so QC never meets one without an id — measure how many QC units lack one first;
   - (b) mint the id from the client press itself, with a reserved-sequence call;
   - (c) print the peek and let the server bind it, which is risky if two benches race.
3. **One fire-and-forget request after the print, replacing `/test` and `/post-multi-sn` from the client.**
   - New route, for example `POST /api/qc/units/:id/print-pass`, sent with `fetch(..., { keepalive: true })` or `navigator.sendBeacon`. Body: verdict `PASS`, the printed unit id, `client_event_id`, the label face fields, `notes`.
   - The route only **inserts one outbox row** (one query, idempotent on `(organization_id, client_event_id)`) and returns `202`.
   - A worker or `after()` drains the outbox:
     - `recordTestVerdict(..., { defer })`;
     - the print record that `post-multi-sn` does today (upsert, `label_print_jobs`, the LABELED event — without its two failing inserts);
     - the pass→pending-order allocation and the stage-facts refresh.
   - Look for an existing outbox to reuse before adding a table: `WORKFLOW_TAP_OUTBOX` (`isWorkflowTapOutboxEnabled`) and `drainTicketWorkOutbox` are already in the repo.
   - Retries must be idempotent. A failure must reach the tech without blocking them: rail status, inbox, or a toast fed from realtime — not a modal.
4. **Optimistic state without the round trip.** Keep the local PASS paint. Reconcile from the realtime and rail refresh. Drop `isMutating` and `isPrinting` from anything visible. Each press is independent: a second Pass on another unit must not wait for the first.
5. **The database configures everything.**
   - The status transition, the line rollup and the rail counts follow from the outbox job.
   - Merge the transition transaction and the rollup transaction in `recordTestVerdict` into **one** transaction: today two transactions, each with its own tenant setting, cost about 12 round trips.

---

## Bugs to identify and fix (found while tracing — none fixed yet unless noted)

1. **Stale lane** — see Lane rules. Re-test `LABELED → TESTED` after the operator restarts.
2. **106 units passed QC but sit in `LABELED`.** Before 2026-10-07, `post-multi-sn` moved every product-label print to `LABELED`, the state for a printed *carrier* label. Inventory search counts them under "shipped". Query: units whose latest event is `LABELED` with `station='SYSTEM'` and `prev_status='TESTED'`. A data repair back to `TESTED` needs the operator's yes. The code no longer causes this (`target_status_on_create_only`).
3. **`post-multi-sn`'s `station_activity_logs` insert fails on every call** (`uuid = text`), and costs a round trip each time.
4. **`post-multi-sn`'s `attachTechSerial` fails on every call** (foreign key on `tech_serial_numbers.source_sku_id`).
5. **Labels printed the wrong unit id before 2026-10-07:** the peek (`…000010`) instead of the unit's own `unit_uid` (`…000008`). Fixed through `next-id` `serial_unit_id`. Audit how many labels in `label_print_jobs` carry a `unit_uid` that is not the unit's own.
6. `/api/units/next-id` fires several times per line open; the preview reset effect and StrictMode both re-run it. It becomes moot once the id is in the line payload.
7. `advanceAfterPrint` reads a stale `row` from its closure (the status from before the optimistic update).
8. **Possible key collisions:** bare **F / T / P** are bound in the capture phase on `/test` (`useTestingPrimaryAction.ts`, through `createScanFieldLetterKey`). Check them against the G-leader go keys (`G F`) and the header Find. Unverified.
9. `/api/get-title-by-sku` still matches Zoho items and the Ecwid crosswalk with leading zeros stripped in both directions. The catalog lookup and live stock use the guarded canonical-key match.
10. **Product rulings to confirm:** Pass on a *failed* unit now passes it and prints. The Pass segment on an already-passed unit reprints.
11. **Keys painted in the buttons:** this was allowed 2026-10-06 for `TestingStatusPills.tsx` and `SlicedActionDock.tsx` only — the `cf-keys` allowlist in `eslint.config.mjs` plus the `KeyboardKey` entry in `src/design-system/pinned.json`. Keep it scoped.

---

## Files touched by the previous session (context)

- `src/components/tech/hooks/useTestingLineController.ts`: optimistic Pass, print-first, active-slot pinning, per-press event id, `allocateUnitId(sku, serialUnitId)`
- `src/components/tech/testing-panel/useTestingPrimaryAction.ts`: P / T / F / Enter, never disabled
- `src/components/tech/testing-panel/TestingVerdictBar.tsx`, `src/components/receiving/workspace/TestingStatusPills.tsx`: Fail · Test again · Pass, keys painted, flush
- `src/components/tech/testing-panel/terminal/*`: the Pass CTA (label "Pass", P key, never disabled)
- `src/design-system/primitives/SlicedActionDock.tsx`, `src/components/station/terminal/StationTerminalDock.tsx`, `src/lib/station-terminal/types.ts`: the `hotkey` prop
- `src/app/api/serial-units/[id]/test/route.ts`, `src/lib/tech/recordTestVerdict.ts`: the `defer` work runs through `after()`; the engine tap is deferred
- `src/app/api/units/next-id/route.ts`: `serial_unit_id` returns the unit's own id (`existing: true`)
- `src/app/api/post-multi-sn/route.ts`, `src/lib/neon/serial-units-queries.ts`: a print never changes an existing unit's status
- `src/lib/inventory/state-machine.ts`: `LABELED → TESTED | IN_TEST`

---

## Acceptance

- On `:3050`, Pass shows the print (silent frame or dialog) in **under 100 ms** from the press, with **no network request between the press and the print**. Verify with Playwright request timestamps against the print-frame creation time, as the previous session did with an init script that records `window.print` calls and inserted `IFRAME`s.
- The press makes exactly **one** request after the print, which returns in under 150 ms. Then, within a few seconds, the database shows:
  - the unit `TESTED`;
  - a `TEST_PASS` inventory event;
  - a `testing_results` row;
  - a `label_print_jobs` row whose `unit_uid` equals `serial_units.unit_uid`;
  - the line rollup updated;
  - no `LABELED` status move.
- Ten Pass presses in a row on ten units (scan, P, scan, P …) never wait and never grey out; every unit ends `TESTED` with its own label id.
- Silent printing still prints a real label at the bench. Ask the operator to confirm the physical label.
- `pnpm verify:fast` is green except gates already red on files you didn't touch (on 2026-10-07: Lint `StockViewList.tsx`, Routes `mobile-v2-destinations.tsx`, Ring state `ListRemovalPicker.tsx` / `spine-parent-tone.ts`).
