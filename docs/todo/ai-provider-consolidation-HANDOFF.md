# Handoff — one AI source of truth: local-first, cloud fallback, per-org

**Status:** **Phases 0–5 LANDED** (Phase 5 partial — see its scope note)
**Lane:** current checkout
**Prepared:** 2026-08-19 · **facts re-verified against the tree 2026-08-19**

**Paste:**

```text
Read docs/todo/ai-provider-consolidation-HANDOFF.md. Collapse the two AI
provider paths onto ONE org-aware source of truth (src/lib/ai/org-provider.ts),
add local-first ordering + cloud failover, and finish per-org provider settings
(API key + OAuth). Multi-tenant from birth — never read a model endpoint from
env on a tenant path. Phase 0 first: org-provider cannot carry Cloudflare
Access headers today, so deleting hermes-client before that lands breaks the
tunnelled local endpoint. npm run verify before done.
```

---

## Goal

Every AI call in the app resolves `{baseURL, apiKey, model, headers}` from
**one** function, keyed by `organizationId`, with this order:

1. The org's **local/self-hosted** model, when configured and healthy
2. The org's **own cloud provider** (BYOK — API key or OAuth)
3. The **platform** cloud default (metered)
4. `null` → caller degrades gracefully (never a hot-path throw)

Local-first is the inversion this handoff asks for. Today the chain prefers
cloud (see Locks).

**This is a slim-down, and the numbers are the point.** One resolver, one health
route, one credential store — see *Deletion accounting* below.

---

## Verified current state — read before touching anything

Every count in this section was re-measured against the working tree on
2026-08-19. The earlier draft of this handoff **undercounted Path A by 5×**;
do not trust a remembered number, re-run the greps.

### There are TWO competing AI paths. That is the whole problem.

| | Path A — legacy | Path B — modern |
|---|---|---|
| Entry | `getHermesApiUrl/Headers/Model()` | `resolveOrgAiConfig(orgId, cap)` |
| Resolver | `src/lib/ai/hermes-client.ts` (**25 LOC, 3 exports**) | `src/lib/ai/org-provider.ts` (124 LOC) |
| Source | `process.env` only | `organization_integrations` vault → env |
| Org-aware | **No** | **Yes** |
| Importers | **10** (see table) | 7 |

**Path A is single-tenant by construction and must be deleted, not extended.**
It is 25 lines with ten importers — the file is trivial, the *migration* is not.

#### The ten Path A importers — the real scope

| File | LOC | Has `organizationId` today? |
|---|---|---|
| `app/api/ai/chat/stream/route.ts` | 277 | ✅ `ctx.organizationId` |
| `app/api/assistant/chat/route.ts` | 266 | ✅ `ctx.organizationId` |
| `app/api/ai/search/route.ts` | 125 | ✅ `ctx.organizationId` |
| `app/api/ai/chat-health/route.ts` | 48 | ✅ (via `withAuth`) |
| `app/api/ai/health/route.ts` | 41 | ✅ (via `withAuth`) — **delete instead, see below** |
| `lib/receiving-claim-seller-assist.ts` | 198 | ❌ `draftSellerMessageWithHermes` |
| `lib/photos/analyze.ts` | 261 | ⚠️ has it in `isAnalyzeEnabledForOrg`, **not** where `getHermesApiUrl()` is called |
| `lib/ai/sourcing-research.ts` | 176 | ❌ `researchSourcingCandidates` |
| `lib/ai/hermes-tool-call.ts` | 164 | ❌ `hermesToolCall` |
| `lib/support/suggest-reply.ts` | 129+ | ❌ (also a `resolveAiConfig` caller) |

**The five routes are mechanical** — `ctx.organizationId` is already in scope at
the call site. **The five lib modules are the actual work**: none takes an org
id, so each needs a threaded parameter and every one of its call sites visited.

**Thread it as a REQUIRED parameter with no default.** `backend-patterns.md` →
*A safety classification is a REQUIRED parameter, never a defaulted one*: a
defaulted `orgId` is a silent opt-out that every call site you did not visit
takes automatically, and here that opt-out is **one tenant's model serving
another tenant's request**. Make the miss a compile error.

