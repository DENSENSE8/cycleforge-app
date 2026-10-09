/** Integration connector contract (Phase 0 of the OAuth connection framework — docs/integrations-oauth-connection-plan.md). */
import type { OrgId } from '@/lib/tenancy/constants';
import type { IntegrationProvider } from '@/lib/integrations/credentials';
import type { SyncProgress } from '@/lib/orders-sync/types';
import type { ImportRowRecord } from '@/lib/imports/types';

/** How a tenant authenticates the connection. */
export type AuthKind = 'oauth' | 'nango' | 'vault';

/** What a connection can do — drives capability badges, which providers the sync orchestrator runs, AND product-surface gating/labels (see… */
export type Capability =
  | 'orders'
  | 'returns'
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
  /** ShipStation only: */
  backfill?: {
    apply?: boolean;
    /** ISO start of the history to walk; default: 7 days ago (the import scope). */
    since?: string;
    /** Window size in days (modifyDate windows, oldest first). Default 7. */
    windowDays?: number;
    restart?: boolean;
  };
  /** Live per-phase progress sink. */
  onProgress?: SyncProgress;
}

export interface SyncOutcome {
  ok: boolean;
  imported?: number;
  updated?: number;
  error?: string;
  /** Incremental watermark to persist for the next run. */
  cursor?: unknown;
  /** Provider-shaped per-row result detail, passed through verbatim to the caller (the route returns the whole outcome as JSON). */
  details?: unknown;
  /**
   * Counters a surface may show beside the totals (rows read, fields vs
   * tracking updates, duplicates removed, unresolved tracking).
   */
  stats?: Record<string, number>;
  /**
   * Every order this sync touched, with its ids and outcome — the import
   * record (`order_import_run_rows`, `src/lib/imports/types.ts`).
   */
  importRows?: ImportRowRecord[];
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

/** Options for {@link IntegrationConnector.validate}. */
export interface ValidateOpts {
  /**
   * Validate a connection whose vault row is NOT `active` (status `error`).
   * Recovery-only: the self-heal sweep uses it to prove a latched connection
   * actually works and lift the latch. Normal callers must leave it off.
   */
  allowInactive?: boolean;
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
  validate?(orgId: OrgId, scope?: string | null, opts?: ValidateOpts): Promise<HealthResult>;
  /** Connection-driven ingestion (replaces the transfer-orders buttons). */
  sync?(orgId: OrgId, opts?: SyncOpts): Promise<SyncOutcome>;
  /** Push channel stock/price OUT to the provider (bidirectional sync). Wired
   *  per-provider where the channel API supports it. */
  pushInventory?(orgId: OrgId, updates: InventoryPush[]): Promise<InventoryPushOutcome>;
  /** Drift-repair pass: compare the provider's recently-modified records against
   *  local state and fix either side. Driven by the daily reconcile cron. */
  reconcile?(orgId: OrgId, opts?: { since?: Date }): Promise<ReconcileOutcome>;
}
