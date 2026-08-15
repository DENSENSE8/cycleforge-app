/**
 * Classify pill option builders — Urgency / Platform / Type as identity faces.
 *
 * Shared by the carton bookmark (`InlinePillPicker` menu) and the Classify
 * Displays checklist so both surfaces render the same tone-coded faces.
 * Platform and type labels stay black; hue lives in the leading dot only.
 */

import { Flag } from '@/components/Icons';
import {
  IDENTITY_PILL_NEUTRAL_ACTIVE,
  IDENTITY_PILL_NEUTRAL_IDLE,
  PlatformDotMark,
  TypeDotMark,
} from '@/components/ui/IdentityLabelRow';
import { BrandIdentityDot } from '@/components/ui/grid-cells';
import { TOP_CHROME_ICON_GLYPH } from '@/components/layout/header-shell';
import { platformPaintFromHex } from '@/lib/color-contrast';
import { priorityOverrideTiersForPicker } from '@/lib/receiving/priority-override';
import { receivingTypeMeta } from '@/lib/receiving/receiving-type-meta';
import { platformMetaBrandDot, sourcePlatformMeta } from '@/lib/source-platform';
import type { InlinePillOption } from './InlinePillPicker';

const FACE_GLYPH = TOP_CHROME_ICON_GLYPH;

function platformDotFace(value: string, colorHex?: string | null) {
  const meta = sourcePlatformMeta(value);
  if (colorHex) {
    const paint = platformPaintFromHex(colorHex);
    if (paint) {
      const dot = platformMetaBrandDot({ ...meta, accentHex: paint.accent });
      return (
        <BrandIdentityDot className={dot.className} style={dot.style} aria-hidden />
      );
    }
  }
  return <PlatformDotMark platformValue={value} meta={meta} />;
}

function typeDotFace(value: string) {
  return <TypeDotMark typeValue={value} />;
}

function priorityDotFace(tierValue: number) {
  const tier = priorityOverrideTiersForPicker().find((t) => t.value === tierValue);
  if (!tier) return <BrandIdentityDot className="bg-border-emphasis" aria-hidden />;
  return <BrandIdentityDot className={tier.dot} aria-hidden />;
}

export function urgencyClassifyOptions(args: {
  derivedLabel: string;
  derivedTierEquivalent: number | null;
  autoActiveClass: string;
}): InlinePillOption[] {
  const { derivedLabel, derivedTierEquivalent, autoActiveClass } = args;
  return [
    {
      value: 'auto',
      label: 'Auto',
      shortLabel: 'Auto',
      title: `Auto — follows platform (${derivedLabel})`,
      face: <Flag className={FACE_GLYPH} />,
      menuFace: <BrandIdentityDot className="bg-border-emphasis" aria-hidden />,
      activeClass: autoActiveClass,
      inactiveClass: IDENTITY_PILL_NEUTRAL_IDLE,
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
      menuFace: priorityDotFace(t.value),
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
          face: <BrandIdentityDot className="bg-amber-500" aria-hidden />,
          activeClass: IDENTITY_PILL_NEUTRAL_ACTIVE,
          inactiveClass: IDENTITY_PILL_NEUTRAL_IDLE,
        },
      ]
    : [];

  return [
    ...unfound,
    ...catalogOptions.map((o) => {
      const meta = sourcePlatformMeta(o.value);
      return {
        value: o.value,
        label: o.label,
        shortLabel: meta.mark || o.label.slice(0, 2),
        title: o.label,
        face: platformDotFace(o.value, o.colorHex),
        activeClass: IDENTITY_PILL_NEUTRAL_ACTIVE,
        inactiveClass: IDENTITY_PILL_NEUTRAL_IDLE,
      } satisfies InlinePillOption;
    }),
  ];
}

export function typeClassifyOptions(args: {
  catalogOptions: Array<{ value: string; label: string }>;
}): InlinePillOption[] {
  return args.catalogOptions
    .filter((o) => o.value !== 'PICKUP')
    .map((o) => {
      const meta = receivingTypeMeta(o.value);
      return {
        value: o.value,
        label: o.label,
        shortLabel: meta.short,
        title: o.label,
        face: typeDotFace(o.value),
        activeClass: IDENTITY_PILL_NEUTRAL_ACTIVE,
        inactiveClass: IDENTITY_PILL_NEUTRAL_IDLE,
      } satisfies InlinePillOption;
    });
}
