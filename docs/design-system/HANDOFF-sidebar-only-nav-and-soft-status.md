# HANDOFF — sidebar-only navigation + the soft status pill (written 2026-09-28)

Paste the **Prompt** at the bottom into a fresh session. Everything above it is the ground truth,
read on the working tree on 2026-09-28. Other sessions edit this tree, so re-read before every edit.
Dev origin `http://localhost:3050` only (AGENTS.md §1). Screenshots: Playwright from a /tmp script,
with the cookie in `/tmp/cf.cookie` (`name=value`). Never loop on `/api/auth/signin`: it rate-limits
per staff member.

## 1. Owner rulings (2026-09-28)

1. **Navigation = the left contextual sidebar.** No top inline tabs, header tab row or segmented page-mode
   control on any desk or scan station. A desk's views are declared once, as sidebar views.
2. **Friendlier status.** The solid state badge (`STK · In stock`, `Open`, `Done`, `Withdrawn`) is the
   industrial language. Triage desks show a **soft pill**: tone-tinted background, tone outline,
   tone text, a per-state icon, sentence case, pill radius.

## 2. What already landed (do not redo)

| Change | Where |
|---|---|
| Tab row deleted from the desk frame: the props `tabs`, `activeTab`, `onTabChange` and `tabsLead` are gone, along with the `DeskPageTab` type and the `DESK_TAB_ROW_CLASS` token | `design-system/components/DeskPageChrome.tsx`, `tokens/desk-stage.ts` |
| `DeskPageLayout` takes no tab props. Its title is `getSidebarPageNav(pageId)?.label` unless `title` is passed | `components/desk/DeskPageLayout.tsx` |
| Deleted: `useDeskPageChromeTabs.ts`, `PhotoLibraryScopeBand.tsx`, the nav `deskChrome` flag and `hasDeskPageChrome` | `lib/sidebar-navigation.ts` (+ test) |
| Tab props removed from 8 callers (table below). Their URL params still parse, so deep links still work | — |
| Pinned law: `DeskPageChrome`, `TableStatusBar` and `ContextualSidebar` now say views live in the left sidebar and never in a tab row | `src/design-system/pinned.json` |
| Earlier today: the desktop is triage-only with no Floor, and Daily, Stock, QC labels, Replenish and Shipped use `TriageCardList density="row"` | `HANDOFF-remove-desk-floor.md` §0 |

Verified: `pnpm exec tsc` is clean project-wide. eslint is clean on the touched files. The
`sidebar-navigation`, `railless-surface` and `triage-workspace-state` tests give 56/56. On :3050, `/`,
`/reports`, `/incoming` and `/shipping/orders` render a header with no `[role=tablist]`.

## 3. Views that lost their switch (port these into the sidebar)

| Page | Param → values | Reachable from the sidebar today |
|---|---|---|
| Daily `/` (`features/home/DailyAgenda.tsx`) | `?tab=` all · checklist (scope=mine only) · task · ticket · task_ticket | no (`home` is a legacy page map) |
| Reports `/reports` | `?tab=` staff · packer · utilization · velocity · dead · tasks · activity | no (legacy) |
| Media library `/ops/photos` | `?sourceScope=` all · unboxing · local_pickup · packing · repair · claims · outbound; `?imageType=` (custom type picker, was the tab-row lead) | no |
| Pack `/pack` | `?packview=` queue · history | no (station, legacy) |
| Arrival triage `/triage` | `?triview=` triage · found (Prioritize) · unfound · done | no |
| Unbox `/unbox` | `?unboxview=` queue · incoming · viewed (Recent) · history · all | partial |
| Picker `/pick` | `?ship=` pending · urgent · history · all | partial (Urgent only) |
| Quality control `/test` | `?testTab=` returns · history · urgent · pending · all | no |

The hooks became read-only (`usePackWorkspaceTab`, `useTriageWorkspaceTab`, `useShippingWorkspaceTab`,
`useTestingWorkspaceTab`); the sidebar now writes the param. `useReceivingMode.updateTriageView` has no
caller.

**How to port one page (the pattern the migrated pages use):**
1. Declare the page in the contextual nav: `src/lib/nav/context/pages.ts` (`NAV_PAGE_DECLS`). Declare
   its views as nav children with `to()` targets writing the param (`src/lib/sidebar-navigation.ts`).
   Flip its rollout from `legacy` to `contextual` (`src/lib/nav/context/rollout.ts`).
2. The parity gate (`src/lib/nav/context/parity.ts`, `docs/refactors/sidebar/PARITY.md`) must list
   the page's params, actions and filters. Run its test.
