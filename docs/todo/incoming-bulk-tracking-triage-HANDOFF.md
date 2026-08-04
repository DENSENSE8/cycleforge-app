# Handoff — Bulk tracking triage on Incoming: paste-many, filter-many, and "why did it leave the list?"

**Copy everything below the line into a fresh Claude Code session.**
Repo: `cycleforge-app` · attach to `:3050`, never start a server.

**Landed predecessors (do not rebuild):**
- Manual Check rail → `POST /api/receiving-lines/incoming/check-zoho-received` (paste → ERP received?)
- [`zoho-received-check-watchlist-PLAN.md`](./zoho-received-check-watchlist-PLAN.md) Phase 0+1 — three-bucket honesty, `zoho-received-status.ts` leaf SoT, the ERP × warehouse join (`resolveWatchState` / `resolveVerdict`)

**Sibling spec (build alongside):** [`incoming-zoho-receipt-display-SPEC.md`](./incoming-zoho-receipt-display-SPEC.md)

---

## The operator problem, in their words

> "I can only search one tracking number at a time and I need to search a lot and check a lot at
> one time. And when something disappears off the list I need to know why — it was unboxed, or
> Zoho took it — and still be able to find it by pasting tracking numbers."

Two jobs, one root cause: **Incoming can only be interrogated one tracking at a time, and it
drops rows silently.**

---

## The headline decision: ONE paste surface, TWO actions

There is already a paste box (the Check rail). This handoff asks for a second one (bulk filter).
**Do not build a second paste box.**

| | Check rail (shipped) | Bulk filter (asked for) |
|---|---|---|
| Input | a paste list of trackings | a paste list of trackings |
| Parser | `parseTrackingPaste` | `parseTrackingPaste` |
| Question | "is it received upstream?" | "show me these rows" |

Same input, same parser, same panel real estate. Two boxes means an operator pastes the same 40
numbers twice and has to remember which box answers which question — and it is two places to fix
every parsing bug.

**Build ONE right-panel occupant with a paste dock and two commit actions:**

```
   paste 40 trackings  ──┬── [ Filter the list ]  → ?tracking_in=…  (this handoff)
                         └── [ Check receipts  ]  → the existing check API (shipped)
```

`Filter` is the primary (it is the ask); `Check receipts` is the secondary. The results region
below the dock shows whichever ran last. **Retire the standalone Check rail** once this lands —
its chrome CTA becomes a second entry into the same panel, pre-armed to the Check action.

---

## Job 1 — Multi-tracking paste filter

### Entry point (as specified by the operator)

An **external-link icon inside the search display**, in the top context bar:

```
┌─ WorkbenchChromeHeader (band) ─────────────────────────────────────┐
│ [All][Zoho][eBay]        [⌕ search… ⧉]  [⫶]  │ page │ sort │ CTAs  │
└──────────────────────────────────────┬─────────────────────────────┘
                                       └─ ⧉ ExternalLink → opens the panel
```

- The glyph is `ExternalLink` (`@/components/Icons`), `HoverTooltip` **"Paste a list of tracking
  numbers"**. Icon-only is legal here — chrome icon actions with a tooltip are the sanctioned
  exception to the paired-icon rule.
- It renders **inside** `ToolbarSearchToggle`, at the expanded field's trailing edge. That needs a
  new optional `trailingAction?: ReactNode` prop on
  [`ToolbarSearchToggle`](../../src/design-system/primitives/ToolbarSearchToggle.tsx).
  **Add the prop to the primitive — do not fork the component or wrap it in a sibling flex row.**
  The primitive owns the collapse-on-blur timer; an outside sibling collapses the field while the
  operator reaches for the icon.
- **The icon must be visible while collapsed.** `ToolbarSearchToggle` is collapsed at rest, and an
  entry point only reachable after expanding a search you did not want to type in is a hidden
  feature. Render the action beside the collapsed glyph, not only in the expanded state.
- **Ask first** before adding a second always-visible chrome icon anywhere else — the
  GlobalHeader's three-icon rule is about that band, not this one, but the discipline transfers.

### The panel

Non-modal **push** occupant on `RightRailHost`, id `detail:incoming-bulk-tracking`.

```
┌─ right panel (push, resizable, collapsible) ─────────┐
│ SidebarIntakeFormShell — "Tracking list"             │
│                                                      │
│  ┌ results (scrolls) ───────────────────────────────┐│
│  │ 38 of 40 matched · 2 not found                   ││
│  │ ⌐ not found: 1Z…4471, 9400…8823   [copy]         ││
│  │ ⌐ 6 are received in Zoho and were excluded       ││
│  └──────────────────────────────────────────────────┘│
│                                                      │
│  ┌ bottom dock — OmnichannelComposerDock ───────────┐│
│  │ Paste tracking numbers, one per line…            ││
│  │ [+]              [ Check receipts ] [ Filter ]   ││
│  └──────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────┘
```

**Mandatory composition — all four are existing SoT, none is new:**

