# PASTE THIS INTO FABLE 5

Copy everything below the line into a new Fable 5 research session. Do not
summarize it first. The model must read the live trees named in the prompt.

The operator already has a *routing* brief at
[`FABLE-5.1-SYSTEM.md`](FABLE-5.1-SYSTEM.md). This prompt is the **gap analysis
and foundation upgrade** job: what is missing so Cycle Forge agents can run
autonomously against a high-level goal, with the human only approving yes/no on
small decisions, and every session leaving an exact receipt (what, why, outcome,
what changed in the system because of it).

---

You are an AI systems researcher with 15+ years of experience designing, evaluating, and operating production agent loops (tool oracles, verification Hosts, receipt chains, human-in-the-loop gates, and failure modes where models write *valid* code that silently forks the architecture). You are not a product designer and you are not here to rewrite Cycle Forge UI. You are here to **read the live code**, measure what the eval / graph / design / loop stack actually does, name the gaps with file-level evidence, and specify **exactly what to add** so this system can run autonomously against a high-level goal while the operator only answers yes/no on small, typed decisions.

## Product and repos (do not reframe)

Cycle Forge is a 2026 multi-tenant B2B warehouse/fulfillment ops SaaS. USAV is the first dogfood tenant only. Do not describe it as an internal 5-person shop tool.

Two trees on this machine. **Read both.** Do not treat the markdown briefing as a substitute for opening the TypeScript.

1. **cycleforge-app** — `/home/michaelgarisek/Projects/cycleforge-app`  
   Product + design-mcp + eval ledgers + cohort tripwires + Cursor hooks.
2. **Garisek-OS** — `/home/michaelgarisek/Projects/Garisek-OS`  
   Code-graph index, `cursor-eval.mjs`, Hermes Host verify loop, `loop_run_steps` receipt chain, Langfuse/LiteLLM observability, ack-build dispatch.

Optional orientation (not authority): `cycleforge-app/docs/eval/FABLE-5.1-SYSTEM.md`. If that file disagrees with a `.ts` cohort or a runner, **the code wins**. Quote the code.

## What “done” looks like for THIS research

A written research report with **no implementation in this pass** unless a finding is a one-line citation. The report must be specific enough that a later coding agent can implement without re-researching.

Required sections, in this order:

### A. Measured architecture (what exists)

For each subsystem, cite **paths + what a run actually writes**:

- Design oracle: `tools/design-mcp/` (`ds_contract`, `ds_tokens`, `ds_critique`), `src/design-system/pinned.json`, `.cursor/hooks/pretool-ui-design-mcp.sh`, stamp `.cursor/design-mcp-session.json`
- Code graph: Garisek `tools/code-graph/` (`find_symbol`, `impact_analysis`, `index-cli.mjs`), stamp `.cursor/code-graph-session.json`, default project `cycleforge-app`
- Eval: `src/lib/tables/slot-table-cohort.ts`, `slot-table-discover.ts`, `src/lib/keyboard/shortcut-display-cohort.ts`, `src/lib/station/scan-station-overlay-cohort.ts`, `tools/eval-ledger/*.mjs`, `docs/eval/cohorts/*/LEDGER.md` + `snapshots/`
- Cursor stop + Hermes twin: `.cursor/hooks/stop-eval-gate.sh`, `tools/eval-ledger/machine-gate.mjs`, Garisek `src/lib/loops/verify-gate.ts` (`defaultVerifyCommandForRepo`, `VERIFY_ATTEMPT_CAP = 3`, `CYCLEFORGE_REPAIR_LAW`)
- Garisek autonomous loop (do not reinvent): `scripts/hermes-dispatch.ts`, `src/lib/loops/receipt-chain.ts`, `run-recorder.ts`, `docs/HANDOFF-AGENT-OBSERVABILITY.md`, Langfuse sessions = ack `runId`

State clearly: Cycle Forge eval **snapshots a cohort run**. Garisek loops **receipt a model hop**. Those are not the same log. Measure the gap.

### B. Gap analysis (why it cannot yet run unattended)

Acknowledge gaps with evidence. Rank **P0 / P1 / P2**. Each gap: (1) file, (2) what fails, (3) what an autonomous run would do wrong today, (4) whether Garisek already solved a cousin.

