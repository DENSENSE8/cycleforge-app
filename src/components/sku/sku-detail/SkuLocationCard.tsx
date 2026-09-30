import { MapPin } from '@/components/Icons';
import { StockPairBin } from '@/components/inventory/stock/StockPairBin';
import { sectionLabel } from '@/design-system/tokens/typography/presets';
import type { SkuDetailData } from './sku-detail-types';
import type { SkuDetailController } from './useSkuDetailView';

/**
 * Home tote card — the SKU's home tote (`sku_stock.location`) and the Stock
 * record's own Pair tote picker (`StockPairBin`, `POST /api/update-sku-location`,
 * which also drops the To-ship queue's cached location), then every location
 * the SKU's log has seen it in. Where its stock sits now is the Locations
 * group under it (`StockLocationsGroup`).
 */
export function SkuLocationCard({ c, data }: { c: SkuDetailController; data: SkuDetailData }) {
  const seen = data.locations.filter((loc) => loc !== data.stock.location);
  return (
    <div className="rounded-none bg-surface-card border border-border-soft p-4" data-testid="sku-location-card">
      <h2 className={`${sectionLabel} mb-2`}>
        <MapPin className="inline h-3 w-3 mr-1" />
        Home tote
      </h2>
      <div className="flex flex-wrap items-center gap-2">
        <StockPairBin sku={data.sku} barcode={null} face={null} homeLocation={data.stock.location} onPaired={() => void c.refresh()} />
      </div>
      {seen.length > 0 ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-text-faint">Seen at</span>
          {seen.map((loc) => (
            <span key={loc} className="inline-flex items-center gap-1 rounded-full bg-surface-sunken px-3 py-1 text-xs font-semibold text-text-default">
              <MapPin className="h-3 w-3" />
              {loc}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
