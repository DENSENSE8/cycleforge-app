/** Connector registry — the BEHAVIOR source of truth for integrations (auth kind, capabilities, and — added per-phase — refresh/validate/sync). */
import type { IntegrationProvider } from '@/lib/integrations/credentials';
import type { Capability, IntegrationConnector } from './types';

const CONNECTORS: Record<IntegrationProvider, IntegrationConnector> = {
  // Marketplaces — real OAuth already exists.
  // outbound-order importer and aggregates these stores (owner 2026-09-24).
  ebay: {
    provider: 'ebay',
    authKind: 'oauth',
    capabilities: ['orders'],
    authorizeStartPath: '/api/ebay/connect',
    healthPath: '/api/ebay/health',
    // Lazy imports so the connection reader never pulls in the eBay client.
    validate: (orgId) => import('./ebay').then((m) => m.ebayValidate(orgId)),
    refresh: (orgId, scope) => import('./ebay').then((m) => m.ebayRefresh(orgId, scope)),
  },
  amazon: {
    provider: 'amazon',
    authKind: 'oauth',
    capabilities: ['orders'],
    authorizeStartPath: '/api/amazon/oauth/start',
    healthPath: '/api/amazon/health',
    // Lazy import so the connection reader never pulls in the Amazon client.
    validate: (orgId) => import('./amazon').then((m) => m.amazonValidate(orgId)),
  },
  // Operations
  zoho: {
    provider: 'zoho',
    authKind: 'oauth',
    capabilities: ['inventory'],
    authorizeStartPath: '/api/zoho/oauth/authorize',
    healthPath: '/api/zoho/health',
    validate: (orgId, _scope, opts) => import('./zoho').then((m) => m.zohoValidate(orgId, opts)),
  },
  // Credentials only: the technician / packer sheet import
  // (`/api/google-sheets/execute-script`) reads the org's sheet with them.
  // Sheet ORDER import was removed 2026-09-24 — orders come from ShipStation.
  google_sheets: { provider: 'google_sheets', authKind: 'vault', capabilities: [] },
  // Storage backup — tenant connects their own Google Drive (Sign in with Google, scope drive.file) so photo originals back up to / offload…
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
  // Ecwid orders arrive through ShipStation; the connection feeds the catalog
  // mirror, packing slips and exception tracking.
  ecwid: {
    provider: 'ecwid',
    authKind: 'vault',
    capabilities: ['orders', 'catalog'],
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
    healthPath: '/api/integrations/shipstation/health?fresh=1',
    sync: (orgId, opts) => import('./shipstation').then((m) => m.shipstationSync(orgId, opts)),
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
  // Email inbox — the PO mailbox (Gmail).
  gmail: {
    provider: 'gmail',
    authKind: 'oauth',
    capabilities: ['email_inbox'],
    authorizeStartPath: '/api/admin/po-gmail/connect',
  },
  // Voice — business phone (call log + voicemail follow-ups + click-to-call).
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
