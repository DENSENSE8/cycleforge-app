import { microBadge } from '@/design-system/tokens/typography/presets';
import {
  PairingCandidateRow,
} from '@/components/receiving/workspace/line-edit/PairingLinkButton';
import { ItemRecordThumb } from '@/design-system/components/item-record';
import { PlatformMark } from '@/components/ui/PlatformMark';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { sourcePlatformMeta } from '@/lib/source-platform';
import { OrderIdChip, SkuScanRefChip, getLast8 } from '@/components/ui/CopyChip';
import type { SearchItem } from './ecwid-search-shared';

interface ModeButtonProps {
  active: boolean;
  onClick: () => void;
  label: string;
}

export function ModeButton({ active, onClick, label }: ModeButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`ds-raw-button ${microBadge} rounded px-2 py-1 transition-colors ${
        active
          ? 'bg-blue-100 text-blue-700'
          : 'text-text-soft hover:bg-surface-sunken'
      }`}
    >
      {label}
    </button>
  );
}

interface ResultRowProps {
  item: SearchItem;
  showOrderMeta?: boolean;
  isSubmitting: boolean;
  disabled: boolean;
  onSelect: (item: SearchItem) => void;
  /** System / tracking suggestion — top-of-list tint, no scores. */
  suggested?: boolean;
  suggestedLabel?: string;
}

export function ResultRow({
  item,
  showOrderMeta,
  isSubmitting,
  disabled,
  onSelect,
  suggested = false,
  suggestedLabel = 'Suggested (Tracking match)',
}: ResultRowProps) {
  const platforms = item.platform_ids?.filter((p) => p?.platform) ?? [];
  const displaySku = item.sku ?? item.zoho_sku ?? '';

  // Same media primitive as the PO line row (ItemRecordThumb) — flush left,
  // full row height, thin right divider. Used to be a bespoke 40px bordered
  // square boxed away from the row edge (2026-08-24 fix).
  const media = <ItemRecordThumb imageUrl={item.image_url} />;

  const meta = (
    // Order · SKU — same left-to-right identity order and the same chip family (CopyChip) as the receiving rail peek (RailPeekIdentityFacts):
    <div className="flex flex-wrap items-center gap-1">
      {showOrderMeta && item.order_id ? (
        <OrderIdChip value={item.order_id} display={getLast8(item.order_id)} dense />
      ) : null}
      {displaySku ? (
        <SkuScanRefChip value={displaySku} display={getLast8(displaySku)} dense />
      ) : null}
      {!showOrderMeta &&
        platforms.slice(0, 4).map((p, i) => {
          const meta = sourcePlatformMeta(p.platform);
          return (
            <HoverTooltip key={`${p.platform}-${i}`} label={meta.label || p.platform} asChild focusable={false}>
              <span className="inline-flex shrink-0" aria-label={meta.label || p.platform}>
                <PlatformMark
                  platformValue={meta.value || p.platform}
                  meta={meta.value ? meta : undefined}
                />
              </span>
            </HoverTooltip>
          );
        })}
    </div>
  );

  return (
    <li role="option" aria-selected={false} className="border-b border-border-hairline last:border-b-0">
      <PairingCandidateRow
        className="rounded-none border-0 bg-transparent hover:bg-blue-50 focus-visible:bg-blue-50"
        media={media}
        title={item.product_title}
        meta={meta}
        action={
          isSubmitting ? (
            <span className="text-role-micro text-blue-600">
              Adding…
            </span>
          ) : null
        }
        onSelect={() => onSelect(item)}
        disabled={disabled || isSubmitting}
        suggested={suggested}
        suggestedLabel={suggestedLabel}
      />
    </li>
  );
}
