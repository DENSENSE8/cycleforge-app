# HANDOFF — train the local tool-router LoRA, in a supervised loop, and prove it end to end

Written 2026-09-06 on avion, after a session that measured both boxes. Everything in a
**Verified** block was measured here; treat it as fact and do not re-derive it. Everything in
**Unverified** is a claim you must prove or disprove yourself, with a command and its output.

You are training **one small model to be a router and a formatter**. You are NOT training a model
that knows the business: the data, the permissions, and the tenancy live in
`runAssistantTool` → permission → Zod → `tenantQuery(orgId)`, and they stay there. The model picks
one of 44 tool names, fills a handful of typed args, and emits a valid artifact envelope. That is
the whole job.

---

## 0. The architecture you are building toward

```
Operator question  →  POST /api/assistant/chat  (avion :3050)
      │
      ├─ local_ops intercept ─────────────────► deterministic, no model at all
      │
      ├─ LOCAL fine-tuned 8B  (the DEFAULT)  ─► tool routing + args + artifact shape
      │     • subsetted tool advertisement (~8 tools/turn, NOT 54)
      │     • prefix caching on the stable prompt head
      │     • target: p50 turn ≤ 8 s, p95 ≤ 20 s, ~90% of turns single-tool
      │
      └─ managed rung (RARE) ─────────────────► multi-hop composition / ambiguous intent
                                                only when a local turn fails a check

Data · permissions · tenancy: NEVER the model's job.
```

The model is a router and a formatter; the registry is the intelligence. Every design decision below
follows from that sentence. If you find yourself trying to teach the model facts about orders,
stop — that is a tool, not a training example.

---

## 1. Verified: the boxes, as they are right now

| Fact | Value | How it was measured |
|---|---|---|
| avion (canonical host) | Arch, kernel 7.1.9, i7-10700, 62 GB RAM | `uname`, `free -g` |
| avion GPU | **RTX 5070 Ti, 16303 MiB, sm_120 (GB203), driver 610.57.04** | `nvidia-smi` |
| avion CUDA toolchain | **no `torch`, no `nvcc`**; system python **3.14.7**; `uv` at `~/.local/bin/uv` | `python3 -c "import torch"`, `which` |
| avion app | `next dev --turbopack -p 3050`, systemd `cycleforge-dev.service` | `ss -ltnp`, journal |
| avion tunnel | `mlx-tunnel.service` (user unit), `-L 127.0.0.1:8081:127.0.0.1:8080 prometheus`, `Restart=always`, restart-verified | `systemctl --user is-active mlx-tunnel` |
| Mac `prometheus` | Mac17,8 arm64, macOS 27.0, **48 GiB unified**, swap 7168 MB total / 6127 MB used | `sysctl hw.memsize`, `vm.swapusage` |
| Mac MLX stack | `mlx` 0.32.2, `mlx-lm` 0.31.3, `transformers` 5.16.1, py 3.11.15, venv `~/CycleForgeAI/.venv` | `pip list` |
| Mac server | `mlx_lm.server --model ~/Models/gpt-oss-20b-MXFP4-Q8 --adapter-path ~/CycleForgeAI/adapters/cycleforge-gpt-oss-v1-promoted --host 127.0.0.1 --port 8080 --max-tokens 2048 --temp 0.0` | `ps`, `lsof -iTCP:8080` |
| Model id binding | **the adapter binds to `default_model` ONLY** (`mlx_lm/server.py:315`). Any other id serves the BASE and evicts the resident model | source + measured 30 s cold-swap |
| Current promoted adapter | LoRA, 24-layer gpt-oss (`hidden_size` 2880, MoE 32 experts), rank 16, scale 32, `q/k/v/o_proj` on 16 layers, 128 tensors, 21,247,708 B, sha256 `308708cb308b5c10024f3b75f34c91181db83427b84ed1f8427f311ebdb4c922` | `shasum`, `safetensors` |
| Phase A gate today | 10/10, tool-sel 1.0, refusal 1.0, leaks 0, invented 0, **19.4 s**, exit 0 | `scripts/eval_server.py` |

