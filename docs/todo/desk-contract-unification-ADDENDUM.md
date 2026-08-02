# Desk contract unification — execution addendum

**Companion to:** [`desk-contract-unification-CLAUDE-CODE-PROMPT.md`](desk-contract-unification-CLAUDE-CODE-PROMPT.md)
**Written:** 2026-08-01 · verified against the working tree, not inferred
**Why a separate file:** the prompt doc is being edited by a concurrent session in this
same lane. This addendum is additive and stays out of its way. Where the two disagree,
this file is the later, verified reading.

**Scope of this file:** everything the prompt doc leaves under-specified — the blocking
prerequisite it does not name, the extraction contracts, the clone template with real
line counts, the right-rail obligations, and the guard that makes the whole thing stick.

---

## A. Preflight — what the audit got right, and what it missed

| Claim in the prompt doc | Verified? | Correction |
|---|---|---|
| All five surfaces lack a LedgerGrid mount | ✅ | — |
| `SAVED_VIEW_SURFACES` has 10 values | ✅ | list is exact |
| Guard certifies 11 grid families | ✅ | `orders · catalog · receiving · incoming · repair · pickup · station-history · fba · warranty · my-day · ready` |
| `ContextPanelLayout` at `src/components/layout/` | ❌ | `src/components/sidebar/ContextPanelLayout.tsx` |
| `WorkbenchChromeHeader.tsx` is a file | ❌ | export of `src/components/dashboard/workbench-shell.tsx` (so is `WorkbenchTrailingCluster`) |
| “Add the surface to `SAVED_VIEW_SURFACES` + CHECK” is the whole wiring | ❌ | **three** further blockers — §B |
| Right rail needs a bespoke header per surface | ❌ | compose `PaneHeader` + its blocks barrel — §D.2 |

> ⚠️ **Correction (09:56).** An earlier revision of this file claimed
> `RightRailInspectorHeader` (`@/components/ui/pane-header/RightRailInspectorHeader.tsx`) was
> shipped and pinned by two guards. It existed in the tree at 09:33 and was **gone by 09:36**,
> along with its guard and `.claude/rules/display/right-rail-inspector.md` — the concurrent
> session rolled its entire Phase 0 slice back (§H). Two recon agents caught the claim
> independently. §D.2 below is rewritten against what is actually on disk. **Do not build a
> rail against `RightRailInspectorHeader`; it will not compile.**

**The one thing the audit under-called:** it treats the saved-views waist as ready to
receive five new surfaces. It is not. §B is a *blocking prerequisite* to Phase 1, and
skipping it means the first new surface either invents a fake localStorage key or reds
`npm run verify`.

### A.1 Corrected file index

```
src/hooks/useSavedViews.ts
src/lib/saved-views/surfaces.ts
src/lib/saved-views/surfaces.test.ts                  # lockstep CHECK ↔ TS list
src/components/unshipped/OutboundSavedViewsList.tsx   # extract → shared
src/design-system/components/grid/LedgerGrid.tsx
src/design-system/components/grid/grid-surface-descriptor.ts
src/components/right-rail/RightRailHost.tsx
src/components/right-rail/DetailStackRailRegistrar.tsx
src/components/ui/pane-header/                        # PaneHeader + blocks = the rail header SoT
src/components/shipped/details-panel/ShippedDetailsHeader.tsx  # the header reference to copy
src/components/layout/SidebarShell.tsx
src/components/sidebar/ContextPanelLayout.tsx         # + sidebar/context-panel-column.ts
src/components/dashboard/workbench-shell.tsx          # WorkbenchChromeHeader + WorkbenchTrailingCluster
src/components/dashboard/DashboardScrollShell.tsx     # chrome-vs-body sticky split
src/components/outbound/ready/grid/                   # THE clone template (§C)
src/lib/tables/grid-surface-capabilities.guard.test.ts
.claude/rules/display/workbench.md
.claude/rules/display/right-rail-inspector.md         # created by the concurrent session
.claude/rules/source-of-truth.md
```

---

## B. Phase 0.5 — grow the saved-views waist FIRST (blocking prerequisite)

Insert between Phase 0 (docs) and Phase 1 (Support). Small, behavior-preserving for the
two existing consumers, and every later phase depends on it.

### B.1 `useSavedViews` addresses surfaces through a **legacy-key lookup table**

```ts
// src/hooks/useSavedViews.ts:74-84
export function useSavedViews({ storageKey, paramKeys }: {
  storageKey: string; paramKeys: readonly string[];
}) {
  const surface = surfaceFromStorageKey(storageKey);   // ← the problem
```

`surfaceFromStorageKey` maps *former localStorage keys* to DB surfaces. It exists only so
the 2026-07-29 migration off localStorage did not have to touch its call sites. A
brand-new surface has no former localStorage key — so, as the hook stands, adding
`support_tickets` means **minting a fake localStorage key whose only job is to be looked
up again**. That is a legacy shim acquiring new dependents, which is the shape
`pattern-evolution.md` says to grow rather than route around.

**Do:** widen the hook to take the surface directly; keep the legacy path for the two
existing callers.

```ts
export function useSavedViews(args:
  | { surface: SavedViewSurface; paramKeys: readonly string[] }
  | { storageKey: string;        paramKeys: readonly string[] }   // legacy — do not add callers
): UseSavedViewsResult
```

Resolve internally with
`'surface' in args ? args.surface : surfaceFromStorageKey(args.storageKey)`.

**Also add a `console.error` when the surface resolves to `null`.** The hook currently
**fails soft** — `setViews([])`, and `saveView`/`removeView` early-return — so a typo
produces a saved-views list that silently renders empty forever and a Save button that
does nothing. That is the worst failure mode this surface has, and it is one line to
make loud.

**Do not** add entries to `STORAGE_KEY_TO_SURFACE` for the five new surfaces. That map
should only ever shrink.

### B.2 The lockstep test reads the CHECK out of the **birth migration** — new values red it

```ts
// src/lib/saved-views/surfaces.test.ts:40-56
const sql = readFileSync(new URL('../migrations/2026-07-29g_saved_views.sql', ...));
const chk = /saved_views_surface_chk[\s\S]*?CHECK\s*\(\s*surface\s+IN\s*\(([\s\S]*?)\)\s*\)/i.exec(sql);
assert.deepEqual([...SAVED_VIEW_SURFACES].sort(), inCheck, '…');
```

Migrations here are **immutable once dated**, so a new surface arrives in a follow-up
`DROP CONSTRAINT … ADD CONSTRAINT`. The test then compares the grown TS list against the
*stale birth* CHECK and fails — on a change that is entirely correct.

**Do:** before Phase 1 adds a value, teach the test to resolve the **effective** CHECK —
scan `src/lib/migrations/*saved_views*.sql` in filename order, let the last file that
defines `saved_views_surface_chk` win. Same hazard `polymorphic-tables.md` documents for
`reason_codes_flow_context_chk`; here we make the test read it correctly rather than hope.

**Do not** edit `2026-07-29g_saved_views.sql` in place. It has been applied; editing an
applied migration means the file and the database disagree forever.

### B.3 Two hard-pinned counts move on every phase

```ts
assert.equal(SAVED_VIEW_SURFACES.length, 10);          // surfaces.test.ts:31
assert.equal(GENERIC_SAVED_VIEW_SURFACES.length, 8);   // surfaces.test.ts:61
```

Both are correct guards (they catch a silent drop). The five new surfaces are **all
generic** — they use `/api/saved-views`, not a dedicated route — so each one bumps *both*.

### B.4 The follow-up migration — copy this shape

```sql
-- src/lib/migrations/2026-08-0X_saved_views_desk_surfaces.sql
BEGIN;

DO $$ BEGIN
  ALTER TABLE saved_views DROP CONSTRAINT IF EXISTS saved_views_surface_chk;
  ALTER TABLE saved_views ADD CONSTRAINT saved_views_surface_chk
    CHECK (surface IN (
      -- carried forward from 2026-07-29g — a redefinition must re-affirm the FULL union
      'operations','media_library',
      'dashboard_unshipped','dashboard_packed','dashboard_shipped',
      'tech_history','packer_history','receiving_history','receiving_incoming','testing_history',
      -- Desk contract unification
      'support_tickets','warehouse_locations','product_labels','product_manuals','product_pairing'
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMIT;
```

**Add all five values in ONE migration**, even though the phases land one at a time. A
CHECK redefinition per phase is five chances to drop a value someone else just added —
the exact regression `polymorphic-tables.md` §1 warns about.

**Corollary — land the whole declaration in one commit.** The lockstep test compares
*sets*, so a migration with five new values and a TS list with none fails just as hard as
the reverse. Ship the migration + all five `SAVED_VIEW_SURFACES` values + both counts
together, and let the UI arrive per phase. A declared surface with no consumer is inert;
a half-declared one is a red gate.

