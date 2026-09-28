# SIMPLE-FIRST — the org builds its own workspace from the chat

A new org sees only the AI chat. It tells the chat what it needs ("import all my
products from eBay", "I need to record purchase orders", "I need a customer
intake counter"); the chat turns the matching **capability** on and its pages
appear in the sidebar. Every change lands in the org's **build history**.

## Capability catalog — `src/lib/capabilities/catalog.ts`

| id | label | unlocks (sidebar rows / chat) | prerequisite |
|---|---|---|---|
| `chat` (base, always on) | AI chat | Chat, Settings, Search | — |
| `ebay_import` | eBay product import | Products · `import_products_from_ebay` | eBay connection |
| `purchase_orders` | Purchase orders & receiving | Deliveries, Sourcing, Arrival, Unbox · PO drafts | — |
| `outbound_orders` | Outbound orders | Shipping, Label intake, Picker, Packing, Scan out · order drafts | — |
| `customer_counter` | Customer intake counter | Sales, Local Pickup, Repair Service | — |
| `products` | Product catalog | Products | — |
| `inventory` | Inventory & bins | Inventory · where-is | — |
| `quality_control` | Testing & QC | Quality Control | — |
| `amazon_fba` | Amazon FBA | FBA | Amazon connection |
| `support` | Customer support | Support | — |
| `daily_ops` | Daily checklist & reports | Daily, Operations, Reports, Plans, Media Library | — |
| `automations` | Automations | Automations (Studio) | — |

Each entry also carries setup steps, the words operators use for it (how the
chat resolves "purchase orders") and, for the first four, the chat-first home
chip. A nav row shows while ANY capability that owns it is active; a row no
capability owns is never hidden (the catalog test keeps every row owned).

## States

`locked` (no row) → `suggested` (the chat proposed it) → `setting_up` (on, but a
prerequisite such as the eBay connection is missing) → `active`. Turning off
(Settings, or "undo that" in chat) returns it to `locked`. Only `active`
capabilities show their rows.

## The ledger

- `org_capabilities` — one row per (org, capability): state, enabled_by staff,
  enabled_at, source (`chat` | `settings` | `backfill` | `system`), config.
- `org_capability_events` — append-only history: event (`suggested`,
  `setup_started`, `activated`, `deactivated`, `backfilled`, `imported`),
  from/to state, staff, source, the chat proposal (`agent_mutation_id`), detail.
- Writer: `src/lib/capabilities/store.ts` (`transitionCapability` — state and
  ledger row in one tenant transaction). Chat writes go through the
  `org.enable_capability` agent mutation (confirm-before-write, revertable).
- View: **Settings → Capabilities & history** (`/settings/capabilities`).

## How the sidebar and chat read it

- **Sidebar:** `GET /api/nav` returns `capabilityHidden` beside the stored
  override; `useOrgNavItems` folds it in as hidden entries
  (`withCapabilityGate`). The contextual sidebar (`/api/nav/context`) folds the
  same gate into its one-trip read. Presentation only — a URL still opens for a
  staffer with the page permission.
- **Live:** a change publishes `org.capabilities.changed` (settings, import) or
  `assistant.mutation` (chat) on the org's AI channel; `OrgCapabilitiesRealtime`
  in the desktop shell invalidates the nav queries. The chat card that reports
  a change invalidates them in its own tab immediately.
- **Chat:** `list_capabilities` (GREEN), `enable_capability` (YELLOW, propose →
  "yes", refused in Ask only), `import_products_from_ebay` (YELLOW; without an
  eBay connection it returns the connect step and the `request_connection` pill).
- **Chat-first home:** the activation gate sends an org with no active workflow
  and no self-enabled capability to `/ai-chat`, whose empty state shows the
  capability chips while only the base is on.

## Rollout rule

Every org that existed when `2026-09-27_org_capabilities.sql` ran got every
capability backfilled `active` (source `backfill`), so nothing disappeared for
USAV or any existing tenant, and backfilled rows do not change their activation
gate. Orgs created afterwards start chat-only. **A new capability that takes
over existing nav rows must ship with its own backfill migration.**

eBay first (listings → catalog through the existing `EbayClient` and
`sku_platform_ids`); Amazon later.
