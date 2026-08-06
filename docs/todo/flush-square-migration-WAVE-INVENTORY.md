# Flush-square / zero-radius industrial migration — WAVE INVENTORY

**Mission:** every ops surface reads like the Claim Displays column — column = the card,
radius = 0, depth = surface steps + hairlines, choices = flush combobox / TabDisplay (never
sausage pills). Transform via `cornerClass` roles + primitive defaults + call-site migration +
ratchets. **Never** globally remap `theme.extend.borderRadius`.

> Live tree note: at audit time the working tree carried **634 concurrently-modified `src/`
> files** from other sessions (884 total). Much of Waves 2–7 sheet hosts, Claim compose, topic
> plate, Button-flush, MasterNav-flush is already on disk (plan §3). This inventory targets the
> **remaining** work on top of the current on-disk state. Stage only my files; never stash/revert.

## Raw scouting (deterministic, 2026-08-06)

| Metric | Count |
|---|---|
| Soft `rounded-(sm/md/lg/xl/2xl/3xl/full)` hits under `src/` | **3256** |
| `rounded-full` only (circles vs sausages) | 799 |
| `cornerClass(` call sites | 34 |
| `HorizontalButtonSlider` call sites | 45 |
| `TabSwitch` call sites | 23 |

### Guard baselines (all GREEN on the dirty tree — any red after my edits is mine)

- `radius.test.ts` — 8 pass
- `radius-tokens.guard.test.ts` — 3 pass
- `Button.guard.test.ts` — 1 pass
- `surface-box-tokens.guard.test.ts` — 2 pass
- `tab-display-displays-hosts.guard.test.ts` — 10 pass
- `FlushTerminalFooter.guard.test.ts` — 3 pass
- `claim-display-fill.guard.test.ts` — 11 pass

### Current `CORNER_CLASS` map (`src/design-system/tokens/radius.ts`)

```
flush:'rounded-none'  chip:'rounded'  row:'rounded-md'  control:'rounded-lg'
field:'rounded-xl'  card:'rounded-2xl'  canvas:'rounded-3xl'  pill:'rounded-full'
```

`radius-tokens.guard.test.ts` bans only NEW `rounded-[…]` + a custom `borderRadius` key — role
remap does NOT trip it. But `radius.test.ts` pins the role→class deepEqual AND the `nestedCorner`
concentric math, so it moves in lockstep with any role flip.

## Wave order (staged — do NOT flip all roles at once)

- **0a** Docs + laws (declare zero-radius; deprecate soft ladder + HBS/TabSwitch). Zero pixels.
- **A** DS primitives/shells adopt flush defaults + guards. Highest leverage.
- **0b** Remap `control`+`field` → flush (AFTER A).
- **0c** Remap `chip`+`row` → flush (chip anatomy update).
- **0d** Remap `card` → flush (AFTER Panel/CardShell/SectionCard/WorkspaceCard flush).
- **B** Choice-control language: HBS/TabSwitch → flush combobox / TabDisplay.
- **C** Claim Displays finish (TicketPicker + residual fields).
- **D** Station family.
- **E** Workbench / Desk / Support / Settings.
- **F** Monitor / Canvas / TV. **0e** Remap `canvas` → flush (last).
- **G** Ratchet lockdown + debt burn-down.

## Progress (2026-08-06)

### DONE + verified (targeted guards green, `tsc` clean for my files)

- **Wave 0a — laws.** AGENTS.md hard law, source-of-truth.md (row 64 + `## Workbench chrome flush`
  section rewrite), ui-design-system.md (chip anatomy flush + new Always-ban on soft pill bands),
  kinetic-ledger.md zero-radius sentence, DESIGN_SYSTEM.md radius section.
- **Wave A — DS primitives/shells.** DropdownMenu/ContextMenu/ToolbarListbox (panels+rows→flush),
  Panel (default radius→`none`, `lg/xl/2xl` opt-in kept), WorkspaceCard (solid/glass/nested-field→
  flush), CardShell (framed-selected+rail→flush; mobile deferred), Dialog/AlertDialog (→flush),
  FilterRefinementBar (→flush + deglass), `WORKBENCH_CHROME_PILL_CLASS` → `cornerClass('flush')`
  (+ guard rewrite). Already-flush no-ops: Button, IconButton, Popover, SearchField, EmptyState,
  sheet/frozen table tokens, `MONITOR_KPI_BAND_CLASS`. StatCard = dead (no importers).
- **Waves 0b/0c/0d/0e — role flips.** `CORNER_CLASS` chip·row·control·field·card·canvas → `rounded-none`
  (CORNER_PX untouched → `nestedCorner` role math unchanged; only `nestedCornerClass('canvas',3)` class
  assertion moved). `pill` is the one surviving radius. `radius.test.ts` + `radius-tokens.guard.test.ts`
  ladder updated in lockstep.
