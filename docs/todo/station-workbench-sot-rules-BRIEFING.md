# Briefing — Station Workbench SoT rules + CI (for Gemini Pro)

> **Audience:** Gemini Pro (or any agent) tasked with authoring **hard SoT rules** and **CI ratchet guards** so Unbox-family stations port without alignment drift.  
> **Date:** 2026-07-23  
> **Lane:** `main` / WS-DOGFOOD  
> **Do not implement the station ports in this briefing’s first pass** — deliver rules + guard tests + rule docs that make the next port mechanically safe.

---

## 1. Mission

Unbox right-pane (`LineEditPanel`) is the **golden Station Workbench**. Sibling stations partially adopted the same chrome, but:

1. Soft docs exist; **mechanical enforcement does not**.
2. **Column geometry drifts** (`max-w-[720px]` SoT vs live `max-w-3xl` clones).
3. **Panel root + ambient wash are copy-pasted**, not a shared waist.
4. Terminal / mode registries are **incomplete** for Labels, Support, Review, Packing.
5. Shipping’s host still uses a **pre-Unbox shell** (`PaneHeader` + `max-w-3xl`).

**Your job:** turn the Unbox anatomy into **hard SoT** (rules that agents must load + CI that fails on drift) so ports to Triage/Testing/Shipping/Pack/Pickup/Support/Labels/Repair/Review cannot invent a second layout language.

**Out of scope for the first Gemini pass (unless free):** rewriting Shipping/Repair panels themselves. Prefer: seal SoT + guards first; list port PRs as follow-ups.

---

## 2. Product / house constraints (non-negotiable)

Cycle Forge = multi-tenant reseller-ops SaaS (Kinetic Ledger). Read before writing rules:

| Doc | Why |
|---|---|
| `AGENTS.md` | Compose → grow SoT; never fork for same job; ratchet baselines only shrink |
| `.claude/rules/display/station-workbench.md` | Current soft anatomy (must harden, not replace with a foreign system) |
| `.claude/rules/display/station.md` | Station region contract (scan vs pointer) |
| `.claude/rules/source-of-truth.md` § Station entity-context | CartonContextCard / StationContextBar waist |
| `.cursor/rules/verify-before-done.mdc` | `npm run verify` = CI mirror; DS ratchets never raise |

**Pattern:** Prefer **census ratchet guards** (like `src/components/ui/raw-button.guard.test.ts`) over prose-only rules. Escape hatches must be same-line markers (e.g. `ds-station-panel-root`) — never raise baselines.

**CI path today:** `.github/workflows/ci.yml` → unit tests (includes `*.guard.test.ts`) via `npm run verify`. New guards must run under that gate (no separate workflow required unless you add a focused `test:station-workbench-guard` script for inner loop).

---

## 3. Golden reference (Unbox)

**File:** `src/components/receiving/workspace/LineEditPanel.tsx`  
**Export:** `LineEditPanel`

### Required vertical anatomy (top → bottom)

```
Panel root (relative flex h-full min-h-0 flex-col bg-surface-canvas + ambient wash)
├── StationContextBar
│   ├── identity: CartonContextCard via thin adapter, density="bar"
│   └── moreDetails: StationMoreDetails → StationHeaderToolbar (embedded)
├── StationWorkbench  (ambientWash=false when wash is on panel root)
│   ├── scroll: tabs → feedback  (NO identity in entityContext/toolbar for Unbox-family)
│   ├── footer (optional)
│   └── dock: StationTerminalDock ← useStationTerminalAction + STATION_TERMINAL_REGISTRY
└── overlays (photo peek, modals) — around, not inside StationWorkbench
```

### Geometry SoT (alignment law)

**File:** `src/components/station/workbench/workbench-layout.ts`

