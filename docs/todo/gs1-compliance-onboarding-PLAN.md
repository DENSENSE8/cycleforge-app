# GS1 compliance onboarding — PLAN

**Date:** 2026-08-02 · `main` · **Lane:** WS-DOGFOOD
**Status:** **SHIPPED — P0–P4 complete.** Schema + resolver + API (P0/P1),
Settings UI (P2), onboarding step (P3), and the duplicate-GLN retirement (P4),
all verified end-to-end on `:3050` against the **QA org**.
**Predecessor:** `printed-code-round-trip-HANDOFF.md` (shipped as `07b236fdf`) — it
built the four-rung encode ladder this flow feeds. Nothing here changes the ladder.

---

## The job in one sentence

Ask a new tenant the two questions that decide whether they need a licensed GS1
key at all — *do you stock brand-new product?* and *do you sell on Amazon?* — and
give the ones who answer yes a place to put the key they hold (or a pointer to
buy one), so the print ladder's GS1 rungs light up for exactly the tenants they
are legal for and stay dark for everyone else.

---

## Why this exists

`encodePrintMatrix` descends a four-rung ladder (`src/lib/qr/platform-link.ts`):

```
1. GS1 Digital Link URI     https://{slug}…/01/{gtin}/21/{serial}
                            https://{slug}…/414/{gln}/254/{code}
2. GS1 element string       (01){gtin}(21){serial} · (414){gln}(254){code}
3. Platform Digital Link    https://{slug}…/m/r/{id}
4. Bare handle / flat code  R-1234 · T-9395 · A0101101
```

Rungs 1–2 need a **licensed** GS1 key. Rungs 3–4 need nothing. The gating is
already correct and automatic — `isLicensedGln` / `hasCompanyPrefix` /
`resolveGs1Identity` decide purely on whether a valid, non-placeholder value is
present, so **no routing or encoding code changes in this plan.**

The gap is upstream of all of it: **nothing in the product ever writes that
value.** `organizations.settings.gs1 = { companyPrefix, gln, cbvUriForm }` exists
in the typed schema (`src/lib/tenancy/settings.ts`) and is read by
`resolveOrgGs1Identity` (`src/lib/interop/org-gs1.ts`), but
`/api/admin/organization/settings` exposes neither key in GET or PATCH, and no
Settings UI renders them. The only `gln` inputs that exist are two per-browser
`localStorage` copies inside the bin/rack label builders — a different value in
a different place from the one the ladder reads.

So this is a collection problem, not an encoding problem.

---

## The correction the questions force

The two questions the flow asks are about **product identity (GTIN)**, not
location identity (GLN). They are different keys answering different questions,
and conflating them is the easiest mistake to make here:

| Key | Answers | Who demands it | Driven by these questions? |
|---|---|---|---|
| **GTIN** (needs a Company Prefix, or per-item purchase) | *what product is this* | Amazon, when you create a listing for a **new** item | **Yes** |
| **GLN** | *what physical place is this* | an EDI / EPCIS trading partner | **No** — separate, optional |

**Amazon's strictness is a GTIN rule, and only for new listings.** Selling used /
refurbished against an **existing** ASIN needs no GTIN of your own, which is why
a refurb-on-eBay tenant — the dogfood case — legitimately answers "no" to both
and never sees the key field. eBay does not require a GTIN for used/refurb at
all ("Does not apply" is a valid identifier value there).

So: the two questions gate a **Company Prefix / GTIN** prompt. GLN stays an
independent, always-optional field for the tenant who does EDI. This plan does
not make GLN part of the gate.

### A prefix is not the only legal answer

A tenant can hold GTINs **without** a Company Prefix (GS1 sells individual
GTINs), in which case there is nothing org-level to store — the values land
per-SKU in `sku_catalog.gtin`. A brand owner may also be exempt. A flow that
only accepts "paste your Company Prefix" would nag those tenants forever, so
the answer is an enum, not a string presence check:

| `gs1Status` | Means | Org-level value expected |
|---|---|---|
| `null` | unanswered | — |
| `'prefix'` | holds a GS1 Company Prefix | `gs1.companyPrefix` |
| `'per-item'` | buys individual GTINs per product | none — per-SKU |
| `'exempt'` | brand owner / category exemption | none |
| `'none'` | needs to acquire one | none — this is the only nag state |

---

## Why Settings, with an onboarding step pointing at it

`ONBOARDING_STEPS` (`src/lib/onboarding/steps.ts`) is **stateless** — every step
is `{ id, label, href, doneWhen(stats) }` and completion is *derived* from live
`OnboardingStats`, never stored. There is no form-step primitive and no place to
persist an answer. A two-question survey is inherently an answer to persist, so
it cannot live in that array.

The answers therefore live in `organizations.settings`, edited from Settings, and
onboarding gets **one** new step whose `doneWhen` derives off a new stat
(`complianceAnsweredAt != null`) — the same shape as every existing step, with no
new step machinery.

