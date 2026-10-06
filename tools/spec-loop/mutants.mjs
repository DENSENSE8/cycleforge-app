/**
 * Planted degradations (SpecMutantV1, Garisek-OS src/lib/loops/spec/types.ts) that prove the spec
 * loop end to end (`pnpm spec:loop --plant`).
 *
 * Each mutant is a deliberate regression applied to the SANDBOX only, never the
 * shared tree. `expect` lists the anchor findings that must catch it (the
 * detector kill check): a mutant no anchor catches means a vacuous anchor.
 * Every active rule with a probe (tools/spec-loop/contracts.mjs) is named by at
 * least one mutant's `rules`; `edits` re-introduce a violation into the CURRENT
 * source, so a `find` that no longer matches fails the plant loudly.
 *
 * Operator brief 2026-10-03: "create hand-rolled mobile bottom buttons that have
 * no reference to the design system" plus "bad and unneeded navigation"; the loop
 * must find them and port them onto the existing primitives.
 */

import { ACCEPTED } from './accepted.mjs';

/** @typedef {{ file: string, find: string, replace: string }} MutantEdit */
/** @typedef {{ anchor: string, rule: string, file: string }} MutantExpectation */
/** @typedef {{ id: string, describe: string, rules?: string[], create?: Record<string, string>, edits?: MutantEdit[], fromCommit?: { commit: string, files: string[] }, expect: MutantExpectation[] }} SpecMutant */

const BOTTOM_BAR = 'src/components/mobile/v2/stock/StockQuickActions.tsx';
const STOCK_LIST = 'src/components/mobile/v2/stock/MobileV2StockLocations.tsx';
const SHORTCUTS_PAGE = 'src/app/m/(shell)/stock/shortcuts/page.tsx';
const SIDEBAR_NAV = 'src/lib/sidebar-navigation.ts';
const NAV_ROLLOUT = 'src/lib/nav/context/rollout.ts';
const LANES = 'src/lib/nav/lanes.ts';
const ORDER_CARD_LIST = 'src/components/outbound/orders/cards/OrderCardList.tsx';