### Verified: the numbers that decide the design

| Measurement | Value | Why it matters |
|---|---|---|
| Dock tool advertisement | **54 tools, 35,297 wire bytes** + 5,106 B system ≈ **11.2 k tokens per round** | re-processed every round; this is the dominant cost |
| `first_token_ms` on gpt-oss @ 54 tools | **11,837 / 30,602** (two runs) | prefill-bound, not decode-bound |
| Complete turn, gpt-oss @ 54 tools | `done{ok:true,turns:4}` in **29.8 s**, artifact rendered | the working baseline to beat |
| Same question, `mlx-community/Qwen3.8-27B-4bit` @ 54 tools | first tool frame **98.6 s**, round 2 aborted at 224.9 s → `done{ok:false}` | a smarter model that times out scores zero |
| Same model, 3 tools advertised | first tool call **1.2 s**, full turn 8.1 s | subsetting is worth more than parameters |
| Loop constants | `FIRST_BYTE_TIMEOUT_MS = 30_000`, `ROUND_TIMEOUT_MS = 120_000`, `MAX_TURNS = 8` (`src/lib/assistant/grok-agent-loop.ts:64,66`, `agent-loop.ts:38`) | a data turn is 3–5 rounds; per-round latency multiplies |
| Training/production mismatch (current recipe) | `configs/lora-v1c.yaml` `max_seq_length: 4096` vs 11.2 k-token production prompt | **the existing LoRA has never seen the real prompt** |
| Current dataset | `train` 174 / `valid` 25 / `test` 25 (+17 composer extras), 200 iters × grad-accum 4 ≈ 4.6 epochs, val loss 0.026 | memorization, not generalization |
| Trained tool vocabulary vs the app | **9 of 12** trained tool names do not exist in `src/` (zero grep hits) | the LoRA was trained for a product that isn't this one |

The nine phantom tools: `find_unpaired_order_exceptions`, `get_repricing_candidates`,
`get_order_pairing_health`, `get_catalog_link_chores`, `get_import_exceptions`,
`get_listing_price_scenarios`, `get_marketplace_price_snapshot`, `get_sku_margin_waterfall`,
`get_sku_velocity`. Only `hybrid_entity_search`, `get_order_lookup`, `get_operations_journey`
overlap with the real registry.

### Verified: what already landed in the app (do not regress it)

- `src/lib/ai/harmony.ts` — the ONE Harmony grammar: `parseHarmonyToolCalls` (drops any name not in
  the advertised set), `stripHarmony` / `createHarmonyTextFilter` (the `analysis` channel never
  reaches the operator), `wireSafeArguments` (a truncated arg object rides as `{}` instead of
  killing the turn with `404 Expecting ',' delimiter`).
- `src/lib/assistant/session-surface-cohort.ts` **law 14** pins both Harmony call sites; **law 13**
  pins connect-pill provenance. `session-surface-cohort.test.ts` is the gate.
- `src/lib/assistant/ui-artifacts.ts` — non-empty `artifactTitle`, `externalLink` (https only),
  `appPath` (rejects `//host`), and the column-alias remap that makes `{name,label}` columns
  resolve their cells.
- `src/lib/ai/provider-reachability.ts` — a self-hosted endpoint must pass a `max_tokens: 1`
  generation (`isProviderAlive`, 10 s ceiling); failures expire in 5 s, successes in 60 s.
- `src/lib/assistant/grok-agent-loop.ts` — `enable_thinking: false` and no `reasoning_effort` for
  self-hosted; one "answer the operator in the final channel" nudge per turn; buffered-round memo
  keyed `org:endpointHost`.
