# Handoff — finish right-rail inspector SoT · header wave · modal→rail

> **STATUS 2026-08-02 — verified by codebase scan (not memory).**
>
> | Track | State |
> |---|---|
> | **Shell / push / non-modal** | **Done.** `RightRailHost` push column, `resolveRightRailFrame`, global non-modal migration. |
> | **Order header + handoff §3** | **Done.** `RecordPaneHeader`, `PaneHeaderActionBar onClose`, triage/notes cut, push arithmetic pinned. |
> | **Partial Category A conversions** | **Done.** `BinDetailFlyout`, `ZohoSplitPane`, `CatalogLinkFormRail`. `SkuPairingModal` **deleted** (no rail — testing tab instead). |
> | **Contract doc (Phase 0)** | **Partial.** `display/right-rail-inspector.md` + intake-shell guard; **§2.6–§2.9 not written**. |
> | **Session 1 remainder** | **Open.** Namespaced collapse, header collapse, non-order header migration, dirty/URL/focus/responsive law, expanded guards. |
> | **Session 2 (modal→rail)** | **Open.** ~20 Dialog / `RightPaneOverlay` twins remain. |
> | **Desk three-pane** | **Open (parallel).** Saved-views waist + Labels/Products/warehouse; Support is **`service-workspace`**, not Desk ops-queue. |
>
> **Supersedes the stale parts of**
> [`right-rail-inspector-contract-CLAUDE-CODE-PROMPT.md`](./right-rail-inspector-contract-CLAUDE-CODE-PROMPT.md)
> (still useful for Category A inventory + §2.6–§2.9 text to lift into the rule file).
> **Do not re-do** [`right-panel-display-HANDOFF.md`](./right-panel-display-HANDOFF.md) §3 — closed 2026-08-02.

**Lane:** current checkout — no ad-hoc branch. Attach to `:3050`. User owns commits.  
**Product frame:** Cycle Forge multi-tenant reseller-ops SaaS. USAV is dogfood only.

---

## Paste this into a new session (Session 1 — do this first)

```
Read docs/todo/right-rail-inspector-FINISH-HANDOFF.md end-to-end, then execute §5
Session 1 ONLY. Stop at the Session 1 gate; do not open Category A conversions.

GOAL
Finish the product-wide right-rail inspector contract the order rail already proves:
one header grammar on every non-modal occupant, namespaced collapse, and the
§2.6–§2.9 amendments in the rule file — then expand guards so forks cannot return.

HARD LAWS
- AGENTS.md + source-of-truth.md → Right-rail modality (PUSH is law; float is fallback)
- Header SoT = PaneHeader + blocks — NOT a new RightRailInspectorHeader primitive
  (RecordPaneHeader is the order-specific compose; other rails copy its row order)
- Row 1 = full-width PaneHeaderActionBar (icon actions + onPrev/onNext/onClose)
- Row 2 = dense PaneHeaderLabel (short key — never hero product title)
- Two right-edge grammars only: RightRailHost (Desk/workbench) + UnboxPushColumn (station)
- useDetailStackCollapse is RIGHT EDGE ONLY — never shared with ContextPanelLayout
- Attach to :3050; never start/restart/kill the server; user owns commits
- npm run verify before done; never raise ratchet baselines
```

### Session 2 paste (only after Session 1 gate)

```
Read docs/todo/right-rail-inspector-FINISH-HANDOFF.md §5 Session 2 and §6 backlog.
Convert Category A overlays ONE per commit slice. Each slice declares §2.6 dirty
strategy (autosave OR store guard) BEFORE deleting the Dialog twin. Create forms
with neither stay Dialog and get ticketed with file path.
```

---

## 1. One-sentence goal

**One inspector shell for the whole product:** shared push host, shared header grammar
(`PaneHeader` blocks — orders via `RecordPaneHeader`), namespaced collapse, store-level
dirty swap protection, and every collection-context form on `RightRailHost` instead of
Dialog / private `fixed right-0` / `RightPaneOverlay` twins.

---

## 2. What is DONE — do not rebuild

Verified in tree 2026-08-02.

### 2.1 Shell, push, modality

