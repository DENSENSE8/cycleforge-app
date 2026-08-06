# Squared-off display — design-system audit + full transformation plan

**Created 2026-08-05.** Paste-ready **Claude Code Ultra** brief for a
**codebase-wide** transform: kill soft corner radius, kill nested padded
islands, retire horizontal pill bands in favor of flush dropdown / industrial
tab displays. Golden reference = **Receiving Claim Displays** (Unbox Ticket →
Claim push column) on the current working tree.

**Lane:** current checkout — attach to `:3050`; never start/restart/kill the
dev server. User owns commits. Stay on the checkout's branch.

**Verify:** `npm run verify` green before any wave is "done." Never raise DS
ratchet / knip baselines.

---

## 0. One-sentence mission

Make every ops surface read like the Claim Displays column: **column = the
card**, **radius = 0**, **depth = surface steps + hairlines**, **choices =
flush combobox or TabDisplay — never sausage pills**.

---

## 1. Why this is a token problem (not a CSS find-replace)

| Fact (tree snapshot 2026-08-05) | Implication |
|---|---|
| ~**3,256** soft `rounded-(sm\|md\|lg\|xl\|2xl\|3xl\|full)` hits under `src/` | Call-site greps alone will thrash forever unless primitives + roles change first |
| Only ~**34** files call `cornerClass(` | Most chrome bypasses the role layer with bare Tailwind |
| `CORNER_CLASS` still maps `control→lg`, `field→xl`, `card→2xl`, `canvas→3xl` | Growing SoT without remapping roles leaves new code soft by default |
| `Button` already `cornerClass('flush')`; `Popover` already `rounded-none`; `TabDisplay` industrial; `SearchableSelectField appearance="flush"` + `DenseComposeFields` shipped on Claim | Golden exists — compound it; do not invent twins |
| `TabSwitch` + `HorizontalButtonSlider` still soft pill rails | Mode / enum bands still broadcast the old language |
| `WORKBENCH_CHROME_PILL_CLASS` = `nestedCornerClass('card', 0.5)` → soft | Workbench trailing CTAs still contradict flush Buttons |
| Sheets / Displays flush cohorts already landed for many workbenches | This plan **extends** that grammar into **controls, cards, pills, padding** — do not re-open Sheets host waves |

**Anti-pattern to refuse:** globally remapping `theme.extend.borderRadius` in
`tailwind.config.ts`. That silently rewrites every class, breaks `cn()` merge
assumptions, and is banned by `radius-tokens.guard.test.ts`. Transform via
**`cornerClass` roles + primitive defaults + call-site migration + ratchets**.

---

## 2. Locked visual grammar (Claim golden — copy this, do not re-derive)

### 2.1 Faces (compose these SoTs)

| Job | SoT | Path |
|---|---|---|
| Short identity / subject line | `DenseComposeSubjectInput` | `src/design-system/components/DenseComposeFields.tsx` |
| Flush search / picker face | `DenseComposeSearchInput` | same |
| Long prose band | `DenseComposeBodyBand` + `DenseComposeBodyTextarea` | same |
| Fixed / searchable enum | `SearchableSelectField appearance="flush"` | `src/design-system/components/SearchableSelectField.tsx` |
| Nested verb tabs (parent) | `TabDisplay appearance="underline"` | `src/design-system/components/TabDisplay.tsx` |
| Nested subset tabs (child) | `TabDisplay appearance="segment"` | same |
| Topic plate | `SectionTabsSlider density="icon"` | SpaceX `h-10` edge-to-edge |
| Solid CTA | DS `Button` (`cornerClass('flush')`) | `src/design-system/primitives/Button.tsx` |
| Micro row icon | `IconButton size="md"` (`rounded-none`) | primitives |
| Panel terminal CTA | `FlushTerminalFooter` | primitives |
| Sort / quiet choice | `QueueSortSwitch` / DS `Popover` dropdown | never `TabSwitch` beside search |

