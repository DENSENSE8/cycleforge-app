# Research briefing — Unbox **speed + simplify** (DS principles → exact deliverables)

**For:** Gemini Deep Research / Gemini Pro — **you have read access to this repository.** Paths below are pointers; open the real files.  
**From:** Cycle Forge engineering  
**Date:** 2026-08-10  
**Repo tip at authoring:** `ada5e1cb6` — **verify live files; lines may have moved.**  
**Product frame:** Cycle Forge multi-tenant reseller-ops SaaS. USAV is dogfood only — never frame the product as a shop-internal tool.

**Companion visual (operator evidence):**  
`~/.cursor/projects/Users-icecube-repos-cycleforge-app/assets/Screenshot_2026-08-10_at_17.53.56-5bd7e6c3-96cd-49c2-9b14-22ff960d5b73.png`

> **What we want back is a RULING that Claude Code can execute**, not a mood board. Every recommendation must map to a **named house SoT principle**, a **measured bottleneck** (paint / JS / fetch / mount), and a **pass/fail acceptance criterion**. Where industry practice conflicts with Kinetic Ledger law, **pick a side and defend it**.

---

## Locked product complaint (do not soften)

Operator dogfood on `/unbox` (2026-08-10 ~17:53 local):

| Observed | Law violated |
|---|---|
| Centre is **skeleton soup** (card + row pulses) while GlobalHeader + scan rail already paint | **Paint content order** — P1 primary must be real facts, not geometry placeholders, once chrome is up |
| Soft rounded “card” skeleton plane in the work column | **Workbench chrome flush** + **Host vs content pad** — column *is* the card; decorative raised islands are debt |
| Left rail shows `Ticket · Tracking · PO` + `UNBOXED · 0` while middle waits | Scan ingest is ready; **browse primary** is not — hybrid station paints unevenly |
| Feels “way too slow” even after recent LCP scaffolding (`UnboxBrowseFirstPaint` / `seedUnboxQueue`) | Scaffolding landed; **Lighthouse not re-measured**; empty-seed path still owns LCP with pulse bars |

Product ask (locked): **speed up Unbox** and **simplify it even more** — within Kinetic Ledger / Unbox golden law, not by inventing a second visual language.

---

## Phase 1 landed (2026-08-10) — corrections to Gemini D9

Executed with verified live-tree fixes (do not re-apply stale D9 steps):

| Gemini D9 step | Live correction |
|---|---|
| Dual `dynamic(ReceivingLinesTable)` consolidate | **Stale** — `ReceivingRightPane` already static-imports; only `UnboxWorkspaceView` was `dynamic`. Phase 1 dropped WorkspaceView `dynamic` → static import. |
| Delete `opacity-0` handoff | **Rejected for Phase 1** — kept To-ship parity (`OutboundOrdersDeskShell`); removing it while children can skeleton would cover FirstPaint. |
| Empty pulse → hard text | **Shipped** — `UNBOX_BROWSE_FIRST_PAINT_EMPTY` in `UnboxBrowseFirstPaint`. |
| Flush `UnboxWorkbenchSkeleton` | **Shipped** — `cornerClass('flush')` / `!rounded-none`; no `rounded-lg` / `rounded-full` / `shadow-sm`. |
| Start dev server `:3050` | **Illegal** — attach only. |
| Lazy `LineEditPanel` | **Phase 2** — not Phase 1. |

Guard: `unbox-browse-first-paint.guard.test.ts`. HANDOFF progress log prepended.

---

## 0. How Gemini must work

### 0.1 Verify in the repo (mandatory)

Open every path in §2–§4 before asserting. Quote `file:line`. Mark inference `[UNVERIFIED]`. If a line moved since tip SHA, say so.

### 0.2 Search the web (mandatory for D1 + D2)

Industry 2024–2026 on **warehouse / RF / MES first paint** and **progressive disclosure of secondary panes**:

- SAP EWM RF / Fiori for warehouse — floor-first paint, deferred detail
- Manhattan Active / Blue Yonder / Oracle WMS Cloud — scan-station vs desk queue
- Shopify Admin / Linear / Stripe Dashboard — shell→primary→trailing paint ladders
- Next.js App Router guidance — RSC seeds, streaming, when `dynamic()` helps vs hurts LCP
- Web Vitals — LCP element selection when skeletons compete with real text

Cite primary docs. Transfer **standing desk + wedge** Fitts constraints (hands on product; mouse is secondary).

### 0.3 Two questions (answer separately — never fuse)

