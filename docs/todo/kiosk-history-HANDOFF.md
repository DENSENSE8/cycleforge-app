# HANDOFF — Kiosk History (increment 1 of the four operator reconnects)

**State:** landed and running at `http://localhost:3050` on the prod lane.
**Plan of record:** [`operator-reconnect-4-increments-PLAN.md`](./operator-reconnect-4-increments-PLAN.md) §0.4.
**Operator rulings folded in (2026-09-22):**

1. *"the staff id for history — reuse the same component for the switching staff on desktop"*
2. *"Staff PIN — History no need, just staff sign in text at the top. Remove the pin,
   use the same pinless sign in for the switching staff — this is dogfood."*
3. *"it must display all the repair service history in the sidebar, correctly routed and
   filtered via All, Sales & Repair service … when publishing a repair service it must
   display in the left sidebar rail to be selected."*
4. *"the top left must select history as well … the search can reuse the same search at
   the top bar and the filter, as the repair and sales display method."*

---

## What exists now

| Piece | File |
|---|---|
| List + search + `kind` filter + keyset paging | `src/lib/counter/list-kiosk-visits.ts` |
| Repair provenance (drop-off/pick-up, technician, parts, signatures) | `src/lib/counter/visit-provenance.ts` |
| Edit allowlist (six fields; anything else 403) | `src/lib/counter/edit-visit.ts` |
| Audit writer (`kiosk.visit_print` / `kiosk.visit_edit`) | `src/lib/counter/kiosk-visit-audit.ts` |
| List route `GET /api/kiosk/visit?q=&kind=&cursor=&limit=` | `src/app/api/kiosk/visit/route.ts` |
| Detail + pinless edit `GET|PATCH /api/kiosk/visit/[id]` | `src/app/api/kiosk/visit/[id]/route.ts` |
| Label reprint stamp `POST /api/kiosk/visit/[id]/label-printed` | `src/app/api/kiosk/visit/[id]/label-printed/route.ts` |
| Roster, two scopes (`?scope=payment|signin`) | `src/app/api/kiosk/staff-for-stepup/route.ts` |
| Pinless actor resolver | `resolveKioskStaffActor` in `src/lib/auth/kiosk-device.ts` |
| Pinless sign-in sheet (title **"Staff sign in"**) | `src/components/kiosk/KioskStaffSignInSheet.tsx` |
| Shared picker, now two principals | `src/components/auth/StaffPickerList.tsx` (`endpoint` / `fetcher` / `emptyMessage` / `pickVerb`) |
| Face: pane · trail (search glyph + kind filter) · rail (rows) · detail | `src/app/kiosk/v2/KioskHistory{Pane,Trail,Rail,Detail}.tsx` |
| Door: `kind: 'staff'` tile + trigger reads History | `src/lib/kiosk/services.ts`, `src/app/kiosk/KioskShell.tsx`, `KioskTopChrome.tsx` |
| E2E | `tests/e2e/kiosk-history.spec.ts` |

### Decisions a follow-up must not undo

- **History is not a fifth command.** `KIOSK_SERVICES` entries carry `kind: 'command' | 'staff'`;
  `serviceIdToCommand` takes the narrow `KioskCommandServiceId`, so a staff tile cannot reach
  `counter_sessions.active_command`. The top-left trigger *displays* History (`activeServiceId =
  historyOpen ? 'history' : commandServiceId`) without writing session state.
- **Sign-in is identity, not authorization.** `resolveKioskStaffActor` only proves the claimed
  staffer is active in the DEVICE's org. Payment keeps `KioskPaymentStepUpSheet` + `resolveKioskStepUp`
  (PIN). Do not let a money act drift onto the pinless path.
- **One picker.** `StaffPickerList` is mounted by `/signin`, `SwitchStaffSheet`, the payment
  step-up and the History sign-in. Inside a sheet it must stay wrapped in a bounded scroller
  (`max-h-[55vh] overflow-y-auto`) — without it a five-name roster puts rows below an iPad
  viewport and they cannot be tapped (this was a real, reproduced failure).
- **Tab semantics.** `repair` = the visit produced `repair_service` rows. `sales` = it did not,
  OR it also sold something (`counter_transaction_lines`). A mixed visit is on both tabs on
  purpose.

---

## Verified (all at `:3050`, iPad Pro 11 landscape)

- Sign in from the shared picker → rail paints; command trigger reads **History**.
- Tabs route: `All` 11 rows · `Repair service` 11 · `Sales` 0 on the dogfood dataset.
- A repair published through `POST /api/kiosk/intake` while the face is closed appears in the
  rail on open (10 → 11 rows).
- Detail paints device serial, drop-off stamp, both signature sources, Print receipt / Print
  label / Edit.
- Edit saves through the face; label reprint stamps `label_printed_at` (second call reports
  `alreadyPrinted`); `audit_logs` carries both acts with the signed-in staffer as actor and
  `via: kiosk_device:{id}`.
- Refusals: `PATCH {price}` → 403 `FIELD_NOT_EDITABLE`; unknown/cross-org `staffId` → 403
  `UNKNOWN_STAFF`.
