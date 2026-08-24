# Plan — One right-edge wrapper + side-by-side record work

> **SUPERSEDED 2026-08-21 — the compare feature this plan builds no longer exists.**
>
> `unbox-compare-layout.ts`, `orders-compare-layout.ts`, `UnboxCompareHost` and
> `OrdersCompareHost` were deleted (-1,556 LOC), and with them `?clayout=`,
> `c0…c3` and the pane tables. Every phase below that mentions a pane, a
> `clayout` value or a compare host describes code that is gone. The tiling job
> moved to the workspace canvas — see
> [`docs/warehouse-os/02-target-architecture.md`](../warehouse-os/02-target-architecture.md)
> §1 and [`04-roadmap.md`](../warehouse-os/04-roadmap.md) Phase 6. Kept for the
> LOCKED DECISIONS and the measurements, which are still the record; do not plan
> new work from the phase map.

**Status:** Phase 0 baseline MEASURED 2026-08-19. **Split is a lux feature and lands LAST** (ruled 2026-08-19), so every split-dependent phase — 1, 2, 3, 6, 7 — is parked behind it. The three Phase 0 rulings stay open; ruling 2 can now be answered from real numbers.
**Research input:** [`one-wrapper-dual-right-rail-GEMINI-RESEARCH-BRIEFING.md`](one-wrapper-dual-right-rail-GEMINI-RESEARCH-BRIEFING.md) — ANSWERED 2026-08-19, winner **A3** (one inspector host + center split), fallback **A5** (tabbed inspector), **A4** (detached window) as a utility.
**Shape:** 8 phases. Each ends with something you can verify yourself in a browser or one command. No phase depends on a later phase's code.

---

## 0. What the research got right, and what does not survive contact

The verdict holds: **two right rails are arithmetically dishonest at 1440px, and side-by-side belongs in the center.** Adopt that. Four corrections matter enough to change the work:

| Research assumption | Reality in this repo | Consequence |
|---|---|---|
| Center split panes are **record editors**, so making them editable is the work | Panes are **tables** (`ReceivingPaneTable`), each with its own query. `UnboxCompareHost` / `OrdersCompareHost`, `?clayout=split\|quad`, `c0…c3` | The cheap path is **not** building a second editor. Bind the single inspector to the **active pane's selected row**. Compare-two-listings becomes wiring, not a new surface. |
| `activePane` needs inventing | **It already exists** — `UnboxCompareHost:59` — but is cosmetic (`active={activePane === id}` for a border only) | Phase 2 promotes existing state instead of adding a concept. |
| Principle 1: a route mounts ≤1 right host, assert via DOM | Scan stations mount a **second, separate** host by design (the 2026-08 "C2" ruling) | This is a **reversal**, not an assertion. It needs an explicit decision in Phase 0, and it is the riskiest work in the plan — which is why it is sequenced late. |
| Open Question 2: does a wedge scan leak into an inspector input? | **Already solved.** `createWedgeKeyListener` (native capture + yield-before-React) plus `isEditableKeyTarget` and a scan-burst detector | Do not run that experiment. Do re-test it once two panes can hold focus (Phase 4 exit). |

**Two chord collisions in the research's Principle 6 — do not adopt as written.**