1. **Speed:** What exact changes move `/unbox` LCP / TTI / perceived readiness without regressing CLS/TBT or scan safety?
2. **Simplify:** What exact deletions / deferrals / SoT consolidations reduce cognitive + JS surface while strengthening (not abandoning) the Unbox golden?

### 0.4 Deliverables (keep as separate numbered sections)

| # | Deliverable |
|---|---|
| **D1** | **DS principles comparison matrix** — Kinetic Ledger five laws × Paint P0–P3 × Unbox golden planes × industry RF/WMS first-paint norms. Columns: Principle · House law (cite path) · Current Unbox score (Pass/Partial/Fail + evidence) · Industry peer · Ruling for Cycle Forge |
| **D2** | **Bottleneck autopsy** — ranked list of why the screenshot is slow (seed empty → pulse LCP · `dynamic(ReceivingLinesTable)` · opacity handoff · dual table dynamic sites · LineEditPanel weight · P3 Displays graph · SurfaceGate · sidebar). Each row: cause · evidence `file:line` · LCP vs TTI vs CLS risk · kill / defer / keep |
| **D3** | **Two-mode contract** — Browse (Queue sheet) vs Carton (station instrument). What MUST paint in ≤1 frame of chrome for each; what is P2/P3 forever. ASCII for both modes |
| **D4** | **Simplify deletion map** — ordered “delete / park / lazy / keep” with blast radius. Prefer deletion over config flags. Ban “add a loading spinner” as a fix |
| **D5** | **Speed build plan** — deletion-ordered P0→P2 patches with `file:line` owners. Measurement gate after each tranche (`docs/performance/LIGHTHOUSE.md`) |
| **D6** | **DONE acceptance** — screenshot + Lighthouse pass/fail checklist Claude Code pastes into the PR body (no soft language) |
| **D7** | **Paste-ready SoT patches** — deltas for `source-of-truth.md` (Paint / Unbox), `display/unbox-station.md`, `docs/performance/HANDOFF-lcp-streaming.md` progress log |
| **D8** | **Guard flip list** — extend `unbox-browse-first-paint.guard.test.ts` / `tier1-paint-order.guard.test.ts` / new asserts: no soft-radius skeleton as LCP; browse must call `onPrimaryPainted` when rows exist; ban second `ReceivingLinesTable` dynamic twin without shared chunk owner |
| **D9** | **Claude Code P0 prompt** ≤40 lines — attach `:3050`, measure first, geometry+paint first, then `npm run verify` |
| **D10** | **Out-of-scope / Ask-first** — SurfaceGate composition rewrite, station-graph block registry, theme CSS split, raising lighthouse baselines without a measured win |

### 0.5 Paste prompt (give this entire file to Gemini)

```
Read docs/todo/unbox-speed-simplify-GEMINI-RESEARCH-BRIEFING.md end-to-end.
Open every cited repo path. Deliver D1–D10 as separate sections.
Priority: (1) kill skeleton-as-LCP on /unbox browse, (2) shrink what mounts before first real row,
(3) simplify Unbox further within Kinetic Ledger / unbox-station golden — never a second design language.
Quote file:line. Mark [UNVERIFIED]. Industry citations required for D1–D2.
End with the ≤40-line Claude Code P0 prompt (D9).
```

---

## 1. Product + design-system frame (non-negotiable)

### 1.1 Kinetic Ledger — five laws

Source: [`.claude/rules/kinetic-ledger.md`](../../.claude/rules/kinetic-ledger.md)

1. Facts and state drive chrome — chrome never invents a second story.
2. Archetypes are region contracts (I/O + persistence), not layout skins.
3. Data shape chooses the primary surface.
4. Presentation kinds resolve via SoT — views stay dumb.
5. Compose named shells / blocks; grow the SoT when wrong; compound every UI task.

**Always ban:** random card soup · nested cards-as-rows · floating column islands · dual full-width right columns · a second visual language.

### 1.2 Region contracts on `/unbox` (hybrid page)

Source: [`.claude/rules/contextual-display.md`](../../.claude/rules/contextual-display.md) + [`display/unbox-station.md`](../../.claude/rules/display/unbox-station.md)

| Mode | Region | Primary surface | Never |
|---|---|---|---|
| **Browse** (bare `/unbox`, Queue default) | Workbench `ops-queue` | Ledger sheet of cartons (`ReceivingLinesTable`) | Station dock, centre ProcedureDeck, Displays bodies |
| **Carton open** | Station (scan-bench golden) | Centre ops-flow (PO lines + label) + flush two-band dock | Advisory banners, centre ticket history, desk inspector floor |

The page is **one route, two jobs**. Speed work must not force one mount graph for both.

### 1.3 Paint content order (Tier-1 law)

