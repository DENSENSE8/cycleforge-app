/**
 * Classify pill option builders — Urgency / Platform / Type as identity faces.
 *
 * Shared by the carton bookmark (`InlinePillPicker` menu) and the Classify
 * Displays checklist so both surfaces render the same tone-coded faces.
 * Bookmark chrome uses {@link InlinePillOption.shortLabel}; Classify keeps
 * full `label`.
 *
 * Platform / type color lives in a left-hand dot only. Labels stay black on
 * white — same treatment as the copy-chip identity dots.
 */

import { type CSSProperties } from 'react';
import { Flag } from '@/components/Icons';
import { PlatformMark } from '@/components/ui/PlatformMark';
import { TOP_CHROME_ICON_GLYPH } from '@/components/layout/header-shell';
import { platformPaintFromHex } from '@/lib/color-contrast';
import { platformMetaBrandDot, sourcePlatformMeta } from '@/lib/source-platform';
import { receivingTypeMeta } from '@/lib/receiving/receiving-type-meta';
import {
  priorityOverrideTier,
  priorityOverrideTiersForHeader,
  priorityOverrideTiersForPicker,
} from '@/lib/receiving/priority-override';
import type { InlinePillOption } from './InlinePillPicker';

const FACE_GLYPH = TOP_CHROME_ICON_GLYPH;

const IDENTITY_FACE = 'border-border-soft bg-surface-card text-text-default shadow-none';
const IDENTITY_FACE_IDLE =
  'border-border-soft bg-surface-card text-text-default hover:bg-surface-hover';

export function urgencyClassifyOptions(args: {
  derivedLabel: string;
  derivedTierEquivalent: number | null;
  autoActiveClass: string;
  /**
   * Org renames / repaints from `usePriorityCatalog`, keyed by tier as a string.
   * Absent (or an unmatched tier) falls through to the built-in rung — the
   * ladder itself is never sourced from here, only its skin.
   */
  catalogOptions?: Array<{ value: string; label: string; shortLabel?: string; colorHex?: string | null }>;
  /**
   * `header` — carton identity hover list: Low / Medium / High (no Auto, no
   * Priority). `full` — Classify Displays / Arrival / mobile keep Auto +
   * Priority as the searchable editor.
   */
  surface?: 'header' | 'full';
}): InlinePillOption[] {
  const { derivedLabel, derivedTierEquivalent, autoActiveClass, surface = 'full' } = args;
  const skin = new Map((args.catalogOptions ?? []).map((o) => [o.value, o]));
  const tiers =
    surface === 'header' ? priorityOverrideTiersForHeader() : priorityOverrideTiersForPicker();
  const autoRow: InlinePillOption[] =
    surface === 'header'
      ? []
      : [
          {
            value: 'auto',
            label: 'Auto',
            shortLabel: 'Auto',
            title: `Auto — follows platform (${derivedLabel})`,
            face: <Flag className={FACE_GLYPH} />,
            activeClass: autoActiveClass,
            inactiveClass:
              'border-border-soft bg-surface-card/70 text-text-soft hover:border-border-default hover:bg-surface-hover',
            dotClass: 'bg-border-emphasis',
          },
        ];
  return [
    ...autoRow,
    ...tiers.map((t) => {
      const org = skin.get(String(t.value));
      const dot = catalogIdentityDot({
        kind: 'priority',
        value: String(t.value),
        label: org?.label ?? t.label,
        colorHex: org?.colorHex ?? null,
      });
      return {
      value: String(t.value),
      label: org?.label ?? t.label,
      shortLabel: org?.shortLabel ?? t.short,
      title:
        derivedTierEquivalent === t.value
          ? `${t.title} — current (auto from platform); click to pin`
          : t.title,
      face: <Flag className={FACE_GLYPH} />,
      activeClass: t.activeClass,
      inactiveClass: derivedTierEquivalent === t.value ? t.activeClass : t.inactiveClass,
      // Org accent (`priority_tiers.color_hex`) beats the built-in rung tone —
      // same descent, and the same resolver, as platform / type marks.
      dotClass: dot.className ?? t.dotClass,
      dotStyle: dot.style,
      };
    }),
  ];
}

