# HANDOFF — orders first: the exact build, in the desktop app

**Paste everything below the rule into a fresh session pointed at this worktree
(`.claude/worktrees/warehouse-os-refactor-8f2dc3`, branch
`claude/warehouse-os-refactor-8f2dc3`).**

Written 2026-08-24, same day as [`00-endgame.md`](00-endgame.md) (the plan of
record — read it first) and [`HANDOFF-ux-overhaul.md`](HANDOFF-ux-overhaul.md)
(the screen this feeds into). This brief SEQUENCES them with an operator ruling
made tonight, verbatim:

> *"I must iterate in the desktop app first. You must first start with
> importing orders as the starting point, not the inventory. You need orders
> and products to manipulate first before the inventory management."*

So: **orders and products become real and manipulable in the Electron shell
BEFORE the inventory UI gets built.** The location spine's backend stays live
(it shipped today — migration applied, routes gated, law enforced), and the
`/putaway` lane continues in parallel; but the next thing a human sees in the
shell is their own orders, not bins.

---

## The iteration surface — the installed app, on this machine

The operator iterates in the **native Electron window**, not a browser tab
(00-endgame D4: installed app for every role; the desktop is the product).

- Dev server: `:3051` serves this worktree. **Attach only — never start,
  restart, or kill it.** If it is down, that is a report to the operator, who
  will say "run it" (the sanctioned path is `preview_start` with launch entry
  `warehouse-os-worktree`; memory: worktree needs its own `.env`, copied from
  main, hot-reloaded — never restart to pick it up).
- The app: `cd <worktree> && ELECTRON_START_URL=http://127.0.0.1:3051
  NODE_ENV=development npx electron . --remote-debugging-port=9223` (nohup it;
  relaunching **Electron** is fine — the Next servers are not yours).
- Verify inside the native window over CDP: `curl 127.0.0.1:9223/json` →
  page ws → `Runtime.evaluate`. The browser pane on `:3051` is the secondary
  check; the Electron window is the truth.
- Authenticated API pokes: `LH_BASE_URL=http://localhost:3051 node
  scripts/lighthouse-mint-session.mjs` mints a `cf_sid` cookie (tenant `usav`).

## Step 1 — orders flow in (the starting point)

Everything needed already exists; this step is **wiring and verifying, not
building**:

- **Sync triggers (routes, live):** `POST /api/ebay/sync`,
  `POST /api/amazon/sync`, `POST /api/integrations/[provider]/sync`, plus the
  cron pair (`/api/cron/integrations/sync`, `/api/cron/amazon/orders-sync`).
- **The engine:** `src/lib/integrations/connectors/orchestrator.ts` —
  `syncConnection(...)` per connection, `runOrdersSyncAllOrgs(only?)` across
  orgs — feeding `src/lib/orders/ingest-canonical-orders.ts` →
  `ingestCanonicalOrders(...)` (line ~429), the uniform upsert into `orders`.
- **Credentials:** the OAuth vault (`organization_integrations`, via
  `get/upsertIntegrationCredentials`) — the dogfood org has live eBay/Amazon
  tokens on this shared DB. **Check, don't assume**: probe the connector
  status route/table first; if a token is dead, report it — token re-auth is
  the operator's browser flow, not yours.