Source: [`.claude/rules/source-of-truth.md`](../../.claude/rules/source-of-truth.md) → Paint content order · [`src/lib/observability/tier1-paint-order.ts`](../../src/lib/observability/tier1-paint-order.ts)

```
P0 chrome  →  P1 primary (declared LCP)  →  P2 context  →  P3 trailing (Displays strip chrome only; bodies wait)
```

`/unbox` registry entry:

- `lcpSurface: 'primary'`
- Stand-in: `UnboxBrowseFirstPaint`
- Hosts: `UnboxWorkspaceView` · `UnboxBrowseFirstPaint` · `ReceivingLinesTable`
- Skeleton module (route loading): `UnboxWorkbenchSkeleton` — **geometry only; must not win LCP once seed rows exist**

### 1.4 Unbox golden planes (carton mode)

Source: [`display/unbox-station.md`](../../.claude/rules/display/unbox-station.md)

```
GlobalHeader
StationContextBar + CartonContextCard
Recent rail │ CENTRE = DO (PO lines + label) │ DISPLAYS = KNOW (P3)
UnboxDockHost — Band 1 ACTION · Band 2 pager + procedure-%
```

Simplification that re-mounts centre `ProcedureDeck` or merges Displays into centre is **illegal**.

### 1.5 Pattern evolution discipline

Source: [`.claude/rules/pattern-evolution.md`](../../.claude/rules/pattern-evolution.md)

Compose named SoT first → grow SoT when wrong → compound. Prefer **delete page-local twins** over new flags. Never raise DS/knip/Lighthouse baselines to “pass.”

---

## 2. Measured state (open these — do not re-guess)

### 2.1 Lighthouse baseline (stale vs scaffolding)

| Source | `/unbox` (was `/receiving`) |
|---|---|
| [`lighthouse-baseline.json`](../../lighthouse-baseline.json) `/receiving` | Perf **68**, LCP **~11.6 s**, TBT ~34, CLS 0 (2026-07-19) |
| [`docs/performance/HANDOFF-lcp-streaming.md`](../../docs/performance/HANDOFF-lcp-streaming.md) | Initial JS **~971 KB gz** (worst Tier-1 peer) |
| Peer already green | `/packer` Perf **77** — seed + thin surface golden |
| Scaffolding (2026-08-06 → 08-10) | `seedUnboxQueue` + `UnboxBrowseFirstPaint` + `UnboxBrowseShell` — **not yet re-baselined** |

**Ruling ask for Gemini:** treat baseline as **pre-scaffold**. Recommend the exact measure command after P0 patches — do not claim a win without numbers.

### 2.2 Current paint stack (browse)

| Layer | File | Role |
|---|---|---|
| RSC page | [`src/app/unbox/page.tsx`](../../src/app/unbox/page.tsx) | `seedUnboxQueue()` → `HydrationBoundary` + `sr-only` FirstPaint + `UnboxBrowseShell` |
| Seed | [`src/lib/queries/unbox-spine-seed.server.ts`](../../src/lib/queries/unbox-spine-seed.server.ts) | Soft-fail self-fetch Queue spine; returns `{ state, rows }` |
| Shell | [`src/components/receiving/unbox/UnboxBrowseShell.tsx`](../../src/components/receiving/unbox/UnboxBrowseShell.tsx) | Absolute FirstPaint until `onPrimaryPainted`; children `opacity-0` until then |
| First paint | [`src/components/receiving/unbox/UnboxBrowseFirstPaint.tsx`](../../src/components/receiving/unbox/UnboxBrowseFirstPaint.tsx) | Real last-8 PO + title rows **or 12 pulse skeletons if `rows.length === 0`** |
| Interactive sheet | [`UnboxWorkspaceView.tsx`](../../src/components/receiving/unbox/UnboxWorkspaceView.tsx) | `dynamic(() => ReceivingLinesTable)` → `UnboxTableCardSkeleton` while chunk loads |
| Primary signal | [`ReceivingLinesTable.tsx`](../../src/components/station/ReceivingLinesTable.tsx) (~L516) | Calls `onPrimaryPainted` when browse table ready |
| Dual dynamic twin | [`ReceivingRightPane.tsx`](../../src/components/receiving/ReceivingRightPane.tsx) | **Also** `dynamic(ReceivingLinesTable)` — second import site |

**Critical empty-seed path:** when `seedUnboxQueue` soft-fails or returns `[]`, FirstPaint’s LCP element is **animate-pulse bars** — same failure class as the screenshot.

### 2.3 Carton / restore weight

