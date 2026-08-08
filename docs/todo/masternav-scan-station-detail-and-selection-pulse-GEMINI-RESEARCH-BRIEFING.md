# Research briefing — Scan Stations exact color detail + selected-row pulse feedback

**For:** Gemini Pro (deep research)
**From:** Cycle Forge engineering
**Date:** 2026-08-07
**Subject:** Two open questions left after reinstating MasterNav spine section color: (A) does
**Scan Stations** need per-bench color detail beyond its one section amber + the Repair
exception, and (B) should the **selected/active row** carry a **pulse** (a looping or
attention-drawing animation) as extra confirmation feedback, on top of the static fill it already
has.
**Status:** OPEN — nothing below is shipped. This is the research pass before either becomes a
`CLAUDE-CODE-PROMPT` / `HANDOFF`. The engineering-default column in §6 states our working lean,
not a ruling — overturn it with named product evidence, don't just disagree with it.

**Do not re-litigate — already decided and shipped this session (2026-08-07):**

| Prior decision | Already shipped |
|---|---|
| Neutral spine (2026-08-02–08-07) → reinstate per-section color | Done — `spine-section-accent.ts` carries `SPINE_SECTION_ACCENTS`, a total `Record<SpineSectionId, …>`, one hue per section |
| Three registries disagreed on "repair" (violet vs. orange) | Resolved to orange — `receiving-type-meta.ts` REPAIR now matches `functional.repair` / `TicketChip` |
| Repair Service (a *station*, not a section) needed to read as orange without repainting all of Scan Stations | Shipped as `REPAIR_ICON_TINT` — overrides only the Repair row's icon inside Scan Stations' amber; wash/fill on that row stay the section's |
| MasterNav row padding (top/bottom margin + padding throughout) | Removed — every row is box-to-box flush, no inter-row gap |
| `serial-status-display.ts`'s separate violet "post-sale" family (Returned/RMA/In repair/Repaired) | Left alone on purpose — that's a lifecycle-STAGE grouping color, not an identity color, and changing it would silently split a deliberate grouping |

Full context for all of the above: `docs/todo/masternav-color-reference` lineage (this session)
and `source-of-truth.md` → *MasterNav spine accent*.

---

## 0. How to use this brief

You do not have the codebase. Facts below were measured 2026-08-07, in this exact session, against
the live registry.

Three deliverables:

1. **Industry pattern for (A)** — in WMS / ops-floor / scan-station software specifically (not
   general SaaS sidebars), how granular does color-coding for individual workstations/benches get?
   One color per zone, or does every bench inside a zone also get distinguished? Name products.
2. **Industry pattern for (B)** — does any professional dense-ops or dev-tool product use a
   *persistent, looping* pulse/glow on the currently-selected nav item as "you are here" feedback,
   as opposed to a one-shot settle animation or a static fill? Name products either way.
3. **Answer §5 with sources**, then take a side on §6's two open decisions. Prefer a migration
   order an engineer can paste — not a framework.

---

## 1. Product vocabulary

**Cycle Forge** — multi-tenant reseller-ops SaaS (USAV = dogfood tenant only). House identity is
**Kinetic Ledger**: dense, state-colored, scan-aware chrome — legible throughput over document
calm. Four region contracts (Station / Workbench / Monitor / Canvas); the MasterNav spine is
navigation chrome, not a region itself.

**Spine** = 240px resident **push** column (`SidebarNavColumn` → `MasterNav` → `MasterNavView` →
`SidebarNavList`). Body is a flat map of domain sections in a fixed order, with **Scan Stations
first** because the benches are what the floor operator opens most. One section — Scan Stations —
is a Vercel-style list-replace drill (root row → Back + benches); every other section renders its
pages directly on the flat map.

**Station** (region contract) = a scanner-driven, act-and-clear bench — as opposed to Workbench
(pointer pick+edit), Monitor (observe-only), Canvas (graph). Every row under "Scan Stations" in the
spine points at a **Station**-contract page.

---

## 2. Measured anatomy — Scan Stations, exact detail (2026-08-07)

The section holds **7 benches** in two tiers: a nested **Receiving** subgroup (4 members, one
shared disclosure header) and **3 flat peers** after it.