---

## Phases

Each ships alone.

### P0 — persist the answers ✅ **shipped**

Extend `OrgSettingsSchema` (`src/lib/tenancy/settings.ts`) with a `compliance`
block, sibling to `gs1`:

```ts
compliance: {
  hasNewInventory: boolean | null   // null = unanswered, false = answered "no"
  sellsOnAmazon:   boolean | null
  gs1Status: 'prefix' | 'per-item' | 'exempt' | 'none' | null
  answeredAt: string | null         // ISO — what the onboarding step derives off
}
```

**Nullable, not defaulted-false.** "Has not answered" and "answered no" are
different states: the first should prompt, the second must never prompt again.
A `false` default collapses them and makes the onboarding step complete itself.

No migration — `organizations.settings` is JSONB and `gs1` already lives there.

Add the pure policy resolver to `src/lib/interop/gs1-keys.ts` (import-free and
client-safe today — keep it that way; take the answers structurally rather than
importing the tenancy type):

```ts
resolveGs1Requirement(answers, identity) → {
  answered: boolean            // both questions answered
  required: boolean            // a GTIN-capable key is expected
  reasons: ('new-inventory' | 'amazon')[]
  unmet: boolean               // required AND nothing usable on file
}
```

`unmet` is the only thing any surface should nag on.

### P1 — expose it on the API ✅ **shipped**

Extend `GET`/`PATCH /api/admin/organization/settings` to carry `gs1` and
`compliance` (absent from both today).

- Validate through the **existing** refusal — `resolveGs1Identity` /
  `isLicensedGln` / `hasValidGs1CheckDigit`. No new validator: a placeholder
  prefix or a bad check digit must be rejected here for the same reason
  `gs1-keys.ts` refuses it downstream, and one refusal is the point.
- **Stamp `answeredAt` server-side**, never from the body — a client-supplied
  timestamp is an onboarding-completion claim the client should not get to make.
- PATCH stays merge-only over present keys, matching the route's existing
  contract.

**Verified on `:3050` against the dogfood org, then restored to baseline.** The
state machine walks correctly: `no + no` → answered, not required · `yes + yes` →
required with both reasons, `unmet` · claiming `'prefix'` with nothing entered →
**still `unmet`** · entering a licensed-shaped prefix → clears. `answeredAt`
stamps once and is preserved across subsequent edits, and clears when an answer
returns to `null`. All six refusals return 400 with the SoT's own verdict:
placeholder prefix, placeholder GLN, bad check digit, 12-digit GLN, unknown
`gs1Status`, non-boolean answer.

### P2 — Settings UI ✅ **shipped**

One section on the Settings Organization page:

1. Two toggles — *"We stock brand-new / industry-standard-new inventory"* ·
   *"We sell on Amazon"*.
2. If **either** is true → reveal the `gs1Status` picker; if `'prefix'`, reveal a
   validated Company Prefix field. Plain inline `{condition && <Field/>}` — the
   convention already used at `OrganizationSection.tsx:413`; do **not** invent a
   gated-field primitive for one call site.
3. If both false → no key prompt, but still stamp `answeredAt` so the step clears.
4. GLN is a separate always-visible optional field in the same section, labelled
   for what it is (EDI / EPCIS partners), **not** part of the gate.
5. "Don't have one?" → a link out to GS1 US. **No purchase automation** — see
   Non-goals.

**Shipped as `Gs1ComplianceCard`** (`src/components/settings/sections/`), mounted
in `OrganizationSection` beside `InvitationsSection` — grouped with it because
both own their own fetch + Save, while every card below shares the page's single
"Save changes". It talks to `/api/admin/organization/settings`, not the
`/profile` route its siblings use: routing it through `/profile` would have
meant forking both the GS1 validation and the `answeredAt` stamp.

**One correction to step 1.** The questions render as **Yes/No pairs with
neither pressed**, not toggles. A checkbox cannot draw `null`, so an untouched
card would read as "answered no to both" and one Save would stamp `answeredAt`
for a tenant who never saw the question — the exact collapse the nullable schema
exists to prevent. The card also computes its reveal and its nag with
`resolveGs1Requirement` itself (pure, client-safe), fed the DRAFT, so the UI
cannot drift from the API's verdict and reacts before a round-trip.

Verified on the QA org: unanswered renders nothing pressed and no key prompt ·
one "yes" reveals the picker but does **not** nag (half-answered is not `unmet`)
· both answered + nothing on file nags · claiming `'prefix'` with an empty field
stays `unmet` · `'exempt'` clears it · Save round-trips and the server stamps
`answeredAt` · a placeholder prefix 400s with the SoT's own verdict. Pinned by
`tests/e2e/gs1-compliance-card.spec.ts` (read-only, `qa-desktop`).

### P3 — onboarding step ✅ **shipped**