| Module | ~LOC / note |
|---|---|
| `LineEditPanel.tsx` | ~1141 lines — station centre + Displays wiring |
| `ReceivingLinesTable.tsx` | ~982 lines — browse grid |
| `ReceivingRightPane.tsx` | ~390 lines — mode router + many `dynamic()` leaves |
| Displays P3 | `unbox-tabs.tsx` — Ticket/Photos/Timeline/Support `dynamic(..., { loading: () => null })` — **correct pattern**; do not eager-load |
| Restore | `UnboxLineWorkspace` can show `ReceivingWorkspaceSkeleton` while deep-link resolves — must not steal browse LCP |

### 2.4 Soft-radius / card debt visible in loading chrome

[`UnboxWorkbenchSkeleton.tsx`](../../src/components/receiving/unbox/UnboxWorkbenchSkeleton.tsx) still uses `rounded-full` / `rounded-lg` skeleton chips in Band chrome — conflicts with **ops chrome flush** when this skeleton is on-screen long enough to become the perceived product.

To-ship golden to compare: [`OrdersQueueFirstPaint.tsx`](../../src/components/dashboard/OrdersQueueFirstPaint.tsx) + Packer `HydrationBoundary` seed — thinner graph, Perf 77.

### 2.5 Simplification already locked (do not re-litigate)

| Already law | Do not reopen as “simplify” |
|---|---|
| Centre = ops-flow only; Displays = KNOW | Moving Ticket/Photos into centre |
| Dock = flush two-band floor | Soft composer / chip dock |
| ProcedureDeck parked on main dogfood | Re-mounting deck for “clarity” |
| KPI Band 2 snap-collapse | Animated chrome height tweens |
| P3 Displays bodies deferred | Eager import “for faster open” of leaves |

Simplify = **fewer mounts before P1**, **fewer twins**, **honest empty states**, **delete dead chrome** — not undoing the golden.

---

## 3. Design-system principles comparison (Gemini fills D1)

Build the matrix with at least these rows. Score Unbox against each with evidence.

| Principle | House citation | Industry peer to research | Likely Unbox tension (hypothesis — verify) |
|---|---|---|---|
| Facts drive chrome | kinetic-ledger §Five laws | RF screens show live SKU/qty, not placeholders | Skeleton as LCP invents a story |
| Region contract | contextual-display | WMS separates RF task vs desk inquiry | Browse+carton share one JS graph |
| Data shape → surface | kinetic-ledger #3 | Queue = sheet; carton = instrument panel | Card skeleton implies document UI |
| Paint P0→P3 | SoT Paint content order | Shopify/Linear shell→content | P1 gated on dynamic chunk |
| Host vs content pad | SoT Host vs content pad | Industrial flush panels | Raised skeleton card |
| Chrome flush | SoT Workbench chrome flush | Zero-radius ops consoles | `rounded-lg` skeleton chips |
| Scan-station centre ops-flow | SoT + unbox-station | Door-flow RF: only the next action | Over-fetching Displays before centre |
| Frame column budget | SoT | Fixed work plane + optional detail | Loading all rails eagerly |
| Depth = planes | SoT Depth elevation | Single canvas, surface steps | Soft shadow card as “depth” |
| Compose → grow → compound | pattern-evolution | Platform design systems | Page-local loading twins |
| Bundle altitude | build-gotchas | Route-level code splitting | 971 KB gz initial |
| Motion from `@/design-system/motion` | AGENTS.md | Prefer instant ops chrome | Pulse animation as primary feedback |

For each row: **Pass / Partial / Fail**, one-sentence ruling, one concrete fix owner.

---

## 4. Hypotheses for D2 (verify, rank, kill false ones)

H1. **Empty or soft-failed seed** → FirstPaint pulse bars become LCP (`UnboxBrowseFirstPaint` empty branch).  
H2. **`dynamic(ReceivingLinesTable)`** delays interactive primary; opacity-0 children mean operator stares at stand-in (or skeleton) until chunk + query success.  
H3. **Dual `dynamic()` import sites** (WorkspaceView + RightPane) risk duplicate chunk boundaries / waterfall confusion.  
H4. **Route `loading.tsx` → UnboxWorkbenchSkeleton** (soft chrome) wins first impression on cold nav.  
H5. **Carton graph** (`LineEditPanel` + procedure + Displays registry) is pulled into the browse route’s shared parent even when no carton is open.  
H6. **Sidebar / MasterNav / scan bar** are correctly P0; middle P1 is the only broken rung — perceived “whole page slow” is middle-only.  
H7. **SurfaceGate** dual path adds indirection without helping LCP on legacy default.  
H8. **KPI / Band-2 / compare / History chrome** mounts work that browse Queue does not need for first paint.

