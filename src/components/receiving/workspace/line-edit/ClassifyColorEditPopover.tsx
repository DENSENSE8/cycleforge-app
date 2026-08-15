'use client';

/**
 * Mobile-style color sheet for classify platform + type dots.
 *
 * Platform accents persist through the existing catalog save path
 * (`PATCH /api/catalog/platforms/:id` `{ colorHex }`) — same mutation
 * {@link CatalogManagerList} uses. Type colors have no catalog hex column;
 * those swatches write local settings ({@link useTypeColorOverrides}) and
 * otherwise stay on {@link receivingTypeMeta}.
 *
 * Surface: design-system {@link Popover} (card face, default text, color
 * only in the swatch). Compact list, large tap targets, hairline rows.
 */

import { useState, type CSSProperties, type RefObject } from 'react';
import { ColorSwatchPicker, type ColorSwatch } from '@/components/ui/ColorSwatchPicker';
import { Popover } from '@/design-system/primitives';
import { useInvalidateCatalog, usePlatformCatalog, useReceivingTypeCatalog } from '@/hooks/useCatalog';
import { useTypeColorOverrides } from '@/lib/receiving/type-color-overrides';
import { platformPaintFromHex } from '@/lib/color-contrast';
import { receivingTypeMeta } from '@/lib/receiving/receiving-type-meta';
import { platformMetaBrandDot, sourcePlatformMeta } from '@/lib/source-platform';
import { toast } from '@/lib/toast';
import { cn } from '@/utils/_cn';

/** Same accessible mid-saturation set as {@link CatalogManagerList}. */
const COLOR_PRESETS: ReadonlyArray<ColorSwatch> = [
  { hex: '#2563eb', label: 'Blue' },
  { hex: '#0ea5e9', label: 'Sky' },
  { hex: '#10b981', label: 'Emerald' },
  { hex: '#84cc16', label: 'Lime' },
  { hex: '#f59e0b', label: 'Amber' },
  { hex: '#f97316', label: 'Orange' },
  { hex: '#ef4444', label: 'Red' },
  { hex: '#ec4899', label: 'Pink' },
  { hex: '#a855f7', label: 'Purple' },
  { hex: '#6366f1', label: 'Indigo' },
  { hex: '#64748b', label: 'Slate' },
  { hex: '#0f172a', label: 'Ink' },
];

/** Tailwind type-tone → swatch hex so the picker has a starting value. */
const TYPE_TEXT_HEX: Record<string, string> = {
  'text-blue-600': '#2563eb',
  'text-rose-600': '#e11d48',
  'text-orange-600': '#ea580c',
  'text-amber-700': '#b45309',
  'text-emerald-600': '#059669',
};

function typeDefaultHex(value: string): string | null {
  const meta = receivingTypeMeta(value);
  return TYPE_TEXT_HEX[meta.text] ?? null;
}

function IdentitySwatch({
  className,
  style,
}: {
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <span
      className={cn(
        'h-3.5 w-3.5 shrink-0 rounded-full border border-border-soft',
        className,
      )}
      style={style}
      aria-hidden
    />
  );
}

function ColorRow({
  name,
  swatchClass,
  swatchStyle,
  hex,
  expanded,
  onToggle,
  onChange,
  allowNone,
  disabled,
}: {
  name: string;
  swatchClass?: string;
  swatchStyle?: CSSProperties;
  hex: string | null;
  expanded: boolean;
  onToggle: () => void;
  onChange: (hex: string | null) => void;
  allowNone?: boolean;
  disabled?: boolean;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-label={`${expanded ? 'Hide' : 'Edit'} color for ${name}`}
        className="flex min-h-11 w-full items-center gap-3 bg-surface-card px-3 text-left text-role-caption font-semibold text-text-default hover:bg-surface-hover"
      >
        <IdentitySwatch className={swatchClass} style={swatchStyle} />
        <span className="min-w-0 flex-1 truncate text-text-default">{name}</span>
      </button>
      {expanded ? (
        <div className="border-t border-border-hairline bg-surface-card px-3 py-2.5">
          <ColorSwatchPicker
            value={hex}
            onChange={onChange}
            presets={COLOR_PRESETS}
            allowNone={allowNone}
            showHex
            shape="round"
            disabled={disabled}
          />
        </div>
      ) : null}
    </li>
  );
}

