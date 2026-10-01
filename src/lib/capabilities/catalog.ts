/**
 * THE CAPABILITY CATALOG — what an org can unlock (docs/product/SIMPLE-FIRST.md).
 *
 * A new org starts with the base capability only (the AI chat, Settings,
 * Search). Everything else is a capability the org turns on — from the chat
 * ("I need to record purchase orders") or Settings → Capabilities — and its
 * nav rows then appear in the sidebar. Every change lands in the org's build
 * history (`org_capability_events`).
 *
 * Pure and client-safe: the sidebar gate, the chat tools, the chips on the
 * chat-first home and the settings page all read this one table.
 *
 * Adding a capability that takes over EXISTING nav rows needs a backfill
 * migration that activates it for every existing org — otherwise those rows
 * disappear for tenants that already use them (the rollout rule).
 */

export type CapabilityState = 'locked' | 'suggested' | 'setting_up' | 'active';
export type CapabilitySource = 'chat' | 'settings' | 'backfill' | 'system';

/** Something outside CycleForge the capability needs before it can go active. */
export interface CapabilityPrerequisite {
  kind: 'connection';
  provider: 'ebay' | 'amazon';
  /** The Still-needed line: "Connect your eBay account". */
  label: string;
}

export interface CapabilityDef {
  id: string;
  label: string;
  /** One sentence: what the org gets. */
  blurb: string;
  /** `APP_SIDEBAR_NAV` ids this capability shows. A row shows while ANY owner is active. */
  navItemIds: readonly string[];
  /** Chat tools that do this capability's work — documentation, never a gate. */
  tools: readonly string[];
  /** What the chat can do once it is on, for the card ("Record POs from chat"). */
  chatAbility?: string;
  /** Where the org starts once it is active. */
  landingPath: string;
  prerequisites: readonly CapabilityPrerequisite[];
  /** Setup, in order — the card's "how it works" once enabled. */
  setupSteps: readonly string[];
  /** Words an operator uses for it — how the chat resolves "purchase orders". */
  keywords: readonly string[];
  /** The chat-first home chip that asks for it (absent = no chip). */
  starter?: string;
}

/** The capability every org has, always: it is never stored and never locked. */
export const BASE_CAPABILITY_ID = 'chat';

