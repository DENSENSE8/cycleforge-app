# Deleted UI manifest — the cherry-pick index

**What this is.** The Warehouse OS refactor deleted the entire page-UI tree. This file is
the index for getting any single piece of it back. Every row carries a **restore command**
that is safe to paste.

Deleted in this lane: **`src/components/**` · `src/features/**` · `src/hooks/**`**
— **2,343 files, ~359,900 LOC**.

| Tree | Files | LOC |
|---|---:|---:|
| `src/components/**` | 2,048 | 327,208 |
| `src/hooks/**` | 196 | 20,749 |
| `src/features/**` | 99 | 11,971 |

Domain logic (`src/lib/**`, 261k LOC), the 969 API routes, migrations and the GS1 / label
resolvers were **not** touched. Nothing here deletes a capability — only its face.

## How to restore

```bash
git checkout main -- src/components/<path>
```

`main` is the restore source and is a **strict superset** of this worktree's base commit
(`ff8f9655` is an ancestor of `main`), so every path below resolves. Restoring a directory
also restores its tests. Counts and LOC in this file are measured **on `main`**, not on the
worktree, so they match what you will actually get back.

**Restoring one component is rarely enough.** Two things it will reach for:

- `@/design-system/**` — deleted by a sibling lane. Restore it the same way:
  `git checkout main -- src/design-system/<path>`.
- `@/hooks/*` — deleted here. Each group below names the hooks its components need.

## ⚠️ Three paths are NOT recoverable

These existed only as **untracked** files in the worktree — they were in no commit, on no
branch, in no ref. Deleting the tree removed them permanently. Git cannot bring them back.

| Path | Size | Status |
|---|---:|---|
| `src/components/workspace/` | 56 files, 8,825 LOC | **Gone.** In no git ref |
| `src/components/layout/HeaderSessionContext.tsx` | 1 file | **Gone.** In no git ref |
| `src/components/shipped/details-panel/PanelActionBar.ts` | 1 file | **Gone.** In no git ref |

If `src/components/workspace/` was in-flight work from a parallel session, it needs to be
recovered from that session's own transcript or editor history — not from this repo.
(`shipped-filter-constants.ts` and `shipped-filter-params.ts` also showed as untracked but
**do** exist on `main`; they restore normally with `src/components/shipping/`.)

---

## Restored during reconcile (2026-08-23) — 87 files · 8,602 LOC of `design-system`

The zero-base cut deleted `src/design-system` wholesale, same as everything else. Reconcile
found that `/signin` — a KEPT page, the only way into the app — needs a real dependency
closure from it, plus a handful of auth components and the `useStaffColorVersion` chain. That
closure was restored **file by file, checking each one's own imports as it went**, not by
restoring the tree wholesale (design-system is *not* self-contained — 60 of its files reach
into `@/components`, which is gone; each one either had a live consumer worth fixing or was
trimmed instead, see below).

**Restored** (87 files, 8,602 LOC — 29% of the original 29,675):
```
git checkout main -- \
  src/design-system/primitives src/design-system/tokens src/design-system/motion \
  src/design-system/foundations/motion-framer.ts src/design-system/foundations/motion-framer-hooks.ts \
  src/design-system/foundations/motion.ts src/design-system/components/Dialog.tsx \
  src/design-system/components/RouteLoading.tsx src/design-system/components/Skeletons.tsx \
  src/design-system/components/StaffBadge.tsx src/design-system/providers/UIModeProvider.tsx \
  src/design-system/hooks \
  src/components/Icons.tsx src/components/icons src/components/identity \
  src/utils/staff-colors.ts src/contexts/StaffColorsProvider.tsx src/hooks/useIdleReady.ts \
  src/hooks/_ui.ts \
  src/components/auth/ProviderSignInButton.tsx src/components/auth/SetPinPad.tsx \
  src/components/auth/SignInAuthStepPanels.tsx src/components/auth/StaffPickerList.tsx \
  src/components/auth/StaffPinPad.tsx src/components/auth/StaffSigningIn.tsx \
  src/components/auth/PinPadKey.tsx src/components/auth/PinPadStaffHeader.tsx \
  src/components/auth/theme-numpad.ts src/components/boot/BootSplash.tsx
```

