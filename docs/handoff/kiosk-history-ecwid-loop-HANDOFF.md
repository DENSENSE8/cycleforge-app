# HANDOFF — Kiosk History display method, and closing the Ecwid loop

**Written** 2026-09-23. **Surface** the counter tablet's History face (`/kiosk/v2` →
command menu → History) plus the repair-service ingest behind it.

You are picking up a face that is **shipped and verified live at `:3050`**, and a
data loop that is **three-quarters wired**. Your job is the last quarter: an Ecwid
order should import a buyer into `customers`, create the repair service against
that buyer, and have the buyer's name appear on the History row, the detail pane
and the printed paper — without anybody retyping a name.

---

## 0. Read this before you touch anything

- **`http://localhost:3050` is the only origin.** Never bind a lane port, never
  move `PW_BASE_URL`. `:3050` dead → `systemctl --user start cycleforge-lane@prod`.
- **There is no Playwright suite.** `tests/e2e/` and `playwright.config.ts` were
  deleted on operator instruction. Verification is: live probes through a device
  cookie jar, throwaway `tsx` scripts against the real domain functions, and
  `psql`. Recipes are in §5. Do not resurrect the suite to "prove" something.
- **`audit_logs` refuses `DELETE`** at the database level. Probe writes that land
  there are permanent — plan probes that do not need unwinding.
- **Clean up after every probe.** The operator's standing complaint is that the
  book fills with test rows. `counter_transactions` is currently **0** and
  `repair_service` is **85 real rows**. Leave it that way.

---

## 1. The display method — what exists, and the rules it encodes

### 1.1 Two spines, one key

`listKioskVisits` (`src/lib/counter/list-kiosk-visits.ts`) UNIONs

- `counter_transactions` — a counter visit, and
- `repair_service WHERE counter_transaction_id IS NULL` — a standalone ticket,
  **excluding `intake_channel = 'shipment'`**

ordered on the keyset `(created_at, source, id)`. **All 85 repairs have no
counter transaction**, so a reader over transactions alone answers the wrong
question. Every row carries `key` — `visit:19` / `repair:4799` — minted by
`src/lib/counter/kiosk-history-key.ts`.

**History is scoped to WALK-INS** (operator 2026-09-23). A `shipment` ticket is
a unit that arrived in a box and is worked in receiving — it never stood at this
counter. 17 of 85 repairs are `shipment`, 44 are `pickup` (an Ecwid order the
buyer carries in — a walk-in) and 24 have a null channel (hand-entered at the
desk — also a walk-in), so the rail reads **68**. The predicate sits in the SQL
`repairWhere`, not in the client, so the list, its search and its keyset pages
all agree; filtering in the rail would have made "load more" append hidden rows
and "nothing matches that search" lie.

> That helper is its own module ON PURPOSE. Importing it from
> `list-kiosk-visits` pulls `tenantQuery` → `server-only` into the kiosk client
> bundle and the whole face 500s. It is a build error, not a size opinion.

### 1.2 The rail row (left sidebar)

```
#9998                       1:56 PM · 9/17/26     ← ID left, WHEN right
REPAIR SERVICE for Bose Wave Radio C…            ← device · SN
[Pending Repair]  Stephen Faesser        $168.00 ← chip · who · money (green)
```

Laws, each of which was a defect once:

- **ID left, stamp right.** The two facts that identify a row, on one line, at
  the two edges the eye tracks.
- **Stamp is `kiosk-history-stamp.ts`**: `1:56 PM · 9/17/26`. Time first, no
  seconds, two-digit year, slashes, no leading zeros. It **never constructs a
  `Date`** — `normalizePSTTimestamp` already resolved the zone, and re-parsing
  re-applies the runtime's, silently shifting every drop-off on a tablet not set
  to America/Los_Angeles.
- **Status is a `Badge`**, never the head of a `·` sentence. It is the one mark
  findable without reading.
