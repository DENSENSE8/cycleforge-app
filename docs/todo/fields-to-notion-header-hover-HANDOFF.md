# Handoff — Notion-style hover Columns control (retire the permanent lip)

Repo `cycleforge-app` · stay on the checkout's branch · attach to the dev server on
`:3050` (never start/restart/kill it) · user manages commits, no `git stash` ·
`npm run verify` green before done, never raise a baseline · don't edit this file.

Supersedes `fields-chrome-to-table-lip-HANDOFF.md` (now a stub).

## Already shipped — do NOT re-do (verified by call site 2026-08-02)

| Done | Evidence |
|---|---|
| Chrome `Fields` retired everywhere | `GridFieldsMenu.tsx` **deleted**, zero mounts |
| Guard already **bans** chrome column pickers | `workbench-trailing-cluster.guard.test.ts` |
| Lip wired on **13** grid views (Orders + My Day incl.) | each passes `onOpenColumnDetails` + mounts `<GridColumnDetailsPanel>` |
| **Reset** already in the rail | `GridColumnDetailsPanel.tsx` → `useGridFields().reset` |

**Remaining work is the affordance only — not the architecture.** The rail, prefs,
one-registrar rule and chrome ban all stay exactly as they are.

## Mission

Replace the **permanent top-right lip** with a **hover-revealed overlay** on the
column-header band.

**Why:** the lip reserves layout — both headers apply `pr-9` plus an absolute `w-9`
bordered track, so every grid gives up gutter width forever to host an occasional
control.

Operator sees: nothing at rest (last column uses full width) → hover the header band
→ light-gray **Columns** control fades in at the right edge, **overlaying** (no
reflow) → click opens the existing Column display rail, unchanged.

## Overlay spec

| Aspect | Requirement |
|---|---|
| Reveal | `group-hover` on the header row **+** when the rail is open **+** on `focus-visible` |
| Why all three | hover alone is keyboard-unreachable and vanishes while its own rail is open |
| Position | `absolute inset-y-0 right-0` inside the existing `relative` band |
| Paint | light-gray token wash (`bg-surface-muted`-ish) — **not** card+border, which reads as a permanent track |
| Layout | **no `pr-9`**; no change to `gridTemplateColumns`; may clip the last label slightly (Notion does) |
| Pointer events | `none` while hidden, `auto` when shown — else an invisible box eats last-column clicks |
| Motion | opacity only, CSS + `motion-safe:` — **never** a framer `whileHover` on the band |
| Test hook | rename `data-grid-column-details-lip` → `data-grid-column-details-trigger` |
| A11y | keep `aria-expanded` + accessible name **Column display** |

## Anti-patterns

Permanent `w-9` track · `pr-9` · Columns back in `GlobalHeader`/`WorkbenchTrailingCluster` ·
a second sticky band above the grid · a page-local hover twin (grow the SoT, wire adapters) ·
shrinking columns to make room.

## Streams

**A — Replace the lip.** In `LedgerGridColumnHeader.tsx` and
`orders-queue/OrdersQueueColumnHeader.tsx`: drop `pr-9`, swap the lip block for the
overlay, rename the attribute, scope hover to the row's existing `group/hrow`. If
promoting Orders onto `LedgerGridColumnHeader` is cheap, do that and delete the twin.

**B — Guard.** `workbench-trailing-cluster.guard.test.ts` already asserts `absolute
inset-y-0 right-0` + no second sticky — keep both. Add: **ban `pr-9`**, require the
hover/open reveal, retarget the attribute name. Keep the chrome-picker ban untouched.
**Negative-test it** — re-add `pr-9` and confirm failure.

**C — E2E.** `grid-column-fields-lip.spec.ts` (rename → `…-columns-hover.spec.ts`) and
`my-day-today.spec.ts` (~line 236). Both must hover the band first, then click. Add the
assertion that is the whole point: **not visible at rest.** Keep existing coverage.

**D — SoT prose (five files).**