| Item | Where |
|---|---|
| Single occupant store | `src/lib/right-rail/store.ts`, `RightRailHost.tsx` |
| Push column + overlay fallback | `resolveRightRailFrame` in `src/lib/right-rail/frame.ts`; `RIGHT_RAIL_PUSH_MIN_FRAME_PX = 1160`; tests in `frame.test.ts`, `right-rail-push.guard.test.ts` |
| Non-modal migration (queues) | `modal={false}` on incoming, repair, unfound, FBA, SKU, support-context, my-day, order, compare, audit/photo rails, etc. |
| Per-occupant `push={false}` freeze list | Station edge (`ReceivingDetailsStack`, testing box/manifest), assistant, grid-column prefs, receiving tool rails — see `right-rail-push.guard.test.ts` → `FLOAT_ONLY` |
| Resize + edge collapse + expand strip | `DETAIL_STACK_*` in `src/design-system/shells/detail-stack/layout.ts`; `detail-stack-collapse.guard.test.ts` |
| Selection / compare plane | `order-compare-model.ts`, `OrderRailCompare` (`detail:order-compare`) |

### 2.2 Order rail + handoff §3 (closed)

| Item | Where |
|---|---|
| Merged order header | `RecordPaneHeader.tsx` — **replaces** deleted `ShippedDetailsHeader` / `OrderIdentityHeader` |
| `↑ ↓ ×` one cluster | `PaneHeaderActionBar` `onClose` prop (`blocks.tsx`) — close is LAST after prev/next |
| Header icon row | `useRailHeaderActions()` → `ShippedDetailsPanel` |
| Triage / notes removed from dashboard inspector | `OrderTriageSection` **deleted**; `showNotes={false}` in `ShippedDetailsBody.tsx` |
| Body descriptor | `resolveOrderInspectorContext` in `order-inspector-context.ts` |
| Push ruling + arithmetic | Documented in `right-panel-display-HANDOFF.md` §3.3 (verified by call site) |

### 2.3 Category A conversions already landed

| Was | Now |
|---|---|
| Private `BinDetailFlyout` portal | `DetailStackRailRegistrar` + `PaneHeader` — still named `BinDetailFlyout.tsx` |
| Private `ZohoSplitPane` portal | `DetailStackRailRegistrar` — `ZohoSplitPane.tsx` |
| Catalog link resolve rail | `CatalogLinkFormRail.tsx` on `PaneHeader` blocks |
| `SkuPairingModal` private portal | **Deleted** — `dialog-shell.guard.test.ts` documents testing reaches pairing via `TestingSkuPairingPanel` tab; **not** converted to a rail |

### 2.4 Contract (partial Phase 0)

- `.claude/rules/display/right-rail-inspector.md` — header/identity law; points at `RecordPaneHeader` for orders
- `right-rail-inspector-header.guard.test.ts` — bans `SidebarIntakeFormShell` on record rails; pins catalog-link rail
- Intake/create may still use `SidebarIntakeFormShell` (`NewOrderEntryOverlay`, `IncomingImportEbayOverlay`, `GridColumnDetailsPanel`)

### 2.5 Support (parallel track — partial)

- `ServiceWorkspaceShell.tsx` — list stays mounted; thread covers list (staged honestly)
- **Not** Desk three-pane; see [`support-service-workspace-CLAUDE-CODE-PROMPT.md`](./support-service-workspace-CLAUDE-CODE-PROMPT.md)

---

## 3. SETTLED — do not re-litigate

1. **The right edge PUSHES** — overlay only below 1160px content row or when `push={false}` / modal. (`AGENTS.md`, `source-of-truth.md`)
2. **No `RightRailInspectorHeader` primitive** — a rolled-back attempt proved `PaneHeader` + blocks + `RecordPaneHeader` is the SoT. Do not reintroduce a parallel header component.
3. **`closeOnOutsideClick` stays OFF** on queue inspectors — the dismiss layer would swallow sibling-row clicks.
4. **Two right-edge grammars** — `RightRailHost` (Desk/workbench) and `UnboxPushColumn` (station Displays/Ticket/Claim). No third.
5. **Anchored field editors deferred** — `LabelEditPopover`, `CatalogManagerPopover`, `UnitSlotsManageOverlay`, `PreboxWizard` (handoff §2 still accurate).
6. **Support tickets ≠ Desk ops-queue** — do not force LedgerGrid + saved-views left rail onto `/support` tickets; use `service-workspace` branch law.
7. **`RailActionRegion` is not dead** — still used by `OrderRailCompare` + `OrderRailShell` (2 consumers). Migrate those to pane headers before deleting.

---

## 4. Header grammar — the gap Session 1 closes

**Orders are the reference implementation.** Every other non-modal detail occupant must
match the same row order:

```text
Row 1 — PaneHeaderActionBar (full width): [ contextual icons … ] [ pos readout? ] [↑][↓][×]
Row 2 — PaneHeaderLabel: eyebrow + SHORT key (never product title / paragraph)
Row 3 — optional tabs / status pills (belowSlot)
Body  — scroll; long titles and prose live here
```