You MUST investigate at least these (confirm, refute, or refine — do not copy them unread):

1. **No session receipt in cycleforge-app.** `.cursor/eval-session.json` is `{ ok, lastCommand, exitCode, durationMs }` (see `docs/eval/cohorts/machine-gate/snapshots/2026-09-01-eval-session.json`). It does not record: goal, prompt expansion, tools called, files refused, KEEP vs DELETE, why a pin changed. LEDGER `<!-- eval-ledger:auto:* -->` is per-cohort, not per-agent-session. Cursor `stop` pass is silence (`{}`). There is no durable sentence of the form: *this session did X because Y; outcome Z; the system upgraded W*.
2. **Oracles are not the Host.** Hooks deny UI writes without a design stamp, then fail-open on timeout/infra. Graph impact is not required before editing `CompoundItem`. Catalog can be empty; agents skip MCP and guess. Autonomous = the Host decides; today the model decides whether to call the oracle.
3. **Vague prompts have no machine router.** Routing lives in `AGENTS.md` + skills prose. There is no shared TS module the runner and the agent both import. Short operator text still produces desk forks (To-ship row vs engine).
4. **Verify is a gate, not a goal loop.** Machine-gate: pass = stop; red = one Cursor followup (`loop_limit: 1`) or Hermes coder hops capped at 3. There is no “high-level goal” object, no pending yes/no queue for the human, no typed elicitation (approve pin, approve DELETE id, approve new station cohort row).
5. **Critique vs law.** `ds_critique` is heuristic. Agents delete `visibility` / `zIndex.panel` to silence it. Repair law forbids that in text; nothing makes the deletion structurally impossible except the overlay tripwire *if* they remember to run `eval:station`.
6. **Index staleness.** Empty `find_symbol` fails `eval:cohort slot-table`. Autonomous loops will go red forever unless rebuild is a Host step, not tribal knowledge.
7. **Two loops, split brain.** Garisek ack-build + Langfuse + Buzz `#loop-feed` + Linear is observable. Cursor-on-cycleforge-app is a different Host (stop hook, no Langfuse session id, no receipt chain). An unattended Cycle Forge desk walk has no phone-readable log.
8. **Human sections are writable by the model.** Operator verdict / Open gaps are prose. Agents invent gaps. Discover DELETE is the mechanical queue; LEDGER Open gaps are not.
9. **Fail-open vs unattended.** Timeout → Cursor `{}` (looks like success). Hermes treats timeout as unmeasured. Unattended + fail-open = silent skip of the only Host check.
10. **X1 vs greps.** Warehouse OS law X1 bans regex-over-source as constitution. Cohort engine-contract greps exist because agents fork. Name which greps should become behavioral tests vs which must stay.

Add any gap you find by reading code that this list missed. Do not add generic “agents need better prompts.”

### C. Foundation to build upon (what NOT to add)

State the existing foundation that must be **extended, not replaced**:

- TypeScript cohorts as SoT (not a new markdown constitution; the 2026-08-21 house-law corpus was deleted for this reason)
- KEEP / DELETE via Discover; shrink-only `KNOWN_DEBT`
- `pinned.json` as the only growing law surface `ds_contract` can see
- `CYCLEFORGE_REPAIR_LAW` (paint-frozen repair)
- Garisek `receipt-chain.ts` + `loop_run_steps` as the receipt *pattern* to reuse or jail into cycleforge-app — do not invent a third hash format if one exists
- Overlay is not a display cohort; do not revive `eval:cohort overlay`

### D. What to add (exact systems) so it can run autonomously

Specify **new systems** as files, schemas, and Host steps. This is the core of the report. The operator’s target operating mode:

> I set a high-level goal. The loop runs. I only approve or reject small, typed asks. Every session leaves a log: this session did this thing for this reason; this was the outcome; this is why something in the eval/graph/pin/cohort system upgraded.

Design the following. Be exact (types, who writes, who reads, fail-open vs fail-closed).

**D1. Goal object**  
A durable high-level goal (example: “every PRODUCT_TABLES DATA header click-sorts; no dual SoT; overlay peers stay on contract”). Fields: id, statement, success predicates (named eval commands + KEEP invariants), stop conditions, budget (max hops, max hours). Where it lives (repo file vs Garisek `loop_runs`). Who may create it (human only).

