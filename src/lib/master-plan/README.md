# Master-plan CRDT sync (`src/lib/master-plan/`)

The agentic-loop master plan is a single MDX string, merged conflict-free across
three planes: the local file (`master-plan.mdx`, edited in Cursor), the `/forge`
web dashboard, and the forge loop. Stack is locked (plan §-2):
**Yjs rides Ably** — no third-party CRDT host, no second browser Ably client.

## Modules

| Module | Role |
|---|---|
| `ticket-status.ts` | `TicketStatus` enum + MDX scan/mutate helpers (ALP-0.4) |
| `doc.ts` | `createMasterPlanYDoc()` — one `Y.Text('content')`; seed + diff-replace helpers |
| `ably-yjs-provider.ts` | Custom Ably↔Yjs provider (we own the protocol; this file documents it) |

## Channel

`getMasterPlanChannel(orgId)` → `org:{uuid}:forge:master-plan`
(SoT: `src/lib/realtime/channels.ts`). Token capabilities
(`/api/realtime/token`): staff with `operations.plans.view` get `subscribe`;
staff with `operations.plans.manage` also get `publish`. The daemon and server
tools publish with the server `ABLY_API_KEY` (never shipped to the browser).

## Message protocol (owned; version 1)

All payloads are JSON; binary Yjs data travels base64-encoded (`u8ToBase64`).
Every message carries `from`: the sender's random per-connection `clientTag`,
used to drop Ably's echo of our own publishes.

| Event | Payload | Semantics |
|---|---|---|
| `yjs.update` | `{ u: base64(update), from }` | Incremental update broadcast. Local edits are batched ~80 ms and merged (`Y.mergeUpdates`) into one message. Receivers apply with `origin = provider`, so an applied update never re-broadcasts (no echo loop). |
| `yjs.sync.request` | `{ sv: base64(stateVector), from }` | Sent on connect (and on demand after reconnect). Asks peers for everything the sender is missing. |
| `yjs.sync.response` | `{ u: base64(diff), sv: base64(responder SV), from, to }` | Targeted at `to` = requester's tag. Requester applies `u`, then compares the responder's `sv` with its own state and broadcasts anything the responder lacks as a normal `yjs.update` — two-way convergence in one round trip. |

Notes:

- **N responders**: every peer answers a sync request. Responses are
  idempotent (applying the same states twice is a Yjs no-op), so duplicate
  answers are harmless — accepted trade-off for protocol simplicity.
- **Empty-doc bootstrap (ALP-1.4)**: `createSeedUpdate(mdx)` builds the seed
  from a fresh doc with the fixed `MASTER_PLAN_SEED_CLIENT_ID`, so two peers
  racing to seed the *same canonical starter string* produce byte-identical
  updates and the race is idempotent. Race policy: only seed when the doc is
  empty after a sync window, and always seed from the same source (the starter
  MDX served by the seed endpoint / read by the daemon). Neon ops tables are
  never touched by bootstrap.
- **File plane echo suppression** (daemon, ALP-2.3) is layered ON TOP of this:
  the daemon tags its own file writes with a generation token and ignores the
  matching `fs.watch` event; the provider's `clientTag` handles the Ably side.

## Deps injection

`MasterPlanAblyProvider` takes a `MasterPlanChannelLike`
(`publish/subscribe/unsubscribe`) — the browser passes the channel from the ONE
`AblyProvider` client (`useAblyClient().getClient()`), the daemon passes a
server-key Realtime channel, unit tests pass an in-memory fake. Never
instantiate a second `Ably.Realtime` in the browser.
