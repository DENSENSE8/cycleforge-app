# Claude Code prompt — Right-panel inspector SoT + modal→rail conversion

**For:** Claude Code / Cursor Agent implementing session  
**From:** Cycle Forge engineering (right-rail + modal audit 2026-08-01)  
**Status:** ready to execute as **two sessions** — architecture mostly shipped; header contract incomplete; modals still fork  
**Amended 2026-08-01** (industry-standards review): added §2.6 dirty state · §2.7 addressability + focus · §2.8 responsive floor · §2.9 collapse ownership (right edge ≠ left rail, key namespaced per family); split execution into Session 1 / Session 2; Collapse downgraded from unqualified Hard Always to a scoped, subordinate house control  
**Lane:** current checkout — no ad-hoc branch. Attach to `:3050`. User owns commits.  
**Companion:** Desk three-pane recipe — [`desk-contract-unification-CLAUDE-CODE-PROMPT.md`](./desk-contract-unification-CLAUDE-CODE-PROMPT.md)  
**Product frame:** Cycle Forge multi-tenant reseller-ops SaaS. USAV is dogfood only.

---

## Paste this into a new Claude Code session

**Run this as TWO sessions, not one.** Session 1 is verifiable end-to-end in a single pass.
Session 2 is a backlog with per-item acceptance — attempting both produces a sprawling diff
nobody can review. (Measured 2026-08-01: 25 existing rail occupants, 35 `Dialog` consumers,
31 `RightPaneOverlay` consumers, 21 `*Modal.tsx` files, 49 files with `fixed inset-0|right-0`.)

### Session 1 — contract + header SoT (do this first)

```
Read docs/todo/right-rail-inspector-contract-CLAUDE-CODE-PROMPT.md end-to-end, then execute
§4 Phase 0 → Phase 1 ONLY. Stop at the Phase 1 gate; do not start Category A conversions.
Pair with docs/todo/desk-contract-unification-CLAUDE-CODE-PROMPT.md
(Desk = left saved views · middle LedgerGrid · RIGHT = this inspector).

GOAL
1. Write the contract: .claude/rules/display/right-rail-inspector.md carrying §2 of this
   doc — INCLUDING the amendment sections §2.6 dirty state, §2.7 addressability + focus,
   §2.8 responsive floor, §2.9 collapse ownership. Link from contextual-display.md + SoT.
2. Ship RightRailInspectorHeader + useDetailStackCollapse (right-edge ONLY — see §2.9).
3. Migrate the wave-1 occupant headers onto it and guard the fork shut.

HARD LAWS
- AGENTS.md + .claude/rules/source-of-truth.md § Right-rail modality
- Navigators push, inspectors float — record inspectors modal={false}
- Exactly TWO right-edge grammars: (1) RightRailHost float (2) Station UnboxPushColumn
- Never private `fixed right-0` / createPortal right panels / page-local z-panel twins
- useDetailStackCollapse serves the RIGHT edge only. It must NEVER be generalized to also
  drive ContextPanelLayout / CONTEXT_PANEL_COLLAPSE. Two edges, two hooks, two keys,
  two components — §2.9 is the law and it is guarded.
- Collapse key is namespaced per occupant family (§2.9), NOT one global boolean
- Mirror GlobalHeader icon tokens from src/components/layout/header-shell.ts
- Attach to :3050; never start/restart/kill the server; user owns commits
- npm run verify before done; never raise ratchet baselines
```

### Session 2 — Category A conversions (only after Session 1 lands)

```
Read docs/todo/right-rail-inspector-contract-CLAUDE-CODE-PROMPT.md §2.6, §4 Phase 2,
§4 Phase 3-4 and .claude/rules/display/right-rail-inspector.md.

Convert Category A overlays to non-modal RightRailHost occupants, ONE per commit slice.

GATE — a create/edit form may not be converted until it satisfies §2.6:
either it autosaves per field, or it registers a dirty-guard that blocks/prompts on
occupant swap. A half-typed form that vanishes on a stray row click is a data-loss bug,
not a layout improvement. If a form does neither, leave it as a Dialog and ticket it.

Leave Category B as Dialog/AlertDialog/ceremony sheets; resolve Category C with the
decision table in §4 Phase 4. Do not invent a third right-edge grammar.
Do not force the Desk rail onto Scan Station middle columns; Unbox Claim stays station push.
```

---

## 0. One-sentence goal

**One floating inspector shell for the whole product:** shared header (identity · icon actions · collapse · close), `RightRailHost` as the only wrapper, and every record/form/print “modal” that needs collection context converted into that rail — then delete the twins.

---

## 1. Industry contract (why this shape)

Research consensus (SaaSUI, Onething Design, NN/g-adjacent modal guidance, Figma/VS Code/Linear inspectors, Evil Martians properties panels):

