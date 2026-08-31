/**
 * Navigation command vocabulary — `CMD-GO-*` stickers that move an operator
 * between surfaces without touching a mouse.
 *
 * Sibling of {@link import('./station-command-codes')} (session-mode commands),
 * deliberately a SECOND registry rather than a third axis on the first: a
 * session command changes what the CURRENT surface does with the next scan; a
 * nav command changes WHICH surface the operator is on. One `mode` field could
 * not express both without every consumer switching on a discriminator anyway.
 *
 * Behavior (what a scan does) is owned HERE. Tenant `reason_codes` rows
 * (`flow_context = 'station_command'`) exist for Admin visibility, relabel and
 * 2×1" print — inventing a row in Admin does NOT arm a new jump.
 *
 * Targets are named as `SIDEBAR_PAGE_NAV` page + child ids, never as literal
 * URLs: that registry already owns every route, its `?view=`/`?mode=` delta and
 * its permission gate, so a nav sticker inherits all three instead of forking a
 * fourth copy of the vocabulary. Resolution lives in `nav-command-target.ts`
 * (this file stays free of the nav graph so it is pure and node-testable).
 *
 * Charset is `[A-Z0-9-]` ONLY. An HID wedge running the wrong keyboard country
 * drops `:` `/` `.` and upper-cases the rest — the same failure that produced
 * the `FLATTENED_MOBILE_LINK_RE` recovery arm in `barcode-routing.ts`. Codes
 * that survive that mangling need a recovery arm they can never fail, which is
 * what {@link squashCommandCode} is: every lookup happens on the squashed form,
 * so `CMD-GO-QC`, `cmd go qc` and `CMDGOQC` are one row.
 */

/** Every string in this vocabulary starts here. Claimed wholesale — see below. */
export const NAV_COMMAND_PREFIX = 'CMD' as const;

/**
 * Note what is NOT on this interface: a `requires` field.
 *
 * It was declared here for the first two codes and that was a latent drift bug.
 * A hand-copied permission string is a second answer to a question
 * `SIDEBAR_PAGE_NAV` already answers, and the copy goes stale silently — the
 * page's gate changes, the sticker keeps the old one, and a jump is either
 * refused for an operator who should have it or allowed for one who should not.
 * The gate is DERIVED instead: `navCommandPermission()` in
 * `nav-command-target.ts` reads `child.requires ?? page.requires`.
 */
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

/**
 * The closed registry.
 *
 * Phase 1 ships the Testing pair only — Quality Control and Ready to Pack are
 * `SIDEBAR_PAGE_NAV` children `testing` / `shipping` of page `tech`, i.e.
 * `/test?view=testing` and `/test` with `view` cleared. The rest of the planned
 * vocabulary (`docs/todo/universal-scan-router-PLAN.md` §4) lands per surface,
 * each with its own host verification — a sticker whose destination has not
 * been checked is a jump into a page nobody armed.
 */
