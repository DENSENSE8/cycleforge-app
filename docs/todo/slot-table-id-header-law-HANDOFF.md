# Slot-table ID HEADER law — handoff

**Status:** not started. Validate §1 before writing anything — the tree is
moving under this (the Stock action strip landed mid-session from a parallel
worktree), so every number below is a claim to re-check, not a given.

**Operator decision (2026-09-15), both parts explicit:**

1. The first data column's header reads **`Id`** on **all 47** `PRODUCT_TABLES`
   peers. One word, zero drift.
2. Scope is **engine + law + gate + all 24 families in one pass.** Not a
   per-desk trickle.

> *"the ID as the first column so it'll always display the ID as the first
> column in the header instead of differences"*

---

## 1. VALIDATE FIRST — re-run these before touching a file

The snapshot this handoff was written against, and the command that produced
each number. If a number has moved, the plan still holds but the file list has
not.

```bash
# (a) 40 distinct identity header words across the field catalogs
grep -rn "displayType: 'id'" src/lib/tables/field-catalog/*.ts -B 3 \
  | grep "label:" | sed "s/.*label: '//;s/'.*//" | sort | uniq -c | sort -rn

# (b) 24 grid-layout files carrying the copy-pasted header override
grep -rln "t.key === 'fulfillment'" src/

# (c) no law module exists yet
grep -rn "IDENTITY_HEADER\|identityHeader" src/lib/tables/ src/components/tables/

# (d) the engine default is still the Orders-era word
grep -n "key: 'fulfillment'" src/components/tables/compound/compound-columns.ts -A 22 \
  | grep "label:"        # → label: 'Fulfillment'
```

**If (c) returns hits, STOP and read them** — somebody has started this and the
cutover below may be half-applied.

### The evidence, as measured

40 distinct words for one structural column. Top of the distribution:

| count | word |
|---|---|
| 13 | SKU |
| 10 | Order |
| 8 | Serial |
| 5 | Unit |
| 3 | Item · Bin |
| 1 each | 34 others |

The drift **inside one concept** is the part that makes this a law rather than a
preference — these are the same fact wearing different words:

- `Order` (10) · `Order number` · `Order id`
- `Staff` · `Staff #`
- `Item` (3) · `Item #`
- `Id` · `Ext id` · `Entity id` · `TSN id`

## 2. Why it drifted — fix the mechanism, not the 40 strings

Each of the 24 files carries its own copy of this block:

```ts
const identity = X_FIELD_CATALOG.find((f) => f.id === layout.identityFieldId);
return tracks.map((t) => {
  if (t.key === 'fulfillment' && identity) {
    return { ...t, label: identity.label, gridLabel: identity.label,
             type: 'id' as const, fieldId: identity.id,
             slotDisplayType: identity.displayType };
  }
  …
});
```

**That duplication IS the drift engine.** `label: identity.label` means the
header is whatever word the family's catalog happened to pick, and there are 24
independent places to pick it. Renaming 40 catalog labels would fix today's
symptom and leave the mechanism intact — the 41st family would add the 41st
word. So:

> **The engine sets this header. No family may re-declare it.**

Prior support: **"operator 2026-09-14 — the column is Id product-wide"** appears
verbatim in ~8 `*-row-view.ts` files. That ruling governed the CELL (a local
handle paints plainly — no marketplace dot, no open-on-platform menu). The
HEADER was left per-family, which is how 40 words survived a law that already
said "Id product-wide". This closes that gap.

## 3. The change

### 3a. Engine — one declaration

- `src/components/tables/compound/compound-columns.ts`: the `fulfillment` track
  default label becomes `Id`. Kill `'Fulfillment'` — it is an Orders-era
  leftover from when this column was carrier data.
- `src/lib/tables/materialize-tracks.ts` (or a small law module beside it, see
  3c): the identity track's `label` / `gridLabel` are set to `Id` centrally.
  Families keep supplying `fieldId`, `type: 'id'` and `slotDisplayType` — those
  are real per-family facts. Only the WORD is centralised.

### 3b. Families — delete the override, keep the binding

In each of the 24 files, the `label:` / `gridLabel:` lines come out of the
`fulfillment` branch. Everything else in that branch stays.

<details>
<summary>The 24 files (re-verify with §1b)</summary>

- `src/components/admin/sourcing/part-compatibility-grid-layout.ts`
- `src/components/inventory/allocations-grid/unit-allocations-grid-layout.ts`
- `src/components/inventory/bulk-allocate-grid/admin-bulk-allocate-grid-layout.ts`
- `src/components/inventory/cycle-count-lines/cycle-count-lines-grid-layout.ts`
- `src/components/inventory/cycle-counts/cycle-counts-grid-layout.ts`
- `src/components/inventory/drift-grid/admin-drift-alerts-grid-layout.ts`
- `src/components/inventory/drift-grid/admin-sku-drift-grid-layout.ts`
- `src/components/inventory/holds-grid/admin-holds-grid-layout.ts`
- `src/components/inventory/returns-grid/admin-returns-grid-layout.ts`
- `src/components/inventory/sku-bins-grid/sku-bins-grid-layout.ts`
- `src/components/inventory/sku-ledger-grid/sku-ledger-grid-layout.ts`
- `src/components/inventory/tsn-links-grid/unit-tsn-links-grid-layout.ts`
- `src/components/reports/report-bin-utilization-grid/report-bin-utilization-grid-layout.ts`
- `src/components/reports/report-dead-stock-grid/report-dead-stock-grid-layout.ts`
- `src/components/reports/report-staff-day-grid/report-staff-day-grid-layout.ts`
- `src/components/reports/report-velocity-grid/report-velocity-grid-layout.ts`
- `src/components/search/hits-grid/search-hits-grid-layout.ts`
- `src/components/settings/audit-log/audit-log-grid-layout.ts`
- `src/components/settings/kiosk-devices/kiosk-devices-grid-layout.ts`
- `src/components/settings/kiosk-slot-events/kiosk-slot-events-grid-layout.ts`
- `src/components/settings/sessions/auth-sessions-grid-layout.ts`
- `src/components/settings/staff-directory/staff-directory-grid-layout.ts`
- `src/components/walk-in/grid/walk-in-sales-grid-layout.ts`
- `src/components/inventory/location-stock-grid/location-stock-grid-layout.ts`
  *(this one currently prints "Location" — it added the 40th word)*

