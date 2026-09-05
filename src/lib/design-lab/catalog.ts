/**
 * Design Lab catalog — the list of viewpoints the reskin has to survive.
 *
 * These are DEEP LINKS INTO THE REAL APP, not a component showroom. The lab
 * proves a reskin by opening `/pack` against QA fixtures under `before` and
 * again under `after`; the old `src/app/design-demo` zoo was deleted precisely
 * because a fake gallery cannot show a scan focus trap or a slot-table sort.
 *
 * Two of the three sections are DERIVED, so a new surface joins the lab without
 * anyone remembering to add it here:
 *   - floor stations come from SCAN_STATION_OVERLAY_COHORT,
 *   - desk coverage is checked against PRODUCT_TABLES by catalog.test.ts —
 *     every product table is either routed below or listed in
 *     DESK_TABLES_WITHOUT_ROUTE with a reason.
 *
 * Mobile is hand-listed: `/m/*` is a separate frame with no cohort registry.
 */

import { SCAN_STATION_OVERLAY_COHORT } from '@/lib/station/scan-station-overlay-cohort';
import { PRODUCT_TABLES } from '@/lib/tables/table-catalog';

export type DesignLabSection = 'stations' | 'desks' | 'composers' | 'mobile';

export interface DesignLabViewpoint {
  /** Stable id — the key a sign-off note is filed under. */
  id: string;
  section: DesignLabSection;
  label: string;
  /** Real product route, opened with the lab's reskin applied. */
  route: string;
  /** What the operator has to be able to still DO under the candidate skin. */
  exercise: string;
  /** Slot-table family this viewpoint covers, where it mounts one. */
  tableId?: string;
}

export const DESIGN_LAB_SECTION_LABELS: Record<DesignLabSection, string> = {
  stations: 'Floor stations',
  desks: 'Desks · slot tables',
  composers: 'Composers · the mouth',
  mobile: 'Handheld (/m)',
};

/**
 * Floor stations — derived from the overlay cohort so the lab and the eval
 * runner can never disagree about which stations exist.
 */
const STATION_VIEWPOINTS: readonly DesignLabViewpoint[] = SCAN_STATION_OVERLAY_COHORT.map(
  (member) => ({
    id: `station:${member.id}`,
    section: 'stations' as const,
    label: member.label,
    route: member.route,
    exercise:
      'Scan a QA fixture, open the focused overlay, confirm the browse side stays legible underneath.',
  }),
);

/**
 * Desks. `tableId` ties the row to a PRODUCT_TABLES family so catalog.test.ts
 * can prove coverage; the route is where an operator actually meets it.
 */
const DESK_VIEWPOINTS: readonly DesignLabViewpoint[] = [
  {
    id: 'desk:orders',
    section: 'desks',
    label: 'To-ship',
    route: '/shipping/orders',
    tableId: 'orders',
    exercise: 'Click every DATA header to sort; open ship-by in-cell; open the filter menu.',
  },
  {
    id: 'desk:exceptions',
    section: 'desks',
    label: 'Exceptions',
    route: '/shipping/exceptions',
    tableId: 'orders',
    exercise: 'Same compound engine as To-ship; held-order row source. Sibling-diff pair.',
  },
  {
    id: 'desk:incoming',
    section: 'desks',
    label: 'Incoming POs',
    route: '/incoming',
    tableId: 'incoming',
    exercise: 'Sort, filter, and open the Add-inbound composer.',
  },
  {
    id: 'desk:receiving',
    section: 'desks',
    label: 'Receiving · Unbox history',
    route: '/receiving',
    tableId: 'receiving',
    exercise: 'Read a dense compound row: thumb, two-line title, qty · condition · notes.',
  },
  {
    id: 'desk:catalog',
    section: 'desks',
    label: 'Products catalog',
    route: '/products',
    tableId: 'catalog',
    exercise: 'Scan the grid for image-column contrast against the new canvas.',
  },
  {
    id: 'desk:inventory-units',
    section: 'desks',
    label: 'Inventory units',
    route: '/inventory/units',
    tableId: 'inventory-units',
    exercise: 'Status pills at volume — the densest tone test in the app.',
  },
  {
    id: 'desk:bins',
    section: 'desks',
    label: 'Warehouse bins',
    route: '/inventory/bins',
    tableId: 'bins',
    exercise: 'Bin codes in mono; check hairline rules survive the reskin.',
  },
  {
    id: 'desk:tech-all',
    section: 'desks',
    label: 'Tech · All',
    route: '/tech',
    tableId: 'tech-all',
    exercise: 'Triage queue with assignment popovers open.',
  },
  {
    id: 'desk:repair',
    section: 'desks',
    label: 'Repair queue',
    route: '/repair',
    tableId: 'repair',
    exercise: 'Long-running rows with warning/danger tones.',
  },
  {
    id: 'desk:pickup',
    section: 'desks',
    label: 'Local pickup',
    route: '/pickup',
    tableId: 'pickup',
    exercise: 'Small queue — check an empty-ish grid still reads as a surface.',
  },
  {
    id: 'desk:unfound',
    section: 'desks',
    label: 'Unfound queue',
    route: '/receiving/unfound',
    tableId: 'unfound',
    exercise: 'Exception rows — danger tone at rest, not just on hover.',
  },
  {
    id: 'desk:tracking-exceptions',
    section: 'desks',
    label: 'Tracking exceptions',
    route: '/tracking-exceptions',
    tableId: 'tracking-exceptions',
    exercise: 'Mixed carrier chips against the reskinned accent.',
  },
  {
    id: 'desk:ready',
    section: 'desks',
    label: 'Recently tested units',
    route: '/test',
    tableId: 'ready',
    exercise: 'The Testing station browse side — desk table inside station chrome.',
  },
  {
    id: 'desk:warranty',
    section: 'desks',
    label: 'Warranty claims',
    route: '/warehouse/rma',
    tableId: 'warranty',
    exercise: 'Claim states across the full status vocabulary.',
  },
  {
    id: 'desk:catalog-link',
    section: 'desks',
    label: 'Review · Listing match',
    route: '/review',
    tableId: 'catalog-link',
    exercise: 'Side-by-side match cards — the busiest surface-on-surface nest.',
  },
  {
    id: 'desk:import-exception',
    section: 'desks',
    label: 'Review · Missing item number',
    route: '/review',
    tableId: 'import-exception',
    exercise: 'Same route, exception tab — confirm the tab strip still separates.',
  },
  {
    id: 'desk:orders-import',
    section: 'desks',
    label: 'Order import staging',
    route: '/shipping/orders',
    tableId: 'orders-import',
    exercise: 'Staging grid opened from the To-ship intake.',
  },
  {
    id: 'desk:shortage-coverage-import',
    section: 'desks',
    label: 'Shortage coverage import',
    route: '/shipping/shortage',
    tableId: 'shortage-coverage-import',
    exercise: 'Coverage staging — numeric columns and tabular figures.',
  },
  {
    id: 'desk:my-day',
    section: 'desks',
    label: 'Home · Today',
    route: '/',
    tableId: 'my-day',
    exercise: 'The first surface a staffer sees each shift.',
  },
  {
    id: 'desk:audit-log',
    section: 'desks',
    label: 'Audit log',
    route: '/settings/audit',
    tableId: 'audit-log',
    exercise: 'Read a dense audit row; click DATA headers to sort.',
  },
];