export const NAV_COMMAND_CODES: readonly NavCommandDef[] = [
  // ── Scan stations (the floor) ─────────────────────────────────────────────
  // These are the jumps that earn a physical sticker: an operator with product
  // in both hands, moving between benches.
  { code: 'CMD-GO-ARRIVAL', label: 'Go · Arrival',         pageId: 'triage',   childId: null,       sortOrder: 10 },
  { code: 'CMD-GO-UNBOX',   label: 'Go · Unbox',           pageId: 'receive',  childId: null,       sortOrder: 20 },
  { code: 'CMD-GO-QC',      label: 'Go · Quality Control', pageId: 'tech',     childId: 'testing',  sortOrder: 30 },
  { code: 'CMD-GO-READY',   label: 'Go · Ready to Pack',   pageId: 'tech',     childId: 'shipping', sortOrder: 40 },
  { code: 'CMD-GO-PACK',    label: 'Go · Packing',         pageId: 'packer',   childId: null,       sortOrder: 50 },
  { code: 'CMD-GO-SCANOUT', label: 'Go · Scan out',        pageId: 'scan-out', childId: null,       sortOrder: 60 },
  { code: 'CMD-GO-PICKUP',  label: 'Go · Local Pickup',    pageId: 'pickup',   childId: null,       sortOrder: 70 },
  { code: 'CMD-GO-REPAIR',  label: 'Go · Repair',          pageId: 'repair',   childId: null,       sortOrder: 80 },
  { code: 'CMD-GO-COUNTER', label: 'Go · Counter',         pageId: 'sales',    childId: 'counter',  sortOrder: 90 },

  // ── Desks the floor hands off to ──────────────────────────────────────────
  { code: 'CMD-GO-INBOUND',  label: 'Go · Inbound',    pageId: 'incoming',  childId: null,      sortOrder: 110 },
  { code: 'CMD-GO-ORDERS',   label: 'Go · Orders',     pageId: 'outbound',  childId: 'orders',  sortOrder: 130 },
  { code: 'CMD-GO-FBA',      label: 'Go · Amazon prep',pageId: 'outbound',  childId: 'fba',     sortOrder: 140 },
  { code: 'CMD-GO-INVENTORY',label: 'Go · Inventory',  pageId: 'inventory', childId: 'ledger',  sortOrder: 150 },
  { code: 'CMD-GO-LOCATIONS',label: 'Go · Locations',  pageId: 'inventory', childId: 'locations', sortOrder: 160 },
  { code: 'CMD-GO-PRODUCTS', label: 'Go · Products',   pageId: 'products',  childId: 'catalog', sortOrder: 170 },
  { code: 'CMD-GO-SUPPORT',  label: 'Go · Support',    pageId: 'support',   childId: 'tickets', sortOrder: 180 },
  { code: 'CMD-GO-OPS',      label: 'Go · Operations', pageId: 'operations',childId: 'live',    sortOrder: 190 },
  { code: 'CMD-GO-HOME',     label: 'Go · Home',       pageId: 'home',      childId: 'daily',   sortOrder: 200 },
] as const;

// Deliberately ABSENT, so the omissions read as decisions rather than oversights:
//   • `/receiving/history` — has no `SIDEBAR_PAGE_NAV` entry, so a sticker for it
//     would have to carry a literal URL. That is the exact fork this registry
//     exists to avoid; it gets a code when it gets a nav entry.
//   • `/wipe` — intentionally out of master nav until the station UX ships
//     (see `sidebar-navigation.ts`). A scannable jump to a surface hidden from
//     the nav would route around that decision.
//   • `/studio`, `/settings`, `/admin` — build/configure surfaces. Nothing about
//     them is hands-full work, which is the only thing a sticker is for.
//   • `CMD-GO-LABELS` — RETIRED 2026-08-30 with the Labels tab. Needing a label
//     is a STATE in the To-ship queue now ("Needs label"), not a destination, so
//     there is nothing left for the sticker to jump TO. Repointing it at the
//     page would have landed the operator on To ship under a label that says
//     Labels, which is worse than a code that no longer scans. If a printed
//     sticker with this code is still on the floor, it now reads as an unknown
//     code — which is the honest answer.

/**
 * Canonical lookup form: upper-case, every non-alphanumeric dropped.
 *
 * This is the whole keyboard-country defence. Do not "fix" a mangled scan at
 * the call site — normalise here so one row answers for every form of its own
 * string.
 */
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

/**
 * True for anything in the `CMD-` namespace, registered or not.
 *
 * The namespace is claimed WHOLESALE, and that is a correctness rule rather
 * than tidiness: an unrecognised `CMD-…` string reaching `classifyInput` is
 * typed `serial_partial`, and the tech bench then persists a sticker into
 * `tech_serial_numbers` — the same class of defect the `HANDLE` type was added
 * to stop. Callers use this to answer "not a serial" for the whole family, and
 * nack the ones they cannot act on.
 */
export function isCommandNamespace(raw: string | null | undefined): boolean {
  const value = String(raw ?? '').trim();
  // The literal sticker form — a hyphen after CMD is what makes this a claim on
  // a namespace rather than a claim on three letters. Without it a genuine
  // manufacturer serial beginning `CMD…` would be swallowed as a command,
  // trading one misclassification for another.
  if (/^CMD-[A-Z0-9][A-Z0-9-]*$/i.test(value)) return true;
  // Mangled recovery: only the `CMD-GO-` sub-family, whose squashed form
  // (`CMDGO…`) is long and specific enough that nothing else emits it.
  return squashCommandCode(value).startsWith(`${NAV_COMMAND_PREFIX}GO`);
}

/** All registered nav commands, in sticker-sheet order. */
export function listNavCommands(): NavCommandDef[] {
  return [...NAV_COMMAND_CODES].sort((a, b) => a.sortOrder - b.sortOrder);
}