| Pattern | Blocks background? | Keeps list context? | Use for |
|---|---|---|---|
| **Modal / Dialog** | Yes | No | Short confirm, destructive, auth, must-finish-before-continue |
| **Non-modal right inspector / drawer** | No | Yes | Record detail, multi-field edit, print form, pairing, while table stays visible |
| **Inline / in-cell** | No | Yes | Tiny scalar edits |
| **Full page** | N/A | No | Deep multi-step journeys that outgrow a panel |

**Rules we encode as house law:**

1. If the operator must **see the table/queue while editing**, it is a **right inspector** — never a blocking Dialog.  
2. If the task is **confirm / destroy / auth / ceremony reason-pick**, keep **Dialog / AlertDialog / BottomSheet**.  
3. Inspectors show **only selection-relevant content** (Figma-style smart inspector) — scrollable body, sticky header.  
4. **Header chrome is stable** — collapse and close always live in the same corner so muscle memory matches GlobalHeader’s icon cluster.  
5. Floating inset card (house already) — elevation reserved for float surfaces; body stays flat form density (`ops`).  
6. **A record peek is addressable** — Linear `?peek=`, Airtable `/rec…`, Jira issue key. Deep-linkable, Back-closable, shareable, or it is a popover wearing inspector chrome (§2.7).  
7. **Non-modal buys clickability, and owes a dirty contract for it** — the scrim was the thing preventing mid-edit navigation; removing it without autosave-or-guard is a regression, not a simplification (§2.6).  
8. **Where we knowingly diverge:** none of Figma / Linear / Airtable / Notion ships a Collapse control beside Close — they ship Close only, and hide the panel from global chrome or a shortcut. Our Collapse is a **house choice** justified by dense ops grids that genuinely need the row underneath; it is therefore rendered subordinate to Close and scoped per surface (§2.9), not asserted as an industry pattern.

---

## 2. Locked right-panel display contract

### 2.1 Shell (already mostly SoT — harden, don’t fork)

```text
RightRailHost  ← THE wrapper (one occupant = getRightRailTop())
  ├── optional backdrop (modal only) / invisible dismiss layer (non-modal opt-in)
  ├── aside card (DETAIL_STACK_LAYOUT inset · resize · collapse)
  │     ├── HorizontalEdgeResizeHandle (leading) — resize + edge collapse chevron
  │     └── occupant node
  │           └── RightRailInspectorHeader   ← MUST ship / become mandatory
  │           └── scroll body (form / facts / print preview / thread)
  │           └── optional footer dock (primary CTA / StationComposerDock embed)
  └── collapsed expand strip (DETAIL_STACK_COLLAPSE) when parked
```

**Tokens (do not twin):**  
`src/design-system/shells/detail-stack/layout.ts` → `DETAIL_STACK_LAYOUT` · `DETAIL_STACK_RESIZE` · `DETAIL_STACK_COLLAPSE`  
Host: `src/components/right-rail/RightRailHost.tsx`  
Store: `src/lib/right-rail/store.ts`  
Register: `DetailStackRailRegistrar` / `useRegisterRightPanel`

**Modality default for record peeks:** `modal={false}` (role=`region`, no scrim, resize+collapse, collection stays live).  
**Modal rail** reserved for rare elevated flows (`elevated` + optional `closeOnOutsideClick` — today `detail:receiving` only). Prefer Dialog for true blocking work.

### 2.2 Header anatomy (NEW SoT — the missing piece)

```text
┌──────────────────────────────────────────────────────────────┐
│ LEFT identity                        RIGHT chrome (fixed)    │
│ [icon badge] Title                   [icon actions …] [∨] [×]│
│              optional subtitle       ↑ GlobalHeader grammar  │
│                                      Collapse     Close      │
│                                      ALWAYS top-right order  │
└──────────────────────────────────────────────────────────────┘
 optional belowSlot: tabs / filter chips (PaneHeader belowSlot)
```

**Hard Always**

| Control | Placement | Behavior |
|---|---|---|
| **Collapse** | Header **top-right**, immediately **left of Close** — **visually subordinate** to Close (chevron weight, not a second X-equal) | Toggles the **namespaced** collapse key via `useDetailStackCollapse(family)` (§2.9) — **same** state as edge-grip `onCollapse` / expand strip. Tooltip: “Hide details”. `data-testid="detail-inspector-collapse-header"`. **Not** an industry-standard control (Figma / Linear / Airtable / Notion peek ship Close only) — it is a house choice, so it must not read as a second Close. See §2.9 for why it is scoped rather than global. |
| **Close** | Header **far top-right** (last control) | Calls registrant `onClose`. Required for every non-modal record inspector (Escape alone is not enough). Compose `PaneHeaderCloseButton` or IconButton X with HoverTooltip. |
| **Icon actions** | Header right cluster **left of Collapse** | Exact GlobalHeader grammar: `HEADER_ICON_CLUSTER` + `HEADER_ICON_WRAP` + `IconButton size="md"` + `HEADER_ICON_BTN_CLASS` (+ `OPEN` when toggled) + `TOP_CHROME_ICON_GLYPH` (`h-4 w-4`) + `HoverTooltip`. Optional hairline (`HEADER_CLUSTER_HAIRLINE`) between identity and actions. Popovers via `AnchoredLayer`. |
| **Identity** | Header left | Badge + title (+ optional subtitle). Truncate with tooltip. |

