/** Tier-1 paint content order — declared LCP surfaces + forbidden `ssr: */

export type PaintPriority = 'chrome' | 'primary' | 'context' | 'trailing';

/** Ordered paint priorities — marks and HUD assert this sequence. */
export const PAINT_PRIORITY_ORDER: readonly PaintPriority[] = [
  'chrome',
  'primary',
  'context',
  'trailing',
] as const;

interface Tier1PaintRoute {
  /** Canonical path (after redirects). */
  path: string;
  /** Lighthouse / legacy alias paths that land here. */
  aliases?: readonly string[];
  /** Human label for HUD / docs. */
  label: string;
  /** Declared LCP surface — must SSR or have an SSR stand-in. */
  lcpSurface: PaintPriority;
  /** Geometry skeleton module (route `loading.tsx` / dynamic fallback). */
  skeleton?: string;
  /**
   * Modules that must NOT gate the LCP element behind `ssr: false` without a
   * sibling SSR stand-in. Guard scans these files.
   */
  lcpHosts: readonly string[];
  /** Relative paint-mark route prefix (`unbox`, `orders`, …). */
  markRoute: string;
}

/**
 * Operator-critical floors. Paths match the live desk after outbound moved to
 * `/shipping/orders` and Unbox graduated from `/receiving`.
 */
const TIER1_PAINT_ORDER: readonly Tier1PaintRoute[] = [
  {
    path: '/',
    label: 'Daily',
    lcpSurface: 'primary',
    lcpHosts: ['src/features/home/DailyAgenda.tsx'],
    markRoute: 'daily',
  },
  {
    path: '/shipping/orders',
    aliases: ['/dashboard'],
    label: 'To-ship desk',
    lcpSurface: 'primary',
    skeleton: 'src/components/dashboard/OrdersQueueFirstPaint.tsx',
    lcpHosts: [
      'src/components/dashboard/DashboardOrdersView.tsx',
      'src/components/unshipped/UnshippedTable.tsx',
      'src/components/outbound/orders/OutboundOrdersDesk.tsx',
      'src/components/outbound/orders/cards/OrderCardList.tsx',
    ],
    markRoute: 'orders',
  },
  {
    path: '/unbox',
    aliases: ['/receiving'],
    label: 'Unbox',
    lcpSurface: 'primary',
    /** Route loading cover. */
    skeleton: 'src/design-system/components/UniversalLoader.tsx',
    lcpHosts: [
      'src/components/receiving/unbox/UnboxLineWorkspace.tsx',
    ],
    markRoute: 'unbox',
  },
  {
    path: '/incoming',
    label: 'Incoming',
    lcpSurface: 'primary',
    skeleton: 'src/components/receiving/incoming/IncomingFirstPaint.tsx',
    lcpHosts: [
      'src/components/receiving/incoming/IncomingFirstPaint.tsx',
      'src/components/receiving/ReceivingSurfacePage.tsx',
    ],
    markRoute: 'incoming',
  },
  {
    path: '/triage',
    label: 'Arrival',
    lcpSurface: 'primary',
    lcpHosts: ['src/components/receiving/ReceivingSurfacePage.tsx'],
    markRoute: 'triage',
  },
  {
    path: '/test',
    aliases: ['/tech'],
    label: 'Quality Control',
    lcpSurface: 'primary',
    lcpHosts: [
      'src/components/tech/TechSurfacePage.tsx',
      'src/components/tech/TechPageContent.tsx',
    ],
    markRoute: 'test',
  },
  {
    path: '/pick',
    label: 'Picker',
    lcpSurface: 'primary',
    lcpHosts: [
      'src/components/pick/PickSurfacePage.tsx',
      'src/components/pick/PickPageContent.tsx',
    ],
    markRoute: 'pick',
  },
  {
    path: '/search',
    label: 'Search',
    lcpSurface: 'primary',
    /** Header find + the `?sel=` record body. */
    lcpHosts: [
      'src/app/search/page.tsx',
      'src/components/search/SearchPrimaryPaintShell.tsx',
      'src/components/search/dossier/SearchOrderDossier.tsx',
      'src/components/layout/GlobalHeaderSearch.tsx',
    ],
    markRoute: 'search',
  },
  {
    path: '/packer',
    aliases: ['/pack'],
    label: 'Pack',
    lcpSurface: 'primary',
    lcpHosts: ['src/components/packer/PackerSurfacePage.tsx'],
    markRoute: 'pack',
  },
  {
    path: '/signin',
    label: 'Sign in',
    lcpSurface: 'primary',
    lcpHosts: [],
    markRoute: 'signin',
  },
] as const;

export function paintMarkId(route: string, priority: PaintPriority): string {
  return `${route}:${priority}`;
}

function resolveTier1Route(path: string): Tier1PaintRoute | undefined {
  const normalized = path.split('?')[0] || path;
  return TIER1_PAINT_ORDER.find(
    (r) => r.path === normalized || r.aliases?.includes(normalized),
  );
}
