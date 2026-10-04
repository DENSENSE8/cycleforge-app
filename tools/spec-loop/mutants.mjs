/**
 * Planted degradations for proving the spec loop end to end (`node scripts/spec-loop.mjs --plant`).
 *
 * Each mutant is a deliberate regression applied to the SANDBOX only, never the
 * shared tree. `expect` lists the anchor findings that must catch it (the
 * detector kill check): a mutant no anchor catches means a vacuous anchor.
 *
 * Operator brief 2026-10-03: "create hand-rolled mobile bottom buttons that have
 * no reference to the design system" plus "bad and unneeded navigation"; the loop
 * must find them and port them onto the existing primitives.
 */

/** @typedef {{ file: string, find: string, replace: string }} MutantEdit */
/** @typedef {{ anchor: string, rule: string, file: string }} MutantExpectation */
/** @typedef {{ id: string, why: string, create?: Record<string, string>, edits?: MutantEdit[], expect: MutantExpectation[] }} Mutant */

const BOTTOM_BAR = 'src/components/mobile/v2/stock/StockQuickActions.tsx';
const STOCK_LIST = 'src/components/mobile/v2/stock/MobileV2StockLocations.tsx';
const SHORTCUTS_PAGE = 'src/app/m/(shell)/stock/shortcuts/page.tsx';

/** @type {Mutant[]} */
export const MUTANTS = [
  {
    id: 'hand-rolled-bottom-buttons',
    why: 'A grounded white bottom bar of raw <button>/<a> with hex and px literals, foreign doors (Labels, Racks) on the stock list, no design-system import.',
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
    why: 'An unregistered /m/stock/shortcuts hub of hand-rolled links to other parents: a page the route tree does not own.',
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
    why: 'The most common lint error in the session corpus (unused-imports/no-unused-imports, 238 errors / 48 sessions). The loop must clear it with `eslint --fix` before spending a model call.',
    edits: [
      {
        file: STOCK_LIST,
        find: "import { useMemo, type ReactNode } from 'react';",
        replace: "import { useMemo, type ReactNode } from 'react';\nimport { Children } from 'react';",
      },
    ],
    expect: [{ anchor: 'gate:Lint', rule: 'unused-imports/no-unused-imports', file: STOCK_LIST }],
  },
];