**Hard Never**

- Collapse only on the edge grip with **no** header twin (edge grip may remain as secondary; header Collapse is mandatory for discoverability).  
- **Collapse styled as a peer of Close.** Two identical-weight dismissals side by side is the misclick this control is most likely to cause — the operator cannot tell which one is remembered.  
- Page-local close X in body or footer as the only dismiss.  
- A **React-only** collapse that desyncs from `RightRailHost`, or a page-local `useLocalStorage` twin of the collapse key.  
- **Reusing the LEFT context-rail collapse hook / key for the right edge** (or generalizing one hook to serve both) — §2.9.  
- Text action buttons that ignore `header-shell` tokens.  
- Putting lifecycle tabs in the icon strip (tabs = `belowSlot` / `PaneHeaderTabs`).

**Component to ship**

```
src/components/ui/pane-header/RightRailInspectorHeader.tsx
src/components/right-rail/useDetailStackCollapse.ts   # sync with host LS / tiny store
export from src/components/ui/pane-header/index.ts
```

API sketch (implementer may refine, not fork):

```ts
<RightRailInspectorHeader
  identity={{ icon, title, subtitle?, onTitleClick? }}
  actions={<InspectorIconAction … />[]}   // or ReactNode cluster
  onClose={() => …}                       // required when modal={false}
  showCollapse                             // default true for non-modal
  belowSlot={tabs?}
/>
```

`useDetailStackCollapse` must be the **single** read/write path for the right-edge collapsed
boolean that `RightRailHost` also uses — today the host holds it privately at
[`RightRailHost.tsx:101`](../../src/components/right-rail/RightRailHost.tsx). Lift the host onto
the hook (or have the hook subscribe to the same key the host reads) so there is one SoT.

**Two constraints on that hook, both non-negotiable — see §2.9:**
1. It is **right-edge only**. It never grows a `side`/`edge` parameter to also serve
   `ContextPanelLayout`.
2. Its key is **namespaced per occupant family**, not one global boolean.

### 2.3 Body + footer

- Body: `flex-1 min-h-0 overflow-y-auto` — scrollable form / fact stack / print preview / thread.  
- Footer (optional): primary CTA band or embedded `StationComposerDock` / `StationTerminalDock` — never a second sticky header.  
- Density: `ops` for Desk forms; Station push columns keep floor density.

### 2.4 Occupancy ids (stable)

Stable ids enable queue walk without remount thrash:

| Pattern | Example |
|---|---|
| Record | `detail:order`, `detail:incoming`, `detail:my-day`, `detail:claim` |
| Create | `detail:new-order`, `detail:support-create`, `detail:label-print` |
| Tool | `detail:receiving-audit`, `detail:photo-note` |
| Selection occupancy | `selection-occupancy.ts` → inspect / compare / batch |

Do not mint random ids per open; reuse the table in `src/lib/right-rail/`.

### 2.5 Two right-edge grammars (unchanged)

1. **Float** — `RightRailHost` (this contract).  
2. **Station push** — `UnboxPushColumn` (Displays / Ticket / Claim / tool).  

**No third.** Private flyouts, `RightPaneOverlay` as a permanent detail home, and ambient always-on right regions are banned.

---

### 2.6 Dirty state on occupant swap (AMENDMENT — gates every Category A conversion)

**The whole point of `modal={false}` is that the grid stays clickable. That is also the hazard.**
A blocking Dialog physically prevented the operator from clicking a sibling row mid-edit.
Convert it to a float and that protection is gone — so a half-typed **new ticket / new plan /
new claim** disappears on one stray row click, silently, with no scrim to explain why.

This is not hypothetical: [`motion-crossfade.md`](../../.claude/rules/display/motion-crossfade.md)
already ships the rule for `detail:order` — a stable-id swap requires *"dirty draft flushed for
the OUTGOING record"* — but that precondition was never carried into the conversion backlog,
and §4 Phase 2 converts **five create forms**.

**Every non-modal occupant that owns editable state must declare exactly ONE of:**

| Strategy | Shape | Use for |
|---|---|---|
| **Autosave** | Each field commits on blur / debounce; there is no draft to lose | Record edit on an existing row (order, incoming, claim) |
| **Dirty guard** | Occupant registers `isDirty()`; the store blocks the swap and prompts discard/keep | Create forms, multi-field wizards, anything with no row to save onto |