- `.env` on avion: `OLLAMA_BASE_URL=http://127.0.0.1:8081/v1`, `OLLAMA_MODEL=default_model`,
  `AI_PROVIDER_ORDER=local-first`, `AI_CHAT_BASE_URL`/`HERMES_API_URL` on the same loopback tunnel.
  **`ANTHROPIC_API_KEY` is deliberately absent. Do not add it. Do not write a path that needs it.**
- The env bootstrap for the `ollama` slot only fires for `DOGFOOD_ORG_ID`
  (`00000000-0000-0000-0000-000000000001`, `src/lib/integrations/credentials.ts:594`). Any other org
  needs a vault row.

### Unverified — prove or disprove, with output pasted into your report

1. **sm_120 training works on this box.** cu128+ torch, a real matmul, `get_device_capability() == (12,0)`,
   and one real 8B generation — not just `import torch`. bitsandbytes ≥0.45.3 claims sm_120 but fails
   with *"no kernel image is available"* against a pre-cu128 torch.
2. **vLLM on sm_120** usually needs a source build with `TORCH_CUDA_ARCH_LIST="12.0"`; generic wheels
   often lack the kernels. `--enable-lora` + `--tool-call-parser hermes` must both work, or the
   serving half of the plan changes.
3. **Whether a fine-tune is needed at all.** Stock `Qwen3-8B` zero-shot on the expanded goldens may
   already clear the tool-selection gate. If it does, the LoRA's job shrinks to format and refusals,
   and you train less, not more.

---

## 2. Decision gate — take this at the START of iteration 0, and record it

Two viable stacks. Pick one on evidence, write the choice and the evidence in the ledger, then stop
revisiting it.

**Path A — CUDA (preferred).** Train QLoRA on avion's 5070 Ti, serve with vLLM on avion.
- Fits: 8B 4-bit + 8 k seq + grad checkpointing ≈ 10–12 GB of 16 GB. 14B at 8 k is tight — drop to
  4 k seq or an 8-bit optimizer. **Never train and serve at the same time on this card.**
- Wins: minutes-per-run (so multiple seeds are affordable), prefix caching, native `tool_calls`,
  `--enable-lora` hot-swap, and it deletes the tunnel/laptop/eviction failure family entirely.
- Setup: `uv venv --python 3.12` (system python 3.14.7 is NOT usable), torch cu128.

**Path B — MLX fallback.** Train with `mlx_lm.lora` on the Mac against an MLX Qwen3-8B, serve on the
Mac at **:8082** (leave `:8080` alone — it is the eval/reference endpoint for the gpt-oss artifact),
repoint the tunnel `-L 8081:127.0.0.1:8082`.
- Take this ONLY if Unverified #1 or #2 fails after a bounded attempt (≤90 minutes). Say so
  explicitly; do not drift into it silently.

Either way the app sees an OpenAI-wire endpoint at `http://127.0.0.1:8081/v1` (Path B) or
`http://127.0.0.1:8000/v1` (Path A). Nothing else in the app changes.

**Base model:** `Qwen3-8B` (36 layers, 32 Q / 8 KV heads, `hidden_size` 4096, vocab 151,936).
Chosen because this exact `mlx_lm.server` already returned `finish_reason: tool_calls` natively for
a Qwen3 model, while gpt-oss logged `WARNING - Received tools but model does not support tool
calling`. Only escalate to 14B if the goldens show *reasoning* failures, never format failures.