### `org-provider.ts` already does ~70% of the multi-tenant ask

`resolveOrgAiConfig(orgId, capability)` already reads the KMS-encrypted
`organization_integrations` vault (5-min cache) and falls through to the
platform env default, returning `null` rather than throwing. Provider branches
already exist for `ai_gateway`, `openai`, `anthropic` (chat only), and
`ollama` (self-hosted), and it already prefers `tunnelUrl` over `baseUrl`.
`/settings/ai` already renders all four, with
`ollama: 'Self-hosted endpoint (yours)'`.

So this is **finish and adopt**, not greenfield. Do not rebuild it.

### ⚠️ Phase-0 blocker — org-provider cannot carry Cloudflare Access headers

This is the one finding that reorders the work, and the earlier draft missed it.

`getHermesHeaders()` emits three things: `Authorization`, **`CF-Access-Client-Id`**
and **`CF-Access-Client-Secret`**. `AiProviderConfig` is exactly
`{ baseURL, apiKey, model }` — there is **no headers channel** — and
`OllamaCredentials` is `{ baseUrl, tunnelUrl?, model, embedModel?, apiKey? }`,
with no header or CF field either.

`CLOUDFLARE_ACCESS_CLIENT_ID/SECRET` appear in **exactly one file in `src/`** —
`hermes-client.ts`. Nothing else reads them.

**Therefore: deleting `hermes-client.ts` before adding a headers carrier
silently drops Cloudflare Access auth on the tunnelled local endpoint.** The
failure mode is a 403 from Cloudflare that looks like a model/auth error, in
prod, on the path that was working five minutes earlier. Phase 0 exists solely
to make the deletion safe.

### `resolveAiConfig` (env-only) still has tenant-path callers

`src/lib/support/suggest-reply.ts` and `src/lib/ai/embed.ts`. Each is a tenancy
leak: one org's config serving another's request.

Note the direction of the env coupling, precisely — it runs **both** ways and
that is why the two paths currently agree by accident:

- `hermes-client.ts` reads `HERMES_API_URL` / `HERMES_MODEL` / `AI_MODEL`, and
  does **not** read `AI_CHAT_BASE_URL`.
- `provider.ts` `resolveAiConfig('chat')` reads `AI_CHAT_BASE_URL` **and falls
  back to `HERMES_API_URL`**.

So setting only the modern `AI_CHAT_*` vars moves Path B and leaves Path A
pointed wherever `HERMES_API_URL` says. Both var sets are currently aimed at the
MacBook, which is why the two paths agree today — that is a patch, not the fix.

### Free deletion — `/api/ai/health` is a strict subset of `/api/ai/chat-health`

Same probe (`GET {hermes}/models`, 4s timeout), same `dashboard.view`
permission, same `backend: 'hermes-local'`. `chat-health` returns everything
`health` returns **plus** a `models` array and a better error string. `health`'s
own comment says it "stays for any legacy consumers".

**Delete `/api/ai/health` (41 LOC).** It has exactly **one** caller, and it is
not the app: `scripts/test-endpoints.js:326` probes it. Repoint that assertion
at `/api/ai/chat-health` (the richer shape is a superset, so the check only gets
stronger) and drop the `/api/ai/health/route.ts` entry from
`docs/security/route-permissions.json:601` in the same change, or `route-auth`
drift fails `npm run verify`.

Two doors onto one destination is the fork `pattern-evolution.md` §6 names — and
`knip` cannot see it, because both doors are routes and both are "used".

### Reachability constraint that shapes the whole design

The MacBook (`prometheus`) is **tailnet-only**. Deployed Vercel cannot reach
it. This generalizes: *a tenant's local model is on a network the server
usually cannot see.* The vault already anticipates this via `tunnelUrl`. Any
"add a local model" UI must capture the reachable-from-server URL and validate
it server-side at save time, or tenants will save endpoints that only resolve
from their own laptop.

### Local model performance (measured 2026-08-19, not estimated)

