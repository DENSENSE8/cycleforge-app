# Realtime & AI — Ably · local LLM (Ollama / Hermes)

Two infrastructure integrations that have **no ingestion capability** (they don't pull
orders) — they're plumbing. Both are `connect: 'vault'`, `capabilities: []` in the
connector registry.

---

## Ably (realtime channels)

Powers every live UI surface: order/repair/dashboard change feeds, the per-staff inbox,
phone↔desktop bridges, scan logs, and AI session streaming. **Live.**

> **Not a customer-facing card.** Ably is global realtime infrastructure keyed by a single
> env var (`ABLY_API_KEY`), not a per-tenant connection, so its Settings → Integrations
> card was removed (2026-06-14). The `ably` provider key + `AblyCredentials` + connector
> entry remain (the token route + `Record<IntegrationProvider, …>` depend on them); only
> the display card is gone.

### Token auth — org-scoped
- `GET|POST /api/realtime/token` (`dashboard.view`) mints a 1-hour Ably token whose
  capability is scoped to the org prefix. Clients never see the API key.
- Channels are namespaced `org:{orgId}:…`. Publishers must go through
  `orgChannelPrefix()` (throws on a non-UUID org); subscribers use `safeChannelName()`
  (returns `''` for an invalid org). This is the tenancy boundary for realtime.

### Channel families (`src/lib/realtime/channels.ts`)
- **Org broadcast (read-only for clients):** `orders:changes`, `repair:changes`,
  `station:changes`, `staff:changes`, `fba:changes`, `dashboard:operations`,
  `walkin:changes`, `ai:assist`.
- **DB row feeds:** `db:{schema}:{table}:{rowId}` (+ `db:*` wildcard, org-scoped).
- **Per-staff bridges (sub + pub, no cross-staff wildcard):** `inbox:{staffId}`
  (priority alerts + staff messages), `phone:{staffId}` (photo bridge —
  `receiving_photo_taken` absolute in-flight count for desk peek placeholders;
  `receiving_photo_uploaded` when a shot commits),
  `packer:{staffId}`, `staffstation:{staffId}`, `scanlog:{staffId}` (read-only).
- **AI sessions:** `ai:assist:{sessionId}`.

### Desk → phone handshake (`src/lib/realtime/device-handshake.ts`)

**There is exactly ONE ack event: `station_device_ack`**, carrying the
`request_id` it answers plus a `kind`. It is the reply to every desk-initiated
send-to-device request — `receiving_photo_request` and `receiving_share_to_phone`
on `staffstation:{staffId}`, `scan_ready` on `packer:{staffId}`.

Why it exists: an Ably `publish()` resolves with **zero subscribers**, so a desk
that published a capture request and said "Sent to phone" had confirmed only
that it spoke. The desk now subscribes to the ack *before* publishing (a phone on
the same LAN can answer in milliseconds), races it against
`SEND_TO_DEVICE_TIMEOUT_MS` (6s), and reports **Waiting on phone… → Open on your
phone | Phone unreachable**.

- `receiving_share_ack` is the original, path-specific ack. It is still
  **accepted inbound** so a phone on older code satisfies a fresh desk; nothing
  publishes it any more. **Do not add a third ack event** — a new bench extends
  `DeviceAckKind` and publishes `station_device_ack`.
- Ephemeral by design: no claim row, no `realtime_outbox`. The channel name
  remains the pairing gate, and with several phones on one staff id the fastest
  to answer wins — the desk is only asking whether *a* phone is there.
- `peer_active` means a phone **answered**, not that a photo arrived. Upload
  state is a separate surface (`components/station/capture-upload`).

> Key format is validated in `src/lib/realtime/ably-key.ts` (`<appId>.<keyId>:<secret>`).
> Several subscriber fixes + tech fan-out shipped during the Ably D1 work (see the
> tier-0 progress memory).

### Env
| Var | Purpose |
|---|---|
| `ABLY_API_KEY` | Server-only Ably key. **Sensitive**. |
| `NEXT_PUBLIC_ABLY_AUTH_PATH` | Client token path (default `/api/realtime/token`). |

There is also a DB-change webhook receiver at `POST /api/webhooks/realtime-db` that
fans Postgres changes onto the `db:*` channels.

---

## Local LLM — catalog key `ollama`, runtime gateway **Hermes**

The Settings catalog entry is **"Ollama (AI) — Local LLM via Cloudflare tunnel"**
(`provider: 'ollama'`, `OllamaCredentials = { baseUrl, tunnelUrl, model }`). The
**active runtime path**, though, is the **Hermes** OpenAI-compatible gateway running on
local loopback and exposed to Vercel via a Cloudflare tunnel. There is **no cloud LLM
fallback** — if the local box is down, AI features return a clear error.