### 4.1 Migrate these (still on old split or ad-hoc chrome)

| File | Problem |
|---|---|
| `IncomingDetailsHeader.tsx` | Close in `rightSlot`; prev/next in `belowSlot` action row |
| `RepairDetailsPanel.tsx` | Close + pencil in `rightSlot`; actions/prev/next in `belowSlot` |
| `UnfoundQueueDetailsPanel.tsx` | Close in `rightSlot`; no queue walk cluster |
| `BinDetailFlyout.tsx` | Close + external link in `rightSlot`; no unified bar |
| `MyDayTaskInspector.tsx` | Ad-hoc hero `text-role-title` + raw `IconButton` close — no `PaneHeader` |
| `FbaBoardDetailPanel.tsx` | Custom 4-row header + `text-lg` hero title + legacy `PanelActionBar` — worst offender |

**Pattern to copy:** `RecordPaneHeader.tsx` — row 1 is ONLY `PaneHeaderActionBar` in
`leftSlot` spanning full width with `onClose` + optional `onPrev`/`onNext`.

Open-full-page / external links belong in the **icon action set**, not loose buttons beside close.

---

## 5. Execution — two sessions

### Session 1 — contract + header wave (STOP after gate)

**5.1 Complete the rule file (Phase 0 finish)**

Lift §2.6–§2.9 from
[`right-rail-inspector-contract-CLAUDE-CODE-PROMPT.md`](./right-rail-inspector-contract-CLAUDE-CODE-PROMPT.md)
into `.claude/rules/display/right-rail-inspector.md`:

| § | Topic |
|---|---|
| 2.6 | Dirty state — autosave OR store swap guard; never convert create forms without one |
| 2.7 | URL addressability for record peeks; focus return on Close; `aria-live` on stable-id swap |
| 2.8 | Responsive floor — full-width overlay below breakpoint |
| 2.9 | Collapse ownership — right edge ≠ left rail; **namespaced** `detail-inspector-collapsed:${family}` |

Add SoT waist rows in `source-of-truth.md` for collapse hook + dirty strategy (one line each).

**5.2 Ship `useDetailStackCollapse(family)`**

- Lift `RightRailHost.tsx` off private `useLocalStorage('detail-inspector-collapsed')` (line ~145)
- Key shape: `detail-inspector-collapsed:${family}` (`order` | `incoming` | `claim` | `fba` | `tool` | …)
- Seed once from legacy bare key per family, then retire bare key
- **No `side` / `edge` parameter** — right edge only; guard mirrors `context-panel-collapse.guard.test.ts`

**5.3 Header collapse (house choice)**

- Render collapse chevron in header row, **left of Close**, visually subordinate
- Same state as edge grip + expand strip
- `data-testid="detail-inspector-collapse-header"`

**5.4 Migrate wave-1 headers (§4.1 table)**

One PR slice or sequential commits; `npm run verify` after each.

**5.5 §2.6 store gate (minimum viable)**

- `registerRightRailPanel` / push path checks outgoing occupant dirty flag before swap
- Test: dirty → prompt/block; **clean swap writes nothing**

**5.6 §2.7 wiring (minimum viable)**

- Close returns focus to originating row (dashboard + incoming at minimum)
- Stable-id swap: `aria-live="polite"` on panel body OR explicit heading update

**5.7 Guards (expand)**

1. Every `modal={false}` detail registrant uses row-1 `PaneHeaderActionBar` with `onClose` when closable (allowlist: assistant, sync progress shells)
2. `useDetailStackCollapse` imported nowhere under `src/components/sidebar/`
3. No page-local `useLocalStorage` on collapse keys

**Session 1 gate — stop here**

- [ ] `npm run verify` green
- [ ] Collapsing on `/dashboard` does **not** open Incoming inspector collapsed
- [ ] Incoming + My Day + FBA headers match order row order
- [ ] Work-log line in `docs/agent-log/entries/main.md`

---

### Session 2 — Category A conversions (one slice per commit)

**Gate (§2.6):** declare dirty strategy per occupant before deleting Dialog twin.
Create forms without autosave or guard **stay Dialog** — ticket with path.

**Priority backlog (verified still Dialog/overlay today):**