| Token | Value | Use |
|---|---|---|
| `STATION_WORKBENCH_COLUMN` | `mx-auto w-full min-w-0 max-w-[720px]` | Max width only |
| `STATION_WORKBENCH_BODY_PAD_X` | `px-4 sm:px-6` | Horizontal inset for **identity + body** |
| `STATION_WORKBENCH_IDENTITY_COLUMN` | column + body pad | Used by `StationContextBar` |
| `STATION_WORKBENCH_BODY_DOCKED` | column + pad + `py-5 pb-6` | Docked terminal body |
| `STATION_WORKBENCH_HEADER_COLUMN` | column + **`px-6 sm:px-8`** | ⚠️ Different pad — skeleton/stepper only; **do not use for Unbox-family identity/body** |

**Identity edges must match tab/card edges.** That only works when both use `STATION_WORKBENCH_IDENTITY_COLUMN` / body pad — not `max-w-3xl` (768px) and not header pad.

### Named barrels (import these, never fork)

```ts
import {
  StationWorkbench,
  buildSectionTabs,
  WorkspaceTimelineTab,
  STATION_WORKBENCH_COLUMN,
  // …
} from '@/components/station/workbench';

import {
  CartonContextCard,
  StationContextBar,
  StationMoreDetails,
  StationHeaderToolbar,
  StationRightEdgeAction,
} from '@/components/station/entity-context';

import {
  StationTerminalDock,
  useStationTerminalAction,
} from '@/components/station/terminal';
```

Terminal registry: `src/lib/station-terminal/registry.ts`  
Mode chrome (header actions): `src/components/station/entity-context/workspace-mode-registry.ts` — **today only `unbox | triage | testing`**.

---

## 4. Deep-scan comparison matrix (2026-07-23)

### 4.1 Adopter scorecard

Legend: ✅ matches Unbox · ⚠️ partial · ❌ missing / divergent

| Station | Path | ContextBar + bar identity | StationWorkbench | Ambient wash | Terminal via registry | Column SoT `720` | HeaderToolbar | Notes |
|---|---|---|---|---|---|---|---|---|
| **Unbox (golden)** | `receiving/workspace/LineEditPanel.tsx` | ✅ `LineCartonContextSection` | ✅ | ⚠️ **copied blobs on root** (`ambientWash={false}`) | ✅ `unbox` | ✅ (footer uses token) | ✅ `mode=unbox` | Reference |
| **Triage** | `receiving/triage/TriagePanel.tsx` | ✅ same adapter | ✅ + `entityContext`=recommendations | ⚠️ copy | ✅ `triage` | ✅ via WB | ✅ | Closest sibling; `StationRightEdgeAction` OK |
| **Testing** | `tech/TestingPanel.tsx` | ✅ `TestingCartonHeader` | ✅ | ⚠️ copy | ✅ `testing` | ✅ | ✅ | Strong match |
| **Shipping (child)** | `tech/shipping/ShippingScanWorkspace.tsx` | ✅ `ShippingEntityContextHeader` | ❌ **no WB** | ❌ | tabs → `none`; dock sibling | ❌ parent `max-w-3xl` | ❌ no MoreDetails | Split chrome |
| **Shipping (host)** | `tech/ActiveOrderWorkspace.tsx` | via child | ❌ hand scroll | ❌ | preview via UpNext | ❌ **`max-w-3xl … pb-32`** | ❌ **PaneHeader** dual header | **Worst alignment** |
| **UpNext dock** | `tech/UpNextActionDock.tsx` | — | — | — | ✅ `shipping` | ❌ OOS `max-w-3xl` | — | Registry OK; width drift |
| **Pack** | `packer/PackOrderPanel.tsx` | ✅ `PackOrderIdentity` | ✅ | ❌ | ❌ **exempt / no row** | ✅ | ⚠️ close only | Intentional no dock? |
| **Pickup** | `work-orders/LocalPickupEditPanel.tsx` | ✅ `PickupEntityContextHeader` | ✅ + legacy `toolbar`/`entityContext` | ❌ | ✅ `pickup` | ✅ | ❌ PaneHeaderActionBar in toolbar | Legacy slots |
| **Repair** | `repair/RepairIntakeForm.tsx` | ❌ | ❌ | ❌ | ✅ `repair` | ⚠️ **local** `max-w-[720px]` string | ❌ | Registry-only; anatomy miss |
| **Support ticket** | `support/station/SupportTicketFocus.tsx` | ⚠️ **forked** `SupportTicketIdentity` | ✅ | ⚠️ copy | ❌ local `resolveSupportTerminal` | ✅ | ❌ | Ticket ≠ carton — allowlist or sibling SoT |
| **Support orders** | `support/orders/SupportOrdersWorkspace.tsx` | ✅ order identity | ✅ | ❌ | ❌ footer=`ShippedPanelEditorDock` | ✅ | ❌ | Different terminal pattern |
| **Labels** | `outbound/labels/LabelsOrderWorkspace.tsx` | ✅ Shipping adapter | ✅ | ❌ | ❌ **hand `TerminalActionVm`** | ✅ | ❌ | Missing registry slice |
| **Packer review** | `features/review/packer/PackerReviewMode.tsx` | ✅ `ReviewOrderIdentity` | ✅ | ❌ | ❌ **inline VM** | ✅ | ⚠️ | Missing registry |