`qwen/qwen3.8-27b` on `prometheus` via `http://prometheus:8080/v1`:

- **~17 tok/s** steady state (399 tok in ~23.5s, twice, tightly repeatable)
- **~14s** cold JIT load; TTL 60m then it unloads and re-pays that
- Loaded `-c 119552 --parallel 4`

**Speculative decoding / draft models are NOT available here.** Both routes were
tested and both are dead ends on this hardware:

- `--speculative-draft-mtp` loads without error but changes nothing (17.0 →
  17.0 tok/s). The flag is silently accepted; this model does not implement MTP.
- `--speculative-draft-simple --speculative-draft-model qwen3-0.6b-mlx` fails:
  *"Load-time draft-model speculative decoding is only supported by the
  llama.cpp engine protocol runtime."*
- Prediction-time `draft_model` in the request body fails:
  *"SpeculativeDecodingNotSupportedError: Speculative decoding is not supported
  for batched MLX models."* — and it **still fails at `--parallel 1`**, so this
  is an MLX-engine limitation, not a batching setting to tune.

**Implication:** do not chase a draft model for perceived speed. At 17 tok/s the
lever is **streaming** (`/api/ai/chat/stream` already streams — keep it) and
**routing short turns to a small model**. A two-tier local split
(`qwen2.5-coder-7b-instruct-mlx` or `qwen3-0.6b-mlx` for drafting/classification,
27B for real answers) buys far more than speculative decoding would have.

---

## Locks

- **SoT:** `resolveOrgAiConfig(orgId, capability)` — the only way to learn where
  an AI call goes. No route, worker, or lib may read a model endpoint from env.
- The vault (`organization_integrations`) stays the only credential store —
  `get/upsertIntegrationCredentials`. Never a new table, never plaintext.
- Multi-tenant from birth: `organizationId` comes from `withAuth` ctx, **never**
  from the request body. Follow the `org-scope` skill.
- **A threaded `orgId` is a required parameter with no default** — see the
  importer table above for why.
- **Delete, don't deprecate.** A retirement is not done until the old path is
  gone or a guard names the exact surviving call sites, shrink-only
  (`pattern-evolution.md` §6). `knip` cannot see a fork whose doors are both
  imported.
- `/ai-chat` stays top-pinned and keeps `useAiChat` → `/api/ai/chat/stream`
  (see `ai-chat-odysseus-display-HANDOFF.md`). Change the *resolver* behind the
  route, not the route's contract or the UI.
- Compose from the named SoT: `node scripts/sot-lookup.mjs "<job>"` before
  building any new surface.
- `main` only. Never start/restart/kill the dev server on `:3050` — it is the
  user's.
- `npm run verify` before done; never raise a ratchet baseline to pass.

---

## Phases

**0. Make the deletion safe. — ✅ DONE 2026-08-19**
`AiProviderConfig` now carries `headers?: Record<string, string>`;
`OllamaCredentials` carries `cfAccessClientId` / `cfAccessClientSecret`;
`resolveOrgAiConfig`'s `ollama` branch and the platform leaf
(`resolveCloudflareAccessHeaders`) both emit them. **Every consumer forwards
them** — `embed.ts`, `hermes-tool-call.ts`, and `forge/chat`'s
`createOpenAICompatible`. 14 tests across `org-provider.test.ts` (new),
`provider.test.ts`, `embed.test.ts`.

Two decisions worth keeping:

- **`resolveOrgAiConfig` gained an injectable `OrgAiDeps`** (defaulted, house
  `Deps` pattern) and the vault import became `import type` + a lazy
  `await import()`. `@/lib/integrations/credentials` pulls `@/lib/db`, which
  carries `server-only` and throws under `node:test` — a top-level value import
  made the whole chain untestable, which is why it had no coverage.
- **`headers` is omitted, never `{}`**, so callers spread unconditionally.

**The channel is open but still carries nothing on the `/ai-chat` path** —
that path is Phase 1's job. Phase 0 only guarantees that when Phase 1 deletes
`hermes-client.ts`, CF Access survives the move.

