# SPEC — Zoho-receipt display on Incoming: the lane note and the row chip

**Status:** DESIGN — not built. Ready to implement.
**Depends on:** [`zoho-received-check-watchlist-PLAN.md`](./zoho-received-check-watchlist-PLAN.md) Phase 0+1 (landed).
**Sibling:** [`incoming-bulk-tracking-triage-HANDOFF.md`](./incoming-bulk-tracking-triage-HANDOFF.md).

---

## The one thing to get right

> **On the default Incoming lane, "not received in Zoho" is a CONSTANT, not a variable.**

`NOT_ZOHO_RECEIVED_PREDICATE` (`delivered-unscanned.ts`) is in the `WHERE` of the Incoming
query. Every row on that lane is not-Zoho-received **by construction** — that is what the lane
*is*. So a per-row chip reading "Not received in Zoho" on the default lane would paint the same
value on 100% of rows.

A chip that never varies is not information. It is ink on every row that teaches operators to
stop reading chips — the same failure as a status column where every row says the same word.
The house already states this in two places: *facts and state drive chrome, chrome never invents
a second story* (kinetic-ledger law 1), and the rail written for this exact feature says it
outright: **a chip on every row is a chip on no row**.

**Therefore this spec ships TWO different things, and they are not alternatives:**

| Surface | Says | Because |
|---|---|---|
| **Lane note** (§1) | the CONSTANT, once, at lane altitude | it is a property of the query, not of a row |
| **Row chip** (§2) | the VARIABLE, per row, **only where it varies** | it is a property of the row only on mixed lanes |

Shipping only the chip states a true thing 500 times. Shipping only the note leaves mixed lanes
unreadable. Both, each in its own place.

---

## 1 · The lane note (the microcopy)

### What it says

One quiet line, directly above the grid card, scrolling with the body:

```
None of these are received in Zoho — the list drops a PO the moment the vendor side marks it received.   ⓘ
```

Provider label resolves at runtime via `connectedProviderLabel` — **never the hardcoded string
"Zoho"** in operator copy (AGENTS.md → capability nouns). Falls back to the capability noun:

- connected → *"None of these are received in **Zoho**"*
- not connected / unknown → *"None of these are marked received in your **purchasing source**"*

The tooltip (`HoverTooltip`, per the `title=` ban) carries the *why*:

> A purchase order leaves this list as soon as the purchasing source reports it received,
> billed or closed. If a box is physically here but the PO already shows received upstream,
> it will not appear here — check it by tracking number.

That last sentence is load-bearing: it is the only place the product tells an operator that a
box can be **physically present and absent from this list**, which is the `erp_ahead` hole the
Check exists to find. It should link to the bulk-paste panel (sibling handoff).

### Where it renders

**In the scroll body, immediately above the grid card — not in the chrome band.**

- The chrome band is already the one sticky layer in that scroll port
  (`workbench-ops-queue.md` → *Sticky docking*). A second band is forbidden, and the note is not
  always-visible chrome — it is a caption on the collection.
- It sits **above** the KPI strip? **No — below it, directly above the grid.** The note describes
  the *table*, so it must be adjacent to the table. A caption separated from its subject by a KPI
  strip reads as a page-level banner.

```
┌─ WorkbenchChromeHeader (pinned, one sticky layer) ─────────────┐
├─ KPI strip (in body) ──────────────────────────────────────────┤
│  ⓘ None of these are received in Zoho — …                      │  ← the lane note
┌─ grid card ────────────────────────────────────────────────────┐
```

### When it must NOT render — this is the correctness half

The note is a **claim about the active query**. It is true only while the predicate holds, so it
must be suppressed the moment any filter relaxes it. Render it **only** when *all* of:

| Condition | Why |
|---|---|
| `view=incoming` | it is that view's predicate |
| no `?tracking_in=` | bulk paste deliberately bypasses the predicate (sibling handoff) |
| `?state=` is not a Zoho-inclusive facet | a relaxed facet mixes received rows in |
| the lane is not the recently-removed lane | that lane exists to show removed rows |
| `rows.length > 0` | on an empty lane it is noise stacked on a teaching empty |

**A lane note that survives its predicate is worse than no note** — it is a confident false
statement sitting directly above the rows that contradict it. Gate it on one derived boolean
next to the query, never on a hand-maintained list of param names at the call site.

### Do / Don't

| Do | Don't |
|---|---|
| One line, `text-role-micro text-text-faint`, `HoverTooltip` for the why | A dashed callout box or a coloured banner — this is a caption, not an alert |
| Resolve the provider label at runtime | Hardcode "Zoho" in operator copy |
| Derive visibility from the query | Hardcode `searchParams.get('state') === null` at the call site |
| Let it scroll with the body | Add a second sticky band |

---

## 2 · The row chip

### What it is