### 4.2 Tiering (for rules)

| Tier | Stations | Rule stance |
|---|---|---|
| **A — Unbox-family (must match chrome)** | Unbox, Triage, Testing | Full anatomy + HeaderToolbar + registry + wash SoT |
| **B — Should match chrome (port targets)** | Shipping host+child, Pack, Pickup, Labels, Packer review | ContextBar + StationWorkbench + column tokens; terminal register or typed exempt |
| **C — Documented exceptions** | Support ticket (non-carton identity), Support orders (editor footer dock), Pack (no sticky dock) | Explicit allowlist in rules + guards |
| **D — Demote or remount** | Repair intake | Either adopt StationWorkbench+ContextBar **or** remove from “Unbox-family adopters” in docs |

### 4.3 Cross-cutting defects (CI must catch)

| Defect | Evidence | Severity |
|---|---|---|
| Dual column width | SoT `max-w-[720px]` vs `ActiveOrderWorkspace`, `TriageWorkspaceSkeleton`, `StationWorkbenchShell`, shipping terminal `maxWidth: 'max-w-3xl'`, UpNext OOS | **P0 alignment** |
| Dead divergent shell | `StationWorkbenchShell` — **0 call sites**, still exports `max-w-3xl` | P1 delete/rewrite |
| Ambient wash ×5 | Identical 3-blob recipe in LineEditPanel, TriagePanel, TestingPanel, SupportTicketFocus, + unused path in `StationWorkbench` when `ambientWash` | P1 promote SoT |
| Hand-rolled panel roots | Every Tier A/B panel invents outer `relative flex h-full…` | P1 extract `StationPanelRoot` |
| Registry holes | Labels / Support / Review / Packing not in `STATION_TERMINAL_REGISTRY` | P1 |
| Mode registry narrow | `WORKSPACE_MODES` only unbox\|triage\|testing; shipping/pickup/repair have terminal but no mode chrome row | P2 |
| Header pad trap | `STATION_WORKBENCH_HEADER_COLUMN` uses `px-6 sm:px-8` ≠ body pad — misaligns if used for bookmark/body | P2 ban for family panels |
| Repair local column | `REPAIR_INTAKE_MAX_WIDTH = 'max-w-[720px]'` duplicates SoT without import | P2 |

---

## 5. Existing enforcement (baseline — extend, don’t fork)