**Deleted a second time, deliberately** — restored by the bulk `git checkout main --
src/design-system` first, then removed once nothing real needed them (each one only existed
to serve another dead file, or reached into deleted `@/components/**` chat/grid/admin UI with
no surviving consumer):
`AppTopBar.tsx` · `ConversationMessageCard.tsx` · `ConversationHeaderActionButton.tsx` ·
`OmnichannelComposerDock.tsx(+.test)` · `SlicedActionDock.tsx(+.test)` · `conversation-chrome.ts(+.test)` ·
`design-system/index.ts` (the root barrel — nothing outside `design-system` imports it once
`StaffAvatarEditor` is gone) · `components/identity/StaffAvatarEditor.tsx` (only consumer of
the root barrel; not used by the signin flow — `StaffAvatar` is, `Editor` isn't).

**Note for whoever mounts staff colors for real:** `StaffColorsProvider` is restored but
**not mounted** — `ShellProviders` deliberately carries only auth + react-query. Until it (or
a replacement) is mounted, `useStaffColorVersion()` returns an unpopulated cache and staff
avatars fall back to their default theme rather than a staff-chosen one. Compiles and renders
correctly either way; this is a visual gap, not a bug.

Also deleted, orphaned scaffolding from an earlier lane that assumed a component layout the
shell agent didn't build (nothing in `src/app`, `src/app/api`, or `src/shell` — the real,
load-bearing tree — imported any of it):
`src/lib/nav/launch-index.ts(+.test)` · `src/lib/canvas/{session,table}-tiles.ts` ·
`src/lib/canvas/table-tile-views.ts` · `src/lib/tools/descriptors.ts` ·
`src/lib/workspace/process-descriptor.ts` · `src/lib/workspace/panel-registry.tsx` ·
`src/contexts/{ActivityInboxContext,FbaWorkspaceContext}.tsx` ·
`src/lib/keyboard/nav-keys/KeyboardShortcutsCheatSheet.tsx` · `src/styles/tokens.ts` ·
two dead e2e specs (`unbox-procedure-deck.spec.ts`, `dashboard-inspector-non-modal.spec.ts`)
that drove pages (`/dashboard`, the receiving workspace deck) which no longer exist.

One real Rescue-phase miss, fixed here: `src/components/receiving/receiving-events.ts` — the
typed contract for the receiving cross-pane event bus, pure logic with no JSX — was left
behind in the UI tree and 11 `lib` files depended on `dispatchDashboardAndStationRefresh` in
`utils/events.ts`, which imports it. Moved to `src/lib/receiving/receiving-events.ts`; its two
UI-coupled event payloads (`NavState`/`WorkspaceState`, from the now-deleted receiving
workspace panel) were inlined as local types instead of chasing that import further.

`tsc --noEmit` and `eslint src` both exit 0 after this pass.

---

# Restore first — the highest-value pieces

If you rebuild nothing else, these are the ones the survey, the operator's own words, and
the measured weight all point at. Each is small, self-contained, and was a declared
source-of-truth in the old constitution.

| # | What | LOC | Restore |
|---|---|---:|---|
| 1 | **`CartonContextCard`** — the one carton identity header. Every scan station composed it; Unbox was the SoT, Arrival / Testing / Review were thin adapters. Editability was a prop, never a fork | 939 | `git checkout main -- src/components/station/entity-context` |
| 2 | **Grid engine (`LedgerGridSurface`)** — the virtualized spreadsheet surface under every Workbench table. **Lives in the design-system lane, not this one** | — | `git checkout main -- src/design-system/components/grid` |
| 3 | **`ThreadPanel`** — entity thread + composer, shared by helpdesk tickets and entity threads | 704 | `git checkout main -- src/components/threads src/hooks/useThread.ts` |
| 4 | **Composer family** — `OmnichannelComposerDock`, `ConversationMessageCard`, `conversation-chrome`. The chat/note composer shell and message face. **Design-system lane** | — | `git checkout main -- src/design-system/primitives` |
| 5 | **Photo gallery viewer** — `usePhotoGallery` + `PhotoViewerPortal` + `PhotoViewerModal` + `PhotoLauncher`. The one lightbox; every surface with photos routed through it | 2,980 | `git checkout main -- src/components/shipped/photo-gallery` |
| 6 | **Label + barcode builders** — bin/rack label printers, GS1 DataMatrix renderer, multi-SKU, `NumericStep`. Backs physical label production | 4,521 | `git checkout main -- src/components/barcode` |
| 7 | **Product label workspace** — label face preview, draft state, recent rail | 3,774 | `git checkout main -- src/components/labels` |
| 8 | **Table host + registry** — `NonlinearTableHost` (202) + `TABLE_DEFINITIONS` (57). The mount seam between a table definition and the grid engine | 2,332 | `git checkout main -- src/components/tables` |
| 9 | **Right-rail inspector** — `RightRailHost` (552), the one-`X`-one-closer push panel | 1,963 | `git checkout main -- src/components/right-rail src/hooks/usePanelStoreKeyboard.ts src/hooks/usePanelActions.tsx` |
| 10 | **Chip family** — `CopyChip` (1,228: order / PO / tracking chips), `ChipHoverMenuSurface` (231), `HoverTooltip` (318), `StackedRowIdentity` (107), `CompactActivityRow` (122) | — | `git checkout main -- src/components/ui/CopyChip.tsx src/components/ui/ChipHoverMenuSurface.tsx src/components/ui/HoverTooltip.tsx src/components/ui/StackedRowIdentity.tsx src/components/ui/CompactActivityRow.tsx` |

---

# By feature

Groups are sorted by weight. Within a group, **highest-value item first**.

## Receiving / Unbox — 354 files · 67,922 LOC

The largest surface in the app by a wide margin: PO receiving, carton intake, unboxing,
triage, OS&D exceptions, claims, and the line-edit workspace.

