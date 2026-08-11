# Unbox Speed Phase 2 — full execution prompt (lazy carton graph)

**Date:** 2026-08-10 · **Supersedes for execution:** the paste block in
[`unbox-speed-simplify-PHASE2-HANDOFF.md`](./unbox-speed-simplify-PHASE2-HANDOFF.md)
(this file is that mission **plus verified trace + measurement + collision
context**). **Do not overwrite the PHASE2-HANDOFF.md** — it is another session's.

---

## Paste into a new session

```
Read docs/todo/unbox-speed-simplify-PHASE2-EXECUTION-PROMPT.md end-to-end.
Also skim: docs/todo/unbox-speed-simplify-PHASE2-HANDOFF.md,
docs/todo/unbox-speed-simplify-GEMINI-RESEARCH-BRIEFING.md → "Phase 1 landed",
and .claude/rules/display/unbox-station.md (carton golden — do NOT reopen).

Mission: Phase 2 ONLY — defer the Unbox carton instrument graph so bare `/unbox`
browse does not EVALUATE LineEditPanel (~1141 LOC) + Displays wiring until a
carton is open. This is a TBT / JS-surface / simplify win — NOT an LCP win
(see "Honest expectation" below; LCP is gated on the client-only browse grid,
which is out of scope). Attach :3050 (NEVER start/restart). npm run verify green
before done. Do NOT raise lighthouse / knip / DS baselines. Do NOT delete the
UnboxBrowseShell opacity-0 handoff (that is Phase 1.5, gated separately).

Stage ONLY your own files — the receiving/unbox tree has active parallel
sessions. Before editing, `git status` the two target files; after, run the
failing gate on YOUR files and report pre-existing reds rather than inheriting
them.
```

---

## 0. Honest expectation — read this before you touch code

Phase 2 is a **JS-surface / TBT / simplify** win, framed correctly. It will
**not move `/unbox` LCP**, and the PR must not claim it does. Evidence, measured
this session on the **real desktop `/unbox` surface** (not the mobile feed the
audit used to hit — see §5):

| Metric | `/unbox` desktop (measured) | What Phase 2 touches |
|---|---|---|
| FCP | 1.4 s | — |
| **LCP** | **10.4 s** | **Not this.** Gated on the client-only browse grid hydrating (`ReceivingLinesTable` is `'use client'` + `useSearchParams`, renders **0** grid nodes in SSR HTML). The SSR stand-in (`UnboxBrowseFirstPaint`) paints 24 real rows at FCP with CLS 0, but it is a *separate* subtree, so when the grid hydrates at 10.4s it becomes the largest element and *resets* LCP. Same root cause the `/dashboard` handoff documented: "data-seeding can't help LCP while the LCP element is client-gated." Fixing that = SSR the browse grid = **out of scope**. |
| TBT | 130 ms | **This.** Deferring ~1141 LOC of `LineEditPanel` + Displays registry off the browse parse reduces main-thread parse/eval on idle browse. TBT is already low, so the LAB delta is modest — the real payoff is **JS surface / simplicity** (browse stops shipping the whole station instrument). |
| CLS | 0 | Must stay 0. |
| Initial JS | 1040 KB | Should drop by the `LineEditPanel` subgraph on the browse chunk. |

**Do not oversell.** The win is "browse no longer evaluates the carton
instrument," measured as a JS-chunk reduction (see §5 gate), not an LCP number.

---

## 1. Verified eager chain (file:line — confirmed 2026-08-10)

```
ReceivingRightPane (isUnboxMode)                     src/components/receiving/ReceivingRightPane.tsx
  └─ UnboxLineWorkspace              [HOT — parallel]  src/components/receiving/unbox/UnboxLineWorkspace.tsx
       ├─ UnboxWorkspaceView (browse sheet)            :43  (static — correct, keep)
       └─ ReceivingLineWorkspace     STATIC import      :41  ← eager
            └─ LineEditPanel          STATIC import      src/components/receiving/workspace/ReceivingLineWorkspace.tsx:3  ← ~1141 LOC
```

- `ReceivingLineWorkspace` is **rendered** only inside
  `{showOverlay && workspace ? (…)}` (`UnboxLineWorkspace.tsx:174,200`), i.e.
  only when a carton is open. **But the import is top-level**, so browse parses
  `LineEditPanel` with `workspace === null`. Confirmed.
- **`ReceivingLineWorkspace` is SHARED**: `TriageLineWorkspace.tsx:17` imports it
  too (renders at `:96`). So `/triage` browse pays the same eager parse.
- Guard to extend already exists:
  `src/components/receiving/unbox/unbox-browse-first-paint.guard.test.ts`.

---

## 2. Two cut options — pick ONE (recommendation: B)

### Option A — dynamic at the Unbox call site (mission's literal suggestion)
Wrap `ReceivingLineWorkspace` in `next/dynamic()` **inside `UnboxLineWorkspace`**,
gated by carton presence.

- ✅ Unbox-scoped, matches the guard's literal check ("UnboxLineWorkspace does
  not statically import LineEditPanel").
