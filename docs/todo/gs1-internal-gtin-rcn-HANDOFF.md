# GS1 — what's left after the compliance-onboarding plan

**Date:** 2026-08-02 · `main` · **Lane:** WS-DOGFOOD
**Predecessor:** [`gs1-compliance-onboarding-PLAN.md`](gs1-compliance-onboarding-PLAN.md)
— **P0–P4 all shipped and verified**; nothing in that plan is outstanding.

This hands off the three things that plan *surfaced but did not cover*, plus the
state of the working tree at handoff. Findings below are evidence-backed (call
chains traced in the code, not inferred) and are ordered by how much they matter.

---

## The one-line summary

`sku_catalog.gtin` is auto-populated with an internally-minted
**restricted-circulation number**, and nothing downstream knew that is not a
licensed GTIN. **The interop projections now refuse it** (F1, shipped) — so it
can no longer reach a trading partner dressed as a globally resolvable key.
A tenant holding **real** GTINs can now enter them (F2, shipped 2026-08-02 —
with the tenant-blind unique index that blocked it). **One thing remains:**
whether the *printed unit label* may keep treating an RCN as a licensed key
(a ruling, F1).

---

## F1 — An internal `02…` GTIN is emitted as a real GS1 key

**Status: the interop half is FIXED (2026-08-02). The print-ladder half is an
open ruling — see "What is still open" at the end of this section.**

Same CLASS as the borrowed `DEFAULT_GLN`, different blast radius.

### The chain, traced

```
/api/units/next-id            ← lazily mints when sku_catalog.gtin is empty
  └─ getOrCreateInternalGtin  (src/lib/inventory/internal-gtin.ts)
       └─ generateInternalGtin → "02" + 11-digit sku_catalog.id + check digit
            ⇒ persisted to sku_catalog.gtin
```

`02` is deliberate and documented in that module: GS1 reserves prefix `02` (and
`20`–`29`) for **Restricted Circulation Numbers** — internal company use, *not*
globally unique, *not* resolvable. For an internal warehouse sticker that is
exactly right, and the module says so.

The problem is that the value then escapes into two places that treat any
non-empty `gtin` as a licensed key:

| Consumer | What it emits | Why it's wrong |
|---|---|---|
| `gtinIdentifier` / `sgtinIdentifier` (`gs1-keys.ts`) | `scheme: 'gs1'`, `https://id.gs1.org/01/02…` and `urn:epc:id:sgtin:02….{serial}` | **This is the false claim.** `id.gs1.org` is GS1's canonical resolver; an RCN will not resolve there. A partner filtering to `scheme: 'gs1'` — which the module docblock says is the whole point of that field — gets a number that is by definition not globally resolvable. |
| `encodePrintMatrix({ kind: 'unit' })` → `unitPlatformDigitalLink` | `https://{slug}.app.cycleforge.ai/01/02…/21/{serial}` | Ladder **rung 1**, which [`source-of-truth.md`](../../.claude/rules/source-of-truth.md) defines as needing "a **licensed** GS1 key". Milder — it is the tenant's own host and the app's own scanner — but it is still rung 1 on an unlicensed key. |

### Why the existing guard doesn't catch it

`isPlaceholderGtin` only knows GS1's **documentation** prefixes
(`0614141` · `9521141` · `9526000`). It has no concept of the restricted-
circulation range, so `02…` sails through both alignment checks.

### Why this is NOT simply the borrowed-GLN bug again

Be precise about the harm, because it changes the fix:

- The borrowed GLN (`0614141000005`) **belonged to someone else** — printing it
  was a false identity claim that could collide with a real licensee.
- An RCN **collides with nobody** — the range exists so it can't. The harm is
  narrower: asserting *global resolvability* that the number does not have.

So the RCN is legitimate where it is today (internal stickers, internal scan
routing) and illegitimate only where it crosses a tenant boundary. **Do not
delete the internal GTIN.** Teach the boundary to refuse it.

### What shipped

1. **`isRestrictedCirculationGtin`** in `gs1-keys.ts` — prefixes `02` and
   `20`–`29`. It normalises to **GTIN-13 space first** (14 → drop the packaging
   indicator · 12/8 → zero-pad) rather than testing two raw alignments the way
   `isPlaceholderGtin` does. That shortcut is safe for a 7-digit documentation
   prefix and **wrong** for a 2-digit one: `20812345000010` is a legitimate
   case-pack GTIN-14 — indicator `2` over the licensed prefix `0812345` — and a
   raw `startsWith('20')` refuses a real trade item. Caught during
   implementation; pinned by its own test.
2. **`gtinIdentifier` / `sgtinIdentifier` return `null`** for an RCN. All three
   consumers (`search-identifiers` · `epcis-projection` · `asn-projection`)
   already branched on null and fall back to the internal URN, so the refusal
   landed in a path that was correct before the predicate existed — no consumer
   changed. Full interop suite: 95/95 green.