| Item | Files · LOC | Restore |
|---|---|---|
| **Carton identity header** (`CartonContextCard`) — see *Restore first* #1 | 13 · 2,416 | `git checkout main -- src/components/station/entity-context` |
| Line-edit workspace — the receiving line editor, its tools and panels. The single densest directory in the repo | 129 · 26,816 | `git checkout main -- src/components/receiving/workspace/line-edit` |
| Receiving workspace shell — the surrounding host, tabs, rails | 63 · 12,846 | `git checkout main -- src/components/receiving/workspace` |
| Claims — carrier / vendor claim composer and evidence | 31 · 4,161 | `git checkout main -- src/components/receiving/workspace/claim` |
| Carton inspector + photo triage | 6 · 3,173 | `git checkout main -- src/components/receiving/inspector` |
| Unboxing surface | 13 · 2,386 | `git checkout main -- src/components/receiving/unbox` |
| Unmatched items | 7 · 2,330 | `git checkout main -- src/components/receiving/workspace/unmatched-items` |
| Triage | 17 · 2,173 | `git checkout main -- src/components/receiving/triage` |
| Unfound packages | 18 · 2,128 | `git checkout main -- src/components/receiving/unfound` |
| Unbox history | 4 · 1,092 | `git checkout main -- src/components/receiving/history` |
| Receiving sidebar / context rail | 73 · 12,557 | `git checkout main -- src/components/sidebar/receiving` |
| Everything above at once | 354 · 67,922 | `git checkout main -- src/components/receiving` |
| Hooks it needs | 10 files | `git checkout main -- src/hooks/useReceivingDetailForm.ts src/hooks/useReceivingEvents.ts src/hooks/useReceivingPhotos.ts src/hooks/useReceivingPhotoCount.ts src/hooks/useReceivingPhotoTakenCount.ts src/hooks/useReceivingLineBulkSelection.tsx src/hooks/useReceivingLineRailSelection.tsx src/hooks/useReceivingPhotosRealtimeRefresh.ts src/hooks/useScopedReceivingPhotos.ts src/hooks/usePhotoReceivingContext.ts` |

## Shared UI & shell — 67 files · 13,499 LOC (`ui`) + shell trees

The chrome everything else hung off. **Restore this before restoring any feature** — most
feature directories import from `ui/` and `layout/`.

| Item | Files · LOC | Restore |
|---|---|---|
| **Chip + tooltip family** — see *Restore first* #10 | — | see above |
| `src/components/ui` — the whole shared kit: chips, tooltips, pane headers, table column config, timelines | 67 · 13,499 | `git checkout main -- src/components/ui` |
| Sidebar / left context rail — `ContextPanelLayout`, rail shell, master nav, favorites | 192 · 32,320 | `git checkout main -- src/components/sidebar` |
| Layout shell — `ResponsiveLayout` (mounted the global wedge scanner), global header | 33 · 4,686 | `git checkout main -- src/components/layout` |
| Workbench sheet shell — `WorkbenchSheetView` (245), chrome header, KPI band, band controls | 49 · 8,264 | `git checkout main -- src/components/dashboard` |
| Table host + registry — see *Restore first* #8 | 16 · 2,332 | `git checkout main -- src/components/tables` |
| Right-rail inspector — see *Restore first* #9 | 12 · 1,963 | `git checkout main -- src/components/right-rail` |
| Search surface | 25 · 4,785 | `git checkout main -- src/components/search` |
| Quick access | 16 · 2,499 | `git checkout main -- src/components/quick-access` |
| Command bar, providers, boot splash, root dashboards | 10 · 1,360 | `git checkout main -- src/components/CommandBar.tsx src/components/Providers.tsx` |
| Saved views (Band-3 Views menu) | 2 · 377 | `git checkout main -- src/components/saved-views src/hooks/useSavedViews.ts` |
| Identity avatars / staff faces | 4 · 550 | `git checkout main -- src/components/identity` |
| Icons | 9 · 1,242 | `git checkout main -- src/components/icons` |
| Assistant / AI panels | 18 · 2,598 | `git checkout main -- src/components/assistant src/components/ai` |

## Station (scan benches) — 186 files · 25,076 LOC

The scan-bench region: scan pane, displays push column, terminal dock, auto-collapse.

| Item | Files · LOC | Restore |
|---|---|---|
| **Carton identity header** — see *Restore first* #1 | 13 · 2,416 | `git checkout main -- src/components/station/entity-context` |
| Displays push column + carton Macro action floor | 24 · 4,388 | `git checkout main -- src/components/station/displays` |
| Station column shell + `StationScanPaneHost` | 17 · 2,603 | `git checkout main -- src/components/station/workbench` |
| Receiving grid (station-side) | 32 · 3,233 | `git checkout main -- src/components/station/receiving-grid` |
| Location pill + bin picker | 5 · 955 | `git checkout main -- src/components/station/location` |
| Capture / upload (phone bridge) | 6 · 685 | `git checkout main -- src/components/station/capture-upload` |
| Centre auto-collapse (`useAutoCollapse`) | 6 · 511 | `git checkout main -- src/components/station/collapse` |
| Terminal dock | 3 · 191 | `git checkout main -- src/components/station/terminal` |
| Single-record station host (`EntityStationPane`, the `stance` prop) | 2 · 246 | `git checkout main -- src/components/station/entity` |
| Whole station tree | 186 · 25,076 | `git checkout main -- src/components/station src/hooks/station` |

