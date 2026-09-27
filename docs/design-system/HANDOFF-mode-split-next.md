# HANDOFF — design-system split: verified state, what's left, foundations, live updates, edge-to-edge Floor (written 2026-09-27)

Paste the **Prompt** block at the bottom into a fresh session. Everything above it is the
verified ground truth that prompt relies on (code read 2026-09-27, working tree, other sessions
editing concurrently).

Read first, in order: `docs/design-system/MODE-SPLIT-INVENTORY.md` (map),
`docs/design-system/HANDOFF-mode-governance.md` (phases A–F),
`docs/design-system/VERIFY-order-record-triage.md` (order-record claims + sign-off checklist),
`docs/design-system/HANDOFF-desk-record-actions.md` (rules already in code). Dev origin
`http://localhost:3050` only (AGENTS.md §1).

## 1. Verified claims (exact)

### The split itself
| Claim | Verdict | Evidence |
|---|---|---|
| Every route resolves to a declared mode, applied by the shell | **TRUE — landed** | `src/lib/routing/mode-registry.ts` (`DECLARED_ROUTES`), applied by `src/design-system/providers/RouteModeRegion.tsx` from `src/app/layout.tsx`; `mode-registry.test.ts` asserts every page resolves. The inventory's "No region" rows are obsolete |
| Unwrapped surfaces are half-styled (no surface / ink on `:root`) | **FALSE now — landed** (governance Phase B) | `packages/design-tokens/generated/tokens.css:332-338` declares `--mode-canvas`, `--mode-panel`, `--mode-ink` … on `:root` |
| Badges / avatars ignore the look | **FALSE now — landed** (Phase A) | `.state-badge-*` radius = `var(--mode-radius-control)`; `IdentityMark` `face="round" \| "record"` |
| Record header: inline → Back top-left, side pane / card → ✕ top-right | **TRUE — landed** | `DeskStageRecordHeader` `dismiss="back" \| "close"` (`src/design-system/components/DeskStageOverlay.tsx`); Back = 44px arrow `IconButton size="touch" radius="modePill"` (circle in triage, square on Floor); band is `@container/record-head` (`n of N` sheds < 24rem, view switch < 20rem) |
| In place / Split has a key | **TRUE — landed** | ⌘/Ctrl+Shift+S, `isDeskSplitChord` (`DeskStageContext.tsx`), bound in `DeskPageChrome.tsx`, cheat-sheet group `desk-split` |
| Product title repeated under the order number | **FALSE now — removed** | subtitles dropped: To-ship cards, Floor ledger, Repair, Inbound; Docked receipts keeps `Carton N` |
| Mode-blind industrial token values leak into triage | **TRUE — open** | `RECORD_ID_CLASS` = mono bold (`industrial-record.ts:24`), `RECORD_CONDITION_CHIP_CLASS` = mono · caps · tracking (`:89-90`), `RECORD_RECESS_CLASS` bevel (`:46`), `RECORD_QTY_BADGE_CLASS` (`:52`) — no `data-mode` switch |
| Timeline is industrial-faced and prints raw JSON | **TRUE — open** | `EventTimeline.tsx:351,357,580-581` uppercase + `tracking-[0.12em]`; `TimelineSection.tsx:72` title `'Activity'`; `src/lib/timeline/audit-diff.ts:8` `JSON.stringify` on object values |
| Order-record claims (note, bin, badges, stages, sections, order # twice, header ↗, platform / listing placement, timeline detach + rename) | **16 TRUE · 3 PARTIAL · 0 FALSE** | full table + checklist: `VERIFY-order-record-triage.md` |
| `/shipping/orders` builds | **FALSE (at writing)** | `src/lib/orders/orders-list.ts:30-34` imports `sqlOrderHasTechScan`, absent from `order-grain-sql.ts` — another session's WIP; do not "fix" it from here |

### Live updates (Ably)
| Claim | Verdict | Evidence |
|---|---|---|
| Order mutations broadcast over Ably | **TRUE** | `publishOrderChanged` / `publishOrderAssignmentsUpdated` / `publishQueueAssignmentsUpdated` / `publishOrderPicked` … (`src/lib/realtime/publish.ts:363-440`); channels `src/lib/realtime/channels.ts`. Note appends now publish `order.changed` (`source: 'orders.note'`) too |
| Desks repaint from those events | **TRUE — landed (§4)** | the shell mounts ONE `useRealtimeInvalidation` (`RouteRealtimeMount` in `WarehouseShell`) with the route's domains from `src/lib/routing/realtime-registry.ts` (longest prefix, like the mode registry). Page mounts removed (shipping layout, `ReceivingDashboard`, `/m/rs/[id]` layout, `DashboardSalesView`, `MobileToShipQueue`, `useDashboardRealtime`, `CartonRealtime`, `/m/receiving/po` pages, `MobileReceivingPhotoStudio`). No shell domain: inventory (`/inventory/stock` keeps its own `activity.logged` subscription), warehouse, settings, search |
| Desktop re-syncs after a dropped socket | **TRUE — landed** | `reconnect` follows `dashboard` in `realtimeFlagsFor` |
| Staff can see when live sync is down | **TRUE — landed** | `LiveSyncIndicator` in `GlobalHeader` ("Live" / "Sync paused" after `REALTIME_DEGRADE_GRACE_MS`, latched until reconnected), drawn by `ChromeModeRegion` (pill in triage, square mono caps on Floor); only on registry routes |
| A local write repaints the list without the socket | **TRUE — landed** | the refresh bus is bridged to the cache: `useRefreshDomainQueries` (`src/lib/refresh/query-keys.ts`) invalidates each domain's query keys on every `refreshDomain(…)`; `orders.outbound` shares `ORDER_WRITE_QUERY_KEYS` with the `order.changed` handler |
| Live behaviour differs by mode | **FALSE (and must stay false)** | subscriptions are mode-agnostic; only the chrome differs |

### Industrial edge to edge
| Claim | Verdict | Evidence |
|---|---|---|
| Floor removes page furniture and the width cap | **TRUE** | `DeskPageChrome.tsx` `fullscreen` → no header / tab rows, stage `DESK_STAGE_FULLSCREEN_CLASS = 'w-full'` (`desk-stage.ts:99`) vs triage `max-w-6xl` (`:15`); Floor parks the nav column (`DesktopRouteShell.tsx` `useDeskFloorActive`) and the context rail (`ContextPanelLayout.tsx`) |
| Floor is fully edge to edge (width, height) | **UNVERIFIED** | not measured: app top bar, `RightRailHost` column, ledger-internal gutters / max-widths, and the in-place record's `p-4` (`OrderRecordView.tsx` root) may still inset it. Measure on :3050 before changing |

## 2. What's left in the split

1. **Leak sweep (token level, one place fixes every caller)** — make `RECORD_ID_CLASS`, `RECORD_PRICE_CLASS`, `RECORD_RECESS_CLASS`, `RECORD_QTY_BADGE_CLASS`, `RECORD_CONDITION_CHIP_CLASS`, `RECORD_NOTE_*` follow the mode (mono / caps / bevel on Floor, sans / sentence / flat field in triage). Needs a mode selector for classes: add `@custom-variant industrial` (and `triage`) to `src/app/globals.css` scoped to the NEAREST `data-mode` (nested regions must win — test a triage portal inside Floor), then express the tokens with it. Then the per-file leaks: `SearchField.tsx:289` + `rounded-none` callers (`StockLedger:257`, `DockedReceiptsLedger:144`, `IncomingDeliveriesLedger:352`, `SkuExceptionsLedger:151`, `DailyAgenda:350`); mono-caps labels (`ReplenishmentNeedTable:193`, `RepairRecordStatus:137`, `DeskActionSlot:55,57`, `CompoundCells:1264`, `outbound/ready/grid/cells/index.tsx:79`); `/shipping/label-intake` (`LabelIntakeLedger.tsx:57-58`, `LabelIntakeDesk`, `LabelIntakeRates`) together with `BuyLabelSection` (see `HANDOFF-manual-phone-order.md`).
2. **Forced triage inside Floor** — classify each (`PaperworkWalkHost:58,65`, `LinkLabelDialog:108`, `OrderLabelEntries:275`, `ResolveShipmentExceptionDialog:107`) as intentional (readability) or leak before changing; record the verdict in the inventory.
3. **Order record triage pass** — being implemented by another session; sign off against `VERIFY-order-record-triage.md` (includes: timeline detached into its own card and titled **Timeline**).
4. **Governance D–F** (`HANDOFF-mode-governance.md`): ESLint gates + burn-down (after the leak sweep, so the allowlist is short), scan-feedback consolidation, design-mcp law entries.
5. **Owner decisions still open**: order facts under the items vs aside in full width; phones keep triage → industrial collapse.
6. **Inventory refresh**: rewrite `MODE-SPLIT-INVENTORY.md` route table from `mode-registry.ts` (it is the source now) and mark B/C landed.

## 3. Foundations (what both looks already stand on — reuse, don't fork)

- **Regions**: `ModeRegion` (`src/design-system/providers/ModeRegion.tsx`) stamps `data-mode` + variables; `RouteModeRegion` applies the registry; `resolveRegionMode` collapses triage → industrial on phones; portals re-declare.
- **Tokens** (`packages/design-tokens/src/modes.ts` → `generated/tokens.css`): corners `rounded-mode` / `-mode-control` / `-mode-pill`; surfaces `bg-mode-canvas|bar|panel|well`; ink `text-mode-ink|muted`; lines `border-mode-divide|seam|frame|fact`, `edge`, `control`; label voice `.mode-label`. One component, two looks — never a triage copy of a component.
- **Primitives**: `IconButton radius="control" | "modePill"` follow the mode (`"pill"` / `"flush"` do not); `Button` corners follow the mode; `DeskRecordViewSwitch` is the segmented face.
- **Desk stage**: `DeskStageContext` view `in-place | split | floor`; chords ⌘/Ctrl+Shift+F (Floor), ⌘/Ctrl+Shift+S (Split); `DeskStageRecordHeader` `dismiss`; `DeskRecordPlane` / `DeskRecordLayout`.
- **Live data**: Ably client `src/contexts/AblyContext`, `useAblyChannel`, `useRealtimeInvalidation`, publishers in `src/lib/realtime/publish.ts`, health in `connection-store.ts` / `connection-health.ts`; TanStack Query keys `['dashboard-table', …]`, busters in `outbound-cache-keys.ts`.

## 4. Live updates through both design systems — target

- **One live layer per route domain, mounted by the shell**, not by individual pages: derive "which realtime domains does this route need" next to the mode registry (same longest-prefix lookup) and mount `useRealtimeInvalidation` once in the app frame with those flags. Every desk (triage) and every Floor / phone surface (industrial) gets the same subscriptions — the mode never changes what's live, only how it's drawn.
- **Reconnect replay on desktop too** (`reconnect: true` wherever `dashboard` is on).
- **Visible health, mode-drawn**: one `LiveSyncIndicator` in the shell chrome reading `connection-store` / `isRealtimeDegraded` — triage: small pill + "Live" / "Sync paused" sentence case; industrial: square tile, label voice caps. Degraded after `REALTIME_DEGRADE_GRACE_MS`.
- **Local writes never depend on the socket**: every mutation's success path invalidates its own query keys (the `bustFulfillmentCaches` pattern) in addition to `refreshDomain`; add the missing key sets for domains that only call `refreshDomain`.
- **Motion**: incoming rows / count changes use the existing coalesced repaint; no layout tweens on live data (text must not slide; new orders keep the "N new orders" hold pattern in `OrderCardList`).
- **Proof**: two tabs on :3050 — mutate in one (assign, note, scan-out), the other repaints in both a triage desk and Floor within ~1 s; kill the socket (DevTools offline) → indicator shows "Sync paused", reconnect → full refetch.

## 5. Industrial edge to edge — target

On Floor (and phone industrial surfaces) the work surface owns the viewport: **width to width, height to height**.
- No side gutters, max-widths or card insets between the viewport edge and the ledger: stage `w-full`, rows span the full width, sticky header / footer bars flush to the edges, zero radius, `border-mode-divide` hairlines instead of cards.
- Height: the ledger (and a record opened in place) fills from the app bar to the bottom edge; the in-place record drops its `p-4` / column-card lift on Floor.
- ~~Right rail stays unmounted-empty on Floor~~ — **owner reversed 2026-09-27**: Floor places the selected record in a fixed-width right rail (`DeskRecordPlane`, `DESK_FLOOR_RAIL_CLASS`); the list fills from the left edge to the rail. See `MODE-SPLIT-INVENTORY.md` § Floor right rail.
- Measure first (`getBoundingClientRect` of `[data-testid=desk-page-stage]`, the ledger list, and the first row vs `innerWidth` / `innerHeight`), then remove only the insets that measure non-zero. Triage keeps `max-w-6xl`, lifted cards and gutters.

## Prompt

> You own the next pass of the CycleForge triage ⇄ industrial design-system split. Read, in order:
> `docs/design-system/HANDOFF-mode-split-next.md` (this file — verified state), `MODE-SPLIT-INVENTORY.md`,
> `HANDOFF-mode-governance.md`, `VERIFY-order-record-triage.md`. Work on :3050 only; other sessions edit this
> worktree (the order record, `orders-list.ts`, assistant artifacts) — re-read before every edit and do not
> touch `OrderRecordView.tsx` / `order-record-sections.tsx` (another session owns the order-record pass).
>
> Do, in this order, verifying each on :3050 in both In place / Split (triage) and Floor (industrial):
> 1. **Mode class variants + token leak sweep** (§2.1): add `@custom-variant industrial` / `triage` resolved by
>    the nearest `data-mode` (prove a triage portal inside Floor stays triage), rewrite the `RECORD_*` tokens in
>    `industrial-record.ts` with them, then the per-file leaks listed. Floor must look unchanged.
> 2. **Live layer** (§4): shell-mounted realtime domains beside the mode registry, desktop reconnect replay,
>    `LiveSyncIndicator` drawn per mode, local-write invalidation for domains that only signal. Prove with two
>    tabs + offline toggle.
> 3. **Floor edge to edge** (§5): measure, then remove the non-zero insets; triage untouched.
> 4. Classify the forced-triage-inside-Floor sites (§2.2), refresh the inventory from `mode-registry.ts` (§2.6),
>    and update `MODE-SPLIT-INVENTORY.md` phase rows.
>
> Rules: one component, two looks — never fork a triage copy; no layout tweens on live data; ask before
> changing anything listed as an owner ruling. Before handing back: targeted `tsc` + `eslint` on touched files,
> `pnpm verify:fast` (report pre-existing reds by file and owner), screenshots of each surface in both modes,
> and the two-tab live proof.