/** @type {SpecMutant[]} */
export const MUTANTS = [
  {
    id: 'hand-rolled-bottom-buttons',
    describe: 'A grounded white bottom bar of raw <button>/<a> with hex and px literals, foreign doors (Labels, Racks) on the stock list, no design-system import.',
    rules: ['ds.port', 'routes.from-tree', 'stock.no-foreign-doors'],
    create: {
      [BOTTOM_BAR]: `'use client';

import { useRouter } from 'next/navigation';

/** Quick actions pinned to the bottom of the stock list. */
export function StockQuickActions() {
  const router = useRouter();
  return (
    <div className="fixed inset-x-0 bottom-0 z-50 flex gap-2 border-t border-gray-200 bg-white p-3 pb-6">
      <a href="/m/labels" className="flex-1 rounded-lg border border-gray-300 px-3 py-3 text-center text-[13px] text-gray-700">
        Labels
      </a>
      <a href="/m/racks" className="flex-1 rounded-lg border border-gray-300 px-3 py-3 text-center text-[13px] text-gray-700">
        Racks
      </a>
      <button
        type="button"
        onClick={() => router.push('/m/scan')}
        className="flex-[2] rounded-lg py-3 text-[15px] font-semibold text-white"
        style={{ background: '#16a34a' }}
      >
        Scan item
      </button>
    </div>
  );
}
`,
    },
    edits: [
      {
        file: STOCK_LIST,
        find: 'data-testid="mobile-v2-stock" data-level={currentChip}>',
        replace: 'data-testid="mobile-v2-stock" data-level={currentChip}>\n      <StockQuickActions />',
      },
      {
        file: STOCK_LIST,
        find: "import ",
        replace: "import { StockQuickActions } from './StockQuickActions';\nimport ",
      },
    ],
    expect: [
      { anchor: 'critique', rule: 'raw <button>', file: BOTTOM_BAR },
      { anchor: 'gate:Lint', rule: 'cf-ui/no-grounded-bottom-bar', file: BOTTOM_BAR },
      { anchor: 'routes', rule: 'literal-path', file: BOTTOM_BAR },
      { anchor: 'contracts', rule: 'stock.no-foreign-doors', file: BOTTOM_BAR },
    ],
  },
  {
    id: 'unneeded-navigation-page',
    describe: 'An unregistered /m/stock/shortcuts hub of hand-rolled links to other parents: a page the route tree does not own.',
    rules: ['routes.from-tree'],
    create: {
      [SHORTCUTS_PAGE]: `import Link from 'next/link';

export default function StockShortcutsPage() {
  return (
    <div className="space-y-2 p-4">
      <Link href="/m/labels" className="block rounded border border-gray-300 bg-white p-3 text-[14px]">
        Print labels
      </Link>
      <Link href="/m/racks" className="block rounded border border-gray-300 bg-white p-3 text-[14px]">
        Racks
      </Link>
      <Link href="/m/stock/locations" className="block rounded border border-gray-300 bg-white p-3 text-[14px]">
        Manage locations
      </Link>
    </div>
  );
}
`,
    },
    expect: [{ anchor: 'routes', rule: 'unregistered-page', file: SHORTCUTS_PAGE }],
  },
  {
    id: 'unused-import',
    describe: 'The most common lint error in the session corpus (unused-imports/no-unused-imports, 238 errors / 48 sessions). The loop must clear it with `eslint --fix` before spending a model call.',
    edits: [
      {
        file: STOCK_LIST,
        find: "import { useMemo, type ReactNode } from 'react';",
        replace: "import { useMemo, type ReactNode } from 'react';\nimport { Children } from 'react';",
      },
    ],
    expect: [{ anchor: 'gate:Lint', rule: 'unused-imports/no-unused-imports', file: STOCK_LIST }],
  },
  {
    id: 'live-feed-row-dropped',
    describe: 'The Operations section loses its Live feed row — the 2026-10-03 state the operator ruled on ("the live feed is not displaying under the operation sidebar").',
    rules: ['nav.live-feed-under-operations'],
    edits: [
      {
        file: SIDEBAR_NAV,
        find: "      { id: 'live-feed', label: 'Live feed', icon: Radar,     to: () => ({ pathname: LIVE_FEED_PATH, params: {} }) },\n",
        replace: '',
      },
    ],
    expect: [{ anchor: 'contracts', rule: 'nav.live-feed-under-operations', file: SIDEBAR_NAV }],
  },
  {
    id: 'pickup-rollout-legacy',
    describe: 'Local Pickup drops out of the contextual rollout, so /pickup falls back to the bare top map — the 2026-10-03 state behind "for example sales does not".',
    rules: ['nav.every-page-contextual-sidebar'],
    edits: [{ file: NAV_ROLLOUT, find: "  pickup: 'contextual',\n", replace: '' }],
    expect: [{ anchor: 'contracts', rule: 'nav.every-page-contextual-sidebar', file: 'src/lib/nav/context/pages.ts' }],
  },
  {
    id: 'warehouse-lane-renamed-inventory',
    describe: 'The Warehouse lane is labelled Inventory again — the name the operator ruled away.',
    rules: ['nav.warehouse-lane'],
    edits: [
      {
        file: LANES,
        find: "{ id: 'inventory', label: 'Warehouse', icon: Warehouse, keywords: ['inventory'] },",
        replace: "{ id: 'inventory', label: 'Inventory', icon: Warehouse, keywords: ['inventory'] },",
      },
    ],
    expect: [{ anchor: 'contracts', rule: 'nav.warehouse-lane', file: LANES }],
  },
  {
    id: 'stock-rack-labels-door',
    describe: 'A design-system Button on the stock list that opens Rack labels through the route-tree builder: no literal, no hand-rolled control — only the foreign-door law catches it.',
    rules: ['stock.no-foreign-doors'],
    edits: [
      {
        file: STOCK_LIST,
        find: "import { withJobReturn } from '@/lib/mobile/nav-trail';",
        replace: "import { withJobReturn } from '@/lib/mobile/nav-trail';\nimport { rackLabelsHref } from '@/lib/nav/route-tree';",
      },
      {
        file: STOCK_LIST,
        find: '<PathChips chips={chips} currentId={currentChip} ariaLabel="Warehouse path" testId="stock-path" />',
        replace:
          '<PathChips chips={chips} currentId={currentChip} ariaLabel="Warehouse path" testId="stock-path" />\n        <Button variant="secondary" size="sm" onClick={() => router.push(rackLabelsHref())}>\n          Rack labels\n        </Button>',
      },
    ],
    expect: [{ anchor: 'contracts', rule: 'stock.no-foreign-doors', file: STOCK_LIST }],
  },
  {
    id: 'sidebar-sort-menu-in-body',
    describe: 'The To-ship card list mounts a status chip rail in its `summary` slot instead of declaring the statuses as facets in its own contextual sidebar — the shape the operator ruled away ("sorting data table information and filtering belongs in the left contextual sidebar"; A4: chips that filter are controls). Id kept from when the planted control was DataTableSortMenu (deleted under A1).',
    rules: ['layout.sidebar-owns-table-controls'],
    edits: [
      {
        file: ORDER_CARD_LIST,
        find: "import { OrderCard } from './OrderCard';",
        replace: "import { OrderCard } from './OrderCard';\nimport { StatusChipRail } from '@/design-system/components/QueueStatusChips';",
      },
      {
        file: ORDER_CARD_LIST,
        find: '      leadSlot={<OrderListLeadSlot />}',
        replace:
          "      leadSlot={<OrderListLeadSlot />}\n      summary={\n        <StatusChipRail\n          chips={[{ id: 'late', label: 'Late', tone: 'danger', count: 0 }]}\n          active={new Set<string>()}\n          onToggle={() => {}}\n          onReset={() => {}}\n          testId=\"order-status-rail\"\n        />\n      }",
      },
    ],
    expect: [{ anchor: 'contracts', rule: 'layout.sidebar-owns-table-controls', file: ORDER_CARD_LIST }],
  },
  // `<ruleId>--plant` of each accepted rule (tools/spec-loop/accepted.mjs).
  ...ACCEPTED.mutants,
];