## Photos & media — 46 files · 7,563 LOC

| Item | Files · LOC | Restore |
|---|---|---|
| **Photo gallery viewer** — see *Restore first* #5 | 14 · 2,980 | `git checkout main -- src/components/shipped/photo-gallery` |
| Media Library (`/ops/photos`) — grid, folders, labels, saved views, NAS backup, share links | 46 · 7,563 | `git checkout main -- src/components/photos` |
| Photo inspector panels | 2 · — | `git checkout main -- src/components/photos/photo-inspector` |
| Hooks (20 files — library state, selection, folders, dropzone, density, scoped photo sets, realtime refresh) | 20 | `git checkout main -- src/hooks/usePackPhotoCounts.ts src/hooks/usePackerPhotosRealtimeRefresh.ts src/hooks/usePhotoDropzone.ts src/hooks/usePhotoGridDensity.ts src/hooks/usePhotoInspectorParam.ts src/hooks/usePhotoLibrary.ts src/hooks/usePhotoLibraryFolders.ts src/hooks/usePhotoLibraryUrlState.ts src/hooks/usePhotoReceivingContext.ts src/hooks/usePhotoSelection.ts src/hooks/usePhotoShareLinks.ts src/hooks/useReceivingPhotoCount.ts src/hooks/useReceivingPhotoTakenCount.ts src/hooks/useReceivingPhotos.ts src/hooks/useReceivingPhotosRealtimeRefresh.ts src/hooks/useScopedPackerPhotos.ts src/hooks/useScopedReceivingPhotos.ts src/hooks/useScopedUnitPhotos.ts src/hooks/useTicketPhotoStaging.ts src/hooks/useUnitPhotosRealtimeRefresh.ts` |

## Support / helpdesk — 76 files · 11,206 LOC

Ticket workspace, Zendesk chat, claim composer, customer/team context hub.

| Item | Files · LOC | Restore |
|---|---|---|
| **`ThreadPanel`** — see *Restore first* #3 | 2 · 892 | `git checkout main -- src/components/threads` |
| Support workspace (service workspace, Zendesk chat, context hub, claims) | 76 · 11,206 | `git checkout main -- src/components/support` |
| Hooks (8: ticket params, reply, suggestion, context, Zendesk queries) | 8 | `git checkout main -- src/hooks/useSupportContext.ts src/hooks/useSupportReply.ts src/hooks/useSupportSuggestion.ts src/hooks/useSupportTicketParam.ts src/hooks/useSupportIssueParam.ts src/hooks/useSupportOrderOpenParam.ts src/hooks/useSupportVmParam.ts src/hooks/useZendeskQueries.ts src/hooks/useZendeskTicketSubject.ts` |

## Outbound / packing / shipping — 68+43+21+11 files · ~18,300 LOC

| Item | Files · LOC | Restore |
|---|---|---|
| Shipped workspace (incl. the photo gallery above) | 68 · 10,461 | `git checkout main -- src/components/shipped` |
| Outbound | 43 · 5,026 | `git checkout main -- src/components/outbound src/hooks/useOutboundUrlState.ts` |
| Packer surfaces | 21 · 1,973 | `git checkout main -- src/components/packer src/components/packing` |
| Unshipped queue | 10 · 1,896 | `git checkout main -- src/components/unshipped` |
| Shipping | 11 · 884 | `git checkout main -- src/components/shipping` |
| Fulfillment | 4 · 382 | `git checkout main -- src/components/fulfillment src/hooks/fulfillment` |
| Hooks (10 pack + 3 ship) | 13 | `git checkout main -- src/hooks/useArmedPackStation.ts src/hooks/useOrderPackChecklist.ts src/hooks/usePackingCheckPersist.ts src/hooks/usePackingPolicy.ts src/hooks/usePackPhotoCounts.ts src/hooks/usePackWorkspaceTab.ts src/hooks/useNearMatchPackout.ts src/hooks/useShippedScanOutData.ts src/hooks/useShippedSearch.ts src/hooks/useShippingWorkspaceTab.ts` |

## FBA / channel — 70 files · 11,114 LOC

Amazon FBA shipment plans, box content, print selection.

| Item | Files · LOC | Restore |
|---|---|---|
| FBA workspace + table | 70 · 11,114 | `git checkout main -- src/components/fba src/hooks/useFbaRealtimeInvalidation.ts` |

**Note:** `src/contexts/FbaWorkspaceContext.tsx` (outside this lane, still present) imports
`@/components/fba/table/types` and `@/components/fba/table/utils` — it is broken until this
group is restored or the context is deleted.