**1. Collapse to one resolver. — ✅ DONE 2026-08-19**
`src/lib/ai/hermes-client.ts` is **deleted**, along with `/api/ai/health` (its
`test-endpoints.js` probe repointed, its `route-permissions.json` entry
regenerated away) and the `HERMES_API_URL` / `HERMES_MODEL` / `AI_MODEL` /
`HERMES_API_KEY` fallback inside `provider.ts`. **No file in `src/` reads an AI
endpoint from env any more except `provider.ts`**, the platform-default leaf —
enforced by a `no-restricted-syntax` rule in `eslint.config.mjs` (AST, per the
house guard-authoring ladder), proven to fire on a probe and to exempt the leaf.

Migrated: the five routes (`chat/stream`, `assistant/chat`, `ai/search`,
`chat-health`, and `ai/health` by deletion) plus **eight** lib modules —
`hermes-tool-call` (its `provider` is now REQUIRED, so a caller that forgets it
is a compile error rather than a cross-tenant read), `sourcing-research`,
`receiving-claim-seller-assist`, `support/suggest-reply`, `photos/analyze`,
`receiving-disposition-classify-llm`, `zendesk-ticket-draft`, and
`po-gmail/extract-llm`.

**The handoff undercounted this phase twice, and both misses were the same
shape** — a file that reached the gateway *without* importing `hermes-client`:

- `po-gmail/extract-llm.ts` read `HERMES_API_URL` / `HERMES_API_KEY` /
  `AI_MODEL` from `process.env` directly. One endpoint, every tenant.
- `support/vision-lane-deps.ts` read `AI_CHAT_BASE_URL` directly, and its
  docblock said it did so *specifically to avoid* `isAiConfigured('chat')`
  answering true for the legacy Hermes fallback. Deleting that fallback made
  the two identical, so it now asks through the helper — and it deliberately
  does **not** use `resolveOrgAiConfig`, because an org's own provider may be a
  self-hosted box and reporting `cloud-multimodal` for the tenant's own
  hardware would tell an operator their customer's photo left the building.

Grep for `process.env.<VAR>`, not just for the module import, when hunting the
next one.

One contract widened: `SuggestDeps.resolveModel` is now
`(usedImages) => string | Promise<string>`, because the reported model name is
a vault read. It still must never throw.

**2. Local-first ordering + failover. — ✅ DONE 2026-08-19**
The chain is inverted and survivable.

- **Order is a stored per-org preference**, `local-first` by default —
  `provider-order.ts` (pure) + `provider-order-deps.ts` (reads
  `organizations.settings.ai.providerOrder`), mirroring
  `vision-lane.ts` / `vision-lane-deps.ts` exactly rather than inventing a
  second shape. Precedence: org setting → `AI_PROVIDER_ORDER` → `local-first`.
  `cloud-first` reproduces the OLD hardcoded chain exactly — one entry moves,
  nothing else reorders (pinned by a test).
- **`resolveOrgAiChain()`** replaces the first-match cascade. `resolveOrgAiConfig`
  survives as `chain[0] ?? null`, so every existing caller kept working.
  The platform default is always last; a **demoted provider sinks to the back
  rather than being dropped**, because a chain that silently shortened itself
  would turn a transient timeout into "AI is not configured for this workspace".
- **`failover.ts` → `postToAiProvider()`** walks the chain. Retries on
  5xx / 401 / 403 / 429 / timeout / network; **returns 400-class responses
  without retrying**, because replaying a bad body against three more providers
  spends three times as much for the same answer while looking like an outage.
- **`provider-health.ts`** demotes a failed provider for 60s, scoped per
  (org, provider, capability). Best-effort by design, same posture as
  `redisAdvanceLock`: correctness comes from the loop actually trying the next
  provider, never from the cache being right.

Two numbers are load-bearing and pinned by tests, not taste:

- **The local timeout budget (45s) must exceed the ~14s cold MLX load.** A
  uniform short timeout would demote a healthy self-hosted model on the first
  request after each 60m idle unload — quietly turning local-first back into
  cloud-first for anyone whose box idles, which is everyone.