</details>

**The catalog `label` stays.** It is still the Fields-picker row, the
`ds_contract` answer, and the hover/aria word — it just stops being the column
header. That is the compromise that makes "Id" affordable: the header is
uniform, the *specific* word is still reachable where an operator needs it.

### 3c. Law module + gate

Mirror the shape that already works three times over in this repo
(`nav-name-collisions`, `lanes`/`LANE_MOBILE_FIRST`, `slot-table-action-bar-law`):

| layer | artifact |
|---|---|
| rule module | `src/lib/tables/slot-table-id-header-law.ts` — the word, the track key, the 24-file list |
| **write-time** | ESLint `no-restricted-syntax` on the grid-layout glob, refusing `label:`/`gridLabel:` inside a `fulfillment` branch. The `PostToolUse` hook already runs `next lint --file` on every write, so this fires on the edit that reintroduces it. |
| pre-commit | `Id header` gate in `scripts/verify-profile.mjs`, `profiles: 'always'` (a source read, <1s, and the increments that break it are `verify:fast` increments) |
| full suite | `slot-table-id-header-law.test.ts` — asserts every materialized peer's `fulfillment` header is `Id` |
| discovery | `ds_id_header` adjudicator in `tools/design-mcp/server.mjs` + `--json` on the guard + add to `TOOLS_EXPECT` in `smoke.mjs` |
| eval + graph | add the header symbol to `SLOT_TABLE_ENGINE.graphSymbols` so `eval:cohort slot-table` runs `find` + `impact` on it |
| AGENTS.md | **pointer only, ≤6 lines.** Prose is the weakest and most expensive surface — it is loaded every turn for every agent. The law lives in the module and the gate. |

**Mutation-test the gate before trusting it.** A gate that passes on correct
code but does not fail on the bug is theatre. Re-add `label: identity.label` to
one family, confirm both ESLint and the unit gate go red, then revert:

```bash
npx eslint src/components/inventory/sku-bins-grid/sku-bins-grid-layout.ts
npx tsx --test src/lib/tables/slot-table-id-header-law.test.ts
```

## 4. Position is ALREADY invariant — do not "fix" it

The compound skeleton mounts `select · fulfillment · thumb · item · dates ·
state · status:N · _fill` in fixed order (`COMPOUND_COLUMN_KEYS`), and `select`
is a gutter, so the identity is **already** the first data column on every
compound peer. State it in the law module as an assertion over
`COMPOUND_COLUMN_KEYS`; do not re-order anything.

Check the SHEET-morph peers separately (`bins` is the one to look at) — the
sheet skeleton is not the compound one, and the claim above is only verified for
compound.

## 5. Risks

- **47 tables change header text in one commit.** Visible everywhere. Worth a
  screenshot pass on 3–4 desks (To-ship, Unbox, Inventory › Stock, Settings ›
  Sessions) rather than trusting the unit gate alone.
- **Information loss is the accepted cost.** "Location" and "SKU" told you what
  kind of handle column 1 held; "Id" does not. The operator chose consistency
  and the cell content still disambiguates (`C-04-09-2-00` vs `00045-P-2-BK`).
  If this reads worse in practice than on paper, the fallback already has a
  name: keep the family noun and kill only the synonyms (40 → ~12). Do not
  invent a third option.
- **A test may pin an old header.** Expect `assert.equal(label('fulfillment'),
  'Bin')`-shaped assertions. Those pin the old law and must be **updated**, not
  worked around — `location-stock.test.ts` has exactly one (`'Location'`).
- **`ds_contract` copy** may quote a family header word; re-read after the
  cutover.

## 6. Definition of done

```bash
npx tsc --noEmit -p tsconfig.json
npx tsx scripts/id-header-guard.ts          # the new gate
npx tsx --test src/lib/tables/slot-table-id-header-law.test.ts
pnpm run eval:cohort slot-table             # ok:true, peers == enginePeers
node tools/design-mcp/smoke.mjs             # all good (TOOLS_EXPECT updated)
npm run verify:fast                         # + the new `Id header` gate green
```

- [ ] `grep -rln "t.key === 'fulfillment'" src/` still returns 24 files, and
      **none** of them contains `label:` in that branch.
- [ ] The 40-word enumeration in §1a returns the catalog labels **unchanged** —
      this cutover must not touch catalog `label`, only the header.
- [ ] Gate mutation-tested red, then green.
- [ ] Screenshot pass on 3+ desks confirming column 1 reads `Id`.
- [ ] Hover/aria on the identity cell still names the specific handle
      ("Location", "Bin") — that is what makes the uniform header affordable.
- [ ] AGENTS.md gained ≤6 lines.

## 7. Adjacent, do not fix here

- `compound-row-model.test.ts` × 3 fail on HEAD (`Daily` declares a `status:1`
  the shared-tracks guard rejects — unrelated working-tree changes). Will block
  a full `npm run verify`.
- The `Order` / `Order number` / `Order id` catalog labels stay as-is in this
  pass; they become Fields-picker rows only. Collapsing them is the fallback
  plan in §5, not part of this.