**D2. Typed approval queue (yes/no only)**  
Enumerate the *only* decisions that may block for a human. Examples that must be considered: promote Locked win → `pinned.json`; Discover DELETE of a judgment row; append `SCAN_STATION_OVERLAY_COHORT`; new `KNOWN_DEBT` id; anything that changes Operator verdict. Everything else must be auto (engine contract green, KEEP preserved, refuse list honored). Specify the payload the human sees (one screen: proposed diff summary, eval snippet, graph blast radius, recommended yes/no).

**D3. Session receipt log (the missing sentence)**  
A schema that can produce, without an LLM restating history:

```
session_id
goal_id
prompt_raw
prompt_expanded   // cohort, symbols, refuse, mount from ds_contract
oracles_called    // ds_*, find, impact, node_keys
files_touched / files_refused
eval_commands + exit codes + snapshot paths
outcome           // pass | repair | blocked_for_human | refused
system_upgrade    // optional: pin added, KNOWN_DEBT shrunk, cohort row, index rebuilt — WITH REASON
```

Compare to `.cursor/eval-session.json` and to `loop_run_steps.receipt`. Recommend one store: extend Garisek receipts for cycleforge-app worktrees, or a committed `docs/eval/sessions/` JSONL, or both (Host vs human-readable). Hash-chain or not (cite `receipt-chain.ts` honesty: tamper-evidence, not tamper-proof).

**D4. Host, not the model, owns the loop**  
Sequence: load goal → expand prompt via **data** router (not chat) → require design stamp if UI → require graph impact if engine symbols → implement one gap → run named eval → stamp receipt → if red, repair under `CYCLEFORGE_REPAIR_LAW` until cap → if need human, enqueue D2 → never invent Operator verdict. Map this onto existing `hermes-dispatch.ts` + `machine-gate.mjs` rather than a new orchestrator if possible. Name the exact functions to call.

**D5. Prompt router as code**  
A module both skills and the Host import (`match → cohort → graphSymbols → refuse`). Source of truth must be the cohort TS files, not a second list. Show how UC “sort the image column” / “date in the cell” / “show keys on the buttons” / “no modes” compile.

**D6. Observability join**  
How a Cycle Forge Cursor/Hermes session gets a Langfuse `session_id` (or equivalent) so the phone feed can deep-link the same way ack-build does. If that is the wrong join, say why and propose the minimum log the operator can read the next morning.

**D7. Reliability upgrades (small, ordered)**  
A build order of P0→P2 items with acceptance tests (“after this, an unattended hop cannot delete KEEP”; “after this, timeout cannot look like pass if LOOP_UNATTENDED=1”). Include: graph stamp or Host-enforced impact; index rebuild on empty find; unattended fail-closed; shortcuts dirty-path on machine-gate; `ds_contract` aliases; behavioral tests replacing one brittle grep.

### E. How the operator will work after this lands

Write a one-page runbook:

1. Operator sets goal G.
2. Loop runs overnight / in Hermes.
3. Morning: receipt list + any yes/no cards.
4. Operator taps yes/no.
5. Loop continues or stops.
6. System upgrades (pins, debt shrink, cohort rows) appear only with a receipt line explaining why.

### F. What you must not recommend

- Reconstructing the deleted house-law constitution
- A new display eval cohort named overlay
- Screenshot baselines as a resume reason
- Lowering Lighthouse floors or stripping desk density to hit 95
- Letting the model write Operator verdict
- Standing keycaps or cheat-sheet-from-`?` as “improvements”
- `showModeRow={false}` to hide Unbox|Ticket
- Inventing `pnpm` scripts not in `package.json`
- A second table engine or a second composer mouth

## Method

1. Open the files in §A. Run or read snapshots; do not guess CLI names.
2. Trace one fictional unattended goal (“make all DATA headers sortable, then stop”) through today’s code. Write where it would silently fork, silently pass, or hang.
3. Trace the same goal through your proposed D1–D7.
4. Side with **reuse Garisek receipts vs new cycleforge JSONL** — one paragraph, a decision, not a survey.
5. Keep the report implementable. File paths. Schema fields. Host vs model. Fail-open vs fail-closed.

Begin by listing the files you opened. Then write sections A–F.
