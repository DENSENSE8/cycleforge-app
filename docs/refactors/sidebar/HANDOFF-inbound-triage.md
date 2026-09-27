# HANDOFF — Inbound triage: status chips, check fixes, Exceptions view, urgency sections

**Paste everything below the rule into a fresh session pointed at
`/home/michaelgarisek/Projects/cycleforge-lanes/prod`.** Written 2026-09-27.

---

You are continuing the Inbound (`/incoming`) triage port. The base is built and
smoke-verified on `:3050`; your job is four features, **one at a time, in this
order**, each landed and verified before the next.

## 0. Before anything

1. Read `AGENTS.md` (probe only `http://localhost:3050`; lane unit
   `cycleforge-lane@prod`).
2. Run `pnpm verify:fast`. The last full run predates the card face. Known red
   that is NOT ours: Boundary gate on `src/components/assistant/ChatPrintJobCard.tsx`,
   and `src/app/api/nav/context/route.test.ts` "org nav override … reaches the
   section" (fails at HEAD too). Anything else red → fix before building.
3. Two other sessions share this worktree:
   - **Sidebar foundation** owns the existing files in `src/components/sidebar/contextual/*`,
     `src/lib/nav/context/build.ts`, `src/lib/nav/spine-slots.ts`.
   - **Orders data table** owns `src/components/outbound/**`,
     `src/components/unshipped/**`, `src/components/tables/**`,
     `src/lib/orders/order-card-model.ts`.
   Read them for patterns; do not edit them. Your lane:
   `src/components/receiving/**`, `src/components/station/ReceivingLinesTable.tsx`,
   `src/lib/receiving/**`, `src/app/api/receiving-lines/**`.
   Exception: `NavBulkList.tsx`, `NavBulkPopout.tsx` and the bulk paste
   additions in `NavFind.tsx` / `ContextualSidebar.tsx` are ours (see below).

## What exists (read these first)

- **Contextual sidebar on `/incoming`**: `NAV_CONTEXT_ROLLOUT.incoming = 'contextual'`
  (`src/lib/nav/context/rollout.ts`), `LANE_DOORS.inbound = 'incoming'`
  (`src/lib/nav/lanes.ts`), search decl + `bulk` in `src/lib/nav/context/pages.ts`,
  `NavSearch.bulk` in `src/lib/nav/context/schema.ts`. Page frame:
  `src/app/incoming/page.tsx` (`DeskPageLayout bare stage="card"`).
- **Paste a list**: `src/components/sidebar/contextual/NavBulkList.tsx`
  (`useNavBulkList`, `NavBulkToggle`, `NavBulkStatus`) and `NavBulkPopout.tsx`.
  URL: `?ref_in=` (operator strings) + `?recon=` (bucket). Law pinned as
  `NavBulkList` in `src/design-system/pinned.json`.
- **Verdict per pasted number**: the Unbox Check,
  `POST /api/receiving-lines/incoming/check-zoho-received`, read once through
  `useInboundCheck` (`src/lib/receiving/inbound-check-query.ts`), mapped by
  `reconOfCheckRow` / `reconcileCheck` (`src/lib/receiving/reconcile.ts`, tests in
  `reconcile.test.ts`). Received = dock scan or unbox (physical-first).
- **Rows for a pasted list**: `GET /api/receiving-lines?view=reconcile&ref_in=…`
  (`build-sql.ts` → `lineRefMatchSql`, lineless cartons via
  `buildUnmatchedPlaceholdersSql`; tests at the end of `build-sql.test.ts`).
  Client: `incomingMode.buildParams` in `src/lib/receiving/receiving-modes.ts`;
  filter by bucket: `filterRowsByRecon` in `ReceivingLinesTable.tsx`.
- **Two display faces** (the To-ship pattern): `IncomingDeliveriesLedger.tsx`
  owns state and picks the face — In place / Split = triage cards
  (`src/components/receiving/incoming/cards/IncomingDeliveryCard*.tsx`), Floor
  (⌘/Ctrl+Shift+F, registered via `useDeskFloorFace`) = industrial `RecordLedger`.
  Unbox embeds (no desk stage) stay on the ledger.

## Feature 1 — Status chips top-left above the table

