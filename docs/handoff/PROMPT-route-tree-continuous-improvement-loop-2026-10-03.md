# Prompt — route-tree spec loop: keep the Warehouse lane in spec after it is built (2026-10-03)

Law you inherit (read first): `AGENTS.md` → `docs/routing/ROUTE-TREE-PHASE-1-PLAN.md` →
`src/lib/nav/route-tree.ts` + `src/lib/nav/route-tree-law.ts` → `docs/mobile-first/SURFACE_LAW.md`
→ Garisek-OS `docs/AGENT-LOOP-GRAPH-COCKPIT-PLAN-v3.md` (§0 stack, §5.1 `ack-build`, §5.5 deltas,
§6.1 `no_data`, §6.4 ratchet) and `docs/loops/cycleforge-ack-build-EXECUTION-PROMPT.md`.
Dev origin `http://localhost:3050` only; session `tests/.auth/admin.json`. Another session edits
this tree concurrently — re-read before every edit, never revert what you did not write, never
`git stash`, never commit.

---

## 0. Status — moved onto the Garisek spec kernel 2026-10-04 (read this before §1–§6)

Operator rulings that supersede the sections below: **no Hermes anywhere** (§2 GE-B, §3 gateway,
§4 L4 Hermes lanes are dead), **no local models / prometheus**, and (2026-10-04) **the loop core lives
in Garisek OS** with **GEX45 as the system of record**. The contract is Garisek-OS
`docs/loops/SPEC-KERNEL.md`; this repo is a *pack*. Writer `xai-oauth/grok-4.7`, verifier
`google-antigravity/gemini-3.8-flash` (16/16 on `tools/spec-loop/verifier-cases.json`), both through the
`omp-headless` adapter; `pi-headless` is wired and selectable with `--harness`.

**Adding a rule (the first-principles entry point):** append a `SpecRuleV1` to
`tools/spec-loop/contracts.mjs` — the operator's words verbatim, the loop's reading of them, a probe
that can FAIL (static twin preferred: the fix loop can only verify what runs in its sandbox), the
surface, the fix ladder, the lease — **and a mutant in `tools/spec-loop/mutants.mjs` that makes the probe
fire** (an active rule without one fails pack validation). Then `pnpm spec:sweep --only contracts` must
show it red when the mutant is planted, and `pnpm spec:loop --debt rule:<id>` hands it to the loop.

| Piece | File | What it does |
|---|---|---|
| Pack | `tools/spec-loop/pack.mjs` | `SpecPackV1` for repo `cycleforge-app`: anchors, rules, mutants, evaluator files, forbidden paths, worker scope, prompt law, roles, budgets ($3 unit / $10 run / $25 day), lane, `stateDir .garisek/spec`. |
| Entry | `scripts/spec.mjs` (`pnpm spec:sweep`, `pnpm spec:loop`) | Resolves `GARISEK_OS_ROOT` and runs Garisek `scripts/spec-kernel/cli.ts` with this pack. |
| Anchors | `tools/spec-loop/anchors.mjs` | Static: `routes · nav-names · disclosure · critique · gate:* (verify-fast) · contracts`. Live (`needs lane:cycleforge@avion`): `smoke` (retries a `page-error` once after a 300 s warm-up) · `contracts-live`. `gaps` needs `design-guard-log`. |
| Contracts | `tools/spec-loop/contracts.mjs` + `live-contracts.mjs` | Operator rulings as probes (Live feed under Operations · every desktop page has a contextual sidebar · Live feed distinct tones · Inventory → Warehouse · Stock has no Labels / Racks / Manage doors · table controls live in the sidebar (`layout.sidebar-owns-table-controls`) · one last-8 helper (`identity.last8-one-helper`)) plus law-only rules (`ds.port`, `ds.surface-split`, `routes.from-tree`). The last two run their `.omp/rules` interrupt rule's own `condition` / `scope` / `globs` over every `src` file (parsed with the kernel's pi-guards parser), ratcheted by `scripts/sidebar-controls.baseline.json` / `scripts/identifier-last8.baseline.json` (shrink-only; `SPEC_WRITE_CONTRACT_BASELINES=1` rewrites). Baselined hits are advisory `<id>:debt` — hand them to the loop one file per unit with `pnpm spec:loop --debt 'contracts#<id>:debt'`. |
| Mutants | `tools/spec-loop/mutants.mjs` | One planted break per probed rule (9 total); `pnpm spec:loop --plant` kill-checks every detector, then fixes. |
| Critique | `anchors.mjs` + `tools/design-mcp/ds.mjs critique-batch` | Every feature UI file, mobile/desktop from `.dependency-cruiser.cjs` (`surface.mjs`); forks ratcheted by `scripts/ds-forks.baseline.json` (shrink-only). |
| Live smoke | `tools/design-mcp/route-tree-smoke.mjs` | Every live ROUTE_TREE node at 430×932 on `:3050`; walks the stock drill; exit 2 = `no_data`. |
| Auth preflight | `tests/auth-preflight.mjs` | One `ensureSession()` for every live probe; failure = `no_data`. |
| Port contract | `tools/spec-loop/port.mjs` (pack `unitChecks`) | Every verb in a raw `<button>` of a fixed file must still render from a design-system-importing file. |
| Write-time rules | `.omp/rules/*.md` | Enforced by omp natively and by the kernel's pi guard extension for pi workers. |
| Static schedule | GEX45 `cycleforge-spec-static.timer` (Garisek `deploy/gex45/`) | Sweeps the pushed branch whenever it moves; receipts to the GEX45 system of record. |
| Live schedule | Avion `~/.config/systemd/user/cycleforge-spec-sweep.{service,timer}` | Live anchors only, every 2 h, against the `:3050` lane. |
| Gap queue | Garisek `tools/design-mcp/project-server.mjs` (`gapVerdict`) | `ds_route` / `ds_vocabulary` log `verdict` + `ask`; the `gaps` anchor reads `ask-operator` / `not-found`. |

