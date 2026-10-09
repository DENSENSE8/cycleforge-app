# HANDOFF — FNSKU / FBA Print station: print popover, stations, control plane (owner 2026-10-04)

Scope: **Print station › FNSKU labels only** (`/print-station`) and the print stations it sends
to. Amazon FBA unit labels (FNSKU, Code 128, title + condition). Other label kinds (QC, bins,
documents) keep working but are not redesigned here.

Dev origin `http://localhost:3050` only (lane `cycleforge-lane@prod`). Auth for probes:
`tests/.auth/admin.json` (`tests/auth-preflight.mjs ensureSession()`). Headless Chromium in the omp
browser tool reports `(hover: none)` — check hover with a Playwright script.

The design MCP (`ds_*`) is beta: use it for lookups, not as the source of truth. The owner's
rulings below win.

---

## 1. Owner rulings for this work (verbatim intent)

1. The bulk **Print labels** popover is the model: "very good". Improve print stations from there.
2. "I should be able to **edit print stations**."
3. **Organization-wide station with a solid name**, not "Unnamed computer".
4. **Print icons, not monitor icons**, for stations.
5. **An always-on, organization-tied print station with no staff sign-in.** It must not be tied to
   a staff identity.
6. **One control plane** for managing print stations.
7. **Quantity slider:**
   - The grey stop dots are the **same height as the track**.
   - The held/selected stop is **grey, not blue**.
8. **Print CTA at the top**, nearest the label-count control, not at the bottom under the station
   list.
9. **No 99 by default.** "You will never send 99 in one batch to FBA; ~30 at most."
10. **A range switch on the slider** so the scale can be set to 1–20, 1–30 or 1–99.
11. Quality-of-life features for printing FBA labels (§4 and §6).

---

## 2. What exists today (facts, file:line)