**Mount golden:** Claim compose —

- `ClaimComposeStep.tsx` — flush claim-type combobox (replaced `HorizontalButtonSlider`)
- `ClaimTemplateEditor.tsx` — Subject / Body sheet-band
- `ReceivingClaimPanel.tsx` — `px-0 py-0` scroll; section hairlines; no duplicate titles
- `ClaimWizardNav.tsx` — `gap-0` Cybertruck stack under topic plate

**Guards already pinning the golden:**

- `claim-display-fill.guard.test.ts`
- `tab-display-displays-hosts.guard.test.ts`
- `receiving-claim-drawer.guard.test.ts`
- `Button.guard.test.ts` / `FlushTerminalFooter.guard.test.ts`

### 2.2 Grammar card (print at top of every wave)

```text
Column = the card. No nested padded islands.

RADIUS
• Ops chrome / panels / fields / menus / rails / sheets → rounded-none (flush)
• True circles only: avatar, Switch thumb track geometry, status DOT, loader pulse
• Status / lifecycle badges stay chip FACE (pastel fill) but corners go flush (or ≤2px if a guard proves needed) — never rounded-full sausages
• Never rounded-lg / xl / 2xl / 3xl on Station · Workbench · Displays · Desk inspectors

PADDING / DEPTH
• Outer push / claim / inspector scroll: px-0 (rows own gutters)
• Labels: text-role-eyebrow — not a second card header
• Lists: full-bleed divide-y / border-b — NOT rounded-xl bordered boxes
• Depth = canvas → sunken → card surface step + hairline — never m-* gutters between push columns
• Drop decorative p-3/p-4 wrappers whose only job was to float a soft card inside a soft card

CHOICE CONTROLS
• ≤ ~12 fixed options, searchable or not → SearchableSelectField appearance="flush" (dropdown)
• Mode / verb bands (2–6 peers on one job) → TabDisplay (underline | segment | fill)
• Sort / filter / display prefs → quiet trailing dropdown (QueueSortSwitch pattern)
• FORBIDDEN for new work: HorizontalButtonSlider · TabSwitch solid pill · ad-hoc rounded-full mode rows
```

### 2.3 Explicit keep-soft / keep-round exceptions (do NOT square these)

| Exception | Why |
|---|---|
| `StaffAvatar` / circular identity marks | Geometry is the signal |
| `Switch` track/thumb | Control affordance is circular by OS convention |
| Status **dot** (`rounded-full` 2–3px) | Dot, not pill |
| Progress indeterminate pulse / loader dots | Motion affordance |
| True pie / radial charts | Data ink |
| Mobile redesign arbitrary radii already on `KNOWN_ARBITRARY` | Separate mobile shape language — migrate later or `ds-allow-radius`; do not expand the map |
| Marketing / BootSplash brand moments | Outside Kinetic Ledger ops floor |

Everything else in Station · Workbench · Displays · Desk · Settings ops chrome is in scope.

---

## 3. Already shipped — do not re-open

Read these; treat as closed floors:

| Doc / slice | Status |
|---|---|
| [`claim-displays-sheet-band-cohort-HANDOFF.md`](./claim-displays-sheet-band-cohort-HANDOFF.md) | Subject/Body + claim-type flush combobox **done**; TicketPicker + remaining claim fields still open (Wave C below) |
| [`spacex-displays-topic-plate-flush-HANDOFF.md`](./spacex-displays-topic-plate-flush-HANDOFF.md) / four-edge handoff | Topic plate + gap-0 tab stack **done** |
| [`sheets-flush-workbench-cohort-PLAN.md`](./sheets-flush-workbench-cohort-PLAN.md) | Waves 2–7 sheet hosts **done** — do not re-port CLIP→SHEET |
| `Button` flush + `FlushTerminalFooter` | Done |
| MasterNav spine flush (`rounded-none` rows) | Done / guarded |
| Workbench Band 2 KPI densify (`cornerClass('flush')`) | Done for band; Monitor cards still soft (Wave E) |