3. Use digits `1`–`n` for the painted views (`NAV_GO_KEYS`) and a view icon (`nav-view-icons.ts`).
4. In-page segmented controls that are really view filters also move to the sidebar filters
   (`NavFilters`). On Daily these are the list bar's `?filter=` all/open/done and `?scope=`
   mine/handed off/everyone.
5. Prove it on :3050: clicking every view changes the list, and the URL round-trips.
Reference pages already on the contextual sidebar: Inventory (`/inventory/stock`, QC labels),
Receiving (`/incoming`), Fulfillment (`/shipping/orders`), Sourcing, Imports, Exceptions.

Not desk chrome, so they stay unless the owner says otherwise: `DeskInspectorIndexShell` tabs,
`SupportTicketsBoard`, `WalkInDeskHeader` `TableTabs`, `DailyAgendaComposer`, `ChecklistEvidence`,
`LabelPrinterWorkHeader`, `LabelsProductsWorkspace`, settings/me section tabs and `PaperworkDocuments`.

**Put it in the design-system MCP** so building agents reach for the sidebar:
- `pinned.json` is done (§2).
- Add a `ds_critique` / layer-law rule that fails a `role="tablist"` or `TabSwitch` / `TableTabs` /
  `SegmentedControl` rendered as page navigation directly inside a `DeskPageLayout` child. Add it
  in `src/lib/views/layer-law.ts` or as an ESLint `no-restricted-syntax` rule, per
  `.claude/skills/add-guard`.
- Add a `ds_contract` answer for "where do a page's views go" → `ContextualSidebar` + `NAV_PAGE_DECLS`.

## 4. The soft status pill — LANDED 2026-09-28

**Done:** `stateCodeCssText` (`packages/design-tokens/src/state.ts`, regenerated) paints `.state-badge-<tone>` as
the soft pill by default and the solid chip only under the nearest `data-mode='industrial'`.
`stateBadgeClass` pads per mode. `LifecycleCode` shows the word in triage and the code in industrial when
no children are passed. Stock and QC header statuses now read the word only. Verified on :3050:
`/exceptions` ("Buyer request", "Out of stock") and `/` ("Open") both compute as a tint ground, a 1px inset
tone outline and a 9999px radius. Still open: `OrderRecordView` passes `{code} · {label}`. That file is
another session's; drop the code prefix once they land. Also still open: the `check` glyph for Done, and
sizing TriageRow's state column. The design notes below are kept for reference.

### Design notes

**Today.** `.state-badge-<tone>` is generated by `stateCodeCssText()` in
`packages/design-tokens/src/state.ts`. It is a solid `code` fill with `codeInk` text in EVERY mode.
`LifecycleCode` wears it (`record-ledger/LifecycleCode.tsx`), and so do the new `TriageRow` state
column, every record-header status (`StockRecordStatus`, `QcLabelRecordStatus`, `AgendaRecordStatus`,
`OrderRecordStatus`), `ReceivingStatusStrip`, `carton-record-sections` and `RepairRecordStatus`. That
is only 4 `stateBadgeClass(` call sites plus `LifecycleCode`.

**Build it at the TOKEN, once.** Industrial keeps the solid chip. Triage paints the soft pill. This
needs no new component and no per-call-site edits:

```css
/* triage (default): soft pill */
.state-badge-<tone> {
  color: <tone text>;                 /* STATE_TONES[tone].text */
  background-color: <tone tint>;      /* STATE_TONES[tone].tint  (e.g. green-50) */
  box-shadow: inset 0 0 0 1px <tone edge>;  /* STATE_TONES[tone].edge, 1px outline without layout shift */
  border-radius: 9999px;              /* pill */
  padding: 1px 8px;                   /* was px-1 py-px */
  font-weight: 500;                   /* sentence-case label, not caps code */
}
/* industrial: the solid code chip, unchanged */
[data-mode='industrial'] .state-badge-<tone> {
  color: <codeInk>; background-color: <code>; box-shadow: none;
  border-radius: var(--mode-radius-control); padding: 1px 4px;
}
```

- The tints, edges and text already exist per tone (`STATE_TONES`: `text`, `tint`, `edge`) and as
  Tailwind in `STATE_TONE_CLASSES[tone].pill` / `.border` (`tokens/lifecycle.ts`). Warning text must
  use `--mode-warn-text` to pass 4.5:1 on the tint.
- **Label:** triage shows the WORD only (`In stock`, `Open`, `Done`, `Withdrawn`), not
  `STK · In stock`. The code is industrial vocabulary. In `LifecycleCode`, render
  `children ?? spec.code` inside `industrial:` and `spec.label` in triage, or drop the `code ·`
  prefix from the triage callers. One rule: the code shows only in industrial.