- **The 60s demotion window** sits above one cold load and far below the 60m
  unload, so a warming box is not retried into the same timeout and a recovered
  one is not sidelined for an hour.

**Trap found while wiring `/api/ai/chat/stream`:** `AbortSignal.timeout` bounds
the WHOLE fetch, response body included — so handing the streaming route the
helper's 45s default would have guillotined long answers mid-sentence (at the
measured ~17 tok/s a 2048-token reply runs past two minutes). Streaming callers
pass their own budget; the original 180s is preserved. A genuinely dead endpoint
still fails over fast, because that surfaces as a network error, not a timeout.

**Failover deliberately stops once a provider returns headers.** A stream that
dies after 200 tokens cannot be transparently retried — the user has already
seen those tokens, and a second provider would restart from nothing. Surfacing
the break is honest; splicing two models' output is not.

**Served-vs-preferred is now distinguished in the UI.** `hermesToolCall` returns
the `source` that actually answered and `search-tools` bills usage against it
(billing the preferred provider for a turn the fallback served would misreport
spend). `/settings/ai` shows the order preference and the whole chain —
"Falls back to …" — with a docblock stating the card names what a call TRIES
FIRST, and that per-turn truth is the usage table's `source` column.

**3. Settings: add a local model / connect a provider, per org. — ✅ DONE 2026-08-19**

**Most of this phase already existed and the handoff did not know it.** All four
AI providers were already registered in BOTH registries (`connectors/registry.ts`
as `authKind: 'vault'`, and the settings display catalog), and
`credential-form-defs.ts` already had typed connect forms for all four wired to
`VaultConnectSheet` → `POST /api/admin/integrations/upsert`. Check the registries
before writing a connect flow; the work was four real gaps, not a build.

**Gap 1 — Phase 0's vault fields were unreachable from the UI.**
`OllamaCredentialSchema` had no `cfAccessClientId` / `cfAccessClientSecret`, so
zod stripped them, and `OLLAMA_FORM` had no field for them *or* for `tunnelUrl`.
The Phase 0 headers channel was therefore writable only by hand. Both are fixed;
the tunnel/CF fields sit in a "Remote access (optional)" section whose help text
says plainly that a LAN address is invisible to a deployed server. *This is the
same class of miss as Phase 0's own — a capability added at one layer and not
carried to the next. Check the whole path.*

**Gap 2 — nothing verified the endpoint before persisting**, which the
`integration-connector` skill requires and this handoff asked for.
`provider-probe.ts` now probes `/v1/models` at save time and the upsert route
blocks on failure. Its policy is deliberately narrow:

- It validates **reachability and auth**, not feature support. A **404 on
  `/models` is SUCCESS** — plenty of OpenAI-compatible servers do not implement
  that route, and refusing to save a working endpoint over an optional listing
  API would be a worse bug than the one being fixed.
- A **401/403 is a failure**, and the message names the API key *and* the CF
  Access pair — that 403 is exactly the Phase 0 misconfiguration.
- It probes **`tunnelUrl` when set, else `baseUrl`** — i.e. what runtime will
  actually call. Probing the other one would bless a URL no request ever makes.
- A named-but-unlisted model is a **warning, not a block** (surfaced as a
  warning toast): the listing can be empty and a model can be pulled later.
- **Only the self-hosted slot is probed.** The cloud providers are fixed,
  known-good hosts whose only failure mode is a bad key, which their first real
  call surfaces anyway.

**Gap 3 — the Phase 2 order preference had no way to be set.**
`AiProviderOrderCard` is a deliberate SIBLING of `SupportVisionLaneCard` — same
route, same three-state shape, same two disciplines: it stores the **request**
never the resolved order, and **"inherit" is a real third state** (clearing
deletes the org key so the env / local-first default returns; defaulting the
control to local-first would stamp an explicit value on first Save and hide the
deployment override forever). Its copy also states that order is a preference,
not a promise.

**Gap 4 — `OrgSettings` had no `ai` key.** The schema is `.passthrough()`, so
`settings.ai.providerOrder` persisted and read back correctly but was untyped
and undocumented. Now declared alongside `support`.

