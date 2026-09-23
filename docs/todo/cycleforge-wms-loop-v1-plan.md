# CycleForge WMS Loop V1 — OMP and Harness-Agnostic Plan

**Status:** All four V1 phases verified on 2026-09-17. The machine-readable companion is
[`cycleforge-wms-loop-v1.phase.json`](./cycleforge-wms-loop-v1.phase.json).

## Operating contract

The loop is a sequence of phase records, not an attachment to one coding
harness. OMP is the preferred interactive terminal and may run with
`--advisor`, but Codex, another ACP client, CI, or a local operator can execute
the same phase. A phase is complete only when its declared command exits zero
and its acceptance evidence exists.

- Repository paths in the manifest are relative to `REPO_ROOT`.
- Verifiers are ordinary CLI commands with process exit codes.
- No phase assumes Hermes, `forge.sh`, a particular chat session, or a
  machine-specific checkout path.
- No secret value belongs in this plan or manifest.
- The application remains the state authority: Neon for durable domain state,
  the existing realtime layer for browser delivery, and the inference node for
  model computation. A model response is never itself a committed mutation.

## Live device inventory

Snapshot gathered over Tailscale/SSH on 2026-09-17. Re-run the commands rather
than treating hardware facts as timeless.

| Role | SSH/Tailscale name | Observed capability | Current use |
|---|---|---|---|
| Development and loop host | `avion` | Omarchy/Arch, i7-10700 (8C/16T), 62 GiB RAM, RTX 5070 Ti 16 GiB; OMP, Codex, and Ollama installed | Repository, supervised `:3050` app, OMP advisor/coding loop |
| Operator/fallback host | `prometheus` | macOS 27.2, Apple M5 Pro, 18 logical CPUs, 48 GiB RAM | Operator terminal and review; OMP/Ollama not currently installed |
| Inference host | `gex45` | Ubuntu 24.04, i5-13500 (20 logical CPUs), 62 GiB RAM, RTX PRO 4000 Blackwell 24 GiB | Private vLLM/OpenAI-compatible model endpoint |

The names “GE X15” and “GE X45” appeared in earlier requirements. The live
tailnet and SSH source of truth expose `gex45`; automation must use that alias
until the operator deliberately renames it.

### Inventory refresh

```bash
tailscale status --json
ssh -o BatchMode=yes gex45 'hostname; lscpu; free -h; nvidia-smi'
ssh -o BatchMode=yes prometheus 'hostname; sw_vers; uname -m; sysctl -n hw.memsize'
```

## Secret handoff invariant

The inference node stores only its runtime projection at:

```text
/opt/cycleforge-loop/secrets/cycleforge-inference.env
```

It is owned by root with mode `0600`. Its
`CYCLEFORGE_ENV_SOURCE_SHA256` matched the local CycleForge `.env` SHA-256 on
2026-09-17. This proves which source environment produced the projection
without copying application/database credentials that the inference service
does not need. Any refresh must be atomic, preserve mode `0600`, update the
source hash, and never print values to logs.

## Phase ledger

### CF-WMS-DOCS-1 — ECWID documents V1 (`verified`)

Acceptance:

1. A tapped mobile order can open the ECWID packing slip directly.
2. An ECWID-imported shipping label is viewable in the same in-app document
   sheet.
3. When no label was imported, the mobile order displays an enabled **Upload
   shipping label** CTA and the uploaded document previews successfully.
4. Desktop opens the API-fetched packing slip in-product without routing away.
5. ECWID invoice-PDF fetching and post-ingest attachment are covered by
   provider tests.

Verifier:

```bash
pnpm verify:ecwid-documents-v1
```

Evidence from the verified run: 14 provider/post-ingest tests and three
Playwright journeys passed; `pnpm verify:fast` passed all 13 repository gates.

### CF-WMS-COMPUTE-1 — Private inference runtime (`verified`)

The stale unit referenced a missing LoRA and a Hermes-specific tool parser,
while a known-good Qwen3 4B base was running in a login session. The V1 cutover
made the actual working contract explicit:

1. `gex45` now runs the base model as enabled `vllm.service`, supervised across
   reboots and restarts.
2. The endpoint binds only to `127.0.0.1:8000` and exposes the standard
   OpenAI-compatible health, models, and chat-completions interfaces.
3. The unpromoted/missing LoRA is not advertised. Promotion is a later model
   lifecycle decision, not a prerequisite disguised as runtime health.
4. The service no longer depends on the Hermes tool parser. Structured JSON is
   constrained by the request schema and validated again by application code.
5. The verifier checks service supervision, boot enablement, model identity,
   environment provenance, and a deterministic `Slot Full` reroute fixture.

Verifier:

```bash
pnpm verify:cycleforge-inference
```

Evidence from the verified run: `vllm.service` was active and enabled, model
`cf-v2-base` was served, the environment provenance hash matched, and the typed
fixture returned order `42`, `A01 → B02` in 4.181 seconds including fresh SSH
connection overhead.

### CF-WMS-GRAPH-1 — Voice/vision to graph mutation (`verified`)