- **Wave B — legacy pill primitives flushed + deprecation locked.** `HorizontalButtonSlider` (all
  variants rounded-full/xl → rounded-none, badge dots kept) and `TabSwitch` rails (solid/default/
  highContrast/upNext → rounded-none) flushed at the PRIMITIVE — every ~28 consumer squares with zero
  call-site risk. The workbench lifecycle band (20 consumers) was **already flush via the role cascade**
  (`cornerClass('card')` rail + `nestedCornerClass('card',0.5)`→field pill both → rounded-none).
  New guard `legacy-pill-deprecation.guard.test.ts` (shrink-only allowlist) bans new HBS/TabSwitch
  mounts. Component→TabDisplay migration = Wave G cleanup (flush already achieved).

### Guards updated / added

- `workbench-trailing-cluster.guard.test.ts` — now pins `WORKBENCH_CHROME_PILL_CLASS = cornerClass('flush')`.
- `radius.test.ts` + `radius-tokens.guard.test.ts` — ladder = all flush except pill.
- `legacy-pill-deprecation.guard.test.ts` — NEW shrink-only HBS/TabSwitch mount ratchet.

## Remaining worklist — the raw-call-site long tail (Waves C/D/E/F)

The ~3256 soft-radius hits are dominated by EXCEPT elements (status dots, spinners, avatars, Switch
pills, skeleton bars) that STAY round. Rank on card/panel-shell `rounded-lg|xl|2xl|3xl` only.

### HARD EXCEPT — never flatten (audit-ruled)

- Monitor rollup cards (`MONITOR_SECTION_CARD_CLASS` / `MONITOR_KPI_TILE_CLASS`, `rounded-2xl`) —
  **guard-pinned** (`workbench-kpi-band.guard.test.ts:38`) + law-mandated (`monitor-rollup-blocks.md`).
  Flushing needs an explicit law+guard change first — do NOT flip blindly.
- `TABLE_SURFACE_CLASS` framed raised island — deliberate recipe; EXCEPT unless scope names framed tables.
- Studio/Canvas graph nodes + inspector, Operations TV board, charts, BootSplash — keep round.
- ALL overlays: popover / dropdown / modal / dialog / AnchoredLayer OUTER shells keep radius.
- `rounded-full`: avatars (StaffAvatar/IdentityMark), status dots, Switch/toggle pills, spinners,
  count badges, skeleton pulse bars.
- `src/components/mobile/**` — own shape language, OUT OF SCOPE.

### RULING — Settings + Admin: FLUSH (user-approved 2026-08-06)

Settings + Admin section card shells flush to `rounded-none` (they are ops chrome — the operator
configuring their own workspace on the ops shell). EXCEPT within them: **Switch/toggle pills, avatars,
status dots, spinners, count badges stay `rounded-full`; overlays (dialog/popover/dropdown) keep their
radius; field inputs unchanged.** Only the bordered CARD/SECTION shells square.

### MIGRATE cohorts (in-flow ops card shells → flush)

- **Wave E support/ + sidebar/ (IN PROGRESS, workflow `flush-wave-e-support-sidebar`):** VoicemailDetail,
  CallLogSidebar, SupportChatHeader/Composer, SupportLinkedContext, IssuesDetail, SupportAssistDisplay,
  ClaimTicketPicker; SyncStatusBanner, IncomingBulkTrackingPanel, favorites/*, OperationsSidebarPanel,
  incoming-details EbayTab/PoTab; dashboard GettingStartedChecklist.
- **Wave C line-edit nested islands (CONTESTED — receiving/workspace):** PlatformAccountsManager,
  CatalogManagerList (nested-cards-as-rows → divide-y), TypeBindingsEditor, ListingLinksTab,
  LabelEditPopover inner. **Hold — concurrent session actively editing receiving/workspace.**
- **Wave D station (CONTESTED):** StationWorkspaceSkeleton/UnboxWorkbenchSkeleton geometry,
  ReceivingPhotosSection, ReceivingInboundFeed, SerialCard, PoLinesSection island. **Hold — contested.**
- **Wave E claim/support composer:** ClaimComposer → DenseComposeFields migration (involved).
- **Wave F:** canvas role already flushed (0e); Monitor/TV/Studio are EXCEPT.

### Wave G (final)

- Migrate HBS/TabSwitch component consumers → TabDisplay/SidebarFacetGroup (shrink the ratchet to 0),
  then delete the legacy primitives. Add a `flush-ops-chrome` guard (shrink-only) once the call-site
  long tail is migrated. Settle the settings/admin ruling.