- `Cmd+.` is proposed for "toggle the right panel." In this app **⌘. is the scan-bar arm chord** (clear + focus, arm next carton). Binding it to a panel would break the bench.
- `Cmd+\` is proposed for "toggle active pane." **⌘\ is already desk-inspector park.**

Every chord in this plan reuses an owner that already exists, or takes a new one only in Phase 2 with the collision check written down.

**One scoping decision the research did not make:** side-by-side editing is a **desk (Workbench) capability, not a scan-bench one.** A bench holds one transient entity by contract, and its center is locked at 720px. Compare stays available on the bench as it is today (read/browse); the editing work below targets desk queues.

---

## 1. Phase map

| # | Phase | User-visible payoff | Risk |
|---|---|---|---|
| 0 | Rulings + measured baseline | none (decisions on paper) | — |
| 1 | Split-aware frame math + honest clamping | drag can no longer starve the center | low |
| 2 | Active pane becomes real | you can see and switch which pane is live | low |
| 3 | Inspector binds to the active pane | **compare two listings, edit the focused one** | medium |
| 4 | Dirty-state isolation per record | edit A, switch to B, A keeps its draft | medium |
| 5 | One wrapper (shell unification) | one right-edge grammar everywhere | **high** |
| 6 | Tabbed inspector under 1440 | honest degradation on laptops | medium |
| 7 | URL shareability of the whole layout | paste a compare link, get the same screen | low |
| 8 | Detached window (Electron) | true dual-monitor | deferred |

**Sequencing note, stated plainly:** you asked for the wrapper first. I have put it at Phase 5, because it is a large refactor of a live scan-bench host with **no user-visible payoff**, while the side-by-side win is mostly wiring on state that already exists. Phases 1–4 deliver the thing you actually wanted (compare + edit listings) in the smallest change; Phase 5 then pays down the shell debt with the compare work already stable. If you would rather do the wrapper first, Phases 1 and 5 can swap — but Phase 5 before Phase 3 means debugging two hard changes at once on the same surface.

---

## Phase 0 — Rulings and measured baseline

**Goal:** decide the three things that later phases assume, and record where the pixels are today.

**Rulings needed (yours, not mine):**

1. **Reverse C2?** Do the desk inspector and the station tool column become one shell (Phase 5), or stay separate? A "no" here deletes Phase 5 and keeps everything else.
2. **Center floor under split.** At 1440 with the rail parked, two panes land ≈490px each. Is 490 an acceptable working width for a listing table pane, or does split require ≥1600?
3. **Scope confirmation.** Side-by-side editing is desk-only; the bench keeps browse-compare. Confirm or reject.

**Deliverables you can verify:**

- A ruling block appended to this file with your three answers, dated.
- A measured baseline table — real `getBoundingClientRect` values at 1280 / 1440 / 1920 for spine, rail, center, inspector, in three states (no panel · one panel · compare split), captured by a Playwright probe committed at `tests/e2e/frame-baseline.spec.ts`.

**Verify:** `npx playwright test tests/e2e/frame-baseline.spec.ts --project=qa-desktop` prints the table. Numbers, not adjectives.

**Exit criteria:** three rulings recorded; baseline committed. No product code changed.

---

## Phase 1 — Split-aware frame math and honest clamping

**Goal:** the frame arithmetic knows about center splits, and no drag can push the center under its floor.

**Why now:** every later phase moves widths around. Doing this first means each subsequent phase is verified against a floor that is actually enforced.

**Scope:**
- `src/lib/right-rail/frame.ts` — `resolveRightRailFrame` gains the split pane count, so `capPx` accounts for `paneCount × paneMinPx`, not just the single center floor.
- A viewport degradation ladder as a pure function: ≥1920 full · 1440–1919 split allowed, rail parks · 1280–1439 single pane, inspector tabbed · <1280 inspector overlays.
- Resize handles clamp to the resolved cap (they already read it; the cap is what changes).

**Non-goals:** no visual change to a route with no split open.

**Enforcement tier** (per `AGENTS.md` → Guard authoring): pure-function **unit tests** for the math (this is real logic, not source text), plus **Tier 3** — the pane min width lives on the layout token, not on call sites.

**Deliverables you can verify:**
- A ladder table in this doc with the px for each viewport class.
- Unit tests for `resolveRightRailFrame` covering: no split · 2-pane · 4-pane · rail open vs parked, at 1280/1440/1920.
- E2E: open a compare split at 1440, drag the inspector handle left as far as it goes, assert the center never reports below floor.

**Verify:** `npx tsx --test src/lib/right-rail/frame.test.ts` and the drag E2E. Then by hand: open compare, drag the inspector — it should stop, not squeeze.

**Exit criteria:** clamping is provable; nothing looks different yet.

**Rollback:** one module, pure; revert the commit.

---

## Phase 2 — Active pane becomes real

**Goal:** `activePane` stops being a border and starts being the app's notion of "the record you are working on."

**Scope:**
- Promote `activePane` out of `UnboxCompareHost` local state into the compare host's public contract (both Unbox and Orders hosts).
- A visible active affordance that survives a glance at bench distance — the research's "explicit active-pane header," not a 1px ring.
- Focus follows click **and** keyboard: a chord toggles panes. **Chord choice is a Phase 2 deliverable, not an assumption** — `⌘\` and `⌘.` are taken; the candidate is `⌘'` or `Alt+←/→`, checked against `.claude/rules/source-of-truth.md` → keyboard ownership before binding.

**Enforcement tier:** **Tier 4** — an E2E that clicks pane B and asserts the active marker moved; a chord test.