| File | Change |
|---|---|
| `.claude/rules/display/workbench.md` | Trailing Display & Actions — hover control, not a lip |
| `.claude/rules/display/workbench-ops-queue.md` | ~line 146 — argument survives ("not chrome"), drop "lip" |
| `.claude/rules/source-of-truth.md` | Grid column visibility + sort row |
| `.cursor/rules/workbench-sort-chrome.mdc` | order stays **Sort → Import → Add**; point at hover |
| `src/design-system/DESIGN_SYSTEM.md` (~135) | still names the **deleted** `GridFieldsMenu` as "quiet trailing chrome" |

State the reason, not just the mechanic: *reserving a permanent gutter taxes every row
of every grid forever to host an occasional action.*

**F — Column-justification ruling** (independent of A–D; land in the same pass).

Three sources disagree, which fails `ledger-grid-column-display.spec.ts` D2 on receiving
(`column "date" resolved the wrong alignment / Expected "flex-start" / Received "flex-end"`):

1. `grid-header-align.ts` → `ALIGN_BY_TYPE` maps `date`/`id`/`location` → `end`
2. `.claude/rules/source-of-truth.md` → same
3. spec D2's `want` map → `date`, `order` (`id`), `tracking` (`location`) → `flex-start`,
   with deliberate comments (*"id — a label made of digits, not a magnitude"*)

> The spec is the outlier but its position is **considered, not a typo**. **Do not edit the
> assertion to match the code** — move all three together.

**Ruled 2026-08-02 — identifiers split by ROLE, not type:**

| Identifier | Role | Align | Status |
|---|---|---|---|
| PO # · sales order # · `order` | the row's **transaction identity** | **start** | implement |
| SKU / item # · serial · ticket · tracking | a **reference attribute** | **end** | already correct |

An order number is a name you read and the first thing scanned on an order-anchored
surface; a catalog item number is an attribute of a product whose identity is its title.

Implement as explicit `align: 'start'` on the order column's layout model — the override
`grid-header-align.ts`'s docblock anticipates. **Never change `ALIGN_BY_TYPE.id`**: that
drags SKU/serial/ticket left too. Call sites: `order` in
`src/lib/dashboard-order-row-layout.ts` (two models, both `frozen: true`) and
`src/lib/receiving/receiving-grid-layout.ts`. Then update the spec's `want` map + SoT rows.

**Unadjudicated — do NOT guess:** `date` and `location` (tracking). Spec wants `start`,
code says `end`, nobody has ruled. Leave them `end`, leave that assertion red, raise it.
Flipping them to green the suite is the exact move this section prevents.

SoT docs already carry the ruling marked *RULED, not yet shipped* — delete those notes when
the code lands.

**E — Verify.** `npm run verify` green. On `:3050` spot-check History, Unbox, Incoming,
Outbound Pending, Catalog, Pickup, Repair, Ready, Warranty, Today: no gutter at rest, hover
reveals, click opens the rail, last column clickable when hidden; order numbers read left,
catalog SKU reads right.

## Done when

- [ ] No `pr-9` / no permanent lip in either header — no column shift on open/close
- [ ] Hover (or rail-open, or focus) reveals the control; click opens the rail
- [ ] Guard bans `pr-9`, requires the reveal, and fails when reverted
- [ ] E2E hovers first and asserts hidden-at-rest
- [ ] Five SoT files match shipped behaviour
- [ ] Order/PO/sales-order numbers `start` via `align:` on the model (not `ALIGN_BY_TYPE.id`); SKU stays `end`
- [ ] `date`/`tracking` untouched, question raised
- [ ] `npm run verify` passes

## Non-goals

Re-retiring chrome Fields (done) · adding Reset (done) · wiring Orders/My Day lips (done) ·
Sort/Import/Add in the header · custom columns · sticky-right body gutter · `TableActionBar` ·
raising baselines.

## Paste prompt

> Read `docs/todo/fields-to-notion-header-hover-HANDOFF.md`, execute streams A–F. Chrome
> Fields is already retired and stays retired; the rail is unchanged. The only change is the
> affordance — the permanent `pr-9` lip becomes a hover-revealed overlay reserving no layout.
> Stream F lands the column-justification ruling; do not edit the D2 assertion to match the
> code, and do not touch `date`/`tracking`. Verify by call sites, not docblocks.
> `npm run verify` before done.
