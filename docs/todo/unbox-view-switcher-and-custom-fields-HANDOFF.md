# View switcher + org-authored custom columns — interview handoff

**Status:** INTERVIEW IN PROGRESS. Strip rebuild SHIPPED (uncommitted). Custom fields NOT started.
**Copy this whole file into a fresh session to resume.** Repo: `cycleforge-app` · attach to `:3050`, never start a server.

---

## 1 · What already shipped this session (uncommitted, typechecks clean)

The Unbox strip was re-ordered from urgency+ownership to **process order**, and two members that
were never stages were removed.

| Before | After |
|---|---|
| `Urgent · Recent · Queue · All · History` + pinned `Inbound` at the far right | `Inbound · Queue · Recent · History` |
| default tab = `History` (the *last* tab) | default = `Queue` |
| `Urgent` = Queue + `?priority_only=1` | not a tab; `?unboxview=urgent` → `queue` |

Files changed: [`src/utils/unbox-workspace-state.ts`](../../src/utils/unbox-workspace-state.ts) (tab
type, labels, order, param maps, default flip, rationale docblock) ·
[`UnboxWorkspaceHeader.tsx`](../../src/components/receiving/unbox/UnboxWorkspaceHeader.tsx)
(`TAB_COLOR`, `isQueueTab`, search placeholder, **pins filtered against system tabs**) ·
[`receiving-modes.ts`](../../src/lib/receiving/receiving-modes.ts) (`resolveUnboxReceivingTableMode`).

**Decisions recorded** (operator, this session):
- Urgent → **pinned band at the top of the queue rows**, tab deleted. House-wide, not Unbox-only.
- `All` → out of the strip (see open item O2 — it is not a filter).
- Inbound → promoted from pinned extra to **first** system tab; far-right duplicate removed.
- Arrival → **stays at `/triage`**; not a tab. Two scan surfaces on one focus-locked bar drops scans.
- Counts on `Queue` and `Recent` only — Inbound counts PO lines, Queue counts cartons, so a
  left-to-right funnel reading would never reconcile.
- Pin subsystem → **kept**, and pivoted into the custom-view catalog (§3).

---

## 2 · The live design question — strip, dropdown, or both

The operator proposed a **top-left dropdown** ("switch to this topic / add another tab") in place of,
or beside, the strip.

**This collides with a ratified law.** `.claude/rules/display/workbench-ops-queue.md` → *Tabs vs.
saved views*:

> Both ship, and they are not two ways to do one thing. The line is **who defines the set** — the
> system (a mutually-exclusive lifecycle transition) or the operator (a named facet combination).
> **The test:** if adding one more would require a migration or a status-machine change, it is a tab.
> If it is just a different combination of params the surface already reads, it is a saved view.

Applied here: the four stages are system-defined and identical for every staffer → **tabs**. Custom
views are operator-defined and unbounded → **not tabs**, because Band-1 has a hard ~6–7 vocabulary
budget at 1080p bench distance (`UNBOX_PINNED_EXTRA_TABS_MAX` exists for exactly this reason).

**Therefore the likely answer is BOTH, and the interview must test it rather than assume it:**
stages stay a strip; views get a switcher. House precedent for the switcher already exists —
`OutboundSavedViewsList` (Desk branch puts saved views in the left rail) and
`HeaderPageSwitcher` + `HeaderChromeMenu` (the sanctioned top-left dropdown chrome; never
re-declare the panel classes locally).

**Do not let the interview conclude "replace the tabs with a dropdown" without overturning that law
explicitly**, in writing, with the reason. A dropdown hides which stage you are on and its count —
the two things the strip exists to show without a click.

---

## 3 · The expansion — org-authored custom columns ("a whole different ballgame")

Operator ruled **(b)**: businesses must be able to **add their own columns**, not merely re-shape
existing ones. The column-management surface already exists —
[`GridColumnDetailsPanel`](../../src/components/ui/table-column-config/GridColumnDetailsPanel.tsx)
owns visibility, width, min/max, highlight and reset. "Add column" is a new verb on it.

### Prior art is a red herring

Four `custom_fields JSONB NOT NULL DEFAULT '{}'` columns already exist — on `customers`, `items`,
`invoices`, `credit_notes`. **All four are Zoho mirror tables** holding vendor-imported fields. None
is an entity the operator's grids work (`receiving_line`, `orders`, `sku_catalog`, `serial_units`).
Precedent for the shape; not a foundation.

### Proposed storage — two org-scoped tables, per `polymorphic-tables.md`

