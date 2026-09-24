# CONTINUE PROMPT — the counter tablet's History face

**Written** 2026-09-23. Paste this into a fresh session. It is the whole context
you need; the two reference docs it names are read on demand, not up front.

---

## Who you are and where you are

You are picking up `/kiosk/v2` → command menu → **History**: the counter
tablet's book of past visits and repair tickets. Master rail on the left, one
record's paperwork on the right, an action bar along the bottom.

Repo: `/home/michaelgarisek/Projects/cycleforge-lanes/prod`.

Two reference documents. **Read them when you touch what they cover — not
before.**

| Doc | Covers |
|---|---|
| `docs/handoff/kiosk-history-search-ux-HANDOFF.md` | This face's display laws, the whole find/search program (8 items, all landed), and every verification recipe that works on this box |
| `docs/handoff/kiosk-history-ecwid-loop-HANDOFF.md` | The Ecwid → `customers` ingest behind the face: what is wired, three creation paths that still leave `customer_id` NULL, three orphan repairs, and the backfill's law-6 gap |

---

## The five rules that will bite you first

1. **`http://localhost:3050` is the only origin.** It is the switchboard: it
   routes to the pinned lane and stamps the cookie scope (`cf_kiosk` →
   `cf_kiosk__l7`), so a probe aimed at a lane port exercises a different cookie
   namespace than the operator's browser. Never bind another port, never
   hand-start `next dev`, never move `PW_BASE_URL`. `:3050` answering `prod is
   starting` means the lane is booting — wait and reload. Dead → `systemctl
   --user start cycleforge-lane@prod`.
2. **There is no Playwright suite.** `tests/e2e/` and `playwright.config.ts` were
   deleted on operator instruction. Do not recreate them. Verification is: curl
   through a device cookie jar, `psql`, throwaway `tsx` probes against the real
   domain functions, and a real headless Chromium for anything visual.
3. **`pnpm verify:fast`** (~60s: lint, typecheck, 14 source-law gates) before you
   call anything done. This worktree is shared with concurrent sessions — if it
   is red, check whether the red is YOURS with `npx eslint <your files>` before
   chasing it.
4. **Clean up after every probe.** The operator's standing complaint is that the
   book fills with test rows. `counter_transactions` is **0**, `repair_service`
   is **85 real rows**, and `audit_logs` refuses `DELETE` at the database level —
   plan probes that need no unwinding.
5. **Never a second mechanism.** This repo already has a helper for almost
   everything, and two of the eight items in the last program turned out to be
   things that already existed. Before you build: grep for it, and if you find
   it, extend it. Verdict first, fix second.

---

## What shipped on 2026-09-23 — do not redo, do not "improve" without reading why

### The face

- **History is scoped to WALK-INS.** The SQL excludes
  `intake_channel = 'shipment'` (17 of 85 — units that arrived in a box and are
  worked in receiving). `pickup` (44, an Ecwid order the buyer carries in) and
  null (24, hand-entered at the desk) stay. The rail reads **68**. The predicate
  is in `repairWhere`, never in the client, or "load more" appends rows the
  filter hides.
- **The ticket number prints ONCE**, in the header. It was also the itemization
  caption and the device-section label — three times on one screen. The device
  label is now `Device`, and reverts to the RS number only when it is not a
  repeat (a two-device visit has two RS numbers and the header shows one).
- **A QR per device** → `/m/rs/<repairId>`, the mobile repair detail. Origin is
  `window.location.origin`, never `NEXT_PUBLIC_APP_URL` — that pins one host and
  would send the phone to a different server than the tablet is on.
- **The right pane is never blank.** The pane auto-opens the newest row and
  re-points whenever the result set changes; "Select a record to see its
  paperwork" is gone.
- **Sticky day bands in the rail** (`Today` / `Yesterday` / `Thursday, Sep 17`),
  pinned to the top of the scroll box. Rows under a band print the **time only**
  — the band carries the day.
- **No "Where it came from" band.** The source-order and tracking chips were
  removed on operator instruction; the storefront link rides the item line.
- **The storefront link uses the SKU as typed.** The old `-RS` → `-W` rewrite
  pointed 11 of 23 SKUs at nothing and the other 12 at a white unit nobody
  bought — `-W` is a colourway, not "working".

### The find program

Eight items, all landed, detailed in §3 of the search handoff. The two that will
change how you write code here:

- `DataTableSearch` now carries `answeredBy?: 'client' | 'server'` and
  `pending?: boolean`. A server-paged table that filters in React memory asserts
  absence it cannot know.
- `SearchField` has `onNavigateResults?: () => void` — ArrowDown hands focus to
  the caller's result list. It never flushes the debounce: moving focus is not
  submitting.

---

## The principal is the design constraint — read this before adding any action

History runs on the **device** cookie. The staff sign-in on that face is
*attribution*, not authorization. `src/lib/counter/edit-visit.ts:37-47` allows
only identity and description, and says why:

> "Price, totals, **status**, payment state and the staged provider order are
> absent from `KIOSK_VISIT_EDITABLE_FIELDS` on purpose: a counter that can
> re-price a settled visit from an unattended device is a refund path with no
> refund controls."

So, for any new verb:

| Verb | Where it belongs | Why |
|---|---|---|
| Open the linked Zendesk ticket | History detail, read-only | The data is already there — see below |
| Link / unlink a ticket | History detail, behind PIN step-up | `KioskPaymentStepUpSheet` is the precedent for "a claim is not enough" |
| Update repair status | the phone first (`/m/rs/<id>` already does it via `PATCH /api/repair-service`), the tablet only with step-up | Status is excluded from the allowlist on purpose |
| Refund / re-price | never on this face | The sentence above |

**Navigation out of History**: the kiosk has four COMMANDS
(`repair | retail | buyback | pickup` — these *are*
`counter_sessions.active_command`, under a DB CHECK) and staff TOOLS that ride on
top (`history`, which sets no `active_command`). You never nest a second display
inside History: you switch command and hand over the record key
(`visit:19` / `repair:4799`), which already exists and which
`fetchKioskHistoryDetail` already routes on.

---

## The open work, in the order it is worth doing

### 1. Surface the linked ticket (ready to build, zero new law)

`createRepairIntakeTicket` stamps `#<zendeskId>` into
`repair_service.ticket_number` **and** writes a proper anchor row through
`linkTicketToAnchor`. Measured:

| repair | `ticket_links.zendesk_ticket_id` | role | `ticket_number` |
|---|---|---|---|
| 4799 | 9998 | anchor | `#9998` |
| 4790 | 9977 | anchor | `#9977` |
| 3365 | 9735 | anchor | `#9735` |

`ticket_links` holds 302 SHIPMENT · 230 RECEIVING · 197 RECEIVING_LINE · **10
REPAIR** anchors, and `LinkedTicketsPanel` + `TicketChip` already render this
exact shape elsewhere. The History detail reads none of it — that `#9998` in the
header is a live Zendesk ticket rendered as inert text.

Two traps:

- **`ticket_number` carries three vocabularies**: `RS-####` (42 rows, intake),
  `#<zendesk>` (17), and bare four-digit legacy ids like `8249` (24 rows,
  Jan–Apr 2026). Anything treating the column as "the ticket" is guessing. Read
  `ticket_links`.
- **6 of the 10 REPAIR anchors point at repair ids with no `repair_service`
  row** (4796, 4795, 4794, 4793, 4792, 4791, 4785) — orphans, probably deleted
  probe rows. Report the count; do not delete without asking.

### 2. Status from the tablet, if the operator still wants it

Needs a deliberate widening of `KIOSK_VISIT_EDITABLE_FIELDS` plus a step-up, or
it must stay on the phone. Do not widen it quietly.

### 3. Still open in the Ecwid loop (see the other handoff, §2.2)

`POST /api/repair-service` (the desk's daily manual create) and the warranty
handoffs at `warranty/linkage.ts:313` / `warranty/quotes.ts:302,403` all leave
`customer_id` NULL. Three orphan repairs (4547/4548/4780) can only be closed by a
one-shot `tsx` pass. `scripts/backfill-repair-service-customer-id.sql` bypasses
law 6 — no `invalidateCacheTags`, no `publishRepairChanged`.

---

## Driving the face (the part that costs an hour to rediscover)

The browser relay extension is not installed on this box. Launch Chromium
directly:

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

Then, in order: **click** the `Kiosk command` combobox (typing into an unopened
combobox does not open the listbox) → type `Hist` → click the `History` option →
click `Continue as <staff>` on the pinless sign-in sheet. ARIA refs renumber on
every snapshot, so re-snapshot before each `tab.ref(...)`.

Handles worth knowing: `[data-history-key="repair:4799"]` on rail rows,
`[data-testid="kiosk-history-day"]` on day bands (with `data-day-key`),
`[data-testid="kiosk-history-detail"]`, `[data-testid="kiosk-history-qr"]`.

Device-authed API probe:

```bash
J=$(mktemp)
curl -s -c $J -b $J -X POST http://localhost:3050/api/kiosk/dev-autopair >/dev/null
curl -s -b $J --get --data-urlencode 'q=Faeser' --data 'limit=5' \
  'http://localhost:3050/api/kiosk/visit' | jq
```

The list payload key is **`visits`**, the page token is **`nextCursor`**, and
`limit` clamps to 50. A relaxed (fuzzy) result carries `relaxed: true` and
`relaxedTerm`.

Ground truth:

```bash
set -a; . ./.env; set +a
psql "$DATABASE_URL" -P pager=off -c "
select coalesce(intake_channel,'(null)') ch, count(*) from repair_service group by 1;"
```