**Hard Always**

- The **store**, not the panel, enforces it — a check inside the outgoing panel's unmount has
  already lost the race. Gate in `src/lib/right-rail/store.ts` at push/replace time.
- **Navigating without editing must write nothing.** A flush that fires on a clean swap will
  eventually stamp one record's field onto another. Guard it with a test.
- Full re-seed on record change: every editable field re-reads from the incoming record and
  transient view state (open tab, open sub-form) resets.

**Hard Never**

- Convert a create form to the rail with neither strategy. **Leave it a Dialog and ticket it** —
  a modal that annoys is strictly better than a rail that eats work.
- Silent discard. If a draft is dropped, the operator is told.

### 2.7 Addressability + focus (AMENDMENT — what makes it an inspector, not a popover)

Occupancy ids (§2.4) are an internal store concept. Industry treats a record peek as
**addressable** — Linear `?peek=`, Airtable `/rec…`, Jira issue key, Salesforce record id — and
[`workbench.md`](../../.claude/rules/display/workbench.md) already makes Workbench selection
URL-durable. The inspector contract must say so out loud.

**URL**

- Opening a **record** inspector writes the selection to `searchParams` (`router.replace`);
  Close clears it. A reload lands on the same open inspector; the link is shareable.
- **Browser Back closes the inspector** before leaving the route.
- Applies to record peeks. Ephemeral **tool** occupants (`detail:photo-note`,
  `detail:receiving-audit`) and sync/progress shells stay out of the URL.

**Focus + keyboard** — the hard part of non-modal, and the part everyone ships wrong:

| Question | Contract |
|---|---|
| Focus on open | Stays in the collection (the operator is still walking rows). The panel is reachable by <kbd>Tab</kbd> from the focused row. |
| Focus on Close | **Returns to the originating row.** WCAG 2.4.3 — non-negotiable; a dismissed panel must not drop focus to `<body>`. |
| Escape | Innermost overlay wins, via `src/lib/overlay-stack/store.ts` — never a private capture-phase listener. An open cell popover owns Escape *before* the inspector does. |
| Queue walk | `j`/`k` / arrow row-stepping keeps working while the panel is open; the panel swaps content in place (§2.4 stable ids). |
| Content swap | Because the stable-id swap changes content **without a remount**, a screen reader is told nothing. The panel body needs `aria-live="polite"` (or an explicit focus/heading update) on record change. |
| Tab order | The panel follows the collection in DOM order. No focus trap — the host has never installed one and `role="region"` is the honest markup. |

### 2.8 Responsive floor (AMENDMENT)

The float is specified at desktop width only. Below the point where the grid's own minimum
content width plus the panel exceeds the viewport, a float stops being non-blocking — it just
occludes the collection it exists to keep visible. Airtable and Linear both switch to
full-screen; `UnboxPushColumn` already ships narrow-viewport overlay behavior. The rail must too.

- Declare a **breakpoint** below which the occupant renders as a full-width overlay/sheet
  (retaining Close, dropping resize + collapse — neither means anything at full width).
- Declare the **grid's min content width** the resize cap is derived from. The width cap is
  already derived, not taste (`source-of-truth.md` → non-modal resize); write the input down.
- On phone, the existing bottom-sheet grammar stays (§4 Phase 3) — do not convert mobile sheets.

### 2.9 Collapse ownership — right edge and left rail are SEPARATE (AMENDMENT)

Two collapsible edges exist and they are **different components, different hooks, different
keys, different strips**. They already are in code — keep it that way:

| | **Left context rail** | **Right inspector** |
|---|---|---|
| Component | `ContextPanelLayout` | `RightRailHost` + `RightRailInspectorHeader` |
| Token | `CONTEXT_PANEL_COLLAPSE` (`src/components/sidebar/context-panel-column.ts`) | `DETAIL_STACK_COLLAPSE` (`src/design-system/shells/detail-stack/layout.ts`) |
| Key | `context-panel-collapsed` | `detail-inspector-collapsed*` |
| Hook | its own `useLocalStorage` in `ContextPanelLayout.tsx:87` | **`useDetailStackCollapse`** |
| Strip | `CONTEXT_PANEL_COLLAPSE_STRIP_CLASS` | `detailStackCollapseStripClassName` |
| Guard | `context-panel-collapse.guard.test.ts` | *(new — ship with Phase 1)* |

**Hard Never — do not "unify" these.** They share a *pattern* (`useLocalStorage` +
`HorizontalEdgeResizeHandle onCollapse`), not a *job*: the left rail is a **navigator** the
operator parks to widen the workspace; the right inspector is a **record peek** parked to see
the row underneath. A single `usePanelCollapse({ side })` would let a left-rail change silently
restyle every record inspector in the product, and is exactly the shared-primitive-for-two-jobs
fork [`pattern-evolution.md`](../../.claude/rules/pattern-evolution.md) bans. `useDetailStackCollapse`
takes **no `side` / `edge` parameter, ever.**