Proven before the move (pre-kernel receipts under `.garisek/omp-work/`):
- `loop_…08-51-49-547Z` `--plant`: every detector killed its mutant (4 + 1 + 1 expectations); ESLint `--fix`
  cleared the unused import without a model call (15 → 14); Grok ported the bar onto `DetailDock` (Scan item kept,
  doors and hub removed); verifier confirmed — 1 attempt.
- `loop_…06-14-31-280Z` `--debt contracts`: fixed the three red operator contracts (5 attempts, 2 reverted for
  introducing findings), each verifier-confirmed; **applied**; all contract probes pass static + live at :3050.
- `loop_…07-13-01-385Z` `--debt critique:mobile`: `MobileDailyComposerFields.tsx` raw `<input>`/`<button>` →
  `TextField`/`Button`; **applied**.
- `loop_…07-13-31-401Z` `--debt critique:desktop`: NOT green — the port contract mis-extracted a code fragment as a
  verb and the worker twice injected that text to satisfy it; the **verifier refuted both**. Fixed in `port.mjs`
  (balanced-brace text, verb grammar); `loop_…08-11-37-170Z` then went green + verified on `UnfoundMatchStrip.tsx`
  (popover → `Dialog`, reply → `TicketComposer`). Patch **held for operator review**: it changes the interaction model.
- `loop_…08-51-55-298Z` `--goal`: a comment-only handoff went green + verified, but the diff also rewrote a dated
  operator quote — reverted by hand, then added as a verifier case and a worker/verifier rule (rulings are verbatim).

---

## 1. The use case (decided — build this one first)

**A deterministic spec-conformance loop for the route tree and the Warehouse phone pages.**

"In spec" is already machine-checkable, so the loop's anchors are commands, not opinions:

| Spec | Anchor (command that decides) |
|---|---|
| Tree ↔ pages ↔ phone menu ↔ vocabulary ↔ literal baseline | `node_modules/.bin/tsx scripts/route-tree-guard.ts --json` (verify `Routes`) |
| Parent and child never share a name | `scripts/nav-name-guard.ts --json` |
| First-screen budget of declared surfaces | `scripts/disclosure-audit.ts --json` |
| No design drift in changed UI files | `node tools/design-mcp/ds.mjs critique <file>` per file changed since the last kept receipt |
| Lint + types + source-law gates | `pnpm verify:fast` (exit code + gate table) |
| The pages behave (430×932, live) | the route-tree smoke you build in L1: every live Warehouse node renders at `:3050`, no page error, PathChips where the tree is ≥2 deep, exactly one `[role=dialog]` in sheet stages, no foreign doors on list pages (stock: no Labels / Racks / Manage) |

