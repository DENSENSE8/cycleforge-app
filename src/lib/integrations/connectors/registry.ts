/**
 * Connector registry — the BEHAVIOR source of truth for integrations (auth
 * kind, capabilities, and — added per-phase — refresh/validate/sync).
 *
 * The catalog at src/app/settings/integrations/registry.ts stays the DISPLAY
 * SoT (labels, badges, categories, modal copy). Phase 2 reconciles the two so
 * the display catalog derives its behavior bits from here instead of
 * duplicating them. For now this is additive and self-contained.
 *
 * The `Record<IntegrationProvider, …>` makes provider coverage a COMPILE
 * error if a provider is added to the vault enum but missed here.
 */
import type { IntegrationProvider } from '@/lib/integrations/credentials';
import type { Capability, IntegrationConnector } from './types';

const CONNECTORS: Record<IntegrationProvider, IntegrationConnector> = {
  // Marketplaces — real OAuth already exists; sync/refresh wired in Phase 1+.
  // 'inventory' is the ERP/inventory-BACKEND capability (POs, item master,
  // fulfillment push) — channel stock/price push on marketplaces is part of
  // the 'orders' channel capability (the pushInventory hook), not 'inventory'.
  ebay: {
    provider: 'ebay',
    authKind: 'oauth',
    capabilities: ['orders'],
    authorizeStartPath: '/api/ebay/connect',
    healthPath: '/api/ebay/health',
    // Lazy imports so the connection reader never pulls in the eBay client.
    sync: (orgId) => import('./ebay').then((m) => m.ebaySync(orgId)),
    validate: (orgId) => import('./ebay').then((m) => m.ebayValidate(orgId)),
    refresh: (orgId, scope) => import('./ebay').then((m) => m.ebayRefresh(orgId, scope)),
  },
  amazon: {
    provider: 'amazon',
    authKind: 'oauth',
    capabilities: ['orders'],
    authorizeStartPath: '/api/amazon/oauth/start',
    healthPath: '/api/amazon/health',
    sync: (orgId) => import('./amazon').then((m) => m.amazonSync(orgId)),
    validate: (orgId) => import('./amazon').then((m) => m.amazonValidate(orgId)),
  },
  // Operations
  zoho: {
    provider: 'zoho',
    authKind: 'oauth',
    capabilities: ['inventory'],
    authorizeStartPath: '/api/zoho/oauth/authorize',
    healthPath: '/api/zoho/health',
    validate: (orgId) => import('./zoho').then((m) => m.zohoValidate(orgId)),
  },
  google_sheets: {
    provider: 'google_sheets',
    authKind: 'vault',
    capabilities: ['orders'],
    // Lazy import so the connection reader never pulls in the Sheets job.
    sync: (orgId, opts) => import('./orders-transfer').then((m) => m.googleSheetsSync(orgId, opts)),
  },
  // Storage backup — tenant connects their own Google Drive (Sign in with
  // Google, scope drive.file) so photo originals back up to / offload onto
  // storage they own. No ingestion capability; validate()/refresh() are
  // lazy-imported so the connection reader never pulls the Drive client.
  google_drive: {
    provider: 'google_drive',
    authKind: 'oauth',
    capabilities: [],
    authorizeStartPath: '/api/integrations/google-drive/connect',
    healthPath: '/api/integrations/google-drive/health',
    validate: (orgId) => import('@/lib/photos/drive/client').then((m) => m.validateDriveConnection(orgId)),
    refresh: (orgId) => import('@/lib/photos/drive/client').then((m) => m.refreshDriveToken(orgId)),
  },
  // Storefronts & POS
  square: {
    provider: 'square',
    authKind: 'nango',
    capabilities: ['orders'],
    // Lazy import so the connection reader never pulls in the Square client.
    sync: (orgId) => import('./square').then((m) => m.squareSync(orgId)),
  },
  ecwid: {
    provider: 'ecwid',
    authKind: 'vault',
    capabilities: ['orders', 'catalog'],
    // Lazy import so the connection reader never pulls in the Ecwid job.
    sync: (orgId) => import('./orders-transfer').then((m) => m.ecwidSync(orgId)),
  },
  // Nango-connected storefront (mirrors Square). Orders in via the GraphQL Admin
  // API through Nango's proxy; catalog/stock push-out is a later phase. Lazy
  // import so the connection reader never pulls in the Shopify client.
  shopify: {
    provider: 'shopify',
    authKind: 'nango',
    capabilities: ['orders'],
    sync: (orgId) => import('./shopify').then((m) => m.shopifySync(orgId)),
    validate: (orgId) => import('./shopify').then((m) => m.shopifyValidate(orgId)),
  },
  // Payments
  stripe: {
    provider: 'stripe',
    authKind: 'vault',
    capabilities: ['payments'],
  },
  // Shipping carriers — hand-built forever (Nango doesn't cover carriers).
  // ShipStation is the label ENGINE (rate-shop + buy/void via v2) AND an order
  // source (pull via legacy v1). Lazy sync import so the reader never bundles it.
  shipstation: {
    provider: 'shipstation',
    authKind: 'vault',
    capabilities: ['orders', 'tracking', 'labels'],
    sync: (orgId) => import('./shipstation').then((m) => m.shipstationSync(orgId)),
  },
  ups: { provider: 'ups', authKind: 'vault', capabilities: ['tracking'] },
  fedex: { provider: 'fedex', authKind: 'vault', capabilities: ['tracking'] },
  usps: { provider: 'usps', authKind: 'vault', capabilities: ['tracking'] },
  // Support / Realtime / AI.
  zendesk: { provider: 'zendesk', authKind: 'vault', capabilities: ['helpdesk'] },
  ably: { provider: 'ably', authKind: 'vault', capabilities: [] },
  ollama: { provider: 'ollama', authKind: 'vault', capabilities: ['ai'] },
  // AI search providers (BYOK, OpenAI wire format) — resolved per request by
  // src/lib/ai/org-provider.ts; 'ollama' doubles as the self-hosted slot.
  ai_gateway: { provider: 'ai_gateway', authKind: 'vault', capabilities: ['ai'] },
  openai: { provider: 'openai', authKind: 'vault', capabilities: ['ai'] },
  anthropic: { provider: 'anthropic', authKind: 'vault', capabilities: ['ai'] },
  // SuperGrok / X Premium+ — subscription OAuth, not a metered api.x.ai key.
  grok: {
    provider: 'grok',
    authKind: 'oauth',
    capabilities: ['ai'],
    authorizeStartPath: '/api/integrations/grok/connect',
    healthPath: '/api/integrations/grok/health',
    validate: (orgId) => import('./grok').then((m) => m.grokValidate(orgId)),
    refresh: (orgId) => import('./grok').then((m) => m.grokRefresh(orgId)),
  },
  // Email inbox — the PO mailbox (Gmail). The OAuth island under
  // /api/admin/po-gmail/* remains the live flow; tokens are being migrated
  // from google_oauth_tokens into the vault (dual-read in src/lib/po-gmail/
  // client.ts). Registered here so 'email_inbox' gating/labels resolve.
  gmail: {
    provider: 'gmail',
    authKind: 'oauth',
    capabilities: ['email_inbox'],
    authorizeStartPath: '/api/admin/po-gmail/connect',
  },
  // Voice — business phone (call log + voicemail follow-ups + click-to-call).
  // authKind is confirmed in the Phase 0 spike; vault is the default. sync() is
  // the catch-up poll (webhooks are the realtime path) — lazy-imported so the
  // connection reader never pulls the Nextiva client.
  nextiva: {
    provider: 'nextiva',
    authKind: 'vault',
    capabilities: ['voice'],
    healthPath: '/api/integrations/nextiva/health',
    sync: (orgId) => import('./nextiva').then((m) => m.nextivaSync(orgId)),
  },
};

/** Connector for a provider, or undefined for an unknown/legacy provider
 *  string (e.g. a stale vault row). */
export function getConnector(provider: string): IntegrationConnector | undefined {
  return (CONNECTORS as Record<string, IntegrationConnector>)[provider];
}

export function listConnectors(): IntegrationConnector[] {
  return Object.values(CONNECTORS);
}

/** Connectors that expose a given capability (e.g. 'orders' for the sync
 *  orchestrator). */
export function connectorsWithCapability(cap: Capability): IntegrationConnector[] {
  return listConnectors().filter((c) => c.capabilities.includes(cap));
}
