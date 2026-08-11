# Handoff — Unbox speed Phase 2 (lazy carton graph)

**Date:** 2026-08-10  
**Parent brief:** [`unbox-speed-simplify-GEMINI-RESEARCH-BRIEFING.md`](./unbox-speed-simplify-GEMINI-RESEARCH-BRIEFING.md)  
**Phase 1 plan:** `.cursor/plans/unbox_speed_phase_1_d97a4389.plan.md` (Gemini Tranche 3)

---

## Paste into a new session

```
Read docs/todo/unbox-speed-simplify-PHASE2-HANDOFF.md end-to-end.
Also skim: docs/todo/unbox-speed-simplify-GEMINI-RESEARCH-BRIEFING.md → “Phase 1 landed”
and .claude/rules/display/unbox-station.md (carton golden — do not reopen).

Mission: Phase 2 only — defer the Unbox carton instrument graph so bare `/unbox`
browse does not evaluate LineEditPanel (~1k LOC) + Displays wiring until a carton
is open. Attach :3050 (never start/restart). npm run verify green before done.
Do not raise lighthouse / knip / DS baselines. Do not delete UnboxBrowseShell
opacity-0 handoff (Phase 1.5 — only after browse children cannot paint skeletons).

Do:
1. Trace the eager import chain: ReceivingRightPane → UnboxLineWorkspace →
   ReceivingLineWorkspace → static LineEditPanel. Confirm browse still pays for
   LineEditPanel parse when workspace is null.
2. Lazy-mount the carton overlay only when overlay/restore needs it
   (showOverlay / restorePending / workspace row present). Prefer next/dynamic
   on ReceivingLineWorkspace (or LineEditPanel) gated by carton presence —
   keep remount-on-carton-id behavior (see UnboxLineWorkspace header comments).
3. Loading fallback: ReceivingWorkspaceSkeleton is OK for restore/deep-link;
   never pulse-bar LCP on browse. Displays bodies stay P3 dynamic (already).
4. Guard: assert browse path does not statically import LineEditPanel from
   UnboxLineWorkspace / UnboxWorkspaceView; dynamic only when carton open.
5. Dogfood: cold /unbox browse (no carton) → Queue works + scan bar works;
   scan/open carton → identity + PO lines + dock Band 1; Displays closed until
   armed. Carton→carton remount still clean (no note bleed).
6. npm run verify.

Anti-goals: remount ProcedureDeck; SurfaceGate rewrite; delete opacity-0;
eager Ticket/Photos; raise baselines; start/kill :3050.
```

---

## Phase 1 status (do not redo)

| Item | Status |
|---|---|
| `UnboxBrowseFirstPaint` empty → hard text (`Queue empty — scan Ticket · Tracking · PO`) | Shipped |
| Flush `UnboxWorkbenchSkeleton` (no soft radius / shadow-sm) | Shipped (watch DS flush-seam guard if KPI row uses `items-stretch gap-0` — need `[&>*+*]:-ml-px`) |
| `UnboxWorkspaceView` static `ReceivingLinesTable` (no dynamic loading flash) | Shipped |
| Keep `UnboxBrowseShell` `opacity-0` handoff | Kept on purpose |
| Gemini “dual dynamic” consolidate | Stale — RightPane already static |
| Lazy `LineEditPanel` | **This phase** |

If Phase 1 `npm run verify` was red on `border-seam.guard` after skeleton flush, finish that seam fix first (`[&>*+*]:-ml-px` on the `items-stretch gap-0` chrome row) — do not raise the baseline.

---

## Phase 2 goal

**Browse must not pay for the carton station module graph.**

Today (eager):

```
ReceivingRightPane (unbox)
  └─ UnboxLineWorkspace          // always mounted
       ├─ UnboxWorkspaceView     // browse sheet
       └─ ReceivingLineWorkspace // static import → LineEditPanel
            └─ LineEditPanel     // ~1141 LOC + Displays registry
```

Target:

```
UnboxLineWorkspace
  ├─ UnboxWorkspaceView          // always (browse)
  └─ dynamic(ReceivingLineWorkspace | LineEditPanel)
       only when showOverlay || showRestoreSkeleton || workspace row
```

First carton open may pay a one-time chunk download — acceptable. Remount keyed on carton identity stays (no in-place swap without reset work — see `UnboxLineWorkspace.tsx` header).

---

## Operator acceptance (what you’re looking for)

**Browse (no carton)**  
- Cold `/unbox`: Queue / empty hard text; scan rail live.  
- Feels lighter than pre-Phase-2 (no station dock/centre JS on idle browse).

**Carton open**  
- Scan or row open → identity + PO lines + dock Band 1.  
- Displays strip may appear; Ticket/Photos **bodies** still wait (P3).  
- Carton→carton switch: clean remount, no note/tab bleed.

**Fail if**  
- Browse broken without a carton.  
- Open carton = white hole / infinite skeleton.  
- ProcedureDeck remounts on main dogfood.  
- Opacity-0 deleted as a “speed” side quest.

---

## Key files

| File | Role |
|---|---|
| `src/components/receiving/unbox/UnboxLineWorkspace.tsx` | Gate dynamic carton overlay |
| `src/components/receiving/workspace/ReceivingLineWorkspace.tsx` | Static `LineEditPanel` today |
| `src/components/receiving/workspace/LineEditPanel.tsx` | Heavy station centre |
| `src/components/receiving/workspace/ReceivingWorkspaceSkeleton.tsx` | Restore fallback |
| `src/components/receiving/ReceivingRightPane.tsx` | Unbox host |
| `.claude/rules/display/unbox-station.md` | Carton golden law |

---

## Out of scope / Ask first

- Phase 1.5: delete `opacity-0` handoff  
- SurfaceGate composition rewrite  
- Station-graph block registry  
- Lighthouse baseline ratchet (measure only; ratchet after genuine win)  
- To-ship `OrdersQueueFirstPaint` empty pulse twin  
