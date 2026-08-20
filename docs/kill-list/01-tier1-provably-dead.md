# Tier 1 — provably dead (72 files)

Zero importers. Removing code with no callers cannot change behavior; `tsc` + `npm run verify`
prove it in minutes. **Still grep each one before deleting** — knip misses dynamic imports and
string-keyed registries.

## 1A — `/design-demo/*` ✅ EXECUTED 2026-08-20

Deleted on an operator ruling. **Note for the record: this tree was deleted once in Wave 1 and
re-created as the component-adoption showroom**; `DEAD_CODE_CLEANUP_PLAN.md` and
`dead-code-triage.md` both carried an explicit "NOT dead — do not delete" correction. Both were
updated rather than left to lie (`pattern-evolution.md` law 6).

**Removed (9 files):**

```
src/app/design-demo/page.tsx
src/app/design-demo/layout.tsx
src/app/design-demo/card-fan/page.tsx
src/app/design-demo/displays-flush/page.tsx
src/app/design-demo/id-chips/page.tsx
src/app/design-demo/photo-peek/page.tsx
src/app/design-demo/substitution/page.tsx
src/app/design-demo/substitution-live/page.tsx
tests/e2e/design-demo-showcase.spec.ts        (its only subject was the showroom)
tests/measure.mjs                             (measured /design-demo/id-chips exclusively)
```

**Wiring removed:** the `/^\/design-demo(?:$|\/)/ ` public-path entry in `src/proxy.ts` **and**
`src/contexts/AuthContext.tsx` (the two must stay in sync); `tests/shot.mjs` default route
repointed to `/unbox`; stale prose references reworded in `SidebarShell.tsx`, `PhotoPeekFan.tsx`,
`sku-testing-types.ts`, `TextField.tsx`, `operations-overhaul.spec.ts`.

**Uncommitted work preserved:** another session had 13 uncommitted lines in
`displays-flush/page.tsx` (a `TabDisplay` → `SearchableSelectField` experiment). Uncommitted
changes are not in git history, so the diff was saved as a patch before deletion rather than
destroyed. Ask the session owner before discarding it.

### ⚠️ Coverage gap opened by this deletion

`PhotoPeekFan` — **live** (`packer/UnitPackPhotoPeek`, `line-edit/PhotoPeekFan`) — used
`/design-demo/photo-peek` as its fixture-free Playwright harness. Part B of
`tests/e2e/photos-library-ticket-peek.spec.ts` was removed with the route. The hover → fan →
expand → lightbox interaction is now **uncovered**. It needs a replacement spec driven from a
real carton (QA org, `--project=qa-desktop`), or a new harness.

### The "orphan cascade" was WRONG — no orphans exist

The pre-deletion audit listed 4 components as design-demo-only. **All four are live.** A
path-prefix grep (`components/fulfillment/SubstitutePanel`) does not match a relative import
(`'./SubstitutePanel'`), and it never matches a dynamic one:

| Component | Actually kept by |
|---|---|
| `fulfillment/OrderAmendmentsSection.tsx` | `SubstituteUnitCard.tsx:7` |
| `fulfillment/SubstitutePanel.tsx` | `SubstituteUnitCard.tsx:6` |
| `fulfillment/SubstituteReasonPicker.tsx` | `SubstitutePanel.tsx:9` |
| `line-edit/PhotosDisplayHost.tsx` | `line-edit/terminal/unbox-tabs.tsx:56` — **dynamic import, inside the Unbox SoT** |

`SubstituteUnitCard` is reached from `tech/TechSubstituteSection`, so the whole `fulfillment/`
chain stays. **Method correction for every later wave: grep the bare symbol with `-w`, never a
path prefix, and check for `import(` before believing any orphan claim.**

## 1B — knip zero-importer files (65)

Full machine-readable list: [`tier1-unused-files.txt`](tier1-unused-files.txt).
Grouped by owner so waves stay reviewable:

| Group | Files | Note |
|---|---|---|
| `src/components/receiving/unfound/**` | 12 | The whole Unfound triage details-panel family — queue table, 4 tabs, helpers. `/receiving/unfound` route still exists; **confirm the route mounts something else before deleting.** |
| `src/components/shipped/dashboard-table/**` | 7 | 6 hooks + empty state. Superseded by the ToShip desk. |
| `src/features/my-day/**` | 5 | Watch rail, onboarding panel, due-horizon chips. |
| `src/components/packer/**` + `PackerTable.tsx` + `usePackWorkspaceTab` + `usePackerTableController` | 6 | Pre-grid packer surface. |
| `src/components/repair/**` + `useRepairDisplaySort` + `repair-scopes` | 5 | Repair chrome/header/rail. |
| `src/components/tracking-exceptions/**` | 3 | Dialog + types + hook; `/tracking-exceptions` route exists — verify. |
| `src/components/station/**` (`StationHistoryTable`, `StationQueueRow`) + `station-scopes` + `station-table-queries` + 2 station hooks | 6 | Pre-`ReceivingGridHost` station tables. |
| `src/components/inventory/InventoryInspectorRail.tsx` + `useInventoryOpenParam` | 2 | **A dead right-rail twin.** Exactly the fork [`03`](03-frame-twins.md) is about. |
| Singles | 19 | `useEntitlements`, `useShippedSearch`, `useUnitsOverview`, `feature-flags-lifecycle`, `GettingStartedChecklist`, `SubscribeToggle`, `ListingPhotoGallery`, `ContextualEmptyState`, `QueueTableBanner`, `CsvImportStagingRail`, `CatalogBulkActionBar`, `PickupChromeActions`, `UnboxStationEmptyShell`, `RepairRailShell`, `CatalogLinkFormRail`, `ListingApprovalSection`, `local-pickup/create-order`, `monitors/resolve-value-deps`, `photos/queries/receiving-photo-row`, `po-triage/types`, `catalog-scopes` |

### Traps in this list (from the handoff's §3 trap list)

- **`src/lib/feature-flags-lifecycle.ts` — DO NOT DELETE.** `backend-patterns.md` makes it a
  required registry (`FLAG_LIFECYCLE`) that every flag must appear in. Knip reads it as unused
  because nothing *imports* it at runtime; its consumer is a **test/guard contract**. Fix the
  knip config, not the file.
- **`src/components/receiving/unbox/UnboxStationEmptyShell.tsx`** sits inside the SoT tree.
  Confirm the Unbox empty state is served elsewhere before removing.
- **`src/components/receiving/unfound/**` (12 files)** — `/receiving/unfound/page.tsx` and
  `/receiving/unfound/[kind]/[id]/page.tsx` both exist. If those routes render, knip is reading a
  barrel wrong. **Load the route in the browser before deleting anything here.**