- **Fallback with no live creds:** `POST /api/orders/import-csv` and
  `/api/orders/import` exist for file-driven ingestion; the Electron Files
  panel (N6, `src/shell/FilesPanel.tsx` → `/api/imports/desktop-files`) is the
  native import mouth the operator was promised ("import personal and business
  files immediately").

**Done when:** a sync run has landed fresh real orders in `orders` for the
`usav` org, and you can prove it with a mint-session `GET /api/orders/lookup`
(the composer's own endpoint) returning a current order.

## Step 2 — orders manipulable in the shell

The seam already exists — extend it, do not fork it:

- The omni-composer's `#` grammar resolves against `/api/orders/lookup` and
  commits through `useShell.onComposerCommit` (`src/shell/useShell.ts:710`):
  a chip paints the feed summary, calls `openTile('orders','Orders','table')`,
  and dispatches `dispatchOpenShippedDetails(order,'queue')`. Today that tile
  is a stub. **Make it real.**
- **The Orders tile** — the first true data tile of the D2 canvas. If the
  UX-overhaul lane has rebuilt the canvas, build against it; if not, build
  against the current tile mounting (`Tile.tsx`/`TileBody.tsx`) and keep the
  tile's internals host-agnostic so the canvas swap is a re-parent, not a
  rewrite. Contents: the live queue (real columns — the old
  `dashboard-order-row-layout.ts` column floors survive as the minimum table
  width, `--tile-min-table: 520px`), and a focused-order detail state.
- **The verbs** (the desk-triage role's, 00-endgame §3): read the queue ·
  check stock before shipping · flag urgency (`orders.is_urgent` exists,
  `2026-07-14` migration) · comment through the composer with the order as
  write-target (Phase 7's `target`) · spawn a work order from an order
  (`work_assignments` + `/api/work-orders`, `/api/assignments/next`). Every
  write goes through the existing gated routes — no new write paths without
  the route skeleton (withAuth → Zod → domain → audit).
- **One Field holds.** Filtering the queue is composer-driven ("filter:" via
  the `/` action grammar or the AI loop) or a tile-local filter INSIDE the
  mounted queue surface (I6's carve-out) — never a floating search box.

## Step 3 — products beside orders

- The catalog exists: `sku_catalog` (+ Zoho mirror), `src/hooks/useCatalog.ts`,
  the `/api` catalog family, and `/s/[sku]` resolvers. Build the **Product
  tile**: lookup by SKU/scan, detail (title, identifiers, photos via the photo
  service, listing links), opened from an order line or the composer.
- Extend the composer grammar only if the operator asks — `#` is orders; do
  not silently colonise new sigils.

## Step 4 — only now, inventory

When orders and products are manipulable in the window, the inventory UI lands
ON them: the spine tile (scan → `GET /api/inventory/spine?scan=…`), put-away
from a received order's units, part pulls from a product's donor. The APIs are
live and law-enforced (D10 three deep: schema, domain, DB CHECK); the UI order
was the only thing this brief changed.

## Hard context you must not re-derive (verified today)

- 00-endgame D1–D16 rule everything; its §5 write table is law as rewritten by
  operator ruling 2026-09-26 — reads free, and the AI may perform every write
  verb (location moves included) **approval-first**: each lands as a proposal
  a named human approves unless the org has set that automation to
  auto-approve (applied now, logged `actor_kind = 'agent'`, revertable).
- The spine backend shipped: `2026-08-24_unit_location_spine.sql` APPLIED to
  the shared dev DB (FORCE RLS verified), `src/lib/inventory/placements.ts`
  (11/11 tests), routes `POST /api/inventory/placements|part-pulls`,
  `GET /api/inventory/spine` (gated by `placement.record`/`placement.view`,
  manifest test 60/60).
- **The dev DB is the dogfood DB — the operator's real business.** Marketplace
  order READS are safe and wanted. Never seed fake orders/units into `usav`;
  synthetic data goes in the QA org. Never call a marketplace WRITE endpoint
  from dev or tests against the dogfood org — the AI's price changes, listing
  edits and customer sends go through the approval-first proposal queue
  (operator ruling 2026-09-26), and a live send happens only on approval or
  the org's auto-approve setting.
- A parallel lane owns `/putaway` + `src/lib/scan/` — re-read before touching,
  stay out while mid-flight.
- Known-red inherited: `src/lib/canvas/*.test.ts` (Canvas→Well deletion);
  `agent-loop.ts` still pins stale `claude-opus-4-8`.

## Laws and hazards (compact; LAWS.md has the full 172)

M1 nothing animates geometry · F1/F3 one radius, strokes not shadows · One
Field · I6 no floating text inputs · wedge ahead of keybinds (T20/T21) · S1–S3,
S12 session sanctity (S1's per-staff amendment pending, D9) · beam stays two
bookends · T31 resolvers untouchable · X1 no source-regex guards · `orgId`
from ctx, never the body · migrations expand→code→contract ·
`npm run verify` before done · never branch, never `git add -A`, never stash,
commit only when asked · `:3050`/`:3051` are the operator's.

## Done, observably

The operator sits at the Electron window and, with no coaching: types `#` and
a real order number → the chip commits → **their actual order opens as a real
tile** with its lines and status; flags it urgent; comments on it through the
composer; opens a product from one of its lines; and the morning's eBay/Amazon
sync brought today's orders in without a hand touching a browser tab. Gates
green. That is this brief's whole finish line — inventory comes after.

## Fight this brief where it needs it

1. **"Extend the stub tile" vs "wait for the canvas."** If the UX-overhaul
   lane is mid-rebuild, measure the cost of building host-agnostic once versus
   re-parenting later — bring numbers, pick one, log it.
2. **Sync trigger UX.** A manual "sync now" affordance in the shell is not
   ruled. If the operator asks for it, it is a `/` action + a gated route call,
   not a settings page. Fight anything bigger.
