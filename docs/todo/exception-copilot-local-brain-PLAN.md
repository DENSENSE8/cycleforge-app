# Exception & Triage Copilot — local brain first, one display method (PLAN)

**Status:** plan of record (2026-09-05). ROI rank #1 from the AI-first review (support automation and integrated agentic ops carry the benchmark multiples; see §12 sources). Extends [`ask-org-scoped-chat-PLAN.md`](ask-org-scoped-chat-PLAN.md) — it already reserves "Mark this carton unmatched / complete triage → **new mutation kind** wrapping `completeTriage`"; this plan builds that slice with a model, a verb set, and a display law.
**Repo:** `cycleforge-app` · **Surface:** `/shipping/exceptions` (`OrderExceptionsWorkbench`) + desk/station Ask (the existing mouth — no new surface).
**Model plane:** local `gpt-oss-20b` + the operator-trained **inference & interaction adapter** (LoRA), served OpenAI-wire; cloud only as failover. No new provider entry — the `ollama` slot in the org provider chain *is* the local slot.

**The three laws of this plan**

1. **Model plane is local-first.** gpt-oss-20b+adapter classifies and drafts; the cloud chain only receives what local could not do. Exception notes/tracking numbers stay on-prem by default.
2. **The display plane is ONE method on desktop.** The queue is the record plane. Every copilot output is exactly one artifact in the existing session surface. One Apply chokepoint. Zero new chrome, rails, dialogs, or chat stacks.
3. **The verb plane goes through the existing chokepoints.** Reads = registered read tools. Writes = new `mutation_kind`s through `applyAgentMutation` with a trust class and a permission that is deliberately not defaulted. The human applies. Revert comes free from the ledger.

---

## §1 What this is (and is not)

This is a **disposition copilot for the held-order queue**: the agent reads the open exceptions, drafts per-row dispositions with a confidence and a reason, renders ONE triage artifact, and the operator applies the accepted rows at the same chokepoint the import desk uses. The local brain makes it cheap enough to run on every shift and private enough to keep customer-visible text on-prem.

This is **not**: a new table, a new `*GridRow`, a new rail, a Dialog record plane, a fourth chat stack, auto-send to customers, `execute_sql`, or ML training inside the app. "Bulk" is the row verb at n — the artifact is a cardinality, not a mode.

| Operator reality | System behavior |
|---|---|
| 40 open exceptions, 3 reasons dominate | Copilot drafts dispositions for every row with confidence + reason |
| Operator unticks 6 rows, hits Apply | Accepted rows mutate through `applyAgentMutation` under the operator's session; ledger records; revert works |
| "Why is this one held?" | `get_exception_detail` assembles tracking/order/serial/photos context; answer cites the row |
| Local box is down or cold | Chain fails over to grok → gateway → openai → anthropic (existing order) |
| Adapter misclassifies | Nothing lands: day-one trust class is `review` — a human applies |

---

## §2 Current state we keep (verified 2026-09-05)

