/** Action registry — named, permission-gated mutations the station builder can bind to block rows. */

import type { ActionDefinition, ActionMeta, DataSourceDefinition } from './contract';

const registry = new Map<string, ActionDefinition>();

export function registerAction(def: ActionDefinition): void {
  if (registry.has(def.id)) {
    throw new Error(`Station action already registered: ${def.id}`);
  }
  registry.set(def.id, def);
}

export function getAction(id: string): ActionDefinition | undefined {
  return registry.get(id);
}

export function listActions(): ActionDefinition[] {
  return [...registry.values()];
}

export function listActionMeta(): ActionMeta[] {
  return listActions().map(({ body: _b, ...meta }) => meta);
}

/**
 * The Config Sheet's Actions tab = all registered actions compatible with the
 * bound source: same integration, or an `appliesTo` kind present in the
 * source's declared shape.
 */
export function actionsForSource(source: Pick<DataSourceDefinition, 'integration' | 'shape'>): ActionDefinition[] {
  const kinds = new Set(source.shape.map((f) => f.kind));
  return listActions().filter(
    (a) => a.integration === source.integration || a.appliesTo.some((k) => kinds.has(k)),
  );
}

/** Test-only. */
export function __clearActionRegistry(): void {
  registry.clear();
}

// ─── Builtin actions ─────────────────────────────────────────

/** Move a PO email to the ignore pile — wraps PATCH /api/admin/po-gmail/triage/[id]. */
const dismissEmail: ActionDefinition = {
  id: 'incoming.dismiss_email',
  label: 'Dismiss',
  icon: 'X',
  endpoint: { method: 'PATCH', path: '/api/admin/po-gmail/triage/:id' },
  body: () => ({ pile: 'ignore' }),
  permission: 'admin.view',
  appliesTo: [],
  integration: 'po-gmail',
  confirm: 'soft',
};

/** Mark a PO email handled (done pile) — wraps PATCH /api/admin/po-gmail/triage/[id]. */
const markEmailDone: ActionDefinition = {
  id: 'incoming.mark_email_done',
  label: 'Mark handled',
  icon: 'Check',
  endpoint: { method: 'PATCH', path: '/api/admin/po-gmail/triage/:id' },
  body: () => ({ pile: 'done' }),
  permission: 'admin.view',
  appliesTo: [],
  integration: 'po-gmail',
  confirm: 'none',
};

/** Mark a sourcing-queue row as actively being worked — wraps PATCH /api/sourcing/alerts (id+status in the body; this route keys the id off… */
const startSourcing: ActionDefinition = {
  id: 'sourcing.start_sourcing',
  label: 'Start sourcing',
  icon: 'Search',
  endpoint: { method: 'PATCH', path: '/api/sourcing/alerts' },
  body: (row) => ({ id: Number(row.id), status: 'sourcing' }),
  permission: 'sourcing.manage',
  appliesTo: [],
  integration: 'sourcing',
  confirm: 'none',
};

/** Attach a carrier tracking number to a PO. */
const attachTracking: ActionDefinition = {
  id: 'incoming.attach_tracking',
  label: 'Attach tracking',
  icon: 'Link2',
  endpoint: { method: 'POST', path: '/api/receiving/po/:id/attach-box' },
  // body is omitted — BlockRenderer detects `station:attach-tracking` event actions
  // and dispatches the window event instead of calling fetch directly.
  permission: 'receiving.mark_received',
  appliesTo: ['po_ref'],
  integration: 'receiving',
  confirm: 'none',
};

/** Link an eBay (or other non-Zoho) Incoming line to its Zoho PO — wraps POST /api/receiving/inbound/link (Universal Incoming §7.2, §9.4). */
const linkZohoPo: ActionDefinition = {
  id: 'incoming.link_zoho_po',
  label: 'Link Zoho PO',
  icon: 'Link2',
  endpoint: { method: 'POST', path: '/api/receiving/inbound/link' },
  // body omitted — the picker builds { receiving_line_id, target } after the
  // operator selects the Zoho PO to merge into.
  permission: 'receiving.mark_received',
  appliesTo: ['po_ref', 'order_ref'],
  integration: 'receiving',
  confirm: 'none',
};

/** Re-pull the Incoming feed from its upstream sources (Zoho + eBay) for the bound org — wraps POST /api/receiving-lines/incoming/refresh… */
const refreshInbound: ActionDefinition = {
  id: 'incoming.refresh_inbound',
  label: 'Refresh from sources',
  icon: 'RefreshCw',
  endpoint: { method: 'POST', path: '/api/receiving-lines/incoming/refresh' },
  body: () => ({}),
  // Must match the wrapped route's gate (the route is `receiving.view`).
  permission: 'receiving.view',
  appliesTo: [],
  integration: 'receiving',
  confirm: 'none',
};

/** Manually import an eBay buyer purchase onto the Incoming spine — wraps the Phase 2 bridge route POST /api/receiving/inbound/import-ebay… */
const importEbayOrder: ActionDefinition = {
  id: 'incoming.import_ebay_order',
  label: 'Import eBay order',
  icon: 'Plus',
  endpoint: { method: 'POST', path: '/api/receiving/inbound/import-ebay' },
  permission: 'integrations.ebay',
  appliesTo: ['order_ref'],
  integration: 'receiving',
  confirm: 'none',
};

/** Rate-shop an order row via the ShipStation v2 engine. */
const shipstationRateShop: ActionDefinition = {
  id: 'shipstation.rate_shop',
  label: 'Rate shop',
  icon: 'Truck',
  endpoint: { method: 'POST', path: '/api/shipping/order-rates' },
  // body omitted — the rate-shop sheet builds { orderId } / the explicit spec.
  permission: 'shipping.buy_label',
  appliesTo: ['order_ref'],
  integration: 'shipstation',
  confirm: 'none',
};

/** Buy the picked rate — IRREVERSIBLE (charges the carrier account). */
const shipstationBuyLabel: ActionDefinition = {
  id: 'shipstation.buy_label',
  label: 'Buy label',
  icon: 'Tag',
  endpoint: { method: 'POST', path: '/api/shipping/order-labels/purchase' },
  // body omitted — the sheet builds { orderId, rateId, clientEventId }.
  permission: 'shipping.buy_label',
  appliesTo: ['order_ref'],
  integration: 'shipstation',
  confirm: 'soft',
};

let builtinsRegistered = false;
export function registerBuiltinActions(): void {
  if (builtinsRegistered) return;
  builtinsRegistered = true;
  registerAction(dismissEmail);
  registerAction(markEmailDone);
  registerAction(startSourcing);
  registerAction(attachTracking);
  registerAction(linkZohoPo);
  registerAction(refreshInbound);
  registerAction(importEbayOrder);
  registerAction(shipstationRateShop);
  registerAction(shipstationBuyLabel);
}