| Area | Fact |
|---|---|
| Single-FNSKU print | `src/features/print-station/FnskuPrintRecord.tsx`, top to bottom: `FnskuLabelPreview` → **How many** (`QuantityPicker`, :124) → **Print at** (`StationPicker`, :193; `StationRow` paints `Monitor`, :330) → Test print + **Print CTA at the bottom** (:479-517). |
| Bulk print (owner-approved) | `src/features/print-station/FnskuBulkPrint.tsx`: the select bar's **Print labels** opens an anchored `Panel` with Labels of each → Print at → Print CTA (bottom). It sends one `fnsku` station job per checked FNSKU. It reuses `QuantityPicker`, `StationPicker`, `stationBlocked` and `resolvePrintStation` exported from `FnskuPrintRecord.tsx`. |
| Copy stops | `COPY_STOPS = [1, 2, 5, 10, 20, 30, 40, 50, 75, 99]` (`FnskuPrintRecord.tsx:55`). `MAX_LABEL_COPIES = 99` (`src/lib/print/labelCopies.ts:7`) is also the wire clamp (`staff-print-bridge.ts:335`), and `/m/fnsku/[fnsku]` uses it too. |
| Slider | `src/design-system/primitives/StopSlider.tsx`:<br>• track `h-3` (`compact` `h-2`)<br>• stop dots `size-4` (`compact` `size-2.5`), so the dots are taller than the track<br>• fill, passed dots and thumb are `bg-fill-info`, which is blue<br>• the selected stop chip is `bg-fill-info/15 text-text-info` (:113).<br>Other consumers: `StockQtySlider`, `PackTimeSlider`, `TaskStatusPicker`, `MobileTaskStatus`, `MobileProductPackTimeCard`, `TotePrintRunFields`. |
| Station identity | `src/lib/print/print-station.ts`: a **per-browser** id (`localStorage cf.printStation.id`, minted `ps_<uuid>`) and a per-browser name. The registry is `print_stations` (org, `station_id`, `name`, `label_ready`/`paper_ready`, printers, `last_seen_at`, `last_seen_staff_id`, `assigned_label`/`assigned_paper`; unique name per org except "Unnamed computer"). Heartbeats come from a **signed-in staff session** (`POST /api/v1/print-stations`). |
| Data (2026-10-04) | **1,845 station rows, 1,843 named "Unnamed computer"**, 10 live, last heard from 14 distinct staff. Every browser profile, test run and cleared storage mints a new station, which is why the picker is a wall of "Unnamed computer". |
| Hook | `src/hooks/usePrintStations.ts`. `PrintStations` exposes:<br>• `stations`<br>• `target` (per stock: this device's pick › org assignment › this computer)<br>• `setOrgAssignment(stock, id)`<br>• `rename` (`canManage` = `settings.hardware`: rename others, set org defaults)<br>• `sendFnsku(stationId, fnsku, copies, {test})`<br>• `sendDocuments`, `sendQcLabel`, `sendLocationLabels`.<br>APIs: `/api/v1/print-stations` (GET registry / POST heartbeat), `/name`, `/assignment`. |
| Device principal already in the repo | Kiosk devices: `src/lib/auth/kiosk-device.ts`, table `kiosk_devices`:<br>• `enroll_code_hash` + expiry; a single-use 12-char pairing code<br>• `device_token_hash`; a 32-byte token in an httpOnly cookie `cf_kiosk`, 1-year life<br>• `status` enrolled → active → revoked<br>• `withKioskAuth`: an org principal with **no staffId**.<br>This is exactly the "org-tied, no staff" credential pattern; reuse it, do not invent a second one. |
| Settings | `src/app/settings/hardware/page.tsx` → `HardwareSection.tsx` (39 lines: Camera / scanner, Shipping scale). It has no print-station section. |
| Placement law | Operational rows (print jobs, stations, records) never render in the left sidebar. They belong in the central workspace (`ds_contract` → `NavRecentsList.doNot`). |

---

## 3. Industry practice to adopt (sources)

- **Workstations are devices with admin-set display names everyone sees.** You can disable or share
  a device, and **deactivate** a workstation, which removes it and its devices. Per-document-type
  **default printers** skip the picker. ShipStation Connect:
  [settings](https://help.shipstation.com/hc/en-us/articles/7920836720027-ShipStation-Connect-Settings),
  [default printers](https://help.shipstation.com/hc/en-us/articles/360035969792-Set-Default-Printers).
- **A print client is an always-on agent registered to the account, not to a person.** The app
  lists "computers" and "printers" through the API and sends jobs to a printer id. PrintNode:
  [API](https://www.printnode.com/en/docs/api/curl), [FAQ](https://www.printnode.com/en/faq).
  QZ Tray: [print server](https://qz.io/docs/print-server).
- **Device enrollment with a pairing code.** A device credential, not a user session (as the repo's
  kiosk devices already do).
- **FBA unit labels:**
  - **Format:** Code 128 FNSKU plus title and condition.
  - **Size:** commonly thermal 2×1 in on a roll, or 30-up sheets (Avery 5160, 1×2⅝ in).
  - **Volume:** one label per unit, printed per shipment batch.
  - Sources: [Avery](https://www.avery.com/help/article/fba-labels),
    [eComEngine](https://www.ecomengine.com/blog/amazon-fba-labels),
    [Cleverence 2×1 thermal](https://www.cleverence.com/label/templates/gallery-fnsku-thermal-2x1).
  - Owner's floor fact: **≤ ~30 per FNSKU per batch**.

---

## 4. Build — in this order, each phase shippable alone

### Phase A — Print popover and record quality of life (UI only)

Applies to both `FnskuBulkPrint` and `FnskuPrintRecord`; they share the pickers.

1. **CTA at the top.** Order: **Labels of each** → **Print CTA** (with Test print as its secondary
   in the record) → status / notice line → **Print at** (stations).
   - The CTA sits directly under the quantity control.
   - The CTA label stays live: `Print 6 labels → Packing bench`.
2. **Quantity range switch.**
   - A compact segmented control on the quantity row: **20 · 30 · 99** (owner's ranges). Use the
     house `SegmentedGlyphSwitch` or a segmented primitive; check before forking.
   - **Default 30** for FNSKU.
   - Each range sets the slider's stops:
     - 20 → `1 2 3 5 8 10 12 15 20`
     - 30 → `1 2 5 10 15 20 25 30`
     - 99 → today's stops.
   - The Exact input clamps to the range's max.
   - The chosen range is remembered **per staffer** in `staff_preferences.prefs`, like
     `triageDensity`, with one key `fnskuCopyRange`.
   - The wire clamp stays `MAX_LABEL_COPIES = 99`. The range is a UI scale, not a new limit.
3. **Slider look** (`StopSlider`):
   - Stop dots are the **same height as the track**.
   - The **selected (held) stop chip and the passed fill / thumb are neutral grey**, not
     `fill-info` blue.
   - Add a variant prop (e.g. `tone="neutral"`) and use it for label quantities only. Changing every
     slider is an owner call: list the six other consumers and ask first.
   - Tokens via `ds_tokens color`; no hex.
4. **Print icons for stations:**
   - In `StationRow`, replace `Monitor` with the print glyph (`Printer`).
   - A station with a label printer ready shows the printer glyph; offline shows it muted.

**Acceptance A:**
- In both the popover and the record, the CTA is the first control under the quantity row.
- Range 30 is the default, and switching to 20 or 99 rescales the stops.
- Dots measure the same px height as the track.
- No `fill-info` on the label-quantity slider.
- Station rows show printer glyphs.
- Playwright at 1440×900 shows all of the above; screenshots go in `/tmp/fnsku-print-a/`.

**Status: landed 2026-10-04.** (1) Popover (`FnskuPrintPanel`) and record now read Labels →
**Print CTA** (record: Test print beside it) → blocked / status line → **Print at**; the popover's
station list stays the `min-h-0 flex-1 overflow-y-auto` region. (2) The quantity row carries the
house `SegmentedGlyphSwitch` (new `wordless` option: the number is its own glyph) for **20 · 30 · 99**;
constants in `src/lib/print/labelCopies.ts` (`FNSKU_COPY_RANGES`, `DEFAULT_FNSKU_COPY_RANGE = 30`,
`FNSKU_COPY_STOPS`, `clampToCopyRange`) so `/m/fnsku` can share them; remembered per staffer as
`staff_preferences.prefs.fnskuCopyRange` through `useStaffPreferences` (`useFnskuCopyRange`,
`src/features/print-station/fnsku-copy-range.ts`, PUT schema accepts 20/30/99 only). Exact clamps to
the range; a smaller range clamps the run; the wire clamp stays `MAX_LABEL_COPIES`. `QuantityPicker`
moved to `FnskuQuantityPicker.tsx`. (3) Slider: per the owner's later ruling the change is at the
ROOT (`StopSlider`, every consumer, no variant): dots flush with the track (same height, both
sizes), fill `bg-text-soft`, reached dots / thumb `bg-text-muted`, chosen chip `bg-surface-strong`,
keyboard ring `ring-border-strong` — no `fill-info` left in the primitive. (4) Glyphs: already landed.
Proof (`/tmp/fnsku-print-a/probe.mjs`, :3050 1440×900): popover slider bottom 383 → CTA 403 → Print at
455 → first station 488; record slider bottom 525 → Print / Test print 554 → Print at group 623; track
12px, every dot 12px (popover 8 dots, record 10, tote-run slider 12/12); 0 `fill-info` on the slider;
chips 30 = `1 2 5 10 15 20 25 30`, 20 = `1 2 3 5 8 10 12 15 20` (copies clamped 30 → 20), 99 = today's;
Exact 50 in range 30 → 30; 99 survived reload, then 30 restored and survived reload. Screenshots:
`popover-range{20,30,99}.png`, `record-range{30,99}.png`, `consumer-tote-run.png`, `consumer-stock-qty.png`
(StockQtySlider in the stock record: track 12px, 21 dots all 12px, 0 `fill-info`).

### Phase B — Edit stations where you print (popover + record)

**Status: landed 2026-10-04.** The picker moved to `src/features/print-station/StationPicker.tsx`
(shared by the record, the bulk popover and the row Print). Rows: this computer · the org label
default (badged *Default*, even offline) · live stations · the chosen one; the rest behind **Show
offline (N)**. Pencil and **Make default** reveal on row hover (`setOrgAssignment('label', id)`,
gated on `canManage` = `settings.hardware`, renamed from `canRenameOthers`). Printer glyph, ink
when the label printer is ready, faint offline. The popover caps at the viewport and scrolls the
station list. Proof (Playwright :3050): 8 shown + `Show offline (2)` → 10; hover opacity 0 → 1 on
pencil and Make default; Make default persisted (`/assignment` label = the station), re-open sorts
it second and pre-selects it; assignment restored to `null` after.

1. **Rename** stays inline (it exists: pencil on the row, `rename`, gated by
   `thisComputer || canManage`). Make it discoverable:
   - name the row by its name, never "Unnamed computer" (§C)
   - the pencil shows on row hover.
2. **Make default for FBA labels:** a row action that calls `setOrgAssignment('label', id)`,
   gated on `settings.hardware`. The default station is pre-selected and badged *Default*.
3. **Hide stale stations from the picker:**
   - Show only live stations plus the org default (even if offline, so its outage is visible).
   - A **Show offline (N)** disclosure lists the rest.
   - No "Unnamed computer" rows unless live.

**Acceptance B:**
- The popover lists ≤ the live count plus the default.
- Rename and Make default work from the popover and persist (re-open shows them).
- Offline rows hide behind the disclosure.

### Phase C — Organization print stations: enrolled, always on, no staff (data + auth)

Model it on kiosk devices. **One device credential pattern in the repo.**

**Status: landed 2026-10-04** (follow-up handoff `HANDOFF-print-station-phase-c-2026-10-04.md`).
- Credential: `kiosk_devices.kind = 'print_station'` (migration `2026-10-04c`); every kiosk lookup
  in `kiosk-device.ts` now filters `kind = 'kiosk'`, so neither credential acts as the other.
- Server: `src/lib/print/print-station-device.ts` (enrol · pair · resolve · `cf_print_station`
  cookie), `withPrintStationAuth` (401 `PRINT_STATION_UNPAIRED`), registry: list excludes revoked,
  always lists enrolled, returns `kind` / `paused` / `lastJobAt`, epoch `last_seen_at` = never
  heard; `setPrintStationPaused`, `revokePrintStation` (enrolled: device revoked, name freed),
  `listStationJobs`, `recordEnrolledStationHeartbeat`. A browser heartbeat clears `revoked_at`.
- Routes: `POST /api/v1/print-stations/enroll`, `PUT …/pause`, `POST …/revoke` (`settings.hardware`,
  audited `print_station.*`), `GET …/jobs?station=` (`print.label`); device routes
  `/api/print-station-device/{pair,heartbeat,realtime-token,fnsku/[fnsku],print-jobs}` (public
  path; token capability = its own station channel only). `label_print_jobs.station_id` is written
  by both the device and the staff path (`printFnskuStationJob` sends this computer's id).
- Page: `/print-station/device` (route-tree node `print-station-device`,
  `printStationDeviceHref({ code })`, params spec owns `code`), public chrome even when signed in.
  FNSKU only; other grains answer "This station prints FBA labels only". **Documents are not
  printed by enrolled stations**: their bytes need a device-authed document route — a separate
  security review, not built.
- Senders: `Paused` blocks in `StationPicker` / QC picker / `blockedReason`; enrolled stations
  wear an *Enrolled* tag and are blocked for non-FNSKU senders.
- Proof (Playwright :3050): enrol from Stations → second context with no staff cookie pairs via
  `?code=` → reload + storage clear keeps the same station and name → 3 FNSKUs × 2 sent from
  `/print-station`, device shows 3 printed jobs, `label_print_jobs.station_id` set for all 3 →
  Pause: the sender row is disabled and reads Paused → Revoke (confirm dialog): gone from lists,
  device 401 and shows Revoked after 10.3 s (< one 15 s heartbeat).

1. **Enrollment:**
   - An admin with `settings.hardware` creates a station by name (e.g. "FBA label bench").
   - The server mints a single-use pairing code with an expiry.
   - On the target computer, open `http://localhost:3050/print-station/enroll` and enter the code.
     The path is not final: get it from `ds_route` or ask the owner.
   - The server sets an httpOnly station cookie holding a device token.
   - The `print_stations` row is now **owned by the org**, with `enrolled_by_staff_id` for audit
     only.
2. **Credential:**
   - Reuse `kiosk_devices` with a `kind` column (`kiosk` | `print_station`), or add a sibling table
     with the same columns; decide by reading `kiosk-device.ts`. Prefer reuse.
   - The station's `station_id` is bound to the device, not to `localStorage`, so clearing browser
     storage cannot mint a new station.
3. **Always-on runtime:**
   - An enrolled station page runs with **no staff session**.
   - It heartbeats as the device, subscribes to its org station channel, and executes
     `fnsku` / `documents` jobs.
   - Senders still need `print.label`.
   - The station shows its name, its printer readiness, the last jobs, and an "Online" indicator.
     It shows no staff name.
4. **Registry shape:**
   - Add `kind: 'enrolled' | 'browser'`, `enrolled: boolean` and `revoked_at` (or the equivalent) to
     `print_stations`.
   - Enrolled stations require a unique, non-default name.
   - **Migration:** hand-written SQL (read `skill://db-migration-author`), tenant-scoped (RLS forced
     on `print_stations`).
5. **Browser stations remain** for ad-hoc "print here", but they are not listed for others unless
   live. A cleanup job may retire browser stations that have been unseen for 30 days. Propose it;
   don't delete data without the owner.

**Acceptance C:**
- Enroll one station on a second browser profile with no staff signed in.
- From `/print-station`, send 3 FNSKUs × 2 labels to it.
- It prints (or, with no printer, logs the jobs).
- It survives a reload and a storage clear (same station, same name).
- Revoking it from the control plane stops it within one heartbeat.
- Tenancy guard: `verify:fast` "Tenancy isolation" is green.

### Phase D — The control plane (one place to manage stations)

**Placement (owner 2026-10-04): a Print station MODE, not Settings.** The Print station has two
modes on its sidebar card, `G` then a letter: **G F FNSKU labels** (printing) and **G S Stations**
(managing). Stations lives at `/print-station/stations` (route-tree lane `print-station`, nodes
`fnsku-labels` and `print-stations`, `PRINT_STATION_PATHS`; vocabulary term *Print station*).

**Landed with the switcher (2026-10-04):** the table (`PrintStationsDesk`, one `TriageRow` per
station: Online / No printer / Offline · name · printers · default for · last at it · last heard;
Find narrows by name or printer) and the open station (`?station=`, `PrintStationRecord`): rename
for the org, Make default / Clear per stock (Labels, Paperwork), Test print (one TEST PRINT label of
the catalog's first FNSKU, never logged). Non-admins read only. Proof (Playwright :3050): `G S` →
`/print-station/stations` with 7 stations, `G F` → back; mode-card hover teaches `G then F / S`;
Make default (labels) → row reads `Default · Labels` and sorts second → Clear → `null`; rename
"Smoke station B" → "Smoke station B2" → restored.

**Landed with Phase C (2026-10-04):** header **Add print station** (popover under the button:
name → single-use code + QR of `/print-station/device?code=…`, `react-qr-code`); the record gains
Kind, Last job, the Job log (last 50: FNSKU, copies, time, Reprint), Pause / Resume, and Revoke
(enrolled) / Forget (browser) behind `requestConfirm`; the row gains a Last job fact and the
Paused state. An enrolled station cannot be the paperwork default.

**FNSKU face (owner 2026-10-04):** exactly Amazon's — barcode, FNSKU, title, condition; regular
weight, text on the bars' left edge; no print stamp (Test print prints the real face). The browser
fallback no longer forces `@page` size: the printer's media is the page, one label per page, and a
portrait-reported page turns the face a quarter, so it never splits across stickers.

**One table of org stations.** Columns:
- name
- kind (Enrolled / Browser)
- status (Online / Offline · last seen)
- label printer (+ ready)
- paper printer
- default for (FBA labels / Documents)
- last job.

**Row actions:**
- Rename
- Make default (label / paper)
- Test print (sends the test FNSKU face; it exists as `sendFnsku(…, {test:true})`)
- Pause (rejects jobs, shows Paused)
- Revoke (enrolled) / Forget (browser).

**Header actions:**
- **Add print station** (Phase C enrollment: name → code + QR to scan on the target computer)
- **Show offline**.

**Job log per station:**
- the last 50 jobs, from `label_print_jobs`: FNSKU, copies, sender, time, outcome
- a reprint action.

**Acceptance D:**
- An admin can find, rename, set the default, test-print, pause and revoke any station without
  visiting that computer.
- A non-admin sees the table read-only.

---

## 5. Contracts (do not break)

- `sendFnsku(stationId, fnsku, copies, {test})` keeps its signature; enrolled stations are just
  another `stationId`.
- `MAX_LABEL_COPIES` stays 99 on the wire. The UI range is separate.
- Every FNSKU print still logs `label_print_jobs` (`template_id = 'fba_fnsku'`, `qr_payload =
  FNSKU`). Test prints never log. The Print station's Reprinted view and recency order read this.
- Kiosk devices keep working unchanged if the credential table is shared.

## 6. Quality-of-life candidates (propose; build only what the owner picks)

- **Default per stock:** the FBA-label default station pre-selected, as above.
- **Remember last copies per FNSKU** (or per SKU family), not only per staffer.
- **Queue view per station:** queued, printing, done, failed, with retry. Partial-failure toast
  names which FNSKUs failed (the bulk loop already counts them).
- **Printer status:** paper-out / head-open, where the bridge can read it (Zebra host status).
  Otherwise "last job failed" is the signal.
- **Label size per station** (2×1 thermal vs 30-up sheet), so a sheet station gets a sheet layout.
- **Keyboard:**
  - `P` opens Print for the checked set.
  - Number keys set copies.
  - Enter prints.
- **Row Print on hover** (owner 2026-10-04, landed): each FNSKU row (Compact and Full) reveals a
  **Print** CTA at its right edge on hover; it opens the print popover for that one FNSKU, so a
  label prints without opening the record. Shares `FnskuPrintPanel` with the bulk Print labels, so
  Phase A's CTA-at-top / range switch land in both at once.

## 7. Non-goals

- QC / bin / document label redesign.
- PrintNode or any third-party print service.
- Mobile `/m/fnsku` changes beyond sharing the range constants.

## 8. Verification for every phase

- `node scripts/typecheck.mjs`, `pnpm verify:fast`, and eslint on touched files.
- A Playwright script at :3050 with measured assertions: CTA order, dot height vs track, range
  stops, station counts.
- Smoke-print to a real or test station, reporting what printed.
- Update `docs/design-system/RECORD-CARD-MIGRATION.md` (or a print-station ledger) with what
  landed and the proof.