- **Queue:** `orders_exceptions` (`shipping_tracking_number`, `source_station`, `staff_name`, `exception_reason` default `not_found`, `notes`, `status` default `open`). Page: `src/app/shipping/(desk)/exceptions/page.tsx` → `OrderExceptionsWorkbench` — desk stage small-first + `DataTableFullscreenToggle` fullscreen CTA (operator brief 2026-08-31, restored 2026-08-31). Mount law: `/shipping/exceptions` is `tableId: 'orders'`, different row source. No new table.
- **Provider chain:** default order is **local-first** — `ollama → grok → ai_gateway → openai → anthropic` (`src/lib/ai/org-provider.ts`, `provider-order.ts`; `LOCAL_SEQUENCE = ['ollama']`). The `ollama` credential is `{ baseUrl, model }` — any OpenAI-compatible endpoint. `failover.ts` already budgets a long local timeout (cold MLX load ~14s); `provider-health.ts` gives `ollama` the local 60s timeout.
- **Wire normalization:** `src/lib/ai/hermes-tool-call.ts` already normalizes tool calls on the OpenAI wire (battle-tested against `mlx-dspark` 2026-09-02, incl. `required`/`auto`/named `tool_choice`).
- **Loops:** `grok-agent-loop.ts` = OpenAI-wire full tool loop (parallel tool calls, tool_calls by wire index, timeouts 30s first-byte / 120s round); `agent-loop.ts` = Anthropic loop (`claude-opus-4-8`, MAX_TURNS 8, one user message per tool round, `pause_turn` continuation). Both share `dispatch.ts` and the same registry.
- **Writes:** `apply-agent-mutation.ts` + `MUTATION_KINDS` in `src/lib/surfaces/registry.ts`; trust `auto | draft_scoped | review`; statuses `proposed → under_review → approved → applied` (+`rejected`/`reverted`); per-kind permission required. `revert_mutation` tool exists.
- **Human-accepts pattern:** `triage_orders_csv` writes nothing; the `import_triage` artifact carries an "Import accepted" button that posts accepted rows under the user's session (`POST /api/orders/import-csv`). This is the pattern the disposition artifact copies.
- **Enrichment:** `enrich-turn.ts` intercepts in order: carton brief (`carton-ask-brief.ts`) → org chat facts → `local_ops` fast path → generic. An exception brief slots into the same head of the pipe.
- **Eval precedents:** `eval:mlx-smoke` (`tools/eval-ledger/mlx-eval-chat.mjs`) probes `CYCLEFORGE_MLX_BASE` / Mac :8081 / prometheus:8080 with OpenAI-wire chat; `scripts/verify-profile.mjs` declares gates with `inputs` (a new gate without inputs fails `ci-core.test.ts`); `session-surface-cohort` pins the artifact contract.

---

## §3 Phase 0 — land in-flight work before anything else

- [ ] Commit or stash the uncommitted loop work (`agent-loop.ts` +126, `grok-agent-loop.ts` +69, `chat-persistence.ts` +50, `tools/index.ts`, `read-tools` tests) — the copilot builds on this loop, not a fork of it.
- [ ] `node scripts/ci-status.mjs` on HEAD; `pnpm run verify:fast` on the touched files only. Fix or report before starting Phase A.

## §4 Phase A — local inference runtime (gpt-oss-20b + interaction adapter)

Serving decision (researched 2026-09-05): **vLLM hosts the adapter; Ollama is dev-only.** GGUF conversion of a fine-tuned gpt-oss breaks tool calling without template surgery, and Ollama has open structured-output failures against the OpenAI SDK. The copilot's whole value is *structured tool calls*, so the adapter trains QLoRA → merges to MXFP4 → serves under vLLM `--enable-lora` (harmony format + native function calling + guided structured outputs).

- [ ] Stand up vLLM with `openai/gpt-oss-20b`: `--enable-lora --lora-modules interaction-adapter=<adapter-path>`, OpenAI-wire on the LAN box. Dev fallback: `ollama run gpt-oss:20b` for smoke only — never the adapter path.
- [ ] Point an org's `ollama` integration credential at the box: `baseUrl: http://<lan-box>:8000/v1`, `model: interaction-adapter`. Health via the existing provider probe (60s local timeout already correct for cold load).
- [ ] **Endpoint-agnostic OpenAI-wire loop.** `grok-agent-loop.ts` must accept `baseURL`/`apiKey` from the *resolved org provider* (the `ollama` slot) instead of only the Grok OAuth relay; keep relay behavior when provider is `grok`. The route picks the loop by resolved provider source, not by "is Grok connected".
- [ ] **Adapter contract** (the spec your training run must satisfy — this is the "interaction adapter layer" definition):
  - Emits valid OpenAI `tool_calls` (by index, parallel-safe) whose arguments pass the tool's Zod schema ≥98% of turns.
  - Uses only the copilot verb subset (§5 read tools + §6 write tools + `render_artifact(exception_triage)` + `navigate`/`highlight`).
  - Emits `confidence` (0–1) + `reason_code` on every disposition draft; never invents fields outside the artifact schema.
  - No markdown tables in chat (artifact carries the table); voice token `exception`.
  - `reasoning_effort: low` for classification turns; `medium` for explain-the-row turns. 128k context is ample for the brief; do not paste tables — cite tools.