## Testing / QC / Repair — 73+33+7 files · ~15,700 LOC

| Item | Files · LOC | Restore |
|---|---|---|
| Tech / testing bench | 73 · 8,881 | `git checkout main -- src/components/tech src/hooks/useStationTestingController.ts src/hooks/useFailureModes.ts` |
| Repair workspace | 33 · 6,163 | `git checkout main -- src/components/repair src/hooks/useRepairs.ts src/hooks/useRepairDisplaySort.ts src/hooks/useRepairNewParam.ts` |
| Warranty | 10 · 1,993 | `git checkout main -- src/components/warranty src/components/order-record/OrderWarrantySummary.tsx src/hooks/useWarrantyClaims.ts src/hooks/useWarrantyMutations.ts src/hooks/useWarrantyZendesk.ts` |
| Work orders | 8 · 699 | `git checkout main -- src/components/work-orders src/hooks/useWorkOrderAssignment.ts` |
| Tech sidebar | 6 · 1,199 | `git checkout main -- src/components/sidebar/tech` |

## Catalog / SKU / labels / barcode — 46+25+34+14 files · ~15,200 LOC

| Item | Files · LOC | Restore |
|---|---|---|
| **Barcode + label builders** — see *Restore first* #6 | 46 · 4,521 | `git checkout main -- src/components/barcode` |
| **Product label workspace** — see *Restore first* #7 | 25 · 3,774 | `git checkout main -- src/components/labels` |
| Products catalog | 34 · 3,873 | `git checkout main -- src/components/products src/hooks/useProductsSkuIdParam.ts` |
| SKU detail | 14 · 3,035 | `git checkout main -- src/components/sku src/hooks/useSkuIdentity.ts src/hooks/useSkuKitParts.ts src/hooks/useSkuQcChecks.ts src/hooks/useSkuCatalogSearch.ts` |
| Manuals | 23 · 3,284 | `git checkout main -- src/components/manuals` |
| Listing / serial / linkage | 3 · 770 | `git checkout main -- src/components/listing src/components/serial src/components/linkage` |
| Hooks (6 label + 6 sku + catalog) | — | `git checkout main -- src/hooks/useLabels.ts src/components/labels/useLabelDraft.ts src/hooks/useLabelPrinterStore.ts src/hooks/useLabelPrintFeed.ts src/hooks/useLabelsHistoryIdParam.ts src/hooks/useLabelsWorkspaceTab.ts src/hooks/useCatalog.ts src/hooks/useOrgGs1.ts` |

## Inventory / warehouse / locations — 50+24+1 files · ~10,700 LOC

| Item | Files · LOC | Restore |
|---|---|---|
| Inventory surfaces | 50 · 6,323 | `git checkout main -- src/components/inventory src/hooks/useInventorySearch.ts src/hooks/useUnitsOverview.ts` |
| Warehouse / bins | 24 · 3,804 | `git checkout main -- src/components/warehouse` |
| Locations picker | 1 · 530 | `git checkout main -- src/components/locations src/hooks/useLocations.ts src/hooks/locations-cache.ts` |
| Replenish | 4 · 510 | `git checkout main -- src/components/replenish` |
| Board view | 1 · 837 | `git checkout main -- src/components/board` |

## Admin & settings — 103+24 files · ~19,200 LOC

| Item | Files · LOC | Restore |
|---|---|---|
| Admin (access control, staff management, roles, sourcing, NAS folders, overview) | 103 · 14,144 | `git checkout main -- src/components/admin src/hooks/admin` |
| Settings | 24 · 5,027 | `git checkout main -- src/components/settings` |
| Audit log panel + viewer | 3 · 1,353 | `git checkout main -- src/components/audit-log src/components/audit src/components/sidebar/audit-log-panel` |
| Connections panel | 6 · 864 | `git checkout main -- src/components/sidebar/connections-panel src/components/admin/connections` |
| Sourcing | 13 · 1,333 | `git checkout main -- src/components/sourcing src/components/admin/sourcing` |

## Studio (canvas) — 29 files · 6,412 LOC

The node-graph workflow canvas — `StudioShell` and its editors.

| Item | Files · LOC | Restore |
|---|---|---|
| Studio shell + graph editor | 29 · 6,412 | `git checkout main -- src/components/studio` |
| Forge | 8 · 1,031 | `git checkout main -- src/components/forge` |

## Kiosk & counter — 5+5+8 files · ~2,800 LOC

Customer-facing counter tablet. The kiosk **routes** (`src/app/kiosk/**`) were deleted by
the kiosk lane; these are its components.

| Item | Files · LOC | Restore |
|---|---|---|
| Kiosk v2 (cart line editor, customer intake, payment step-up, realtime) | 5 · 610 | `git checkout main -- src/components/kiosk` |
| Counter workspace + session | 5 · 1,491 | `git checkout main -- src/components/counter` |
| Walk-in desk (pickup, sales history, KPI strip) | 8 · 677 | `git checkout main -- src/components/walk-in src/hooks/useWalkInTaskRedirect.ts` |

