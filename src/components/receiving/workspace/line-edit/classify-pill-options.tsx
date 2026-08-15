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

import { Flag } from '@/components/Icons';
import { PlatformMark } from '@/components/ui/PlatformMark';
import { TOP_CHROME_ICON_GLYPH } from '@/components/layout/header-shell';
import { platformPaintFromHex } from '@/lib/color-contrast';
import { platformMetaBrandDot, sourcePlatformMeta } from '@/lib/source-platform';
import { receivingTypeMeta } from '@/lib/receiving/receiving-type-meta';
import { priorityOverrideTiersForPicker } from '@/lib/receiving/priority-override';
import type { InlinePillOption } from './InlinePillPicker';

const FACE_GLYPH = TOP_CHROME_ICON_GLYPH;

const IDENTITY_FACE = 'border-border-soft bg-surface-card text-text-default shadow-none';
const IDENTITY_FACE_IDLE =
  'border-border-soft bg-surface-card text-text-default hover:bg-surface-hover';

export function urgencyClassifyOptions(args: {
  derivedLabel: string;
  derivedTierEquivalent: number | null;
  autoActiveClass: string;
}): InlinePillOption[] {
  const { derivedLabel, derivedTierEquivalent, autoActiveClass } = args;
  // Auto (platform / org unbox policy) first; manual pins escalate Low → Priority.
  return [
    {
      value: 'auto',
      label: 'Auto',
      shortLabel: 'Auto',
      title: `Auto — follows platform (${derivedLabel})`,
      face: <Flag className={FACE_GLYPH} />,
      activeClass: autoActiveClass,
      inactiveClass:
        'border-border-soft bg-surface-card/70 text-text-soft hover:border-border-default hover:bg-surface-hover',
    },
    ...priorityOverrideTiersForPicker().map((t) => ({
      value: String(t.value),
      label: t.label,
      shortLabel: t.short,
      title:
        derivedTierEquivalent === t.value
          ? `${t.title} — current (auto from platform); click to pin`
          : t.title,
      face: <Flag className={FACE_GLYPH} />,
      activeClass: t.activeClass,
      inactiveClass: derivedTierEquivalent === t.value ? t.activeClass : t.inactiveClass,
    })),
  ];
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
      const paint = o.colorHex ? platformPaintFromHex(o.colorHex) : null;
      const markMeta = paint
        ? { ...meta, value: meta.value || o.value.toLowerCase(), label: o.label, accentHex: paint.accent }
        : { ...meta, value: meta.value || o.value.toLowerCase(), label: o.label };
      const brandDot = platformMetaBrandDot(markMeta);
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
      const paint = o.colorHex ? platformPaintFromHex(o.colorHex) : null;
      const typeDot = meta.text.replace(/^text-/, 'bg-');
      return {
        value: o.value,
        label: o.label,
        shortLabel: meta.short,
        title: o.label,
        face: (
          <span
            className={`h-2 w-2 shrink-0 rounded-full ${paint ? '' : typeDot}`}
            style={paint ? { backgroundColor: paint.accent } : undefined}
            aria-hidden
          />
        ),
        dotClass: paint ? undefined : typeDot,
        dotStyle: paint ? { backgroundColor: paint.accent } : undefined,
        activeClass: IDENTITY_FACE,
        inactiveClass: IDENTITY_FACE_IDLE,
      } satisfies InlinePillOption;
    });
}