export const CAPABILITIES: readonly CapabilityDef[] = [
  {
    id: BASE_CAPABILITY_ID,
    label: 'AI chat',
    blurb: 'Ask the assistant anything and tell it what your business needs; it unlocks the rest.',
    navItemIds: ['ai-chat', 'settings', 'search'],
    tools: ['list_capabilities', 'enable_capability'],
    landingPath: '/ai-chat',
    prerequisites: [],
    setupSteps: [],
    keywords: ['chat', 'assistant'],
  },
  {
    id: 'ebay_import',
    label: 'eBay product import',
    blurb: 'Pull every active eBay listing into your product catalog, linked to its eBay item.',
    navItemIds: ['products'],
    tools: ['import_products_from_ebay'],
    chatAbility: 'Import eBay listings from chat',
    landingPath: '/products',
    prerequisites: [{ kind: 'connection', provider: 'ebay', label: 'Connect your eBay account' }],
    setupSteps: ['Connect your eBay seller account', 'Import your active listings into Products'],
    keywords: ['ebay', 'ebay products', 'ebay listings', 'import products', 'my listings'],
    starter: 'Connect eBay and import my products',
  },
  {
    id: 'purchase_orders',
    label: 'Purchase orders & receiving',
    blurb: 'Record purchase orders from chat or the Deliveries desk, then receive them when the boxes arrive.',
    navItemIds: ['incoming', 'sourcing', 'triage', 'receive', 'imports', 'exceptions'],
    tools: ['draft_po_import', 'import_purchase_order'],
    chatAbility: 'Record purchase orders from chat',
    landingPath: '/incoming',
    prerequisites: [],
    setupSteps: ['Paste or describe a purchase order in chat', 'Scan the tracking when it arrives'],
    keywords: ['purchase order', 'purchase orders', 'po', 'pos', 'receiving', 'inbound', 'deliveries', 'suppliers', 'vendors', 'sourcing'],
    starter: 'I need to record purchase orders',
  },
  {
    id: 'outbound_orders',
    label: 'Outbound orders',
    blurb: 'Record customer orders, then pick, pack and ship them with labels.',
    navItemIds: ['outbound', 'fulfilled', 'label-intake', 'ready-to-pack', 'packer', 'scan-out', 'print-station', 'exceptions'],
    tools: ['draft_manual_order', 'create_manual_order'],
    chatAbility: 'Record orders from chat',
    landingPath: '/shipping/orders',
    prerequisites: [],
    setupSteps: ['Record an order in chat or on the Shipping desk', 'Pick, pack and scan it out'],
    keywords: ['outbound', 'outbound orders', 'sales orders', 'customer orders', 'orders', 'shipping', 'fulfillment', 'packing', 'picking'],
    starter: 'I need to record outbound orders',
  },
  {
    id: 'customer_counter',
    label: 'Customer intake counter',
    blurb: 'A front counter for walk-in customers: sales, local pickup and repair drop-off.',
    navItemIds: ['sales', 'pickup', 'repair'],
    tools: [],
    landingPath: '/dashboard?mode=sales',
    prerequisites: [],
    setupSteps: ['Open the Sales desk at the counter', 'Check customers in for pickup or repair'],
    keywords: ['counter', 'intake counter', 'customer intake', 'walk in', 'walk-in', 'front desk', 'pickup', 'repair', 'point of sale', 'pos counter'],
    starter: 'Set up a customer intake counter',
  },
  {
    id: 'products',
    label: 'Product catalog',
    blurb: 'Your own product catalog: SKUs, titles, photos and identifiers.',
    navItemIds: ['products'],
    tools: [],
    landingPath: '/products',
    prerequisites: [],
    setupSteps: ['Add products by hand or import them'],
    keywords: ['products', 'catalog', 'skus', 'product catalog'],
  },
  {
    id: 'inventory',
    label: 'Inventory & bins',
    blurb: 'Track stock by bin and location.',
    navItemIds: ['inventory'],
    tools: ['locate_product', 'list_location_contents'],
    chatAbility: 'Ask where anything is',
    landingPath: '/inventory',
    prerequisites: [],
    setupSteps: ['Create your locations', 'Put stock away into bins'],
    keywords: ['inventory', 'stock', 'bins', 'locations', 'warehouse'],
  },
  {
    id: 'quality_control',
    label: 'Testing & quality control',
    blurb: 'A QC bench for testing units before they sell.',
    navItemIds: ['testing', 'qc-labels'],
    tools: [],
    landingPath: '/test',
    prerequisites: [],
    setupSteps: ['Test units at the QC bench'],
    keywords: ['testing', 'quality control', 'qc', 'tech', 'test bench'],
  },
  {
    id: 'amazon_fba',
    label: 'Amazon FBA',
    blurb: 'Prepare and ship FBA inbound shipments to Amazon.',
    navItemIds: ['fba'],
    tools: [],
    landingPath: '/fba',
    prerequisites: [{ kind: 'connection', provider: 'amazon', label: 'Connect your Amazon seller account' }],
    setupSteps: ['Connect your Amazon seller account', 'Build FBA shipments'],
    keywords: ['amazon', 'fba', 'amazon fba'],
  },
  {
    id: 'support',
    label: 'Customer support',
    blurb: 'Support tickets and follow-ups next to the orders they are about.',
    navItemIds: ['support'],
    tools: [],
    landingPath: '/support',
    prerequisites: [],
    setupSteps: ['Connect your helpdesk'],
    keywords: ['support', 'tickets', 'helpdesk', 'zendesk'],
  },
  {
    id: 'daily_ops',
    label: 'Daily checklist & reports',
    blurb: 'The start-of-shift checklist, operations monitor, reports and the media library.',
    navItemIds: ['home', 'operations', 'reports', 'plans-live', 'ops-photos', 'stations-live'],
    tools: [],
    landingPath: '/',
    prerequisites: [],
    setupSteps: [],
    keywords: ['daily', 'checklist', 'reports', 'operations', 'monitor', 'photos', 'media library'],
  },
  {
    id: 'automations',
    label: 'Automations',
    blurb: 'Workflow automations built in the Studio.',
    navItemIds: ['studio'],
    tools: [],
    landingPath: '/studio',
    prerequisites: [],
    setupSteps: [],
    keywords: ['automations', 'studio', 'workflows'],
  },
];

const BY_ID: ReadonlyMap<string, CapabilityDef> = new Map(CAPABILITIES.map((c) => [c.id, c]));

export function getCapability(id: string): CapabilityDef | undefined {
  return BY_ID.get(id);
}

/** Every capability an org can switch on (not the base). */
export const UNLOCKABLE_CAPABILITIES: readonly CapabilityDef[] = CAPABILITIES.filter((c) => c.id !== BASE_CAPABILITY_ID);

/** The chat-first home chips, in catalog order. */
export const STARTER_CHIPS: readonly string[] = CAPABILITIES.flatMap((c) => (c.starter ? [c.starter] : []));

const fold = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * What the operator named → one capability. Id or label first, then the
 * longest keyword the text contains (so "ebay listings" beats "listings").
 * `null` when nothing matches — the tool answers with the list instead.
 */
export function resolveCapability(text: string): CapabilityDef | null {
  const q = fold(text);
  if (!q) return null;
  const exact = UNLOCKABLE_CAPABILITIES.find((c) => fold(c.id) === q || fold(c.label) === q);
  if (exact) return exact;
  let best: { def: CapabilityDef; len: number } | null = null;
  const padded = ` ${q} `;
  for (const def of UNLOCKABLE_CAPABILITIES) {
    for (const keyword of [def.label, ...def.keywords]) {
      const k = fold(keyword);
      if (k && padded.includes(` ${k} `) && (!best || k.length > best.len)) best = { def, len: k.length };
    }
  }
  return best?.def ?? null;
}

/**
 * The nav rows this org must NOT see: every row owned only by capabilities
 * that are not active. A row no capability owns is never hidden (fail open —
 * the catalog test keeps every row owned).
 */
export function hiddenNavItemIds(activeCapabilityIds: Iterable<string>): string[] {
  const active = new Set(activeCapabilityIds);
  active.add(BASE_CAPABILITY_ID);
  const visible = new Set<string>();
  const owned = new Set<string>();
  for (const def of CAPABILITIES) {
    for (const id of def.navItemIds) {
      owned.add(id);
      if (active.has(def.id)) visible.add(id);
    }
  }
  return [...owned].filter((id) => !visible.has(id));
}