Gemini must **confirm or refute each with `file:line`**, then produce a ranked kill list.

---

## 5. Target outcomes (Claude Code north stars)

### 5.1 Speed (measurable)

| Metric | Target | Notes |
|---|---|---|
| LCP `/unbox` (mobile slow-4G, median of 3) | **≤ 4.0 s** aspirational · **≥ Perf 70** gate | Same workflow as HANDOFF; ratchet baseline only after win |
| LCP element | Real row text (PO last-8 / title) or honest empty copy — **never** pulse bars when seed has rows | Screenshot-failable |
| CLS | Stay ≈ 0 | FirstPaint geometry must match sheet `h-11` rows |
| TBT | Do not regress past ~150 ms | Defer, don’t block main thread with Displays |
| Initial JS gz | Trend down from ~971 KB | Deletion > micro-opt |

### 5.2 Simplify (operator + code)

| Outcome | Fail if |
|---|---|
| Browse first viewport = flush sheet of facts (or one honest empty line) | Card soup / KPI tiles / pulse parade before rows |
| Carton open = identity + PO lines + dock — Displays closed until armed | Ticket/Photos body in first carton paint |
| One owner for Queue table chunk | Two competing `dynamic(ReceivingLinesTable)` stories without a shared split module |
| Skeleton modules are **geometry fallbacks ≤200 ms**, not the product face | Soft-radius skeleton readable as the Unbox brand |

### 5.3 Anti-goals

- New page-local design language / marketing landing polish on Unbox
- Remounting ProcedureDeck on main dogfood
- Raising lighthouse / DS / knip baselines to green
- Starting / restarting the user dev server (`:3050` attach-only)
- “Simplify” by hiding scan bar or return-to-scan CTA
- Merging browse Queue and carton instrument into one always-mounted mega-tree “for consistency”

---

## 6. Suggested investigation order (Gemini → Claude Code)

1. Reproduce: cold `/unbox` with network throttling; identify LCP element in Performance panel (text node vs skeleton).  
2. Trace seed: does `seedUnboxQueue` return rows in HTML? If empty, why soft-fail?  
3. Trace handoff: when does `ReceivingLinesTable` fire `onPrimaryPainted` vs when FirstPaint unmounts?  
4. Bundle: which parent imports pull `LineEditPanel` into browse.  
5. Compare Packer + To-ship seed patterns — list **exact** deltas Unbox still lacks.  
6. Propose deletion-ordered P0 (seed honesty + LCP element) before P1 (chunk split) before P2 (carton defer).

---

## 7. Related docs (read; do not re-open closed geometry wars)

| Doc | Use |
|---|---|
| [`docs/performance/HANDOFF-lcp-streaming.md`](../../docs/performance/HANDOFF-lcp-streaming.md) | Attack order + measure workflow |
| [`docs/performance/LIGHTHOUSE.md`](../../docs/performance/LIGHTHOUSE.md) | How to run audits |
| [`display/unbox-station.md`](../../.claude/rules/display/unbox-station.md) | Carton golden — simplify within this |
| [`unbox-dock-two-band-floor-GEMINI-RESEARCH-BRIEFING.md`](./unbox-dock-two-band-floor-GEMINI-RESEARCH-BRIEFING.md) | Format twin; dock geometry **already ruled** |
| [`ops-table-simplification-GEMINI-RESEARCH-BRIEFING.md`](./ops-table-simplification-GEMINI-RESEARCH-BRIEFING.md) | Grid engine is not the LCP problem |
| [`optimistic-url-paint-industry-GEMINI-RESEARCH-BRIEFING.md`](./optimistic-url-paint-industry-GEMINI-RESEARCH-BRIEFING.md) | URL paint — different job from LCP seed |

---

## 8. Hard constraints (unchanged)

- `AGENTS.md` / hooks: no secret commits, no `db:push`, no force-push, user owns commits.  
- `npm run verify` green before done; never raise ratchet baselines.  
- Org scope via existing helpers; no raw client `db`.  
- Scan safety: after speed patches, dogfood scan → open carton → dock still advances.  
- Attach `:3050`; never start/restart/kill the user dev server.

---

## 9. What “done” looks like for this research (before any code)

Gemini’s report ends when:

1. D1 matrix is filled with Pass/Partial/Fail + rulings.  
2. D2 ranks bottlenecks with evidence; H1–H8 are confirmed or killed.  
3. D3–D5 give Claude Code an ordered patch list with owners.  
4. D6 is screenshot + Lighthouse fail-able.  
5. D9 is paste-ready ≤40 lines.

Code implementation is a **follow-on** session using D9 — this brief is the research product.