**Hard Always — namespace the right-edge key per occupant family.** Today
[`RightRailHost.tsx:101`](../../src/components/right-rail/RightRailHost.tsx) reads **one global**
`detail-inspector-collapsed`. Consequence: collapse the order inspector on `/dashboard`, walk to
Incoming, click a row — the inspector opens **already parked as a strip**, on a surface where the
operator never collapsed anything. That reads as broken. The original "one key" law would have
made it permanent.

```ts
// useDetailStackCollapse(family) → `detail-inspector-collapsed:${family}`
//   'order' | 'incoming' | 'claim' | 'sku' | 'support' | 'tool' | …
// Migration: the bare legacy key is read once as the seed for an unset family, then retired.
```

One key **per family**, shared by the header control, the edge grip, and the expand strip —
so those three never disagree, and one surface's parked state never leaks onto another's.

---

## 3. Current codebase evidence (2026-08-01)

### 3.1 What already works

- `RightRailHost` is mounted once; store owns stack; most detail panels already pass `modal={false}`.  
- Resize + edge collapse + expand strip exist (`DETAIL_STACK_*`).  
- Occupants: order, order-batch, my-day, incoming, claim, unfound, fba-plan, sku, support-context, new-order, sync overlays, receiving tools, etc.

### 3.2 Gaps

| Gap | Detail |
|---|---|
| **No shared inspector header** | Each panel forks `PaneHeader` / ad-hoc flex; Collapse is **edge-only**, not header top-right |
| **Close inconsistent** | Some panels omit explicit Close (Escape-only); violates non-modal honesty |
| **`modal` store default `true`** | Law wants non-modal record peeks — opt-out required everywhere; consider flipping default later with audit |
| **`RightPaneOverlay` twin** | Still hosts create-ticket, claims, label editors, document slide-overs, photo upload |
| **Private fixed panels** | e.g. `SkuPairingModal` (`createPortal` + `fixed inset-0`), `BinDetailFlyout` |
| **No `display/right-rail-inspector.md`** | Contract not written as child of contextual-display |
| **Collapse key is global** | `RightRailHost.tsx:101` reads one `detail-inspector-collapsed` — a surface's parked state leaks onto every other inspector (§2.9) |
| **No dirty-state contract** | Nothing stops an occupant swap from discarding a half-typed create form; blocks Category A (§2.6) |
| **Inspector not in the URL** | Occupancy ids are store-internal; no deep link, no Back-to-close, no shareable peek (§2.7) |
| **No focus-return / `aria-live`** | Close drops focus to `<body>`; stable-id swap changes content with no remount, so SR users get silence (§2.7) |
| **No responsive floor** | No breakpoint where the float becomes a full-width overlay (§2.8) |

### 3.3 GlobalHeader mirror tokens

```
src/components/layout/header-shell.ts
  HEADER_ICON_CLUSTER
  HEADER_ICON_WRAP
  HEADER_ICON_BTN_CLASS
  HEADER_ICON_BTN_OPEN_CLASS
  HEADER_CLUSTER_HAIRLINE
  TOP_CHROME_ICON_GLYPH
src/components/layout/GlobalHeader.tsx
src/components/layout/GlobalHeaderActions.tsx
```

---

## 4. Execution phases

### Phase 0 — Contract docs (SoT first)

1. Create `.claude/rules/display/right-rail-inspector.md` with §2 of this prompt — shell, header, body, modality, occupancy, anti-mix, **plus the amendments §2.6 dirty state · §2.7 addressability + focus · §2.8 responsive floor · §2.9 collapse ownership**. The amendments are the load-bearing half; a contract without them describes a layout, not an inspector.  
2. Link it from `.claude/rules/contextual-display.md` index + `.claude/rules/source-of-truth.md` waist rows:  
   - Right inspector header → `RightRailInspectorHeader`  
   - Right-edge collapse → `DETAIL_STACK_COLLAPSE` + `useDetailStackCollapse` (**right edge only** — the row must name `CONTEXT_PANEL_COLLAPSE` as the separate left-rail answer so a reader never reaches for the wrong one)  
   - Inspector dirty state → §2.6 strategy declared per occupant  
3. Cross-link Desk recipe: middle select / Add CTA → opens this inspector.

### Phase 1 — Ship the header SoT