## Mobile — 83 files · 15,941 LOC

The `/m/**` phone surfaces. Route tree deleted by the app lane; these are its components.

| Item | Files · LOC | Restore |
|---|---|---|
| Mobile receiving | 30 · 5,261 | `git checkout main -- src/components/mobile/receiving` |
| Mobile redesign shell | 21 · 4,345 | `git checkout main -- src/components/mobile/redesign` |
| Mobile checklist | 5 · 1,327 | `git checkout main -- src/components/mobile/checklist` |
| Mobile station | 2 · 1,081 | `git checkout main -- src/components/mobile/station` |
| Mobile photos / packer / identify / unit / feed / picker | 21 · 3,420 | `git checkout main -- src/components/mobile` |
| Phone scan bridge hook | 1 | `git checkout main -- src/hooks/usePhoneScanBridge.ts` |

### 2026-09-15 — `/m/checklist` deleted in `cycleforge-lanes/prod` (operator ruling)

Separate event from the table above, and in a different tree. Operator: *"remove
the checklist from the mobile display and the checklist components, they are old
components from the mobile app itself. I'm removing and simplifying the display
in general so I can build upon a simplified display language."*

This **retires the standing "keep it" ruling** recorded in four places —
`mobile-first-foundation-PLAN.md` Track H (*"H3 DEVIATION … do NOT 'finish'
it"*), `nav-lanes-reports-IA-PLAN.md` §1.7 (`/m/checklist` → **KEPT**,
*"operator will repurpose"*), `daily-tasks-page-HANDOFF.md` §H3 and
`daily-checklist-kinds-and-mobile-HANDOFF.md` (*"leave it alone"*). Those notes
were right to refuse an inferred deletion; this is the operator gate they were
waiting for.

| Item | Files | Restore |
|---|---|---|
| Route | 1 | `git checkout HEAD -- 'src/app/m/(shell)/checklist'` |
| Components (page · order queue · editor · kit-parts CRUD · QC CRUD) | 5 | `git checkout HEAD -- src/components/mobile/checklist` |
| Dead-with-it hook | 1 | `git checkout HEAD -- src/hooks/useResolveCatalogByItemNumber.ts` |

Rewired, not deleted — restoring the files alone will NOT bring the row back:
`nav-registry.ts` (the `checklist` leaf + `ClipboardList` import),
`mobile-context-navigation.ts` + its test (the `'Checklists'` title),
`mobile-first-surface.ts` (the `/m/checklist` prefix), and
`MobilePackingSheet.tsx` (the *Edit kit / QC checklist* CTA).

**Kept on purpose:** `/api/sku-catalog/by-item-number` and
`src/lib/packing/resolve-catalog-by-item-number.ts` — outbound order-intake
triage still calls them. `OrderPackChecklist` (`variant="mobile"`) stays too:
that is the packing-checklist EXECUTION surface inside the live pack flow with
policy enforcement, not the old authoring CRUD. `MobileDailyChecklist`
(`/m/home` = **Daily**) is untouched — different verb, and a parallel session
was editing it the same day.

**Capability moved, not lost:** kit-parts and QC-template authoring is now a
desk-only verb (SKU catalog admin). The phone lost an authoring door it had;
that is the simplification, not an oversight.

## 2026-09-15 — Products tabs removed · Inventory tabs parked (operator ruling)

Operator: *"focused on parking and removing the tabs and displays from the code
base … just focusing on simplifying everything. These are all the tabs that are
not working properly. So for example, removing the products reference, the
products kit parts, the products listing match. And inside of the parent level
inventory you will be parking health, quick picks, reason codes, replenish,
graph, pulse, tracking exceptions."*

**Two different acts, and the difference is the point.** Asked how Support stops
displaying, the answer is `LANE_MOBILE_FIRST: 'hidden'` in
`src/lib/nav/lanes.ts` — a ledger, one funnel (`getSidebarNavItems`), one gate
test. That instrument is LANE-altitude and could only have hidden Inventory
whole, which is wrong: the desk is in daily use. So the same shape was built one
altitude down.

#### Parked — Inventory (7 tabs, nothing deleted)

`src/lib/nav/parked-tabs.ts` is the ledger; `filterPageChildren` is the one
child funnel (spine · desk tab band · header switcher · ⌘K);
`src/lib/nav/parked-tabs.test.ts` is the gate.

| Tab | Route (still resolves) |
|---|---|
| Tracking Exceptions | `/inventory/triage` |
| Pulse | `/inventory/pulse` |
| Graph | `/inventory/graph` |
| Replenish | `/inventory?section=replenish` |
| Reason Codes | `/inventory/reason-codes` |
| Quick Picks | `/inventory/favorites` |
| Health | `/inventory/health` |

No files were deleted. Each child keeps its `to()` and its `resolveChild`
clause, so a bookmark lands and the band lights nothing. **Unpark by deleting
one ledger entry.** Ledger + Stock + Locations still display.