### Tunnel contract

The named Cloudflare tunnel on this workstation maps:

```text
https://hermes.michaelgarisek.com/v1 -> http://127.0.0.1:8642/v1
```

Production and preview Vercel env should use the public tunnel URL:

```text
HERMES_API_URL=https://hermes.michaelgarisek.com/v1
HERMES_MODEL=hermes-agent
```

Keep `HERMES_API_KEY` server-only. If the tunnel is later protected by Cloudflare
Access Service Auth, also set `CLOUDFLARE_ACCESS_CLIENT_ID` and
`CLOUDFLARE_ACCESS_CLIENT_SECRET`; `src/lib/ai/hermes-client.ts` forwards those
headers on every Hermes request.

### How AI calls work

Most deterministic extraction/drafting calls use `src/lib/ai/hermes-tool-call.ts`: a
single OpenAI-style request with **forced tool call** (`tool_choice: 'required'`,
`temperature: 0`); returns the parsed tool arguments (caller validates).

The live `hermes-agent` runtime on this workstation currently answers strict JSON
prompts reliably but does not always emit OpenAI `tool_calls`. New features that need to
work through the paired ChatGPT/Hermes agent can use strict JSON chat via
`src/lib/ai/hermes-client.ts`, as `POST /api/sourcing/research` does.

Consumers:

- `POST /api/assistant/chat` — the ONE assistant (UI: `/ai-chat`, sidebar "Chat").
  OpenAI-wire tool loop over the org chat chain resolved `localAgent` +
  `platformFirst`: the `AI_CHAT_*` platform leaf (Cloudflare AI Gateway;
  `CF_AIG_TOKEN` rides as `cf-aig-authorization`) first, tenant providers
  behind it — unless the env-selected local agent model (`local_mlx`, see
  below) is switched on: `CYCLEFORGE_LOCAL_MLX=1` puts it at the head,
  `=fallback` directly behind the platform leaf. The first REACHABLE candidate
  answers and `meta.provider` names it. In-turn failover: if that endpoint
  fails before the operator saw anything (Workers AI free-quota 429, 5xx, a
  refused model id, network), it is demoted for 60 s and the turn replays on the
  next reachable candidate; a second `meta` names it and the log line is
  `ask-failover from=… to=…`.
  Rate-limited via `ASSISTANT_CHAT_RATE_LIMIT` (default 25/min).
  Location questions ("where is SKU/FNSKU/UPC …", "what's in bin …") run
  `locate_product` / `list_location_contents` (`src/lib/assistant/tools/wms-tools.ts`);
  those, `get_packing_kpi` and `list_support_followups` return a server-carried
  table (`brandReportEnvelope`) that the loop emits as `ui_tool render_artifact`
  with `producedBy`, so the right panel opens on the rows Postgres returned
  without the model calling `render_artifact`. Panel honesty: an answer that
  points at the panel in a turn that painted nothing gets a one-line correction
  appended (`src/lib/assistant/panel-honesty.ts`).
  SSE: `meta → step / delta / reasoning / tool / step_end / ui_tool* → done`.
  `delta` is ANSWER text only: each round's raw text passes one filter
  (`src/lib/ai/visible-text.ts`) that routes `<think>`, Harmony `analysis` and
  `reasoning_content` to `reasoning`, and scrubs tool calls the model writes
  as text (`[name(args)]`, `<tool_call>`, `<|python_tag|>`, bare JSON) before
  they reach the chat. `step_end {toolRound:true}` moves that round's text
  into a `note` step. One reducer (`src/lib/assistant/turn-trace.ts`) folds
  the frames in the browser (the live thinking line and the "How I got
  this" trace, `ThinkingTrace`) and in the route, which persists the trace on the
  assistant row as `ai_chat_messages.analysis = {kind:'turn_trace', …}`.
- `POST /api/ai/transcribe` — chat mic dictation; `GET /api/home-board` — the
  chat surface's ledger/telemetry read.
- `POST /api/ai/search` — RAG over product manuals (`queryNemoClawRag`).
- `GET /api/ai/health` / `/api/ai/chat-health` — `/models` probe.
- `POST /api/sourcing/research` — runs the sourcing scour, then asks Hermes to
  rank candidates by fit, price, and risk for the buyer.
- Server-side feature LLMs: `lib/po-gmail/extract-llm.ts` (PO-email extraction),
  `lib/ai/zendesk-claim-{draft,classify}-llm.ts` (warranty claim drafting/classification).

Embeddings are the one cloud dependency — Gemini `text-embedding-004` via
`src/lib/ai/gemini.ts` (`GEMINI_API_KEY`).

### Env
| Var | Purpose |
|---|---|
| `HERMES_API_URL` | Gateway base (default `http://127.0.0.1:8642/v1`). |
| `HERMES_API_KEY` | Optional bearer for the gateway. |
| `HERMES_MODEL` / `AI_MODEL` | Default model. Chat defaults to `hermes-agent`; forced tool calls default to `gemma-4-e4b` unless env overrides. |
| `CLOUDFLARE_ACCESS_CLIENT_ID` / `CLOUDFLARE_ACCESS_CLIENT_SECRET` | Optional Cloudflare Access service-token headers for a protected tunnel. |
| `AI_CHAT_BASE_URL` / `AI_CHAT_MODEL` / `AI_CHAT_API_KEY` | Platform chat leaf — the assistant's first rung (`platformFirst`). Prod lane: Cloudflare AI Gateway `/compat`; empty key = the gateway's stored BYOK key. |
| `CF_AIG_TOKEN` | Cloudflare AI Gateway auth, sent as `cf-aig-authorization: Bearer …` on the chat leaf (`provider.ts`). |
| `AI_CHAT_RATE_LIMIT` / `AI_SEARCH_RATE_LIMIT` | Per-minute caps (25 / 40). |
| `OLLAMA_BASE_URL` / `OLLAMA_TUNNEL_URL` / `OLLAMA_MODEL` | Vault `OllamaCredentials` shape (catalog representation of the local-LLM connection). |
| `CYCLEFORGE_LOCAL_MLX` / `LOCAL_MLX_BASE_URL` / `LOCAL_MLX_MODEL` | Local agent slot for the assistant chat chain only (`resolveLocalAgentConfig`, `provider.ts`): `1`/`first` = head of the chain, `fallback` = right behind the `AI_CHAT_*` leaf (catches gateway quota/outages), anything else = off. Model defaults to `default_model` (keeps the MLX LoRA). |
| `GEMINI_API_KEY` | Embeddings fallback. |

> Reconcile-if-touched: the catalog calls this `ollama` while the live code calls Hermes.
> If you rename, update the provider enum, the registry entry, `OllamaCredentials`, and
> the catalog card together.

## Local agent model (Prometheus MLX) — free testing of `/api/assistant/chat`

The tool-calling fine-tune on Prometheus (`gpt-oss-20b-MXFP4-Q8` + LoRA
`~/CycleForgeAI/adapters/cycleforge-gpt-oss-v1-promoted`, unfused) serves the
assistant loop in dev at zero cost. It answers in Harmony channels through
`mlx_lm.server`; the loop salvages its `to=functions.*` calls
(`src/lib/ai/harmony.ts`) and routes `analysis` to the thinking history.

```text
:3050 route ──► 127.0.0.1:18088 (cf-mlx-tunnel, ssh -L) ──► prometheus 127.0.0.1:8080 (mlx_lm.server)
```

Start (both sides loopback-only):

```bash
# 1. Model server on Prometheus (refuses to start if :8080 is taken; pid in ~/CycleForgeAI/logs/mlx-promoted-server.pid)
ssh prometheus 'cd ~/CycleForgeAI && nohup scripts/serve_promoted.sh >/dev/null 2>&1 </dev/null &'
# 2. Supervised tunnel on the workstation (systemd restarts it every 5s if it drops)
systemd-run --user --unit=cf-mlx-tunnel -p Restart=always -p RestartSec=5 \
  /usr/bin/ssh -N -o ExitOnForwardFailure=yes -o ServerAliveInterval=30 -o ServerAliveCountMax=3 -o BatchMode=yes \
  -L 127.0.0.1:18088:127.0.0.1:8080 prometheus
# 3. Worktree .env (1 = local answers first; fallback = gateway first, local catches its failures)
CYCLEFORGE_LOCAL_MLX=1
LOCAL_MLX_BASE_URL=http://127.0.0.1:18088/v1
LOCAL_MLX_MODEL=default_model
```

Check: `curl -s 127.0.0.1:18088/v1/models`; the first SSE `meta` with a real
provider reads `local_mlx`, and `journalctl --user -u cycleforge-lane@prod | grep ask-timing`
shows `provider=local_mlx model=default_model`.

Stop: `systemctl --user stop cf-mlx-tunnel` and
`ssh prometheus 'kill $(cat ~/CycleForgeAI/logs/mlx-promoted-server.pid)'`; set
`CYCLEFORGE_LOCAL_MLX=0` to send the assistant back to `AI_CHAT_*` alone. With
the switch on but the tunnel down, the reachability probe skips the slot and the
gateway answers (the `meta` frame says so).

Never fuse the adapter, never bind the server beyond loopback, and keep the
model id `default_model` (any other id loads base weights without the LoRA).