- **Money is green (`text-text-success`), caption-size, third row.** It is not an
  identity and must not compete with the ticket for first read.
- **`null` money renders `—` in soft grey, not `$0.00` in green.** `$0.00` claims
  the shop agreed to do the repair for nothing; ~40 un-quoted inbound shipments
  had not been quoted at all. `KioskVisitRow.totalCents` and
  `KioskRepairHeader.priceCents` are `number | null` for exactly this.
- **No `text-role-micro` for content.** That token is 10px condensed; it is
  chrome. Content is `role-body` / `role-caption`.

### 1.3 The detail pane

Anatomy is Square's transaction detail + Shopify's order card, in this order:
identity → itemization → money roll-up → customer → device cards → signatures →
action bar.

- **`RECEIPT_MEASURE = 'mx-auto w-full max-w-[34rem]'`** on header, every section,
  and the action bar. Unconstrained the pane renders ~750px rows and a label at
  x=0 pairs with a value at x=750.
- **Facts are STACKED, two-up** (`Fact` + `FactGrid`), never label-left /
  value-right. Only the money roll-up uses a left/right pair, and it shares the
  itemization's width so `$24.00` in the roll-up lands in the same column as the
  `$24.00` on the line it came from.
- **The header is: ticket left, stamp right.** The amount sits under the ticket
  at caption size in the money token.
- **The SKU carries the way back**, on the repair ITEM line itself: a storefront
  button per device, built by `repairStorefrontUrl()`
  (`src/lib/repair/repair-storefront-url.ts`), which uses the SKU **as typed**.
  The old `-RS` → `-W` rewrite is GONE: `-W` is a colourway, not "working", so
  it pointed 11 of 23 SKUs at nothing and the other 12 at a white unit nobody
  bought. Shared with `/api/ecwid/recent-repair-orders`; one rule. There is no
  separate provenance band — see §2.2-F for what was removed and why.
- **Signatures are their own group**, each stamped with when it was gathered.
- **Never print `Walk-in`.** It asserts an intake channel; on a ticket whose
  channel is `shipment` the name row then contradicts the chip above it. Unknown
  is `—`.
- **Status chip appears ONCE**, in the header band. The device card does not
  repeat it.
- **Action bar**: `ACTION_KEY = 'w-44 max-w-none'` on every text key,
  `ACTION_OVERFLOW = 'w-12 max-w-none px-0'` for the glyph-only `MoreVertical`.
  `max-w-none` is load-bearing — `KIOSK_POS_CTA_SECONDARY` carries `max-w-40` and
  will silently clamp you back. The bar sits inside `RECEIPT_MEASURE`, so its
  edges match the record's (measured: bar `528…1072`, column `528…1072`).
- **An action whose route cannot serve this record's shape is ABSENT**, never
  rendered dead. `Edit` and `Print receipt` post to `/api/kiosk/visit/…` and a
  standalone ticket has no visit id to aim at.

### 1.4 Routes this face owns

| Route | Principal | Purpose |
|---|---|---|
| `GET /api/kiosk/visit` | device | the unioned list |
| `GET /api/kiosk/visit/[id]` · `PATCH` | device | visit detail / edit |
| `GET /api/kiosk/repair/[id]` | device | standalone ticket detail |
| `GET /api/kiosk/repair/[id]/paperwork` | device | the letterhead form |
| `POST /api/kiosk/repair/[id]/label-printed` | device | repair-keyed reprint stamp |
| `POST /api/kiosk/visit/[id]/label-printed` | device | visit-scoped reprint stamp |

`renderRepairPaperHtml` (`src/lib/repair/render-repair-paper.ts`) is ONE renderer
mounted from two principals — the desk's `/api/repair-service/print/[id]` and the
tablet's `/paperwork`. Do not fork it.

---

## 2. The loop, and exactly where it is open

### 2.1 What is already wired