| Priority | Component | Path |
|---|---|---|
| P0 | `SupportCreateTicketModal` | `src/components/support/service-workspace/SupportCreateTicketModal.tsx` — needs **dirty guard** first |
| P0 | `AddOrPairSkuModal` | `src/components/products/pairing/AddOrPairSkuModal.tsx` |
| P1 | `FbaCreatePlanModal` | `src/components/fba/FbaCreatePlanModal.tsx` |
| P1 | `ZendeskClaimModal` | `src/components/support/zendesk/claim/ZendeskClaimModal.tsx` |
| P1 | Manual CRUD | `src/components/manuals/manual-crud/*Modal.tsx` |
| P1 | Label editors | `ProductLabelEditPopover`, `AsListedEditPopover` (multi-field → rail) |
| P2 | `WarrantyLogClaimDialog` | `src/components/warranty/WarrantyLogClaimDialog.tsx` |
| P2 | `StnTicketLinkModal` / `TicketStnLinkPopover` | `src/components/support/link/` |
| P2 | `ShippingInfoEditModal` | `shipped/details-panel/shipping-information/` |
| P2 | `SkuGraphCrudModal` | `src/components/inventory/graph/SkuGraphCrudModal.tsx` |
| P3 | Category C per prompt §4 | `DocumentSlideOver`, `PreboxWizard`, bulk dialogs, media picker — resolve with decision table |

**Still deferred (do not force in Session 2):** `LabelEditPopover`, `CatalogManagerPopover`,
`UnitSlotsManageOverlay`, `PreboxWizard`, `PhotoUploadOverlay`, mobile sheets, Unbox Claim/Ticket push.

**After conversions:** shrink-only guard banning new `RightPaneOverlay` / `fixed right-0 z-panel`
for detail/create/edit outside allowlist; knip dead `*Modal` shells.

---

## 6. Desk companion (parallel — not Session 1/2)

Blocking prerequisite still open — see
[`desk-contract-unification-ADDENDUM.md`](./desk-contract-unification-ADDENDUM.md) §B.

| Step | Work |
|---|---|
| 0.5 | Grow `SAVED_VIEW_SURFACES` + `useSavedViews` waist for labels, products, warehouse, manuals |
| 1+ | Migrate hand-rolled collections to saved views left · LedgerGrid middle · RightRailHost right |

`src/lib/saved-views/surfaces.ts` today: **11 surfaces**, no support/products/warehouse.

---

## 7. Key files

```
# Host / frame / store
src/components/right-rail/RightRailHost.tsx
src/lib/right-rail/store.ts
src/lib/right-rail/frame.ts
src/components/right-rail/DetailStackRailRegistrar.tsx
src/components/right-rail/useRegisterRightPanel.ts

# Header SoT (compose — do not fork)
src/components/ui/pane-header/blocks.tsx          # PaneHeaderActionBar.onClose
src/components/ui/pane-header/PaneHeader.tsx
src/components/order-record/RecordPaneHeader.tsx  # order reference

# Wave-1 migration targets
src/components/sidebar/receiving/incoming-details/IncomingDetailsHeader.tsx
src/components/repair/RepairDetailsPanel.tsx
src/components/receiving/unfound/UnfoundQueueDetailsPanel.tsx
src/components/fba/FbaBoardDetailPanel.tsx
src/features/my-day/MyDayTaskInspector.tsx
src/components/warehouse/BinDetailFlyout.tsx

# Guards
src/components/right-rail/right-rail-inspector-header.guard.test.ts
src/components/right-rail/right-rail-push.guard.test.ts
src/components/right-rail/detail-stack-collapse.guard.test.ts
src/lib/right-rail/frame.test.ts

# Laws
AGENTS.md
.claude/rules/source-of-truth.md
.claude/rules/display/right-rail-inspector.md
.claude/rules/display/motion-crossfade.md

# Completed handoff (read-only history)
docs/todo/right-panel-display-HANDOFF.md
```

---

## 8. Verify

```bash
npm run verify
```

```bash
npx playwright test dashboard-bulk-actions dashboard-selection-handoff dashboard-rail-compare \
  queue-inspector-non-modal incoming-click-to-open --project=qa-desktop
```

E2E: QA org only. Attach to `:3050` — never start the dev server.

---

## 9. Anti-goals

- Do not rebuild push / non-modal / `RecordPaneHeader` / order triage cut
- Do not add `RightRailInspectorHeader` as a second header primitive
- Do not merge left-rail and right-inspector collapse into one hook or key
- Do not convert create forms without §2.6 dirty strategy
- Do not move Unbox Claim/Ticket onto `RightRailHost`
- Do not force Desk ops-queue onto Support tickets
- Do not raise DS ratchet baselines or skip hooks

---

## 10. Status log

| When | Note |
|---|---|
| 2026-08-02 | Handoff written from full codebase scan. Supersedes stale Session 1 targets in `right-rail-inspector-contract-CLAUDE-CODE-PROMPT.md`. Confirms `right-panel-display-HANDOFF.md` §3 closed; documents Session 1/2 remainder + desk parallel track. |
