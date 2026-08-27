/**
 * Fixed-width platform mark — listing chrome uses this instead of the
 * variable-width platform name so PO# / tracking chips stay aligned across
 * marketplaces. Mark resolution (all from {@link sourcePlatformMeta} or a
 * catalog-aware {@link meta} override):
 *   1. optional brand tile (`SourcePlatformMeta.tileSrc`) when `preferBrandTile`;
 *   2. monochrome brand icon (`SourcePlatformMeta.icon`), tinted by platform tone
 *      or `accentHex` (org custom color → luminance-safe paint);
 *   3. 1–2 char lettermark.
 * Label lives in tooltip / aria — the mark itself is always `aria-hidden`.
 *
 * Bare channel-mark discipline: no sunken/rounded app-tile wrapper. Every layer
 * centers in the same transparent footprint so icon / lettermark share optical
 * weight without washing out brand color. Brand tiles already carry their own
 * square fill — they still sit in the same outer box.
 */

import type { CSSProperties } from 'react';
import { cn } from '@/utils/_cn';
import {
  platformMetaIconTone,
  sourcePlatformMeta,
  type SourcePlatformMeta,
} from '@/lib/source-platform';
import { PLATFORM_BRAND_ICON_VIEWBOX } from '@/lib/platform-brand-icons';
import { platformPaintFromHex } from '@/lib/color-contrast';

/** Shared transparent footprint — icon / lettermark all center here. */
const MARK_BOX =
  'inline-flex h-5 w-5 shrink-0 items-center justify-center text-role-micro uppercase leading-none tracking-tight';

/** Inner mark footprint — ~16px so bare icons stay scannable without tile pad. */
const MARK_INNER = 'h-4 w-4 shrink-0';

export function PlatformMark({
  platformValue,
  meta: metaOverride,
  className,
  textClassName,
  borderClassName,
  empty = false,
  preferBrandTile = false,
}: {
  /** Stored `source_platform` value (or empty for unknown / unbound). */
  platformValue?: string | null;
  /**
   * Catalog-aware meta (from {@link usePlatformMeta}). When omitted, falls
   * back to the built-in {@link sourcePlatformMeta} registry.
   */
  meta?: SourcePlatformMeta;
  className?: string;
  /** Override tone — when the listing has no openable target, pass faint tones. */
  textClassName?: string;
  borderClassName?: string;
  /** Unbound listing placeholder (no platform yet). */
  empty?: boolean;
  /**
   * Prefer full-color {@link SourcePlatformMeta.tileSrc} when present (carton
   * listing). Grids omit this and keep the monochrome glyph.
   */
  preferBrandTile?: boolean;
}) {
  const meta = metaOverride ?? sourcePlatformMeta(platformValue);
  const iconTone = platformMetaIconTone(meta);
  // Lettermark underline still needs borderColor when accentHex is set.
  const paint = meta.accentHex ? platformPaintFromHex(meta.accentHex) : null;
  // ds-allow-hex: org platform accent from platforms.color_hex — ink via color-contrast SoT.
  const accentStyle: CSSProperties | undefined = paint
    ? { color: paint.accent, borderColor: paint.border }
    : iconTone.style;

  if (empty || !meta.value) {
    return (
      <span className={cn(MARK_BOX, 'text-text-faint', className)} aria-hidden>
        <span className="border-b-2 border-border-default pb-px">—</span>
      </span>
    );
  }
  if (preferBrandTile && meta.tileSrc) {
    return (
      <span className={cn(MARK_BOX, className)} aria-hidden>
        {/* eslint-disable-next-line @next/next/no-img-element -- static public brand tile */}
        <img
          src={meta.tileSrc}
          alt=""
          width={16}
          height={16}
          className={cn(MARK_INNER, 'rounded-sm object-cover')}
          draggable={false}
        />
      </span>
    );
  }
  const toneClass = textClassName ?? iconTone.className;
  if (meta.icon) {
    return (
      <span
        className={cn(MARK_BOX, paint || iconTone.style ? undefined : toneClass, className)}
        style={accentStyle}
        aria-hidden
      >
        <svg viewBox={PLATFORM_BRAND_ICON_VIEWBOX} fill="currentColor" className={MARK_INNER} aria-hidden>
          <path d={meta.icon} />
        </svg>
      </span>
    );
  }
  return (
    <span
      className={cn(MARK_BOX, paint || iconTone.style ? undefined : toneClass, className)}
      style={paint ? { color: paint.accent } : iconTone.style}
      aria-hidden
    >
      <span
        className={cn('border-b-2 pb-px', paint ? undefined : (borderClassName ?? meta.border))}
        style={paint ? { borderColor: paint.border } : undefined}
      >
        {meta.mark}
      </span>
    </span>
  );
}