- `upsertEcwidIncomingRepair` (`src/lib/neon/repair-service-queries.ts`) now takes
  a structured `contact: { name, phone, email }` beside the legacy joined
  `contactInfo` string, and stamps `repair_service.customer_id` through
  `attachRepairCustomer` → `resolveProviderCustomerId`.
- `resolveProviderCustomerId` (`src/lib/neon/customer-queries.ts`) matches
  **phone by the canonical NANP last-ten key**, then **lower-cased email**, then
  creates. It returns `null` when the contact has neither — a name with nothing
  else is a label, not an identity, and minting one per sync pass fills the book
  with rows nothing can ever match again.
- `POST /api/ecwid/sync-exception-tracking` passes the parts it already computed
  (`extractEcwidContact`).
- `renderRepairPaperHtml` now reads the JOINED customer first
  (`customer_name` / `customer_phone` / `customer_email` from `getRepairById`),
  falling back to `contact_info` only for unlinked rows — and the fallback is
  **index-free** (email = the part with `@`, phone = the part that is mostly
  digits) because the old `parts[1]` printed the EMAIL in the phone slot whenever
  a ticket had no phone.

**Proven live** (probe, since deleted): two Ecwid tickets for the same buyer with
differently-formatted phones (`714-555-0199` and `(714) 555 0199`, second with no
email) resolved to **one** customer row; the second ticket's paper printed the
normalized phone AND the email, neither of which was in its `contact_info` —
conclusive proof the paper now reads the `customers` row.

### 2.2 What was closed on 2026-09-23 — and the two claims above that were wrong

Two things in §2.1 read as finished but were not, and the measurements below
reorder the rest of this section. Numbers are from the live DB, not estimates.

**The `contact` plumbing was dead at the route.**
`POST /api/ecwid/sync-exception-tracking` called `upsertEcwidIncomingRepair({…})`
with **no second argument**, and `attachRepairCustomer` returns early on a falsy
`orgId` — so the `contact` the route computed was discarded on every pass. The
same omission also sent the upsert down `upsertEcwidIncomingRepair`'s raw-`pool`
branch, i.e. **un-tenant-scoped**, violating law 5 below. §2.1's "proven live"
probe called the domain function directly, which is exactly why this survived.
Fixed: the callsite now passes `orgId`.

**`read-repair-ticket.ts` was still index-based.** §2.1 listed it as fixed; it
read `contact_info.split(',')[1]` as the phone. Fixed.

**A. The Ecwid ORDER import — closed at the mapper, one file.**
`mapEcwidOrdersToCanonicalLines` held `order.email`, `order.billingPerson.phone`
and `order.customerId` and dropped all three, which is the whole reason
`orders.customer_id` was NULL for **494/494** Ecwid orders (and 4,577/4,600
overall). It now emits `buyer`. Nothing downstream needed changing:
`ingest-canonical-orders.ts:671` already feeds any line carrying `buyer` to
`resolveBuyerCustomers`, and `:1048` stamps `customer_id` **only when NULL**, so
a re-sync is backfill-safe by construction. `EcwidOrderWindow.lookbackDays: null`
drops the date filter, so **one full-history sync IS the orders backfill** — no
SQL pass is needed for that side.

> `buyer` is TRANSPORT, not storage. `orders` has no buyer columns and gains
> none; only the resolved `customer_id` is persisted.

**B. `ecwid_customer_id` — added as a column, not `channel_refs`.**
`src/lib/migrations/2026-09-23_customers_ecwid_identity.sql` (applied), plus
`CHANNEL_IDENTITY_COLUMNS.ecwid`. The column wins over the JSONB option because
`resolveBuyerCustomers` interpolates the column NAME into SQL; a JSONB key would
have meant resolver surgery for no gain. Landed BEFORE the mapper so the first
full sync keys by provider id rather than keying 494 orders by email and needing
a re-key later.

