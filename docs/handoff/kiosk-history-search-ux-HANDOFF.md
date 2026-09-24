# HANDOFF — The counter's History face, and how an operator FINDS things

**Written** 2026-09-23. **Surface** the counter tablet's History face (`/kiosk/v2` →
command menu → History), the storefront link back out of it, and the find/search
affordances across the whole app (⌘K palette, desk `DataTable`, `/m`).

This is a pickup prompt. Read §0, then work from §3. Everything in §1 and §2 is
already landed and verified live — do not redo it, and do not "improve" it
without reading why it is the way it is.

---

## 0. Before you touch anything

- **`http://localhost:3050` is the only origin.** It is the switchboard: it
  routes to the pinned lane and stamps the cookie scope (`cf_kiosk` →
  `cf_kiosk__l7`), so a probe aimed at a lane port exercises a different cookie
  namespace than the operator's browser. Never bind another port, never
  hand-start `next dev`, never move `PW_BASE_URL`. `:3050` dead or `503` with
  `x-switch-error` → the LANE is down: `systemctl --user start cycleforge-lane@prod`.
- **There is no Playwright suite.** `tests/e2e/` and `playwright.config.ts` were
  deleted on operator instruction. Verification is: device-authed curl through a
  cookie jar, throwaway `tsx` probes against the real domain functions, `psql`,
  and a real headless Chromium when the change is visual. Do not resurrect the
  suite to "prove" something. Recipes: §4.
- **`audit_logs` refuses `DELETE`** at the database level. Probe writes that land
  there are permanent — plan probes that need no unwinding.
- **Clean up after every probe.** The operator's standing complaint is that the
  book fills with test rows. `counter_transactions` is **0** and `repair_service`
  is **85 real rows**. Leave it that way.
