import { microBadge } from '@/design-system/tokens/typography/presets';
import {
  PairingCandidateRow,
} from '@/components/receiving/workspace/line-edit/PairingLinkButton';
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
  const displaySku = item.sku ?? item.zoho_sku ?? '—';

  const media = (
    <div className="h-10 w-10 shrink-0 overflow-hidden rounded-none border border-border-hairline bg-surface-canvas">
      {item.image_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.image_url}
          alt=""
          className="h-full w-full object-cover"
          loading="lazy"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-role-micro text-text-faint">
          —
        </div>
      )}
    </div>
  );

  const meta = (
    <div className="flex flex-wrap items-center gap-1">
      <span className="font-mono text-role-micro tracking-wide text-text-soft">
        {displaySku}
      </span>
      {showOrderMeta && item.order_id ? (
        <span className="text-role-micro font-semibold normal-case text-sky-600">
          Order #{item.order_id}
        </span>
      ) : null}
      {!showOrderMeta &&
        platforms.slice(0, 4).map((p, i) => (
          <span
            key={`${p.platform}-${i}`}
            className={`${microBadge} rounded bg-surface-sunken inset-chip text-text-muted`}
          >
            {p.platform}
          </span>
        ))}
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
            <span className="text-role-micro uppercase tracking-wider text-blue-600">
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