**C. `scripts/sync-ecwid-incoming-repairs.js` — deleted**, with its
`package.json` entry. 405 lines, no cron/systemd/CI reference, un-tenant-scoped
SQL, never wrote `customer_id`.

**D. The receiving link flow — closed.** All four remaining unlinked repairs
were this path: `intake_channel='shipment'`, empty `contact_info`, created
Aug–Sep 2026 — while all thirteen older `source_order_id`-bearing repairs
(RS-0026…0039, Feb–Mar 2026) carry a full `Name, +1…, email`. It was a
**regression**, not a gap, and it was leaking 4 of the last 16 repairs (25% of
recent inbound). `add-unmatched-line` now resolves the buyer through the new
shared `fetchEcwidOrderContact` (`src/lib/ecwid/client.ts`) — one fetcher, not a
sixth fork — after the receiving tx commits, returning null on vendor failure so
law 4 holds.

**E. `scripts/backfill-repair-service-customer-id.sql`** — three guarded passes
(linked order → contact phone → contact email), never mints, never name-matches,
reports `unlinked` rather than assuming zero. Note the handoff's original
direction (`orders` → repairs) yields **0 rows on its own**: only 1 of the 17
`source_order_id`-bearing repairs has a row in `orders` at all, because
`mapEcwidOrdersToCanonicalLines:152` skips `-RS` SKUs, so a repair-only Ecwid
order never lands there. Pass 1 is worth running only after a wide-window sync.

**F. The "Where it came from" section is GONE; the storefront link moved onto
the item line.** Operator call, 2026-09-23. The band existed to hold three
facts (source order id chip, tracking chip, listing SKU + storefront button)
for the 60/85 repairs that carry any of them; the order id and tracking chips
went with it, and the only fact that survives is the one an operator acts on —
the way BACK to the listing. It now rides on the repair ITEM line inside
`Items`, one link **per device**, built from that device's own `sourceSku`
through `repairStorefrontUrl`. That also retires the `soleDevice` guard this
section used to need: a two-device visit now links each device to the unit it
was sold against instead of suppressing the block entirely.

The visit-backed half of this item fixed ZERO live rows and still does:
`count(*) FILTER (WHERE counter_transaction_id IS NOT NULL)` is **0** across all
85 repairs. `VisitRepairProvenance` keeps selecting the four source columns —
`sourceSku` is what the new link reads, and `read-repair-ticket` still exposes
the other three — but nothing in the detail pane renders `sourceOrderId` or
`sourceTrackingNumber` any more. The status/`sourceSystem` badges in the header
band are unchanged.

**G. The eight `contact_info` parsers are now ONE rule.**
`src/lib/repair/contact-info.ts` — joined `customers` row first, index-free
legacy fallback second (email = the part with `@`, phone = the part that is
mostly digits, name = the rest, re-joined so a name containing a comma
survives). Cut over: `render-repair-paper`, `read-repair-ticket`,
`square-payment-link`, `field-catalog/repair-resolve`, `RepairPickupFlow`,
`RepairInfoSections`, and the `list-kiosk-visits` SQL spine (`split_part` →
position-free `unnest`).

Two corrections to how urgent this was: the shift bug had **zero live
occurrences** (all 61 two-part rows are `name, phone`; no row has an `@` in slot
2), and the precondition this section set — *"once `customer_id` is universal"* —
was **already met**: 81/81 rows with a non-empty `contact_info` carry a
`customer_id`. It is debt removal, not a bug fix. The one site that shipped a bad
value off-box was `square-payment-link`, which sent `parts[1]` into Square's
`pre_populated_data.phone_number.e164_phone_number`.

`render-repair-paper`'s local copy had a second defect the shared rule removes:
it consulted the fallback only when **all three** fields were empty, so a linked
customer with a blank phone printed no phone even when the intake string held one.