**NOT done in this phase: OAuth provider connect via Nango.** The four AI
providers are all `authKind: 'vault'` (paste-a-key or config), so none of them
has an OAuth flow to reuse, and adding one is a provider-registration project
rather than a settings change. Deferred deliberately — say so rather than
letting the phase read as complete.

**4. Port OpenClaw → Hermes agent backend. — ✅ DONE 2026-08-19 (scope corrected)**

**The phase title described the wrong fix.** The surviving parallel system was
not an OpenClaw backend to port onto Hermes — it was
`src/lib/assistant/agent-loop.ts` reading `process.env.ANTHROPIC_API_KEY`
directly and hardcoding one model. Every tenant's assistant ran on a single
platform key: the identical single-tenant leak `hermes-client` had, in the one
surface the Phase 1 sweep never touched **because it named a different env var,
not because it was a different mistake.**

- `resolveOrgAnthropicBrain(orgId)` resolves the org's OWN vault `anthropic` key
  first, the platform key last, `null` when neither exists. **The model follows
  the key** — an org that brought its own key may name its own model, and
  billing someone's key for a model they did not choose is the kind of surprise
  that lands on an invoice.
- `makeDefaultDeps()` became `makeDefaultDeps(orgId)`; the org id was already on
  `args.ctx`, so no caller signature changed.
- `/api/assistant/chat` decided Anthropic-vs-fallback from the platform env var,
  which answered the same for every tenant. Both halves are now per-org.
- **The ESLint guard now bans `ANTHROPIC_API_KEY` too.** Phase 1's rule listed
  only the `HERMES_*` / `AI_CHAT_*` family, which is exactly why this path
  survived. Proven to fire on a probe.

**What was NOT done, deliberately: the agent brain is not "just another provider
in the chain", and it cannot be without a rewrite.** The loop uses Anthropic's
**native tool-use API**; an Ollama, OpenAI or Vercel-Gateway endpoint does not
implement that protocol — they speak the OpenAI wire format. Handing the loop a
chain entry it cannot talk to would fail at the first tool call. So
`resolveOrgAnthropicBrain` deliberately resolves ONLY Anthropic-capable
providers, and the OpenAI-wire fallback stays a separate branch. Making the
agent genuinely provider-agnostic means porting the loop onto OpenAI-wire tool
calling — a real project, not a resolver change. **Do not read this phase as
having made the agent portable.**

The handoff's own escape hatch turned out to be the right one and needed no new
code: an org that wants a different agent brain connects an `anthropic` key in
Settings → AI, and this resolver picks it up.

### Harness trap (cost real time here)

`agent-loop.test.ts` fails under a bare `npx tsx --test` with a `server-only`
error, and passes under `npm run verify`. The runner passes
`--require ./scripts/register-server-only-shim.cjs`, which neutralises
`server-only`; a raw invocation does not. **Run
`node scripts/run-unit-tests.mjs` (or add that `--require`) for anything whose
graph reaches `@/lib/db`** — a bare `tsx --test` failure there is the harness,
not the code. I mis-attributed this to my own change until a HEAD worktree
showed the identical failure.

**5. Widen AI surface area — order-list import. — ✅ PARTIAL 2026-08-19**

**There was already a complete import engine, and the phase brief nearly hid
that.** `csv-order-import.ts` (canonical vocabulary + deterministic header
aliases + the Ready/Action-required rule), the `@/lib/tables/import/` staging
seam, `order-import-descriptor.ts`, and the `CsvImportStagingRail` mapping panel
all pre-date this work. The phase said "a thin adapter, not a new import
engine"; the adapter is ~160 LOC and the engine was untouched.

`ai-column-mapping.ts` proposes mappings ONLY for canonical fields the
deterministic alias map left unclaimed, and enforces three rules the model
cannot be trusted with:

1. **Deterministic wins.** A field the aliases already resolved is never
   re-proposed. A model second-guessing a known-correct mapping is pure
   downside — it can only turn a right answer into a wrong one.