### B.5 Naming decisions (do not re-litigate per phase)

| Surface value | Why this name |
|---|---|
| `support_tickets` | entity, not route — matches the `tech_history` / `receiving_incoming` grain |
| `warehouse_locations` | the collection is **locations**; a label is an action on one. The prompt doc's `warehouse_labels` alternative is **rejected** — naming a surface after its printer is what produced the room-picker-as-map bug in the first place |
| `product_labels` | the printable-SKU collection |
| `product_manuals` | — |
| `product_pairing` | — |

`shipping_ready` and `shipping_labels` stay **out of scope**; they are adjacent debt, and
adding unused CHECK values invites dead surfaces.

---

## C. The clone template — Ready wins, and here is the diff you actually write

`src/components/outbound/ready/grid/` is the smallest **complete** `LedgerGridSurface`
adapter in the tree. Real sizes:

| File | Lines | What it is | Per-surface work |
|---|---|---|---|
| `ready-grid-layout.ts` | 161 | column model · frozen keys · sortable keys · template · sticky-left · default sort dir | **Author** — the only genuinely new thinking |
| `ready-grid-descriptor.ts` | 54 | `CAPABILITIES` const + `make*GridDescriptor(columns)` | Mechanical — swap 3 names |
| `ReadyGridView.tsx` | 168 | the mount: `useUrlColumnSort` + `useGridColumnVisibility` + descriptor + `LedgerGridSurface` | Mechanical + a `compare*Rows` switch |
| `ReadyGridRow.tsx` | 267 | one `<div>` per track, composing `@/components/ui/grid-cells` | **Author** — cells are domain |
| `ReadyGridColumnHeader.tsx` | 57 | thin adapter over `LedgerGridColumnHeader` | Mechanical — swap 2 names |

**≈ 700 lines per surface, of which ~430 is real authorship** (layout + row). Budget that
honestly: five surfaces is not one sitting. The payoff is that ~700 lines of *shared-shape*
code replaces a bespoke board, each of which currently carries its own row chrome, its own
sort state machine, and its own empty states.

### C.1 The five invariants a new column model must satisfy

Read off `ready-grid-layout.ts` and the sibling guards. `npm run verify` catches all five,
but knowing them up front saves a cycle:

1. **`select` is column 0 and `frozen: true`.** The frozen pane must be a *contiguous
   leading prefix* — sticky-left offsets sum the widths of the frozen columns before a
   given one (`readyGridFrozenLeft`, lines 138–146), so a frozen column sitting after a
   scrolling one pins at the wrong origin.
2. **Frozen columns carry no `hideKey` and no `tier`.** They are structural —
   `GridFieldsMenu` must never be able to take the row's identity away.
3. **Derive, never re-type, the frozen list:** `gridFrozenKeys(COLUMNS)` (line 113).
4. **Justification resolves from `type`**, never hand-typed on a cell. `number`/`id`/
   `location`/`date` end-align; `text`/`longtext`/`tag`/`external` start-align. Set
   `align` only for a declared exception, and say why on the same line.
5. **Open lean.** Everything past the operator's scan question is `tier: 'optional'`.

An **action track** (a control, not a fact) gets `sortable: false` and **no** `hideKey` —
the Fields menu must not offer to hide a control (line 108).

> Ready's column docblock (lines 51–63) justifies its core/optional split in prose —
> *"`reasons` and `velocity` ship optional because they are the WHY behind `destination`,
> rationale you open when a destination surprises you, not a column you scan."* Copy that
> habit. It is what stops the next person widening the default set by reflex.

### C.2 `?colsort=` for all five — nothing to decide

Each of these five is a fresh surface with no server-ordering vocabulary already spending
`?sort=`, so `useUrlColumnSort` (`?colsort=` / `?coldir=`) is correct by the two-param law.
Do **not** add a `?sort=` display-order dropdown beside it — two sort params on one list
makes the header and the dropdown disagree about what is sorted.

### C.3 The virtualizer settle tick is not optional

`ReadyGridView.tsx:118-124` does a one-shot `requestAnimationFrame` re-render after the
first non-empty data. Without it a self-scrolling `LedgerGridSurface` can miss its
scrollport on first paint and render **zero rows over a non-empty dataset** — a silently
blank table. Copy it into every new `*GridView`.

### C.4 Answer both empty questions

`LedgerGridSurface` takes `emptyMessage` (nothing exists) **and** `searchEmptyMessage` +
`isSearching` (a filter excluded everything). They are different answers and the surface
collapsed them into one until 2026-07-29. Also note `loading` draws placeholder rows at
the real column geometry — do not swap the grid for a spinner.

### C.5 Guard registration — three files, all required

1. `src/lib/tables/grid-surface-capabilities.guard.test.ts` — add the `CAPABILITIES`
   import, a `DECLARED_CAPABILITIES` entry, **and** the `MOUNTS` entry. The disk-walk half
   fails a mount with no bag; the hand-list half fails a bag with no mount. They check
   each other, which is why both are needed.
2. `grid-column-tier.guard.test.ts` — frozen pane derived, contiguous, never hideable,
   always in the default set.
3. `grid-column-display.guard.test.ts` — alignment composed from the SoT helpers; no row
   mounts an in-cell title editor.

---

## D. Right-rail contract for the five new surfaces

### D.1 Occupant ids — per-entity, **not** stable

The stable-id exception in `motion-crossfade.md` (`detail:order`, `detail:receiving`)
exists for surfaces where **arrowing down a queue record-by-record is the core loop**, and
it carries hard preconditions: full re-seed on record change, and a dirty draft flushed for
the *outgoing* record before the swap.

None of these five is a prev/next walk, and every one holds a **form with unsaved state**
(a ticket reply, a label print config, a pairing edit). So:

| Surface | Occupant id |
|---|---|
| Support ticket | `detail:support-ticket:<id>` |
| Warehouse location | `detail:warehouse-location:<id>` · create: `detail:warehouse-location:new` |
| Product label | `detail:product-label:<sku>` |
| Manual | `detail:manual:<id>` |
| Pairing | `detail:pairing:<id>` |

Per-entity ids give exit→enter between records, which is the honest signal that the form
you were typing in has been replaced. **Do not** reach for a stable id to make record
switching feel smoother without first implementing the flush.

### D.2 The header — compose `PaneHeader` + its blocks

**What actually exists** (`src/components/ui/pane-header/index.ts`, verified 09:56):

```ts
export { PaneHeader, paneHeaderRowClass } from './PaneHeader';
export { PageHeader } from './PageHeader';
export {
  PaneHeaderLabel, paneHeaderLabelEyebrowClass, paneHeaderLabelValueClass,
  PaneHeaderTitle, PaneHeaderCount, PaneHeaderIconBadge, PaneHeaderCloseButton,
  PaneHeaderStatusPill, PaneHeaderTabs, PaneHeaderActionBar, PaneHeaderPagination,
} from './blocks';
```

`PaneHeader` is the **detail-pane / flyout / side-panel** header (`PageHeader` is the
route-level twin and locks the row at 44px; using it in a panel triggers a dev warning).

**The reference to copy is `ShippedDetailsHeader`** (`src/components/shipped/details-panel/`)
— it composes `PaneHeader` + `PaneHeaderIconBadge` + `PaneHeaderLabel` + `PaneHeaderTabs` +
`PaneHeaderActionBar`, and makes `onClose` optional so the same header serves the rail and
the full-page `/o/[orderId]` workspace. All five new rails should follow that shape.