Why this use case and not another:
- **Small, owned, measurable.** One lane, one tree, anchors that already exist. A loop that
  cannot fail for a real reason teaches nothing; this one fails exactly when a session breaks
  the tree, the menu, the vocabulary or the page.
- **It is what the owner asked for:** "ensure everything is in spec after everything is built".
- **Not** the CycleForge master-plan forge loop: it has never completed stage 1 and its VERIFY
  command is agent-authored (cockpit plan §5.5 deltas 2, 12). An anchor an agent can rewrite is
  not an anchor.
- **Not** autonomous fixing. The loop senses, classifies and opens work; applying code stays a
  human-run artifact (GE-D is Phase-3-gated in the ack-build pack).

## 2. Loop shape

```
sense (deterministic, $0) → receipt → diff vs last KEPT receipt → classify
   ├─ regression   (green → red)                → open an ack-build goal (GE-A manual now; GE-B via Hermes when the gateway is up)
   ├─ gap          (ds_route said ask-operator,  → operator ruling queue (Garisek pin board /system?tab=pins)
   │                unregistered page, banned word in new copy)
   ├─ shrink       (literal baseline advisory)   → propose `route-tree-guard --write-baseline` (shrink only)
   └─ steady       → receipt only
```

Rules (from the cockpit plan — do not relitigate):
- Every run writes a receipt, including a failed sensor. A sensor that could not run is
  `no_data`, rendered differently from zero (§6.1, delta 13).
- Anchors come from `scripts/verify-profile.mjs` and the guard CLIs, never from a model's text.
- §6.4: keep on improvement, revert on regression, record **both**; cost is a ceiling, never a
  term; never sum the repo ratchet with `check:loops`. Ratchet #1 (run-row columns, executor) is
  behind Garisek's **explicit approval gate** — record the composite now, decide keep/revert by
  hand until the operator approves the ratchet.
- CHK-28: no shell/exec inside Garisek's loop surface (`src/app/api/loops`, `src/lib/loops`,
  `src/lib/langgraph`). The sensor lives in this repo's `scripts/` / `tools/`; Garisek only reads
  its recorded result.

## 3. Devices (tailnet, verified 2026-10-03)

| Host | What it is | Role in the loop | Never |
|---|---|---|---|
| `avion` (this Arch box) | Owns `cycleforge-lane@prod` (:3050), systemd user timers (`garisek-*`), Garisek-OS, local Ollama | **Clock + conductor + live probes.** Timer runs the sensor; Playwright probes hit `localhost:3050` here only | Bind another port; start `next dev` |
| `prometheus` (MacBook M5 Pro, 48 GB) | oMLX `:8000` (tunnelled to avion `:18000` by `omlx-prometheus-tunnel.service`), Ollama, LM Studio; `~/Projects/cycleforge-app` clone; Xcode + iPad | **Local model tier** for ack lanes and the fresh-session verifier; WebKit/Safari render check of the same URLs (floor phones are iPhones) | Host the lane; be the only verifier for a regression it authored |
| `gex45` (Linux x86_64, 20 cores, SSH ok) | Spare compute | **Heavy static gates** off the lane box: nightly `pnpm verify` (full) on a fresh checkout of the lane commit | Run browser probes (cookie scope is `:3050` on avion) |
| `iphone-air`, `ipad` | Operator devices | Manual real-device spot check of a flagged page, by the operator | Automated load |
| `packing-station-2-room`, `usav-receiving` (Windows), `ultra-ice` (Android), `usavs-mac-mini` | **Production floor stations** | None | Any loop work, ever |

State at handoff: `hermes-gateway.service` **inactive**, `omlx-prometheus-tunnel.service` and
`ollama.service` active, `garisek-alert@cycleforge-lane@prod` in failed state (lane itself served
:3050 fine during phase 1 — re-check). Garisek's Hermes `deep` tier was once repointed to local
`qwen3.5:9b` while Prometheus was offline (graph-engineering handoff TRAP 10) — confirm where it
points now before routing lanes. `gex45` has no confirmed CycleForge checkout — L0 decides.