export function ClassifyColorEditPopover({
  open,
  onClose,
  anchorRef,
}: {
  open: boolean;
  onClose: () => void;
  anchorRef: RefObject<HTMLElement | null>;
}) {
  const platformCat = usePlatformCatalog();
  const typeCat = useReceivingTypeCatalog();
  const invalidate = useInvalidateCatalog();
  const typeColors = useTypeColorOverrides();
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  async function savePlatformColor(id: number | undefined, key: string, colorHex: string | null) {
    if (id == null) {
      toast.error('Catalog is not ready — apply the platforms migration to save colors.');
      return;
    }
    if (busyKey != null) return;
    setBusyKey(key);
    try {
      const res = await fetch(`/api/catalog/platforms/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ colorHex }),
      });
      const data = (await res.json().catch(() => ({}))) as { success?: boolean; error?: string };
      if (!res.ok || !data?.success) {
        toast.error(data?.error || `Save failed (${res.status})`);
        return;
      }
      invalidate();
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <Popover
      open={open}
      onClose={onClose}
      anchorRef={anchorRef}
      placement="bottom-start"
      gap={4}
      role="dialog"
      aria-label="Edit platform and type colors"
      className="w-[min(20rem,calc(100vw-1.5rem))]"
    >
      <div className="border-b border-border-hairline px-3 py-2">
        <p className="text-role-eyebrow font-semibold uppercase tracking-widest text-text-faint">
          Colors
        </p>
      </div>
      <div className="max-h-[min(24rem,70vh)] overflow-y-auto">
        <p className="border-b border-border-hairline px-3 py-1.5 text-role-eyebrow uppercase tracking-widest text-text-faint">
          Platforms
        </p>
        <ul className="divide-y divide-border-soft">
          {platformCat.options.map((o) => {
            const key = `platform:${o.value}`;
            const meta = sourcePlatformMeta(o.value);
            const paint = o.colorHex ? platformPaintFromHex(o.colorHex) : null;
            const markMeta = paint
              ? { ...meta, accentHex: paint.accent }
              : { ...meta, accentHex: o.colorHex ?? meta.accentHex };
            const dot = platformMetaBrandDot(markMeta);
            return (
              <ColorRow
                key={key}
                name={o.label}
                swatchClass={dot.className}
                swatchStyle={dot.style}
                hex={o.colorHex ?? null}
                expanded={expandedKey === key}
                onToggle={() => setExpandedKey((cur) => (cur === key ? null : key))}
                onChange={(hex) => void savePlatformColor(o.id, key, hex)}
                allowNone
                disabled={busyKey != null}
              />
            );
          })}
        </ul>
        <p className="border-y border-border-hairline px-3 py-1.5 text-role-eyebrow uppercase tracking-widest text-text-faint">
          Types
        </p>
        <ul className="divide-y divide-border-soft">
          {typeCat.options.map((o) => {
            const key = `type:${o.value}`;
            const override = typeColors.colors[o.value] ?? null;
            const fallback = typeDefaultHex(o.value);
            const hex = override ?? fallback;
            const paint = hex ? platformPaintFromHex(hex) : null;
            const meta = receivingTypeMeta(o.value);
            const typeDot = meta.text.replace(/^text-/, 'bg-');
            return (
              <ColorRow
                key={key}
                name={o.label}
                swatchClass={paint ? undefined : typeDot}
                swatchStyle={paint ? { backgroundColor: paint.accent } : undefined}
                hex={hex}
                expanded={expandedKey === key}
                onToggle={() => setExpandedKey((cur) => (cur === key ? null : key))}
                onChange={(next) => typeColors.setColor(o.value, next)}
                allowNone
              />
            );
          })}
        </ul>
      </div>
    </Popover>
  );
}