- **`pnpm verify:fast`** (~60s: lint, typecheck, 14 source-law gates) before you
  call anything done. If it is red, check whether the red is YOURS: this worktree
  is shared with concurrent sessions and `src/lib/label-ingestions/` (untracked,
  another session's in-flight work) currently fails two `no-restricted-syntax`
  rules. `npx eslint <your files>` disambiguates.

---

## 1. The use case, in one paragraph

A unit arrives — carried in by a customer, or bought as a repair service on the
Ecwid storefront and carried in, or shipped in a box. The counter tablet writes a
`repair_service` row. Later, somebody at the counter has to FIND that row again:
from a ticket number on a piece of paper, from a phone number read out loud, from
a half-remembered name, or from the device on the bench. History is that face.
Everything in this document exists because one of those lookups failed.

---

## 2. What is landed and verified (2026-09-23)

### 2.1 History is scoped to WALK-INS

`listKioskVisits` (`src/lib/counter/list-kiosk-visits.ts`) UNIONs
`counter_transactions` with `repair_service WHERE counter_transaction_id IS NULL`,
ordered on the keyset `(created_at, source, id)` — and now also
**`AND COALESCE(NULLIF(TRIM(LOWER(rs.intake_channel)), ''), 'walk_in') <> 'shipment'`**.

Operator, 2026-09-23: History *"must only be scoped to walk ins"*. A `shipment`
ticket is a unit that arrived in a box and is worked in receiving; it never stood
at this counter.

| `intake_channel` | rows | in History |
|---|---|---|
| `shipment` | 17 | **no** |
| `pickup` — carried in at the counter, priced from a catalog `-RS` SKU (see §3.11: **not** an online order) | 44 | yes |
| `null` — hand-entered at the desk | 24 | yes |

The predicate lives in the SQL `repairWhere`, **not** in the rail. Filtering in
the client would make "load more" append hidden rows and make "nothing matches
that search" a lie. Verified live: page 1 = 50 rows (44 `pickup` + 6 null), page 2
via `nextCursor` = 18 (null), `nextCursor: null` after — **68 rows, zero
`shipment`**.

### 2.2 The storefront link uses the SKU AS TYPED

`repairStorefrontUrl` (`src/lib/repair/repair-storefront-url.ts`) used to rewrite
`00802-RS` → `00802-W` on the theory that `-W` meant the "working" unit.

**It does not. `-W` is a colourway.** `00802` ships as `-W` (white), `-G` and
`-G-1` (graphite); `00004` as `-G` / `-S` / `-MB` / `-W`. Measured against
`platform_listings`: all **23/23** distinct `repair_service.source_sku` values
have an exact listing, while only **12/23** have a `-W` twin. The rewrite sent 11
of 23 to a keyword with no product behind it and the other 12 to a white unit
nobody bought — `00802-RS` is *"REPAIR SERVICE for Bose Wave Radio CD Awrc-1G
Awrc-1P"*, and its `-W` landed on a white radio.

The listing an operator wants back is the one that was **sold**. That is the SKU,
unmodified. Shared with `GET /api/ecwid/recent-repair-orders` (the receiving link
popover) — one rule, one module, two callers. Verified live: `#9998 · 00802-RS` →
`https://usavshop.com/products/search?keyword=00802-RS`.

### 2.3 "Where it came from" is gone; the link rides the item line

Operator call, 2026-09-23. The band held three facts (source-order chip, tracking
chip, listing SKU + storefront button) for the 60/85 repairs carrying any of them.
The order-id and tracking chips went with it. The surviving fact is the one an
operator acts on — the way BACK to the listing — and it now sits on the repair
ITEM line inside `Items`, **one link per device**, built from that device's own
`sourceSku`. That also retired the `soleDevice` guard the band needed: a
two-device visit links each device to its own listing instead of suppressing the
block.

`VisitRepairProvenance` still selects the four source columns (`sourceSku` is what
the link reads; `read-repair-ticket` still exposes the other three), but nothing in
the detail pane renders `sourceOrderId` or `sourceTrackingNumber` any more.

### 2.4 The fullscreen signature pad — an ORDERING bug, not styling

`@radix-ui/react-portal@1.1.14` renders `null` on its first render and mounts
children from a layout effect. The commit that flipped `expanded` unmounted the
inline canvas and mounted nothing; `SignaturePad`'s init effect — keyed
`[expanded]` — ran against a null `canvasRef`, hit `if (!canvas || !container)
return;` and never ran again, because `expanded` does not change when the portal's
SECOND commit attaches the canvas. The fullscreen canvas had no `signature_pad`
instance bound to it: no ink, dead `Clear`, no stroke restore.

Fixed in `src/components/repair/SignaturePad.tsx` by keying the pad's lifecycle on
the canvas NODE (element state + `useCallback`-stable callback refs) instead of on
`expanded`, which was only a proxy for "a canvas exists" — and a wrong one.

> `useCallback` identity is load-bearing. An inline `ref={(n) => …}` detaches and
> re-attaches every render and would tear the pad down mid-signature.
> `onSignatureChange` moved into a ref for the same reason: a caller passing an
> inline arrow (`RepairIntakeForm.tsx:748` does) must not rebuild the pad.

### 2.5 The Ecwid → `customers` loop

See `docs/handoff/kiosk-history-ecwid-loop-HANDOFF.md` for the full state. The
short version: the mapper now emits `buyer`, `customers.ecwid_customer_id` exists,
the sync route passes `orgId` (without it the computed contact was discarded on
every pass AND the upsert fell down the un-tenant-scoped raw-pool branch), and the
eight `contact_info` parsers collapsed into `src/lib/repair/contact-info.ts`.
Still open there: three creation paths that leave `customer_id` NULL, three orphan
repairs (4547/4548/4780) that only a one-shot `tsx` pass can link, and the SQL
backfill's law-6 bypass.

---

## 3. The find/search program — all eight landed 2026-09-23

Ranked by payoff when the list was written; two of the eight turned out to be
**false premises**, which is why every item below records a verdict before a fix.
If you add a ninth, do the same: this repo punishes a second mechanism harder
than it punishes a missing one.

| # | Item | Verdict |
|---|---|---|
| 1 | Desk table search only saw mounted rows | gap — fixed, 16 surfaces converted |
| 2 | Typo tolerance in kiosk History | gap — fixed |
| 3 | `/m/receiving/history` fired per keystroke | gap — fixed |
| 4 | Rail count did not distinguish book from result | count existed, distinction did not |
| 5 | Palette capped at 12 with no way out | gap — fixed |
| 6 | Arrow keys trapped in every find field | gap — fixed |
| 7 | "No saved views" | **FALSE** — `saved_views` already exists |
| 8 | `/m/search` unreachable | gap — fixed, without a nav door |

### 3.1 A table's find field asserted absence it could not know (item 1)

`useCompoundSpreadsheet` filtered in React memory. On a server-paged table,
typing a value that lives on an unloaded page rendered the no-results state for a
record that exists. Measured volumes behind their windows: `audit_logs` 25,330
behind a 50-row page · `inventory_events` 8,866 behind 100 · `orders` 4,801 behind
200 · `packer_logs` 6,108 behind 1,000.

The sharpest proof: `/api/packerlogs?packerId=4` with no query returns **1,000**
rows — the cap itself — and `&q=Tuan` returns **2,236**. The old client pass was
searching a thousand rows for an answer that lived in six thousand.

`DataTableSearch` now carries the answerer:

```ts
interface DataTableSearch {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  answeredBy?: 'client' | 'server';
  pending?: boolean;
}
```

In server mode the client substring pass is **bypassed, not run twice**
(`useCompoundSpreadsheet.tsx:349-356`), `pending` reaches `SearchField` as
`isSearching`, and the body holds its loading face so "no matches" is never
painted over rows that answer the PREVIOUS query (`DataTable.tsx:1851`).

Converted: To-ship, tracking exceptions, `/inventory/stock`, tech + packer bench
history, `/settings/audit`, `/inventory/events`, the Shipped desk, local pickup,
the walk-in sales board, reports · tasks, and the ready / unfound / repair /
warranty / order-exceptions / review-catalog-link mounts.

**Four surfaces were mis-classified and deliberately LEFT ALONE.** The one that
matters: `ReceivingLinesTable`'s find field (`receivingSearchValue`, local state)
and the server's `search` param (`ctx.listSearch` / `historySearch` /
`incomingSearch`, owned by the sidebar) are **two different values behind one
word**. Declaring it `'server'` breaks receiving search outright. That split is
deliberate (`docs/todo/prod-slot-table-SOT-HANDOFF.md:29`) and pinned by
`src/lib/tables/data-table-search-url.guard.test.ts:56`. Same shape at
`UnitsWorkspaceView`, `TechAllTriageTable` and `ByFilterResultList`.

