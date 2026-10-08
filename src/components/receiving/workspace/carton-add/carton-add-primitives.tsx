import { Loader2, Package, Plus } from '@/components/Icons';
import { SkuScanRefChip, getLast8 } from '@/components/ui/CopyChip';
import {
  joinStackedIdentityKeys,
  StackedRowIdentity,
} from '@/components/ui/StackedRowIdentity';
import { PHONE_CARD_FACE } from '@/design-system/tokens/phone-card';

// ─── Hint banner (e.g. off-PO notice) ────────────────────────────────────────

export function HintBanner({ text }: { text: string }) {
  return (
    <div className="px-2 pt-2">
      <div className={`${PHONE_CARD_FACE} border border-amber-100 bg-amber-50 px-3 py-1.5 text-role-micro font-semibold text-amber-800`}>
        {text}
      </div>
    </div>
  );
}

// ─── Disabled tab note ───────────────────────────────────────────────────────

export function DisabledNote({ reason }: { reason: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-10 text-center">
      <Package className="h-6 w-6 text-text-faint" />
      <p className="max-w-xs text-role-caption text-text-soft">{reason}</p>
    </div>
  );
}

// ─── Shared result row ───────────────────────────────────────────────────────

export function ResultRow({
  title,
  subtitle,
  sku,
  imageUrl,
  busy,
  disabled,
  onClick,
}: {
  title: string;
  /** Prose secondary line when `sku` is absent (e.g. web hit condition · price). */
  subtitle?: string;
  /** Typed SKU key — preferred over prose subtitle for catalog picks. */
  sku?: string | null;
  imageUrl: string | null;
  busy: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  const skuValue = (sku ?? '').trim();
  const subtitleValue = (subtitle ?? '').trim();

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="ds-raw-button flex w-full items-center gap-2.5 rounded-lg border border-border-soft px-2.5 py-2 text-left transition-colors hover:border-blue-300 hover:bg-blue-50/50 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageUrl} alt="" loading="lazy" decoding="async" className="h-9 w-9 shrink-0 rounded-md object-cover ring-1 ring-border-soft" />
      ) : (
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-surface-sunken text-text-faint">
          <Package className="h-4 w-4" />
        </div>
      )}
      <StackedRowIdentity
        className="min-w-0 flex-1"
        title={
          <p className="truncate text-role-caption font-semibold text-text-default">{title}</p>
        }
        keys={joinStackedIdentityKeys([
          skuValue ? (
            <SkuScanRefChip key="sku" value={skuValue} display={getLast8(skuValue)} dense />
          ) : null,
          !skuValue && subtitleValue ? (
            <span key="sub" className="truncate text-role-micro text-text-soft">
              {subtitleValue}
            </span>
          ) : null,
        ])}
      />
      {busy ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-text-faint" /> : <Plus className="h-3.5 w-3.5 shrink-0 text-text-faint" />}
    </button>
  );
}
