# Handoff — Displays Root-to-Leaf deferred layers (command footer · leaf search · w1/w2 · desk)

**For:** implementing agent (Claude Code / Cursor / Codex)  
**From:** Cycle Forge engineering  
**Date:** 2026-08-08  
**Status:** READY — nested-leaf grammar + footer stage + index enrichment are **SHIPPED**. This handoff is only the essay layers that SoT **deferred** (or banned without an explicit rewrite).  
**Lane:** stay on the checkout's branch · attach to **`:3050`** · never start/restart/kill the
dev server · **user owns commits**.  
**Product frame:** Cycle Forge multi-tenant reseller-ops SaaS; USAV is dogfood only.

**Predecessors (do not re-litigate):**

| Doc | Status |
|---|---|
| [`unbox-displays-right-panel-SOT-CLAUDE-CODE-PROMPT.md`](./unbox-displays-right-panel-SOT-CLAUDE-CODE-PROMPT.md) | Golden Root-to-Leaf host |
| [`station-displays-nested-tabs-HANDOFF.md`](./station-displays-nested-tabs-HANDOFF.md) | **DONE** — nested grammar locked |
| [`displays-leaf-back-breadcrumb-SOT-HANDOFF.md`](./displays-leaf-back-breadcrumb-SOT-HANDOFF.md) | **DONE** — one sticky Back |
| [`displays-leaf-verbs-armed-rows-SOT-HANDOFF.md`](./displays-leaf-verbs-armed-rows-SOT-HANDOFF.md) | Photos armed-row golden; Linkage/Units debt |
| [`displays-wms-terminal-binary-cut-HANDOFF.md`](./displays-wms-terminal-binary-cut-HANDOFF.md) | **IMPLEMENTED** — binary-cut arm |
| [`nav-keys-selection-keyboard-HANDOFF.md`](./nav-keys-selection-keyboard-HANDOFF.md) | Right/Displays P0+P1+P4 shipped; Middle P2 open |

**Paste for a new session:**

```
Read docs/todo/displays-root-to-leaf-deferred-SOT-HANDOFF.md and execute ONLY the
phase the user names (A · B · C · D · E). Default if unnamed: Phase 0 audit only
— do not invent footer command palettes or desk drill-down without an SoT amend.

Do NOT reopen Displays ≠ inspector (desk RightRailHost stays Context plane).
Do NOT remount TechRailSearchBar ("Filter displays…") on a leaf — footer is
stage-owned (index = filter; leaf = dismiss-only). Guard:
station-displays-footer-stage.guard.test.ts.
Do NOT eject-from-leaf-by-typing as a Back substitute.
Do NOT bind bare digits (wedge law). Prefer nav-keys / letter keys.
Do NOT import motion/react outside design-system/motion.
Do NOT raise knip / DS ratchet baselines.
Do NOT invent a second StationDisplaysPushStack or navMode.

Golden waist: src/components/station/displays/StationDisplaysPushStack.tsx
Law: .claude/rules/source-of-truth.md → Station Displays navigation
Attach to :3050. npm run verify before done.
```

---

## 0. Why this handoff exists

An operator essay proposed a full Root-to-Leaf Displays architecture:

1. Vertical rich index rows (no horizontal primary tabs)
2. Full-height leaf + sticky Back + Esc
3. Bottom command bar (filter · contextual leaf search · `/` actions)
4. Rows for subject nav · segment child buttons (w1/w2) for perspective
5. Three-layer toggle (visual = fallback)
6. Optionally the same drill-down on desk inspectors

**Validation (2026-08-08):** items 1–2 and the visual edge toggle already shipped as Station Displays SoT. Nested grammar was locked. Sibling stations got enriched `indexRows`.

**This handoff covers only what SoT still blocks or defers**, with an honest path to grow the SoT when the product wants those layers — not a silent fork.

---

## 1. Already shipped (do not rebuild)

