# Warehouse OS — the plan of record

Cycle Forge is being rebuilt from a **page-oriented SaaS** into a **Warehouse OS**:
an always-mounted HUD shell where work is *sessions*, data is *tabs*, utilities are
*tools*, and the operator arranges all three on a tiling canvas that persists per
staff member.

> "It must be like Arch Linux. I literally just want to start off with an empty
> slate and pin exactly what I need."

## Read in this order

| Doc | What it answers |
|---|---|
| [`01-repo-map.md`](01-repo-map.md) | What is actually in the repo today, measured — what survives, what dies, where the seams are |
| [`02-target-architecture.md`](02-target-architecture.md) | The Warehouse OS spec: shell, rails, sessions, tools, canvas, data model |
| [`03-decisions.md`](03-decisions.md) | **10 decisions that block coding.** Answer these first |
| [`04-roadmap.md`](04-roadmap.md) | Phased plan with must-deliverables and the exact first slice |
| [`05-data-model.md`](05-data-model.md) | **The tables.** Why polymorphism belongs on the event log and not the session, and the 31-table census |
| [`06-work-order-migration-path.md`](06-work-order-migration-path.md) | **Ruled.** The work order session — a titled wrapper around N assignments. Expand → code → contract, with the dangerous steps isolated |
| [`07-configurability.md`](07-configurability.md) | **The configurability brief, fought** (2026-08-23) — modes vs tree states, "Spacesuit" snap grids settled by arithmetic, spacing, the beam configure button, rail mirroring, the shipped 15-verb AI contract, and the two prefs keys that finish it |
| [`HANDOFF-continue.md`](HANDOFF-continue.md) | **Start here in a fresh session.** State of play, working method, open questions, the concurrent-session divergence |
| [`LAWS.md`](LAWS.md) | **The design and architecture laws**, numbered and referenceable. Each carries its enforcement status — `DB` / `TYPE` / `TOOLING` / `PROTO` / `PROSE` |
| [`HANDOFF-ux-ui.md`](HANDOFF-ux-ui.md) | The visual layer, and the argument behind every law |
| [`HANDOFF-ai-centre.md`](HANDOFF-ai-centre.md) | **The current rewrite prompt** (2026-08-23). The AI pinned centre as a SUNKEN feed — no tile, no backdrop — blocks of time instead of pages, the support-call scenario as the acceptance spec, draft blocks with a morphing commit, AI-proposed keybinds. Supersedes the FRAMING of HANDOFF-ai-first; its Phase 1 is done and stands |
| [`HANDOFF-ai-first.md`](HANDOFF-ai-first.md) | The prior upgrade prompt — framing superseded by HANDOFF-ai-centre; still authoritative for its §1 audit, the paste correction, and the laws it cites |
| [`HANDOFF-ux-fighting.md`](HANDOFF-ux-fighting.md) | **The UX/UI expert brief.** Paste into a fresh session — what the interface is, how the operator wants to be argued with, six worked fights, and the measurement snippets |
| [`prototype/warehouse-os.html`](prototype/warehouse-os.html) | The clickable shell. Where rulings get discovered before they get written down |
| [`HANDOFF-motion-sweep.md`](HANDOFF-motion-sweep.md) | **Executable.** Paste into a fast-model session — the mechanical half of law M1 in `src/` |
| [`PLAN-floating-assistant-composer.md`](PLAN-floating-assistant-composer.md) | **Floating Ask circle** (2026-09-02). Same corner closed (Sparkles) and open (X + stack). Not RightRailHost. |
| [`PLAN-morph-cursor-reliability.md`](PLAN-morph-cursor-reliability.md) | **Desk morph cursor reliability** (2026-09-02). One layer, OS hide sheet, opt-in morph; R1 hit-test / R2 rail gold. |
| [`RESKIN.md`](RESKIN.md) | **Full reskin — decision locked** (2026-09-02). Visual language replaced end to end; interaction contracts kept unless ruled broken. Three directions, R0–R4 phases, wave order, refuse list, measurement. Overrides the visual rulings in HANDOFF-ux-ui and the F-section of LAWS |

## The five pillars

1. **The OS paradigm** — start from an empty slate; the operator builds their
   workspace by opening, pinning, and arranging.
2. **Total detachment** — sessions, tables, and tools are independent of each
   other and of the URL. A session is not a page.
3. **Polymorphic foundation** — one sessions table, one event spine, one composer,
   one tool registry. The *type* dictates routing, validation, and display.
4. **HUD identity** — one always-visible header carrying live context; two
   hover/toggle rails; a tiling canvas framed by a single inset-radius token.
5. **AI-first orchestration** — "I need to do X" opens the layout, pins the tools,
   and starts the session.

## Status

**Phase 0 — deciding.** No refactor code has been written.

The previous constitution (`AGENTS.md` hard laws, `.claude/rules/**`, `docs/rules/**`,
the SoT manifest, the design-law lint rules, `.cursor/**`) was deleted on 2026-08-21
because it described the architecture being replaced. 195 files; recoverable from git
history. Do not reconstruct it — new invariants get written after the surface they
govern exists in code.

## The one-line answer to "where do I start?"

**Adopt `GlobalScanDock` on `/unbox`.** The universal header scan bar is already
built, already mounted, already unit-tested — and has zero adopters. It is the
smallest change that proves "input survives navigation" with no new model, no new
table, and no visual regression. See [`04-roadmap.md`](04-roadmap.md) → Phase 1.