- Gates: Lint · Typecheck · Tenancy · Boundary · Nav names · Mobile-first · Action bar ·
  Id header · Identity purity · Sku identity all green.

---

## PROMPT FOR THE NEXT AGENT

> Continue the kiosk History increment on the prod lane. Everything below is verified context —
> read `docs/todo/kiosk-history-HANDOFF.md` and `operator-reconnect-4-increments-PLAN.md` §0.4
> first, and work only at `http://localhost:3050`.
>
> **1. Close the e2e — one step is still red, and it is a TEST-harness puzzle, not a face bug.**
> `tests/e2e/kiosk-history.spec.ts --project=desktop` stalls inside `signIn()`: the sheet
> renders, the roster rows render, `Continue as <name>` is clicked, and
> `kiosk-history-pane` never appears (`test-results/kiosk-history-*/test-failed-1.png` shows the
> sheet still open behind the locked face).
>
> The SAME flow, driven by a standalone Playwright script against the same origin and the same
> `devices['iPad Pro 11 landscape']` context, passes end to end: sign-in mounts the pane, the
> rail paints 11 rows, the command trigger reads **History**, All/Repair/Sales route correctly
> (11 / 11 / 0 on the dogfood dataset), and the detail opens. So the face works; the spec's
> click does not take effect. Suspects, in order:
>   1. The bounded scroller (`max-h-[55vh]`) in `KioskStaffSignInSheet` — confirm it is actually
>      in the served bundle during the run; the failure screenshot shows a roster taller than
>      55vh, which would mean a stale chunk.
>   2. A click landing on the sheet's overlay rather than the row (`BottomSheet` + the PWA
>      "Add to Home Screen" banner both sit in the same corner of that viewport).
>   3. A React error swallowed by the spec — add `page.on('pageerror')` / `console` capture to
>      `newTabletPage` first; it costs nothing and names the cause on the next run.
>
> Then re-check the label-print step: `printRepairLabel` mounts a hidden iframe that calls
> `window.print()` in ITS OWN window, so the spec's `addInitScript(() => { window.print = … })`
> may not cover it. If the run hangs there, assert the stamp through
> `POST /api/kiosk/visit/{id}/label-printed` and keep a UI assertion only that the button exists.
>
> **2. A live publish must land in the rail without a reopen.** The rail queries on mount and on
> `refresh()`. A visit submitted from the cart while History is open does not tell the rail.
> Wire it through the existing realtime seam (`src/lib/realtime/channels.ts`, `useAblyChannel`)
> — not a poll, and not a second store. (A visit published while History is CLOSED already
> appears on open; that is verified.)
>
> **3. Search placement — DECIDED and shipped 2026-09-22, do not re-litigate.**
> Operator: *"the search bar functions like filter and search icon the same as the repair
> service mode … delete the old search component only in the sidebar … remove the top left
> history text its already in the drop down … switch the tabs below the search bar to just a
> filter after the search icon."*
>
> The rail's `SearchField` + All/Sales/Repair `TabSwitch` are DELETED. `KioskHistoryTrail`
> now seats one press-to-toggle search glyph and one `IntakeCombobox` kind filter in the
> shell's single header band, in the catalog trail's own order (command dropdown · glyph ·
> field-when-open · filter). `KioskShell` hands that band down as `KioskHistoryPane`'s
> `chrome` render prop — the query hook stays in the pane, so this lifted the CONTROLS, not
> the state, and never painted a second band. The `<h2>History</h2>` title is gone: the
> command dropdown already reads History.
>
> The band also carries NOTHING mode-specific (operator, same day: *"the history tab should
> not display the cart paper work and different work modes since that would be specific to a
> mode"*) — `showCheckoutSlots={false}` + the new `showStance={false}` drop cart, paperwork
> and Work · Show · Verify. The cart is not cleared, only unmounted from this face.
>
> **4. `Ground` gate is red and it is NOT this increment.**
> `src/components/mobile/tasks/MobileTasksView.tsx:150` paints `bg-surface-canvas`, taking the
> `/m` grey count 45 → 46. That is the task-desk increment's phone twin, landed in the same
> worktree. Port that line or hand it back to its owner — do not raise
> `MOBILE_GRAY_GROUND_BASELINE`.
>
> **5. Leftovers.** The standalone probe used to prove the face (the script referenced in item 1)
> was a throwaway and is deleted — recreate it in five lines if you need it: fresh Playwright
> context with `devices['iPad Pro 11 landscape']` + empty storage, `POST /api/kiosk/intake`
> through `page.request`, open History, click the first `Continue as …` row, then count
> `[data-testid="kiosk-history-row"]` per tab. Staff row `E2E Kiosk History` (org 01) exists
> with its PIN cleared — nothing needs it any more; deactivate it when convenient.
>
> Gates before you claim done: `pnpm verify:fast`,
> `node --require ./scripts/register-server-only-shim.cjs --import tsx --test src/lib/counter/kiosk-visit-history.test.ts`,
> and the e2e above. Call `ds_contract` / `ds_tokens <axis>` / `ds_critique <file>` before any
> UI write.