| Essay piece | Shipped owner |
|---|---|
| No horizontal primary tabs | `StationDisplaysPushStack` — `navMode` / icon plate deleted |
| Root = rich rows (subtitle · tone · group) | `DisplayIndexRow` + Unbox/Pack/Testing/Arrival/Review/Support builders |
| Leaf = full height + sticky chrome + Esc | `StationDisplayLeafHeader` + visit history / nested trail |
| Bottom **index** filter + `→\|` | Index stage only — `TechRailSearchBar` |
| Leaf footer = dismiss only | `StationDisplaysDismissFooter` (no list-filter on leaf) |
| Character-select / armed cursor | `StationDisplayIndexList` + `useArmedCursorList` |
| Edge toggle fallback | `StationDisplaysEdgeToggle` + `⌘]` |
| Nested grammar | Parent verbs → armed rows (Photos golden) or secondary vertical (Inventory); child `segment` inside tools; Linkage/Units underline = **shrink-only debt** |

Guards that must stay green:

- `station-displays-nested-grammar.guard.test.ts`
- `station-displays-footer-stage.guard.test.ts`
- `station-displays-reachability.guard.test.ts`
- `tab-display-displays-hosts.guard.test.ts`
- `photos-actions-armed.guard.test.ts`
- `unbox-displays-drilldown.guard.test.ts`

---

## 2. Deferred / banned inventory (SoT blocking reasons)