Row in `ONBOARDING_STEPS` → `doneWhen: (s) => s.complianceAnsweredAt != null`,
`href: '/settings/organization#gs1'`. `OnboardingStats` gained
`complianceAnsweredAt: string | null`, and `stats.ts` selects the org's
`settings` blob and reads it through **`getComplianceAnswers(parseOrgSettings(…))`**
rather than a hand-written `settings #>> '{compliance,answeredAt}'` — the shape
of that block has exactly one owner (`OrgSettingsSchema`), and a jsonb path
spelled out in the query would be a second place that has to be right.
(`column-reference.guard.test.ts` also reads the path literal as a column
reference and fails the build, which is how the duplication surfaced.)

This is the one step whose completion is a persisted ANSWER rather than derived
activity — deliberately, because "we stock no new inventory and don't sell on
Amazon" is a fact no row in this database can prove. It stays read-time derived
like every sibling: the value is stamped server-side and this step only reads
it. Unit-pinned in `steps.test.ts`, including that no amount of activity data
completes it.

### P4 — retire the duplicate localStorage GLN ✅ **shipped**

`bin-label-printer/storage.ts` and `rack-printer/rack-printer-config.ts` each keep
their own `gln` in browser `localStorage` — a second source of truth for a
per-tenant fact, and one that silently disagrees with
`organizations.settings.gs1.gln`.

**The field was DELETED from both configs, not demoted to an override.** A GLN
is a licensed identifier belonging to the company, so a per-browser copy meant
two operators could print the same rack with different GLNs and neither had to
match the value the print ladder reads. An "override" would have preserved
exactly that.

- `GET /api/org/gs1` (new) → the **resolved** `{ gln, companyPrefix }`, gated by
  **`print.label`**, not `admin.view`: the operator printing bin stickers is not
  an admin, and a read they cannot perform sends them straight back to a local
  override. It discloses nothing — a GLN is printed on every label and
  resolvable by anyone who scans one. Resolved rather than raw, so a placeholder
  arrives as `''` exactly as `encodePrintMatrix` will see it.
- `useOrgGs1()` (new) is the browser's only GLN. Degrades to `''` on failure —
  also the safe direction, since an absent GLN just falls back to the bare
  location code, which scans identically here.
- Both `ConfigSheet`s now show the workspace GLN **read-only**, pointing at
  Settings.
- `sanitizeStoredGln` and its test are gone; deleting the key is strictly
  stronger than sanitising it, because `loadConfig` never reads `gln` — a stale
  `0614141000005` in localStorage is inert JSON that cannot reach a label by any
  path. `printer-gln-source.test.ts` (renamed) pins that: neither config module
  may reference a `gln` again, and a pre-2026-08-02 stored config loads its
  layout counts with the placeholder dropped.

---

## Do NOT

- **Mint a platform-level GS1 key and share it across tenants.** A GLN or prefix
  identifies one legal entity. One key stamped on every tenant's labels asserts
  that Cycle Forge operates their warehouse — the borrowed-`DEFAULT_GLN` bug
  moved up a level. The registrant must be the tenant.
- **Build "auto-buy".** No confirmed GS1 US purchase API exists, and even with
  one the purchase is tied to the buyer's legal identity — Cycle Forge buying on
  a tenant's behalf makes Cycle Forge the registrant. Link out; let them buy.
- **Default the answers to `false`.** See P0.
- **Gate the GLN field behind these two questions.** GLN is not what Amazon
  checks.
- **Touch `encodePrintMatrix` / `routeScan`.** The ladder already reads the value
  correctly the moment it exists.
- **Nag a tenant whose `gs1Status` is `per-item` or `exempt`.** Only `unmet`.

## Done when

- `organizations.settings.compliance` round-trips through GET/PATCH, with
  `answeredAt` stamped server-side.
- A placeholder prefix or bad-check-digit GLN is refused by the API with the same
  verdict `gs1-keys.ts` gives.
- `resolveGs1Requirement` is unit-pinned across the answer matrix, including the
  unanswered-vs-answered-no distinction.
- `npm run verify` green, no baseline raised, no migration.
- The printers hold no GLN of their own; the org value is the only one.

## Reference

- Ladder + encode SoT: `src/lib/qr/platform-link.ts` · law in
  `.claude/rules/source-of-truth.md` → *Printed code ↔ scan round-trip*
- GS1 refusal SoT: `src/lib/interop/gs1-keys.ts` (`resolveGs1Identity`,
  `hasCompanyPrefix`, `isLicensedGln`, `isPlaceholderGs1Prefix`)
- Server resolution: `src/lib/interop/org-gs1.ts` (`resolveOrgGs1Identity`)
- Settings schema: `src/lib/tenancy/settings.ts` (`OrgSettingsSchema`)
- Settings API: `src/app/api/admin/organization/settings/route.ts`
- Onboarding: `src/lib/onboarding/steps.ts` + `stats.ts`
