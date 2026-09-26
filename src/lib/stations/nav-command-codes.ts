/** Navigation command vocabulary — `CMD-GO-*` stickers that move an operator between surfaces without touching a mouse. */

/** Every string in this vocabulary starts here. Claimed wholesale — see below. */
const NAV_COMMAND_PREFIX = 'CMD' as const;

/** Note what is NOT on this interface: */
export interface NavCommandDef {
  /** Exact string encoded on the sticker. */
  code: string;
  /** Human label — Admin catalog + the 2×1" face center. */
  label: string;
  /** `SIDEBAR_PAGE_NAV.id` of the destination page. */
  pageId: string;
  /** `SidebarChildPage.id` (the L2 mode), or null to land on the page href. */
  childId: string | null;
  sortOrder: number;
}

/** The closed registry. */
export const NAV_COMMAND_CODES: readonly NavCommandDef[] = [
  // ── Scan stations (the floor) ─────────────────────────────────────────────
  // These are the jumps that earn a physical sticker: an operator with product
  // in both hands, moving between benches.
  { code: 'CMD-GO-ARRIVAL', label: 'Go · Arrival',         pageId: 'triage',   childId: null,       sortOrder: 10 },
  { code: 'CMD-GO-UNBOX',   label: 'Go · Unbox',           pageId: 'receive',  childId: null,       sortOrder: 20 },
  { code: 'CMD-GO-QC',      label: 'Go · Quality Control', pageId: 'tech',     childId: 'testing',  sortOrder: 30 },
  { code: 'CMD-GO-READY',   label: 'Go · Picker',          pageId: 'tech',     childId: 'shipping', sortOrder: 40 },
  { code: 'CMD-GO-PACK',    label: 'Go · Packing',         pageId: 'packer',   childId: null,       sortOrder: 50 },
  { code: 'CMD-GO-SCANOUT', label: 'Go · Scan out',        pageId: 'scan-out', childId: null,       sortOrder: 60 },
  { code: 'CMD-GO-PICKUP',  label: 'Go · Local Pickup',    pageId: 'pickup',   childId: null,       sortOrder: 70 },
  { code: 'CMD-GO-REPAIR',  label: 'Go · Repair Service',  pageId: 'repair',   childId: null,       sortOrder: 80 },
  { code: 'CMD-GO-COUNTER', label: 'Go · Counter',         pageId: 'sales',    childId: 'counter',  sortOrder: 90 },

  // ── Desks the floor hands off to ──────────────────────────────────────────
  { code: 'CMD-GO-INBOUND',  label: 'Go · Inbound',    pageId: 'incoming',  childId: null,      sortOrder: 110 },
  { code: 'CMD-GO-ORDERS',   label: 'Go · Orders',     pageId: 'outbound',  childId: 'orders',  sortOrder: 130 },
  // FBA became its OWN Outbound lane row (`fba`, `/shipping/fba`) when the tab left the To-ship band, so `outbound/fba` named a child that…
  { code: 'CMD-GO-FBA',      label: 'Go · Amazon prep',pageId: 'fba',       childId: 'plan',    sortOrder: 140 },
  { code: 'CMD-GO-INVENTORY',label: 'Go · Inventory',  pageId: 'inventory', childId: 'ledger',  sortOrder: 150 },
  { code: 'CMD-GO-LOCATIONS',label: 'Go · Locations',  pageId: 'inventory', childId: 'locations', sortOrder: 160 },
  // Was `catalog` (Reference) until 2026-09-15, when that tab was removed. The
  // sticker names the DESK, so it lands on the desk's default mode — Manuals —
  // the same shape as CMD-GO-INVENTORY → `ledger`.
  { code: 'CMD-GO-PRODUCTS', label: 'Go · Products',   pageId: 'products',  childId: 'manuals', sortOrder: 170 },
  { code: 'CMD-GO-SUPPORT',  label: 'Go · Support',    pageId: 'support',   childId: 'tickets', sortOrder: 180 },
  { code: 'CMD-GO-OPS',      label: 'Go · Operations', pageId: 'operations',childId: 'live',    sortOrder: 190 },
  // `home` is MODELESS — Today and Tasks were unmounted and Daily is the page
  // itself, so the entry declares no children and `home/daily` named one that
  // does not exist. `childId: null` lands on `/`, which IS Daily.
  { code: 'CMD-GO-HOME',     label: 'Go · Home',       pageId: 'home',      childId: null,      sortOrder: 200 },
] as const;

// Deliberately ABSENT, so the omissions read as decisions rather than oversights:

/** Canonical lookup form: */
export function squashCommandCode(raw: string | null | undefined): string {
  return String(raw ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

const BY_SQUASHED = new Map(
  NAV_COMMAND_CODES.map((c) => [squashCommandCode(c.code), c] as const),
);

/** Parse a raw scan into a nav command, or null when it is not one. */
export function parseNavCommand(raw: string | null | undefined): NavCommandDef | null {
  return BY_SQUASHED.get(squashCommandCode(raw)) ?? null;
}

/** True for anything in the `CMD-` namespace, registered or not. */
export function isCommandNamespace(raw: string | null | undefined): boolean {
  const value = String(raw ?? '').trim();
  // The literal sticker form — a hyphen after CMD is what makes this a claim on a namespace rather than a claim on three letters.
  if (/^CMD-[A-Z0-9][A-Z0-9-]*$/i.test(value)) return true;
  // Mangled recovery: only the `CMD-GO-` sub-family, whose squashed form
  // (`CMDGO…`) is long and specific enough that nothing else emits it.
  return squashCommandCode(value).startsWith(`${NAV_COMMAND_PREFIX}GO`);
}

/** All registered nav commands, in sticker-sheet order. */
export function listNavCommands(): NavCommandDef[] {
  return [...NAV_COMMAND_CODES].sort((a, b) => a.sortOrder - b.sortOrder);
}