**Deliverables you can verify:**
- Open `?clayout=split` on To-ship: clicking either pane visibly marks it active; the chord toggles; the marker is legible in a screenshot at 100% zoom.
- A one-line chord-collision note in the PR: which chord, and what it does not collide with.

**Exit criteria:** you can tell which pane is live from across the desk.

---

## Phase 3 — The inspector binds to the active pane *(the payoff)*

**Goal:** two listings side by side; the single right inspector shows the one you are focused on. This is the feature you asked for.

**Scope:**
- A pane's row selection opens the existing inspector (today pane rows open nothing).
- Switching active pane **retargets** the inspector — content swaps, the host does **not** remount (the research's Anti-Pattern 4: scroll reset, focus loss, flashing).
- The inspector header states which record it is bound to, so a save can never be ambiguous about its target.
- Inspector stays **N = 1**. No second rail. Ever, at any width.

**Enforcement tier:** **Tier 2** — a scoped `no-restricted-imports` preventing a second inspector host from being mounted by a compare host. **Tier 4** — E2E for the retarget path.

**Deliverables you can verify:**
1. Open two listings side by side at 1440. Click a row in the left pane → inspector shows it. Click a row in the right pane → inspector shows *that* one, header updates.
2. Scroll the inspector, switch panes, switch back — **scroll position preserved** (proves no remount).
3. DOM check: exactly one inspector element at all times.

**Verify:** the E2E prints the inspector's bound record id after each switch, plus its `scrollTop` before/after.

**Exit criteria:** an operator can read listing A and edit listing B without leaving the queue. **Stop here and dogfood before starting Phase 4.**

---

## Phase 4 — Dirty-state isolation per record

**Goal:** unsaved edits survive pane switching, and a save can only ever hit the record it names.

**Why separate from Phase 3:** Phase 3 is navigation; this is data safety. Shipping them together makes a data-loss bug hard to attribute.

**Scope:**
- Draft buffers keyed by entity id (the panel store already caches a draft on close — extend, don't fork).
- A dirty badge on any pane/tab holding uncommitted text.
- Save scope bound to the inspector's target id, asserted at the call site — not inferred from focus.

**Enforcement tier:** **Tier 4** (behaviour) + unit tests on the draft store. This is exactly where a source-text guard would be worthless.

**Deliverables you can verify — the research's own acceptance test:**
1. Type into listing A. Switch to B. Save B. **A is still dirty, badged, and uncommitted in the DB.**
2. Save A. Both land correctly; a DB read confirms each field went to the right row.
3. **Wedge re-test:** with an inspector text field focused, fire a scan burst — it must route to the station buffer, not the input. (The listener already handles this; prove it still does with two panes.)

**Exit criteria:** no path loses an edit; no path saves to the wrong record.

---

## Phase 5 — One wrapper *(only if Phase 0 ruling 1 says yes)*

**Goal:** one right-edge grammar — open, resize, park, close — regardless of what is inside.

**Why it is late and risky:** this touches a live scan bench whose keyboard ownership, visit history, and park semantics are deliberately different from the desk's. The 2026-08 review kept them apart for reasons that were real. Unify **frame mechanics only**; content, keyboard scope, and history stay per-context — that is what the research's own survey describes (VS Code registers views into one container; the views keep their own state).

**Scope:**
- One shell owning: width memory, resize sash, park-to-32px strip, the push/flush geometry.
- Per-context slots keep: keyboard region ownership, visit/history stack, dismiss chord, index rail contents.
- Explicitly **not** merged: `⌘]` (station) and `⌘\`+`]` (desk) stay distinct until an operator asks otherwise.

**Enforcement tier:** **Tier 1/2** — a depcruise rule that only the shell module may declare right-edge geometry; ESLint bans a second host import outside it. **Tier 4** — the existing station and desk E2Es must both pass unchanged, which is the real proof.

**Deliverables you can verify:**
- Park and resize behave identically on `/unbox` (bench) and `/shipping/orders` (desk) — same drag feel, same strip width, same restore.
- Both surfaces' existing E2E suites pass with no edits to their assertions.
- One module owns the geometry; a grep for right-edge width math outside it returns nothing.

**Exit criteria:** identical frame behaviour, zero behavioural regressions on the bench.

**Rollback:** keep the two host entry points as thin wrappers over the shell for one release, so reverting is an import swap.

---

## Phase 6 — Tabbed inspector under 1440 (the A5 fallback)

**Goal:** honest degradation where split does not fit.

**Scope:** below the ladder's split threshold, a second record opens as a **tab in the one inspector** with a dirty badge, instead of a split that would starve the center.

**Deliverables you can verify:** at 1366px, opening a second record produces tabs, not a split; the dirty badge from Phase 4 shows on the inactive tab; at 1920 the same action produces a split.

**Exit criteria:** no viewport produces a layout that violates the Phase 1 floor.

---

## Phase 7 — URL shareability

**Goal:** paste a link, get the same screen.

**Scope:** split layout, both pane queries, active pane, and inspector target serialize to search params (`clayout` / `c0…c3` exist; active pane and inspector target do not).

**Deliverables you can verify:** copy the URL from a 2-up compare with the right pane active and a record open; paste into a clean incognito window; identical screen including which pane is live.

---

## Phase 8 — Detached window *(deferred)*

Feasible — the Electron shell exists — but it buys multi-monitor only, and it introduces state sync, zombie drafts, and window-loss failure modes. **Do not start** until Phases 3–4 have been on the floor long enough to know whether operators actually want a second monitor or just wanted the compare they now have.

---

## Cross-cutting rules for every phase

1. **Enforcement goes to its layer** (`AGENTS.md` → Guard authoring): import boundary → depcruise; prop/import ban → ESLint AST; geometry → TS props and tokens; behaviour → mounted/E2E test. **No `readFileSync` + regex guards.** Where a phase's invariant is behavioural, the deliverable is a Playwright spec, because that is the only thing that can actually observe it.
2. **Measure in the real runner.** Every width claim in this plan is verified by `getBoundingClientRect` in Playwright at a stated viewport, never by reading CSS.
3. **QA org, not the dogfood tenant**, for every spec (`.claude/rules/verify.md`).
4. **One surface first.** Phases 2–4 land on **To-ship orders** only. Unbox History and the rest follow after dogfood — the table-engine fan-out law.
5. **`npm run verify` green before each phase is called done**, and no baseline raised to get there.

---

## Open questions this plan does not answer

- **Is 490px per pane enough** to work a listing at 1440? Phase 0 ruling 2 guesses; only the bench knows. The Phase 3 exit is deliberately a dogfood gate for exactly this.
- **Does an operator want two panes, or one pane plus a better inspector?** Phase 3 answers the compare need without a second editor. If that lands well, Phases 6–8 may never be needed — which would be the cheapest possible outcome and should be treated as a success, not a shortfall.

---

## Phase 0 — measured baseline (2026-08-19)

Captured by `tests/e2e/frame-baseline.spec.ts` (`--project=qa-desktop`), real
`getBoundingClientRect` on `/shipping/orders`. No product code changed.

| viewport | state | frame | spine | context | center | inspector | panes | layout | h-scroll |
|---|---|---|---|---|---|---|---|---|---|
| 1280 | no panel | 1280 | 0 | — | 1280 | — | — | — | no |
| 1280 | one panel | 1280 | 0 | — | 920 | 360 | — | — | no |
| 1280 | compare split | 1280 | 0 | — | 1280 | — | 480 + 520 | split | no |
| 1280 | split + inspector | 1280 | 0 | — | 920 | 360 | 640 | **single** | no |
| 1440 | no panel | 1440 | 0 | — | 1440 | — | — | — | no |
| 1440 | one panel | 1440 | 0 | — | 1020 | 420 | — | — | no |
| 1440 | compare split | 1440 | 0 | — | 1440 | — | 480 + 680 | split | no |
| 1440 | split + inspector | 1440 | 0 | — | 1020 | 420 | **480 + 260** | split | no |
| 1920 | no panel | 1920 | 0 | — | 1920 | — | — | — | no |
| 1920 | one panel | 1920 | 0 | — | 1500 | 420 | — | — | no |
| 1920 | compare split | 1920 | 0 | — | 1920 | — | 480 + 1160 | split | no |
| 1920 | split + inspector | 1920 | 0 | — | 1500 | 420 | 480 + 740 | split | no |

`spine` reads **0** in every row because `ResponsiveLayout` holds `navOpen` in an
unpersisted `useState(false)` — the spine is closed on every cold load, so the
content row *is* the viewport. `context` reads **—** because To-ship is rail-less
by ruling (Pattern E), not because the probe missed it.

### What the numbers change in this plan

1. **"≈490px each at 1440 with the rail parked" is wrong twice.** There is no
   rail on this surface to park, and the split is **not even** — the left pane is
   a stored fixed width (`cf.ordersCompare.splitRatio`, default **480**) and the
   right pane absorbs every change. Phase 0 ruling 2 should be re-asked against
   the real number below.
2. **The failure is already live, and a drag is not what causes it.** At 1440,
   opening the one inspector over a split leaves the right pane at **260px** —
   below the compare host's own `ORDERS_COMPARE_PANE_MIN_PX` (360). Phase 1 was
   scoped as "no *drag* can starve the center"; the measured starve comes from
   **opening a panel**, so Phase 1's clamp must cover the panel-open path too.
3. **A second ladder already exists, and it is the circular one.**
   `resolveOrdersCompareLayoutForWidth` (`src/lib/shipping/orders-compare-layout.ts`)
   downgrades quad → split → single from a `ResizeObserver` on the compare host —
   i.e. it measures the very center the push resizes, which is the feedback shape
   `frame.ts`'s own docblock refuses. It also measures the **host**, not the
   **panes**, which is why 1440 keeps `split` at 260px while 1280 flips to
   `single`. **Phase 1 must absorb this ladder, not sit beside it** — two
   independent answers to "does split still fit" is the fork the plan exists to
   prevent.
4. **Nothing clamps the right pane.** `useHorizontalEdgeResize` bounds the LEFT
   pane only (`minWidth: 280`, `maxWidthPad: 280`); the right pane is `flex-1`
   with no floor.

### Phase 0 exit status

- [x] Baseline committed and reproducible — `npx playwright test tests/e2e/frame-baseline.spec.ts --project=qa-desktop`
- [ ] Ruling 1 — reverse C2 (one shell) or keep the two hosts? (gates Phase 5)
- [ ] Ruling 2 — is **480 + 680** (1440, split, no inspector) and **480 + 260**
      (1440, split, **with** the inspector) acceptable, or does split require
      ≥1600 / an even split / a hard per-pane floor?
- [ ] Ruling 3 — side-by-side editing is desk-only; the bench keeps browse-compare.

---

## Phase 1 — BUILT, VERIFIED, then PARKED (2026-08-19)

**Split is a lux feature and ships last**, so this phase does not belong in the
tree yet. It was written and proved first, then taken back out; the finished work
is held at
[`one-wrapper-dual-right-rail-phase1.patch`](one-wrapper-dual-right-rail-phase1.patch).

```bash
git apply docs/todo/one-wrapper-dual-right-rail-phase1.patch
```

It carried: a split-aware `effectiveCenterFloorPx`, one shared
`centerPaneColumnsThatFit`, a `useCenterSplitDemand` publisher, a derived
(never latched) layout downgrade, and a clamp keeping the flex pane at its min.
Proved by 31/31 in `frame.test.ts` and the browser table below.

**Reapply only when split is actually being built** — and re-verify then rather
than trusting this note, because it will have drifted.

### The gap it closes, left open on purpose

`tests/e2e/frame-baseline.spec.ts` marks it **⚠** rather than failing:

| viewport | state | panes |
|---|---|---|
| 1440 | split + inspector | **480 + 260 ⚠** — under the compare host's own 360 min |
| 1280 | split + inspector | downgrades to single (640) |

Reachable only with `?clayout=split` open. **A route with no split open is
unaffected**, which is why parking this costs nothing today.

Two findings from that build worth keeping, because they change what Phase 1
should be when it comes back:

1. **At 2 columns a frame-level reserve is inert** — `2 × 360 = 720` sits under
   the desk floor of 784, so the cap does not move. Two-up protection has to come
   from the host's own clamp, not the frame. The reserve only bites at 3+ columns.
2. **Reserving and dividing are two jobs with two owners.** The frame is the only
   party that sees all three columns, so it reserves; the host must divide itself
   from its OWN measured width, because the frame cannot see the sheet chrome
   between them (at 1440 the center is 1020 while the compare host is 741 —
   deciding from 1020 is exactly what kept a two-up split alive at 260px).

### Phase 0 exit status (unchanged)

- [x] Baseline committed and reproducible — `npx playwright test tests/e2e/frame-baseline.spec.ts --project=qa-desktop`
- [ ] Ruling 1 — reverse C2 (one shell) or keep the two hosts? (gates Phase 5)
- [ ] Ruling 2 — the per-pane floor. 360 today; above **392** a frame-level
      reserve becomes load-bearing for a two-up split.
- [ ] Ruling 3 — side-by-side editing is desk-only; the bench keeps browse-compare.
