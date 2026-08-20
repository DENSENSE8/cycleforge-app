# Unified walk-in paperwork — plan

**Status:** Phase 0 landed (visit-level paperwork panel, uncommitted). Phases 1–4 not started.
**Surface:** `/kiosk/v2` right utility spine → Paperwork slot.
**Owner slot:** counter / walk-in intake (Repair · Retail · Buyback · Pickup).

## Why

Today the only walk-in document is `RepairServiceForm` — a single-product
repair agreement. Its prop shape (`repair-intake-receipt.ts` →
`RepairReceiptProps`) carries **one** `productTitle` / `serialNumber` / `price`,
so:

- A visit that mixes a repair, a retail sale and a trade-in prints paperwork
  that names only the repair. The other two lines exist in the cart, in the
  transaction, and in Zoho — and nowhere on the paper the customer walks out
  with.
- The customer is identified once, informally (`name` + a joined `contact`
  string), with no signature binding to the *visit* — only to the repair.
- Nothing on the sheet identifies which physical thing each line is. A second
  identical unit on the same ticket is indistinguishable on paper.

The document has to become **one visit document with per-line identification**,
not four channel documents.

## Target shape

One `WalkInVisitDocument`, printed once per visit:

```
Header      tenant letterhead · visit no. · date/time · staff
Customer    name · phone · email · (optional ID capture ref)      ← identified ONCE
Lines       one row per cart line, each carrying:
              type (Repair | Retail | Buyback | Pickup)
              title
              identification: serial / IMEI / SKU / order no.
              condition or issue text (repair + buyback only)
              quote / price / credit
Terms       per-line-TYPE clause blocks — only the ones this visit needs
Signature   one visit signature + per-line initials where a type requires it
            (repair authorization, buyback title transfer)
```

Key rule: **terms are composed from the line types present**, never a fixed
sheet. A visit with no repair line prints no repair-authorization clause.

## Phases

### Phase 0 — visit-level panel (LANDED, uncommitted)

`src/app/kiosk/v2/KioskPaperworkPanel.tsx`, reachable from the right utility
spine on every command (not just inside Repair). Renders the customer block +
one identified row per cart line (`lineIdentification()` — serial / IMEI / SKU),
with the **existing, unchanged** `RepairServiceForm` sheet underneath while a
repair line exists. No wording a customer signs changed in this step.

### Phase 1 — the visit model (pure, testable, no UI)

`src/lib/kiosk/walkin-document.ts`

- `buildWalkInDocument(session, org): WalkInVisitDocument` — pure function over
  the kiosk session + tenant letterhead. Zero network, unit-tested with fakes
  (house `Deps`-injection shape).
- `WalkInDocumentLine` carries `{ type, title, identification: {kind, value},
  detail, amountCents }`. `identification.kind` is a closed vocabulary
  (`serial` · `imei` · `sku` · `order`), **not** free text — the same discipline
  as `receiving/exception-codes.ts`.
- Deliberately keeps `RepairReceiptProps` alive as a *projection* of the new
  model, so the existing print path and Zendesk attachment keep working while
  the new one is built.

### Phase 2 — clause registry

`src/lib/kiosk/walkin-terms.ts` — `TERMS_BY_LINE_TYPE`, each entry
`{ id, heading, body, requiresInitials }`. The document composes the union of
clauses for the line types present, in registry order (array position is the
ordering contract, appended-only — same rule as the exception-code taxonomy).
Legal wording for repair is lifted verbatim from `RepairServiceForm` in this
phase; new wording for retail / buyback / pickup is **ask-first** (it is a
customer-facing legal change, not a UI decision).

### Phase 3 — the sheet

`src/components/kiosk/WalkInVisitDocument.tsx` on `RepairPaperworkCanvas`
(A4, `surface="screen" | "print"`). Replaces the panel's repair-only sheet.
`RepairServiceForm` stays until the print + Zendesk paths cut over, then is
deleted — **a retirement is not done until the old path is deleted** (house
law), so this phase ends with the deletion, not with the new file.

### Phase 4 — signature + persistence

- One visit signature on the document; per-line initials where
  `requiresInitials`.
- Persist the rendered document + signature against the visit, not against the
  repair ticket. Needs a migration (expand → code → contract) — a
  `walkin_visit_document` row keyed by the intake transaction, `organization_id
  NOT NULL`, tenant-from-birth via `enforce_tenant_isolation()`.
- Print + email paths read the persisted document, so what was signed is what
  is reprinted.

## Open questions (ask before building past Phase 2)

1. **Legal wording** for retail / buyback / pickup clauses — who supplies it?
2. **Customer ID capture** (driver's licence for buyback) — is a scan/photo
   required, and may it be stored? That is a data-retention decision, not a UI
   one.
3. **One signature or per-line?** Phase 2 assumes one visit signature plus
   initials on the types that need them; a per-line-signature requirement
   changes the sheet layout.
4. Does the printed visit number differ from the RS number the repair ticket
   already prints, or does the repair keep its own?