| Mechanism | Path | Covers today |
|---|---|---|
| Soft rule | `.claude/rules/display/station-workbench.md` | Anatomy checklist (not CI) |
| Soft SoT | `.claude/rules/source-of-truth.md` | Entity-context barrel |
| Terminal unit tests | `src/lib/station-terminal/station-terminal.test.ts` | Registry shape; `WORKSPACE_MODES ⊆` terminal (**receiving trio only**) |
| Support terminal tests | `src/components/support/station/resolve-support-terminal.test.ts` | Off-registry VM |
| E2E smoke | `tests/e2e/receiving-tech-modes.spec.ts` | Unbox/Triage/Testing ContextBar + tabs |
| DS ratchets | `src/components/ui/*.guard.test.ts` | buttons, focus, surfaces — **not station chrome** |
| Verify | `npm run verify` / CI job `ci` | All unit + guards |

**Gap:** No guard for panel root, column width, ambient wash dedupe, StationWorkbench adoption, or hand-built terminal VMs.

---

## 6. Deliverables for Gemini Pro

### 6.1 Rules (docs agents load)

Produce / update (prefer **grow** existing files; don’t invent a parallel design system):

1. **Harden** `.claude/rules/display/station-workbench.md`:
   - Tier A/B/C/D table from §4.2
   - **Hard Never / Always** list (below)
   - Explicit allowlist for SupportTicketIdentity, Pack terminal-exempt, Support orders footer dock
   - Point to guard file paths

2. **Add one-line mapping** in `AGENTS.md` SoT table if missing:
   - Station Workbench column / panel root → `workbench-layout.ts` + (new) `StationPanelRoot` once extracted

3. **Optional Cursor rule** `.cursor/rules/station-workbench.mdc` (`globs` for station panel paths) that restates Never/Always for agent sessions.

#### Hard Always

- Mount identity with `StationContextBar` + `density="bar"` **above** `StationWorkbench`.
- Body + identity share `STATION_WORKBENCH_*` (720 + body pad) — never invent `max-w-3xl` / local `max-w-[720px]` for Unbox-family right panes.
- Terminal CTA via `useStationTerminalAction` + `STATION_TERMINAL_REGISTRY` **or** a typed `terminalExempt` / allowlist entry with a comment marker.
- Tabs via `buildSectionTabs` + `SectionTabsSlider` (station wrappers OK if they only compose the SoT).
- Glass nested worksheets via `WorkspaceCard` `bodyDensity="nested"` + nested field tokens (Unbox recipe).
- Mid-canvas jumps via `StationRightEdgeAction` + `stationRightEdgeActionHostClass` — never inside `moreDetails`.

#### Hard Never

- Fork a second condensed carton/order identity header.
- Put carton identity in `StationWorkbench` `entityContext` / `toolbar` for Tier A/B.
- Hand-roll `relative flex h-full min-h-0 flex-col bg-surface-canvas` outside the panel-root SoT (after extract).
- Copy the ambient wash blob trio outside the wash SoT module.
- Use `StationWorkbenchShell` as-is (`max-w-3xl`) — delete or rewire to `STATION_WORKBENCH_*`.
- Raise guard baselines to “pass” a port.

#### May diverge (station-local)

- Controllers / form state / tab **content** bodies
- Thin identity adapters (map domain → CartonContextCard props)
- Terminal **resolver** branches (kind → VM)
- Visibility gates on tabs
- Non-overview recommendations strip in `entityContext` (Triage) — documented legacy slot

### 6.2 Code SoT growth (recommend + optionally implement if small)

Prefer these as **foundations** the guards assume:

1. **`StationAmbientWash`** (or force `StationWorkbench ambientWash` + panel-root prop) — single blob recipe.
2. **`StationPanelRoot`** — owns wash + `bg-surface-canvas` + flex column; slots: `identity`, `moreDetails`, `children` (workbench), `overlays`.
3. **Delete or rewrite** `StationWorkbenchShell` to re-export StationWorkbench / layout tokens (knip may already flag dead export once consumers gone).
4. **Migrate** `TriageWorkspaceSkeleton` off local `max-w-3xl` to `STATION_WORKBENCH_*`.
5. Extend `TerminalWorkspaceMode` / registry with `labels | support | review` **or** add `TERMINAL_EXEMPT_MODES` const consumed by the guard.
6. Extend `WORKSPACE_MODES` for shipping / pickup / repair when HeaderToolbar applies — or document “no HeaderToolbar” as Tier B variant.