/**
 * The resolved identity dot for ONE catalog row — the single ladder every
 * surface that paints a platform / type mark descends:
 *
 *   org accent (`color_hex`) → built-in registry tone → neutral
 *
 * Exported because the catalog MANAGER lists the same rows and must show the
 * same dot the carton bar will paint; a second resolver there would drift the
 * moment a registry tone changed. Returns a Tailwind class OR an inline style
 * (never both) — a derived hex has no class to name it.
 */
export function catalogIdentityDot(args: {
  kind: 'platform' | 'type' | 'priority';
  /** Platform slug (lowercase), type slug (uppercase), or priority tier (0..3). */
  value: string;
  label: string;
  colorHex?: string | null;
}): { className?: string; style?: CSSProperties } {
  const paint = args.colorHex ? platformPaintFromHex(args.colorHex) : null;
  if (args.kind === 'priority') {
    // ds-allow-hex: derived accent from priority_tiers.color_hex via the contrast SoT.
    if (paint) return { style: { backgroundColor: paint.accent } };
    return { className: priorityOverrideTier(Number(args.value))?.dotClass ?? 'bg-border-emphasis' };
  }
  if (args.kind === 'type') {
    // ds-allow-hex: derived accent from types.color_hex via the contrast SoT.
    if (paint) return { style: { backgroundColor: paint.accent } };
    return { className: receivingTypeMeta(args.value).text.replace(/^text-/, 'bg-') };
  }
  const meta = sourcePlatformMeta(args.value);
  const markMeta = {
    ...meta,
    value: meta.value || args.value.toLowerCase(),
    label: args.label,
    ...(paint ? { accentHex: paint.accent } : null),
  };
  const brandDot = platformMetaBrandDot(markMeta);
  return { className: brandDot.className, style: brandDot.style };
}

export function platformClassifyOptions(args: {
  catalogOptions: Array<{ value: string; label: string; colorHex?: string | null }>;
  isUnmatched: boolean;
}): InlinePillOption[] {
  const { catalogOptions, isUnmatched } = args;
  const unfound: InlinePillOption[] = isUnmatched
    ? [
        {
          value: '',
          label: 'Unfound',
          shortLabel: '?',
          title: 'No purchase order matched this carton',
          face: <PlatformMark empty />,
          dotClass: 'bg-amber-500',
          activeClass: IDENTITY_FACE,
          inactiveClass: IDENTITY_FACE_IDLE,
        },
      ]
    : [];

  return [
    ...unfound,
    ...catalogOptions.map((o) => {
      const meta = sourcePlatformMeta(o.value);
      const brandDot = catalogIdentityDot({
        kind: 'platform',
        value: o.value,
        label: o.label,
        colorHex: o.colorHex,
      });
      return {
        value: o.value,
        label: o.label,
        shortLabel: meta.mark || o.label.slice(0, 2),
        title: o.label,
        face: (
          <span
            className={`h-2 w-2 shrink-0 rounded-full ${brandDot.className ?? ''}`}
            style={brandDot.style}
            aria-hidden
          />
        ),
        dotClass: brandDot.className,
        dotStyle: brandDot.style,
        activeClass: IDENTITY_FACE,
        inactiveClass: IDENTITY_FACE_IDLE,
      } satisfies InlinePillOption;
    }),
  ];
}

export function typeClassifyOptions(args: {
  catalogOptions: Array<{ value: string; label: string; colorHex?: string | null }>;
}): InlinePillOption[] {
  return args.catalogOptions
    .filter((o) => o.value !== 'PICKUP')
    .map((o) => {
      const meta = receivingTypeMeta(o.value);
      // Org accent (`types.color_hex`) beats the built-in registry tone — the
      // same ladder platforms use, and the only answer for a CUSTOM type, which
      // `receivingTypeMeta` can only resolve to the neutral tag face.
      const { className: dotClass, style: dotStyle } = catalogIdentityDot({
        kind: 'type',
        value: o.value,
        label: o.label,
        colorHex: o.colorHex,
      });
      return {
        value: o.value,
        label: o.label,
        shortLabel: meta.short,
        title: o.label,
        face: (
          <span
            className={`h-2 w-2 shrink-0 rounded-full ${dotClass ?? ''}`}
            style={dotStyle}
            aria-hidden
          />
        ),
        dotClass,
        dotStyle,
        activeClass: IDENTITY_FACE,
        inactiveClass: IDENTITY_FACE_IDLE,
      } satisfies InlinePillOption;
    });
}