Input adapters normalize Whisper and vision output into versioned envelopes.
LangGraph validates each envelope, evaluates warehouse constraints, and emits a
typed mutation proposal. Neon transaction code—not the LLM—commits the result.
The verifier must cover a mocked `Slot Full` exception and a valid reroute
mutation without schema errors.

Garisek-OS contains the strict LangGraph.js spatial-exception graph. CycleForge
now owns the trusted commit adapter: it strictly parses the intent, compares its
tenant with authenticated context, serializes command replay and destination
capacity, rechecks live source/destination capacity, writes the placement and
append-only event atomically, and returns the event as the mutation receipt.
The model never receives a database handle or connection string.

Verifier:

```bash
pnpm verify:wms-graph
```

Evidence from the verified run: five adapter contract tests passed; a real Neon
transaction committed a reroute, replayed the same command with a stable
mutation id, and rolled the complete fixture back; all three Garisek-OS `Slot
Full` graph evaluations passed.

### CF-WMS-STREAM-1 — Realtime operator loop (`verified`)

Connect the committed mutation/event stream to the persistent mobile execution
shell. Prove scan/voice input to rendered task-state acknowledgement within the
declared SLA, reconnection without duplicate mutation, and no REST/server-action
write path for physical execution gestures.

Checkpoint: a supervised, boot-enabled `uWebSockets.js` gateway now listens on
loopback and is exposed only through `/__wms/attach` on the `:3050`
switchboard. Strict Whisper and Qwen-VL signals enter the same LangGraph input;
the browser obtains a 30-second CycleForge-signed ticket, keeps one reconnecting
socket in the persistent mobile shell, and paints the committed `Slotted`
acknowledgement without routing. Thirty local signal/result samples passed below
150 ms (p50 5.709 ms, p95 11.023 ms, max 35.847 ms), reconnect replay returned
the same mutation, and Playwright measured the React DOM acknowledgement below
150 ms.

The first physical execution workflow is also on the command port: mobile Pick
confirmation and short-pick no longer POST to their REST mutation routes. They
send authenticated `pick.confirm` / `pick.short` envelopes through the
persistent socket; the gateway verifies ticket identity, forwards the command
to CycleForge's tenant-scoped domain adapter, and returns a correlated receipt.
The final pick closes the session and stages its tote in the same command.
Deterministic command ids plus durable inventory-event replay checks make a
disconnect retry safe. The browser now rotates its 30-second ticket before
expiry instead of retaining expired credentials on a healthy-looking socket.

Mobile Putaway's quantity confirmation is now on the same command port. The
`putaway.adjust` handler derives tenant and staff authority from the signed
ticket, uses the canonical stock ledger writer, preserves categorized reasons
and audit facts, replays duplicate command ids, refuses an overdraw, and emits
the explicit `Slot Full` failure before writing when configured capacity would
be exceeded. Its Playwright journey proves the phone sends the socket envelope
and performs zero legacy location PATCH requests.

Mobile Pack verification now uses the same authenticated command port. The
guided slip/box capture flow performs its read-only tracking cross-check, then
sends `pack.verify`; the adapter retains the append-only verification state
machine, permission gate, audit record, and stable idempotency key. The socket
provider moved to the authenticated mobile root so it persists across normal
shell and immersive camera route groups.

A TypeScript AST law now owns the concrete Pick, Pack, and Putaway execution
cohort. It reports zero `router.push()` / `next/link` violations and verifies
all 24 semantic execution actions are motion-composed with `whileTap` depth.
The design-system critique sweep reports no sidebar, pagination, or `#eef2f7`
violations in that cohort. Existing tenant-scoped Locations management is the
operator-owned capacity surface; the phase contract proves both editors expose
capacity, validation preserves null/whole-number semantics, and the audited
`sku_stock.manage` route persists the value consumed by Slot Full decisions.

Current slice verifier:

```bash
pnpm verify:wms-stream
```

Evidence from the verified run: 21 CycleForge contracts passed; eight graph and
gateway evaluations passed; 30 local round trips measured p50 6.601 ms, p95
10.861 ms, and max 39.247 ms; and three Playwright journeys passed against
`:3050` (persistent DOM acknowledgement, Putaway socket mutation, Pack socket
verification). Real warehouse capacity numbers remain operator data and are
intentionally not invented by automation.

## OMP entry point

From any checkout:

```bash
omp --cwd "$REPO_ROOT" --advisor \
  @docs/todo/cycleforge-wms-loop-v1-plan.md \
  @docs/todo/cycleforge-wms-loop-v1.phase.json
```

The advisor may review decisions, but the phase verifier remains authoritative.
An alternate harness consumes the same two files and executes the same command;
no prompt rewrite is required.

## Definition of done for the full loop

- Every phase in the companion manifest is `verified`.
- Every verifier command exits zero from a clean invocation.
- Device inventory is refreshed and the inference service is healthy.
- Secret provenance matches without secret values entering Git or logs.
- ECWID packing slips and imported labels render on mobile and desktop; missing
  labels expose the upload path.
- The graph `Slot Full` fixture commits a valid reroute mutation.
- The realtime input-to-DOM SLA and reconnect/idempotency tests pass.