### 6.3 CI / guard tests (required)

Add **ratchet / census guards** under e.g.:

`src/components/station/workbench/station-workbench-chrome.guard.test.ts`

Run via existing unit-test job (`tsx --test` / `npm run verify`). Pattern: walk allowlisted adopter files (or `src/components/{receiving,tech,packer,support,outbound/labels,work-orders,repair,features/review}/**`), fail on growth of banned patterns.

#### Guard A — Column width ratchet

- In Unbox-family adopter allowlist: forbid new `max-w-3xl` (and raw `max-w-[720px]` string literals that aren’t imports from `workbench-layout`).
- Baseline current offenders (`ActiveOrderWorkspace`, `TriageWorkspaceSkeleton`, shipping terminal, UpNext OOS, Repair local const) at **today’s count**; shrink-only.
- Escape: `ds-station-max-w-exempt` same-line / line-above for genuine non-family surfaces.

#### Guard B — Ambient wash single home

- Count occurrences of `bg-blue-400/[0.08]` (or the full 3-blob fingerprint) in `src/`.
- Must equal **1** (SoT module) after migration; until then baseline = 5 and shrink-only.

#### Guard C — Panel root hand-roll

- After `StationPanelRoot` exists: forbid new `relative flex h-full min-h-0 flex-col bg-surface-canvas` outside SoT + allowlist.
- Until extract: baseline current count; shrink-only.

#### Guard D — StationWorkbench adoption

- Allowlisted Tier A/B right-pane files must import `StationWorkbench` (or `StationPanelRoot`).
- Exceptions: Repair (until remount), ShippingScanWorkspace (until host folded) — listed in `STATION_WORKBENCH_ADOPTION_EXEMPT`.

#### Guard E — Terminal path

- Every file that mounts `StationTerminalDock` must either:
  - call `useStationTerminalAction`, **or**
  - be in `TERMINAL_HAND_VM_ALLOWLIST` (Support / Labels / Review today) with a plan comment, **or**
  - be Pack with `terminalExempt`.
- Assert allowlist modes either appear in `STATION_TERMINAL_REGISTRY` or in `TERMINAL_EXEMPT_MODES`.

#### Guard F — Identity mount

- `density="bar"` / `CartonContextCard` usage outside `@/components/station/entity-context` + named adapters → fail unless allowlisted (`SupportTicketIdentity` for ticket entity).

#### Guard G — Sync registries

- Extend `station-terminal.test.ts`: every `TerminalWorkspaceMode` that claims `hasSectionTabs` has matching tab ids used by its panel builder **or** document loose tabs.
- Optionally: `WORKSPACE_MODES` keys ⊆ terminal modes (already true); reverse: terminal modes that need HeaderToolbar ⊆ `WORKSPACE_MODES` **or** listed as `headerToolbar: false`.

### 6.4 Optional package.json scripts

```json
"test:station-workbench-guard": "tsx --test src/components/station/workbench/station-workbench-chrome.guard.test.ts"
```

Wire into `test:ds-guards` **or** leave as separate — either way must run in `npm run verify` (unit test glob already picks up `*.guard.test.ts` if under `src/` — confirm verify.mjs includes them).

---

## 7. Suggested Gemini execution order