A `zoho` column on the receiving grid — **`type: 'tag'`, `tier: 'optional'`, `hideKey: 'zoho'`,
start-aligned** (a tag, not an identifier). Grids open lean, so it is off by default and staff
add it from the column-display lip.

| Mirror status | Chip | Tone |
|---|---|---|
| `received` · `billed` · `closed` | **Received** | emerald |
| `cancelled` · `rejected` | **Cancelled** | rose |
| `issued` / anything else | **Open** | slate |
| no mirror row | `—` (`GridCellDash`) | — |

**`—` is not "Open".** No mirror row means we have never synced that PO, which is a different
fact from the vendor reporting it open — the honest-absence rule. Do not COALESCE them.

### Where the mapping lives

**A new display module — not the leaf SoT, and not the cell.**

```
src/lib/receiving/zoho-receipt-face.ts
  zohoReceiptFace(status: string | null) → { label, tone, tip } | null
```

- It **imports** `isZohoReceivedLikeStatus` from
  [`zoho-received-status.ts`](../../src/lib/receiving/zoho-received-status.ts) — the leaf SoT
  landed in Phase 0 — and imports `ZOHO_TERMINAL_STATUSES` for the cancelled/rejected arm.
  **Never re-type either list**; that is the exact drift Phase 0 removed (three copies, three
  "keep in sync" comments).
- It stays **out of** `zoho-received-status.ts`, which must remain dependency-free so client
  bundles can reach it. A face module carrying tone classes is a display concern; keep the
  altitudes apart (`build-gotchas.md` → bundle altitude).
- The cell (`ReceivingZohoCell`) composes `ReceivingChipValue` + `HoverTooltip` and renders what
  the face returns. **No map in the component** (kinetic-ledger law 4).

### Where the chip EARNS its place

Only on lanes where the value varies:

| Lane | Chip? | Why |
|---|---|---|
| Default Incoming | **off** (available via the lip) | constant — the lane note covers it |
| `?tracking_in=` bulk paste results | **on by default** | deliberately bypasses the predicate; mixed by design |
| Recently-removed lane | **on by default** | "Zoho received it" is one of the removal reasons |
| Check rail results | already shipped | `verdict` chips landed in Phase 1 |
| Receiving History | **off** (available) | historical; status is enrichment |

"On by default" = `tier: 'core'` **for that surface's descriptor**, not a change to
`RECEIVING_GRID_COLUMNS` globally. Column tier is per-descriptor; flipping the shared model would
turn it on for every receiving grid and re-create the always-the-same-value problem elsewhere.

### The staleness problem, stated honestly

The chip reads `zoho_po_mirror.status`, which is **as fresh as the last sync, not as fresh as
now**. The Check rail solves this by disclosing `synced_at` ("as of …", landed Phase 1). The grid
has no room for a per-row timestamp.

**Resolution:** the chip's `HoverTooltip` carries the sync age (*"Received · synced 4h ago"*), and
the lane note's tooltip states the mirror is a cache. **Do not** put a bare age in the cell — it
would fight the `date` column, which is the stamp column
([`ReceivingStatusCell`](../../src/components/station/receiving-grid/cells/ReceivingStatusCell.tsx)
documents exactly this ruling for state-vs-stamp).

**Do not** add a "stale" warning tone. Every mirror row is stale by some amount; a tone that
fires on a threshold invents a policy the product does not have.

---

## 3 · Build order

1. `zoho-receipt-face.ts` + unit test (pure; asserts it composes both SoT lists, never re-types).
2. `ReceivingZohoCell` + register `zoho` in `receiving-grid-layout.ts` (`tier: 'optional'`).
3. Wire `zoho_status` through `normalizeRow` in `/api/receiving-lines`.
   **⚠ This is the step that silently fails.** `normalizeRow` is a strict allowlist with no
   passthrough — a column selected by the builders but absent from the normalizer reaches the
   client as `undefined`, indistinguishable from "no mirror row". Three procedure-gate columns
   shipped exactly that way and their steps could never go done. **Add a guard test** in the shape
   of `receiving-lines-procedure-gates.guard.test.ts`.
4. `IncomingLaneNote` + the derived visibility boolean + its test.
5. Flip the chip to `core` on the bulk-paste and recently-removed descriptors (sibling handoff).

## 4 · Never

- A per-row chip on the default Incoming lane by default. It is a constant there.
- A fourth copy of the received-status list. Compose `zoho-received-status.ts`.
- Hardcoded "Zoho" in operator copy outside the Integrations hub / deep links.
- A lane note that outlives its predicate.
- A second sticky band in the Incoming scroll port.
- `title=` for the tooltips — `HoverTooltip`, body-portalled.
- Merging the receipt chip into `ReceivingStatusCell`. That cell is the **local lifecycle** state;
  this is the **vendor** state. Two facts, two columns — the ruling that split state from stamp
  in that same file applies verbatim.