- **Icon:** `LifecycleCode` already draws `LIFECYCLE_GLYPH[spec.icon]` at 12px. Keep it, set it
  in the tone colour, and make sure each state has a distinct glyph:
  - open = `circle-dot`
  - done = check-circle (add `check` to `LifecycleIcon`)
  - withdrawn = `circle-pause` or `x-circle`
  - shipped = `truck`
  - held = `circle-pause`
  - out of stock = `package-x`
  Shape plus colour means the state never relies on colour alone.
- **Row size:** in `TriageRow` the state column is fixed width. Size it to the longest triage word
  ("Out of stock", "Withdrawn") so rows never reflow.
- This is the owner's F question from `HANDOFF-inbound-record.md` §2, answered. Record it as
  `MODE-SPLIT-INVENTORY.md` owner decision 14 and in BRIEF §14.
- Regression check: `pnpm test:e2e:order-record-qol` must stay 13/13.

## 5. Verification contract

- `pnpm verify:fast` green. Attribute foreign reds by file with `git diff --stat`.
- Screenshots at 1440×900 on :3050 for every page in §3: sidebar views visible, each view clickable,
  URL round-trip. Status pill before/after on `/` (Open/Done/Withdrawn), `/inventory/stock`,
  `/inventory/qc-labels?open=2203` (header) and `/shipping/orders?openOrderId=<id>`. Take one
  `/m/scan` shot to prove industrial still paints the solid chip.

## 6. Status grammar: one status per record (owner 2026-09-28)

**The FBM → Allocate card (`OrderCard` + `RecordCard`) is the reference.**

| Surface | Where the status lives | Nowhere else |
|---|---|---|
| Card list | Tone rail + `stateIcon` under the checkbox. The word and its meaning show on hover (`stateMeaning`, a sentence like `STATUS_MEANING` in `OrderCard.tsx`) | No status pill in the title line, no tone-tinted facts, no status chip at the end of the row |
| List chrome | A section header per status with word and count, or status chips beside the select-all that also filter | — |
| One-row density | `TriageRow`'s state column: the soft pill, word only | — |
| Record header | ONE `LifecycleCode` top-right via `recordActions`, with no children | No state strip in the body |

**Exceptions: DONE 2026-09-28.**
- The status pill in each card's title line is gone.
- One band per tag (`exceptionBands` / `exceptionSection`), and the section header says the word once
  with its count ("Out of stock 34").
- Evidence reads neutral through the new `RecordFactFace` kind `text`.
- The record header uses `LifecycleCode` with no children.
- Checked on :3050: 36 cards, 0 in-card pills, 3 sections.

**Next, as component law:**
1. Make `RecordCard`'s `identity` / `trailing` typed fact descriptors instead of open `ReactNode`, so a
   second status cannot be written.
2. Add a `TriageCardList` `sections: 'by-state'` option that derives the section headers from each
   row's state.
3. Sweep every family (`rg "renderCard|RecordCardModel" src`): CartonCard, IncomingDeliveryCard,
   ImportRunCard / ImportRowCard, LabelCard / BatchCard.
4. Drop the `{code} · {label}` children in `OrderRecordView.tsx` once that file's owner lands.
5. Cut the `pinned.json` status entries down to one-line pointers once steps 1 and 2 exist.

## 7. One Find per page: the header field (owner 2026-09-28)

**Landed.**
- **Header search on legacy pages.** `GlobalHeaderSearch` gives the header field to any page that
  DECLARES a `search` in `NAV_PAGE_DECLS` (`src/lib/nav/context/pages.ts`), whether or not the page is
  on the contextual sidebar yet. There are two exceptions:
  - A contextual lane's top-level page map keeps the search-everything face.
  - Pages in the burn-down set `LEGACY_PANEL_FIND` (today only `products`, whose old
    `ProductsSidebarPanel` still paints its own find) keep it too, so no page shows two finds.
- **Daily.** `home.search` is declared (`?q=`) and the inline `SearchField` in `DailyAgenda.tsx` is
  deleted. On :3050, F focuses the header field, typing narrows the list, and the page body has no
  find field.
- **Clear chord ⌘/Ctrl+Shift+F.** It clears the page's find from anywhere, including from inside a
  text field, and lands the cursor in the empty field. It reuses the chord freed by the Floor removal.
  Being a modifier chord, a wedge scanner cannot type it.
  - Code: `useClearFindChord` in `NavFind.tsx`.
  - Taught in the field's rolling hint ("⌘⇧F Clear") and the shortcut overview.
  - Esc inside the field still clears and then blurs.
  - Checked on :3050: `/?q=Reship` → chord → `q` removed, field focused and empty. Same on
    `/inventory/stock?q=wireless`.

