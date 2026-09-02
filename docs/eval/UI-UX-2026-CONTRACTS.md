# Cycle Forge — 2026 native AI-app UI/UX contracts

**Status:** contract of record for interaction + composition quality.  
**Does not replace** TypeScript cohorts, `pinned.json`, or `motionRole`. Those remain SoT. This file names the **bar**, maps it onto **existing primitives**, and specifies **heavy contracts** so an agent cannot fork a second hover, a second motion recipe, or a second icon button — and so the operator does not restate the same laws in chat.

**Product:** Cycle Forge is a 2026 multi-tenant B2B warehouse/fulfillment OS. The bar is Manus / Lovable / Cursor / Stripe / [Kiro](https://kiro.dev) **as interaction quality**, not as chrome to copy. A packing bench is not a pastel codegen playground. USAV is the first dogfood tenant only.

**Stale cousin:** [`docs/operations-studio/Full Code Base Upgrade/03-DESIGN-LANGUAGE-2026.md`](../operations-studio/Full%20Code%20Base%20Upgrade/03-DESIGN-LANGUAGE-2026.md) still says Notion×Linear, `bg-slate-50`, and “spring for state changes.” **Do not follow that file for new work.** Colour is theme tokens (`--ds-color-*`). Motion is `motionRole` jobs. Icons-first is `IconButton` / `IconActionFloor` / `src/components/Icons.tsx`, not a new registry.

---

## 0. Why this file exists

Agents already ship valid React that **quietly forks interaction**:

- a lucide `<svg>` wrapped in a raw `<button>` with no hover, or a one-off `hover:bg-slate-100`
- `transition-all duration-300` next to a sibling that uses `motionRole.swap.scan`
- a second “icon toolbar” that is not `IconActionFloor`
- a second composer, a second table, a second date field

The operator should not have to say “icons need hover” or “use the house motion” again. Those sentences belong in **oracles + primitives + pins**, which this document specifies.

**How repeating yourself stops**

| You used to type | After pins land, a one-line prompt expands to |
|---|---|
| “make sure the icon has hover” | `ds_contract` → `IconButton` (tone owns hover) |
| “animate this like the other stations” | `motionRole.swap.scan` or `.focus` (overlay already greps it) |
| “add a little icon toolbar” | `IconActionFloor` + `IconButton size="fill"` |
| “spring it / 300ms / transition-all” | **refuse** — pick or change a role preset |

Until the pins in §5.2 are in `pinned.json`, this file is the brief. After they land, **stop pasting this file into chat.**

The 2026 AI-app bar is the **quality target** for those contracts: dense, keyboard-first, one mouth, optimistic, spec-before-code, motion as feedback, every control stateful (hover / focus / active / disabled / reduced-motion).

---

## 1. The bar (translate, do not clone)

Borrow **behaviors**. Never borrow their visual skins, marketing layouts, or chat-as-the-whole-product.

| Product | What we take | What we refuse | Cycle Forge mount |
|---|---|---|---|
| **Cursor** | One composer is the mouth. Keyboard is first-class. Agent uses tools; the UI does not grow a second prompt. Inline teaching (`?`) not standing chrome. Density. | IDE titlebar, file tree, ChatGPT-bubble canvas as the warehouse HUD | `StationComposerHost` · `KeyboardKey` · shortcut cohort · DeskPageChrome |
| **Stripe Dashboard** | Token contracts. Status colour = meaning, never decoration. Tables that sort. Empty states that are settled, not pulse soup. Docs-quality precision | Purple gradients, marketing illustration, “friendly” copy on a scan well | `--ds-color-*` · `DataTable` · `SLOT_TABLE_PAINT_LAW` · `GridCellDash` |
| **Lovable** | Compose from the catalog. Preview is the real primitive. No second Button | Pastel generation playground; inventing components because the catalog “didn’t match the vibe” | `ds_contract` → `mount` + `pickVariant` · `pinned.json` |
| **Manus** | The agent **does the work**. Progress is a receipt, not a spinner story. Task = session | Consumer onboarding carousel; a second chat dock beside the station mouth | Work sessions · eval LEDGER / future session receipts · one composer |
| **Kiro** | Specs and hooks **before** code. Steering files the model cannot ignore. Hooks as Host | A 10k-line constitution the model never opens | `pinned.json` + cohort TS + `machine-gate.mjs` + design-mcp stamp |

**One sentence:** Cursor’s mouth + Stripe’s contracts + Lovable’s catalog + Manus’s work-not-chat + Kiro’s spec-before-code, on a Warehouse OS HUD.

---

## 2. Non-negotiable product laws (already live)

These are not optional “inspiration.” Agents that violate them have forked.

| Law | Mount / file | Fork looks like |
|---|---|---|
| One composer | `StationComposerHost` | `*NotesComposer`, raw `OmnichannelComposerDock` as the mouth, `showModeRow={false}` |
| One table engine | `DataTable` + `useSlotTableLayout` + `CompoundItem` | `*_GRID_COLUMNS` + `*GridRow` switch, `FilterRefinementBar`, hunt tiles |
| One keycap | `KeyboardKey` | local `<kbd>`, standing letters, cheat sheet from staff `?` |
| One in-cell date | `DateRangePickerField variant="compact"` | `type=date`, `InlineEditableValue`, `variant="range"` in a cell |
| One overlay shell | `SCAN_STATION_OVERLAY_COHORT` | Pack-as-golden, delete `visibility` / `zIndex.panel` |
| Two Buttons, two jobs | DS `Button` vs `@/components/ui/button` | a third `<button className>` |
| Colour is tokens | `ds_tokens({ axis: "color" })` | hex, `bg-slate-*`, `text-blue-600` as identity |
| Station paint is a skin | `applyStationSkin` | hex-fill a well, fork packing-bench class |
| Motion is a **job** | `motionRole` | duration literals, `transition-all`, new spring per file |

---

## 3. Interaction contracts (the 2026 control bar)

Every **interactive** control is a state machine. Idle is not the only face.

### 3.1 Required faces (pointer + keyboard + reduced motion)

| Face | When | Token / primitive rule |
|---|---|---|
| **Idle** | default | Semantic colour (`text-text-soft` / `text-text-default`), never a hex |
| **Hover** | pointer devices | Owned by the **primitive**. Colour/opacity only. `hover:bg-surface-hover` / `hover:text-text-default` via `--ds-color-surface-hover`. Duration house: `transition-colors` ≤ 100–150ms **or** `motionRole.feedback.pulse` — not a third recipe |
| **Focus-visible** | keyboard | `focusRing(archetype, tone)` — never a hand-rolled `focus:ring-*`. Mouse click must not flash the ring (`:focus-visible`) |
| **Active / pressed** | pointer down | `motionRole.gesture.press` (`whileTap`) **or** the primitive’s declared `active:`. `IconButton` today uses `active:scale-95` + `duration-100`; **upgrade path** is to consume `useMotionRole(motionRole.gesture.press)` so press physics cannot drift. Scale is transform (legal). Do not add a width/height tween |
| **Disabled** | `disabled` | Opacity + `cursor-not-allowed` from the primitive. Do not invent a grey hex |
| **Reduced motion** | `prefers-reduced-motion` | `useMotionRole` already drops `whileTap`. Pulses become instant. Never ship a 0.9 scale that **snaps** — no press is better (role comment) |

**Station / glove caveat:** hover is **not** the only affordance. A gun station has no hover (`pinned.json` already bans hover-only submenus). Colour hover on `IconButton` is still required for desks; the control must remain obvious via size, label, or selected underline (`ICON_ACTION_FLOOR_CELL_ACTIVE_CLASS`) without a pointer.

### 3.2 Icons — one button, hover included

`ds_contract "icon button hover glyph toolbar action"` already returns **`IconButton`** (`declares`: hover, focus-visible, disabled, active, aria) and **`IconActionFloor`**, **`CopyIconButton`**. Those matches have **no `useWhen` / `doNot`** in `pinned.json` today. That absence is “unwritten,” not “anything goes.”

**Contract (heavy):**

| Job | Mount | Do not |
|---|---|---|
| Glyph that **does something** | `IconButton` from `@/design-system/primitives/IconButton` | lucide in a raw `<button>`; `title`-only with no `ariaLabel`; skip `tone` hover; `h-*`/`w-*` on the call site (control-size axis owns the box) |
| Equal icon peers on a floor (More · … · Delete) | `IconActionFloor` + `IconButton size="fill"` + `ICON_ACTION_FLOOR_CELL_CLASS` | floating `w-11` islands; `justify-between` gutters; a desk-local “icon rail” |
| Copy a value as a glyph | `CopyIconButton` | a second clipboard button |
| Ops CTA with a leading icon | DS `Button` `icon=` | IconButton pretending to be a labeled CTA |
| shadcn-lane icon trigger | `@/components/ui/button` `size="icon"` | mixing this with ops `IconButton` for the same job |
| Concept → glyph | `src/components/Icons.tsx` (one concept, one icon, forever) | a second icon for the same concept; emoji as chrome |

Hover is **not** a call-site class **except** the one escape the primitive already documents: micro row actions may add `hover:bg-surface-sunken` (ghost wash on a hairline row). That is still a token, not a slate hex. Inventing `hover:bg-slate-100` or a per-desk `hover:` on `tone` is a fork.

`IconButton` tones (owned by the primitive):

- `neutral`: `text-text-soft hover:text-text-default`
- `accent`: `text-text-soft hover:text-blue-600` — **token debt:** accent hover should resolve `--ds-color-accent-hover`, not a bare `blue-600`. Pin that when the primitive is pinned. Press today is Tailwind `active:scale-95` + `transition-colors duration-100` — **do not** add a second press at the call site; migrate onto `motionRole.gesture.press` in the primitive (§8).

Floor cell hover (already in the primitive):

```
ICON_ACTION_FLOOR_CELL_CLASS =
  '... text-text-soft transition-colors hover:bg-surface-hover hover:text-text-default'
```

Selected peer uses a **2px transparent → solid** bottom border so active does not layout-shift. That is the Stripe/Cursor rule: state without geometry jump.

### 3.3 Motion — one method: name the job

**Exact method:** import `motionRole` from `@/design-system/motion/roles` and consume via `useMotionRole` / `useMotionPresence` / `useMotionTransition`. Feature code **never** invents stiffness, damping, or `duration: 0.3`.

If the job exists, **change the preset** (every surface with that job updates). Do not add a role because you wanted a different duration.

| Job | Role | Legal regions | Do not |
|---|---|---|---|
| Scan-cadence entity swap | `motionRole.swap.scan` | station | “Normalise” to `swap.focus`; wait on exit (exit duration is 0 on purpose) |
| Pointer focus / detail swap | `motionRole.swap.focus` | workbench, monitor, canvas | Use on a gun-station scan swap |
| Rail / column that reflows siblings | `motionRole.push.rail` | workbench, monitor, station | Spring (overshoot wrecks sibling layout); `x` translate on a width tween |
| Finger press | `motionRole.gesture.press` | station, workbench | Press under reduced motion (suppress, don’t snap) |
| Copy / commit flash on a **mounted** node | `motionRole.feedback.pulse` | station, workbench | Slide or layout-shift a grid cell |
| Selection / hit on a mounted pager | `motionRole.feedback.hitMarker` | station, workbench | Gate Displays rail paint on this |
| Remote value change on a row you are not looking at | `motionRole.feedback.liveChange` | station, workbench, monitor | Use for “I just clicked this” (that’s pulse/hitMarker) |
| Progress fill | `ProgressBar` pin: `scaleX` + `framerDuration.progressFill` | — | Animate `width` / `height` / position |

Overlay tripwire **already** greps `motionRole.swap.(scan|focus)`. That is the template for other jobs: grep the role, not the millisecond.

**M1/M2 (Warehouse OS):** no width/height/top/left/margin/padding tweens. Colour and opacity. Transform is legal where the pin says so (`scaleX` fill, press scale, liveChange scale+ring). `transition-all` is a fork. `behavior: smooth` scroll is a fork (ProcedureDeck pin).

There is **no `ds_tokens` motion axis today**. Do not invent durations in Tailwind to fill the gap. Optional upgrade (later): `ds_tokens({ axis: "motion" })` that **only** lists role names, not physics numbers.

---

## 4. Heavy composition contracts (nothing repeats)

One job → one mount. If `ds_contract` returns a `mount` / `pickVariant`, that is the face.

| Operator / agent says | Contract returns | Repeating yourself looks like |
|---|---|---|
| icon, glyph, toolbar icon, hover icon | `IconButton` (+ pin, once written) | “make sure it has hover” in the prompt |
| icon floor, inspector actions, displays macros | `IconActionFloor` | a second icon row per desk |
| button, submit, confirm | DS `Button` + `pickVariant` | a rounded one-off |
| quiet overlay trigger | `ui/button` ghost | ops Button on shadcn chrome |
| table, sort, filter, columns | `DataTable` + paint law | “just this desk’s grid” |
| date in a cell | `DateRangePickerField` compact | “add a date picker” |
| filter the table | `DataTableFilterMenu` | hunt tiles, FilterRefinementBar |
| station mouth, omni, notes | `StationComposerHost` | second textarea |
| no Unbox\|Ticket | `showModeFaces={false}` | `showModeRow={false}` |
| overlay / idle browse | cohort workspace predicates | unmount idle, raw z-index |
| shortcut on the button | **refuse standing**; `?` + `KeyboardKey` | standing keycaps |
| page header, desk frame | `DeskPageLayout` / `DeskPageChrome` / `DeskActionSlot` | a local title row |
| station colour | `station-skin` + `applyStationSkin` | hex on Unbox |
| hover wash | `--ds-color-surface-hover` / `hover:bg-surface-hover` | `hover:bg-slate-100` |
| focus | `focusRing('control' \| 'field', 'accent')` | `focus:ring-2` |

**Catalog walk is non-recursive.** A nested “pretty” icon button in a subdirectory is invisible to `ds_contract` and **will be forked**. Flatten or extend the walk — do not hide a primitive.

---

## 5. How this stays in the system you already have

Do not add `eval:cohort icons` or a motion constitution. Extend the four oracles.

### 5.1 Primitive (behavior lives here)

Hover, focus, active, disabled, reduced-motion **on `IconButton` / `Button` / `IconActionFloor`**. Call sites pass `tone` / `size` / `icon`. They do not pass a hover class unless the primitive documents an escape (`ds-allow-*`, or IconButton’s micro-row `hover:bg-surface-sunken`).

### 5.2 `pinned.json` (what `ds_contract` can say)

**Gap measured 2026-09-01:** `IconButton`, `IconActionFloor`, `CopyIconButton` are in the `ds_contract` walk (`src/design-system/primitives/*.tsx`) and have **no curated `useWhen` / `doNot`**. Until they are pinned, agents will keep asking you for the law.

`motionRole` lives in `src/design-system/motion/roles.ts`. That directory is **not** a `PRIMITIVE_HOMES` entry in `tools/design-mcp/server.mjs`. A `"motionRole"` key in `pinned.json` today would merge onto nothing — law no agent can find (the same failure that required adding `DeskPageLayout` as a home). Pin motion **only after** adding a home (flat `roles.ts` match), or route motion jobs through overlay tripwire + critique until that home exists.

Promote, small entries, cite this file + the primitive path. Pin keys are **filename ids** (`IconButton` from `IconButton.tsx`; shadcn `dialog` from `dialog.tsx` — never invent a second casing):

```json
"IconButton": {
  "useWhen": "icon button, glyph action, toolbar icon, hover icon, icon-only control, inspector glyph, floor peer icon",
  "doNot": "Do not wrap lucide in a raw <button>. Do not omit ariaLabel. Do not skip hover — tone owns idle/hover. Do not set h-* / w-* on the call site. Do not use this for a labeled ops CTA (that is Button). Station gloves: hover is not the only affordance; keep size=fill / selected underline. Accent hover uses --ds-color-accent-hover, not a one-off blue class at the call site. Micro row ghost wash is hover:bg-surface-sunken only, documented on the primitive.",
  "law": "src/design-system/primitives/IconButton.tsx. docs/eval/UI-UX-2026-CONTRACTS.md §3.2."
},
"IconActionFloor": {
  "useWhen": "icon action floor, inspector macros, station displays peer icons, equal icon columns, more-delete floor",
  "doNot": "Do not invent a second icon toolbar. Peers are IconButton size=fill. Hover/selected classes are ICON_ACTION_FLOOR_CELL_*. Park/close chrome is a separate row.",
  "law": "src/design-system/primitives/IconActionFloor.tsx. docs/eval/UI-UX-2026-CONTRACTS.md §3.2."
},
"CopyIconButton": {
  "useWhen": "copy as glyph, clipboard icon button, copy field icon",
  "doNot": "Do not invent a second clipboard button. This is the glyph cousin of CopyChip, not a labeled CTA.",
  "law": "src/design-system/primitives/CopyIconButton.tsx. docs/eval/UI-UX-2026-CONTRACTS.md §3.2."
}
```

After a motion catalog home exists:

```json
"roles": {
  "useWhen": "animation, motion, transition, overlay swap, rail push, press feedback, copy flash, live cell update, hit marker, motionRole",
  "doNot": "Do not invent duration/stiffness at the call site. Do not use transition-all. Do not tween width/height/position. Pick a motionRole job; change the preset if the job is wrong. Overlay swap is swap.scan or swap.focus. Press is gesture.press. Reduced motion: suppress press, do not snap scale. procedure.advance is deferred — do not wire it without amending SoT.",
  "law": "src/design-system/motion/roles.ts. docs/eval/UI-UX-2026-CONTRACTS.md §3.3. Warehouse OS M1/M2."
}
```

The pin key must be the **filename** (`roles`, not `motionRole`) once that file is on the walk.

### 5.3 `ds_contract` aliases (vague prompt → mount)

When implementing the prompt-router / contract aliases, these jobs must resolve without the operator repeating themselves:

| Job string | Mount |
|---|---|
| `icon with hover` / `toolbar glyph` | `IconButton` |
| `icon floor` / `inspector icon actions` | `IconActionFloor` |
| `animate overlay` / `station swap` | `motionRole.swap.scan` |
| `animate focus pane` | `motionRole.swap.focus` |
| `press feedback` | `motionRole.gesture.press` |
| `copy flash` / `cell ack` | `motionRole.feedback.pulse` |
| `remote row changed` | `motionRole.feedback.liveChange` |

### 5.4 `ds_critique` (heuristic, after the edit)

Add findings (not a new tool):

- clickable glyph / lucide-as-button without `IconButton`
- `hover:bg-slate-*` / hex hover
- `transition-all` / `duration-300` / `duration-[`
- `framerMotion` / `transition:` object without `motionRole` / `useMotionRole`
- `animate-pulse` empty state (honest-absence ratchet already exists — keep shrinking)

Critique remaining heuristic: **do not delete overlay `visibility` / `zIndex.panel` to silence it.**

### 5.5 Graph

Before changing hover physics or icon box sizes: `find_symbol IconButton` → `impact_analysis`. Same for `motionRole` / `useMotionRole`. Blast radius is every desk and station, not one toolbar.

### 5.6 Eval / tripwire (only where a class of surfaces must not drift)

| Already | Add later (shrink-only) |
|---|---|
| Overlay greps `motionRole.swap.(scan\|focus)` | Engine-contract or ESLint: no new `transition-all` in `src/components` |
| Slot-table paint law | Not an icons cohort |
| `ds-allow-control-size` ratchet on IconButton boxes | Hard ban when live count is 0 |
| Honest-absence pulse baseline | Keep shrinking |

**Do not** stand up `eval:cohort hover`. Hover is primitive law. Overlay motion is already a cohort predicate because every floor station must swap the same way.

### 5.7 Repair law (machine-gate)

When eval is red, repair stays paint-frozen. Adding hover by restyling a desk row is a fail. Fix the primitive or the pin.

---

## 6. 2026 AI-app UX mapped to this HUD (so quality has a file)

Use this as the **acceptance taste** after contracts pass. Operator verdict on LEDGERs still wins over this section.

| Quality | Looks like here | Does not look like |
|---|---|---|
| Instant | Scan swap exit 0; compact date click-commits; optimistic `useOptimisticMutation` | Waiting on a modal “Save” for ship-by; 300ms overlay black |
| Stateful controls | Every `IconButton` idle/hover/focus/active/disabled | Dead headers; glyphs that do nothing on hover |
| One mouth | Composer is the only free-text; filters are `DataTableFilterMenu` | Search in the composer **and** a hunt-tile strip |
| Keyboard | Bindings always live; `?` teaches; `focusRing` | Hover-only station menus; standing keycaps |
| Spec first | `ds_contract` then code; cohort then desk | “I’ll match Pack by eye” |
| Receipt of work | LEDGER snapshots; later session receipts (Fable D3) | Chat that says “done” with no eval |
| Density | Floor density 44px controls; desks compact without shrinking type into 10px magic | `text-[10px]` literals; padding knobs per page |
| Honesty | Settled empty, em dash, no fake pulse | Skeleton forever, `"N/A"` soup |

---

## 7. Forbidden (fork catalog)

If you are about to do one of these, stop — the contract already named the mount.

- New `HoverIcon` / `AnimatedIcon` / `MotionButton` primitive
- `eval:cohort icons` or `eval:cohort motion`
- Restating hover/motion in `AGENTS.md` at essay length (a pin + this file is enough)
- Copying Lovable/Manus layout, Cursor activity bar, Stripe marketing purple
- `transition-all`, geometry tweens, `behavior: smooth`
- Hover-only affordance on a scan station
- Call-site `hover:` on an `IconButton` to “make it 2026”
- A nested component folder so `ds_contract` cannot see the SoT
- Following `03-DESIGN-LANGUAGE-2026.md` slate/spring guidance for new UI

---

## 8. Implementation order (when a coding agent is told to land this)

One session, one layer. Do not boil the ocean.

1. **Pin** `IconButton`, `IconActionFloor`, `CopyIconButton` in `pinned.json` (text in §5.2). These files are already on the walk.
2. **Accent hover token** on `IconButton` `tone="accent"` → `--ds-color-accent-hover` / `hover:text-accent` if a utility exists — `ds_tokens({ axis: "color", filter: "hover" })`.
3. **Press** on `IconButton`: prefer `useMotionRole(motionRole.gesture.press)` over a second `active:scale-95` if that does not regress reduced-motion.
4. **Motion catalog home** (only if `ds_contract "overlay swap"` still cannot name `roles`): add `src/design-system/motion` with `match: /^roles\.ts$/` to `PRIMITIVE_HOMES`, then pin `"roles"` (§5.2). Do not pin `"motionRole"` onto nothing.
5. **`ds_critique` heuristics** for lucide-raw-button + `transition-all`.
6. **Graph** impact on `IconButton` after (2)/(3); `eval:cohort slot-table` / `eval:station` if desks/stations dirty.
7. **Optional:** `ds_tokens` motion axis that lists **role names only**.
8. **Never:** a new display cohort; Operator verdict invented; KEEP rows deleted.

Done means: a prompt that is only `"icon in the toolbar"` still mounts `IconButton` with hover, and `"animate the overlay"` still mounts `motionRole.swap.scan` or `.focus`, without the operator repeating this file.

---

## 9. Related SoT

| File | Role |
|---|---|
| `src/design-system/primitives/IconButton.tsx` | Glyph control + hover/focus/active |
| `src/design-system/primitives/IconActionFloor.tsx` | Icons-first floor |
| `src/design-system/primitives/CopyIconButton.tsx` | Copy-as-glyph |
| `src/design-system/motion/roles.ts` | Job → physics |
| `src/design-system/pinned.json` | `ds_contract` prose |
| `src/lib/tables/slot-table-cohort.ts` | Display eval |
| `src/lib/station/scan-station-overlay-cohort.ts` | Overlay swap motion grep |
| `src/lib/keyboard/shortcut-display-cohort.ts` | Teaching vs standing chrome |
| `docs/eval/FABLE-5.1-SYSTEM.md` | Agent loop + refuse |
| `docs/warehouse-os/LAWS.md` | M1/M2, I8, F11 |
