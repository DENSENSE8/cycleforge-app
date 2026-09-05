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

**`tool_choice` is a hint here, not a constraint** (measured 2026-09-02 against the
mlx-dspark box). `"required"`, `"auto"`, and the named
`{type:'function',function:{name}}` form all produced byte-identical completions, so
nothing server-side forces the call — the model complies or it does not. Two mitigations
live in `hermes-tool-call.ts`, and both are load-bearing rather than defensive:

- **Thinking is turned off** for self-hosted runtimes via
  `chat_template_kwargs: { enable_thinking: false }` (gated on
  `isSelfHostedAiRuntime()` — managed endpoints 400 on unknown body params). A
  reasoning model charges its think phase against `max_tokens`, and inside a forced
  tool call that is fatal, not slow: on the real claim-draft payload the think phase
  burned all 1206 tokens and returned `finish_reason: "length"` with **no tool call**,
  which the caller read as "the model refused". Thinking off, the same call answers in
  172 tokens with the facts intact.
- **A tool call is recovered from `content`** when the runtime's own parser misses one
  (Qwen-style `<tool_call>` block or a bare JSON object).

Callers whose fact guard rejects a draft for losing an identifier must pass those
identifiers as `mustKeep` (`zendesk-ticket-draft.ts`). "Keep every identifier" in a
system prompt is a rule about a category; `mustKeep` is the list. Without it the guard
checks an invariant the model was never told — which is how a clean draft got discarded
for dropping a tracking number that only ever appeared in the subject line.

### Testing the local brain end to end

`ASSISTANT_HERMES_FALLBACK=1` forces `POST /api/assistant/chat` (composer **Ask** mode)
onto the OpenAI-wire chain instead of the Anthropic agent loop. Until 2026-09-02 the
flag widened config resolution but `useHermes` still required *no* Anthropic brain, so
on any box with `ANTHROPIC_API_KEY` set — every dev box — it resolved the local config
and then ignored it, and routing Ask at the local gateway could not be tested at all.

Run a throwaway server beside the main `:3050` one (own `distDir`, so `.next` is not
clobbered):

```bash
NEXT_DIST_DIR=.next-hermes-test ASSISTANT_HERMES_FALLBACK=1 AUTH_PINLESS_SIGNIN=true \
  npx next dev --turbopack -p 3077
```

Mint a cookie and drive both AI surfaces of the station mouth:

```bash
SID=$(LH_BASE_URL=http://127.0.0.1:3077 node scripts/lighthouse-mint-session.mjs)

# Ask mode — expect `provider":"hermes"` in the meta event, then delta text.
curl -sN http://127.0.0.1:3077/api/assistant/chat -H 'content-type: application/json' \
  -H "Cookie: $SID" -H 'x-tenant-slug: usav' \
  -d '{"sessionId":"probe-001","message":"Say OK.","context":{"page":"receiving","mode":"ask"}}'

# Ticket mode AI draft — expect `"degraded": false` and a real model name.
curl -s http://127.0.0.1:3077/api/receiving/zendesk-claim/draft -H 'content-type: application/json' \
  -H "Cookie: $SID" -H 'x-tenant-slug: usav' \
  -d '{"receivingId":52155,"claimType":"damage","reason":"Cracked cabinet"}'
```

`degraded: true` now carries a `degradedReason` and a `console.warn` — a dead gateway
and a model that dropped a fact are different operator problems and used to be one
silent boolean.

Consumers:

- `POST /api/ai/chat` + `/api/ai/chat/stream` — the assistant (rate-limited via
  `AI_CHAT_RATE_LIMIT`, default 25/min).
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
| `AI_CHAT_RATE_LIMIT` / `AI_SEARCH_RATE_LIMIT` | Per-minute caps (25 / 40). |
| `OLLAMA_BASE_URL` / `OLLAMA_TUNNEL_URL` / `OLLAMA_MODEL` | Vault `OllamaCredentials` shape (catalog representation of the local-LLM connection). |
| `GEMINI_API_KEY` | Embeddings fallback. |

> Reconcile-if-touched: the catalog calls this `ollama` while the live code calls Hermes.
> If you rename, update the provider enum, the registry entry, `OllamaCredentials`, and
> the catalog card together.
