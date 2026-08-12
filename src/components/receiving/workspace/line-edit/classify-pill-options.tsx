/**
 * Classify pill option builders — Urgency / Platform / Type as identity faces.
 *
 * Shared by the carton bookmark (`InlinePillPicker` menu) and the Classify
 * Displays checklist so both surfaces render the same tone-coded faces.
 * Bookmark chrome uses {@link InlinePillOption.shortLabel}; Classify keeps
 * full `label`.
 */

import { Flag } from '@/components/Icons';
import { PlatformMark } from '@/components/ui/PlatformMark';
import { ReceivingTypeMark } from '@/components/ui/ReceivingTypeMark';
import { TOP_CHROME_ICON_GLYPH } from '@/components/layout/header-shell';
import { platformPaintFromHex } from '@/lib/color-contrast';
import { sourcePlatformMeta } from '@/lib/source-platform';
import { receivingTypeMeta } from '@/lib/receiving/receiving-type-meta';
import { priorityOverrideTiersForPicker } from '@/lib/receiving/priority-override';
import type { InlinePillOption } from './InlinePillPicker';

const FACE_GLYPH = TOP_CHROME_ICON_GLYPH;

/** Soft platform face fills — brand hue tint, Claim/Photos flat language. */
const PLATFORM_FACE_ACTIVE: Record<string, string> = {
  ebay: 'border-yellow-200 bg-yellow-50 text-yellow-800 shadow-none',
  amazon: 'border-orange-200 bg-orange-50 text-orange-700 shadow-none',
  fba: 'border-orange-200 bg-orange-50 text-orange-700 shadow-none',
  aliexpress: 'border-red-200 bg-red-50 text-red-700 shadow-none',
  walmart: 'border-amber-200 bg-amber-50 text-amber-800 shadow-none',
  goodwill: 'border-sky-200 bg-sky-50 text-sky-700 shadow-none',
  ecwid: 'border-blue-200 bg-blue-50 text-blue-700 shadow-none',
  square: 'border-slate-200 bg-slate-50 text-slate-700 shadow-none', // ds-allow-raw-neutral: Square brand slate
  shopify: 'border-green-200 bg-green-50 text-green-700 shadow-none',
  other: 'border-slate-200 bg-slate-50 text-slate-600 shadow-none', // ds-allow-raw-neutral: catch-all
};

const PLATFORM_FACE_IDLE =
  'border-border-soft bg-surface-card/70 text-text-muted hover:border-border-default hover:bg-surface-hover';

/** Structural classes when hex paint supplies fill/ink via inline style. */
const PLATFORM_FACE_HEX_ACTIVE = 'border shadow-none';
const PLATFORM_FACE_HEX_IDLE =
  'border bg-surface-card/70 hover:border-border-default hover:bg-surface-hover';

/**
 * Simple Icons wordmarks read as extra text beside the short lettermark
 * (e.g. ebay glyph + "EB"). Bookmark chrome uses a tone pip for these;
 * silhouette marks (Amazon carton, etc.) keep {@link PlatformMark}.
 */
const PLATFORM_WORDMARK = new Set([
  'ebay',
  'aliexpress',
  'walmart',
  'shopify',
  'square',
]);

const PLATFORM_TONE_PIP = (
  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current opacity-90" aria-hidden />
);

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
          activeClass: 'border-amber-200 bg-amber-50 text-amber-700 shadow-none',
          inactiveClass:
            'border-amber-200 bg-amber-50 text-amber-700 hover:border-amber-300 hover:bg-amber-100',
        },
      ]
    : [];

  return [
    ...unfound,
    ...catalogOptions.map((o) => {
      const meta = sourcePlatformMeta(o.value);
      const paint = o.colorHex ? platformPaintFromHex(o.colorHex) : null;
      const active =
        PLATFORM_FACE_ACTIVE[meta.value] ??
        'border-slate-200 bg-slate-50 text-slate-600 shadow-none'; // ds-allow-raw-neutral: unknown platform face
      const markMeta = paint
        ? { ...meta, value: meta.value || o.value.toLowerCase(), label: o.label, accentHex: paint.accent }
        : { ...meta, value: meta.value || o.value.toLowerCase(), label: o.label };
      return {
        value: o.value,
        label: o.label,
        shortLabel: meta.mark || o.label.slice(0, 2),
        title: o.label,
        face: PLATFORM_WORDMARK.has(meta.value) ? (
          PLATFORM_TONE_PIP
        ) : (
          <PlatformMark
            platformValue={o.value}
            meta={markMeta}
            textClassName="text-current"
          />
        ),
        activeClass: paint ? PLATFORM_FACE_HEX_ACTIVE : active,
        inactiveClass: paint ? PLATFORM_FACE_HEX_IDLE : PLATFORM_FACE_IDLE,
        // ds-allow-hex: soft fill + ink from platforms.color_hex via color-contrast SoT.
        activeStyle: paint
          ? { backgroundColor: paint.softFill, color: paint.softInk, borderColor: paint.border }
          : undefined,
        inactiveStyle: paint
          ? { color: paint.accent, borderColor: paint.border }
          : undefined,
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
        face: (
          <ReceivingTypeMark
            typeValue={o.value}
            textClassName="text-current"
          />
        ),
        activeClass: meta.activeClass,
        inactiveClass: meta.inactiveClass,
      } satisfies InlinePillOption;
    });
}