## 4. Build order

**L0 — prerequisites (report, change nothing).** Confirm: phase-1 deliverables merged and
`Routes` green; oMLX reachable at `localhost:18000`; Hermes gateway state; whether `gex45` can
hold a checkout (disk, node, pnpm) — if not, nightly full verify runs on avion off-hours.

**L1 — the sensor (CycleForge repo).**
- `tools/design-mcp/route-tree-smoke.mjs`: generated from `ROUTE_TREE` (live nodes with a
  resolvable sample: stock levels from `stockDrillHref`, a known location code, a rack code, a
  tote id) — the permanent form of the phase-1 acceptance probes. Same style as
  `tools/design-mcp/mobile-operational-smoke.mjs`.
- `scripts/spec-sweep.mjs`: runs every anchor in §1, writes
  `.garisek/spec-sweep/<ISO>.json` (`{ commit, anchors: [{ id, status: pass|fail|no_data, exit,
  findings, ms }], composite: { gates_pass, typecheck_errors, failing_tests } }`), diffs against
  `.garisek/spec-sweep/last-kept.json`, prints the classification. `.garisek/` is NOT gitignored
  in this repo today (checked 2026-10-03) — add `.garisek/` to `.gitignore` in the same change.
- Prove detection in a **git worktree**, never the live tree: plant an unregistered
  `src/app/m/(shell)/stock/__probe__/page.tsx` → sweep reports `regression: unregistered-page`;
  remove it → green. Delete the worktree.

**L2 — schedule.** A systemd user timer on avion (`cycleforge-spec-sweep.timer`, pattern of the
existing `garisek-*.timer` units): every 2 h 07:00–19:00 plus on demand. Summary line to the
Garisek pin board; full receipt stays on disk. Liveness: a sweep older than 3 h is itself a
finding (`garisek-timer-liveness` pattern).

**L3 — gap queue.** The design MCP engine already logs every tool call (`logDecision` in
Garisek `tools/design-mcp/project-server.mjs`). Read `ds_route` / `ds_vocabulary` calls that
returned `ask-operator` / `found: false` since the last sweep; each becomes a ruling request
(term or route + the asking session's file). A ruling lands as a `VOCABULARY` / `ROUTE_TREE`
edit with `decided: { by: 'owner', date }` — the loop never writes the ruling itself.

**L4 — regressions to work.** A regression opens a goal for the `ack-build` diamond
(GE-A manual pack now; GE-B through Hermes once the gateway runs): lanes on the local tier,
verifier fresh, synthesize top tier only for a confirmed regression (one full diamond ≈ $0.13 —
probe freely, do not fire full diamonds per sweep). Output is the IMPLEMENTATION prompt; a human
runs it.

**L5 — ratchet (approval-gated).** Only after the operator approves Garisek §6.4 ratchet #1
(migration + executor outside the loop surface): wire `composite` into run rows, keep/revert
recorded both ways.

## 5. Explicitly forbidden

- Loop work on floor stations; browser probes anywhere but avion `:3050`.
- A model deciding pass/fail, dedupe or classification (deterministic code only).
- Auto-applying a fix, auto-committing, `git stash`, editing the live tree from a timer.
- Writing a vocabulary or route ruling without the operator.
- Rendering `no_data` as zero; summing the two ratchets; ratcheting on findings-per-dollar.
- Loosening CHK-28 to run commands from Garisek's loop surface.

## 6. Done looks like

1. L0 report with each prerequisite measured, not assumed.
2. `scripts/spec-sweep.mjs` + `tools/design-mcp/route-tree-smoke.mjs` exist; one receipt from a
   green run on the current commit; the worktree probe proved a planted regression is caught and
   cleared.
3. `cycleforge-spec-sweep.timer` active on avion; a scheduled run produced a receipt and a pin.
4. Gap queue reads real MCP decision logs (or reports `no_data` honestly if there are none yet).
5. A regression opens an ack-build goal (one GE-A run demonstrated) — or the ratchet/GE-B steps
   are reported as blocked on their named approvals.