| # | Essay ask | Status | Why SoT blocks today | Grow-SoT path (if product says go) |
|---|---|---|---|---|
| **A** | Bottom bar as **command palette** (`/print label`, `/mark exception`) | **Deferred** | Footer list-filter is **index-stage only**. Leaf mounts dismiss-only. Actions already have owners: station terminal dock, nav-keys, leaf Macro panels. A `/` palette would be a **second command surface** unless it composes those SoTs. | New SoT row: Displays footer **stages** = `index-filter` \| `leaf-dismiss` \| `leaf-command` (opt-in per leaf). Waist grows `StationDisplaysPushStack` footer slot; commands register from leaf hosts / terminal registry — never page-local fetchers. Wedge-safe: refuse in scan burst · no bare digits · yield to overlays. |
| **B** | **Contextual search inside a leaf** (e.g. tracking in Timeline) | **Deferred** | Same footer-stage law. Mounting `Filter displays…` on a leaf, or ejecting to index by typing, is explicitly **Never** (`station-displays-footer-stage.guard.test.ts`). | Per-leaf search is **leaf chrome**, not the column footer. Pattern: leaf owns a filter field in its body / Action dossier (like Photos armed list filter if needed), or a named `StationDisplaysLeafSearch` slot that **does not** call `goIndex()`. Never reuse index filter placeholder copy. |
| **C** | Named **w1 / w2** + **Alt+1 / Alt+2** | **Deferred** | Child perspectives already = `TabDisplay appearance="segment"`. Nav-keys SoT owns leader-armed **letters** (`⌘;`), not Alt+digit chords. Bare digits banned (wedge). Branding `w1`/`w2` without a keyboard owner forks muscle memory. | Map Alt+1/2 **only** onto the active leaf’s segment tabs (Claim New·Link, Move To·From, Prebox mode, Support Team·Activity) via one waist in `src/lib/keyboard/` — stand down when no segment mounted; never bind digits alone; document in nav-keys handoff P3, not a Displays-local twin. Optional face label “w1/w2” is copy-only. |
| **D** | **Three-layer toggle** as a new abstraction | **Not needed** | Already: (1) index/nav-keys primary, (2) Esc/Back, (3) visual `←\|`/`→\|` + `⌘]`. A fourth module would fork `StationDisplaysEdgeToggle`. | Polish docs/operator training only. If adding a chord layer, extend `displays-toggle-hotkey.ts` — never a second edge component. |
| **E** | Migrate **desk `RightRailHost` inspectors** to Root-to-Leaf | **Banned without SoT rewrite** | **Displays ≠ inspector.** Different host, noun, chords (`⌘]` vs Band 3 / `⌘\`), planes (Action vs Context). History/Orders topic strips are intentional. | Explicit constitution amend: either (i) keep dual, or (ii) define “desk dossier drill” as a *third* noun with its own host — never mount `StationDisplaysPushStack` on `RightRailHost`. Out of scope for this file unless product opens a new handoff. |
| **F** | Flatten **all** nested switchers to more Root Index rows | **Rejected** | Nested grammar: subject = index; verbs = armed rows / ≤1 debt underline; reference = secondary vertical. Flattening Photos Actions into index rows bloats subject nav or forces a second Back. | Finish **debt migration**: Linkage · Units → Photos-style armed rows ([`displays-leaf-verbs-armed-rows-SOT-HANDOFF.md`](./displays-leaf-verbs-armed-rows-SOT-HANDOFF.md)). Shrink allowlist to zero. |

---

## 3. Phase 0 — Audit only (default)

**Done when:**

1. Confirm guards in §1 are green (`npm run verify -- --fast` then full `npm run verify`).
2. Produce a one-page matrix: leaf × footer stage × segment child × whether leaf has in-body search today.
3. List any regression of “type on leaf ejects to index” (must be **gone** — footer stage SoT).
4. Stop. Do not implement A–C without an explicit phase name from the user.

**Files to read first:**

- `src/components/station/displays/StationDisplaysPushStack.tsx`
- `src/components/station/displays/StationDisplaysDismissFooter.tsx`
- `src/components/station/displays/station-displays-footer-stage.guard.test.ts`
- `src/components/station/displays/station-displays-nested-grammar.guard.test.ts`
- `.claude/rules/source-of-truth.md` → Station Displays navigation (Never bullets on footer + underline)

---

## 4. Phase A — Footer command stage (opt-in)

**Product intent:** On selected Action leaves, the bottom band can run **slash commands** without leaving the leaf — without destroying index filter.

**Hard rules:**

1. Index stage keeps `TechRailSearchBar` / `Filter displays…` / `→|` trailing.
2. Leaf default stays `StationDisplaysDismissFooter`.
3. `leaf-command` is **opt-in per leaf** (Ticket / Photos Macro / Inventory notes — measure first).
4. Commands compose existing SoTs: `STATION_TERMINAL_REGISTRY` intents, print helpers, `transition()` — never raw status SQL, never orgId from body.
5. `/` opens a dense flush command list (Kinetic Ledger — no soft pills, no second ⌘K).
6. Wedge-safe: overlay yield · burst detect · refuse-in-input · no bare digit binds.
7. Esc: command popover closes first; then existing leaf Esc grammar.

**Suggested waist:**

```text
StationDisplaysPushStack
  footerStage: 'index-filter' | 'leaf-dismiss' | 'leaf-command'
  leafCommandItems?: DisplaysFooterCommand[]  // from active leaf host
```

**SoT amend (required before merge):** one paragraph under Station Displays navigation — footer stages table + Never (no index filter on leaf; no eject-by-typing). Extend `station-displays-footer-stage.guard.test.ts`.

**Out of scope for A:** desk inspectors; Alt+1/2; renaming segment to w1/w2.

---

## 5. Phase B — Contextual leaf search

**Product intent:** Inside Timeline / Units / Inventory Activity, filter **that leaf’s rows** without popping to the Root Index.

**Hard rules:**

1. Search UI lives **in the leaf body** (or a named leaf chrome slot), not the column footer filter.
2. Placeholder copy must not say “Filter displays…” (that noun = index).
3. Must not call `onTabChange('index')` / `goIndex()` on keystroke.
4. Prefer reusing `TechRailSearchBar` with a leaf-specific `placeholder` + local state owned by the leaf host.
5. Guard: extend footer-stage guard — leaf hosts may import `TechRailSearchBar` only when **not** wired as the stack footer.

**Golden first leaf:** pick **one** (recommend Inventory Activity or Timeline) — prove the pattern, then clone.

---

## 6. Phase C — Segment chords (Alt+1 / Alt+2 ≈ w1 / w2)

**Product intent:** Global perspective flip inside the active leaf’s child segment strip.

**Hard rules:**

1. Only fires when a `TabDisplay appearance="segment"` is mounted and focused region is Right/Displays.
2. Bind **Alt+1 / Alt+2** (or Chord SoT chosen in nav-keys P3) — **never** bare `1`/`2`.
3. Single owner under `src/lib/keyboard/` — Displays hosts register segment targets; no per-leaf `window` listeners.
4. Optional UI: segment labels may show `w1`/`w2` micro hints on arm — reveal-on-arm only (nav-keys density law).
5. Stand down for open overlays · scan burst · focus in inputs.

**Do not** invent a parallel “Inspector Child Buttons” component — grow `TabDisplay` segment + keyboard waist.

**Prerequisite:** nav-keys P3 (second armed layer) awareness — read that handoff before binding.

---

## 7. Phase D — Debt finish (armed-row migration)

Not deferred by the essay, but the honest path to “no nested tabs”:

1. Migrate `LinkageDisplayHost` Link·Note → armed rows + URL (`linkageAction`) like Photos.
2. Migrate `UnitsDisplayHost` Units·Prebox → armed rows + URL (`unitsAction`); keep Prebox mode as child segment.
3. Shrink nested-grammar allowlist to empty; guard fails if a new underline parent appears.
4. Follow [`displays-leaf-verbs-armed-rows-SOT-HANDOFF.md`](./displays-leaf-verbs-armed-rows-SOT-HANDOFF.md).

---

## 8. Phase E — Desk inspectors (explicit rewrite only)

**Default: do not start.**

If product opens this:

1. New handoff name (not this file) — “desk dossier drill” or similar.
2. Constitution amend in `AGENTS.md` + `source-of-truth.md` + `display/right-rail-inspector.md`.
3. **Never** seat `StationDisplaysPushStack` inside `RightRailHost`.
4. Preserve Band 3 / `⌘\` inspector chords; do not steal `⌘]`.

---

## 9. Definition of done (per phase)

| Phase | Done |
|---|---|
| 0 | Audit matrix + verify green; no product code |
| A | Footer stage enum + one leaf opt-in + SoT + footer-stage guard + verify |
| B | One leaf in-body search + SoT Never stays true for stack footer + verify |
| C | Alt+1/2 waist + segment registration + nav-keys note + verify |
| D | Linkage + Units off underline allowlist + nested-grammar guard empty allowlist + verify |
| E | Separate handoff + constitution amend only |

Always: `npm run verify` green; never raise knip / DS baselines; user owns commits.

---

## 10. Operator essay → house answer (cheat sheet)

| Essay line | House answer |
|---|---|
| “Delete traditional horizontal tabs completely” | **Primary nav:** yes (Root Index). **Inside leaf:** armed rows / secondary vertical / child segment — not browser tabs. |
| “Bottom command bar” | Index = filter. Leaf = dismiss. Commands = Phase A SoT growth. |
| “Contextual searching in detail view” | Phase B — leaf-owned, not footer filter. |
| “`/print label` from search” | Phase A — compose terminal/print SoT. |
| “w1/w2 segmented controls + Alt+1/2” | Segment already exists; chords = Phase C via nav-keys. |
| “Three-layer toggle” | Already shipped as edge + chord + Esc; no new module. |
| “Same pattern on desk right panel” | Phase E — Displays ≠ inspector; rewrite required. |

---

## 11. Files map

| Concern | Path |
|---|---|
| Push stack / footer stages | `src/components/station/displays/StationDisplaysPushStack.tsx` |
| Leaf dismiss footer | `src/components/station/displays/StationDisplaysDismissFooter.tsx` |
| Index filter model | `src/components/station/displays/display-index.ts` |
| Nested grammar guard | `src/components/station/displays/station-displays-nested-grammar.guard.test.ts` |
| Footer stage guard | `src/components/station/displays/station-displays-footer-stage.guard.test.ts` |
| Photos armed golden | `src/components/receiving/workspace/line-edit/PhotosDisplayHost.tsx` |
| Debt underline hosts | `LinkageDisplayHost.tsx` · `UnitsDisplayHost.tsx` |
| Edge toggle / chord | `StationDisplaysEdgeToggle.tsx` · `displays-toggle-hotkey.ts` |
| Nav-keys waist | `src/lib/keyboard/nav-keys/` |
| Law | `.claude/rules/source-of-truth.md` · `display/station-workbench.md` · `display/right-rail-inspector.md` |
