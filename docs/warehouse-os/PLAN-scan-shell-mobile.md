# PLAN — Scan Shell · MOBILE

**Status: PLAN → GOALS (overnight, Host-run). Written 2026-09-04.**
Umbrella: [`PLAN-scan-shell.md`](PLAN-scan-shell.md). Desktop twin:
[`PLAN-scan-shell-desktop.md`](PLAN-scan-shell-desktop.md).
Goal objects: `GOAL-scan-dispatch-table.md`, `GOAL-scan-shell-mobile-card-arrival.md`,
`GOAL-scan-shell-mobile-stack.md` (this folder) → Host JSON under
`docs/eval/goals/` once promoted.

## The phone in one screen

```
┌──────────────────────────────┐
│ ◀ Stack     ARRIVAL · UPS 4471 │   header: back = the Stack · dispatch · title
├──────────────────────────────┤
│ 1Z 999 AA1 01 2345 4471       │   the object
│ Goodwill Ohio · 2 cartons     │   1–3 facts
│ [ label ]  [ box ]            │   the step's inputs
│ ▶ UNBOX NOW · 3 orders wait   │   ONE primary, preselected, reason
│   Rack it for later           │   ≤ 2 secondary
├──────────────────────────────┤
│ ⌕ scan · type · say → Arrival │   the Field, destination named
└──────────────────────────────┘
```

No bottom tab bar of destinations. No drawer of pages. The camera / gun
scan is the Field's primary gesture; the Field also takes typed text and
voice (the companion dictation hook). The Card is one at a time. The Stack
is the only thing behind top-left.

## What already exists on the phone (reuse, do not fork)

| Need | Exists |
|---|---|
| Universal scan entry | `/m/scan` (`RedesignedMobileUniversalScan`), server-seeded Prioritize feed |
| Scan classes | `src/lib/barcode-routing.ts`: sku · bin · receiving (carton) · receiving-line · serial-unit · handling-unit (LPN) · manifest (kit) · support-ticket; `/m/r`, `/m/l`, `/m/u`, `/m/h` deep links; GS1 Digital Link builders |
| Wedge vs human input | `src/lib/keyboard/wedge-scan-machine.ts` (DataWedge keystrokes ride it unchanged) |
| Sessions with titles and intervals | `work_sessions` (title, `surface_key`), `work_session_intervals`, one armed scan session per org |
| Phone mouth | `StationComposerHost` (`showModeFaces={false}`) as mounted by `MobileCompanionComposer` |
| Voice on the phone | `useVoiceDictation` → `/api/ai/transcribe` |
| Photos | `usePhotoDropzone`, `downscaleImageTo720`, receiving photo tools |
| Queues as tables | `PRODUCT_TABLES`: `tasks`, `my-day`, `orders`, `sessions`; `work_assignments` |
| Search | `launch-index.ts` (`searchNav`) |

## Dispatch (mobile subset, in build order)

| Scan class | State | Card | Title | Goal |
|---|---|---|---|---|
| carrier tracking | never seen | Arrival: label + box photos → *Unbox now / Rack it* (system pick + reason) | `Arrival · {carrier} {last4}` | G2 |
| carrier tracking | known carton | carton's current stage | existing | G1 (route only) |
| LPN / SSCC | open QC | QC: works / doesn't · note · ticket | `QC · LPN {n}` | later |
| bin / tote | paired to pending order | Pack: order → label | `Pack · {order}` | later |
| bin / tote | unpaired | Bin preview | — | G1 |
| serial / SKU / kit / ticket | any | preview (existing pages) | — | G1 |

Rules (G1 owns them): no armed session → preview; armed session → an
expected class acts, any other class previews over it and parks nothing;
prior state wins, a tie asks one line on the Field; every dispatch names its
destination before acting.

## Goals

| # | Goal id | One verb | Done when |
|---|---|---|---|
| G1 | `scan-dispatch-table` | A pure dispatch table + three new scan classes (carrier tracking, SSCC, bin-paired-to-order) | `src/lib/scan/dispatch-table.test.ts` green · `verify:fast` green · router refuses hold · slot-table KEEP untouched |
| G2 | `scan-shell-mobile-card-arrival` | On `/m/scan`, a never-seen tracking scan opens the Arrival Card (photos → Unbox now / Rack it with a recommendation and reason) and titles the session | `src/lib/scan/arrival-card.test.ts` green · `verify:fast` green · composer router refuses hold |
| G3 | `scan-shell-mobile-stack` | Top-left back on `/m/*` opens the Stack: Now · Earlier today · Queues · Find; long-press jumps; resume in place | `src/lib/scan/stack-model.test.ts` green · `verify:fast` green |

Order: G1 → G2 → G3. Each is one Host run; the verifier starts the next when
the previous lands or stops.

## Gates the operator checks by hand (after the Host lands)

1. Twenty scans across five classes land on the right Card; the Card paints
   under 100 ms after the scan (measure with the wedge machine timestamp →
   first paint).
2. One shift on one phone with no menu opened. Every "I wanted a menu" is a
   missing dispatch row, logged in the GOAL file.
3. Any work order from the shift reachable from the Stack in two presses.

## Not in this plan

Desktop rails and the desk Field (twin plan). Templates, community catalog,
native shell. The QC and Pack Cards (next goals after G3). Voice-directed
picking (the numbers in the umbrella are directed voice; this plan's voice
is the exception path only).