**Collapse is NOT a header control — it belongs to the host.** `RightRailHost` renders
`HorizontalEdgeResizeHandle` with `onCollapse` against `DETAIL_STACK_COLLAPSE`, and
`detail-stack-collapse.guard.test.ts` pins exactly that ("no page-local twin / raw collapse
button"). So a rail ships **Close** in its header and inherits **Collapse** from the edge
grip. Adding a header collapse button fails the guard.

> `MyDayTaskInspector` hand-rolls its close as a bare `IconButton` with
> `ariaLabel="Close task details"` rather than using `PaneHeaderCloseButton`. Copy
> `ShippedDetailsHeader`, not that.

### D.3 `modal={false}` — and what it obliges

Non-modal is right for all five: the operator's context (sibling rows, the lifecycle band)
is exactly what a scrim would hide. Per `source-of-truth.md` → Right-rail modality:

- **Leave `closeOnOutsideClick` OFF.** The dismiss layer is `fixed inset-0`, so it swallows
  the sibling-row clicks the modality flip exists to preserve. (`detail:receiving` is the
  one exception, for its own reasons.)
- No `aria-modal`, no focus trap — `role="region"` + `ariaLabel`. The host has never
  installed a trap, so claiming one in markup was always a lie.

### D.4 Create mode is the same occupant, seeded empty

The Add CTA registers the **same panel component** with an id ending `:new` and a
`mode: 'create'` prop. Not a second component, not a modal. Precedent: the intake/import
planes already register non-modally (`detail:new-order`, `detail:incoming-import-ebay`).

### D.5 Do not rebuild an ambient right region

`RightRailHost` renders exactly the top occupant. None of these five is inside Unbox, so
the station push-column exclusion list does not apply — but do **not** add an always-on
right region for "the label preview" or "the manual". That door is explicitly closed
(`source-of-truth.md`: the retired `RightRailProcedureRegion`). A surface that should stay
visible while the operator works is a **display the operator picks**, not a region that
outranks the picker.

---

## E. The shared `SavedViewsList` — exact extraction contract

`OutboundSavedViewsList` is 150 lines and **already generic except for one ternary pair**
(`mode` → `storageKey`, `mode` → `paramKeys`, lines 29–40). This is a lift, not a rewrite.

**Create** `src/components/saved-views/SavedViewsList.tsx`:

```tsx
export function SavedViewsList({ surface, paramKeys, label = 'Saved views' }: {
  surface: SavedViewSurface;
  paramKeys: readonly string[];
  /** Eyebrow copy — only override when a surface's views are not "views". */
  label?: string;
}): JSX.Element
```

Move lines 41–149 verbatim (the `useSavedViews` call, the Star/Check/Trash2 row chrome, the
naming form, the disabled-state titles). Keep every class string as-is — it already obeys
one-row anatomy, `text-role-eyebrow`, and the `QUEUE_ROW` selection grammar
(`bg-blue-50 … ring-1 ring-inset ring-blue-400`).

Then reduce `OutboundSavedViewsList` to the mode→surface map plus a `<SavedViewsList />`.
Keep the file and its name — the dashboard sidebar imports it and a rename is churn with
no reader benefit.

**Do not generalize further.** Resist `renderRow`, `emptyCopy`, or a `variant` prop "for
the new surfaces": five call sites that all want the identical list is the case *for* one
component, and each escape hatch is a future divergence. If a surface genuinely needs
different row chrome, that is a signal it is not a saved-views list.

**Empty copy is shared on purpose.** "No saved views yet. Set a filter, then save it here."
teaches the mechanism, and the mechanism is identical on all five.

---

## F. The durable enforcement — design the Desk guard properly

Phase 6 item 5 ("add a guard test") is the single thing that keeps this from regressing,
and the prompt doc leaves it as one sentence. A guard that greps page files for
`LedgerGrid` is fragile — pages compose several layers deep, so it would either miss real
violations or force every page to import the grid directly.

**Model it on the guard that already works:** the *discovery half* of
`grid-surface-capabilities.guard.test.ts` (walks `src/**/*.tsx` off disk, matches
`/<LedgerGrid(?:Surface)?[<\s/>]/`, and fails **both** directions against a hand list). That
shape is proven — it caught two undeclared mounts the hand list had certified as green.

### F.1 What the Desk guard should assert

Author `src/lib/desk-contract.guard.test.ts` with a **registry, not a grep**:

```ts
/** Every route that owes the Desk recipe, and the modules that satisfy it. */
const DESK_SURFACES: Record<string, {
  gridSurface: string;        // key in DECLARED_CAPABILITIES
  savedViewSurface: SavedViewSurface;
  railOccupantPrefix: string; // 'detail:support-ticket:'
}> = { … };
```

Then three assertions:

1. **Grid** — every `gridSurface` value is a key of `DECLARED_CAPABILITIES` (import the map
   or re-derive it). This chains onto the existing mount discovery for free: a Desk surface
   naming a grid family that has no mount already fails there.
2. **Saved views** — every `savedViewSurface` is in `SAVED_VIEW_SURFACES`, **and** exactly
   one non-test file references it. That second half is the one that matters: a declared
   surface with no consumer is the dead-CHECK-value failure mode §B.5 warns about.
3. **Rail** — every `railOccupantPrefix` appears in at least one non-test source file.

### F.2 What it must NOT do

- **Do not assert a page file imports `LedgerGrid`.** Composition depth is legitimate.
- **Do not walk every route and demand Desk shape.** The allowlist runs the wrong
  direction: it would put Station floors and Monitor pages on a permanent exception list
  that grows with the app, and a rule whose exception list grows faster than its subject
  list is documentation, not enforcement. Register the surfaces that owe the recipe.
- **Do not pin counts** (`assert.equal(Object.keys(DESK_SURFACES).length, 5)`). The point
  is that adding a Desk surface is *cheap and correct*, not that there are exactly five.

### F.3 The negative guard is the valuable half

Add a **shrink-only ratchet on the deleted shapes** — the thing that actually prevents the
regression this whole effort is about:

```ts
/** Files still mounting a hand-rolled Desk collection map. Baseline SHRINKS ONLY. */
const HAND_ROLLED_DESK_MAPS = 0;   // was 5 before this migration
```

Discovered by walking `src` for a raw `<table` inside any file that also touches a Desk
route. Per `verify.md`: **baselines only shrink — never raise one to land a port.**

---

## G. Sequencing — revised, with dependency edges explicit

```
Phase 0    SoT docs  ← IN PROGRESS by a concurrent session (§H)
              │
Phase 0.5  saved-views waist   ← BLOCKING for 1–5
              ├── useSavedViews accepts `surface` (+ loud null)
              ├── effective-CHECK lockstep test
              ├── ONE migration, all five values
              ├── SAVED_VIEW_SURFACES + both counts
              └── extract SavedViewsList
              │
Phase 1    Support tickets     ← largest user-visible win; proves the recipe
              │
        ┌─────┴─────┬───────────┬──────────┐
Phase 2 Warehouse  Phase 3     Phase 4    Phase 5
        locations  Prod labels Manuals    Pairing
                       │
                   (may reuse the catalog column model — decide IN Phase 3,
                    do not pre-commit)
              │
Phase 6    Sweep + dead code + the Desk guard (§F)
Phase 7    npm run verify
```

**Phases 2–5 are independent of each other** and share only Phase 0.5. That is the parallel
seam if the work is split. **Phase 1 is not parallelizable with them** — it is the first
real exercise of the recipe, and any correction it forces (rail props, chrome slots,
`SavedViewsList` shape) should land before four more surfaces copy it.

### G.1 Stop rule

If Phase 1 needs a **sixth** shared primitive that does not exist yet, stop and report
rather than authoring it five times. The success metric here is *fewer patterns*;
discovering a genuine gap is a result, and quietly forking around it is the failure this
document exists to prevent.

---

## H. Lane hazard — this plan has two sessions in it

On 2026-08-01 a concurrent session executed Phase 0 of this plan in the same checkout —
**and then rolled all of it back.** Observed timeline (local time):

| Time | What happened |
|---|---|
| 09:21 | Prompt doc written |
| ~09:31 | Phase 0 lands: *Desk recipe* section added to `workbench.md`; `.claude/rules/display/right-rail-inspector.md` created; `RightRailInspectorHeader.tsx` + `right-rail-inspector-header.guard.test.ts` created; `source-of-truth.md` / `contextual-display.md` / `ui-design-system.md` touched |
| 09:36 | **All of it reverted.** Rule doc deleted, component deleted, its guard deleted, the Desk recipe section removed from `workbench.md`, and the prompt doc restored to its original 21,985 bytes — discarding an addendum written into it minutes earlier |

Two consequences that matter more than the inconvenience:

1. **Phase 0 is NOT done and is NOT owned.** Nothing of it survives. Anyone starting here
   starts clean.
2. **The rollback was clean** — no dangling references were left behind. `workbench.md`
   contains no link to the deleted `right-rail-inspector.md`, and `grep -rn
   RightRailInspectorHeader src` returns zero. The rule files still show as ` M` in
   `git status`, but from *unrelated* earlier work (the MasterNav spine pass), not from this.

**Before executing any phase:**

1. `git status` first, and re-verify any SoT module this document names before you build
   against it. This file was itself wrong about `RightRailInspectorHeader` for twenty
   minutes because the tree changed under it.
2. Stage only your own files. Never `git stash`.
3. When a gate fails, run it on your files before assuming the red is yours.

### H.1 What Phase 0 owes — all of it

Since the rollback, the full Phase 0 list is outstanding:

- **The three-slot Desk recipe** in `.claude/rules/display/workbench.md`.
- **The explicit demotion.** "Master–detail PDF/hub in the middle" for manuals / pairing /
  labels must be marked **legacy — migrate**. Without it the current `ManualLibrary` /
  `ProductHubPanel` shape still reads as sanctioned master–detail under the Workbench
  recipes table.
- **`source-of-truth.md` waist rows** for Desk left / middle / right. The Desk rows that
  exist there today are all *spine membership* (`STATION_GROUPS`, `kind: 'stock'`,
  `kind: 'labels'`, `kind: 'products'`) — navigation, not the collection contract.

**Open question worth deciding before re-doing it:** the reverted slice tried to introduce
`RightRailInspectorHeader` as a new DS primitive. Given `PaneHeader` + its blocks already
serve `ShippedDetailsHeader` and `IncomingDetailsHeader`, the cheaper answer is a documented
*composition recipe* over the existing primitive rather than a new component. Decide that
once, in Phase 0, before five rails are authored against either answer.

---

# PART II — per-surface recon

Produced by five parallel read-only agents over the live tree (2026-08-01). Each was asked
to propose a column model under the house justification law, declare all five capability
flags explicitly, grep every deletion candidate for other call sites before calling it
deletable, and argue its surface's one non-obvious decision both ways before deciding.

**Read §J first if you only read one thing** — it is what all five surfaces have in common,
and it contains two live defects that are not display bugs.

---

## I.1 Support tickets — `/support`

**Estimate: L.** Not because the grid is hard — because of the remote-list problem (§I.1.4).

### Today

| File | Lines | Role |
|---|---|---|
| `SupportTicketsBoard.tsx` | 351 | The middle. Already `DashboardScrollShell` + `WorkbenchChromeHeader density="band"` + `WorkbenchTrailingCluster` — the chrome is **already right**. The body is a `divide-y` of `<button>` rows inside `MONITOR_SECTION_CARD_SCROLL_CLASS` (a *rollup* token on an ops surface) |
| `SupportTicketRow.tsx` | 63 | One hand-rolled `<button>`: status dot · subject · priority chip; line 2 = status · #id · timeAgo. Renders **no requester, no assignee, no linked entity**. Its `selected` prop is always passed `false` |
| `SupportTicketsRecentRail.tsx` | 120 | The left. A localStorage MRU (max 8) that **duplicates `SupportTicketRow`'s markup verbatim** rather than importing it |
| `SupportTicketsWorkspace.tsx` | 44 | The `?ticket=` router that swaps the **whole body** for the focus pane |
| `SupportTicketFocus.tsx` | 207 | Full-pane Station Workbench takeover |
| `SupportTicketDetail.tsx` | 278 | **The extractable rail body** — already accepts `embedded`, `hideExternalLink`, `hideLinkedContext`, `onBack`, `composerPlacement` |

**URL:** `?tstatus=` `?tq=` `?ticket=` are all declared. **`sort` and `page` are plain
`useState`** (`SupportTicketsBoard.tsx:139-140`) — a shared link loses both. That is precisely
the defect `useUrlColumnSort` exists to fix. `?colsort=`/`?coldir=` are already carried via
`WORKBENCH_CARRIES`, so adopting it needs **no route-spec change**.

### Proposed columns

| key | header | type | tier | frozen | source |
|---|---|---|---|---|---|
| `select` | — | — | — | ✅ | empty 2rem spacer (**not** a checkbox — multiSelect is false) |
| `ticket` | Ticket | `id` | — | ✅ | `ticket.id`, gridLabel `#` |
| `subject` | Subject | `text` | — | ✅ | `subject ?? '(no subject)'`, `minmax(14rem,1fr)` — the only flexing track |
| `status` | Status | `tag` | core | | `statusBadge()` |
| `priority` | Prio | `tag` | core | | `priorityBadge()` |
| `updated` | Updated | `date` | core | | `updated_at`, default dir `desc` |
| `assignee` | Assignee | `text` | core | | `useZendeskAgents()` — one org-wide query, already warm |
| `requester` | Requester | `text` | **optional** | | `useZendeskUsers(pageIds)` — costs a **second** network hop per page |
| `linked` | Linked | `external` | **optional** | | **no source exists** — see risks |

> Before authoring the cells: the `STATUS_DOT` map is currently duplicated in
> `SupportTicketRow.tsx:9` and `SupportTicketsRecentRail.tsx:22`. Promote it into
> `zendesk/badges.ts` **first**, or the migration ships a third copy.

### Capabilities

```ts
{ rowTriageFlags: false, multiSelect: false, inCellEdit: true, fieldsMenu: true, dayBands: false }
```

- **`inCellEdit: true` is the single biggest win of the whole migration.** `status`,
  `priority` and `assignee` are exactly the "single-value, highly-typed field" case, and the
  optimistic mutations already exist with rollback. Today changing a ticket's status costs
  open-focus → Ticket tab → `SupportChatHeader` → `ZendeskSelect` → back. Identity is safe by
  construction: `select · ticket · subject` are frozen and `isGridColumnInCellEditable`
  refuses a frozen key.
- **`multiSelect: false` — and this is a judgement, not an oversight.** `useUpdateTicket` /
  `useAssignTicket` are strictly per-id, and the visible set is a Zendesk-paginated 25-row
  window, so "select all" would mean "select this page" — a lie on a 900-ticket queue. Since
  workbench law forbids an inert gutter, the frozen `select` track renders the same empty
  spacer `ReadyGridRow.tsx:105-117` uses. *Honest tension:* bulk solve/assign **is** a real
  helpdesk job. It becomes `true` the day a batch endpoint exists — one descriptor line plus
  a `SelectionAction[]`.
- **`dayBands: false`** — rows arrive as a server-ordered 25-row page. A day band over a page
  window would head a band with a day whose other rows are on page 3: a band that claims to
  be a day and is not.

### Judgement call — does `SupportTicketFocus` survive? **No. Delete it.**

*For keeping it:* a ticket is a conversation you live inside for ten minutes, not a row you
glance at. The focus pane gives it four displays, a station composer with public-reply vs
internal-note, CC, photo drag-drop, and a full timeline merge. Squeezing that into 420px
beside a nine-column grid is the arithmetic `source-of-truth.md` says does not work at 1440px.
It is also the *only* sanctioned non-carton identity fork — the house wrote a rule and two
guards to bless it, which is not the profile of an accident.

*For deleting it:* the fork is not load-bearing, it is **cost**. It exists only because a
full-body swap needed station chrome to fill the width. Its four tabs are not unique —
`SupportTicketDetail` already owns Ticket, `SupportContextHub` already renders Connections and
Conversations from an anchor, Timeline is generic. It carries the last hand-built
`TerminalActionVm` on this surface (150 lines + a 110-line test) purely to pick a CTA. Two open
paths to one ticket means every future change is made twice, and `?ticket=` can only point at
one of them.

**Decided: delete.** It is not a different *job*, it is a different *width* — and
`pattern-evolution.md` earns a new sibling for a different job, not a bigger box. If ten-minute
conversations need room, the answer is the rail's existing resize + collapse grammar. The rail
keeps `SupportTicketIdentity` as its header title block (**reused, not re-implemented**) and
mounts a `SectionTabsSlider` over the same four contents.

**Exactly what changes:**

- `station-workbench-chrome-config.ts:98-102` — drop `SupportTicketFocus.tsx` from
  `TERMINAL_HAND_VM_ALLOWLIST` (the sanctioned shrink direction), leaving `PackerReviewMode` +
  `LabelsOrderWorkspace`.
- `station-workbench-chrome-config.ts:110` — `IDENTITY_FORK_ALLOWLIST` becomes `[] as const`.
- `station-workbench-chrome.guard.test.ts:149-156` — **delete Guard F entirely.** It
  `readFileSync`s `SupportTicketFocus.tsx` unconditionally; leaving it throws **ENOENT**, not
  an assertion failure.
- `station-workbench-chrome.guard.test.ts:159-168` — **delete Guard F2** likewise.
  `SupportTicketComposerDock` itself **stays** — `TestingPanel` still mounts it.
- `.claude/rules/display/station-workbench.md` — remove the Tier C row, and rewrite "the
  **only** sanctioned fork is `SupportTicketIdentity`" to say there is now none.
- Deleted with it: `support-station-tabs.tsx` (154), `resolve-support-terminal.tsx` (150),
  `resolve-support-terminal.test.ts` (110), `SupportTicketsWorkspace.tsx` (44).
  **`SupportTicketIdentity.tsx` (63) survives**, re-mounted in the rail header.

### I.1.4 Risks

- **The remote-list problem (the reason this is L).** Every capability this architecture
  assumes — column sort, day bands, select-all, stable row identity across pages — is defined
  against a local queryable table. Support has a paginated live Zendesk page whose sort
  vocabulary is **ignored on 4 of 5 tabs**. Deciding client-page sort vs. server `sortBy`
  mapping, and what a header click does on a search-mode tab, is genuine design work.
- **Two columns have no data.** `requester` needs a per-page batch user resolve. `linked` has
  **no source at all** — it needs a new batch endpoint over `ticket_links` including the
  provider-id → `support_tickets.id` join. Ship `linked` as `GridCellDash` or hold the column
  back; do not fake it.
- **Nine files must move together** or `verify` fails with ENOENT rather than an assertion.

---

## I.2 Warehouse labels → locations desk — `/warehouse`

**Estimate: M** — dominated by the wizard→rail collapse, not the grid.

### Judgement call — one grid or two surfaces? **One grid.**

*For two:* the jobs and permissions genuinely differ — printing is `print.label`, browsing
stock is `sku_stock.view`, editing a bin is `sku_stock.manage`. A print operator asks "which
addresses need a sticker"; Fill / SKUs / Qty / Stale answer none of that. The product already
gestures at the split — `BinsBulkActionBar`'s "Print N labels" fires an event into a workspace
that shows a queued-bins banner: a print queue asking to be born.

*For one:* **the print queue has no data behind it.** `label_print_jobs.job_type` is
CHECK-constrained to `UNIT | MANIFEST | HANDLING_UNIT | REPRINT` — no location discriminator,
no `location_id` — and `locations` has no `label_printed_at`. The only trace that a location
label was printed is *the locations row itself*, upserted by `registerPrintedLocations`. A
print queue would therefore be a second surface over the **same** table with an invented status
column — the page-local fork the SoT bans. And the populations are not disjoint: every
printable address becomes a locations row on first print.

**Decided: one grid**, with the label fact as a derived `registered` column reading
`l.created_at` — a row exists ⇔ a label has been printed for that address at least once.
**Label it "Registered", not "Printed"**, because it is not a reprint ledger and must not
pretend to be one. If a real reprint ledger is later wanted, extend `label_print_jobs` with a
`LOCATION` job_type and a `location_id` — a column upgrade, not a second surface.

### Proposed columns — 17 tracks, opens at 12

Frozen: `select` (real checkbox) · `title` = `row.name` (the dashed `A-01-01-1-01` code) with
`row.barcode` as a mono sub-line. **Named `title`** so it inherits the
`GRID_IDENTITY_COLUMN_KEYS` editability floor for free without widening it; typed `id`, so it
END-aligns exactly like Orders' frozen `order`.

Core: `room` · `aisle` · `bay` · `skus` · `qty` · `fill` · `counted` · `status`
Optional: `zone` · `level` · `position` · `binType` · `capacity` · `registered`
Action: a **Print** control (`sortable:false`, no `hideKey`).

Three cells need care:

- **`fill` is a declared align exception** — typed `number` (it sorts on `fill_pct`) with
  explicit `align: 'start'`, because the cell is a **meter** that must fill from the leading
  edge, not a digit to compare-align. Same shape as catalog's `inventory`. Declare it once on
  the layout SoT.
- **`counted` must return `GridCellDash` for null.** Today `fmtAge` prints the literal string
  `'never'` — an invented absence token the honest-absence SoT bans.
- **`registered` requires adding `l.created_at` to the `getBinsOverview` SELECT** — it is not
  in `BinsOverviewRow` today.

### Capabilities

```ts
{ rowTriageFlags: false, multiSelect: true, inCellEdit: false, fieldsMenu: true, dayBands: false }
```

- **`multiSelect: true`** — real bulk exists and is wired today (`BinsBulkActionBar`: Export CSV
  over a 14-column projection, plus queue-for-print). Port `exportCsv` **verbatim**; drop the
  "Mark for cycle count" toast stub, which is a dead button in a live bar.
- **`inCellEdit: false`** — the grid read is `sku_stock.view` but every editable location fact
  goes through `PATCH /api/locations/[barcode]/properties` gated `sku_stock.manage`, so an
  in-cell caret would render for viewers who get a 403. And the frozen identity track *is the
  location code* — a typo there re-keys a printed sticker, the exact destructive-typo case the
  identity-pane rule exists to prevent.

### I.2.4 Risks — two are live defects, not migration hazards

- **🔴 `/api/locations` GET and POST are not behind `withAuth`.** `route.ts:24` is a plain
  `export async function GET(req)` with a hand-rolled `resolveCtx()`; with no session `orgId`
  stays `undefined` and **every downstream query drops its `AND organization_id = $n`**
  ("Anonymous callers get the legacy un-scoped behavior", lines 29-30).
  `docs/security/route-permissions.json:3058` records the gate as `withAuth (no permission)` —
  **more generous than the code**. The rail's room list reads this route. Gate it in the same
  pass; do not widen its use first.
- **🔴 `BinsOverviewRow.zone_letter` is structurally always NULL.** `getBinsOverview` requires
  `row_label IS NOT NULL AND col_label IS NOT NULL` (bin rows only) then selects
  `l.zone_letter` — but the letter lives on the **parent room row**, and
  `registerPrintedLocations` never writes it on a bin. The `[A]` chip at `BinsTable.tsx:146`
  and `BinDetailFlyout.tsx:106` **never render today**. A `zone` column reading
  `row.zone_letter` would be a silently empty track — resolve room→letter from
  `useLocations().rooms` instead (the same `zoneMap` `useBinLabelPrinter` already builds).
- **Navigation bug:** `useBinsFilterParams.onParamChange` does `router.replace('/inventory?…')`
  (`BinsFilterBar.tsx:123`). On `/warehouse?tab=bins`, clicking any status chip navigates the
  operator **off the page**. Any port reusing this hook inherits it.
- **`useLabelPrinterStore` is a localStorage + window-CustomEvent module global**
  (`binPrinter.state.v4`) **shared with the rack printer**. Nothing resets on selection change,
  so arrowing the grid would carry the previous location's aisle/bay/level/position into the
  next row's form. Add an explicit reseed keyed on the selected row id — this is the
  motion-crossfade precondition, and it is not met today.
- **`useBinLabelPrinter` installs a capture-phase window `keydown` for ⌘P/Ctrl+P** that
  `preventDefault`s. Today it only mounts on the labels tab; hoisting the controller into an
  always-mounted rail makes it **swallow the browser's Print on the whole page**. Scope it to
  the rail being open.
- **`BinDetailFlyout` has three live mounts outside the labels tab** (`WarehouseShell.tsx:98`,
  `:163`, `RackDetailView.tsx:231`). Extract `LocationInspectorBody`; do not delete.
- **Drizzle gap:** `locations` is in the tenant-isolation cohort and every query threads
  `organization_id`, but the `pgTable` model (`schema.ts:2908`) has **no `organizationId`
  column** — type-level code is blind to the tenant key.

---

## I.3 Product labels — `/products?view=labels`

**Estimate: L.** This is the only one of the five whose grid needs a fact that **does not
exist yet**.

### Judgement call — reuse the catalog column model? **Reuse the shared tracks by import; author a separate array and descriptor.**

*For full reuse:* both surfaces enumerate the same collection (org `sku_catalog` rows) with the
same identity anchor, the same SKU semantics, the same `inventory` align exception, and the
same comparator. Two arrays means the day someone widens `title` from `minmax(14rem,1fr)`, two
files disagree.

*Against:* **`tier` is a property of the column object, not of the descriptor.** Catalog's
default set is `select · title · sku · inventory · status`; Labels' whole reason to exist is
`lastPrinted` / `prints`. One array carries exactly one `tier` per key — so a shared model
forces the labels grid to open **without its differentiating facts**, behind a Fields menu the
operator must know to open. The reverse is worse: `manuals`/`qc`/`orders` are MDM drill-downs
that would appear in Labels' Fields menu as tracks it never asked for. **A single array cannot
be lean for both.**

**Decided:** `src/lib/products/product-labels-grid-layout.ts` builds `select`, `title`, `sku`,
`inventory`, `channels`, `status` by *finding them in* `CATALOG_GRID_COLUMNS` and spreading —
overriding only `tier`. It authors `upc`, `lastPrinted`, `prints` outright and drops
`manuals`/`qc`/`orders`. Two descriptors, two `tableId`s, **one declaration of every geometry
decision the two surfaces genuinely share.**

Two corollaries an implementer must not skip:

1. **This only works if the labels grid moves off `/api/sku-catalog/search?searchField=zoho_catalog`
   onto `/api/sku-catalog`.** `SkuCatalogItem` has no `provider_item_id`, no
   `is_inventory_linked`, no counts — with today's endpoint zero tracks are shareable and the
   question is moot.
2. **The tempting third option — making `tier` descriptor-resolved so ONE array serves both —
   is a public API change to `makeGridSurfaceDescriptor` / `useGridColumnVisibility`, which 11
   grid families consume.** That is **Ask-first** under `pattern-evolution.md`, not something
   this surface does on its way past.

### The new server work

`lastPrinted` / `prints` require a new LATERAL over `station_activity_logs` keyed on
`metadata->>'sku_catalog_id'` inside `getSkuCatalogList` (a 1977-line module), plus projecting
`upc`. **Decide whether the aggregate is org-wide or staff-scoped** — the existing rail route
defaults to staff-scoped. Without this column pair the labels grid is a visual clone of
`?view=catalog` and the surface is unjustified.

### Capabilities

```ts
{ rowTriageFlags: false, multiSelect: true, inCellEdit: false, fieldsMenu: true, dayBands: false }
```

`multiSelect: true` — print N labels is the surface's actual bulk job and a genuine per-row
single write. This is the **opposite** call from Ready/Pickup/Warranty, and the guard's "read
maps stay browse-only" test names those three specifically. A labels grid is not a read map.
`inCellEdit: false` — nothing on the row is a fact this surface owns; condition and color are
**print-time** choices belonging to the rail draft, with no column to write back to.

### I.3.4 Risks

- **🔴 Row membership changes if the endpoint changes.** Today's picker lists the Zoho `items`
  mirror; the catalog list endpoint lists `sku_catalog` rows. `source-of-truth.md` is explicit
  that these are **independent SKU numbering schemes that must never be joined on the SKU
  string**. Switching adds SKUs the operator has never printed from and drops Zoho items with
  no catalog row — **with no error to signal it.**
- **🔴 Stale-draft write on row→row.** A rail with no re-seed shows SKU B's form holding SKU A's
  `serialNumbers`/`condition`/`notes`, and `issueLabels()` **posts them**. This is the one
  failure mode here that corrupts data rather than pixels.
- **The `sku:fill` window bridge.** `useMultiSkuBarcode.ts:246-253` listens on `window`;
  `ProductCatalogList`'s `onPick` is the only dispatcher. Delete the list without the listener
  and the rail never prefills — no error, no warning, the SKU field just stays empty.
- **Mobile carve-out.** `UniversalScan.tsx:46` calls `useLabelPrintFeed(12)` — its own comment
  says it is "the same feed as Products → Labels → History". Renaming the `['labels.recent']`
  key, the `labels-print-feed` event, or the response shape silently stops the phone's
  Recent-Scans strip from refreshing after a desktop print.
- **`?mode=` collision.** `useBarcodeMode` writes a bare `?mode=` onto `/products` and it is
  **undeclared** in `PRODUCTS_ROUTE_PARAMS.owns`. It escapes `param-ownership.guard.test.ts`
  today only because its reads live outside the guard's `OWNED_TREES`. Moving the print form
  under a governed tree fails that guard. Worse: if `mode` lands in the saved-view `paramKeys`,
  a shared "saved view" carries someone's issue path into a colleague's session.
- **Live E2E contract:** `tests/e2e/unit-photo-scan.spec.ts:195` navigates to
  `?view=labels&labelsView=recent&historyId=<id>`. Renaming `labelsView` values breaks it.
- **Monitor token on an ops body:** `LabelsProductsWorkspace.tsx:17` wraps both panes in
  `MONITOR_SECTION_CARD_SCROLL_CLASS` — a rollup-density shell on a Workbench surface. Do not
  carry it forward; the ops SoT is `TABLE_SURFACE_*`.

---

## I.4 Products manuals — `/products` (default view)

**Estimate: M** — and what dominates is **not** the grid (the column model is simpler than
Ready's and the API needs zero new endpoints).

### Judgement call — compose `DocumentSlideOver`, or make it the occupant? **Neither wholesale — extract the body, keep the wrapper.**

*Compose it inside:* three consumers change by zero lines. **But it does not work, for a
mechanical reason.** `DocumentSlideOver`'s body is `RightPaneOverlay`, which `createPortal`s to
`document.body` with its own `position: fixed` frame at `zLayer.panelPopover + 1`, its own
backdrop, its own `useEscapeClose`, its own `useBodyScrollLock`, and its own
`useHorizontalEdgeResize` with its own localStorage key. Nested inside `RightRailHost`'s aside
it **portals straight back out** — two right-edge cards, two resize grips, two Escape owners
fighting one keypress. Making it render in-flow means passing `backdrop={false}
lockScroll={false} closeOnEscape={false} resizable={false}`, at which point you have composed a
352-line overlay shell in order to disable all of it.

*Make it the occupant:* geometry collapses to one owner, and `RightRailHost` already enforces
one-right-edge-occupant by construction. **But** Testing's `ManualsSection` and Labels'
`LabelsOrderWorkspace` both mount it from **inside a Station Workbench** with `anchor='pane'`,
pinning it over the right content column. Forcing them through the host would move them to the
app-wide right edge and enrol them in the exclusion set — so previewing a manual at the Testing
bench would **evict the operator's open inspector**. They would also lose their per-call-site
widths, since `DETAIL_STACK_RESIZE.storageKey` is single and global.

**Decided:** lift `DocumentSlideOver.tsx`'s header-actions block + type strip +
`DocumentPreviewFrame` (lines 110-208) into a geometry-free **`DocumentViewerBody`**.
`DocumentSlideOver` becomes a ~60-line `RightPaneOverlay` wrapper around it and keeps its exact
props, so `OrderDocumentsSection`, `LabelsOrderWorkspace` and `ManualsSection` change by **zero
lines** and Testing keeps its pane-anchored overlay. The manuals rail registers `detail:manual`
whose node is `DocumentViewerBody` plus the extracted `EditManualModal` fields. One resize
implementation per surface, one right-edge occupant, no forced migration.

This is the sibling-that-composes-the-primitive move from `pattern-evolution.md`, not a fork:
**the shared unit was always the body; the slide-over was one packaging of it.**

> Two corrections to carry into the extraction: `appendCacheBust` (currently in
> `ManualLibrary.tsx`) belongs on `DocumentPreviewFrame` — it is a real iframe-cache fix the DS
> frame lacks. And the `source-of-truth.md` row credits `DocumentSlideOver` with
> `useHorizontalEdgeResize`, which is wrong — the chain is
> `DocumentSlideOver → RightPaneOverlay → useHorizontalEdgeResize`. Correct that row when the
> body lands.

### The folder tree is derived, not stored

`buildTree` (`manuals-tree.ts:46`) takes flat rows and splits
`folder_path?.trim() || '(no folder)'` on `/`. **There is no folders table, no folder rows, no
hardcoded taxonomy, and no server endpoint returning a tree.** `product_manuals.folder_path` is
a plain nullable TEXT column with no CHECK and no index; renaming a folder is a string rewrite
across matching rows; `'(no folder)'` is a synthetic display bucket existing only in JS.

So `folder` becomes a **`type: 'text'`, START-aligned** column reading `folder_path` directly,
plus a `?folder=` prefix filter — and the tree, the breadcrumb, and both fuzzy matchers become
deletable. **Note it is `text`, not `location`:** the `location` ColumnType means a geo/tracking
destination and END-aligns; a folder path is a prose taxonomy label.

### Capabilities

```ts
{ rowTriageFlags: false, multiSelect: true, inCellEdit: true, fieldsMenu: true, dayBands: false }
```

- **`multiSelect: true` is not aspiration — it already exists.** `useManualSelection.ts` holds
  a `Set<number>` and `/api/product-manuals/bulk` accepts move | update | delete for up to 1000
  ids with a 10s undo toast. Today it is entered through a hover-pencil on a card in a 320px
  sidebar, which is a worse spelling of the same plane. Wiring it to
  `ContextualSelectionBar` is a straight port.
- **`inCellEdit: true`, but narrowly** — `type` and `status` are closed enumerations the bulk
  endpoint already writes per-id, and `folder` is a single PATCHable string. `product`, `sku`,
  `item` stay record-plane only (they are pairing identity, and the record plane must remain a
  complete superset because in-cell is gated `gridSkin && !isMobile`).
- **`dayBands: false`** — a manual library is a filing cabinet, not a stream. Banding a
  1000-row library by upload day fragments the one thing an operator scans for.

### I.4.4 Risks

- **🔴 `?id=` is being stripped on `/products` today.** `src/app/products/layout.tsx` mounts
  `SurfaceParamHygiene`; `parseRouteParams` (`route-params.ts:253`) rebuilds a fresh
  `URLSearchParams` from `declaredKeys(spec)` **only**, and `id` is in neither
  `PRODUCTS_ROUTE_PARAMS.owns` nor `WORKBENCH_CARRIES`. So `handleSelectFile` writes `?id=123`,
  the hygiene effect fires, and the param is removed. **Manual selection on `/products` is very
  likely broken right now** — it still works on `/manuals/library`, which mounts no hygiene.
  (Code path is unambiguous; not runtime-verified, since recon was read-only.) **Declare `id`
  first, as its own one-line change** — if you migrate first and selection still fails, this is
  why.
- **The list endpoint is ungated.** `/api/product-manuals/search` is recorded with permission
  `null` / `getCurrentUser (ad-hoc)`, while its sibling `GET /api/product-manuals` requires
  `sku_stock.view`. Any staffer with a session reads the whole library. **Do not quietly add
  `withAuth` while migrating** — route-auth drift is a `verify` gate, and a permission change on
  a route the Testing bench also reads can 403 a floor operator. Flag it; decide it separately.
- **`product_manuals` has no `organization_id`.** Isolation is derived from `sku_catalog` via
  `sku_catalog_id` + the GUC — and most manuals are **unpaired** (`sku_catalog_id IS NULL`). A
  `WHERE sc.organization_id = $1` on the list would **empty the library**.
- **The data floor is moving.** `2026-07-31_document_entity_links_sku_serial_manual.sql` states
  verbatim that `product_manuals` remains the library write SoT *this phase* and full write
  cutover to `documents` is **Phase 3b**. Confirm the phase order before committing a column
  model, or this is two migrations.
- **The forks multiply if you do nothing.** `statusBadgeClass`/`typeBadgeClass` exist verbatim
  in **three** places; `buildTree` in **four**. Promote one tone registry and delete the rest in
  the same change, or the migration ships the fork it was meant to close.
- **Losing the tree loses a real affordance.** Drag-a-file-onto-a-folder is today's fast move
  gesture and it carries the whole selection when the dragged row is checked. The multi-select
  Move action + `FolderPathPicker` is the replacement and **must land in the same change**.
- **Bundle altitude:** `ManualLibrary` is a **static** import in `ProductsWorkspace.tsx:5` while
  every sibling view is `next/dynamic`. A `LedgerGridSurface` + descriptor + TanStack graph will
  land in the shared `/products` chunk unless the new middle pane is lazied.
- **`/manuals/library` is a bookmark-only 542-line duplicate** — `manuals-library-shared.ts` is a
  verbatim second copy of `buildTree`/`getNodeAtPath`/the badge helpers, with `fuzzyMatch`
  instead of `smartMatch`, plus a second `ManualRow` and a third icon set. Retiring it is a
  **route deletion (ask-first)** and drags `SidebarContextPanel` + four lines of
  `sidebar-navigation.ts` with it.

---

## I.5 Products pairing — `/products?view=pairing`

**Estimate: L**, dominated by the `ProductHubPanel` extraction under a live Station consumer.

### Judgement call — is a pairing row one SKU, or one unmatched platform id? **One canonical SKU.**

*For the identifier grain:* the unmatched identifier is where the money actually leaks —
`search-unmatched`'s `orderCount` counts orders with `sku_catalog_id IS NULL`, real revenue that
cannot resolve to a product. Those rows are **structurally invisible** to the SKU-grain query,
which joins `d.sku_catalog_id = sc.id` and can only ever show products that already exist. A
SKU-grain grid is a queue of things that are *almost* right; the identifier grain is the queue
of things that are *wrong*.

*For the SKU grain:* the write is per-SKU-atomic and nothing else. `batchPair` opens with
`SELECT id, sku FROM sku_catalog WHERE id=$1 FOR UPDATE` and commits the entire
accept/reject/unpair set under that one lock; `useProductHub` pre-seeds every candidate at
confidence ≥ 80 as an accept, so the operator's default action is one click resolving N
candidates. At the identifier grain that atomic transaction fragments into N rows and N
requests — and the operator re-answers "is this the right product" once per *candidate* instead
of once per *product*.

**Decided: one row = one canonical `sku_catalog` row**, keyed on `skuCatalogId`. **The grain of
a collection surface should match the grain of its write**, and every alternative pays for a
nicer-looking row by fragmenting an atomic commit.

**The unmatched identifiers get a LANE, not a grain.** They are a genuinely different collection
(no canonical row to key on, a different id space, a different verb — "create or attach" rather
than "confirm"), so they belong as a second tab on the same shell: a `?lane=unmatched` value
with its own column model over `UnmappedPlatformId`. That needs one new endpoint, because
`search-unmatched` returns nothing without a `q` and has no browse mode at all. **Follow-on
work — do not let it decide the grain of the primary lane.**

### Proposed columns

Frozen `select · sku · title` — `sku` is frozen because **this** is the pairing operator's scan
anchor (they arrive by pasting an identifier), the same argument that put `order` in the Orders
frozen pane. `imageUrl` rides as a ~20px thumb **inside** `title`, not as its own track.

Core: `platforms` (chips, `sortable:false`) · `suggestions` · `confidence` (reuse the existing
`ConfidenceDot` thresholds ≥80 emerald / ≥60 amber **verbatim** — they are the same ≥80 that
`seedPending` uses to pre-accept) · `orders`.
Optional: `confirmed` · `matchedVia` · `status` — the last two are **NULL on every non-search
row**, which is what makes optional the honest tier.

### Capabilities

```ts
{ rowTriageFlags: false, multiSelect: false, inCellEdit: false, fieldsMenu: true, dayBands: false }
```

`multiSelect: false` — `batchPair` takes **one** `skuCatalogId`. "Clear the backlog for 30 SKUs"
would be 30 POSTs, i.e. the batch-edit-panel anti-pattern, not a single-write bulk mutation.
`inCellEdit: false` — every mutation is a decision about a **child** row and the pending set is
transactional; a cell popover cannot express "stage 4 accepts and 3 rejects, then commit
atomically". That is the record plane by definition, which is the whole reason the rail exists.

### I.5.4 Risks

- **🔴 `sku_platform_ids` tenant-blind unique — the pairing write path goes straight through it.**
  `runBatchPair`'s inline-create arm (`pairing-queries.ts:466-507`) does
  `INSERT … ON CONFLICT DO NOTHING RETURNING *` **with no conflict target**, so it swallows a
  violation against *any* unique index — including the two legacy tenant-blind ones from
  `2026-04-07_create_sku_catalog_hub.sql:52,57`. When the colliding row belongs to **another
  org**, the INSERT returns zero rows, the fallback claim UPDATE carries
  `AND organization_id = $10` so it matches nothing, and the loop `continue`s. **The pairing is
  silently dropped, no audit row, and the route still returns 200 `{success:true}`. The operator
  sees a green Save and no pairing.** The `platform_sku` index also encodes a false business rule
  (one SKU per platform+account) — the same one that previously broke the Sheets import.
  → Schedule as **its own change** with expand/contract ordering verified. Do not fold a
  data-integrity fix into a display migration.
- **🔴 Migration ordering hazard on the fix itself.** `run-pending-migrations.mjs` sorts by
  filename, and `…_tenant_contract.sql` sorts **before** `…_tenant_expand.sql`. On any DB where
  neither has been applied, the DROP of both global uniques runs before the org-led index is
  created — a window with **no unique index on listing identity**.
- **`?sort=` is already spent** on `PAIRING_SORTS` (volume/confidence/count/title). Use
  `?colsort=`/`?coldir=` (already carried — no spec edit). Then keep **exactly one sort answer**:
  either retire the rank slider and derive those three from column sorts, or keep the slider and
  make those headers non-sortable. Shipping both is the two-sort-params bug.
- **The `sku-pairing-updated` window CustomEvent is the only freshness bus** (dispatched by
  `useProductHub.ts:192` and `sku-pair-api.ts:26`). Move the grid to react-query without wiring
  it and a committed pairing leaves a stale row with no error.
- **`ProductHubPanel` has a live Testing consumer** — mounted inside a fixed `h-[28rem]`
  `WorkspaceCard` with `allowManualPair`. Split into `ProductHubBody` + keep `ProductHubPanel` as
  the station-facing composition so `TestingPanel` is byte-for-byte unaffected.
- **`ListingResizePanel` (231L, single-consumer) needs an explicit decision**: drop the preview
  and delete the file, or move it under the grid as a bottom split. **Do not cram a 231-line
  resizable iframe into a 420px rail.**
- Genuinely dead and safe to delete: **`SkuPairingModal.tsx`** (83L, zero `<SkuPairingModal` hits;
  also a private `createPortal` + `fixed inset-0 z-modal` panel the SoT forbids) and
  **`/api/sku-catalog/pairing-queue/count/route.ts`** (48L orphan — remember to drop its
  `route-permissions.json` entry).

---

## J. Cross-cutting findings — read this even if you only do one surface

### J.1 Four of the five surfaces have **zero** regression coverage

Agents grepped `tests/` and every `*.test.ts`: nothing covers manuals, pairing, warehouse
labels, or product labels behaviour. Support has none either. The only live E2E contract that
touches any of them is `unit-photo-scan.spec.ts:195` on the labels `historyId` deep link.

**This is a coverage gap, not a green light.** Every phase should land a `qa-desktop` spec
asserting on `QA_FIXTURE_*` constants — row visible → row click opens the non-modal rail → Add
opens the same rail in create mode → a saved view applies to the URL. Budget it in; do not
discover it at the end.

### J.2 The saved-views left column fails **silently**

`useSavedViews` resolves the surface via `surfaceFromStorageKey` and, on `null`, sets views to
`[]` and makes `saveView`/`removeView` no-ops — **no console error**. Meanwhile
`/api/saved-views` validates with `isGenericSavedViewSurface` *before* insert, so a missing
`SAVED_VIEW_SURFACES` entry is a **400 on the operator's first save**, not a DB error.

Two independent surfaces flagged this as "the most likely way the left column ships broken and
nobody notices." §B.1's loud-`null` change is the fix, and it should land **before** any
surface consumes it.

### J.3 The capabilities guard goes red the moment your file exists

`grid-surface-capabilities.guard.test.ts` walks disk for
`/<LedgerGrid(?:Surface)?[<\s/>]/` and fails any mount not in `MOUNTS`. **The build breaks when
`LocationsGridView.tsx` is created, before it is registered.** Register the mount and the
`DECLARED_CAPABILITIES` entry in the same commit that creates the view — not as cleanup.

### J.4 Every surface needs a `TableId` + `TABLE_COLUMNS` entry

`src/lib/tables/table-columns.ts` is an exhaustive `Record<TableId, TableColumnSpec[]>`, so
`fieldsMenu: true` (which all five want) requires a new union member **and** a record entry.
Missing it is a type error, not a silent failure — but it is five easy-to-forget edits.

### J.5 Two surfaces need a per-record **re-seed**, and one corrupts data without it

Product labels (`useMultiSkuBarcode`) and warehouse locations (`useLabelPrinterStore`) both hold
draft form state that does not reset on selection change. For labels this is not cosmetic:
`issueLabels()` would post SKU A's serial numbers under SKU B. §D.1's per-entity occupant ids
mitigate it by forcing a remount, but **the controllers should reseed explicitly** rather than
relying on a motion decision to protect data.

### J.6 Shrink-only ratchets must be **lowered**, not left

Deleting `FileButton`/`FolderButton`/`LibraryChrome`/`ManualsLibrarySidebar`/`BinsTable` removes
a pile of hand-rolled shells, `ds-raw-button` escapes and indigo hardcodes. That **lowers** the
counts in `surface-box-tokens`, `spacing-tokens`, `typography-tokens`, `focus-ring-tokens` and
`control-size-tokens` guards — and those guards fail on being *too green* as well as too red.
Lower the baselines in the same commit. Per `verify.md`: baselines only shrink, never rise.

### J.7 Estimate roll-up

| Phase | Surface | Size | What dominates |
|---|---|---|---|
| 1 | Support tickets | **L** | the remote-list (paginated Zendesk) problem; two columns with no data |
| 2 | Warehouse locations | **M** | collapsing the 6-component wizard into one rail form |
| 3 | Product labels | **L** | new server aggregate + endpoint swap changes row membership |
| 4 | Products manuals | **M** | `DocumentViewerBody` extraction under three live consumers |
| 5 | Products pairing | **L** | `ProductHubPanel` extraction under a live Testing consumer |

Two **M** and three **L**, on top of Phase 0 + Phase 0.5. Plan it as a multi-week programme
with one surface per PR — not a sitting.

---

## K. Should cleanup be its own session, separate from the port?

**Partly yes — but split by _dependency_, not by _activity_.** "Delete all the dead and
non-conforming code first, then port" does not survive contact with the recon, for one blunt
reason:

> **For four of the five surfaces, the non-conforming code _is_ the live feature.** You cannot
> delete `BinsTable` before `LocationsGridView` exists — the page would render nothing.

That is not a guess. Of ~40 deletion candidates the agents examined, the large majority came
back **`reduce-to-atoms`, not `delete`**, and almost always because of a live consumer *outside*
the surface being migrated:

| Component | Why it cannot be deleted ahead of the port |
|---|---|
| `ProductHubPanel` | live Testing-station consumer (`h-[28rem]` WorkspaceCard, `allowManualPair`) |
| `BinDetailFlyout` | **three** live mounts outside the labels tab (bins, map, `RackDetailView`) |
| `DocumentSlideOver` | three consumers, two inside a Station Workbench with `anchor='pane'` |
| `SupportTicketComposerDock` | `TestingPanel` still mounts it |
| `ManualLibrary` | `/manuals/library` still mounts it |
| `LabelRoomSidebar`, `useLabelPrinterStore` | shared with the **rack** printer |
| `AddOrPairSkuModal` | the only path that creates a `sku_catalog` row |

Deletion is the **last step of each port**, not a phase that precedes all of them.

### K.1 What genuinely *is* independent — and it is worth its own session

There is a real, shippable, port-independent slice. It is just not "all the cleanup":

**1. Verified-dead deletions.** Small, but real:

| Target | Lines | Verified |
|---|---|---|
| `src/components/products/pairing/SkuPairingModal.tsx` | 83 | ✅ zero code call sites — the only hit is a *comment* in `dialog-shell.guard.test.ts:33` |
| `src/app/api/sku-catalog/pairing-queue/count/route.ts` | 48 | ✅ orphan — only self-references |

> ⚠️ Two other "dead" claims did **not** survive a spot-check, which is itself the argument for
> verifying each one rather than batch-trusting a list:
> `MultiSkuBarcodeWizard` is still imported and rendered by a live ternary in
> `MultiSkuSnBarcode.tsx:24` (the claim was *unreachability*, not zero references — a
> weaker and harder claim); and `useLabelRecents` has live consumers in
> `useMultiSkuBarcode.ts:12,82` (the claim was *write-only*, which is not the same as dead).
> Both need a reachability argument before deletion, not a grep.

**2. Fork consolidation** — behavior-preserving, and it shrinks every later port:

- `statusBadgeClass` / `typeBadgeClass` exist verbatim in **three** places (`manuals-tree.ts:29-45`,
  `ManualLibrary.tsx:56-70`, `manuals-library-shared.ts:31-45`) → promote **one** tone registry
  beside `condition-tone.ts`.
- `buildTree` exists in **four** places.
- `STATUS_DOT` exists twice (`SupportTicketRow.tsx:9`, `SupportTicketsRecentRail.tsx:22`) →
  promote into `zendesk/badges.ts`.

Do this **before** the ports, or each port copies a fourth/fifth version forward.

**3. The three live defects — each as its own change, none inside a UI migration:**

- `/api/locations` GET+POST not behind `withAuth` (anonymous ⇒ **un-scoped** queries), with
  `route-permissions.json` recording a gate more generous than the code.
- `sku_platform_ids` tenant-blind unique swallowing cross-org pairing writes and returning
  `200 {success:true}` — **plus** the migration filename-ordering hazard where `contract`
  sorts before `expand`.
- `?id=` stripped on `/products` by `SurfaceParamHygiene` because it is undeclared — a one-line
  fix that probably restores manual selection today.

**4. Phase 0 (SoT docs) + Phase 0.5 (the saved-views waist).** Already the blocking prerequisite
in §B/§G.

### K.2 The sequencing that actually works

```
Session 1 — FOUNDATION (independent, ships alone, shrinks everything after)
  · Phase 0    SoT docs
  · Phase 0.5  saved-views waist (§B) + shared SavedViewsList (§E)
  · verified-dead deletions (2 files)
  · fork consolidation (badges, buildTree, STATUS_DOT)
  · the 3 live defects, one change each

Sessions 2–6 — ONE PER SURFACE, each self-contained:
  build grid → build rail → cut the page over → THEN delete that surface's twins
                                                 → lower the ratchet baselines
                                                 → land its qa-desktop spec
```

Each surface session ends with its own deletion, because that is the only point at which the
deletion is safe. That also means each PR is independently revertable, which matters on a
migration this wide.

### K.3 One caution about running them concurrently

**Do not run cleanup and a port at the same time in the same checkout.** They touch the same
files, so they conflict exactly as much as two ports would — and this lane has already lost a
completed Phase 0 to a same-checkout collision today (§H). If sessions genuinely run in
parallel, put each in its own worktree lane per `workflow-safety.md`, and accept that
**Session 1 must land before any surface session starts**, since every surface consumes the
waist it builds.

**Bottom line:** yes to a foundation-first session — but its job is *the waist, the forks, and
the defects*, not "delete the old UI." The old UI leaves one surface at a time, on the day its
replacement renders.
