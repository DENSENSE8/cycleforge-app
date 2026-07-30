/**
 * Integration connector contract (Phase 0 of the OAuth connection framework —
 * docs/integrations-oauth-connection-plan.md).
 *
 * A connector is the uniform behavior surface for one external provider. It
 * WRAPS the existing per-provider routes/clients (eBay/Amazon/Zoho OAuth, the
 * vault providers, Nango) behind one shape so the settings UI, the refresh
 * sweep, and the connection-driven sync orchestrator can treat every provider
 * the same. Phase 0 defines the contract + metadata; refresh()/validate()/
 * sync() are OPTIONAL and get wired per-provider in later phases.
 */
import type { OrgId } from '@/lib/tenancy/constants';
import type { IntegrationProvider } from '@/lib/integrations/credentials';

/** How a tenant authenticates the connection. */
export type AuthKind = 'oauth' | 'nango' | 'vault';

/** What a connection can do — drives capability badges, which providers the
 *  sync orchestrator runs, AND product-surface gating/labels (see
 *  src/lib/integrations/capability-labels.ts). Product surfaces speak these
 *  capabilities, never vendor brands — a feature is available when *some*
 *  connector with the capability is connected, not when "Zoho" is.
 *
 *    orders      — sales-order ingestion (marketplaces / storefronts / POS)
 *    inventory   — purchasing + catalog + stock backend (POs, item master,
 *                  fulfillment push). Zoho Inventory is the first connector.
 *    tracking    — carrier tracking events
 *    labels      — outbound label engine (rate shop / buy / void)
 *    payments    — payment processing (tenant-connected; Stripe stays platform)
 *    voice       — business phone (call log / voicemail / click-to-call)
 *    helpdesk    — customer tickets (support console, claims, warranty)
 *    email_inbox — org mailbox ingestion (PO mailbox, unfound-scan mail)
 *    catalog     — storefront catalog lookup (favorites / product search)
 *    ai          — BYOK AI chat/embeddings (Ask AI, AI search)
 */
export type Capability =
  | 'orders'
  | 'inventory'
  | 'tracking'
  | 'labels'
  | 'payments'
  | 'voice'
  | 'helpdesk'
  | 'email_inbox'
  | 'catalog'
  | 'ai';

/** Normalized token/credential envelope stored (encrypted) inside the vault
 *  payload. Standardizing this lets the refresh sweep treat every OAuth
 *  provider the same. */
export interface TokenEnvelope {
  accessToken?: string;
  refreshToken?: string;
  /** Access-token expiry, epoch ms. Drives the refresh sweep. */
  expiresAt?: number;
  scopes?: string[];
  /** Provider account id (marketplace / seller / store). */
  accountRef?: string;
}

export type ConnectionState = 'active' | 'error' | 'revoked' | 'expired' | 'disconnected';

/** A tenant's connection to one provider, as the settings UI / orchestrator
 *  should see it — vault row joined with connector metadata. */
export interface ConnectionStatus {
  provider: IntegrationProvider;
  connected: boolean;
  state: ConnectionState;
  authKind: AuthKind;
  capabilities: readonly Capability[];
  displayLabel?: string | null;
  scope?: string | null;
  lastError?: string | null;
  lastUsedAt?: Date | null;
  /** When the vault row was first created (i.e. when the org connected). */
  connectedAt?: Date | null;
  /** Populated once the Phase 1 columns land (last_synced_at / expires_at). */
  lastSyncedAt?: Date | null;
  expiresAt?: Date | null;
}

export interface HealthResult {
  ok: boolean;
  error?: string;
  detail?: unknown;
}

/** Options a manual "Sync now" may thread into a connector's sync(). */
export interface SyncOpts {
  full?: boolean;
  cursor?: unknown;
  /** Google Sheets only: import a specific sheet tab instead of the latest. */
  manualSheetName?: string;
}

export interface SyncOutcome {
  ok: boolean;
  imported?: number;
  updated?: number;
  error?: string;
  /** Incremental watermark to persist for the next run. */
  cursor?: unknown;
  /**
   * Provider-shaped per-row result detail, passed through verbatim to the
   * caller (the route returns the whole outcome as JSON). Opaque here on
   * purpose: the contract stays provider-agnostic, and each surface narrows it
   * to its own type — the Sheets/Ecwid importer reads it as
   * `TransferOrderDetails` (src/lib/orders-sync/types.ts).
   *
   * This field is the prerequisite orders-transfer.ts named for retiring the
   * legacy NDJSON routes. Without it a connector sync reduces a whole import to
   * two counters, and OrderSyncDialog — which renders per-row inserted/updated/
   * unmatched-catalog lists — has literally nothing to draw.
   */
  details?: unknown;
  /**
   * Counters a surface may show beside the totals — most importantly the
   * "why did nothing import" story (rows skipped for no item number, no
   * tracking, no order id). Silently dropping these is what turns a fully
   * skipped import into a blank "up to date" panel.
   */
  stats?: Record<string, number>;
}

/** One channel-listing stock/price push (bidirectional sync — Hub → Spoke). */
export interface InventoryPush {
  /** platform_listings.external_ref_id (channel listing id). */
  externalRefId: string;
  quantity?: number;
  priceCents?: number;
}

export interface InventoryPushOutcome {
  ok: boolean;
  pushed?: number;
  failed?: number;
  error?: string;
}

/** Result of a reconciliation pass (drift repair against the external system). */
export interface ReconcileOutcome {
  ok: boolean;
  /** Records found in sync (no action needed). */
  inSync?: number;
  /** Local records repaired from the external system (missed inbound). */
  inboundFixed?: number;
  /** External records repaired from local (failed/dropped outbound). */
  outboundFixed?: number;
  error?: string;
}

export interface IntegrationConnector {
  provider: IntegrationProvider;
  authKind: AuthKind;
  capabilities: readonly Capability[];
  /** Settings-UI redirect entrypoint to begin connect (oauth/nango). */
  authorizeStartPath?: string;
  /** Existing health-check route, if any. */
  healthPath?: string;
  /** Rotate this org's tokens. Wired per-provider in Phase 1+. */
  refresh?(orgId: OrgId, scope?: string | null): Promise<TokenEnvelope | null>;
  /** Validate the stored credential (subsumes ad-hoc /health). */
  validate?(orgId: OrgId, scope?: string | null): Promise<HealthResult>;
  /** Connection-driven ingestion (replaces the transfer-orders buttons). */
  sync?(orgId: OrgId, opts?: SyncOpts): Promise<SyncOutcome>;
  /** Push channel stock/price OUT to the provider (bidirectional sync). Wired
   *  per-provider where the channel API supports it. */
  pushInventory?(orgId: OrgId, updates: InventoryPush[]): Promise<InventoryPushOutcome>;
  /** Drift-repair pass: compare the provider's recently-modified records against
   *  local state and fix either side. Driven by the daily reconcile cron. */
  reconcile?(orgId: OrgId, opts?: { since?: Date }): Promise<ReconcileOutcome>;
}