| Need | Compose | Never |
|---|---|---|
| Right-edge slot | `RightRailHost` + `DetailStackRailRegistrar`, `modal={false}` | a private `fixed right-0 z-panel` aside |
| Shell chrome | `SidebarIntakeFormShell` (this IS an intake/tool overlay) + allowlist entry | `PaneHeader` — that is record-inspector chrome |
| Bottom dock | `OmnichannelComposerDock` — `autoGrow`, `hideCommitButton`, actions in `trailingAction` | a hand-rolled sticky textarea |
| Paste parsing | `parseTrackingPaste` (already exported, already tested) | a second splitter |

Dock details: `Enter` commits the **primary** (Filter); `Shift+Enter` newlines. Focus the dock on
open (`OmnichannelComposerDockHandle.focus()`) — the operator opened it to paste. The panel
**pushes**, so the filtered table and the results list are on screen together; that adjacency is
the whole point and is why this is not a modal.

### The URL param

`?tracking_in=<canon>,<canon>,…` — canonical (upper-alnum) keys from `parseTrackingPaste`.

**Wire it in three places, in this order:**

1. `parseReceivingLinesQuery` ([`lines/query.ts`](../../src/lib/receiving/lines/query.ts)) — parse,
   cap at `CHECK_ZOHO_RECEIVED_MAX_INPUTS` (100), dedupe.
2. `build-sql.ts` — `stn.tracking_number_normalized = ANY($n)`. **Indexed equality**: there is a
   unique btree on that column. **Do not** add a last-8 `OR` arm — measured on the sibling query,
   the `OR` cost an index scan and planned at ~357k for a *single* key.
3. The panel writes the param via `router.replace`, dropping `?page=`.

**Do NOT overload the existing `search` param.** It is one free-text ILIKE (`%term%`) answering
"narrow this list", used by every receiving surface; a delimited list there makes the ILIKE
quadratic and collides with `rh_field` / `rh_scope`.

### ⚠ The gotcha that will make this look broken

**A Zoho-received tracking is excluded from Incoming by `NOT_ZOHO_RECEIVED_PREDICATE`.** So the
naive implementation — paste 40, filter, see 34 — silently drops 6 and reads as a bug. That is
exactly the invisibility this whole initiative exists to fix, so reproducing it here would be
self-defeating.

**Required behaviour:** `?tracking_in=` **bypasses** `NOT_ZOHO_RECEIVED_PREDICATE` and the
delivery-state facet. When an operator names specific trackings, they are asking about *those
rows*, not about the lane's default population.

Then:
- the `zoho` chip goes `tier: 'core'` on this descriptor (sibling spec §2) so the received ones
  are visibly received rather than mysteriously present;
- the lane note is **suppressed** (sibling spec §1) — it would be false here;
- the results region reports both residuals explicitly: **not found at all** (no STN row in this
  org) and **found but normally hidden** (received upstream).

**This is a change to Incoming's contract and is therefore Ask-first.** Confirm before building:
*"should naming a tracking explicitly override the lane's filters?"* The recommendation is yes,
with the two residual counts always shown.

### Cap and honest truncation