1. Read golden `LineEditPanel` + `StationContextBar` + `workbench-layout.ts` + this briefing.
2. Draft hardened `station-workbench.md` (Tier table + Always/Never + allowlists).
3. Implement Guard A + B first (catch alignment immediately) with baselines at **current** counts — do **not** raise later.
4. Extract `StationAmbientWash` / `StationPanelRoot` if you implement code; migrate Unbox/Triage/Testing/SupportTicketFocus; drop Guard B baseline to 1.
5. Delete or rewrite `StationWorkbenchShell`; migrate `TriageWorkspaceSkeleton` to SoT tokens.
6. Add Guard D/E/F with explicit allowlists for known gaps.
7. Run `npm run verify` (or `--fast` then full) — green before done.
8. Append work-log entry; leave port PRs (Shipping host, Repair remount, Labels registry) as follow-ups in a short `docs/todo/station-workbench-port-FOLLOWUPS.md` if not implementing.

---

## 8. Follow-up port backlog (not blocking rules/CI)

Priority by alignment pain:

1. **Shipping** — fold `ActiveOrderWorkspace` into ContextBar + `StationWorkbench`; kill `max-w-3xl` + dual `PaneHeader`.
2. **TriageWorkspaceSkeleton** — SoT column tokens.
3. **Labels / Review** — registry slices or formal exempt flag.
4. **Support** — document ticket identity sibling SoT; decide registry vs local resolver.
5. **Pickup** — move PaneHeaderActionBar out of workbench `toolbar` into `StationMoreDetails` / mode chrome.
6. **Repair** — remount on StationWorkbench **or** demote from Unbox-family docs.
7. **Pack** — typed `terminalExempt` in registry.

---

## 9. Success criteria

Gemini’s pass is done when:

- [ ] `station-workbench.md` (and optional `.cursor/rules`) encode Tier A–D + Always/Never + allowlists
- [ ] At least Guards A + B (+ E recommended) land and fail if someone reintroduces `max-w-3xl` / wash copies on allowlisted paths
- [ ] Baselines are **current counts**, never raised in the same PR that “fixes” by relaxing
- [ ] `npm run verify` green
- [ ] Dead `StationWorkbenchShell` divergence is deleted or rewired to `STATION_WORKBENCH_*`
- [ ] Brief follow-ups list remains for Shipping/Repair ports (rules don’t pretend those ports are done)

---

## 10. Quick reference — key absolute paths

```
Golden:     src/components/receiving/workspace/LineEditPanel.tsx
Layout:     src/components/station/workbench/workbench-layout.ts
Workbench:  src/components/station/workbench/StationWorkbench.tsx
Entity:     src/components/station/entity-context/
Terminal:   src/lib/station-terminal/registry.ts
Modes:      src/components/station/entity-context/workspace-mode-registry.ts
Dead shell: src/components/station/terminal/StationWorkbenchShell.tsx
Rule soft:  .claude/rules/display/station-workbench.md
Guard exemplar: src/components/ui/raw-button.guard.test.ts
CI:         .github/workflows/ci.yml → npm run verify
```

---

## 11. Prompt block (paste to Gemini Pro)

```text
You are working in the Cycle Forge repo. Read docs/todo/station-workbench-sot-rules-BRIEFING.md end-to-end, then AGENTS.md + .claude/rules/display/station-workbench.md + LineEditPanel.tsx + workbench-layout.ts.

Mission: harden Station Workbench as HARD SoT for Unbox-family stations. Deliver:
1) Updated station-workbench.md with Tier A–D, Always/Never, allowlists from the briefing.
2) Census ratchet guard(s) for max-w-3xl / ambient-wash / terminal path (pattern: raw-button.guard.test.ts). Baselines = current counts; never raise.
3) Delete or rewrite StationWorkbenchShell off max-w-3xl; migrate TriageWorkspaceSkeleton to STATION_WORKBENCH_*.
4) Prefer extracting StationAmbientWash + StationPanelRoot if low blast radius; migrate Unbox/Triage/Testing/SupportTicketFocus wash copies.
5) npm run verify must pass. Do not raise DS/station baselines. Do not port Shipping/Repair full anatomy unless leftover after guards.

Do not invent a second design language. Compose/grow the existing barrels under src/components/station/{workbench,entity-context,terminal}.
```