```
Scan Stations  (section id: floor)            ← root row, amber-700 fill, » drill chevron
└─ [drill opens: Back to pages]
   Receiving  (subgroup header, own disclosure ▾)
   ├─ Arrival        (id: triage,   href /triage)   — icon: RECEIVING_NAV_ICONS.triage
   ├─ Unbox          (id: receive,  href /unbox)     — icon: RECEIVING_NAV_ICONS.receive
   ├─ Local Pickup   (id: pickup,   href /pickup)    — icon: RECEIVING_NAV_ICONS.pickup
   └─ Repair         (id: repair,   href /repair)    — icon: RECEIVING_NAV_ICONS.repair  ← ONLY member with its own tint (orange icon, functional.repair)
   Testing           (id: tech,     href /test)      — icon: STATION_PAGE_ICONS.tech
   Packing           (id: packer,   href /pack)      — icon: STATION_PAGE_ICONS.packer
   Scan out          (id: scan-out, href …scan-out)  — icon: SHIPPING_NAV_ICONS['scan-out']
```

**Current color state, exactly:**

| Row | Fill / wash | Icon |
|---|---|---|
| Scan Stations (root, drill enter) | `bg-amber-700` solid (active) | white |
| Receiving (subgroup header) | `bg-amber-600/15` wash (active/expanded) | `text-amber-600` |
| Arrival, Unbox, Local Pickup | inherit section wash via `renderChildLikeRow` | `text-amber-600` (active) / `text-text-muted` (idle) — **no distinct tint** |
| **Repair** | inherits the same section wash as its siblings | **`text-orange-600`, always** — the one exception, wired via `iconClassOverride` keyed on `id === 'repair'` |
| Testing, Packing, Scan out | inherit section wash (flat siblings of Receiving, same section) | `text-amber-600` (active) / `text-text-muted` (idle) — **no distinct tint** |

**The open question this raises:** Repair is the *only* bench with an identity distinct from
"Scan Stations amber," and it earned that distinction for a reason specific to it (a live
cross-registry naming conflict this session had to resolve — see the do-not-relitigate table).
Nothing else about Testing, Packing, Scan out, Arrival, Unbox, or Local Pickup was researched for
whether *they* also deserve a bench-level identity, or whether "one section color + one earned
exception" is actually the correct level of granularity for a scan-floor nav. That's §3(A) below.

**Contrast/shade discipline already established** (do not re-derive): Scan Stations sits at
`amber-700` because `amber-600` on white fails WCAG AA (≈2.9:1) for 12px text; the same AA-driven
700-vs-600 split applies to Support (orange), Inventory (cyan), Inbound (teal), Sales (green).

---

## 3. The two open questions

### 3(A) — Scan Stations exact detail: is section-level + one exception enough?

Full research from earlier this session already found the **physical-WMS-floor** convention: one
color per *zone* (e.g., green=Receiving, blue=Bulk, orange=Pick, red=Ship) — not one color per
individual pick location or task inside a zone. That would argue **against** giving Testing,
Packing, Scan out, Arrival, Unbox, and Local Pickup their own hues: they're all inside one zone
("the floor"), and over-coloring them would reproduce the exact "paint chart, not chrome" objection
that got the whole spine de-colored in the first place (2026-08-02).

But Cycle Forge's Scan Stations section isn't one physical zone — it's **7 sequential pipeline
stages** a unit moves through (intake → grade → test → pack → ship), which is closer to a
**process/workflow map** than a warehouse floor plan. Workflow-stage UIs (kanban boards, order
pipelines, CI/CD stage views) commonly *do* give each stage its own identity mark — but usually as
a **status color on the ENTITY moving through the stages**, not as a permanent color on the **nav
control that opens that stage**. Cycle Forge already has that: `workflowStageDot` / status pills
inside each station's own work surface. The nav row itself is a different thing — a destination,
not a status.