**Triage of every other search field**, from `rg "<SearchField|<FindField" src/components src/features src/app`.
A FORK is a page-level list find on a page whose nav could declare `search`:

| File | Page | Rollout | Declared search | Verdict | Port |
|---|---|---|---|---|---|
| `sidebar/ProductsSidebarPanel.tsx` (manuals / pairing / qc finds) | `/products` | legacy | yes (`q`, `search`) | FORK (old panel) | Port `/products` to contextual (parity gate), delete the panel's field, remove `products` from `LEGACY_PANEL_FIND` |
| `labels/LabelsProductsWorkspace.tsx` + `labels/ProductLabelsRecentRail.tsx` | `/products?view=labels` | legacy | page-level only | FORK ×2 (catalog filter, printed filter) | Declare `items.labels.search`; the history "Look up a unit" and "Scan or type a SKU" are verbs, so keep those |
| `photos/PhotoLibraryFindRow.tsx` | `/ops/photos` | none (no decl) | no | FORK | Add a Media-library decl with `search` (`q`), delete the find row's field and keep its chips (move them to the sidebar in the §3 port) |
| `support/zendesk/SupportTicketsBoard.tsx` | `/support` | legacy | no | FORK | Declare `support.items.tickets.search`, delete the board's field |
| `support/voice/CallLogView.tsx` | `/support?mode=calls` | legacy | no | FORK (already writes `?q=`) | Declare `support.items.calls.search: { param: 'q' }`, delete the field |
| `station/location/StationLocationsDisplay.tsx` | `/inventory/locations` | contextual | check `inventory.items.locations` | FORK if the page decl lacks it | Declare it, delete the field |
| `right-rail/DeskInspectorIndexShell.tsx` | right-rail index | — | — | NOT a fork (a rail's own filter) | keep |
| `receiving/history/DockedReceiptsLedger.tsx` l.245, `incoming/IncomingDeliveriesLedger.tsx` l.201 | Unbox History tab (off-desk only) | receiving: legacy | incoming decl exists | FORK on the off-desk surface only | Port the Unbox station to contextual, or reuse the `incoming` decl for that route |
| `tables/DataTable.tsx` l.637 / l.816 (about 54 callers pass search props) | many sheets | mixed | mixed | FORK per page, except keep-sheet sub-ledgers | Page by page: declare the page search, stop passing the table's search, then delete the prop |
| dialogs and pickers (`LinkLabelDialog`, `MorphingRowActionMenu`, `ResolveShipmentExceptionDialog`, `UnfoundResolver`, `EcwidSearchInputs`, `ProductSelector`, `CheckoutProductSearch`, `PairOrderCard`, `CatalogLinkFormRail`, `SwitchStaffSheet`, `StationDisplaysPushStack`, `IncomingReturnsImportStagingHost`, kiosk) | — | — | — | NOT forks (entity pickers inside a job) | keep |
| `sidebar/PackerSidebarPanel.tsx`, `TestingSidebarPanel.tsx` | station panels | pinned legacy | — | Station scan input, not list find | keep until stations go contextual |

**The recipe for each fork:**
1. Declare `search: { placeholder, source: 'url-param', param }` on the page (or view item) in
   `pages.ts`.
2. Have the list read that param. Most already do.
3. Delete the inline field.
4. If the page is legacy with an old panel find, port the page to contextual (§3), then drop it from
   `LEGACY_PANEL_FIND`.
5. Prove it on :3050: F focuses the header, the list narrows, ⌘/Ctrl+Shift+F clears it, and there
   is no body find.

## Prompt

```
Read docs/design-system/HANDOFF-sidebar-only-nav-and-soft-status.md, then AGENTS.md. Work on :3050 only.
Other sessions edit this tree: re-read before each edit and touch only your lines.
1. §7 forks, in this order. Prove each one on :3050 before starting the next:
   a. Support: tickets and calls.
   b. Media library.
   c. Products: the labels view, then flip /products to contextual and empty LEGACY_PANEL_FIND.
   d. Inventory locations.
   e. The Unbox History off-desk rows.
   f. DataTable callers, page by page, then delete DataTable's search prop.
2. §3: port each page's lost views into the left contextual sidebar, Daily first. That flips `home`
   to contextual once parityGaps('home') is empty.
3. §6: the typed RecordCard status slots and by-state sections, then sweep every TriageCardList family.
4. §4 leftovers: the Done glyph and the TriageRow state column width.
5. pnpm verify:fast. Report a table: page, fork removed / views ported, screenshot, files changed.
```