1. Implement `useDetailStackCollapse(family)` and lift `RightRailHost` off its private `useLocalStorage` (`RightRailHost.tsx:101`) onto it. **Namespaced key per §2.9**; seed each family once from the legacy bare key, then retire it.  
2. Implement `RightRailInspectorHeader` (+ thin `InspectorIconAction` helper). Collapse renders **subordinate** to Close, not as its twin.  
3. Wire §2.7: focus returns to the originating row on Close; `aria-live` on the body for stable-id record swaps; Escape via `overlay-stack`.  
4. Guards (all three, shrink-only where applicable):  
   - every `modal={false}` detail occupant composes `RightRailInspectorHeader` (allowlist assistant + sync progress shells);  
   - **`useDetailStackCollapse` accepts no `side`/`edge` param and is imported by nothing under `src/components/sidebar/`** — the left/right separation is mechanically enforced, mirroring the existing `context-panel-collapse.guard.test.ts`;  
   - no page-local `useLocalStorage` on either collapse key.  
5. Migrate first wave headers onto it:  
   - `IncomingDetailsPanel`  
   - `MyDayTaskInspector`  
   - `ShippedDetailsPanel` / order identity header  
   - `RepairDetailsPanel` / `UnfoundQueueDetailsPanel` / `FbaBoardDetailPanel` / `SupportContextDetailPanel`  
6. Verify: header Collapse and edge grip stay in sync; expand strip works; **collapsing on `/dashboard` does not open the Incoming inspector collapsed**; left context rail collapse is untouched by all of it.

**Phase 1 gate — stop here in Session 1.** `npm run verify` green + the three guards + a work-log line, before any Category A file is opened.

### Phase 2 — Convert Category A → RightRailHost

For each item: extract form body → **declare its §2.6 dirty strategy** → register `detail:*` with `modal={false}` → `RightRailInspectorHeader` → delete Dialog/`RightPaneOverlay`/private portal wrapper.

> **Conversion gate (§2.6).** A form with neither autosave nor a registered dirty guard **stays a
> Dialog** and gets a follow-up ticket. Converting it anyway trades a modal that annoys for a rail
> that eats typed work — a strictly worse surface. The five create forms below (`SupportCreateTicketModal`,
> `AddOrPairSkuModal`, `FbaCreatePlanModal`, `WarrantyLogClaimDialog`, `ZendeskClaimModal`) are the
> ones this gate is written for.
>
> **One conversion per commit slice.** This table is a backlog, not a checklist to clear in a pass.

**A — Must convert (keep collection context)**

| Component | Path | Notes |
|---|---|---|
| `SupportCreateTicketModal` | `src/components/support/station/SupportCreateTicketModal.tsx` | → `detail:support-create` |
| `StnTicketLinkModal` | `src/components/support/link/StnTicketLinkModal.tsx` | link form rail |
| `TicketStnLinkPopover` | `src/components/support/link/TicketStnLinkPopover.tsx` | if multi-field |
| `ZendeskClaimModal` | `src/components/support/zendesk/claim/ZendeskClaimModal.tsx` | Desk claim form (not Unbox push) |
| Support ticket focus-as-middle | Support tickets Desk migrate (desk prompt) | open as `detail:support-ticket` |
| `SkuPairingModal` | `src/components/products/pairing/SkuPairingModal.tsx` | **priority** — private portal |
| `AddOrPairSkuModal` | `src/components/products/pairing/AddOrPairSkuModal.tsx` | Add CTA → rail |
| Manual CRUD dialogs | `src/components/manuals/manual-crud/*` | upload/edit → rail; viewer on select |
| Product label editors | `ProductLabelEditPopover`, `AsListedEditPopover` | multi-field → rail |
| Product labels print form | Labels Desk migrate | Add / row → rail print form |
| `BinDetailFlyout` | `src/components/warehouse/BinDetailFlyout.tsx` | → locations inspector |
| Bin / warehouse label printer | `BinLabelPrinter` as middle wizard | → rail form (desk prompt) |
| Location sheets on desktop | `BinRowDetailsSheet`, `BinAddSkuSheet`, … under `src/components/sku/` | Desk → rail; keep sheet on phone if needed |
| `ShippingInfoEditModal` | shipped details | prefer section inside order rail |
| `PhotoUploadOverlay` | shipped photo gallery | upload rail or keep lightbox sibling |
| FBA create / quick-add modals | `src/components/fba/FbaCreatePlanModal.tsx` etc. | board already has `detail:fba-plan` |
| Receiving multi-field overlays | `LabelEditPopover`, `CatalogManagerPopover`, `UnitSlotsManageOverlay` | prefer rail when multi-field |
| `WarrantyLogClaimDialog` | warranty | create claim → rail on warranty grid |
| `SkuGraphCrudModal` | inventory graph | inspector secondary |

### Phase 3 — Category B stay modal (do not convert)

