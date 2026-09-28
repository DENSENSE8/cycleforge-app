# Handoff prompt — triage views: one face, one declaration per nav VIEW

Paste everything below the line into a fresh long-running session.

---

You are continuing CycleForge's triage-face work. The face exists, three views wear it, and every
view is declared in its own file keyed by its nav id. Your job is to extend it view by view — the
owner's ruling (2026-09-27) is **declarations per VIEW, not per page and not per table**: Outbound
Shipping, FBA and Exceptions should look drastically different; they share only the interaction
engine.

Worktree: `/home/michaelgarisek/Projects/cycleforge-lanes/prod`.
- Read `AGENTS.md` first. Dev origin is `http://localhost:3050` ONLY (lane unit `cycleforge-lane@prod`).
  If the lane dies, read `journalctl --user -u cycleforge-lane@prod -n 50` before restarting — a
  Turbopack cache panic ("Restore of All … failed") is not your code; a compile error may be.
- The tree is shared with live sessions. Re-read a file right before editing it; never revert what
  you did not write; never commit without asking; report red in other people's files, don't fix it.
  Another session edits `TriageSelectBar.tsx`, `DeskRecordViewSwitch.tsx` and `OrderCardList.tsx`
  (it moved the record header to `OrderRecordHeaderActions`) — adapt, don't overwrite.
- Screenshots: `tests/shot.mjs` defaults to `:3000` — always `PW_BASE_URL=http://localhost:3050`.
  Probes that switch the desk view must switch it back (it is a remembered per-staffer setting);
  probes that write must `page.route`-intercept the write. Delete throwaway probe scripts from the
  worktree root before you finish.

## The architecture (landed — read the code, don't redesign it)

```
nav view (page.item)  ──►  TriageViewDecl  (src/lib/triage/views/<view>.ts)        ← MEANING, as data
host (per view)       ──►  TriageFeed      (rows, selection port, open, paging)     ← DATA + URL
adapter (per view)    ──►  row fns + card  (cardModel, groupKey, exactFind, Card)   ← ROW → RecordCard
                             └──── triageFamily(view, rowFns) ────► TriageCardList  ← INTERACTION (shared)
```

- Face: `src/design-system/components/triage-card-list/TriageCardList.tsx` — bar (Law 5 verbs at 1
  and N), pages / Scroll / server pages, held-new, X · Space · Enter, J / K and ↑ / ↓ (record cursor),
  sticky sections with counts, Esc resets chips, record plane (no Find of its own — the page field lives in the sidebar, or the global header while the sidebar is closed). Contracts:
  `TriageFeed`, `TriageFamily`, `TriageSelectionPort`, `TriageServerPages`, `TriageRecordSlot`,
  `TriageCardSlotProps`.
- View contract: `triage-card-list/triage-view.ts` — `TriageViewDecl` (id = nav `page.item`, grain,
  noun, listLabel, testIdPrefix, bodyTestId, storageKeys, recordParams, `chips: { owner, param }`,
  paging, status kind, facts in reading order, sections `{ order, labels, tones, when }`, `next`
  vocabulary) + `triageFamily(view, parts)`.
- Cut: `triage-list-state.ts` `useTriageCut({ statusKeys, recordParams, statusParam })` — the host
  calls it BEFORE its data hook and applies `filterBands` where it arranges bands, so J / K walk
  only what the screen shows.
- Card: `record-card/RecordCard.tsx` + `record-card-types.ts` — status union `deadline | state | date`,
  per-line open (`onOpenLine`, `openLineId`), next step bottom-right. Facts: `record-fact.tsx` (`qty`
  `grade` `stock` `code` `place` `money` `date` `missing`). Glyphs: `record-state-glyph.ts`.
