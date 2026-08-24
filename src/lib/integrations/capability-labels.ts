/**
 * Capability label helpers — the DISPLAY vocabulary for capability-first
 * product copy ("Integrations as SoT" program).
 *
 * Product surfaces speak capabilities (inventory, helpdesk, storefront
 * catalog, label engine, email inbox) — never vendor brands. Operator copy is
 * built from either:
 *   - a generic capability noun/title from here ("Save to inventory",
 *     "Inventory not connected"), or
 *   - the connected provider's display label via
 *     src/lib/integrations/capability-connections.ts (server-only) — e.g.
 *     "Zoho Inventory" when that connector is the org's inventory backend.
 *
 * This module is PURE + CLIENT-SAFE (no db). Label SoT chain:
 *   provider label   → PROVIDER_CATALOG (settings display SoT)
 *   capability words → the maps below (extend here, never inline in a view)
 */
import { PROVIDER_CATALOG } from '@/lib/integrations/provider-catalog';
import type { Capability } from '@/lib/integrations/connectors/types';

/** Lowercase noun for mid-sentence interpolation ("Save to {noun}"). */
const CAPABILITY_NOUN: Record<Capability, string> = {
  orders: 'sales channel',
  inventory: 'inventory',
  tracking: 'carrier tracking',
  labels: 'label engine',
  payments: 'payments',
  voice: 'voice',
  helpdesk: 'helpdesk',
  email_inbox: 'email inbox',
  catalog: 'storefront catalog',
  ai: 'AI provider',
};

/** Title-case name for headings, empty states, and connect CTAs. */
const CAPABILITY_TITLE: Record<Capability, string> = {
  orders: 'Sales channel',
  inventory: 'Inventory',
  tracking: 'Carrier tracking',
  labels: 'Label engine',
  payments: 'Payments',
  voice: 'Voice',
  helpdesk: 'Helpdesk',
  email_inbox: 'Email inbox',
  catalog: 'Storefront catalog',
  ai: 'AI provider',
};

/** Runtime guard for a capability key coming off the wire (e.g. a query param). */
export function isCapability(value: string): value is Capability {
  return Object.prototype.hasOwnProperty.call(CAPABILITY_TITLE, value);
}

export function capabilityNoun(cap: Capability): string {
  return CAPABILITY_NOUN[cap];
}

export function capabilityTitle(cap: Capability): string {
  return CAPABILITY_TITLE[cap];
}

/** Catalog display label for a provider key ("zoho" → "Zoho Inventory").
 *  Falls back to the raw key for unknown/legacy provider strings. */
export function providerCatalogLabel(provider: string): string {
  return PROVIDER_CATALOG.find((p) => p.key === provider)?.label ?? provider;
}



/** Deep-link to the Integrations hub — the ONLY connect surface. Optionally
 *  anchored to one provider's card. */
export function integrationsHubHref(provider?: string): string {
  return provider ? `/settings/integrations#${provider}` : '/settings/integrations';
}

export type { Capability };