2. **Only headers that exist.** A suggestion naming a column absent from the
   file is dropped *and counted* (`rejectedHallucinations`), not swallowed.
   Inventing a plausible column is the likeliest failure here and the one that
   would silently import blanks over real data; a systematically hallucinating
   model must look like a problem, not like a quiet no-op.
3. **Never auto-applied.** The route returns `suggestions`; the operator applies
   each one. A wrong guess and a right one are indistinguishable once written
   into the mapping, which is the entire reason the confirm step exists.

It also spends **no model call** when every field is already mapped or no free
columns remain, and reports `stillUnmapped` explicitly — what was not solved is
stated, never implied by omission.

Route: `POST /api/orders/import/suggest-mapping`, gated on the existing
`orders.import` permission (a step inside that flow, not a new capability),
rate-limited per org, no audit row — generation, not mutation. A failed model
call degrades to an empty suggestion set with a stated reason; the manual
selects keep working, so AI being down never blocks an import.

### Scope note — what this phase did NOT deliver

- **"Answer questions about the file before commit" is NOT built.** That is a
  conversational surface over staged rows, not a mapping helper, and it is a
  separate piece of work. The phase reads as complete without this sentence.
- Built **in the existing staging rail**, not as a `station-block` /
  `workflow-node` as the brief suggested. The import surface already exists and
  is a Workbench rail; adding a station step would have forked a second entry
  to one destination — the exact `pattern-evolution.md` §6 shape. Composing the
  existing host is the house rule winning over the brief's guess.
- Imported-vs-skipped reporting needed no work: `CsvOrderImportResult` already
  carries `inserted` / `updated` / `skipped` / `errors[]` and the batch leaf
  already surfaces the counts.

---

---

## Deletion accounting (the slim-down, stated in advance)

| Removed by Phase 1 | LOC |
|---|---|
| `src/lib/ai/hermes-client.ts` | 25 |
| `src/app/api/ai/health/route.ts` (duplicate probe) | 41 |
| its `route-permissions.json` entry + `test-endpoints.js` probe | ~10 |
| `HERMES_API_URL` / `AI_MODEL` fallback branch in `provider.ts` | ~10 |
| **Resolver paths** | **2 → 1** |
| **Env var sets on a tenant path** | **2 (`HERMES_*`, `AI_CHAT_*`) → 0** |
| **AI health routes** | **2 → 1** |

Small in lines, large in surface: it is the *ten importers* and the *two
disagreeing env sets* that cost time, not the 25-line file.

---

## Non-goals

- No second chat API, no parallel resolver, no page-local provider twin.
- No draft/speculative-decoding work — measured dead end (see above).
- No exposing `prometheus` to the public internet to make prod reach it.
- No moving `/ai-chat` off its top pin.
- No ratchet raises (`jscpd` / `knip` / lighthouse baselines).

---

## Trap list (each of these cost real time already)

- **Deleting `hermes-client.ts` before Phase 0 drops Cloudflare Access headers.**
  `CLOUDFLARE_ACCESS_CLIENT_ID/SECRET` are read in that one file and nowhere
  else in `src/`; `AiProviderConfig` has no headers channel. The symptom is a
  Cloudflare 403 that reads like a model/auth failure.
- `AI_CHAT_BASE_URL` does not affect `/ai-chat` — Path A reads `HERMES_API_URL`.
  The coupling is asymmetric: `provider.ts` *does* fall back to `HERMES_API_URL`,
  so Path B follows the legacy var while Path A ignores the modern one.
- A Hermes *profile*'s `.env` (`~/.hermes/profiles/<name>/.env`,
  `OPENAI_BASE_URL`) overrides its own `config.yaml` `model.base_url`.
  Repointing a profile means editing **both** files.
- Ollama's 404 text is `model 'X' not found` — it names *your new model*, so an
  unmoved request looks like the new endpoint rejecting it. Check *which host*
  answered before debugging the model.
- Next reads `.env` at boot. After an env change the dev server must be
  restarted **by the user** for it to take effect.
- A failover cache shorter than the ~14s cold JIT load will demote a healthy
  local model on its first request after each 60m unload.
