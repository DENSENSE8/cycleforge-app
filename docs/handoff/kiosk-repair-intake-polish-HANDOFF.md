# HANDOFF — Kiosk repair intake polish: phone keypad, serial scanning, signing, reasons, receipt, ticket # (2026-09-25)

Paste everything below the line into a fresh agent session started in
`~/Projects/cycleforge-lanes/prod`.

---

You are continuing work on the counter tablet `/kiosk/v2` and its phone
companion `/m/repair-scan`. Read first: `AGENTS.md`,
`docs/handoff/kiosk-one-cart-HANDOFF.md` (the previous pass — its open items
still stand: integrated browser check, `pnpm verify:fast` foreign reds, the
unrecorded `2026-09-24d_kiosk_carts.sql`), `docs/mobile-first/SURFACE_LAW.md`,
`docs/handoff/mobile-ds-law-exoskeleton-HANDOFF.md`.

Rules: origin `http://localhost:3050` only. Never press Save / Check in & print /
Pay (they write permanent rows). Clear every cart you build. Headless probes:
`/usr/bin/chromium --headless=new --no-sandbox --disable-gpu
--user-data-dir=/tmp/<fresh-each-time>` (a reused profile hangs CDP); hide the
Next dev overlay with
`document.querySelectorAll('nextjs-portal').forEach(n=>n.style.display='none')`.
Don't edit other people's in-flight files. Finish with `pnpm verify:fast`
(report foreign reds; fix ours).

## The operator's asks (2026-09-25), with where the code is today

### 1. Phone keypad = a mounted display opened by tapping the phone field, not a keypad inside the form
- Today: `src/components/kiosk/KioskCustomerIntake.tsx` renders the phone
  `KioskEntryField` with `inputMode="none"` and a permanent
  `<KioskPhoneKeypad onPress={pressKey} />` (from `KioskAmountKeypad.tsx`)
  inline under it, on both the cart Contact step and the repair Contact step.
- Wanted: the keypad is NOT in the form. Tapping the phone field mounts a
  keypad display; it goes away when done. First confirm whether iPad Safari
  can show a numeric-only pad for a web input (`inputmode="numeric"`/`tel` on
  iPad = full keyboard on the numbers row — no phone pad). Because it cannot,
  build a **custom floating keypad**: anchored bottom (thumb zone), the typed
  number shown large at its top, `1-9 / C 0 ⌫`, and an **X** that closes it.
  Keep: `inputMode="none"` (no OS keyboard), hardware keyboard still types,
  Return = Continue (`onSubmit`), lookup on the 10th digit
  (`useKioskCustomerMatch`) and the "On file · Name" line. Auto-close after the
  10th digit is fine if it does not shift layout under the thumb. The floating
  pad must not cover the step's Continue (see `KioskPaneForm` floor).

### 2. Serial scanning on the phone: more useful, on the mobile exoskeleton, barcode AND QR
- Today: `src/components/mobile/repair/RepairScanCompanion.tsx` (mounted by
  `src/app/m/(shell)/repair-scan/page.tsx`) — a hand-rolled list of units +
  `MobileCaptureWindow`. Tablet side: `useKioskCompanionLink`,
  `KioskCompanionPanel`, `/api/kiosk/companion[/sync]`, `/api/counter/companion`,
  table `kiosk_companion_links`.
- Scanner: `src/hooks/useBarcodeScanner.ts` already decodes QR, Code128,
  Code39, Codabar, DataMatrix, ITF, EAN-13/8, UPC-A/E (ZXing, TRY_HARDER) —
  verify on a real serial sticker and a QR; add PDF417 / Aztec only if a
  real label needs them.
- Wanted: rebuild the phone screen on the **exoskeleton** — `DetailHubScreen`
  + `DetailSummaryCard` (the visit: customer, N units, tablet it belongs to) +
  `detailDoor` rows per unit (serial or "Needs serial") + `DetailDock`
  (≤3 verbs, one primary: Scan). Obey `src/lib/mobile/detail-hub-law.ts` (gated
  in `verify:fast`). Make scanning useful: auto-advance to the next unit
  missing a serial (already), clear confirmation of which unit a read landed on
  (haptic/flash + the value), one-tap re-scan / undo of the last read, reject
  obvious non-serials (a URL QR → offer to open it, or extract a serial param),
  duplicate-serial warning across units, and a typed fallback. Serials still
  land on the tablet through the same line write (`patchDevice`).

### 3. Full-screen signing mounts at the BOTTOM, not the middle
- Today: `src/components/ui/SignaturePad.tsx` `allowFullscreen` → a Radix
  Dialog; fullscreen keeps the aspect law (fixed height), so the pad floats
  mid-screen with dead space.
- Wanted: in fullscreen the pad is anchored to the bottom edge (thumb/wrist
  rests at the bottom of the tablet), header/Clear/Done above it. Keep the
  stroke-restore across expand/collapse and the re-export on resize.

### 4. Repair reasons: contextual — all units, or per unit, with a switcher
- Today: reasons are a VISIT fact — `KioskReasonStep`
  (`src/components/repair/KioskReasonStep.tsx`) writes `formData.repairReasons`,
  and `KioskRepairPane` mirrors them onto EVERY repair line
  (`RepairPayload.repairReasons` is already per line in `cart-line.ts`).
  Vocabulary is per SKU (`useKioskSkuReasons`, `sourceSku`).
- Wanted: the Reason step offers **All devices** (one set applied to every
  unit — today's behaviour) or a **per-unit switcher** (segmented control /
  chip row of the units, grouped by SKU like Device & quote; each unit gets its
  own reasons from its own SKU vocabulary). An **All issues** view lists every
  unit with its reasons. Gates (`repairStepGates`, `missingRepairIntakeFields`
  "reason or notes" per device) must check per unit. Linked repairs
  (`isLinkedRepairLine`) never ask for reasons.

### 5. Reasons print per item on the receipt
- Today: `src/lib/counter/visit-receipt.ts` / `visit-receipt-html.ts` print no
  per-device issue (no `repairReasons`/`issue` in them). Each device is its own
  `repair_service` row with `issue` (written from that line's reasons at
  submit — see `submit-counter-transaction.ts` ~688 / ~820).
- Wanted: every repair item on the visit receipt shows its own reasons/issue
  under its title (customer and staff copies). Add a unit test in
  `visit-receipt.test.ts` for two devices with different reasons.

### 6. The ticket number prints on the paperwork
- Today: `RepairServiceForm.tsx` / `repair-paper-html.ts` render a "Repair
  Ticket Number" row fed by `ticketNumber`; on the kiosk Review & sign step it
  came out BLANK (`KioskRepairPane` passes `paperworkTicketId` = linked ticket
  or `useNextTicketPreview(step === lastStep)` → `/api/kiosk/repair/next-ticket`;
  check why it is null — endpoint failure, gating, or formatting in
  `formatRepairPaperTicketNumber`). The printed drop-off paperwork (after
  submit) must carry the real RS/ticket number per device.
- Acceptance: Review & sign shows the expected ticket number on every sheet;
  the printed paperwork shows the real one.

## Acceptance for the whole pass
- Each ask verified on `:3050` (tablet 1180×820; phone 390×844 with a staff
  session — mint one via `createSession` from `@/lib/auth/session` with
  `deviceKind: 'phone'` for the "QA Mobile Verifier" staff id 19576 and set
  cookie `cf_sid__l7`; revoke it afterwards).
- Unit tests for: per-unit reasons gate, receipt per-item reasons, keypad
  press logic if changed.
- `pnpm verify:fast` green except foreign reds, which you name.