- ❌ Edits `UnboxLineWorkspace.tsx` — **HOT** (parallel session mid-edit →
  collision risk).
- ❌ Leaves `/triage` browse still eager (mission is Unbox-only, so acceptable,
  but it's a missed twofer).

### Option B — dynamic the `LineEditPanel` import INSIDE `ReceivingLineWorkspace` (recommended)
Convert `ReceivingLineWorkspace.tsx:3`'s `import { LineEditPanel }` to
`const LineEditPanel = dynamic(() => import('./LineEditPanel')…)`.

- ✅ Edits `ReceivingLineWorkspace.tsx` — **COLD** (no parallel edit) → lower
  collision than touching hot `UnboxLineWorkspace`.
- ✅ **Both** Unbox and Triage browse stop parsing `LineEditPanel` — one edit,
  two surfaces.
- ✅ Natural gate: `ReceivingLineWorkspace` only renders `LineEditPanel` when it
  is itself mounted (carton open, `variant='unbox'`), so the chunk loads exactly
  then. Remount-on-carton-id is untouched (it lives in `UnboxLineWorkspace`'s
  keyed `<motion.div key={paneKey}>`, `:174`).
- ⚠️ Shared file — verify Triage still renders (`variant='triage'` path uses
  `TriagePanel`, not `LineEditPanel`; only the unbox branch changes).
- ⚠️ Guard nuance: the guard must assert **no transitive static path**
  UnboxLineWorkspace → LineEditPanel, i.e. that `ReceivingLineWorkspace`'s
  `LineEditPanel` import is `dynamic`. A grep-for-`import { LineEditPanel }`
  check in `ReceivingLineWorkspace.tsx` covers it.

**Recommendation: B** — lower collision (cold file), broader benefit, cleaner
gate. If the reviewer insists on Unbox-only scoping, fall back to A and accept
the hot-file collision risk (rebase carefully).

---

## 3. Remount + fallback contract (do not break)

- **Keep remount keyed on carton identity.** The `<motion.div key={paneKey}>` in
  `UnboxLineWorkspace.tsx` (`:174`, `paneKey` from `resolveWorkspacePaneSlot`) is
  load-bearing: `LineEditPanel` has NO reset for `unboxView` / `classifyExpand` /
  `pairingOpen` and the notes composer has **no flush-before-swap**, so an
  in-place carton→carton swap bleeds one carton's open tab / dirty note onto the
  next (documented at `UnboxLineWorkspace.tsx:27-36`). A `dynamic()` component
  under the same `key` remounts identically — safe. **Do not** hoist the dynamic
  above the key or memoize it across carton ids.
- **Loading fallback:** `ReceivingWorkspaceSkeleton`
  (`src/components/receiving/workspace/ReceivingWorkspaceSkeleton.tsx`) is the
  correct `dynamic({ loading })` fallback for restore / deep-link (`restorePending`
  path, `UnboxLineWorkspace.tsx:149`). First carton open pays a one-time chunk
  download — acceptable. **Never** a pulse-bar on the browse LCP path
  (`UnboxBrowseFirstPaint` owns browse first paint; the carton overlay is a
  separate, later surface).
- **`ssr: false` is fine here** (the carton overlay is not the declared LCP; the
  browse stand-in is). This does NOT violate the paint law's `ssr:false` ban —
  that ban is on the **declared LCP surface**, which is `UnboxBrowseFirstPaint`,
  not the carton panel.
- **Displays bodies stay P3 `dynamic()`** (already done in `unbox-tabs`). Do not
  eager Ticket / Photos / Timeline.

---

## 4. Guard (extend, do not baseline)

Add to `unbox-browse-first-paint.guard.test.ts` (or a sibling
`unbox-lazy-carton-graph.guard.test.ts`):

1. **No static `LineEditPanel` on the browse path.** Assert the chosen cut:
   - Option B: `ReceivingLineWorkspace.tsx` imports `LineEditPanel` via
     `dynamic(` — assert the source contains `dynamic(() => import('./LineEditPanel'`
     and does **not** contain a top-level `import { LineEditPanel } from './LineEditPanel'`.
   - Option A: `UnboxLineWorkspace.tsx` imports `ReceivingLineWorkspace` via
     `dynamic(`; assert no top-level static import.
2. **Fallback is not a pulse bar.** Assert the `dynamic({ loading })` fallback
   resolves to `ReceivingWorkspaceSkeleton` (or a flush skeleton), never a
   component containing `animate-pulse` on the browse LCP path.
3. **Remount key preserved.** Assert `UnboxLineWorkspace.tsx` still keys the
   overlay `motion.div` on `paneKey` / `resolveWorkspacePaneSlot` (regression
   guard against an accidental in-place swap).

**Never raise a baseline** (lighthouse / knip / DS flush-seam) to pass. If a DS
flush-seam guard trips on the Phase-1 KPI row (`items-stretch gap-0` needs
`[&>*+*]:-ml-px`), fix the seam — do not baseline it.

---

## 5. Measurement — the real surface is now wired

**This session fixed the measurement blind spot.** Before, the audit hit
`/receiving` on **mobile**, which the proxy UA-rewrites to `/m/receiving` (the
mobile photo feed) — NOT the desktop `/unbox` browse sheet. `scripts/lighthouse-
audit.mjs` now pins `/unbox` as a **tier-1 desktop** route
(`{ path: '/unbox', tier: 1, formFactor: 'desktop' }`) via a new per-route
`formFactor` override. Use it.

**Method (NEVER touch :3050 — that is the user's dev server; attach for visual
dogfood only):**

```bash
npm run build                                  # production build (turbopack)
PORT=3000 npx next start -p 3000 &             # YOUR audit server, not :3050
LH_COOKIE=$(node scripts/lighthouse-mint-session.mjs | grep -oE 'cf_sid=[a-f0-9]+') \
  node scripts/lighthouse-audit.mjs --routes /unbox --runs 3   # /unbox is desktop-pinned
```

**JS-surface gate (the real Phase-2 proof, since LCP won't move):** confirm
`LineEditPanel` is absent from the browse initial chunk. Fetch the served HTML +
grep the initial scripts, or diff `network-requests` Script bytes before/after —
expect the `LineEditPanel` subgraph to leave the browse-initial set and appear
only after a carton opens. Baseline before your change (LCP 10.4s / TBT 130ms /
1040 KB / CLS 0) is in this session's notes; ratchet **nothing** until a genuine,
repeated win.

---

## 6. Dogfood acceptance (attach :3050, do not restart)

**Browse (no carton)**
- Cold `/unbox`: Queue rows or hard empty text (`Queue empty — scan Ticket ·
  Tracking · PO`); scan rail live; scan bar focus works.
- No station dock / centre JS evaluated on idle browse (verify via §5).

**Carton open (scan or row click)**
- Identity + PO lines + dock Band 1 paint.
- First open may show `ReceivingWorkspaceSkeleton` briefly (one-time chunk) —
  acceptable; never an infinite skeleton / white hole.
- Displays strip may appear; Ticket / Photos **bodies** still wait (P3).

**Carton → carton switch**
- Clean remount (keyed) — no open-tab bleed, no dirty-note bleed onto the next
  carton.

**Fail if:** browse broken without a carton · open carton = white hole /
infinite skeleton · ProcedureDeck remounts on main dogfood · opacity-0 deleted ·
any baseline raised.

---

## 7. Anti-goals / out of scope (ask first)

- **Delete `UnboxBrowseShell` opacity-0 handoff** — Phase 1.5, separate gate
  (only after browse children provably cannot paint skeletons over FirstPaint).
- **SSR the browse grid** (the real LCP fix) — separate, larger initiative;
  needs `ReceivingLinesTable` to render server-side. Not Phase 2.
- **SurfaceGate composition rewrite.**
- **Station-graph block registry / `transitionReceivingLine` UI rewiring.**
- **Remount `ProcedureDeck`** as a centre hero (carton golden is parked — see
  `unbox-station.md`).
- **Raise any baseline** (lighthouse / knip / DS).
- **Start / restart / kill `:3050`.**
- **To-ship `OrdersQueueFirstPaint` empty-pulse twin** (different surface).

---

## 8. Verify caveats (shared tree)

`npm run verify` in this tree currently carries **pre-existing reds from parallel
sessions** that are NOT yours:
- Lint: `SerialCard.tsx` `'Barcode'` unused (another session).
- Knip: findings drift as sessions land (e.g. `po-line-capture-chrome.ts`,
  `line-receive-mode.ts` have appeared/cleared).
- Doc-catalog drift.

Run the failing gate on **your** files, report which reds are pre-existing, and
do not "fix" or inherit another session's findings. Your bar: typecheck clean,
your guard green, knip clean **of your files**, no baseline raised.

---

## Key files

| File | Role | Hot? |
|---|---|---|
| `src/components/receiving/workspace/ReceivingLineWorkspace.tsx` | **Option B edit** — dynamic `LineEditPanel` | cold |
| `src/components/receiving/unbox/UnboxLineWorkspace.tsx` | Option A edit / remount key owner | **HOT** |
| `src/components/receiving/triage/TriageLineWorkspace.tsx` | shares `ReceivingLineWorkspace` (Option B benefits it) | cold |
| `src/components/receiving/workspace/LineEditPanel.tsx` | ~1141 LOC station centre | — |
| `src/components/receiving/workspace/ReceivingWorkspaceSkeleton.tsx` | dynamic loading fallback | cold |
| `src/components/receiving/unbox/UnboxBrowseFirstPaint.tsx` | browse LCP stand-in — **do not touch** | — |
| `src/components/receiving/unbox/unbox-browse-first-paint.guard.test.ts` | extend the guard here | — |
| `scripts/lighthouse-audit.mjs` | `/unbox` now desktop tier-1 (this session) | — |
| `.claude/rules/display/unbox-station.md` | carton golden — do not reopen | — |