| Keep | Path / API | Why |
|---|---|---|
| `requestConfirm` / `ConfirmDialogHost` / `AlertDialog` | design-system | destructive / irreversible |
| Auth / PIN / staff switch / BootGate | `components/auth`, admin access | blocking |
| `ReceivingQaFailSheet` / policy override | receiving | must pick reason — ceremony |
| `PhotoViewerModal` / portal | photo gallery | fullscreen media |
| Mobile action sheets | `components/mobile/**` | phone grammar |
| Unbox Claim / Ticket / Displays | `UnboxPushColumn` family | station push grammar |

### Phase 4 — Category C decision table (resolve, don’t stall)

| Item | Default verdict (unless user overrides) |
|---|---|
| `DocumentSlideOver` / labels PDF | **Convert** to non-modal rail (or nested section inside labels order rail) — keep collection visible |
| `PreboxWizard` | **Keep Dialog/wizard** if truly blocking multi-step; else stepped rail |
| `BulkFlagDialog` / `BulkShipByDialog` | Prefer fold into `detail:order-batch` rail body; else keep short Dialog |
| `ExpandableComposerField` tall editor | Prefer docked composer / rail body, not centered modal |
| `MediaLibraryPickerModal` | Keep overlay picker if ephemeral select; else rail |
| `CartonAddPopover` | Small popover OK; multi-field → rail |
| Label printer `ConfigSheet` | Tiny settings → BottomSheet/popover OK |
| Block palette / studio sheets | Out of Desk scope — leave |

### Phase 5 — Delete twins + guards

1. Grep ban (shrink-only guard): new `fixed right-0 z-panel` / `RightPaneOverlay` for **detail/create/edit** call sites outside allowlist.  
2. Require `RightRailInspectorHeader` on non-modal detail registrars.  
3. knip dead `*Modal.tsx` shells after conversion.  
4. Update desk-contract prompt surfaces to open this headered rail on select/Add.

### Phase 6 — Verify

```bash
npm run verify
```

E2E: open order/incoming/my-day inspector → header Collapse parks strip → Expand restores; Close clears selection; Converted pairing/create-ticket opens as non-modal rail beside grid.

---

## 5. Decision algorithm (agents use this per overlay)

```ts
function pickChrome(flow) {
  if (flow.isConfirmOrDestructiveOrAuth) return 'dialog';          // Category B
  if (flow.isStationPushColumn) return 'unbox-push';               // grammar 2
  if (flow.needsCollectionContext || flow.isRecordFormOrPrintOrPair)
    return 'right-rail';                                           // Category A — THIS SoT
  if (flow.isFullscreenMedia) return 'lightbox';
  if (flow.isPhoneSheet) return 'bottom-sheet';
  return 'ask';                                                    // Category C
}
```

---

## 6. Simplification mandate

Success = **one header component**, **one host**, **fewer Modal/Overlay files**.

After this work:

- Operators always find **Collapse** and **Close** in the same header corner.  
- Icon actions in the inspector match GlobalHeader muscle memory.  
- Desk Add / row-select always opens `RightRailHost`, never a centered Dialog.  
- `RightPaneOverlay` remains only for ephemeral non-detail overlays on the allowlist (or is retired).  
- No `SkuPairingModal`-style private portals.

---

## 7. Anti-goals

- Do not rebuild an ambient always-on right region.  
- Do not put Collapse only in the header and remove edge resize (keep both; one state per family).  
- **Do not merge the left-rail and right-inspector collapse into one hook, key, or component** (§2.9) — two edges, two jobs.  
- **Do not convert a create form that has neither autosave nor a dirty guard** (§2.6).  
- Do not convert QA-fail / confirm / auth to the rail.  
- Do not move Unbox Claim onto RightRailHost.  
- Do not invent a second detail-stack token file.  
- Do not install a focus trap to "fix" the non-modal panel — `role="region"` is the honest markup.  
- Do not start the Next server.  
- Do not commit unless asked.

---

## 8. Definition of done

### Session 1 (contract + header SoT)

- [ ] `display/right-rail-inspector.md` exists, **carries §2.6–§2.9**, and is linked from SoT / contextual-display  
- [ ] `RightRailInspectorHeader` + `useDetailStackCollapse(family)` shipped and used by wave-1 panels  
- [ ] Collapse present top-right (left of Close) and **visually subordinate** to it  
- [ ] Collapse key **namespaced per family** — collapsing one surface's inspector does not park another's  
- [ ] `RightRailHost` reads collapse through the hook; no private `useLocalStorage` twin remains  
- [ ] **Left rail untouched:** `ContextPanelLayout` / `CONTEXT_PANEL_COLLAPSE` unchanged, and a guard proves `useDetailStackCollapse` is right-edge-only (no `side` param, no sidebar importer)  
- [ ] Close returns focus to the originating row; `aria-live` announces stable-id record swaps; Escape resolves via `overlay-stack`  
- [ ] Record inspectors are URL-addressable — deep link opens, Back closes (§2.7)  
- [ ] Responsive breakpoint declared and honored (§2.8)  
- [ ] Icon actions use `header-shell` tokens  
- [ ] Guards prevent new header forks / private right panels / cross-edge collapse reuse  
- [ ] `npm run verify` green  
- [ ] Work-log line in `docs/agent-log/entries/main.md`