**H. The fullscreen signature pad drew nothing — an ORDERING bug, not styling.**
`@radix-ui/react-portal@1.1.14` renders `null` on its first render and mounts its
children from a layout effect (`const [mounted, setMounted] = useState(false)`).
So the commit that flipped `expanded` unmounted the inline canvas and mounted
nothing; `SignaturePad`'s init effect — keyed `[expanded]` — ran against a null
`canvasRef`, hit `if (!canvas || !container) return;` and never ran again,
because `expanded` does not change when the portal's SECOND commit finally
attaches the canvas. The fullscreen canvas had no `signature_pad` instance bound
to it at all: no ink, dead `Clear`, no stroke restore.
Fixed in `src/components/repair/SignaturePad.tsx` by keying the pad's lifecycle
on the canvas NODE (element state + `useCallback`-stable callback refs) instead
of on `expanded`, which was only a proxy for "a canvas exists" — and a wrong one.

> `useCallback` identity is load-bearing. An inline `ref={(n) => …}` detaches and
> re-attaches on every render and would tear the pad down mid-signature.
> `onSignatureChange` moved into a ref for the same reason: a caller passing an
> inline arrow (`RepairIntakeForm.tsx:748` does) must not rebuild the pad.

**Still open — SIX creation paths, three orphan rows, and one runbook gap.**

1. **Three creation paths this handoff never listed** still leave `customer_id`
   NULL: `POST /api/repair-service` (the desk's manual create, which calls
   `createRepair` with no `customerId` at all — the path an operator uses daily),
   and the warranty handoffs in `warranty/linkage.ts:313` and
   `warranty/quotes.ts:302,403`, which inherit NULL whenever the parent claim is
   unlinked. §4's "kiosk cart, Ecwid sync, receiving link flow" is three of six.

2. **Three orphan repairs NOTHING shipped can link.** Measured 2026-09-23:

   | repair | `source_order_id` | in `orders`? | linkable by |
   |---|---|---|---|
   | 4547 | 5001 | no | one-shot pass only |
   | 4548 | 4998 | no | one-shot pass only |
   | 4780 | 5018 | no | one-shot pass only |
   | 4798 | 5011 | yes (`customer_id` NULL) | backfill Pass 1, after a wide sync |

   5001 / 4998 / 5018 are **repair-only Ecwid orders**, and
   `mapEcwidOrdersToCanonicalLines:152` skips `-RS` SKUs, so no sync will ever
   put them in `orders` — Pass 1 has nothing to join and Passes 2–3 have nothing
   to parse (`contact_info` is empty on all four). The ONLY thing that closes
   them is a one-shot `tsx` pass: `fetchEcwidOrderContact(source_order_id)` →
   `resolveProviderCustomerId` → `attachRepairCustomer`, i.e. exactly what
   `add-unmatched-line` now does at creation time, run backwards over these
   three ids. Until that runs, §4's "the count is reported, not silently
   non-zero" is carrying the whole definition of done.

3. **`scripts/backfill-repair-service-customer-id.sql` bypasses law 6.** It is
   raw SQL: no `invalidateCacheTags(orgId, ['repair-service'])`, no
   `publishRepairChanged`. Rows it links sit STALE in cached reads (History rail,
   detail, paper) until the next write through the domain layer touches them.
   Whoever runs it must fire both by hand afterwards, or run the pass through
   `tsx` against the domain functions instead. Say so wherever the runbook lives.

---

## 3. Laws you must not break

1. **Never widen customer matching to a bare NAME.** `docs/todo/kiosk-counter-transaction/04-unified-route.md` §
   already ruled it: a name match merges two different "John Smith"s, which at a
   counter is a stranger's repair history on the wrong person. A sync running
   unattended over every order in the store is the last place to relax this.
2. **The phone match key is NANP last-ten**, spelled
   `RIGHT(REGEXP_REPLACE(COALESCE(col,''),'\D','','g'),10)` in SQL and
   `lastDigits(raw, 10)` (`src/lib/voice/normalize-phone.ts`) in TS. It is what
   `idx_customers_phone_last10` indexes. A different spelling is a silent miss.