/**
 * Product tables with no operator route of their own yet. Listed so
 * catalog.test.ts can prove nothing was silently dropped — a table here is a
 * KNOWN gap, not an oversight. Route one and delete its line.
 */
export const DESK_TABLES_WITHOUT_ROUTE: Readonly<Record<string, string>> = {
  daily: 'Daily checks — mounts inside a shift widget, no standalone desk route.',
  tasks: 'My tasks — mounts in the Home inbox, covered by desk:my-day.',
  sessions: 'Work sessions — settings-side reporting surface, not a desk.',
  // Both reporting sheets are in PRODUCT_TABLES but have no stable desk route
  // yet, so they are declared gaps rather than viewpoints. Route one and delete
  // its line. The tripwire enforces BOTH directions: a table with neither a
  // route nor a gap line fails, and so does a gap line for a table that does
  // not exist — which is how this pair churned twice on 2026-09-02 while their
  // field-catalog modules were landing.
  'sku-velocity': 'SKU velocity — reporting sheet under /reports, route not stable yet.',
  'dead-stock': 'Dead stock — reporting sheet under /reports, route not stable yet.',
  'inventory-events': 'Inventory ledger activity — mounts inside inventory, no standalone desk route yet.',
};

const COMPOSER_VIEWPOINTS: readonly DesignLabViewpoint[] = [
  {
    id: 'composer:scan-out',
    section: 'composers',
    label: 'Scan-out mouth + mode row',
    route: '/shipping/scan-out',
    exercise:
      'Cycle composer modes; commit a scan and read WeldedFeedbackPanel on the reaction slot.',
  },
  {
    id: 'composer:incoming-add',
    section: 'composers',
    label: 'Incoming · Add-inbound (desk adapter)',
    route: '/incoming',
    exercise: 'Open the Add-inbound composer — same mouth, desk chrome around it.',
  },
  {
    id: 'composer:unbox',
    section: 'composers',
    label: 'Unbox mouth (dumb station face)',
    route: '/unbox',
    exercise: 'showModeFaces={false} — confirm the context ring still reads at a glance.',
  },
];

const MOBILE_VIEWPOINTS: readonly DesignLabViewpoint[] = [
  {
    id: 'mobile:home',
    section: 'mobile',
    label: 'Handheld home',
    route: '/m/home',
    exercise: 'Thumb-reach chrome on the reskinned canvas.',
  },
  {
    id: 'mobile:scan',
    section: 'mobile',
    label: 'Handheld scan',
    route: '/m/scan',
    exercise: 'Scan field contrast in warehouse lighting.',
  },
  {
    id: 'mobile:unbox',
    section: 'mobile',
    label: 'Handheld unbox',
    route: '/m/unbox',
    exercise: 'Item record: padded thumb, two-line title, qty · condition · notes.',
  },
  {
    id: 'mobile:pack',
    section: 'mobile',
    label: 'Handheld pack',
    route: '/m/pack',
    exercise: 'Pack flow end to end on a phone viewport.',
  },
  {
    id: 'mobile:receiving',
    section: 'mobile',
    label: 'Handheld receiving',
    route: '/m/receiving',
    exercise: 'PO list density under the new border tokens.',
  },
];

export const DESIGN_LAB_VIEWPOINTS: readonly DesignLabViewpoint[] = [
  ...STATION_VIEWPOINTS,
  ...DESK_VIEWPOINTS,
  ...COMPOSER_VIEWPOINTS,
  ...MOBILE_VIEWPOINTS,
];

export const DESIGN_LAB_SECTIONS: readonly DesignLabSection[] = [
  'stations',
  'desks',
  'composers',
  'mobile',
];

export function viewpointsForSection(section: DesignLabSection): DesignLabViewpoint[] {
  return DESIGN_LAB_VIEWPOINTS.filter((v) => v.section === section);
}

/** Every PRODUCT_TABLES id — the coverage denominator for catalog.test.ts. */
export function productTableIds(): string[] {
  return PRODUCT_TABLES.map((t) => t.tableId);
}