100 keys, same as the Check. Over-cap must **say so** in the results region ("showing the first
100 of 137") — a silently truncated paste is the "no silent caps" failure.

---

## Job 2 — "Recently removed from this list, and why"

### The gap

A row vanishes from Incoming for **five** different reasons and the product names none of them:

| # | Reason | Signal | Recency anchor |
|---|---|---|---|
| 1 | Unboxed / received locally | `receiving_unbox.unboxed_at`, `quantity_received > 0` | `unboxed_at` ✅ |
| 2 | **Vendor marked it received** | `zoho_po_mirror.status` ∈ received-like | **none** ⚠ |
| 3 | Dock-scanned (leaves the delivered-unscanned facet) | `receiving_scans` | `rs.scanned_at` ✅ |
| 4 | Aged out of the window | 14d / 45d bounds | derived ✅ |
| 5 | Written off | open loss exception | exception `created_at` ✅ |

### ⚠ Reason 2 has no timestamp, and that is the blocking finding

`zoho_po_mirror` records **`last_synced_at`** — when *we polled*, not when *the vendor flipped the
status*. A PO received three weeks ago and synced this morning is indistinguishable from one
received this morning. So a "recently removed" lane ordered by `last_synced_at` would show, at
the top, POs that left the list weeks ago — the single most common reason rows disappear, sorted
wrongly.

**Closing it needs a migration:** `zoho_po_mirror.status_changed_at timestamptz`, stamped by the
mirror sync **only when the incoming status differs from the stored one**. Nullable, backfilled
`NULL` (not `last_synced_at` — that would fabricate transition times for the entire installed
base, and a fabricated timestamp is worse than an absent one).

**This is Ask-first** (a migration). Until it lands, the lane must **order reason-2 rows by
`last_synced_at` and label them honestly** — *"seen received at last sync"*, never *"received 2h
ago"*.

### Shape of the lane

**Derived, not stored. No new table.** Same joins as Incoming with the exit conditions inverted
plus a recency bound (propose 7 days, one constant, not a user filter).

- **A lane, not a tile.** Tiles are attention buckets ("this needs you"); this is a lookup surface
  ("where did it go"). Put it on `?incview=` — the sidebar rail already owns that param and is its
  only writer — as a third value beside `pos` / `email`. **Do not** add it to `TILES`.
- **Every row states its reason** in a dedicated `removed_reason` column, resolved through a
  registry in `src/lib/receiving/incoming-removal-reason.ts` (label + tone + tip). Never a map in
  the component.
- **A row can satisfy two reasons** (unboxed *and* Zoho-received). Pick with an explicit
  precedence — **physical first**: unboxed > written off > dock-scanned > vendor-received > aged
  out. That ordering matches the house's physical-first stance in `delivered-unscanned.ts`, where
  ERP status is explicitly forbidden from hiding an unscanned box.
- **The `zoho` chip is `core` here** (sibling spec §2).
- `?tracking_in=` must work on this lane too — it is where an operator lands after a paste finds
  nothing on the main lane.

### Reuse before building

`resolveWatchState` / `resolveVerdict`
([`check-zoho-received.ts`](../../src/lib/receiving/check-zoho-received.ts)) already derive
`done` / `delivered_unscanned` / `erp_ahead` from exactly these signals, and are pure + unit
tested. The removal-reason registry should **compose** them, not re-derive the same booleans from
new SQL. If the shapes do not quite fit, **grow those functions** — that is pattern evolution;
forking a parallel derivation is not.

---

## The gap ledger (what closing this initiative actually means)

| # | Gap | Where | Status |
|---|---|---|---|
| 1 | "Not received in Zoho" claimed for unknown answers | Check domain | ✅ fixed (three buckets) |
| 2 | Received-status list typed in 3 places | 3 modules | ✅ fixed (leaf SoT) |
| 3 | Mirror answers presented as live | Check rail | ✅ fixed (`synced_at`) |
| 4 | ERP answer with no warehouse state | Check domain | ✅ fixed (local join) |
| 5 | **One tracking at a time** | `build-sql.ts`, chrome | **Job 1** |
| 6 | **Rows leave the list silently** | Incoming | **Job 2** |
| 7 | **No `status_changed_at` on the mirror** | schema | **Job 2 — Ask-first migration** |
| 8 | Lane predicate never stated to the operator | Incoming | sibling spec §1 |
| 9 | Vendor receipt state unreadable per row | grid | sibling spec §2 |
| 10 | `erp_ahead` found only on demand | feeds | PLAN Phase 3 — prove volume first |
| 11 | Check loses everything on timeout | route | PLAN Phase 4 |
| 12 | 222 STN rows with NULL `organization_id` | data | **own ticket** — invisible to every `tenantQuery` |
| 13 | `delivered-unscanned.ts` docblock calls STN "NEEDS-COL" | comment | stale; it has `organization_id` + FORCE RLS |

**Sequencing:** 5 → 8 → 9 → 6 → 7. Job 1 is the operator's loudest pain and unblocks the rest;
the display work makes Job 2's lane readable when it arrives; the migration is last because the
lane can ship honestly labelled without it.

---

## Read before writing code

- `AGENTS.md` + `.claude/rules/workflow-safety.md` — never start/restart `:3050`; the user commits
- `.claude/rules/source-of-truth.md` → Right-rail modality (push, not float) · the composer dock row
- `.claude/rules/display/workbench-ops-queue.md` → **one sticky layer per scroll port**; trailing cluster
- `.claude/rules/display/right-rail-inspector.md` → intake shell vs `PaneHeader` (this is intake)
- `.claude/rules/backend-patterns.md` → route skeleton, `orgId` from `ctx`
- `.claude/rules/verify.md` → `npm run verify`; **never raise a ratchet baseline**

## Done means

- [ ] ONE paste panel with two actions; the standalone Check rail retired, its CTA re-pointed
- [ ] `?tracking_in=` parsed, indexed in SQL, bypassing the lane predicate (after the Ask-first confirm)
- [ ] Residuals reported: not-found · found-but-normally-hidden · over-cap
- [ ] `ToolbarSearchToggle.trailingAction` added to the primitive, visible while collapsed
- [ ] Recently-removed lane on `?incview=`, every row stating its reason, precedence physical-first
- [ ] Reason-2 rows honestly labelled until `status_changed_at` exists
- [ ] Guard test that `normalizeRow` passes every new column through (the silent-`undefined` trap)
- [ ] `npm run verify` green — attribute pre-existing red to other lanes before inheriting it

## Never

- A second paste box, a second tracking parser, or a second search engine.
- `search` overloaded with a delimited list.
- A per-row "not received in Zoho" chip on the default lane (it is a constant there).
- A stored `removed_at` column or a new table for the recently-removed lane — derive it.
- Backfilling `status_changed_at` from `last_synced_at`.
- A modal or a floating inspector for the paste panel — the right edge pushes.
- Relaxing `NOT_ZOHO_RECEIVED_PREDICATE` globally to solve the `tracking_in` gotcha. Scope the
  bypass to that param.