**Do NOT attempt to port `cycleforge-gpt-oss-v1-promoted` onto Qwen.** Shapes are incompatible in
every dimension (2880 vs 4096 hidden, 24 vs 36 layers, MoE vs dense, 201,088 vs 151,936 vocab; the
adapter's own tensors are `lora_a (2880,16)` / `lora_b (16,4096)`). Cross-family translation recovers
~14%. Keep the artifact on disk as the rollback and the A/B reference.

---

## 3. Step 1 (before any training) — prompt shape, or the run is wasted

The current recipe trained at 4096 tokens against an 11.2 k-token prompt. Whatever you ship at
runtime becomes the training distribution, so fix runtime first.

- [ ] **Tool subsetting** for self-hosted configs: cap the advertisement at ~8–10 tools per round
      (~2.5 k tokens). Always include the UI tools the turn needs (`render_artifact` is mandatory for
      data answers) plus a small always-on core; select the rest by relevance to the turn. Emit the
      chosen set in the existing `ask-timing` line (`tools_advertised`, `wire_bytes` are already
      logged) so every later measurement is attributable.
- [ ] **Prefix caching**: keep the stable prompt head byte-identical across rounds (system core
      first, volatile context last — `agent-loop.ts` already documents this discipline for the
      Anthropic path). On Path A, enable vLLM prefix caching and prove a cache hit changes
      `first_token_ms`.
- [ ] Record before/after `first_token_ms` and `wire_bytes` for the same question. This is the number
      that makes or breaks the interactive use case.

Acceptance for step 1: the same question that measured `wire_bytes=35297` now measures ≤ 12,000, and
`first_token_ms` drops measurably, with both numbers pasted from the real `ask-timing` log line.

---

## 4. Step 2 — the goldens, before the model

Ten prompts cannot grade 44 tools. Build `evals/cycleforge-v2/golden.jsonl` (keep v1 untouched):

- [ ] **One golden per registered tool** — enumerate from `ASSISTANT_TOOLS` (44 entries,
      `src/lib/assistant/tools/index.ts`), never from memory.
- [ ] Refusals (≥8): tenant smuggling (`organizationId=org_other`), raw SQL, "guess the price",
      "invent an item number from this title", asking for another staffer's rail.
- [ ] Artifact-contract cases (≥10): table with rows keyed to declared columns, timeline, chart,
      record with an in-app path, `document` — each must validate through `parseRenderArtifactInput`.
- [ ] Multi-tool (≥8) and empty-result honesty (≥8).
- [ ] Keep the v1 ids for the ten rows that still apply so old and new reports line up.

Gates (the five from `scripts/eval_server.py` `run()` plus three new ones). Grade **macro per tool**,
not overall — a model that nails one tool and misses eight must not score 1.0:

| Gate | Bar | Source |
|---|---|---|
| `tool_selection_95` | ≥ 0.95 macro | existing |
| `pass_rate_95` | ≥ 0.95 | existing |
| `tenant_leaks_zero` | 0 | existing |
| `invented_ids_zero` | 0 | existing |
| `refusal_90` | ≥ 0.90 | existing |
| `artifact_validates` | ≥ 0.98 first try, no repair round | **new** — `parseRenderArtifactInput` |
| `no_unadvertised_tool_name` | 0 calls to names outside the advertised set | **new** |
| `p95_first_token_ms` | ≤ 8,000 at the subsetted advertisement | **new** |

- [ ] **Baseline stock Qwen3-8B, zero-shot, no adapter, on these goldens. Record it.** This decides
      whether you train at all and is the only honest measure of what the LoRA added.

---

## 5. Step 3 — the dataset, re-cut against the REAL registry

`datasets/cycleforge-v2/` (leave v1 alone). Target **1,500–3,000 accepted traces**.

Generation: use a local teacher for free. **Start it on its own port** so nothing evicts the eval
endpoint — `mlx_lm.server --model mlx-community/Qwen3.8-27B-4bit --host 127.0.0.1 --port 8082`
(one model per server; see §1's id-binding fact).

Every candidate trace passes ALL six deterministic validators, or it is discarded. These exist
already — import them, do not reimplement:

```
ASSISTANT_TOOLS.get(name)                 → the name is one of the 44
tool.inputSchema.safeParse(args)          → args are actually dispatchable
ctx.permissions.has(tool.permission)      → the trace is legal for the role it claims
parseRenderArtifactInput(payload)         → the artifact renders (title non-empty, rows keyed to columns)
/"(organizationId|organization_id|staffId|staff_id)"\s*:/i   → ZERO identity args
/\bCF-19\d{2}\b/                          → ZERO invented identifiers
```

Distribution requirements:
- ≥ 20 accepted traces per tool, none below 12.
- ~15% refusals, ~15% multi-tool, ~10% empty-result honesty, ~10% artifact-only rounds.
- **The prompt in every trace carries the SUBSETTED tool block from §3** — the same shape production
  sends. This is the fix for the 4096-vs-11.2 k defect.
- House vocabulary in the prose: cartons, lines, serials, feeds, nodes.
- **Synthetic only.** No live orders, SKUs, prices, customer names, or real org ids. `QA_ORG_ID`
  (`…0002`) fixtures only.
- Write `datasets/cycleforge-v2/SUMMARY.json` with per-tool counts, per-kind counts, the
  accept/reject tally, and the rejection reasons histogram.

---

## 6. Step 4 — the training loop (this is the part that must actually loop)

Starting config (diff from `configs/lora-v1c.yaml`, which was tuned for a 20B resume and is too cold
for a fresh 8B):

```yaml
base:            Qwen3-8B            # 4-bit for training (QLoRA) / MLX 4-bit on Path B
num_layers:      all                 # not 16
max_seq_length:  8192                # must hold the subsetted advertised block
rank:            32
scale:           64                  # keep scale = 2 × rank
dropout:         0.05
keys:            [q_proj, k_proj, v_proj, o_proj, gate_proj, up_proj, down_proj]
learning_rate:   1.0e-5              # 3e-6 was a resume LR
lr_schedule:     cosine_decay, warmup 5%
epochs:          ~2.5                # iters = 2.5 × N / (batch × grad_accum)
mask_prompt:     true
seed:            42 (then 43, 44 for the reliability runs)
```

**Loop protocol — obey it literally:**

1. Run training as a **supervised process**, never a bare backgrounded shell job:
   `hub` `op:"start"`, name `qwen-lora-train`, with a readiness pattern on the first loss report.
   Watch it with `hub` `op:"logs"` `follow:true` + `cursor`. Do not poll in a tight loop; do not
   block the whole session on it.
2. On completion, run the §4 eval against the freshly served adapter and write
   `evals/cycleforge-v2/eval-<iter>-<seed>.json`.
3. Append one row to `docs/eval/…`-style ledger you own: `evals/cycleforge-v2/LEDGER.md` —
   iteration, the ONE thing changed, every gate value, p50/p95 latency, and the verdict.
4. **All gates pass →** go to §7. **Any gate fails →** change **exactly one thing**, and say why
   before you run:
   - format / artifact failures → data (more traces of that shape, or a stricter validator)
   - a specific tool consistently missed → that tool's `description` in the registry, or its golden
   - refusal failures → more refusal traces, never a system-prompt patch that hides it
   - loss plateau or memorization (val loss collapsing while goldens stall) → fewer epochs, lower LR
   - reasoning/composition failures → **stop**; escalate to 14B, and record that this is a capability
     gap, not a data gap
5. **Iteration cap: 6.** Selection is on the golden score, never on val loss — v1's 0.026 val loss
   over 174 rows was the warning sign, not the win.
6. Once the gates pass, prove reliability: **3 seeds** (42/43/44). Macro tool selection must be
   ≥ 0.95 on all three and the spread ≤ 0.03. Promote the median seed, not the best one.
7. Escalate to a human (write it in the report and stop) if: the iteration cap is hit; a gate needs a
   bar lowered; the fix would require touching operator WIP; or the failure class is capability.

Naming: `adapters/cycleforge-qwen3-8b-v2-<iter>/`, promote by **copying** to
`adapters/cycleforge-qwen3-8b-v2-promoted/`. **Never overwrite
`adapters/cycleforge-gpt-oss-v1-promoted/`.** Never fuse — unfused is what makes hot-swap and A/B
possible, and fusing buys nothing measurable at these latencies.

---

## 7. Step 5 — end-to-end test through the real dock

Model-level goldens are not the deliverable. The deliverable is a turn on the actual surface.

Point the local slot at the new endpoint (`.env` on avion: `OLLAMA_BASE_URL`, `OLLAMA_MODEL`), let
the dev server pick the env up, then sign in and stream a real turn:

```
GET  /api/auth/staff-picker      header x-tenant-slug: usav      → pick a staff row
POST /api/auth/signin            header x-tenant-slug: usav      body {staffId, deviceKind:"personal"}
POST /api/assistant/chat         cookie cf_sid=…                 body {message, sessionId}   ← sessionId is REQUIRED
```

Paste the SSE frames. A passing turn looks like this (measured today on the gpt-oss baseline — beat it):

```
     0ms meta    {provider:"resolving"}
  1542ms meta    {provider:"ollama"}
  4398ms tool    {name:"get_roi_gaps",status:"start"}
  4950ms tool    {name:"get_roi_gaps",status:"end",ok:true}
 27371ms ui_tool {name:"render_artifact",input:{artifact:{kind:"table",title:"ROI Gaps",…}}}
 29796ms done    {ok:true,turns:4,mode:"ollama"}
```

Required end-to-end assertions:

- [ ] `done{ok:true}` with `mode` naming the local slot, on **≥ 8 different questions** covering
      table / timeline / chart / record / refusal / empty-result / multi-tool / connect-pill.
- [ ] The `ask-timing` log line shows `provider`, the new `model`, `turns`, `tools_used` **non-empty**,
      `tools_advertised` at the subsetted number, and `wire_bytes` at the reduced number.
      `tools_used: []` means the bridge or the router did not fire — stop, do not "fix" it by widening
      the tool prompt.
- [ ] **No markup leaks into the operator's text**: assert the concatenated `delta` text matches
      neither `/<\|/` nor `/to=functions\./`.
- [ ] Artifact frames validate through `parseRenderArtifactInput`, with a non-empty `title` and rows
      keyed to the declared columns.
- [ ] **p50 turn ≤ 8 s, p95 ≤ 20 s** across the 8+ questions. Report the raw numbers, not an average
      of your favourites.
- [ ] Kill the endpoint mid-turn (stop the server / `systemctl --user stop mlx-tunnel`). The stream
      must emit `error` AND `done{ok:false}`, and the artifact pending slot must be released.
      Restart and confirm the next turn works within the 5 s failure TTL.
- [ ] Rate limit holds: `assistant-chat`, 25/min per org, fails cleanly.
- [ ] Zero tenant args and zero invented identifiers across every turn.

---

## 8. Ground rules

- **Local inference only.** No Anthropic, no Grok, no paid gateway, no cloud training. If a path
  cannot be exercised locally, say so and say why.
- **The working tree carries large uncommitted operator WIP** (~140 files; `src/components/session/`
  is untracked). Never `stash`, `revert`, or `checkout` anything you did not write. To isolate a
  defect, copy the file aside and restore it.
- Pre-existing failures that are **not yours**: `src/lib/counter/session-events.test.ts` (2),
  `src/lib/stations/nav-command-target.test.ts` (1), and type errors in `src/components/sourcing/*`,
  `src/components/settings/sections/AppearanceSection.tsx`, `src/lib/inventory/locations-path.ts`.
  Do not "fix" them blind.
- UI writes (`src/**/*.{tsx,jsx,css}`) need a fresh design-mcp stamp:
  `node tools/design-mcp/ds.mjs contract "<job>"` → `ds_tokens <axis>` → `ds_critique <file>`.
  Project hooks deny the write without it. **This job should need no `.tsx` writes** — if you think it
  does, say why first.
- `docs/eval/**/LEDGER.md`, `docs/eval/goals/**`, `docs/eval/sessions/**` are never agent-writable.
  Your ledger lives at `evals/cycleforge-v2/LEDGER.md`.
- Long-running things (training, servers, tunnels) go under a supervisor — `hub` `op:"start"` or a
  systemd user unit. Readiness must be **observed**, not assumed; process creation is not readiness.
- Never trust `GET /v1/models` as a health check. Use a `max_tokens: 1` completion (that is exactly
  what `isProviderAlive` now does, and why).
- Do not regress the cohort. Before you finish:
  `npm run test:assistant`, `node --import tsx -r ./scripts/register-server-only-shim.cjs --test src/lib/ai/*.test.ts`,
  `npx tsc --noEmit`, `npm run lint`, `npm run audit-permissions`. Any new law you add must be pinned
  in `src/lib/assistant/session-surface-cohort.ts` or it is unenforceable.

---

## 9. Deliverables — the exact artifacts, nothing less

1. **`evals/cycleforge-v2/golden.jsonl`** — ≥100 rows, one per registered tool plus the categories in
   §4, ids stable.
2. **`datasets/cycleforge-v2/`** — `train/valid/test.jsonl` + `SUMMARY.json` with per-tool counts and
   the reject histogram. Synthetic only.
3. **`adapters/cycleforge-qwen3-8b-v2-promoted/`** — the promoted unfused adapter, plus
   `adapters/cycleforge-qwen3-8b-v2-promoted.sha256`. `cycleforge-gpt-oss-v1-promoted` untouched, hash
   still `308708cb…dbdb4c922`.
4. **`evals/cycleforge-v2/LEDGER.md`** — one row per iteration: what changed, every gate value,
   latency, verdict. Including the failed iterations. Especially those.
5. **`evals/cycleforge-v2/eval-promoted.json`** — all eight gates `true`, macro-averaged, plus the
   three-seed spread.
6. **`evals/cycleforge-v2/baseline-zeroshot.json`** — stock Qwen3-8B, no adapter, same goldens. The
   only honest measure of what training added.
7. **`docs/todo/qwen3-8b-tool-router-RESULT.md`** — the report:
   - Path A or Path B, and the evidence that decided it (Unverified #1 and #2, with command output).
   - The zero-shot baseline vs the promoted adapter, per gate, side by side.
   - Prompt shape before/after: `tools_advertised`, `wire_bytes`, `first_token_ms`.
   - **The pasted SSE frames** for the 8+ end-to-end questions, with the `ask-timing` lines.
   - p50/p95 turn latency, raw.
   - Every attack from §7 that failed to break it, and every one that did — with `file:line`.
   - What you fixed, and what you are handing back.
   - An explicit statement of whether the fine-tune beat the zero-shot baseline **and by how much**.
     "It works" is not a result; if the LoRA added less than the gate margin, say so and recommend
     shipping the base model instead.
8. **Serving change** — `.env` on avion pointing the `ollama` slot at the new endpoint, plus the
   supervisor unit (vLLM service on Path A, or the repointed `mlx-tunnel` on Path B), restart-verified.
9. **Green gates** — the five commands in §8, output pasted.

---

## 10. Kill criteria — say these out loud rather than grinding

- After §3 (subsetting + prefix caching), if p95 first-token stays above ~30 s → the interactive use
  case is not reachable on this hardware. Report it; the local model's value moves to bulk jobs
  (mailbox extraction, `triage_orders_csv`, sheet import, ticket drafts) where latency is free.
- If macro tool selection stalls below 0.90 with **reasoning** errors after 6 iterations → capability
  gap. Recommend 14B or the managed escalation rung. Do not lower a gate to pass.
- If the zero-shot baseline already clears every gate → say so plainly and recommend NOT shipping a
  LoRA. Fine-tuning what the base already does is how a week disappears and general reasoning
  degrades.
