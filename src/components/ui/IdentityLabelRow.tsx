/**
 * Platform / type identity row — black label + leading tone dot.
 *
 * Color signal lives ONLY in the dot ({@link platformMetaBrandDot},
 * {@link receivingTypeBrandDot}, {@link priorityTierBrandDot}). Label ink
 * stays black on white surfaces — never tinted platform/type prose.
 */

import type { ReactNode } from 'react';
import { Check } from '@/components/Icons';
import { BrandIdentityDot } from '@/components/ui/grid-cells';
import { platformPaintFromHex } from '@/lib/color-contrast';
import { priorityOverrideTier, priorityTierBrandDot } from '@/lib/receiving/priority-override';
import {
  receivingTypeMeta,
  receivingTypeBrandDot,
} from '@/lib/receiving/receiving-type-meta';
import {
  platformMetaBrandDot,
  sourcePlatformMeta,
  type SourcePlatformMeta,
} from '@/lib/source-platform';
import { cn } from '@/utils/_cn';

/** Menu / pill label ink — platform and type names never pick up tone classes. */
const IDENTITY_LABEL_INK = 'text-black';

/** Quiet white classify / filter pill — dot carries hue, not the shell. */
export const IDENTITY_PILL_NEUTRAL_IDLE =
  'border-border-soft bg-surface-card text-black hover:border-border-default hover:bg-surface-hover shadow-none';

export const IDENTITY_PILL_NEUTRAL_ACTIVE =
  'border-border-default bg-surface-card text-black shadow-none';

function IdentityLabelRow({
  label,
  dotClassName,
  dotStyle,
  className,
  labelClassName,
  truncate = true,
  leading,
}: {
  label: string;
  dotClassName?: string;
  dotStyle?: { backgroundColor: string };
  className?: string;
  labelClassName?: string;
  truncate?: boolean;
  /** Override the default dot (e.g. urgency Flag icon on collapsed chips). */
  leading?: ReactNode;
}) {
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-2', className)}>
      {leading ?? (
        <BrandIdentityDot className={dotClassName} style={dotStyle} aria-hidden />
      )}
      <span
        className={cn(
          IDENTITY_LABEL_INK,
          truncate && 'min-w-0 truncate',
          labelClassName,
        )}
      >
        {label}
      </span>
    </span>
  );
}

export function PlatformIdentityLabel({
  platformValue,
  label,
  meta: metaOverride,
  accentHex,
  className,
}: {
  platformValue?: string | null;
  label: string;
  meta?: SourcePlatformMeta;
  accentHex?: string | null;
  className?: string;
}) {
  const base = metaOverride ?? sourcePlatformMeta(platformValue);
  const meta =
    accentHex?.trim()
      ? { ...base, accentHex: platformPaintFromHex(accentHex.trim())?.accent ?? accentHex }
      : base;
  const dot = platformMetaBrandDot(meta);
  return (
    <IdentityLabelRow
      label={label}
      dotClassName={dot.className}
      dotStyle={dot.style}
      className={className}
    />
  );
}

export function TypeIdentityLabel({
  typeValue,
  label,
  className,
}: {
  typeValue?: string | null;
  label: string;
  className?: string;
}) {
  const dot = receivingTypeBrandDot(receivingTypeMeta(typeValue));
  return (
    <IdentityLabelRow
      label={label}
      dotClassName={dot.className}
      dotStyle={dot.style}
      className={className}
    />
  );
}

function PriorityIdentityLabel({
  tierValue,
  label,
  className,
}: {
  /** Stored priority_tier or `'auto'` for the Auto row. */
  tierValue: number | string | null | undefined;
  label: string;
  className?: string;
}) {
  if (tierValue === 'auto' || tierValue == null || tierValue === '') {
    return (
      <IdentityLabelRow
        label={label}
        dotClassName="bg-border-emphasis"
        className={className}
      />
    );
  }
  const tier = priorityOverrideTier(Number(tierValue));
  if (!tier) {
    return (
      <IdentityLabelRow
        label={label}
        dotClassName="bg-border-emphasis"
        className={className}
      />
    );
  }
  const dot = priorityTierBrandDot(tier);
  return (
    <IdentityLabelRow
      label={label}
      dotClassName={dot.className}
      dotStyle={dot.style}
      className={className}
    />
  );
}

/** Compact dot-only mark for grids / filter leading slots (label lives elsewhere). */
export function PlatformDotMark({
  platformValue,
  meta: metaOverride,
  empty = false,
  className,
}: {
  platformValue?: string | null;
  meta?: SourcePlatformMeta;
  empty?: boolean;
  className?: string;
}) {
  if (empty || !(metaOverride?.value || platformValue)) {
    return <BrandIdentityDot className={cn('bg-border-emphasis', className)} aria-hidden />;
  }
  const meta = metaOverride ?? sourcePlatformMeta(platformValue);
  const dot = platformMetaBrandDot(meta);
  return (
    <BrandIdentityDot
      className={cn(dot.className, className)}
      style={dot.style}
      aria-hidden
    />
  );
}

/** SearchableSelectField row — platform name + tone dot (black label). */
export function renderPlatformSelectOption(
  opt: { value: string | number; label: string; meta?: string; data?: { colorHex?: string | null } },
  state: { active: boolean },
) {
  return (
    <>
      <PlatformIdentityLabel
        platformValue={String(opt.value)}
        label={opt.label}
        accentHex={opt.data?.colorHex}
        className="min-w-0 flex-1"
      />
      {opt.meta ? (
        <span className="shrink-0 text-role-eyebrow uppercase tracking-wide text-text-faint">
          {opt.meta}
        </span>
      ) : null}
      {state.active ? <Check className="h-3.5 w-3.5 shrink-0" /> : null}
    </>
  );
}

/** SearchableSelectField row — receiving type + tone dot (black label). */
export function renderTypeSelectOption(
  opt: { value: string | number; label: string; meta?: string },
  state: { active: boolean },
) {
  return (
    <>
      <TypeIdentityLabel
        typeValue={String(opt.value)}
        label={opt.label}
        className="min-w-0 flex-1"
      />
      {opt.meta ? (
        <span className="shrink-0 text-role-eyebrow uppercase tracking-wide text-text-faint">
          {opt.meta}
        </span>
      ) : null}
      {state.active ? <Check className="h-3.5 w-3.5 shrink-0" /> : null}
    </>
  );
}

/** SearchableSelectField row — priority tier + tone dot (black label). */
export function renderPrioritySelectOption(
  opt: { value: string | number; label: string; meta?: string },
  state: { active: boolean },
) {
  return (
    <>
      <PriorityIdentityLabel
        tierValue={opt.value === 'auto' ? 'auto' : Number(opt.value)}
        label={opt.label}
        className="min-w-0 flex-1"
      />
      {opt.meta ? (
        <span className="shrink-0 text-role-eyebrow uppercase tracking-wide text-text-faint">
          {opt.meta}
        </span>
      ) : null}
      {state.active ? <Check className="h-3.5 w-3.5 shrink-0" /> : null}
    </>
  );
}

/** Compact dot-only mark for receiving type (label lives elsewhere). */
export function TypeDotMark({
  typeValue,
  empty = false,
  className,
}: {
  typeValue?: string | null;
  empty?: boolean;
  className?: string;
}) {
  if (empty || !typeValue) {
    return <BrandIdentityDot className={cn('bg-border-emphasis', className)} aria-hidden />;
  }
  const dot = receivingTypeBrandDot(receivingTypeMeta(typeValue));
  return (
    <BrandIdentityDot
      className={cn(dot.className, className)}
      style={dot.style}
      aria-hidden
    />
  );
}