> **Bonus defect.** `DataTableProps.totalCount` was declared and documented as
> printing "shown of total" — and never destructured. ~25 call sites passed it in
> good faith while the status bar printed the rows React was holding.
> `/tracking-exceptions` now reads `100 of 1,054` instead of its 200-row window.

### 3.2 One typo is not a different customer (item 2)

Strict query first. **Only on zero rows, and only when the query carries a name
axis**, a second pass swaps the customer-name probes for `word_similarity`
against the two existing trigram indexes (`idx_customers_name_trgm`,
`idx_customers_fullname_trgm` — `EXPLAIN` confirms both are hit).

Threshold **0.3**, pinned per transaction with `set_config(…, true)` because the
server's own `pg_trgm.word_similarity_threshold` is 0.6. Measured on the org's 96
customers: full-name single transposition recall **93/94 @0.3** vs 47/94 @0.6;
single-token typos 106/140 @0.3 vs 25/140 @0.4. Worst-case noise was 9 of 96
customers, on a query that had already returned zero.

**Identifiers are never relaxed** — `relaxableNameTerm` returns null for a
number, a ticket or a phone even when it wears letters (`RS-1042`). A fuzzy
identifier at a counter hands a stranger's repair history to the wrong person.

The relaxation is announced (`No exact match for "Faeser" — showing close name
matches.`, the grammar the palette already uses) and **rides in the cursor**
(`<iso>|<source>|<id>|relaxed`), so page 2 of a relaxed set resumes relaxed
instead of silently falling back to the strict query. Old cursors parse as
`relaxed:false`.

