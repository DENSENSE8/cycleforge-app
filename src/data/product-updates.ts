/**
 * Staff-facing product-updates catalog — the SoT for the What's-new panel.
 *
 * This is a curated list (newest first), not a git-log dump. Do NOT feed
 * `src/data/release-notes.json` into the staff UI; that file is a changelog
 * artifact. Add a new entry here when a shippable surface lands.
 *
 * See docs/refactors/product-updates-popover.md.
 */

export type ProductUpdateFeature = {
  id: string;
  title: string;
  summary?: string;
  href?: string;
  video?: { mp4: string; webm?: string; poster?: string };
};

export type ProductUpdate = {
  id: string;
  name: string;
  shippedAt: string; // ISO date
  buildSha?: string;
  major: ProductUpdateFeature[];
  minor: ProductUpdateFeature[];
};

export const PRODUCT_UPDATES: ProductUpdate[] = [
  {
    id: '2026-08-13-to-ship-desk',
    name: 'To Ship desk',
    shippedAt: '2026-08-13',
    buildSha: '54a51e955',
    major: [
      {
        id: 'wms-shell',
        title: 'Three-column WMS shell',
        summary:
          'Recents, Process, and Details sit side-by-side on the To Ship desk.',
        href: '/shipping/orders',
      },
      {
        id: 'desk-ledgergrid',
        title: 'Desk-local LedgerGrid',
        summary:
          'The desk mounts to-ship / to-ship-desk. Stations still use entityFamily: \'orders\'.',
        href: '/shipping/orders',
      },
      {
        id: 'csv-import',
        title: 'CSV import stays on the desk',
        summary: 'Open the desk with ?import=csv — staging is unchanged.',
        href: '/shipping/orders?import=csv',
      },
    ],
    minor: [
      {
        id: 'queues-unchanged',
        title: 'Ready-to-Pack and Packing queues unchanged',
      },
      {
        id: 'prefs-not-shared',
        title: 'Station column prefs stay on the orders grid',
        summary:
          'Desk prefs live under to-ship-desk; live orders-grid prefs are not shared.',
      },
      {
        id: 'fork-doc',
        title: 'LedgerGrid fork notes',
        summary: 'See docs/refactors/to-ship-ledgergrid-fork.md',
      },
    ],
  },
];

export function latestProductUpdate(): ProductUpdate | null {
  return PRODUCT_UPDATES[0] ?? null;
}

export function featureCount(u: ProductUpdate): number {
  return u.major.length + u.minor.length;
}