- [ ] Config surface: `reasoning_effort` and model id ride the org provider config, not hardcode; document the envs next to `CYCLEFORGE_MLX_BASE` in the eval harness header.

## §5 Phase B — read path (the agent can see the queue)

- [ ] `list_exceptions` (domain-read-tools.ts): filters `status`, `exception_reason`, `source_station`, age; capped rows; tenant session only; parameterized — never interpolate operator text into SQL.
- [ ] `get_exception_detail`: one exception → tracking, order lookup, serial/warranty context, linked ticket, photos (`list_receiving_line_photos` pattern) assembled as one response.
- [ ] **Exception brief** in `enrich-turn.ts` (mirror `carton-ask-brief.ts`): selection `kind: 'exceptions'` (or exceptions page context) + utterance about the row → inject the row brief; voice `exception`. Zero-model `local_ops` short-circuit only for pure counts; dispositions always model-side.
- [ ] Unit tests beside `domain-read-tools.test.ts` / `enrich-turn.test.ts` — same style, tenant GUC asserted.

## §6 Phase C — write path (dispositions through the chokepoint)

- [ ] New `MUTATION_KINDS` in `src/lib/surfaces/registry.ts` (each with an explicit permission, trust, targetKind):
  - `order_exception.set_status` — trust **`review`** (status open → resolved/needs_action + disposition note). Day one: nothing auto-applies.
  - `receiving_triage.classify` — wraps `completeTriage` per the ask-plan reservation; trust `review`.
  - `order_import_exception.resolve` — trust `review`.