---

## 4. Token transformation (Wave 0 — do this before mass call-site edits)

### 4.1 Evolve `src/design-system/tokens/radius.ts`

**Goal:** industrial default = flush. Soft ladder becomes legacy aliases that
still resolve, then get deleted once call sites are gone.

Recommended end-state map (document + guard):

```ts
const CORNER_CLASS: Record<CornerRole, string> = {
  flush: 'rounded-none',
  chip: 'rounded-none',   // was rounded — chip FACE without soft blob
  row: 'rounded-none',    // was rounded-md
  control: 'rounded-none',// was rounded-lg — menus / soft controls
  field: 'rounded-none',  // was rounded-xl
  card: 'rounded-none',   // was rounded-2xl — Panel / SectionCard shells
  canvas: 'rounded-none', // was rounded-3xl — only after Monitor/Canvas wave
  pill: 'rounded-full',   // KEEP — avatars / dots / Switch only
};
```

**Staging (mandatory — do not flip all roles in one unguarded commit):**

1. **0a — Docs + DESIGN_SYSTEM.md** — declare industrial zero-radius law;
   mark soft ladder deprecated; update `TabSwitch` as legacy; elevate
   `TabDisplay` + flush combobox + DenseCompose as SoT.
2. **0b — Remap `control` + `field` → flush** after Wave A primitives adopt
   flush defaults (Popover already flush; TextField `flush` appearance becomes
   default or sole appearance for ops).
3. **0c — Remap `chip` + `row` → flush** with chip anatomy update (drop
   `rounded` / `rounded-full` on lifecycle badges; keep pastel face).
4. **0d — Remap `card` → flush** after Panel / CardShell / SectionCard /
   WorkspaceCard defaults change (Wave A).
5. **0e — Remap `canvas` → flush** last (Monitor / glass worksheets).
6. Update `CORNER_PX` in lockstep so `nestedCorner` with pad still returns
   `flush` (outer 0 − pad → flush). Concentric nesting becomes a no-op —
   **that is correct** under zero-radius; delete call sites that only existed
   to "match" soft parents (`WORKBENCH_CHROME_PILL_CLASS` → flush square CTA).

### 4.2 Related tokens / shells to square in the same wave cluster

| Module | Change |
|---|---|
| `tokens/table-surface.ts` | `TABLE_SURFACE_CLIP_CLASS` drop rounded-xl (or retire CLIP for ops; SHEET already flush) |
| `components/monitor/shell.ts` | `MONITOR_*` card shells → flush; KPI monitor tiles lose `rounded-2xl p-4` island padding where band densify already proved the grammar |
| `workbench-shell.tsx` | `WORKBENCH_CHROME_PILL_CLASS` → `cornerClass('flush')` (or delete alias); update SoT prose that currently requires soft History pill radius |
| `primitives/Panel.tsx` / `CardShell.tsx` / `TextField.tsx` | Default radius flush; delete soft default paths or gate behind `appearance="legacySoft"` that ratchet forbids on Station/Workbench |
| `primitives/DropdownMenu.tsx` / `ContextMenu.tsx` / `ToolbarListbox.tsx` | Square panels (match Popover) |
| Chip anatomy in ui-design-system / CopyChip | Flush corners; quiet face (already moving off underlines) |

### 4.3 Hard laws to rewrite (SoT one-liners)

Update (do not fork):

- `.claude/rules/source-of-truth.md` — Workbench chrome pill soft-radius law →
  flush square CTA law; Depth elevation already flush — extend to **controls**.
- `.claude/rules/ui-design-system.md` — chip `rounded` → flush; ban new
  `HorizontalButtonSlider` / soft `TabSwitch` for ops.