```sql
custom_field_defs
  id BIGSERIAL, organization_id UUID NOT NULL,
  entity_type TEXT NOT NULL,        -- named CHECK, closed vocabulary
  key TEXT, label TEXT,
  type TEXT,                        -- text | number | date | select | boolean
  options JSONB,                    -- select only
  sort_order INT, archived_at TIMESTAMPTZ
  UNIQUE (organization_id, entity_type, key)

custom_field_values
  id BIGSERIAL, organization_id UUID NOT NULL,
  field_id BIGINT REFERENCES custom_field_defs(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL, entity_id BIGINT NOT NULL,
  value_text TEXT, value_number NUMERIC, value_date DATE   -- CHECK: exactly one, matching def.type
  UNIQUE (organization_id, field_id, entity_id)
```

Both need `enforce_tenant_isolation()` **in the birth migration**, org-led indexes, and Drizzle
models in the same PR. Parent-delete integrity: a real FK on `field_id`, plus one
dispatch-on-`TG_ARGV[0]` trigger per entity the discriminator can name — **add the trigger in the
same migration as the discriminator value** (`work_assignments` shipped 5 enum values and 2 triggers
and silently had no delete behaviour for 3 of them for months).

**Typed value columns, not one `value jsonb`.** The entire point of a grid column is comparing it
*down* the column; JSON numbers sort lexically, so `10` lands between `1` and `2`. Sortability is
the feature.

**Side table, not a JSONB blob per entity row.** A blob needs a migration per table, gives no
per-field index, and cannot be reused across entities.

### What falls out for free

- **Alignment** — `resolveGridColumnAlign` keys off column type, so custom number/date end-align and
  text/select start-align with no new rule.
- **In-cell editing** — the plane exists; custom fields are never identity columns
  (`GRID_IDENTITY_COLUMN_KEYS`), so they are editable by default.
- **The definition boundary survives** — one generic `CustomFieldCell` family dispatching on `type`
  keeps [`table-definition.ts:18`](../../src/lib/tables/table-definition.ts) true: *a definition
  selects among columns a family already renders*. Hold that line; it is what stops this becoming a
  spreadsheet engine. AGENTS.md already says AI may author **Zod definitions only** — never cell
  JSX, DDL, or new terminal statuses.

### Two traps that decide whether this survives contact

1. **The join is the whole ballgame.** Ten custom fields as ten `LEFT JOIN`s against a virtualized
   5k-row feed will not hold, and Neon bills CU-hours. It needs **one aggregated join returning a
   jsonb map per entity**, hydrated in JS. Getting this wrong is how the feature ships and then gets
   turned off. Run the `neon-cost-reviewer` agent on the query.
2. **Custom fields are invisible to search** unless added to `build-search-text.ts` **and** the
   `entity_search_outbox` triggers. Decide up front — never call an upsert-search-doc helper from
   domain code.

---

## 3b · Interview rulings — 2026-08-08 (live; append as they land)

**R1 · The flagship surface is a REPORT, not a saved view.** Asked to read one row of
"unreceived orders" aloud, the operator said: *"a PO line — Dell dock ×10, 6 arrived, 4 short."*
A PO-line row carrying an arrived count is a **join across two grains** — purchased (PO lines,
the Inbound feed) against received (cartons, the Queue feed). No existing feed emits that row,
and §1 of this doc already ruled those two feeds *cannot* be reconciled left-to-right, which is
why counts were restricted to Queue and Recent. So the §3 plan (custom **columns** on an existing
table) does not serve the motivating example. **Do not ship an "add a data table" affordance that
can only re-filter one feed** — its first real use is the thing it cannot do.

**R3 · "Arrived" = bench-counted, and that is CORRECT for purchasing — but "short" must be gated
on line completeness.** Operator ruled "arrived" = the 6 on the bench (`quantity_received`), not the
6 inventory-confirmed, and the audience is purchasing. The bench-count basis is right and does *not*
violate Unboxed≠Received: that law guards the **"Received"** label on operator rails (green before
inventory confirm); a purchasing report asks "did the vendor deliver," for which inventory-confirm
lag is our internal delay, not a vendor fault. **The report column must be labeled "arrived" /
"counted," never "received."** The remaining trap is the TIME axis: `expected − counted` mid-unbox is
a *false shortage* — units still in an unopened carton on the same bench read as "short," and
purchasing acts on "short" (vendor claim). A shortage is terminal: `short = expected − counted` only
once the line's receiving is **complete** (all cartons in AND unboxed); before that the honest row is
"in progress, N of M counted," which is a floor status purchasing should not be reading. **OPEN: does
a per-PO-line "receiving complete" signal exist, or must the report derive it?** `workflow_status`
per line + expected-carton accounting are the candidates; a PO can span multiple cartons/shipments,
so completeness is not a single column today.