### Session 2 (conversions)

- [ ] Every converted occupant declares an explicit §2.6 dirty strategy (autosave **or** guard)  
- [ ] A create form with neither is **left as a Dialog** and ticketed with its file path  
- [ ] Store-level swap gate proven by test: dirty swap prompts; **clean swap writes nothing**  
- [ ] Category A items each done in their own slice, or ticketed with file paths in a follow-up handoff  
- [ ] `SkuPairingModal` private portal and `BinDetailFlyout` private flyout gone or allowlisted with removal date  
- [ ] `npm run verify` green

---

## 9. Suggested commit slices (if user asks)

**Session 1**

1. Docs: `right-rail-inspector.md` (incl. §2.6–§2.9) + SoT links  
2. `useDetailStackCollapse(family)` + host sync + namespace migration + right-edge-only guard  
3. `RightRailInspectorHeader` + `InspectorIconAction` + header-fork guard  
4. §2.7 wiring: URL addressability, focus return, `aria-live`, `overlay-stack` Escape  
5. Migrate existing rail occupants onto the shared header

**Session 2** — one slice each, dirty strategy declared per slice

6. Store-level §2.6 swap gate + tests (dirty prompts, clean writes nothing)  
7. `SkuPairingModal` (private portal — highest-pain twin, and it is an *edit* surface so autosave fits)  
8. Support create ticket (**needs a dirty guard first** — pure create form)  
9. Warehouse flyout + manuals CRUD  
10. Remaining Category A / Category C verdicts  

---

## 10. File index

```
# Host / store / tokens
src/components/right-rail/RightRailHost.tsx
src/components/right-rail/DetailStackRailRegistrar.tsx
src/components/right-rail/useRegisterRightPanel.ts
src/lib/right-rail/store.ts
src/lib/right-rail/selection-occupancy.ts
src/design-system/shells/detail-stack/layout.ts
src/design-system/components/HorizontalEdgeResizeHandle.tsx

# Header SoT to ship
src/components/ui/pane-header/          # extend (PaneHeader = leftSlot/rightSlot/belowSlot)
src/components/layout/header-shell.ts   # mirror tokens

# LEFT rail — SEPARATE edge, do NOT merge or reuse (§2.9). Read-only reference.
src/components/sidebar/ContextPanelLayout.tsx          # its own useLocalStorage, line ~87
src/components/sidebar/context-panel-column.ts         # CONTEXT_PANEL_COLLAPSE / _RESIZE
src/components/sidebar/context-panel-collapse.guard.test.ts  # pattern for the right-edge guard

# Keyboard / overlay
src/lib/overlay-stack/store.ts          # Escape ownership — inspector binds here

# Twin shells to shrink
src/components/ui/RightPaneOverlay.tsx
src/design-system/components/DocumentSlideOver.tsx
src/components/products/pairing/SkuPairingModal.tsx
src/components/warehouse/BinDetailFlyout.tsx

# Law
.claude/rules/source-of-truth.md
.claude/rules/display/workbench.md
.claude/rules/contextual-display.md
docs/todo/desk-contract-unification-CLAUDE-CODE-PROMPT.md
```

---

## 11. User acceptance language

> There must be a detailed contract and source of truth for building the right panel pushover display. The header must have a collapse on the top right to collapse the sidebar button, so it's always in one place, and it must have a little header in that same header that will always display just for exact icons to actions, just like how the global header has icons to actions.

> Create a prompt for cloud code to identify different modals that must be converted to a right details panel and upgrading the right details panel to be a main wrapper and SoT throughout the entire system.

Treat Collapse+Close+icon cluster as acceptance tests on every non-modal inspector; treat Category A as the conversion backlog.

**How the amendments honor this (2026-08-01).** Both asks ship as stated — Collapse is in the
header, always the same corner; the icon-action cluster mirrors GlobalHeader exactly. Two
qualifications were added on the evidence, not on taste:

- **Collapse renders subordinate to Close** (§2.2). Two identical-weight dismissals side by side
  is the misclick this control invites — the operator cannot tell which one is remembered. Same
  corner, same place, every time; just not a second X.
- **Its state is scoped per surface family, not one global boolean** (§2.9). The literal "always in
  one place, one key" reading is already live at `RightRailHost.tsx:101`, and it means collapsing
  the order inspector opens the *Incoming* inspector pre-parked. The control stays in one place;
  the memory stops leaking across surfaces.

And the right-edge collapse stays a **separate component and hook from the left context rail** —
same corner grammar, different job, no shared hook (§2.9).
