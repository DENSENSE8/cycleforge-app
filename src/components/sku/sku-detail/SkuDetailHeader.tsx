import { ChevronLeft, Check, Copy } from '@/components/Icons';
import { IconButton } from '@/design-system/primitives';
import { DeskRailChromeRow } from '@/components/right-rail/DeskRailChromeRow';
import { PaneHeaderLabel } from '@/components/ui/pane-header';
import { cardTitle, monoValue } from '@/design-system/tokens/typography/presets';
import type { SkuDetailData } from './sku-detail-types';
import type { SkuDetailController } from './useSkuDetailView';

/** Top bar for both faces of {@link SkuDetailView} — and they are different jobs, so they wear different chrome. */
function SkuCopyableSku({ c, data }: { c: SkuDetailController; data: SkuDetailData }) {
  return (
    <button
      onClick={() => c.handleCopy(data.sku, 'sku')}
      className={`ds-raw-button ${monoValue} text-role-caption text-text-soft hover:text-blue-600 transition-colors flex items-center gap-1`}
    >
      {data.sku}
      {c.copiedField === 'sku' ? (
        <Check className="h-3 w-3 text-emerald-500" />
      ) : (
        <Copy className="h-3 w-3" />
      )}
    </button>
  );
}

function SkuPriceBadge({ data }: { data: SkuDetailData }) {
  if (data.ecwid?.price == null) return null;
  return (
    <div className="text-right">
      <p className="text-lg font-semibold text-text-default">${data.ecwid.price.toFixed(2)}</p>
      <p
        className={`text-role-micro font-semibold ${data.ecwid.inStock ? 'text-emerald-600' : 'text-red-500'}`}
      >
        {data.ecwid.inStock ? 'In Stock' : 'Out of Stock'}
      </p>
    </div>
  );
}

export function SkuDetailHeader({ c, data }: { c: SkuDetailController; data: SkuDetailData }) {
  if (c.isPanel) {
    return (
      <div className="flex-shrink-0 border-b border-border-soft bg-surface-card">
        <DeskRailChromeRow onClose={c.handleClose} />
        <div className="flex items-center gap-3 px-4 pb-3">
          <div className="min-w-0 flex-1">
            <PaneHeaderLabel
              eyebrow="SKU"
              value={<SkuCopyableSku c={c} data={data} />}
              valueClassName="min-w-0"
            />
            {data.productTitle ? (
              <p className="truncate text-role-caption text-text-muted" title={data.productTitle}>
                {data.productTitle}
              </p>
            ) : null}
          </div>
          <SkuPriceBadge data={data} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex-shrink-0 flex items-center gap-3 border-b border-border-soft bg-surface-card px-4 py-3">
      <IconButton
        icon={<ChevronLeft className="h-5 w-5" />}
        ariaLabel="Back"
        onClick={c.handleClose}
        className="flex h-9 w-9 items-center justify-center rounded-lg bg-surface-sunken text-text-muted hover:bg-surface-strong"
      />
      <div className="min-w-0 flex-1">
        <h1 className={`${cardTitle} truncate`}>{data.productTitle || data.sku}</h1>
        <SkuCopyableSku c={c} data={data} />
      </div>
      <SkuPriceBadge data={data} />
    </div>
  );
}
