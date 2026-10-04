'use client';

/**
 * Stock card quick look (Space): what the card leaves out — every product
 * position on the rack with its own last count and last move, under the rack's
 * newest movement. Built from the rows the page already loaded.
 */

import { CollapseItem } from '@/design-system/components/Collapse';
import { locationStockPositionFace, locationStockRowId, type LocationStockTableRow } from '@/lib/inventory/location-stock-row';
import { formatDateTimePST } from '@/utils/date';
import { stockLastTouch, type StockRowModel } from './stock-card-model';

const SOURCE_LABEL: Readonly<Record<LocationStockTableRow['source'], string>> = {
  bin: 'Counted bin',
  unit: 'Units',
  exception: 'SKU exception',
  empty: 'Empty',
};

const stamp = (iso: string | null) => (iso && !Number.isNaN(Date.parse(iso)) ? `${formatDateTimePST(iso)} PT` : '—');

export function StockRackPeek({ model, testIdPrefix }: { model: StockRowModel; testIdPrefix: string }) {
  const last = stockLastTouch(model.rows);
  return (
    <CollapseItem>
      <div data-testid={`${testIdPrefix}-peek`} className="flex flex-col gap-2 pt-2 text-role-data">
        <p className="text-text-muted">
          Last movement{' '}
          <span className="font-medium text-text-default">{last ? `${last.verb} ${stamp(last.iso)}` : 'None on record'}</span>
        </p>
        <dl className="grid grid-cols-[auto_auto_auto_auto_1fr] gap-x-6 gap-y-1">
          <div className="contents text-text-muted">
            <dt>Position</dt>
            <dt>SKU</dt>
            <dt className="text-right">Qty</dt>
            <dt>Last counted</dt>
            <dt>Last moved</dt>
          </div>
          {model.rows.map((item) => (
            <div key={locationStockRowId(item)} className="contents" data-testid={`${testIdPrefix}-peek-position`}>
              <dd className="min-w-0 truncate font-medium text-text-default" title={SOURCE_LABEL[item.source]}>
                {locationStockPositionFace(item) ?? 'No position'}
              </dd>
              <dd className="min-w-0 truncate font-mono text-text-default">{item.sku || '—'}</dd>
              <dd className="text-right font-semibold tabular-nums text-text-default">{item.qty}</dd>
              <dd className="min-w-0 truncate tabular-nums text-text-muted">{stamp(item.last_counted)}</dd>
              <dd className="min-w-0 truncate tabular-nums text-text-muted">{stamp(item.last_moved)}</dd>
            </div>
          ))}
        </dl>
      </div>
    </CollapseItem>
  );
}