#### Removed — Products (3 tabs)

Deleted, not parked: `?view=catalog` and `?view=kit` left `PRODUCTS_VIEWS`, so a
stale link folds back to Manuals instead of half-opening an unmaintained body.

| Item | Files | Restore |
|---|---|---|
| Reference display | 2 | `git checkout HEAD -- src/components/products/catalog/ProductsCatalogWorkspace.tsx src/components/products/catalog/CatalogBulkActionBar.tsx` |
| Reference view chrome (platform tabs + refine) | 4 | `git checkout HEAD -- src/components/products/catalog/catalog-url-state.ts src/components/products/catalog/catalog-url-state.test.ts src/lib/selection/catalog-scopes.ts` |
| Kit Parts display | 2 | `git checkout HEAD -- src/components/products/KitPartsWorkspace.tsx src/components/products/KitPartsSection.tsx` |
| Kit Parts data hook | 1 | `git checkout HEAD -- src/hooks/useSkuKitParts.ts` |
| Dead duplicates the pass exposed | 3 | `git checkout HEAD -- src/lib/products/products-view.ts src/lib/products/catalog-url-state.ts src/lib/products/catalog-url-state.test.ts` |

Rewired, not deleted — restoring the files alone will NOT bring the tabs back:
`sidebar-navigation.ts` (the three child rows + the `catalog-link` arm of
Products' `resolveChild`), `products-view.ts` (`PRODUCTS_VIEWS`),
`ProductsWorkspace.tsx` (two `case`s + two lazy imports),
`ProductsSidebarPanel.tsx` (`isKit` / `isCatalog` branches + `KitPartsPicker`),
`query-mode-routes.ts` (the seven Reference-chrome params: `platform`,
`linkFilter`, `pending`, `inactive`, `noChannels`, `noManuals`, `noQc`),
`QcChecklistWorkspace.tsx` (the *N kit* jump), `useProductsSkuIdParam.ts`
(`'qc' | 'kit'` → `'qc'`), `nav-command-codes.ts` (`CMD-GO-PRODUCTS`).

**Kept on purpose:** the `catalog` **table** — `CATALOG_TABLE_BINDING`,
`src/lib/products/catalog-grid-layout.ts`, `field-catalog/catalog*.ts`,
`src/components/products/catalog/{types,catalog-grid}` — is a registered
`PRODUCT_TABLES` slot-table cohort peer. Operator chose *door + view only*:
retiring the peer is its own gated increment (`eval:cohort slot-table`
re-baselines). `CatalogListRow` also still types `format-station-copy-row.ts`.

**Listing match was only a door.** It aliased `/review?mode=catalog-link`; that
Review surface, its API route and its two cohort peers are untouched.
`getSidebarNavPageId` still names Products for that URL so the header is right
while no tab lights.

**Fixed in passing** — two `CMD-GO` stickers already pointed at children a
parallel pass had removed, so they scanned into nothing: `CMD-GO-FBA`
(`outbound/fba` → `fba/plan`, after FBA became its own Outbound lane row) and
`CMD-GO-HOME` (`home/daily` → `home`, after Daily became modeless).

## Auth & boot — 12+2 files · 1,780 LOC

**`src/app/signin` survives the refactor and imports 7 of these.** Until they are restored
or rewritten, sign-in does not build. See *Known breakage* below.

| Item | Files · LOC | Restore |
|---|---|---|
| Auth (staff PIN pad, numpad theme, staff picker, step-up modal, provider sign-in) | 12 · 1,503 | `git checkout main -- src/components/auth` |
| Boot splash | 2 · 277 | `git checkout main -- src/components/boot` |
| Exactly what `/signin` imports | 7 files | `git checkout main -- src/components/auth/ProviderSignInButton.tsx src/components/auth/SetPinPad.tsx src/components/auth/SignInAuthStepPanels.tsx src/components/auth/StaffPickerList.tsx src/components/auth/StaffPinPad.tsx src/components/auth/StaffSigningIn.tsx src/components/auth/PinPadKey.tsx src/components/auth/PinPadStaffHeader.tsx src/components/auth/theme-numpad.ts src/components/boot/BootSplash.tsx` |

## `src/features/**` — 99 files · 11,971 LOC

The newer feature-folder tree (never fully migrated to).

| Item | Files · LOC | Restore |
|---|---|---|
| Operations journey | 40 · 4,950 | `git checkout main -- src/features/operations src/hooks/useOperationsJourney.ts src/hooks/useOperationsJourneyBrowse.ts src/hooks/useOperationsSavedViews.ts` |
| Review queue | 16 · 2,228 | `git checkout main -- src/features/review` |
| Tasks (grid + `TASKS_TABLE_BINDING`) | 11 · 1,341 | `git checkout main -- src/features/tasks` |
| Home | 13 · 1,102 | `git checkout main -- src/features/home` |
| My Day | 9 · 1,080 | `git checkout main -- src/features/my-day` |
| Daily checks | 6 · 819 | `git checkout main -- src/features/daily-checks` |
| Signals | 4 · 451 | `git checkout main -- src/features/signals src/hooks/useSignalIdParam.ts` |
| Whole tree | 99 · 11,971 | `git checkout main -- src/features` |

## `src/hooks/**` — 196 files · 20,749 LOC

**Nothing in `src/lib/**` or `src/app/api/**` imported a hook** — every reference there is a
docblock `{@link}`, not an import. That is why the whole tree could go.

Highest-value, ranked:

| Hook | LOC | Why it matters | Restore |
|---|---:|---|---|
| `useGlobalWedgeScanner` | — | **Mounted the one HID barcode wedge listener** for the whole app (from `ResponsiveLayout`). The listener *itself* — `createWedgeKeyListener` — survives in `src/lib/keyboard/wedge-scan-listener.ts`; this hook was the React mount adapter. The new shell needs an equivalent | `git checkout main -- src/hooks/useGlobalWedgeScanner.ts` |
| `useWedgeScanner` | — | Per-surface wedge mount (kiosk + station). Same relationship to the lib listener | `git checkout main -- src/hooks/useWedgeScanner.ts src/hooks/useWedgeScanner.sot.test.ts` |
| `useOptimisticUrlParam` | — | Mount-gated URL opens; pairs with the surviving `src/lib/routing/optimistic-url-param.ts` | `git checkout main -- src/hooks/useOptimisticUrlParam.ts` |
| `usePanelStoreKeyboard` | — | Right-rail Esc / `Mod+Shift+R`; pairs with the surviving `src/lib/right-rail/panel-store.ts` | `git checkout main -- src/hooks/usePanelStoreKeyboard.ts src/hooks/usePanelStoreKeyboard.sot.test.ts src/hooks/usePanelActions.tsx` |
| `useIdleReady` | — | **`src/contexts/` still imports this** (2 call sites) — see *Known breakage* | `git checkout main -- src/hooks/useIdleReady.ts` |
| `useLocations` | 515 | Location/bin resolution + cache | `git checkout main -- src/hooks/useLocations.ts src/hooks/locations-cache.ts` |
| `useOrdersSync` | 387 | NDJSON/Ably order stream client | `git checkout main -- src/hooks/useOrdersSync.ts` |
| `useRealtimeInvalidation` | 338 | Ably → query invalidation fan-out | `git checkout main -- src/hooks/useRealtimeInvalidation.ts src/hooks/useRealtimeToasts.ts` |
| `useThread` | 294 | Backs `ThreadPanel` | `git checkout main -- src/hooks/useThread.ts` |
| `useCopyChip` | 269 | Backs `CopyChip` | `git checkout main -- src/hooks/useCopyChip.ts` |
| `useSavedViews` | 279 | Saved views across every workbench | `git checkout main -- src/hooks/useSavedViews.ts` |
| `useBarcodeScanner` | 316 | Camera-based scanning | `git checkout main -- src/hooks/useBarcodeScanner.ts src/hooks/useBarcodeMode.ts src/hooks/useCamera.ts` |
| Whole tree | 20,749 | | `git checkout main -- src/hooks` |

Themed clusters (file counts): Photos 20 · Orders 11 · Receiving 10 · Packing 10 · Scan 8 ·
Support 8 · Labels 6 · SKU 6 · Dashboard 5 · Tables 4 · Station 4 (+ `src/hooks/station/`,
12 files / 1,202 LOC).

---

# Known breakage this lane caused outside itself

Reported rather than fixed — these files are in other lanes.

| File | Broken import | Fix |
|---|---|---|
| `src/app/signin/**` | 7 components from `@/components/auth` + `@/components/boot` | Restore the auth group above, or rewrite sign-in on the new shell. **This is the only way into the app** |
| `src/app/layout.tsx` | `@/components/dev/PaintTimingHud`, `@/components/providers/ShellQuerySeed` | Drop both imports (dev-only HUD + a query seed), or restore `src/components/dev` + `src/components/providers` |
| `src/contexts/StaffColorsProvider.tsx` | `@/hooks/useIdleReady` | Restore the hook or inline it (small) |
| `src/contexts/ActivityInboxContext.tsx` | `@/hooks/useIdleReady` | Same |
| `src/contexts/FbaWorkspaceContext.tsx` | `@/components/fba/table/{types,utils}` | Restore the FBA group or delete the context |
| `src/lib/tasks/staff-task-row.test.ts` | `@/features/tasks/grid/tasks-table-definition` | **A test inside the kept `src/lib` tree.** Delete the test or inline `TASKS_TABLE_BINDING` |
| `src/utils/events.ts` | `@/components/receiving/receiving-events` | Move the `emitReceiving` emitter into `src/lib` — it is domain plumbing that was living in the UI tree |

The GS1 / short-URL resolvers (`src/app/{01,414,l,p,s,q,gs1}`) are **not** affected: the app
lane had already moved the QR landing page into `src/app/_label-landing/public-qr-landing.tsx`,
which imports only `src/lib/**` and `next/headers`. Physical labels still resolve.