3. **`WILD_PAYLOAD_FORMS` gained the RCN unit row**, pinned as the encoder
   behaves *today*. Those stickers are already on units, so the decode must keep
   working no matter how the ruling below lands; if the encoder is later dropped
   to rung 3/4 the row becomes `mint: null` + reason, exactly like the
   borrowed-GLN rows beside it.
4. **SoT updated** — `source-of-truth.md` → *Printed code ↔ scan round-trip*.

Tests: `src/lib/interop/gs1-restricted-circulation.test.ts` (8, incl. the
indicator-2 false positive, the UPC-A number-system-2 case, the whole 20–29
band, and a check that the constants still match the minter's format).

### What is still open — a RULING, not a refactor

**May a unit label stay at ladder rung 1 when its GTIN is an RCN?** The encoder
does not consult the new predicate, so today it does.

Genuinely defensible both ways, which is why it was left alone:

- **Keep rung 1** — it is the tenant's own host, scanned by this app's own
  router, and an RCN collides with nobody. The Digital Link is well-formed and
  round-trips.
- **Drop to rung 3/4** — [`source-of-truth.md`](../../.claude/rules/source-of-truth.md)
  defines rung 1 as "a **licensed** GS1 key", and this is not one. A URI shaped
  like a GS1 Digital Link invites a phone camera to treat it as one.

Whoever decides: write the verdict into the SoT, then make the encoder match.
Changing the encoder is ~5 lines; the row in `WILD_PAYLOAD_FORMS` is already
there for both outcomes.

---

## F2 — A `'per-item'` tenant has nowhere to put their GTINs

**Status: SHIPPED 2026-08-02.** Jump to *What shipped for F2* below; the
diagnosis is kept because it explains the shape of the fix.

The Settings card now lets a tenant answer **"We buy individual GTINs per
product"** (`gs1Status: 'per-item'`), and `resolveGs1Requirement` correctly
treats that as *met* — no nag. But the answer was a **dead end**:

- `sku_catalog.gtin` is **read-only in the product UI** — `ProductDetail.tsx:130`
  renders it as a `DetailRow` and nothing edits it.
- There is **no writable path**: nothing under `src/app/api/sku-catalog/**`
  accepts a `gtin`, and the only writer in the codebase is the internal minter.
- Worse, by the time a tenant wants to enter a real GTIN, the column may already
  hold an auto-minted `02…` (F1) — so this is not just "add a field", it is
  "add a field that has to overwrite a machine-generated value, and be able to
  tell the two apart".

**F1 and F2 are the same fix arriving from two directions**, and F1 has now
handed F2 the predicate it needed: `isRestrictedCirculationGtin(row.gtin)` is
precisely "this slot is still empty in the sense that matters", so a GTIN-entry
UI can tell a machine-minted value from one a human typed and offer to replace
it without a second heuristic.

Out of scope for the original plan — deliberately, it was a collection problem.

### What shipped for F2

1. **`classifyGtinEntry`** in `gs1-keys.ts` — the gate for a GTIN a *person*
   typed, composing the predicates that already existed. Four rungs in a
   deliberate order (length → check digit → placeholder prefix → restricted
   circulation), each with its own operator-facing sentence, because a single
   generic "invalid GTIN" leaves someone holding a real licensed number unable
   to tell a typo from a refusal on principle. Pure and client-safe, so the
   field and the route give the same verdict from one implementation.
2. **`setSkuCatalogGtin`** (`sku-catalog-queries.ts`) + `gtin` on
   `SkuCatalogUpdateBody` → `PATCH /api/sku-catalog/[id]`. Its own writer, NOT
   a column on `upsertSkuCatalog`: that helper is the sync path's COALESCE
   upsert where omitted means preserve and clearing is impossible — wrong on
   both counts for a licensed identifier. 400 with the refusal reason, 409
   naming the SKU that already holds the digits, `null` to clear.
3. **`ProductGtinField`** on `/products/sku/[sku]` (`sku_stock.manage`). The
   row derives an **INTERNAL** chip from `isRestrictedCirculationGtin` — the
   predicate F1 built is precisely "this slot is still empty in the sense that
   matters" — and seeds the editor blank in that case, because the operator is
   there to type what they licensed, not to edit ours. Blank + save clears back
   to the internal number.
4. **A tenant-blind unique index, found on the way in** — migration
   `2026-08-02c_sku_catalog_gtin_org_unique.sql` replaces `UNIQUE (gtin)` with
   `UNIQUE (organization_id, gtin)`. A GTIN names the PRODUCT, so two tenants
   selling the same item hold the same digits and the second was a violation on
   a correct value. It never fired because the only writer minted from the
   globally-unique `sku_catalog.id`; **letting a human type a real GTIN is
   exactly what makes it reachable**, so the feature could not ship without it.
   Same class as `sku_catalog_sku_key` → `sku_catalog_org_sku_key` (2026-06-28j)
   and the `sku_platform_ids` tenant-blind unique. Modeled in Drizzle in the
   same change. **UNAPPLIED — the user runs migrations.**

Tests: `src/lib/interop/gtin-entry.test.ts` (9 — one per rung, plus the
indicator-2 case-pack GTIN that a raw prefix test would wrongly refuse) and
`tests/e2e/product-gtin-entry.spec.ts` (`qa-desktop`: four refusals, the accept
path, persistence across reload, then restores the fixture). SoT updated —
`source-of-truth.md` → *Printed code ↔ scan round-trip*.

One incidental finding: the interop suite's `LICENSED_14 = '00812345000019'`
fixture has a **wrong check digit** (6 is correct). Harmless there — those
tests only read the prefix — but it is why the entry tests carry their own
constant, noted in the file so nobody "fixes" the divergence.

---

## F3 — `cbvUriForm` has no UI *(minor)*

`OrgSettingsSchema.gs1.cbvUriForm` (`'urn' | 'webUri'`) is carried by the
schema, returned by `GET /api/admin/organization/settings`, and validated by its
PATCH — but nothing renders it. `Gs1ComplianceCard` deliberately omits it from
its PATCH body (merge-only, so it is preserved rather than clobbered).

Low priority and arguably correct as-is: it defaults to `urn`, which is the safe
answer (an EPCIS 1.2 consumer **rejects** the Web URI spelling of a CBV term),
and it is genuinely per-partner rather than per-org. Add the control when a
second tenant actually needs `webUri` — not before.

---

## F4 — `gs1Requirement.unmet` has exactly one consumer

The plan says "`unmet` is the only thing any surface should nag on." Today the
only surface that nags is the Settings card itself, which is the surface you are
already on to fix it.

This may be exactly right — a compliance nag on a scan bench would be noise, and
the onboarding step already carries the "you haven't answered" signal. Flagging
it only so the next person knows the absence is **observed, not overlooked**. If
it ever earns a second consumer, the honest home is the onboarding checklist,
not a station.

---

## Working-tree state at handoff

**My GS1 work is complete and independently green** (lint clean on its files,
zero type errors in them, 51 relevant unit tests + guards passing, route
manifest regenerated and enforcing, E2E green on `qa-desktop`). Nothing is
committed — the user manages commits.

`npm run verify` as a whole is **red, and none of it is from this work.** A
concurrent session is mid-refactor in the grid layer; failures moved between
consecutive runs (files appearing and disappearing), so treat this snapshot as
indicative:

| Gate | Failure | Owner |
|---|---|---|
| Lint | 5 × `'ordersQueueColVar' is defined but never used` (`warranty` · `catalog-link` · `my-day` · `pickup` grid layouts) + `getStatusDotBg` in `IncomingGridGroupSummary` | concurrent grid refactor — a shared col-var helper being extracted |
| Unit tests | grid identity-pane assertion: `['select','order','title']` vs expected `['select','title']` | concurrent — a non-Orders surface gained a frozen `order` column |
| knip | `grid-column-geometry.ts` → orphaned export (was `isFlexTrack`, then `GRID_ROW_PX` on the next run) | concurrent, actively churning |
| Doc catalog | stale (`support-ticket-premium-upgrade-GEMINI-BRIEFING.md`) | concurrent |
| Tenancy (advisory) | 22 unresolved, 30 prunable exemptions | pre-existing, non-blocking |

**Do not "fix" these blind** — they are someone's in-flight work, and the
frozen-pane one in particular may be a deliberate ruling mid-landing (the SoT
allows a per-surface pane; Orders legitimately freezes `select · order · title`).
Re-run `npm run verify` once the tree settles and re-attribute before touching
anything.

---

## Reference

- Internal GTIN minter: `src/lib/inventory/internal-gtin.ts`
- GS1 refusal SoT: `src/lib/interop/gs1-keys.ts`
- Encode ladder: `src/lib/qr/platform-link.ts` (`encodePrintMatrix`,
  `unitPlatformDigitalLink`)
- Payload round-trip table: `WILD_PAYLOAD_FORMS` in
  `src/lib/barcode-routing.test.ts`
- Law: [`source-of-truth.md`](../../.claude/rules/source-of-truth.md) →
  *Printed code ↔ scan round-trip* (+ the GS1-identity row added 2026-08-02)
- Settings card: `src/components/settings/sections/Gs1ComplianceCard.tsx`
- E2E: `tests/e2e/gs1-compliance-card.spec.ts` (`qa-desktop`, read-only)
