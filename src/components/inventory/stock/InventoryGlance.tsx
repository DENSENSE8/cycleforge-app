import Link from 'next/link';
import type { StockScopeCounts } from '@/lib/neon/location-stock-queries';

const STOCK_PATH = '/inventory/stock';

const number = new Intl.NumberFormat('en-US');

interface GlanceCard {
  href: string;
  label: string;
  hint: string;
  value: number;
  face: string;
  figure: string;
}

/** Inventory's landing: four counts, each a door into a stock view that already exists. */
export function InventoryGlance({ counts }: { counts: StockScopeCounts }) {
  const cards: GlanceCard[] = [
    {
      href: STOCK_PATH,
      label: 'Active products',
      hint: 'SKUs with stock on hand',
      value: counts.inStockProducts,
      face: 'bg-surface-inverse text-white',
      figure: 'text-white',
    },
    {
      href: STOCK_PATH,
      label: 'Units on hand',
      hint: 'Across active stock',
      value: counts.inStockUnits,
      face: 'bg-surface-card text-text-default',
      figure: 'text-text-default',
    },
    {
      href: `${STOCK_PATH}?status=low-stock`,
      label: 'Low stock',
      hint: 'At or under the minimum',
      value: counts.lowStockPairs,
      face: 'bg-surface-card text-text-default',
      figure: 'text-text-warning',
    },
    {
      href: `${STOCK_PATH}?status=out-of-stock`,
      label: 'Out of stock',
      hint: 'Placed and empty',
      value: counts.outPairs,
      face: 'bg-surface-card text-text-default',
      figure: 'text-text-danger',
    },
  ];

  return (
    <section className="flex flex-col gap-4 p-4" aria-label="Inventory">
      <div className="grid gap-4 sm:grid-cols-2">
        {cards.map((card) => (
          <Link
            key={card.label}
            href={card.href}
            className={`flex min-h-36 flex-col justify-between rounded-mode-control p-5 ${card.face}`}
          >
            <span className="text-role-caption">{card.label}</span>
            <span className={`text-4xl font-semibold tabular-nums tracking-tight ${card.figure}`}>
              {number.format(card.value)}
            </span>
            <span className="text-role-micro opacity-80">{card.hint}</span>
          </Link>
        ))}
      </div>
      <Link
        href={`${STOCK_PATH}?view=replenish`}
        className="text-role-caption font-medium text-text-default underline-offset-2 hover:underline"
      >
        Needs replenishment
      </Link>
    </section>
  );
}