- [ ] Copilot tool `draft_exception_dispositions(rows[])` → **writes nothing**; returns drafts with `confidence` + `reason_code` + `mutation_kind` per row. The artifact renders them; Apply is the human action (§7).
- [ ] Apply chokepoint: the artifact's single "Apply accepted" button posts per-row `propose_mutation` under the user's session (same shape as the import desk's "Import accepted"). Rows land `proposed` in `agent_mutations`; the existing review UI applies them; `revert_mutation` works from day one.
- [ ] Confidence gate: rows below `0.7` render as "needs eyes" — listed, never pre-ticked.

## §7 Phase D — display plane: ONE method on desktop

Law: the queue stays the record plane (workbench on the desk stage, small-first + fullscreen CTA as briefed). The copilot adds **no chrome** — it adds one artifact kind and one Apply button.

- [ ] New artifact kind `exception_triage` in `ui-artifacts.ts` (clone the `import_triage` discriminated branch): rows of `{ id, tracking, reason, disposition, confidence, reason_code, selected }` — plain strings/numbers/booleans only, ≤200 rows, `entityHint` so a row click focuses the live row in the table via the existing `highlight` UI tool.
- [ ] Renderer in the **existing** session surface (`SessionSurface` / `ArtifactViewPanel`); client validates before render; malformed → notice, never a guessed render. Register in `session-surface-cohort` allowed kinds; keep its forbidden patterns (no `dangerouslySetInnerHTML`, no mutation imports in the artifact plane, keyboard reachability) green.
- [ ] One "Apply accepted" button → §6 chokepoint. Feedback through **`WeldedFeedbackPanel`** on the mouth (`ds_contract "staff reaction on the composer"`) — no toasts, no caption band, no second card.
- [ ] Center Lock holds: dispositions happen in the artifact plane; the table row visibly flips status on refresh; eyes never leave the table for the record itself.
- [ ] **Refuses (each is a cohort/law failure, not a style opinion):** no new table/grid/columns (`ordersCompoundColumnsFor` untouched); no rail, Dialog record plane, or `RightRailHost detail:*`; no `FilterRefinementBar`; no markdown tables in chat; no per-lane action key list; no second Apply path; no standing keycaps — staff `?` paints `HotkeyGlyph` inside buttons.
- [ ] Design-mcp before any `.tsx`: `ds_contract "exception triage artifact on the session surface"`, `ds_tokens` as needed, `ds_critique` on every touched file (hooks deny UI writes without a fresh stamp).

## §8 Phase E — adapter acceptance harness (eval before trust)

The adapter earns the exceptions surface by passing a harness, not by vibe.

- [ ] `tools/eval-ledger/copilot-adapter-eval.mjs` + `pnpm run eval:copilot-adapter` (pattern: `mlx-eval-chat.mjs`; probes `CYCLEFORGE_COPILOT_BASE` first). Fixture: ≥60 labeled scenarios in `tools/eval-ledger/fixtures/copilot-adapter/` (live queue anonymized + synthetic reason-code cases).
- [ ] Scored: tool-call validity, Zod schema pass rate, disposition agreement vs human labels (per reason code), hallucinated-field rate, p50/p95 latency, and "never writes" (drafts only). A red run exits 0 with a red receipt — red is the product, not a crash.
- [ ] **Promotion gates:** schema ≥98%, valid tool calls ≥95%, label agreement ≥80% overall and ≥70% per reason code, zero write attempts, zero SQL interpolation → adapter may serve `review`-trust drafts. Below that: local runs **shadow** (read-only answers only), cloud drafts.
- [ ] CI: new gate in `scripts/verify-profile.mjs` — `name: 'Eval: copilot adapter'`, `inputs: [harness, fixtures dir, registry.ts, ui-artifacts.ts, domain-read-tools.ts]` (a gate without declared inputs fails `ci-core.test.ts`). Session law: run the harness on touched files; read receipts via `node scripts/ci-status.mjs`.

## §9 Phase F — evals, cohorts, receipts (per eval-engineering law)

- [ ] Any table-adjacent edit → `pnpm run eval:cohort slot-table`; any artifact edit → the session cohort; shortcut edits → `shortcuts` cohort.
- [ ] `eval:discover` for grid leftovers before claiming done; delete only unblocked DELETE ids; never KEEP-lawed files (`DateRangePickerField`, `DataTableFilterMenu`, `ordersCompoundColumnsFor`, …).
- [ ] Cross-cutting (loop transport change touches both loops): `cursor-eval.mjs --full`, not `--fast`.
- [ ] Commit receipts land from the self-hosted runner; `ci-status.mjs` is the read, never a re-run of the full profile.

## §10 Phase G — rollout

- [ ] **Shadow** (local classifies, artifact renders, Apply disabled) → **Review** (Apply on, every row `proposed`) → per-reason-code automation later (`automation_rules`-style), only after weeks of ≥95% agreement on that code.
- [ ] Enable per org: permission gate (assistant.chat + exceptions write permission) + the `ollama` credential pointed at the box. Dogfood org #1 first.
- [ ] Telemetry: `ai-usage-row` adapter rows for the local source; `trust-stats` on the mutation ledger; weekly label-agreement report from the harness fixture.
- [ ] Privacy default: notes/tracking stay local; cloud failover receives the brief, not raw note dumps — the brief builder is the redaction boundary.

## §11 Risks

- **20B misclassifies a high-stakes row** → trust `review` day one, confidence gate, revert from the ledger; per-reason promotion is earned (§8/§10).
- **Adapter drift after a retrain** → the harness gate re-runs before the adapter id is repointed; shadow on fail.
- **Local box down/cold** → existing chain order fails over automatically; long local timeout already tuned; artifact renders "answered by cloud" provenance chip.
- **vLLM/harmony quirks** (tool-call channels, guided JSON) → `hermes-tool-call.ts` already normalizes the wire; harness catches schema misses before they reach the desk.

## §12 Sources (ROI + serving stack, 2026-09-05)

Integrated agentic AI ≈ 2–3x ROI of point solutions (Deposco; Olimp 2026); AI support resolution $0.99–2.00 vs $6–12, realistic 35–50% automation, ~301% 3-yr ROI (Digital Applied; Fin); AI as the new warehouse UI (4flow). Serving: vLLM GPT-OSS recipe; Ollama GGUF tool-calling breakage (OpenAI community); Ollama structured-output issues vs OpenAI SDK (glukhov.org); QLoRA → MXFP4 → vLLM pipeline (Unsloth).