**Operator ruling 2026-09-27, supersedes the earlier spec** ("a strict set of
status filters directly below the search bar"): Received / Not received are
STATUSES of the list, so they sit top-left above the data table like
To-ship's `?cardStatus=` chips — not in the sidebar.

- New chip row in the card list's anchor (`IncomingDeliveryCardList`), and the
  same chips in the Floor ledger toolbar. Pattern to read (do not import):
  the status chips in `src/components/outbound/orders/cards/OrderCardSelectBar.tsx`.
- **No pasted list**: delivery-state buckets with counts — Delivered · not
  scanned, Arriving today, In transit, Awaiting tracking — writing the existing
  `?state=` param (`useReceivingModeContext` already reads it). This replaces
  the Delivery group of the hidden `DataTableFilterMenu`.
- **Pasted list**: Received · Not received with counts from `useInboundCheck`,
  writing `?recon=`.
- Then delete `NavBulkStatus` from `ContextualSidebar.tsx` / `NavBulkList.tsx`
  and update the `NavBulkList` pin's law (chips move, keys stay ⌥1–⌥N).

Acceptance: paste 5 numbers into Find → chips read `Received n · Not received m`
top-left; ⌥2 isolates the missing ones in both the cards and the popout; with
no list, `Delivered · not scanned` narrows the lane; sidebar shows no status rows.

## Feature 2 — Correctness of the check

1. **Warehouse-only numbers**: the Check resolves through the Zoho mirror /
   live Zoho / local shipments, so a manual or marketplace receipt with neither
   can read "No match anywhere" while the ledger shows its rows. Fix in
   `reconcile.ts`: when the Check row is `no_match && !local?.known` but
   `view=reconcile` returned rows for that key (`rowRefKeys`), classify from the
   rows (dock scan / unbox / received qty → received, else not received). The
   popout needs those rows too — share the reconcile rows via the same
   react-query key the table uses, not a second fetch. Add table-driven cases
   to `reconcile.test.ts`.
2. **More than 500 lines**: `RECONCILE_ROW_LIMIT = 500`. When the list response's
   `total > rows.length`, show "Only the first 500 lines are shown" above the
   list and do not apply a bucket filter to a partial set.

Acceptance: a pasted number that exists only as a manual receipt shows its real
status; a forced over-cap response shows the note and the chips disable.

## Feature 3 — Exceptions as its own view and table

To-ship's Exceptions is a destination, not a filter; do the same for Inbound.

- **Registration is shared with the sidebar session**: a new view row means an
  `incoming` child in `SIDEBAR_PAGE_NAV` (`src/lib/sidebar-navigation.ts`),
  a parity row (`src/lib/nav/context/parity.ts`), a glyph
  (`nav-view-icons.ts`: amber `AlertTriangle`, `alertCount`). Check whether the
  sidebar session has landed; if not, coordinate (leave a note in this doc)
  before touching their registries. The table itself is yours.
- **Table**: `?lane=exceptions` (add to `INCOMING_ROUTE_PARAMS` in
  `src/lib/routing/receiving-routes.ts`) — lines needing a person: STALLED,
  WRONG_DESTINATION, CARRIER_MISMATCH, TRACKING_UNAVAILABLE, Zoho-received with
  no dock scan (the Check's `erp_ahead`), delivered-unscanned past the SLA window.
  Server predicate in `build-sql.ts` (reuse the existing `delivery_state` arms
  and `CARRIER_MISMATCH_PREDICATE`), with `build-sql.test.ts` cases.
- **Detail in the dropdown**: the unfolded card / open record states WHY and the
  next action ("Carrier delivered to 94103 — warehouse is 94107 → Investigate").
- With Exceptions a view, paste buckets become Received · Not received only;
  exception numbers carry a badge that links to the Exceptions view.

Acceptance: sidebar shows `Exceptions` with an amber count; its table lists only
those lines; every row states its reason; a pasted exception links there.

## Feature 4 — Urgency sections in the card list

Receiving's version of To-ship's ship-by sections: under the default sort, the
cards are cut into Delivered · not scanned → Arriving today → In transit →
Awaiting tracking → Other, with section headers and J / K following the cut
(publish the sectioned order to `usePublishRecordCursor`). No new API.

Acceptance: the top of the list is always the next thing to walk to; J / K
crosses sections in order.

## Do not

- Do not edit the other sessions' files (above), and do not import their
  uncommitted components (`OrderCard`, `OrderCardList`, `OrderCardSelectBar`) —
  copy the pattern into receiving files.
- Do not add a second verdict engine: the Check (plus the Feature 2 fallback) is
  the one source for Received / Not received.
- Do not port ship-by SLA, "SKU in N orders" batching or the labels walk.
- Defer view counts in the sidebar and the bulk selection bar until the sidebar
  and orders sessions land (then share, don't copy).

## Verify each feature

`npx tsc --noEmit -p .`, the touched test files via
`node --import tsx --import ./scripts/register-server-only-shim.cjs --test <files>`,
`pnpm verify:fast`, and a Playwright smoke on `:3050` using the sign-in in
`tests/shot.mjs` (the omp browser tool is pinned to a relay that is not
connected). Screenshot each surface; delete throwaway scripts after.

## Coordination note — Exceptions view row (for the sidebar session)

Written 2026-09-27 by the Inbound triage session. The sidebar foundation had
NOT landed (`build.ts`, `spine-slots.ts`, `nav-view-icons.ts` uncommitted), so
the registry rows below were left for you. Everything else is built and live:

- **URL**: `/incoming?lane=exceptions`. `parseInboundLane` returns
  `'exceptions'`; `applyInboundLane(params, 'exceptions')` writes it (and drops
  `ref_in`, `recon`, `state` and the other Pipeline facets). Route hygiene
  keeps it (`INCOMING_ROUTE_PARAMS.lane` = `INBOUND_LANE_PARAM_VALUES`).
- **Table**: `GET /api/receiving-lines?view=exceptions`; one reason per row in
  `exception_code` (`src/lib/receiving/incoming-exceptions.ts`).
  `count_only=1` gives the total for the view count.

Still to add, in your files:

1. `SIDEBAR_PAGE_NAV.incoming` (`src/lib/sidebar-navigation.ts` ~L974): a
   child `{ id: 'exceptions', label: 'Exceptions', icon: AlertTriangle, to: () =>
   ({ pathname: INCOMING, params: { lane: 'exceptions', view: null } }) }`, and
   the child resolver at ~L976 must return `'exceptions'` for
   `parseInboundLane(...) === 'exceptions'`. Today it returns `'pipeline'`, so
   On the way stays lit on the Exceptions view.
2. `src/lib/nav/context/parity.ts` `incoming`: `['view', 'exceptions', …]`, and
   the `lane` param row's values gain `exceptions`.
3. `nav-view-icons.ts`: `'incoming.exceptions': { icon: AlertTriangle, tone:
   'text-amber-600' }` with `alertCount` from
   `/api/receiving-lines?view=exceptions&count_only=1` (amber count). Deferred
   per "Do not" above until view counts are shared.

Until then the view is reached by URL and by the pasted list's exception badge.