- `.claude/rules/kinetic-ledger.md` — zero-radius industrial sentence.
- `.claude/rules/display/*` — remove "soft concentric" recipes that contradict.
- `AGENTS.md` — one-line hard law: **Ops chrome is flush-square (`cornerClass('flush')`); soft radius and horizontal pill bands are debt.**
- `src/design-system/DESIGN_SYSTEM.md` — TabDisplay / flush select / DenseCompose
  already partially updated; finish the radius section.

---

## 5. Audit recipe (run first in Ultra; write results into a WAVE inventory)

Before editing product surfaces, produce an inventory file (or update this
doc's §6 tables) with counts:

```bash
# Soft radius density
rg -c 'rounded-(sm|md|lg|xl|2xl|3xl|full)\b' src --glob '*.{tsx,ts}' \
  | sort -t: -k2 -nr | head -80

# Nested island syndrome (rounded + border + padding)
rg -l 'rounded-(lg|xl|2xl).*border|border.*rounded-(lg|xl|2xl)' src --glob '*.tsx'

# Horizontal pill bands
rg -l 'HorizontalButtonSlider' src --glob '*.{tsx,ts}'

# Soft TabSwitch still mounted
rg -l 'TabSwitch' src --glob '*.tsx' | head -80

# Bare rounded bypassing cornerClass
rg -l 'rounded-(lg|xl|2xl)' src/design-system --glob '*.tsx'

# Padding islands in push columns
rg -n 'px-3 py-3|p-4 rounded|rounded-xl border.*p-|mx-3.*rounded' \
  src/components/receiving/workspace/claim --glob '*.tsx'
```

**Classify every hit into:**

| Bucket | Action |
|---|---|
| `PRIM` | Fix once in design-system primitive / shell |
| `SOT` | Fix once in named SoT module; consumers inherit |
| `MIGRATE` | Call-site compose SoT (no twin) |
| `EXCEPT` | Document in §2.3 + `ds-allow-radius` if arbitrary |
| `DEFER-MOBILE` | Mobile redesign cluster — separate lane |
| `DEAD` | Delete |

---

## 6. Execution waves (Ultra — one wave per session when possible)

### Wave A — Design-system primitives & shells (highest leverage)

**Do first.** One green `npm run verify` after this wave moves hundreds of
call sites visually when they already compose primitives.

| Target | Transform |
|---|---|
| `Panel`, `CardShell`, `WorkspaceCard`, `StatCard` | Default `cornerClass('flush')`; strip soft padding defaults where they only float islands |
| `TextField` | Prefer `flush` / underline for ops; soft `rounded-xl` becomes legacy |
| `SearchField` / chrome search | Keep flush sunken plane (already); kill any remaining rounded bubble |
| Menus: `DropdownMenu`, `ContextMenu`, `ToolbarListbox` | Square like `Popover` |
| `EmptyState`, `Skeletons`, `FilterRefinementBar`, `OverlaySearch` | Flush frames |
| `TabSwitch` | Mark `@deprecated`; add guard: no new imports under `src/components/{receiving,outbound,dashboard,station,support}` — migrate hosts to `TabDisplay` |
| `HorizontalButtonSlider` | Mark `@deprecated`; same import ratchet; replacement matrix in §7 |
| Monitor `shell.ts` / `KpiTile` / `OpsKpiBand` | Flush for workbench band (done); square Monitor cards |
| `SlicedActionDock` / station docks | Flush square — revisit soft `rounded-*` on dock chrome |
| Guards | Extend `radius-tokens.guard.test.ts` OR add `flush-ops-chrome.guard.test.ts` that fails on new `rounded-(lg\|xl\|2xl\|3xl\|full)` in allowlisted ops dirs unless `ds-allow-radius` / EXCEPT list |

### Wave B — Choice-control language (pills → dropdown / TabDisplay)

Replacement matrix:

| Old | New | When |
|---|---|---|
| `HorizontalButtonSlider` for **enum / type / scope** (claim type, Zendesk claim type, catalog scope, …) | `SearchableSelectField appearance="flush"` | Options are a set; search helps; one value |
| `HorizontalButtonSlider` for **peer modes** (2–6 tabs on one surface) | `TabDisplay` (`underline` parent / `segment` child / `fill` if single-layer inverse needed) | Mutually exclusive modes |
| `HorizontalButtonSlider` in **sidebars** | Prefer `SidebarFacetGroup` / list rows / flush select — already the spine direction | Facets, not sausages |
| `TabSwitch variant="solid\|default"` workbench bands | `TabDisplay density="band"` | Lifecycle Queue\|History\|… |
| Sort / staff / week filters as pills | Quiet dropdown (`QueueSortSwitch` / popover) | Already law for sort |

**Known HBS call sites to migrate (audit may grow this):**

- `ZendeskClaimModal.tsx` (mirror Claim compose)
- `CartonMatchHub.tsx`
- `ProductsSidebarPanel`, `OperationsSidebarPanel`, `SourcingSidebarPanel`, `InventoryTriageSidebar`
- `IssuesQueue.tsx`, `CatalogWorkspace.tsx`, `RouteShell.tsx`
- `HomeTasksMode.tsx`, `AgenticLoopLiveConsole.tsx`
- Mobile: `UniversalScan.tsx` — `DEFER-MOBILE` unless it shares desktop SoT

**Claim residual (from sheet-band handoff — finish as Wave B/C overlap):**

- Shared `TicketPicker.tsx` → flush search + full-bleed rows
- Recipients / CC / Backup / Seller message / Ticket reply / Photo tiles —
  see cohort table in `claim-displays-sheet-band-cohort-HANDOFF.md`

### Wave C — Claim Displays finish (prove the grammar end-to-end)

Complete the open table in
[`claim-displays-sheet-band-cohort-HANDOFF.md`](./claim-displays-sheet-band-cohort-HANDOFF.md).
Extend `claim-display-fill.guard.test.ts` so Claim cannot regress to:

- `HorizontalButtonSlider`
- `rounded-(lg|xl|2xl) border` list shells
- Nested `p-3` cards around Subject/Body/search

**Done-when for Wave C:** Unbox → Displays → Ticket → Claim (New + Link) is
100% flush-square from topic plate through sticky footer — no soft card
islands in the scroll body.

### Wave D — Station family (Unbox golden → Arrival · Testing · Pack · Scan-out)

| Area | Action |
|---|---|
| Station identity / context cards | Already trending flush — kill leftover `rounded-2xl` entity cards |
| Displays push stacks | Inherit Claim grammar for every create/edit form in Displays |
| Procedure deck / checklist chrome | Square cards; keep motion roles |
| Unbox dock / `SlicedActionDock` | Flush |
| Right-rail inspectors (`PaneHeader`) | Flush sheet-band fields (DenseCompose / flush select) |

Compose station SoT — never page-local twins. Guards:
`station-workbench-chrome.guard.test.ts` (extend, never raise baselines).

### Wave E — Workbench / Desk / Support / Settings ops chrome

| Area | Action |
|---|---|
| Workbench chrome CTAs | Drop soft `WORKBENCH_CHROME_PILL_CLASS`; flush squares on all sides |
| Remaining CLIP table frames | Prefer SHEET; if CLIP remains, square it |
| Support claim composer / Zendesk modal | Same as Receiving Claim |
| Desk `RightRailHost` intake | Sheet-band fields after Claim + TicketPicker golden |
| Admin DataTable chrome | Square Panel / table CLIP |
| Settings sections with `rounded-2xl` cards | Flush section shells (ops settings, not marketing) |

Do **not** re-run Sheets host porting (already done). This wave is **control +
card radius + padding**, not scroll-host wiring.

### Wave F — Monitor / Canvas / Operations TV

Last soft islands. Remap `canvas` role → flush after SectionCard / KPI /
TV board cards are squared. Charts keep round plot markers only where data
requires.

### Wave G — Ratchet lockdown + debt burn-down

1. Flip remaining `CORNER_CLASS` soft roles → flush (Wave 0e complete).
2. Add shrink-only inventory: top-N files by soft `rounded-*` count must
   decrease each PR touching them (optional cohort guard).
3. Ban new `HorizontalButtonSlider` / `TabSwitch` imports in ops trees.
4. Knip: after deprecation, delete dead exports when zero call sites remain —
   do not knip-delete until replacement mounts exist.
5. Update Stitch / industrial prompts to say "shipped in product," not vision.

---

## 7. Horizontal pill → dropdown / TabDisplay decision tree

```text
Is it a mutually exclusive MODE band on one surface (Queue|History, Chat|Claim)?
  YES → TabDisplay (underline parent / segment child / band density for workbench)
  NO ↓

Is it picking ONE value from a labeled set (claim type, platform, assignee)?
  YES → SearchableSelectField appearance="flush"  (dropdown display)
  NO ↓

Is it sort / filter / column-display / prefs?
  YES → quiet trailing dropdown / popover (QueueSortSwitch · GridColumnDetails)
  NO ↓

Is it a sidebar facet multi-filter?
  YES → SidebarFacetGroup / flush list — never HBS
  NO ↓

STOP — you are inventing a control. Ask before shipping a new primitive.
```

---

## 8. Padding / island removal checklist (every file)

For each migrated surface:

1. Remove outer `m-*` between push columns (depth is planes).
2. Scroll body `px-0`; put `px-3` only on **label rows** that need content
   gutter — not around full-bleed lists / sunken body bands.
3. Delete wrappers whose class is only `rounded-* border … p-3|p-4 bg-surface-card`.
4. Replace nested cards-as-rows with `divide-y` rows or LedgerGrid.
5. Sticky footers: `FlushTerminalFooter` / flush `Button` — no soft dock pad.
6. Eyebrows: `text-role-eyebrow` — never a second `h2` that duplicates scroll-spy
   / tab labels.

---

## 9. Guard / verify contract

| Gate | Rule |
|---|---|
| `npm run verify` | Full gate green per wave |
| DS ratchets | Shrink only — never raise `*-baseline` / `KNOWN_ARBITRARY` |
| New guards | Prefer pin golden paths (Claim, Displays hosts, Button, TabDisplay) over whole-repo bans that are still false-positive heavy |
| Progressive ban | Ops-directory import bans for `HorizontalButtonSlider` + soft `TabSwitch` once Wave B replacements land |
| Escape | Same-line `ds-allow-radius` only for §2.3 exceptions |
| Motion | Only `@/design-system/motion` — rectangular selection indicators OK; pill shapes not OK |
| Commits | User owns — stage only this wave's files |

---

## 10. Coordinates with sibling docs (do not conflate)

| Doc | Relationship |
|---|---|
| `claim-displays-sheet-band-cohort-HANDOFF.md` | **Wave C detail** — TicketPicker + claim field table |
| `spacex-*-HANDOFF.md` / `industrial-tabdisplay-stitch-PROMPT.md` | Chrome / TabDisplay vision — Wave B consumes |
| `sheets-flush-workbench-cohort-*` | Closed for host wiring — Wave E only squares leftover CLIP/card chrome |
| `displays-vs-inspector-vocabulary-SWEEP-HANDOFF.md` | Noun law; orthogonal |
| `right-panel-sheet-band-flush-GEMINI-RESEARCH-BRIEFING.md` | Research; Claim is the execution golden |

---

## 11. Paste this into Claude Code Ultra

```
Read docs/todo/squared-off-display-DS-TRANSFORMATION-PLAN.md END TO END before any edit.
Also read:
- docs/todo/claim-displays-sheet-band-cohort-HANDOFF.md (Wave C residual)
- src/design-system/tokens/radius.ts
- src/design-system/components/DenseComposeFields.tsx
- src/design-system/components/SearchableSelectField.tsx
- src/design-system/components/TabDisplay.tsx
- src/components/receiving/workspace/claim/components/ClaimComposeStep.tsx
- AGENTS.md + .claude/rules/source-of-truth.md (Depth · Displays · Workbench chrome)
- .claude/rules/pattern-evolution.md

MISSION
Codebase-wide transform to squared-off Kinetic Ledger / Cybertruck ops UI:
1) radius → flush (rounded-none) for ops chrome
2) remove nested padded card islands
3) replace HorizontalButtonSlider / soft TabSwitch pills with
   SearchableSelectField appearance="flush" OR TabDisplay per §7 decision tree
Golden: Unbox Displays → Ticket → Claim (already partially shipped).

HARD CONSTRAINTS
- Attach to :3050 — never start/restart/kill the dev server
- Stay on current branch; user owns commits; never git stash
- Compose / grow SoT — never fork Claim-only twins of TicketPicker / Select / Tabs
- Never extend tailwind theme.borderRadius
- Never raise knip or DS ratchet baselines
- Motion only from @/design-system/motion
- npm run verify green before declaring a wave done

EXECUTION ORDER (do not skip Wave 0/A)
0. Run §5 audit commands; append a short inventory of top offenders + HBS sites
   classified PRIM|SOT|MIGRATE|EXCEPT|DEFER-MOBILE|DEAD
1. Wave A — square DS primitives/shells + deprecate HBS/TabSwitch in docs
2. Wave 0b–0d token role remaps only AFTER those primitives default flush
3. Wave B — HBS/TabSwitch call-site matrix (§6/§7)
4. Wave C — finish Claim cohort (TicketPicker first) + strengthen guards
5. Waves D→F — Station → Workbench/Desk → Monitor
6. Wave G — final CORNER_CLASS flush remap + import ratchets + delete dead soft APIs

PER-FILE CHECKLIST
- cornerClass('flush') or rounded-none via SoT — no new rounded-lg/xl/2xl/3xl/full
  except §2.3 exceptions
- No nested rounded+border+pad islands
- Enums → flush SearchableSelectField; modes → TabDisplay; sort → quiet dropdown
- px-0 scroll bodies; row-owned gutters; depth via surface steps

DONE WHEN
- Claim Displays New+Link is fully flush-square (Wave C)
- DS primitives default flush; soft roles deprecated or remapped
- HBS/TabSwitch gone from Station/Workbench/Displays/Claim/Support claim paths
  (or explicitly DEFER-MOBILE with reason)
- Guards prevent regression on Claim + Displays hosts + Button flush
- npm run verify green
- Short handoff note listing remaining EXCEPT/DEFER counts for the next session
```

---

## 12. Success metrics

| Metric | Baseline (2026-08-05) | Target |
|---|---|---|
| Soft `rounded-*` hits under `src/` | ~3256 | Trend down every wave; ops dirs approach 0 excluding EXCEPT |
| Files calling `cornerClass(` | ~34 | Primaries + shells all go through roles |
| `HorizontalButtonSlider` product mounts | ~15+ | 0 in desktop Station/Workbench/Displays/Support claim |
| Soft `TabSwitch` on Displays | 0 (already) | 0; workbench bands on `TabDisplay` |
| Claim Displays soft islands | Residual (TicketPicker + cohort table) | 0 |
| `CORNER_CLASS` soft roles | 6 soft + pill | Only `pill` remains soft |

---

## 13. Out of scope (explicit)

- Creatable claim-type dictionaries / workflow-rule drawers
- Re-porting Sheets `WORKBENCH_SHEET_HOST` wiring (done)
- Mobile redesign shape language (defer lane)
- Marketing site / BootSplash brand radii
- Inventing a second combobox/popover under `design-system/primitives`
- Raising ratchets or `KNOWN_ARBITRARY` to land a wave