- Declarations + conformance test: `src/lib/triage/views/{outbound-triage,incoming-pipeline,
  incoming-docked,index}.ts`, `triage-views.test.ts` (every view is a `NAV_PAGE_DECLS` item; its chip
  param round-trips its saved views; record params never do; unique test ids / storage keys;
  History's next steps ⊂ declared). Run:
  `node --import tsx --import ./scripts/register-server-only-shim.cjs --test src/lib/triage/views/triage-views.test.ts`

| View | Host | Adapter |
|---|---|---|
| `outbound.triage` To ship | `components/outbound/orders/cards/OrderCardList.tsx` | `OrderCard.tsx`, `lib/orders/order-card-model.ts` |
| `incoming.pipeline` On the way (+ `?lane=exceptions`) | `components/receiving/incoming/IncomingDeliveriesLedger.tsx` (server pages) | `incoming/cards/{receipt-card-model.ts,IncomingDeliveryCard.tsx}` |
| `incoming.docked` History | `components/receiving/history/DockedReceiptsLedger.tsx` | `history/cards/{carton-card-model.ts,CartonCard.tsx}` |

Shared receiving pieces: `components/receiving/use-receiving-selection-port.ts`,
`ReceivingSelectionVerbs.tsx` (the rail's selection catalog as a Law 5 strip). Floor (⌘/Ctrl+⇧+F)
keeps each page's industrial ledger — do not remove it.

Also landed this session: record count beside select-all; `DeskFullscreenToggle` ⤢ as the bar's
last control; view switch + ⤢ teach via `HotkeyTooltip`; every keycap names this device's key
(`lib/keyboard/chord-keys.ts` `platformKeyFace`, resolved in `KeyboardKey`) — author chords as
`mod + Shift + F`, never "⌘/Ctrl".

Ledger: `docs/design-system/RECORD-CARD-MIGRATION.md` → "Triage face — one face, per-page
families". Earlier specs: `HANDOFF-triage-family-contract.md`, `HANDOFF-inbound-history-cards.md`,
`HANDOFF-record-card-families.md` (Laws 1–7).

## Industry check (done — cite, don't redo)
Linear (display properties per view, grouping + ordering, personal vs workspace defaults —
verified at linear.app/docs/display-options), Odoo (receipts and deliveries are ONE model with
per-operation views), Salesforce (per-object layouts; cards vs tables), Polaris (IndexTable for
actionable lists vs DataTable for reports — per search summaries, primary page not read). All
converge on: one engine, per-view declaration. Separate per-domain table components (the pasted
TanStack prompt) were declined for that reason.

## Foundation — six layers, one owner per decision (from parallel session `01a0e403`, 2026-09-27)

A second live session ("Redesign order detail layout with timeline", owner messages 05:34–05:45 UTC)
reached the same answer from the record side. Its first-principles model is the frame for all of
this work — every leak fixed on 2026-09-27 was one layer deciding something another layer owns:

| # | Question | Layer | Single owner in the repo |
|---|---|---|---|
| 1 | What thing is this? | Entity | data model + identity laws (`sku_catalog.id`, `inbound_order`) |
| 2 | What true fact is shown? | Fact | field catalog `src/lib/tables/field-catalog/*` — one reader per fact |
| 3 | What state, what can be done? | State + Verb | `LIFECYCLE` / `RECEIVING_LIFECYCLE`, verb registry (`RecordActionVerb.scope`) |
| 4 | Why is this person looking? | **View spec** (page × saved view) | job, lead fact, fact order, verbs, record sections |
| 5 | How much at once, where? | Presentation | layout (in place / split / rail) × density × disclosure tier (`CARD_DISCLOSE`) |
| 6 | How is it painted? | Paint | tokens only |

Laws: read downward only · one owner per decision · shared parts never branch on the page · jobs
hide things through disclosure, never paint (`industrial:hidden` for content is a violation) · the
look comes from density + surface, never route or layout · one reader per fact. Surface (phone /
desk / kiosk / station) caps density and layout; it knows no jobs.

Six-question test for any element: write entity · fact · state · job · presentation · paint. If one
line of code answers two, it is mixed. Census greps (each a future lint gate): literal visual classes
outside tokens; `industrial:` used to show / hide content; shared parts reading `usePathname` / page
id to choose content; field formatting outside the catalog; `floor ? A : B` component choice.

### One view-spec system, not two — reconcile BEFORE writing another spec
That session proposed `ViewSpec['shipping.to-ship']` in a new `src/lib/views/` (not on disk as of
2026-09-27 22:50) with: job, rowFacts, lead, density range, disclosure, record sections (moved out
of `ORDER_RECORD_SECTIONS`, `order-inspector-context.ts:215`), verbs, bulk, empty. This session
landed `TriageViewDecl` in `src/lib/triage/views/` keyed by the nav's `page.item`. They are the same
layer-4 object seen from the list and from the record. **Ask the owner which home wins, then merge
into ONE type** — never ship both:

| Layer | `TriageViewDecl` has | `ViewSpec` adds | Merge note |
|---|---|---|---|
| 1 Entity | `grain` | — | keep |
| 2 Fact | `facts` (card column ids) | `rowFacts` + `lead` | ids should BE field-catalog ids; add `lead` |
| 3 State/Verb | `status` kind, `next` vocabulary | `verbs` (primary + secondary + keys), `bulk` | fold the Law 5 bar verbs in with scopes |
| 4 Job | `listLabel`, `noun` | `job` (the one question), `empty` | add `job`; `allClear` text comes from `empty` |
| Record | — | `record` sections | absorb `ORDER_RECORD_SECTIONS` per view |
| 5 Presentation | `sections`, `paging`, `chips`, `storageKeys`, `testIdPrefix` | `density` default + range, `disclosure` tiers | per-fact tiers replace hand-set `tier` on columns |
| Id | nav `page.item` (checked by `triage-views.test.ts`) | `page × saved view` | keep the nav id + test; saved views are the sub-grain |

Both sessions agree on the pilot pair: **To ship vs Exceptions** (`OrderExceptionsWorkbench`,
`/shipping/exceptions`) — opposite jobs (lead = ship-by vs hold reason; verb = Pick/Pack vs Resolve
inline; bulk = assign/print vs "apply this fix to all n"). Density as a user choice (owner 05:35:
"let the user choose what they want to see in terms of data density") would make Floor = rail
layout + dense, not a separate look — a `mode-registry.ts` governance change; ask first.

### Owner display rulings from that session (binding for every view)
- Inline record: circular back-arrow CTA top-left, no "Back" text; right rail: close ✕ top-right.
- No product title under the order number (record header, Command-K results).
- "Activity" is "Timeline"; timeline = icons on a vertical hairline; progressive disclosure —
  QC / picked-by / packed-by / scanned-by live behind "more", not at rest.
- Icon-first: replace = pencil, left of the external-link icon; copy chip stays on order ids; an
  empty admin / listing link still shows an icon (link it) instead of disappearing.
- No hard-coded field labels where the value is self-explanatory (name / email / phone); price inline
  in the item with its own expandable group; Ordered left + Ship-by right on one row; editable
  customer and shipping (address change) with edit icons top-right of each group; photos inline.
- Industrial rail: edge-to-edge, no padding outline; OOS badge without the "2 of 3" count; labels
  queue is a fixed-width triage queue, never industrial rows; no triage ↔ industrial leaks (notes,
  bin / unassigned painted in the wrong look).

## Next, in order — ask the owner which first, then do one view end-to-end at a time
For each new view: (1) pattern card in the ledger + owner sign-off; (2) the declaration file; (3)
adapter + host; (4) run the conformance test — treat a hit as a finding to report, never loosen the
test; (5) DOM-equivalence on orders if the face or RecordCard changed
(`node scripts/dom-equivalence.mjs capture|compare`, compare cards keyed by row id when live data
moves); (6) probe at `:3050`: 3 widths, chips + reload, X at 1 / N, Space (assert the peek toggle's
`aria-expanded`), Enter, J, Esc, pager, exact Find, Floor still the ledger; (7) ledger row.

Candidates:
0. **Reconcile the two layer-4 specs first** (section above): owner picks the home
   (`src/lib/triage/views/` vs `src/lib/views/`), then one `ViewSpec` type absorbs `TriageViewDecl`
   + `ORDER_RECORD_SECTIONS` + job / lead / verbs / bulk / empty / density; the three landed views
   and `triage-views.test.ts` move onto it. Coordinate with session `01a0e403` if it is still live.
1. `outbound.shipped` / Shipping, FBA (`fba` page), Outbound Exceptions — each needs a nav view id
   check first (`NAV_PAGE_DECLS`), then a declaration that is genuinely different (FBA: shipment /
   FNSKU grain; Labels/Documents would need a right-hand preview-pane slot in the face — a real
   extension, ask first).
2. `incoming.exceptions` — today `?lane=exceptions` wears `incoming.pipeline`; it is not a nav item.
   Owner call whether it becomes its own view.
3. ~~History received-vs-expected with a mismatch highlight~~ — landed 2026-09-28 (`record-fact.tsx`
   `received` kind; ledger row "History received vs expected").
4. Per-station display properties (Linear / ShipHero column visibility) as a layer on the
   declaration — later, never a new table component.

## Open items (verify, then fix or ask)
- On the way: the 2 "Delivered · not scanned" deliveries are not on page 1 under "Most urgent first"
  (page 1 is all `AWAITING_TRACKING`). Check the server's section order (`cutIncomingSections`,
  default `?sort=`) — a host / server fix, never a face branch.
- History chips (multi-select) and the sidebar State row both write `?dstate=` — owner decides
  whether to consolidate. Do NOT remove the sidebar row unasked.
- On the way Space/quick look was not proven by its probe (focus sat on select-all); History's was.
- `isAppleModPlatform` is copy-pasted in four files and missing in `lib/nav/sidebar-toggle-hotkey.ts`
  (other sessions' code) — report, don't fix.
- Dev red not owned: `src/lib/auth/pin.ts:159` (tsc), `MobileProductsStep.tsx` missing
  `useRetailCatalog`.

## Owner rulings in force
- Per VIEW declarations; sidebar `?sort=` is the list's only sort (no section sorts); Documents
  auto-split stays as is; stop for owner review between waves; `/m/*` untouched unless asked.
- History (owner 2026-09-28): receiving only — Scanned → Received (+ Exception); unboxed IS received,
  unfound cartons read Received, Received is always green; no On hold, no "Review", and no QC state or
  QC filter — "→ QC" is only the next step at a received card's bottom-right. Chips offer only states present. Card line 1 = bare id (no "PO" /
  "Carton") · platform dot + catalog name · vendor · note; no tracking on the face; conditions and
  platforms in sentence case through the shared readers (`conditionSentenceLabel`, catalog platform meta).
- The Deliveries view formerly "History" is **Unboxed** (owner 2026-09-28): view, title and status say
  "Unboxed" (face id stays `RECEIVED`); only lines whose carton carries an unbox / open stamp belong.
- Unboxed filters (owner 2026-09-28): status pills **Unfound · Claim · Short · Unboxed** (`?dflag=`,
  the face owns it, no sidebar twin; ⌥1–⌥4 in that order). Pills are carton facts
  (`dockedCartonStatuses`): a carton wears every attention pill any line wears, else **Unboxed** when
  every line reads clean — the normal case, never both. Sidebar **Kind** row (`?dkind=`); no Reason
  row. Counts are browser-side over the loaded rows — when history outgrows the 3,000-line window,
  move the list AND the counts server-side together.
- Unboxed card (owner 2026-09-28): the rail wears the carton's attention (Exception › **Unfound** red ›
  Claim amber › Short amber, else green Unboxed); unfound cartons lead every activity-day band (an
  explicit column sort is left alone); the id is bare — PO / order #, else the carton number, never a
  "#" (outbound's id-less fallback matches); each filed ticket on line 1 with its reason; the corner
  reads the first unpack, date + time PT and who ("Sep 22, 2:30 PM · Michael"); price last, a faint
  `$—` when missing (never struck — a strike over the dash read as two dashes); the list closes with a
  hairline, and the overflow shadow ends in one; no "→ QC" — the corner is only a verb the carton
  strip runs (Resolve · Claim · Print label), else empty.
- Tickets carry a reason (owner 2026-09-28): the claim wizard's type IS the reason, grouped
  Investigation · Vendor claim · Other, and maps to one `receiving_exceptions` row per ticket + scope
  (`claimTypeExceptionCode`: unfound → NO_PO, return with no order → RETURN_NO_ORDER, damage → DAMAGED,
  missing → SHORT, wrong item → WRONG_ITEM, vendor defect → DEFECTIVE; RTS / repair record nothing; a
  QC fail seeds vendor defect or damage, so INCOMPLETE is only reachable from the QC path). Carrier loss
  codes stay on the write-off path only (an OPEN loss code writes the line off). Claim pill = an OPEN
  claim-family exception with a ticket; an investigation ticket is not a claim. Carton-level rows are
  allowed (`receiving_line_id` NULL) for lineless unfound cartons.
- Pre-reason tickets split by the carton's IDENTITY (owner 2026-09-28, superseding "all as unfound"):
  unfound carton → NO_PO investigation (297 rows, OPEN); identified carton → a claim, coded from a fact
  — its QC fail (14 DEFECTIVE), else a short line (5 SHORT), else **CLAIM_UNSPECIFIED** ("Claim #…",
  103 rows) until a person picks the reason. Rows: `reason LIKE 'Backfill 2026-09-28%'`
  (migrations 2026-09-28b / 28c / 28d).
- One Find per page (owner 2026-09-28): the data-table bar never paints a Find (inbound and outbound
  — `TriageSelectBar` lost `BarFind`, the feed's `search` is read-only). Sidebar open: its field;
  sidebar closed: the global header's field IS the page Find (`GlobalHeaderSearch` mounts `NavFind`
  with the page's `nav.search`); `F` goes to whichever field is visible. A pasted list of ids is a
  bulk search: outbound locates it (`?refs=` panel), receiving matches ANY id-shaped token
  (`receivingFindNeedles`: 2+ tokens, each with a digit and ≥ 5 chars; words stay one phrase).