3. **Only ever fill a NULL `customer_id`.** A repair whose customer an operator
   corrected by hand must survive the next sync pass.
4. **A failed customer link must never fail the sync.** The repair row is what the
   shop needs; a missing link is recoverable next run, a thrown sync is not.
5. **Tenant scope everything** — `tenantQuery` / `withTenantTransaction` with an
   explicit `orgId`. `customers` has NO unique constraint on `(org, phone)` or
   `(org, email)`; correctness rests on the resolver, not the schema.
6. **After a `repair_service` write**: `await invalidateCacheTags(orgId, ['repair-service'])`
   then `await publishRepairChanged({ organizationId, repairIds, source })`.

---

## 4. Definition of done

- Every `repair_service` row that has a resolvable buyer carries `customer_id`;
  the count of `customer_id IS NULL` is reported, not silently non-zero.
- Creating a repair service — from the kiosk cart, from the Ecwid sync, and from
  the receiving link flow — produces a linked customer in all three paths.
- `/kiosk/v2` → History shows the buyer's name on the row and in the detail for an
  Ecwid-sourced ticket, and `GET /api/kiosk/repair/<id>/paperwork` prints the same
  name from the `customers` row.
- `pnpm verify:fast` green (16 gates).
- No probe rows left: `counter_transactions` back to its pre-work count,
  `repair_service` at 85 + whatever the operator genuinely created.

---

## 5. Verification recipes that work

**Device-authed probe** (the tablet's principal, no staff session):

```bash
J=$(mktemp)
curl -s -c $J -b $J -X POST http://localhost:3050/api/kiosk/dev-autopair >/dev/null
curl -s -b $J 'http://localhost:3050/api/kiosk/visit?limit=3' | jq .
curl -s -b $J 'http://localhost:3050/api/kiosk/repair/4799' | jq .
curl -s -b $J -o /dev/null -w '%{http_code}\n' \
  http://localhost:3050/api/kiosk/repair/4799/paperwork
```

**Call a domain function directly** (bypasses the dev server entirely — the lane
is sometimes red from a concurrent session's work, and this still proves yours):

```bash
cat > /tmp/probe.ts <<'TS'
import { renderRepairPaperHtml } from '@/lib/repair/render-repair-paper';
const ORG = '00000000-0000-0000-0000-000000000001' as never;
async function main() {
  const html = (await renderRepairPaperHtml(ORG, 4799)) ?? '';
  console.log([...html.matchAll(/<div class="flex-1 p-2">([^<]*)<\/div>/g)].map((m) => m[1].trim()));
  process.exit(0);
}
void main();
TS
node --require ./scripts/register-server-only-shim.cjs --import tsx --env-file=.env /tmp/probe.ts
```

**Ground truth:**

```bash
set -a; . ./.env; set +a
psql "$DATABASE_URL" -P pager=off -c "
select count(*) total, count(customer_id) linked,
       count(*) filter (where customer_id is null) unlinked
  from repair_service;"
```

**The face itself** — open `http://localhost:3050/kiosk/v2`, press Enter on the
`Kiosk command` combobox, pick `History`, then click a staff row to sign in
(pinless). Rail rows carry `data-history-key="repair:4799"` for direct clicking.

---

## 6. Known collisions in this worktree

A concurrent session has been editing `src/lib/orders/resolve-buyer-customers.ts`,
`src/lib/neon/orders-tracking-queries.ts`,
`src/lib/shipping/shipstation/order-ship-to.ts`,
`src/app/api/shipping/order-labels/purchase/route.ts` and
`scripts/e2e-shipstation-customer-book.ts`. Those files moved between reads and
red-lined `verify:fast` twice through no fault of the History work. **`resolve-buyer-customers.ts`
is the one you most need for §2.2-A** — read it fresh, and if it is mid-edit,
coordinate rather than patch around it.