**R2 · Sharing model — operator proposed station-specific + personal + team.** Industry
converges on exactly the personal/team pair (Airtable Personal/Collaborative/**Locked**,
Salesforce Private/All/Groups gated behind its own `Manage Public List Views` permission,
Linear Personal/Team + favorites against *view sprawl*). Two amendments to the proposal:
- **Station-specific is a PLACEMENT axis, not a third sharing tier.** Visibility (who sees it)
  and placement (where it appears) are orthogonal — collapsing them makes "my personal
  Unbox-only view" inexpressible. Two fields, not one enum.
- **Airtable's `Locked` has no equivalent in the proposal** and is the tier a manager actually
  wants ("this is the returns view, don't re-filter it"). Salesforce's split — anyone may create
  private, *publishing* needs a permission — is the thing that stops 8 people minting 40 org-wide
  views.

## 4 · The interview — ask ONE AT A TIME, in the operator's own words

The operator has twice rejected multiple-choice pickers. Ask in prose. Push back where a proposal
collides with a ruling; do not collect answers neutrally and discover the conflict later.

### A · Does the dropdown replace the strip, or sit beside it?

1. Picture the dropdown open. What is in the list — the four stages, your custom views, or both?
2. If both: how do you tell a stage from a view at a glance? They behave differently — a stage is
   fixed and shared by everyone, a view is something you made.
3. With a dropdown, would you still want Queue and Recent visible *without opening anything*? Their
   counts are the reason the strip exists.
4. If the answer is "the dropdown replaces the tabs" — what do you lose on the day you have 20 views
   and you are looking for the queue?

### B · Ownership and sharing

5. When you add a view, is it yours or the whole team's?
6. Can a manager push a view to everyone — and can a staffer then edit it, or only copy it?
7. If two people open "Damaged returns", must they see the same rows?

### C · The polymorphic question (the operator asked for this explicitly)

8. A custom column added on receiving lines — should it follow the carton to Testing and Shipping,
   or is it receiving-only? *(This is THE model question: per-`entity_type` fields do not travel. A
   field that must travel belongs on the unit/carton every station reads, which is a different
   model.)*
9. Do you need a view on one entity that shows a field stored on another — a receiving-line view
   showing something recorded on the order?
10. Which entity first: receiving lines, orders, or SKUs? `entity_type` is a closed CHECK, and
    scoping v1 to one entity is the difference between a focused build and an open-ended one.

### D · Scale and decay

11. Realistically, how many views — 3, or 30? (Decides switcher vs strip on its own.)
12. What should happen to a view when a column it names is retired?
13. Should a custom column be searchable from the global search bar?

### E · Per-station scope

14. You said "per scan station." Should each station have its own set of views, or are views global
    with stations filtering them?
15. Does an org-authored view ever belong on a *station* strip, or only on desk surfaces?

---

## 5 · Still open from the previous interview

- **O1 · Carton preservation — BLOCKING, and it is the original complaint.** Diagnosed, not built.
  [`useUnboxWorkspaceTab.ts:26`](../../src/hooks/useUnboxWorkspaceTab.ts) dispatches
  `receiving-clear-line` on every tab click, which closes the open carton. **One decision needed:
  on a tab click, does the carton CLOSE, or PARK (stay alive, hidden, restored on return)?** Park is
  what makes "don't lose my place" true; it is a state-machine change, not a flag.
  - **Correction (2026-08-08, verified against source).** The earlier note said "the dispatch buys
    nothing." That is true of exactly ONE of its four listeners. `receiving-clear-line` is a
    **broadcast with four subscribers**, and deleting the dispatch would silently break three:
    | Listener | What it does | Redundant? |
    |---|---|---|
    | [`useReceivingSelection.ts:94`](../../src/components/sidebar/receiving/useReceivingSelection.ts) | closes the carton | **no — this IS the bug** |
    | [`useReceivingRowSelection.ts:144`](../../src/components/station/useReceivingRowSelection.ts) | clears the table highlight | **yes** — lines 135–140 already self-heal (a selected row absent from `localRows` clears itself) |
    | [`useTrackingScan.ts:275`](../../src/components/sidebar/receiving/useTrackingScan.ts) | bumps the scan-session token | no |
    | [`useReceivingWorkspacePane.ts:117`](../../src/components/receiving/useReceivingWorkspacePane.ts) | `setLookupReceipt(null)` | no |
  - So **park is not "stop dispatching."** It needs a signal that separates *drop the pick* from
    *the list underneath changed* — the three non-carton listeners want the second, and only the
    carton wants the first. That is the state-machine change, and it confirms the original
    instinct rather than softening it.
- **O2 · `All` cannot become a Refine option.** It mounts `TechAllTriageTable`, a different
  component — Refine filters the current table's query. Putting it there makes it a mode hiding in a
  filter menu (the Urgent category error, inverted). Recommend deleting it from Unbox; Testing keeps
  its own. Operator has not ruled.
- **O3 · Urgent-to-top not built.** Must be a **pinned band that survives URL-durable column sort**
  (`?colsort=`/`?coldir=`) — implemented as a sort, the first Date-header click scatters it and the
  feature dies with no error. **History is exempt**: it is day-banded, so floating a row above its
  band files it under the wrong date. Note the queue already sets `sort=priority` server-side.
  Also verify an urgent row carries a **visible mark** — once the tab is gone, position is the only
  signal, and the top of a list is also just the top.
- **O4 · Testing and Shipping** still carry the same Urgent-as-filter tab
  ([`TestingWorkspaceHeader.tsx:96`](../../src/components/tech/testing/TestingWorkspaceHeader.tsx),
  [`shipping-workspace-state.ts:7`](../../src/utils/shipping-workspace-state.ts); Shipping's flag is
  `attention`). Operator ruled the change house-wide.

---

## 6 · Two hazards observed in this session — read before trusting a green run

**Concurrent edits.** `unbox-workspace-state.test.ts` was rewritten to assert the new contract
(exact tab array, labels, the stale-`?unboxview=recent` edge case) by something other than this
session, mid-turn. A test run reported the old assertions failing and seconds later the file held
new ones. **A test authored alongside an implementation is not independent verification.** Check
`git status` and whether another session is on the same ticket before committing.

**A guard passing for the wrong reason — FIXED 2026-08-08.**
[`receiving-grid-sheet.guard.test.ts`](../../src/components/station/receiving-grid/receiving-grid-sheet.guard.test.ts)
carried *"Unbox Band 1 includes Urgent and All"* as `assert.match(state, /urgent/)` — a bare
substring match on file text. The new docblock explains at length why Urgent was **removed**, so the
word appears repeatedly and the guard sailed through while asserting the opposite of the truth
(confirmed: 15/15 green against a strip that had already dropped the tab). `assert.match(header,
/Urgent/)` was matching a *comment* about the removal. Same failure mode as
`return-to-scan.guard.test.ts:82`.

Now asserts the **exported contract** — `UNBOX_WORKSPACE_TABS` deep-equals `['incoming', 'queue',
'recent', 'history']`, bare `/unbox` resolves to `queue`, `?unboxview=urgent` migrates to `queue`,
and `normalize` clears a stale `priority_only`. Importing beats comment-stripping: it cannot be
fooled by prose at all. **Verified by mutation** — flipping the default fallback to `history` turns
the suite red (14/15), which the old version could not do for any regression.

**Sweep done.** `return-to-scan.guard.test.ts` already solved this properly with a `readCode()`
helper that strips comments before matching — that is the house precedent, and it was learned by
falsifying its own first draft. The one live sibling is
[`testing-detail-containment.guard.test.ts:32`](../../src/components/tech/testing-detail-containment.guard.test.ts)
(`assert.match(HEADER, /urgent/)`), which is weak but currently **truthful** — Testing still has an
Urgent tab. **It becomes this exact trap the moment O4 lands**, so port it in the same change.

**Also unverified:** `:3050` bounces to `/signin` and an agent must not sign in, so nothing here was
confirmed visually. Verify by eye, or drive Playwright against the QA org (`pnpm provision:qa-org`,
`--project=qa-desktop`) — never assert against the dogfood tenant.

---

## 7 · Never

- Reorder a tab array and leave its docblock stating the old rationale.
- Put another station's **scan bench** in this strip (two focus-locked bars = dropped scans).
- Let a stage tab show a count that invites a funnel reading it cannot satisfy.
- Add a `custom_fields` column to an entity table (blob per row) instead of the side table.
- Ship a custom-field query with one join per field.
- Let a custom-field definition carry cell JSX, DDL, or a new terminal status.
- Overturn the tabs-vs-views law implicitly. Overturn it in writing, or keep both.