**Research this**, don't assume it: does any real product color-differentiate *sibling* nav rows
inside one already-colored parent group (the way each of the 7 benches might get its own hue on
top of Scan Stations' amber), or does the parent's color plus the icon/label carry each bench's
identity and industry leaves it there? If precedent exists for the former, at what N (row count)
does it start, and does the *order* of stages get any additional visual encoding (e.g., a subtle
gradient/progression from bench 1 → bench 7, distinct from Repair's hue, which is a genuine
category exception rather than a stage)?

### 3(B) — Selected-row pulse: extra feedback, or a solved problem?

The currently-selected/active spine row already gets: a solid section-hue fill (`bg-amber-700` for
a Scan Stations page, etc.), white/high-contrast text, and an inset ring (`ring-1 ring-inset
ring-{hue}-400/30`) that seats it as a "machined chip." That's the full extent of "you are here"
feedback today — static, no motion.

**The ask is whether that's enough, or whether a *pulse* — some form of looping or repeating
motion cue — should be layered on top**, specifically to give the operator stronger confirmation
feedback that a click registered and this is now the selected item.

This runs directly against a standing, guarded house rule, and the research needs to engage with
it rather than route around it:

> **MasterNav row hover/press travel — There is none.** Nothing in the spine moves. A structural
> anchor in a 20-row column should not travel under the pointer… never a framer `whileHover` on a
> spine row (a re-render per mousemove across 20 rows for travel the compositor gives free), never
> a row-level `scale`… Hover is `transition-colors` and nothing else.
> — `source-of-truth.md` → *MasterNav row hover/press travel*, enforced by
> `main-nav-groups.guard.test.ts`

That rule was about *hover* travel specifically (a glyph lift, since deleted). A **selection pulse**
is a different claim — not "move on hover," but "animate persistently once selected" — so it isn't
automatically covered by the existing ban, but it rhymes with the same underlying cost concerns:

- **Cost.** A CSS `animation` on the selected row is free (compositor-only, no React re-render) if
  done as `transform`/`opacity` keyframes — cheap regardless of row count, unlike the banned
  `whileHover`. That part is *not* the objection.
  - **Attention cost is the real question.** A *looping* pulse is a channel normally reserved for
    "this needs you" (a live indicator, an unread badge, a recording dot) — not for "this is where
    you already are and nothing is wrong." Kinetic Ledger's whole nav-accent argument this session
    was that a spine row should not compete for attention it doesn't need (`ui-design-system.md` §
    color, the deleted trailing-badge ruling: *"it read as a notification and won an attention
    contest it had no business entering"*). A persistent pulse on the selected item — which, by
    definition, is on screen the *entire time the operator works that page* — risks being the same
    mistake in a new shape: a WMS floor operator may stare at that row for a full shift.
  - **`prefers-reduced-motion` and vestibular-motion users.** A looping animation is exactly the
    category WCAG 2.3.3 exists for. The house floor (`MotionConfig reducedMotion="user"`) already
    handles this for anything routed through the shared motion engine, but a persistent loop still
    needs an explicit "does it fully stop, or just slow down" answer.
- **The alternative already in the design language.** A **one-shot** settle animation (the row
  fades/scales in *once* on selection, then holds still) is a different, cheaper claim than a loop,
  and is closer to what `framerPresence.spineActiveWash` already does on selection today (a mount
  transition, not a loop). Confirm which of these — one-shot vs. continuous — actually answers "did
  my click register," because they solve different problems: a one-shot answers "did it just
  change," a loop answers "is this thing hot/live right now."

**Research this**, don't assume it: survey how Linear, Vercel, Stripe Dashboard, Notion, and at
least one real WMS/POS console (per the earlier zone-color research: Odoo, ShipBob, Shopify POS)
handle **selected-nav-item feedback** specifically. Is a continuous pulse used *anywhere* for plain
selection state in a professional dense-ops product, or is it reserved for genuinely live/urgent
signals (a live call, an active recording, a pending sync)? If precedent for a selection pulse
exists, what triggers it, how long does it run before settling, and does it run continuously or a
fixed number of cycles?

---

## 4. Implementation touchpoints (for whichever direction ships)

| Concern | Where |
|---|---|
| Section / row accent resolution | `src/lib/nav/spine-section-accent.ts` — `spineAccentFor`, `SPINE_SECTION_ACCENTS`, `REPAIR_ICON_TINT` |
| Row render (icon override plumbing already exists) | `src/components/sidebar/master-nav/SidebarNavList.tsx` — `renderChildLikeRow` takes `iconClassOverride?: string` today; a per-bench hue map would extend this the same way Repair did |
| Selection mount motion (today, one-shot) | `framerPresence.spineActiveWash` / `framerTransition.spineActiveWash` in `src/design-system/foundations/motion-framer.ts` |
| Motion role vocabulary | `src/design-system/motion/roles.ts` — a genuine new *job* (persistent state pulse) would be the **seventh** `motionRole`, which `motion-crossfade.md` treats as a real claim, not a shortcut: *"A seventh means a new JOB, never a new duration."* |
| Reduced-motion floor | App-wide `<MotionConfig reducedMotion="user">` (`ReducedMotionProvider`) — covers `motion.*` only; a raw CSS `@keyframes` pulse needs its own `motion-safe:`/`prefers-reduced-motion` gate |
| Guard | `main-nav-groups.guard.test.ts` — currently bans `whileHover`/row `scale`/hover font-weight shift; a selection pulse is a **different** claim (selection, not hover) and would need its own guard, not a relaxation of the existing one |
| Reference for the earlier reinstatement (context, not a template to copy blindly) | `docs/todo/masternav-color-reference` artifact from this session — the historical 8-hue map, the repair conflict, the Sourcing candidates |

---

## 5. Deep research questions

1. **Per-bench granularity.** In named WMS/scan-floor software (Odoo Barcode, ShipBob, Fishbowl,
   Extensiv, Deposco, Manhattan Active, Shopify POS, Toast) with a persistent left-nav of
   workstations, does any product color-differentiate *individual* stations inside an
   already-colored group, or does the group color plus icon/label carry it? Cite specific screens.
2. **Process-stage nav vs. process-stage entity-state.** Is there a real product that colors the
   *destination row* for pipeline stage N differently from stage N+1 (as opposed to coloring the
   *item* moving through those stages)? If none exists, is that itself the answer (nav destinations
   don't carry stage-progression color; only the entities do)?
3. **Selection pulse precedent.** Across Linear, Vercel, Stripe Dashboard, Notion, Superhuman,
   Height, and at least one WMS/POS console — what exactly happens visually the instant a
   left-nav item becomes selected, and does it ever continue animating after that instant?
4. **Where continuous pulses DO appear** in professional software (live indicators, recording
   dots, sync-in-progress, presence) — what do they have in common, and does "currently selected
   nav row" share any of those properties, or does it more closely resemble the static states
   (read, done, idle) that never pulse?
5. **Reduced-motion + long-shift ergonomics.** Any documented guidance (WCAG, platform HIG, or
   product write-ups) on the ergonomic cost of a persistent-motion UI element that stays on screen
   for a full work shift (the literal Cycle Forge floor-operator use case)?
6. **Threshold/overturn test for both.** What would have to be true for either "give every bench
   its own hue" or "pulse the selected row" to be the right call for THIS product specifically —
   not in the abstract?

---

## 6. Decisions to ratify or overturn

| # | Engineering-leaning default (not yet shipped) | Overturn if… |
|---|---|---|
| D1 | Scan Stations stays ONE section hue (amber) + Repair's earned exception; the other 6 benches get **no** additional per-bench hue | Named WMS products prove per-bench color inside one zone measurably reduces mis-taps/errors, not just "looks distinct" |
| D2 | No continuous/looping selection pulse; selection stays a static fill + ring, optionally with the existing one-shot `spineActiveWash` mount transition (already shipped, unchanged) | A named professional product demonstrably uses a continuous pulse for plain "you are here" nav selection, with evidence it doesn't fatigue over a multi-hour session |
| D3 | If ANY pulse ships, it is one-shot (plays once on selection change, then holds still) — never a permanent loop | Research finds a first-class case for continuous pulse tied to a *live/pending* state the row itself represents (e.g., "this station has unread scans"), which would be a **different feature** (a live indicator) wearing the same word |
| D4 | A future per-bench hue (if D1 is overturned) still respects the AA-shade discipline already established (700 where 600 fails contrast) and stays additive to — never a replacement of — the section's own hue | — (locked house law, same as the rest of the color reinstatement) |

---

## 7. Out of scope

- Re-opening whether the spine should be colored at all (already ratified this session)
- Re-opening the Repair orange-vs-violet resolution (already ratified this session)
- `serial-status-display.ts`'s violet post-sale family (deliberately untouched — different job)
- Any change to Scan Stations' drill mechanism (list-replace vs. disclosure) — separate, unresolved
  thread flagged earlier this session as a documentation/code mismatch, not part of this brief
- General MasterNav motion (row mount stagger, body swap) — unchanged, out of scope here

---

## 8. Paste checklist for implementer (once Gemini responds)

1. If D1 is ratified as-is: no code change — document the "one section hue + earned exceptions
   only" rule explicitly in `spine-section-accent.ts`'s docblock so the next agent doesn't assume
   the gap is an oversight.
2. If D1 is overturned: extend the `iconClassOverride` pattern already shipped for Repair to each
   bench that earns one — do not invent a second mechanism for the same job.
3. If D2/D3 are overturned in favor of a one-shot pulse: name it as a new `motionRole` (e.g.
   `feedback.selectPulse`) per `motion-crossfade.md`'s "a seventh role means a new job" rule; wire
   it through `useMotionPresence`/`useMotionTransition` so reduced-motion is automatic; add a guard
   asserting it terminates (no `repeat: Infinity`) unless D3's overturn condition was met.
4. Either way: `npm run verify`, plus a live visual pass on `:3050` once the dev-server auth outage
   from earlier this session is resolved — nothing in this brief has been visually confirmed yet.