Live: `q=Faesser` → `relaxed:false`, 1 hit · `q=Faeser` → `relaxed:true`, same
hit · `q=7142712864` → the ticket · `q=7142712846` (transposed) → **0 rows, no
notice** · `q=RS-1043` → 0 · `q=zzqqxw` → 0.

> Incidental 500 fixed on the way: `GET /api/kiosk/visit?q=<10-digit phone>` died
> with Postgres `22003 integer out of range` — a bare phone parses as `numeric`
> and was cast to int4 against `repair_service.id`. The repair-id probes are now
> emitted only when the value fits `INT4_MAX`.

### 3.3 One request instead of ten (item 3)

`/m/receiving/history` put raw `search` state straight into the React Query key.
Measured on the real mounted page: a 10-character query fired **10 requests
before, 1 after**. Debounce is 250ms — the same constant as
`useKioskVisitHistory`, not a third number — and the input's own draft is still
raw state, so typing never stutters.

React Query gives the request-sequence guard for free (cache identity IS the key,
so a stale prefix's response cannot repaint a newer key). It does **not** cancel
the dead request unless the `queryFn` consumes the `signal` it is handed — that
had to be wired.

### 3.4 A count that says which question it answers (item 4)

The rail already printed `{rows.length} records` — unconditionally, ignoring
`hasMore`, so a first page of 25 of 68 read as `25 RECORDS`. Now: `25+ records`
unfiltered, `1 result for "Faeser"` when searching. No `COUNT(*)`, no invented
total; the `+` is exactly the fact the keyset already knows.

### 3.5 A way out of the palette (item 5)

`PALETTE_LIMIT = 12` is a SERVER cap, so the twelfth result was a cliff. A final
`cmdk` item — inside the keyboard ring, not a static footer — routes to
`/search?q=…`, which already reads `?q=` and refetches at limit 50. It renders
only when `query && !searching && results.length >= PALETTE_LIMIT`: never on the
recents state, never on a 9-result query. Measured: `q=black` → 12 at the palette
cap, 50 at the search page.

### 3.6 Arrow keys leave the find field (item 6)

`SearchField` gained exactly one prop — `onNavigateResults?: () => void`, fired on
ArrowDown with `preventDefault()`, which **never flushes the debounce or commits
the draft**: moving focus is not submitting. Absent prop = the keydown is left
un-prevented and bubbles, which is why the sort/filter popover mount (the one
call site of 30 that already drives its own listbox) keeps working untouched.

`DataTable` binds it on the main find field only: ArrowDown → first row,
ArrowDown/ArrowUp walk, ArrowUp on the first row and Escape return to the input
with the caret intact, empty table is a no-op. Rows get `tabIndex = -1` before
focus — programmatically focusable, absent from the Tab order, so the 500-tab-stop
grid stays refused.

**The rover is the FLOOR, not a rival.** `useRecordCursorKeyboard` already owns
↑/↓/Esc on the four surfaces that publish a record cursor; it binds on `window` in
CAPTURE and stops propagation, so there the richer step-and-open behaviour keeps
the keys and the rover is never reached.

### 3.7 Saved views already existed (item 7)

`WorkbenchViewsMenu` + `useSavedViews` + the `saved_views` table + `DataTable.views`
+ `SAVED_VIEW_STORAGE_KEY` + `sheetSavedViewConfigForTable` — ten surfaces mount
the default config and six more pass `views` explicitly. **No second system was
built.** The audit found one real gap: `dashboard_shipped` had a surface, a
storage key and a `SHIPPED_VIEW_PARAMS` list commented *"matches
DashboardShippedTable"* — and no control on the desk to reach any of it. Wired
through the existing resolver. `staged` / `labels` / `packed` were left unwired on
purpose: a view is a named set of FILTER params, and those lanes have none — the
staged dock's only URL state is its find text, which a view must never capture.

### 3.8 The mobile find door, without a nav door (item 8)

`/m/search` had zero entry points. The 2026-09-14 ruling (`nav-registry.ts:81-83`)
deleted Find from the drawer and was NOT overturned: no row, no tab, no nav name.
The door is a **press-and-hold on `MobileScanCta`**, the control already seated in
the top-right of every mobile screen. Plain tap still goes to `/m/scan`, byte for
byte.

Threshold **480ms** — reused from `PhotoPeekFan`, the repo's only other hold
gesture, and just under the ~500ms at which mobile browsers raise their own
callout. 8px slop, disarmed by scroll, and the release click is swallowed so a
long press cannot also fire the tap. Two non-pointer paths, because a gesture no
keyboard can reach is not an affordance: **Alt+Enter** (announced via
`aria-keyshortcuts`) and the platform context-menu request (Shift+F10 / the menu
key). The accessible name states both acts.

### 3.9 The detail pane prints the ticket ONCE, and hands off to a phone

Operator, 2026-09-23. A one-device ticket said `#9998` three times on one screen —
header, itemization caption, device-section label — and neither repeat answered a
question the header had not. The header keeps it. The item caption is now `Repair
service · <SKU>`. The device section label is `Device`, and reverts to the RS
number only when it is **not** a repeat: a visit carrying two devices has two RS
numbers and the header can only show one, so there the label is the only thing
telling the operator which unit the parts and signatures below belong to.

Beside it sits a **QR per device** → `/m/rs/<repairId>`, the mobile
repair-service detail that already exists. Not a print route: a phone has no
device cookie and `/api/kiosk/**` answers it 401. `/m/rs` is staff-authed, so an
unsigned phone lands on `signin?next=…` (verified: 307) and arrives one tap later.

The origin is the **desk's own** (`window.location.origin`), never
`NEXT_PUBLIC_APP_URL` — that variable pins one canonical host, so on a lane or on
localhost it would send the phone to a different server than the tablet is talking
to. `/api/auth/qr/handoff/begin` learned that the hard way; the note is in its
route. `react-qr-code` is loaded through `next/dynamic` with `ssr: false`, the
same way `/signin` does it, so the renderer is not dead weight on every other
kiosk command.

### 3.10 The right pane is never blank, and the rail is cut into days

Operator, 2026-09-23: *"it must never display empty states like this — it should
always display a selection of the most recent one"*, and *"there should be sticky
date headers in the sidebar … so it would display all of the dates and times
insanely quickly and recognizably."*

**Auto-selection** (`KioskHistoryPane`). The pane opens the newest row and
**re-points whenever the result set changes** — not just on first load. A search
usually excludes the record that was open, and leaving it beside a rail that no
longer lists it is the same blank-stare problem wearing a record. Gated on
`history.loading`, because during a refetch the rail still holds the PREVIOUS
page and re-pointing at its row one opens a record the operator is about to stop
seeing. `Select a record to see its paperwork.` is gone; the remaining empty
state can only mean the rail itself has nothing to open, and says so.

**Day bands** (`kiosk-history-day.ts` + `KioskHistoryRail`). `Today` /
`Yesterday` / `Thursday, Sep 17`, `sticky top-0` inside the scroll box — the
Polaris index-table and Square iPad transaction-list pattern. The band is an
opaque `KIOSK_SECTION_LABEL_ROW`, the same chrome label the detail pane's section
heads wear, or rows bleed through it at 1px and read as a rendering fault on a
glossy tablet.

Three rules the module encodes:

- **String surgery, never `Date`** — same law as `kiosk-history-stamp`. The
  leading ten characters ARE the civil day; re-parsing walks a late-evening
  drop-off into the next day's band on a tablet not set to America/Los_Angeles.
  The one genuine zone question — `Today` / `Yesterday`, which are relative to
  NOW — resolves through `getCurrentPSTDateKey()`, and the labels come from the
  civil-key SoT in `@/utils/date`. No second formatter.
- **Consecutive, never bucketed.** The rail is a keyset page ordered on
  `(created_at, source, id)`; a `Map` would silently re-order it. A day that
  recurs later in the stream prints a second band — the honest rendering of a
  list that is not sorted the way it claims.
- **The row prints the TIME only** (`kioskHistoryTime`). The band already says
  which day; repeating `9/17/26` down forty rows is the same redundancy the
  ticket number was printing three times. The detail header keeps the full
  `1:56 PM · 9/17/26` — it has no band above it.

Verified live: 22 bands over 25 loaded rows; `Friday, Jul 10` pinned at exactly
the top of the scroll box at `scrollTop: 600`; row stamp reads `1:56 PM`; on
sign-in the newest record (`repair:4799`, `#9998`) is already open; typing
`Witenberg` re-points the selection to `repair:4790` with no empty state and the
count reads `1 result for "Witenberg"`.

### 3.11 Triage at a glance: the device, its serial, and how long ago

Landed 2026-09-23, after the eight. Three facts the rail hid and one the header
misstated.

- **The device line prints the DEVICE.** 50 of 68 walk-in titles carry the
  listing's `REPAIR SERVICE for` boilerplate — at the start, the middle or the
  end — so a 320px rail printed `REPAIR SERVICE for Bose Wave Radio C…` and cut
  off the model. `repairDeviceName` (`src/lib/repair/repair-device-name.ts`)
  cuts the phrase wherever it sits and de-dupes the brand across the seam
  (`Bose Repair Service For Bose Lifestyle…` → `Bose Lifestyle…`). All 23
  distinct real titles come out clean. The detail pane's item line keeps the
  full listing name.
- **The serial never truncates.** It used to ride the same `·`-joined line as
  the model and was cut off every row. It now has its own non-shrinking slot at
  the right of the device line — reading the serial off the unit on the bench is
  one of the four lookups in §1.
- **Day bands say how long ago.** `kioskHistoryDayAge` prints `6 days ago` /
  `6 weeks ago` / `2 months ago` at the band's right edge, in whole civil days
  via `diffDaysDateKey` (no `Date` zone arithmetic). `Pending Repair` under
  `2 months ago` is a stuck unit found without calendar arithmetic. Silent on
  `Today` / `Yesterday`, on undated bands, and on a future day.
- **The raw `pickup` / `ecwid` chips are gone.** `pickup` beside `Pending Repair`
  reads as "waiting for collection"; `ecwid` reads as "ordered online". Neither
  is true. **FALSE PREMISE corrected:** §1 and the old §2.1 table said a
  `pickup` row is an Ecwid order the buyer carries in. Measured: all 44 have a
  NULL `source_order_id`, and `submit-repair-intake.ts` sets
  `source_system = 'ecwid'` whenever a catalog SKU is present. Searching the
  live Ecwid orders API for `9998`, `9977`, `Faesser`, `Witenberg`, `Clackson`
  and `Dunphy` found no orders (storefront order numbers run around 4–5k). These
  are counter walk-ins priced from the catalog. `intakeChip` in
  `KioskHistoryDetail` prints a chip only when the intake changes what happens
  at the counter (`Mail-in`, `Warranty`, `Paid warranty repair`, unknown values
  humanized). No chip for an ordinary walk-in, since every row on this face is one.

The time an online order was PLACED is not in this book. The storefront order
date exists only for `shipment` rows (`delivered_at` ← Ecwid `orderDate`), and
those are scoped out of History. If the counter ever needs "ordered on X,
walked in on Y", the repair row has to carry a real `source_order_id` first.

### 3.12 The kiosk cut back to what obeys the law (2026-09-23)

Operator: *"delete all of the components that are not currently adhering to
the rules … I will build it up by what exactly I'm doing at each step."*
Repair is the reference: ONE 56px header band (`KioskTopChrome` / the catalog
trail), with the mode dropdown top-left, the search glyph beside it and the
filter after that, plus cart · paperwork · stance on the right. Checkout runs
as a `KioskPaneForm` stepper.

**Deleted.** `KioskBuybackPane` and `KioskPickupPane`: each repeated its mode
name as a header title, neither was a stepper, and Pickup ran its lookup as body
fields instead of the header search. The data shows neither was ever used
(0 `pickup_signed_at`, 0 buyback lines on a transaction). Also deleted:
`/api/kiosk/pickup/*`, `lib/kiosk/order-pickup`, the dead `KioskTriagePanel`,
`KioskCounterPane`, `lib/kiosk/idle`, `lib/kiosk/pair-tablet`,
`/api/kiosk/settings` (no caller), the orphaned draft body builder, and the
dead tokens and exports (`KIOSK_PANE_HEADER_TITLE`, `KIOSK_POS_SIDEBAR*`,
`KIOSK_POS_CATEGORY_LABEL`, `KIOSK_BODY_INSET`, `welcome*`, and the cart's
triage `focus` deep-link). `KIOSK_COMMAND_IDS` is now `repair | retail`. The
`counter_sessions` CHECK still admits the old values, which is harmless because
every read goes through `parseKioskCommandId`.

**Brought into line.** The Paperwork sheet and the customer face each painted a
second titled band under the header; both bands are gone, and
`kiosk-pane-frame.test.ts` now covers them. History's chips used the desk
`badge`, which the KioskChip law bans on a tablet; they are now `KioskChip`.

**History covers every capture the kiosk now makes.** Both remaining commands
write through the cart → `POST /api/kiosk/intake` → `counter_transactions`,
which is the visit spine `listKioskVisits` already unions. The rail now marks a
sale row `Sale` (or `Repair + sale`), because a sale's own status (`Staged`)
says nothing about what was sold.

**Next, in ROI order** (build one per step):

1. **A scanned RS# opens History on that ticket.** The wedge used to send
   `pickup_ref` and IMEI scans to the deleted panes; both now toast
   `Unrecognized scan.` (`KioskShell.onWedgeScan`). Small change, used every day.
2. **Pickup as a verb on the History record**, not as a mode: collect + sign
   from the detail pane (`repair_service.pickup_signed_at`). This is also what
   makes a pickup show up in History as an event.
3. **Kiosk visits show no audit trail.** `read-visit.ts` `findAuditTrail` reads
   `entity_type = 'COUNTER_SESSION'`, but `/api/kiosk/intake` writes
   `kiosk_device`, so the History detail's trail is always empty.
4. **Sale status words.** `Staged` is Square vocabulary; the counter needs
   paid / unpaid.
5. **Buyback, if it comes back,** needs a payload column on
   `counter_transaction_lines`. Grade and notes are dropped at submit today.
6. **Housekeeping.** There are 49 `counter_sessions` stuck `open` since Sep 11.
   `AttractLoop` is mounted only by the settings preview. `KioskHistoryDetail`
   is ~1,060 lines.

---

## 4. Verification recipes that work

**Device-authed probe** (the tablet's principal, no staff session):

```bash
J=$(mktemp)
curl -s -c $J -b $J -X POST http://localhost:3050/api/kiosk/dev-autopair >/dev/null
curl -s -b $J 'http://localhost:3050/api/kiosk/visit?limit=5' | jq .
curl -s -b $J 'http://localhost:3050/api/kiosk/repair/4799' | jq .
```

Note the list payload key is **`visits`**, and the page token is **`nextCursor`**:

```bash
C=$(curl -s -b $J 'http://localhost:3050/api/kiosk/visit?limit=200' | jq -r '.nextCursor')
curl -s -b $J --get --data-urlencode "cursor=$C" --data 'limit=200' \
  'http://localhost:3050/api/kiosk/visit' | jq '[.visits[].id] | length'
```

`limit` is clamped to `KIOSK_VISIT_PAGE_MAX` (50) — asking for 200 gets you 50,
which is not a bug.

**Ground truth:**

```bash
set -a; . ./.env; set +a
psql "$DATABASE_URL" -P pager=off -c "
select coalesce(intake_channel,'(null)') ch, count(*) from repair_service group by 1;"
```

**The face itself.** The browser relay is not installed on this box; open a
managed Chromium directly:

```js
const tab = await browser.open({
  name: "k", url: "http://localhost:3050/kiosk/v2",
  viewport: { width: 1280, height: 900 },
  app: { path: "/usr/bin/chromium", args: ["--no-sandbox", "--disable-gpu", "--headless=new"] },
  timeout: 90000,
});
await tab.evaluate(`fetch('/api/kiosk/dev-autopair',{method:'POST'}).then(r=>r.status)`);
await tab.reload();
```

Then: **click** the `Kiosk command` combobox before typing (typing into an
unopened combobox does not open the listbox), type `Hist`, click the `History`
option, click `Continue as <staff>` on the pinless sign-in sheet. Rail rows carry
`data-history-key="repair:4799"` for direct clicking. ARIA refs renumber on every
snapshot — re-snapshot before each `tab.ref(...)`.

To read a link without navigating away:

```js
await tab.evaluate(`(() => { const o = window.open; let u = null;
  window.open = (x) => { u = x; return null; };
  document.querySelector('[data-testid="kiosk-history-detail"] button[aria-label*="storefront"]').click();
  window.open = o; return u; })()`);
```

---

## 5. Laws you must not break

1. **Never widen customer MATCHING to a bare name.** A name match merges two
   different "John Smith"s, which at a counter is a stranger's repair history on
   the wrong person. (A fuzzy *search* over already-distinct rows is a different
   thing — it ranks what to show, it never decides identity.)
2. **The phone key is NANP last-ten**, spelled
   `RIGHT(REGEXP_REPLACE(COALESCE(col,''),'\D','','g'),10)` in SQL and
   `lastDigits(raw, 10)` in TS. A different spelling is a silent miss.
3. **Identifiers are never fuzzy.** Ticket numbers, phones, tracking, serials,
   order ids: exact or prefix. Relaxation applies to names and titles only.
4. **The list, its search and its paging must agree.** Any scoping predicate
   belongs in the SQL, never in the rail — otherwise "load more" appends rows the
   filter hides and the empty state lies.
5. **A table's find VALUE stays session-local** (`DataTable.tsx:39-44`). Parking
   it in `?search=` soft-navigates per keystroke and remounts the table. Filters,
   tabs and sort MAY live in the URL; saved views already do.
6. **Never print a count you have not counted.** `25 loaded` beats a fabricated
   total, and a `COUNT(*)` per keystroke is not an acceptable price for one.
7. **Tenant scope everything** — `tenantQuery` / `withTenantTransaction` with an
   explicit `orgId`.
8. **Mobile keeps no find DOOR.** `src/lib/mobile/nav-registry.ts:60-65` records
   the 2026-09-14 ruling that Find was deleted from the mobile drawer. `/m/search`
   is reachable from the scan control, not from a nav name.
