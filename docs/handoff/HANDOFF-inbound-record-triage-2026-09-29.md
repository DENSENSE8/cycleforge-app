# HANDOFF — Inbound record triage face (owner 2026-09-29)

Paste this whole file as the prompt. It is self-contained.

## Goal

The inbound desk record (`/incoming` On the way · Docked · Unboxed) must read
like the outbound order record: the fulfillment band is the eye-catching lead,
the header names the record by its internal number and its platform, the steps
carry colour and real timestamps, and the latest step is always in view. One
record view already serves every inbound lane — change it, do not fork it.

## Already law — do not re-implement

- **Page chrome hides while a record is open** (HARD LAW, `pinned.json` →
  `DeskPageChrome`). `DeskRecordPlane` stamps `data-desk-record-open`;
  `DeskPageChrome` hides the page title ("Unboxed ›") and page CTA ("Add") on
  it. Verified on `/incoming` (all three lanes), `/shipping/orders`,
  `/print-station`. Never hide or show page chrome from inside a record.
- Header verbs (`RecordActionStrip face="header"`), `RecordFulfillmentSources
  flow="inbound"` (External · Internal · Both, carrier row on top),
  `CarrierEventsRail`, `RecordSerials`, `PhotoHoverPeek`, the Photos CTA — all
  shared with outbound. Reuse; do not copy.

## Files

- `src/components/receiving/record/InboundRecordView.tsx` — `InboundRecordTitle`
  (l.68), `internalRailSteps` (l.131), the Receiving group's internal
  `StepRail` (l.186), `left` column with the alerts card (l.401–428), `right`
  column with the Photos CTA (l.452+).
- `src/components/receiving/record/inbound-record-model.tsx` —
  `inboundCartonModel` title: `ref: poNumber ?? \`Carton ${receivingId}\``,
  `party: vendor ?? (poNumber ? null : 'Unfound')` (l.478–479);
  `inboundDeliveryModel` (l.269).
- `src/lib/receiving/inbound-record-status.ts` — `deriveInboundInternalSteps`
  (l.42), `inboundCurrentStatus` (l.61); step source
  `src/lib/receiving/carton-record-status.ts` (`deriveCartonSteps`).
- Outbound reference: `src/components/outbound/orders/OrderRecordView.tsx`
  (`OrderRecordTitle`, `OrderLineFulfilment` step tones via
  `LIFECYCLE.*.tone`), `src/design-system/components/record-ledger/CarrierEventsRail.tsx`
  (pin-to-latest horizontal scroll: `useLayoutEffect` + `ResizeObserver`,
  `data-initial-edge="latest"`).

## Change

1. **Header identity.** `# 53485 · eBay · Sep 29, 3:06 PM` — the internal
   record number (PO # when paired, else the carton id), then the PLATFORM
   (through `sourcePlatformMeta`, same face as `OrderRecordTitle`), then the
   date. Never the word "Carton", never "Unfound" in the header (unfound is a
   state, it reads in the status pill and the right-column notice).
2. **Colour on the internal steps.** Each step wears its lifecycle tone the
   way outbound does (QC warning · Picked info · Packed fulfillment · Scanned
   out success): pick the inbound tones from `@cycleforge/design-tokens`
   `LIFECYCLE` (add inbound states there if missing — one registry, both
   surfaces) so Docked / Unboxed / Graded / Tested / Put away are not black
   and white.
3. **Steps and timestamps.** The inbound ladder, each done step with its
   `By <who> · <date, time>`:
   `Ordered / Imported` (PO date, else the row's import time) → `Docked` →
   `Unboxed` → `Graded` → `Tested` (only when a line needs a test) → `Put away`.
   **Unboxed and Received are the same step** — merge them; no separate
   "Received" node anywhere (rail, status pill, `inboundCurrentStatus`).
4. **Latest step always in view.** The internal rail is one horizontal
   scroller pinned to its newest edge on open (the most recent step at the
   right), scrolling left for history — the exact behaviour of
   `CarrierEventsRail`. Extract that pin-to-latest scroller into ONE shared
   piece (e.g. `record-ledger/LatestEdgeScroller.tsx`) and use it for the
   carrier rail, the inbound internal rail and outbound's `OrderLineFulfilment`
   compact rail.
5. **Fulfillment leads.** The Receiving group is the first thing in the left
   column. Move the alerts card (`inbound-record-alerts`: "Unfound — no
   purchase order paired", "Claim ticket #10087", exceptions) to the RIGHT
   column, directly under the Photos CTA.
6. Keep every existing verb, test id and data path; no new endpoints.

## Acceptance

- `pnpm verify:fast` green.
- Smoke (throwaway Playwright, storageState `tests/.auth/admin.json`,
  baseURL `http://localhost:3050`; delete the script after), opening one
  record on each of `/incoming`, `/incoming?lane=docked`,
  `/incoming?lane=unboxed`, and `/shipping/orders`:
  - header reads `# <number> · <platform> · <date>`; no "Carton", no "Unfound";
  - `[data-testid="desk-page-header"]` not visible while the record is open;
  - internal rail steps have non-neutral tone classes; done steps show
    `By … · <date, time>`; no "Received" step;
  - the rail's scroller `scrollLeft` equals `scrollWidth - clientWidth` on
    open (pinned to latest), and it scrolls;
  - the Receiving group is the first child of the left column;
    `inbound-record-alerts` sits in the right column after `Photos`;
  - outbound order record unchanged apart from sharing the scroller.
- Screenshots of all four in `/tmp`, listed in the report.
