'use client';

/**
 * Compact classify-color editor for carton identity chrome — pencil opens a
 * flush {@link Popover} listing org platforms (editable `color_hex` via the
 * same PATCH CatalogManagerList uses) and receiving types (built-in tone
 * dots — types do not persist `color_hex`).
 */

import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Pencil } from '@/components/Icons';
import { ColorSwatchPicker, type ColorSwatch } from '@/components/ui/ColorSwatchPicker';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { IconButton, Popover } from '@/design-system/primitives';
import { microBadge } from '@/design-system/tokens/typography/presets';
import { useInvalidateCatalog, useReceivingTypeCatalog } from '@/hooks/useCatalog';
import { platformPaintFromHex } from '@/lib/color-contrast';
import { platformsQuery } from '@/lib/queries/catalog-queries';
import { receivingTypeMeta } from '@/lib/receiving/receiving-type-meta';
import { platformMetaBrandDot, sourcePlatformMeta } from '@/lib/source-platform';
import { toast } from '@/lib/toast';
import { cn } from '@/utils/_cn';

const PLATFORM_COLOR_PRESETS: ReadonlyArray<ColorSwatch> = [
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

export function CartonClassifyColorPopover({
  disabled = false,
  className,
}: {
  disabled?: boolean;
  className?: string;
}) {
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const invalidate = useInvalidateCatalog();
  const platformQ = useQuery({
    ...platformsQuery({ includeInactive: false }),
    enabled: open,
  });
  const platforms = platformQ.data ?? [];
  const typeCatalog = useReceivingTypeCatalog();
  const typeOptions = typeCatalog.options.filter((o) => o.value !== 'PICKUP');

  async function savePlatformColor(id: number, colorHex: string | null) {
    if (busyId != null) return;
    setBusyId(id);
    const res = await fetch(`/api/catalog/platforms/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ colorHex }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.success) {
      toast.error(data?.error || `Save failed (${res.status})`);
    } else {
      invalidate();
    }
    setBusyId(null);
  }

  return (
    <>
      <HoverTooltip label="Edit platform & type colors" asChild>
        <IconButton
          ref={triggerRef}
          type="button"
          tone="neutral"
          size="sm"
          disabled={disabled}
          ariaLabel="Edit platform and type colors"
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          icon={<Pencil className="h-3.5 w-3.5" />}
          className={cn(
            'h-full shrink-0 rounded-none border-0 border-l border-border-soft bg-surface-card px-1.5 text-text-faint shadow-none hover:bg-surface-hover hover:text-text-muted',
            className,
          )}
          data-testid="carton-context-color-edit"
        />
      </HoverTooltip>
      <Popover
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={triggerRef}
        placement="bottom-end"
        gap={4}
        role="dialog"
        aria-label="Platform and type colors"
        className="max-h-[min(70vh,24rem)] w-[min(94vw,20rem)] overflow-y-auto border border-border-soft bg-surface-card p-0 shadow-md"
      >
        <div className="border-b border-border-soft px-3 py-2">
          <span className={`${microBadge} text-text-muted`}>Classify colors</span>
        </div>
        <div className="space-y-3 px-3 py-2">
          <section>
            <h3 className={`${microBadge} mb-2 text-text-soft`}>Platforms</h3>
            <ul className="space-y-2">
              {platforms.map((row) => {
                const meta = sourcePlatformMeta(row.slug);
                const paint = row.color_hex ? platformPaintFromHex(row.color_hex) : null;
                const markMeta = paint
                  ? {
                      ...meta,
                      value: meta.value || row.slug.toLowerCase(),
                      label: row.label,
                      accentHex: paint.accent,
                    }
                  : { ...meta, value: meta.value || row.slug.toLowerCase(), label: row.label };
                const dot = platformMetaBrandDot(markMeta);
                return (
                  <li
                    key={row.id}
                    className="rounded-none border border-border-soft bg-surface-card px-2 py-1.5"
                  >
                    <div className="mb-1.5 flex items-center gap-2">
                      <span
                        className={cn('h-2 w-2 shrink-0 rounded-full', dot.className)}
                        style={dot.style}
                        aria-hidden
                      />
                      <span className="min-w-0 flex-1 truncate text-role-caption font-medium text-text-default">
                        {row.label}
                      </span>
                    </div>
                    <ColorSwatchPicker
                      value={row.color_hex ?? null}
                      onChange={(hex) => void savePlatformColor(row.id, hex)}
                      presets={PLATFORM_COLOR_PRESETS}
                      shape="square"
                      disabled={busyId === row.id}
                    />
                  </li>
                );
              })}
            </ul>
          </section>
          <section className="border-t border-border-soft pt-2">
            <h3 className={`${microBadge} mb-2 text-text-soft`}>Types</h3>
            <ul className="space-y-1">
              {typeOptions.map((o) => {
                const meta = receivingTypeMeta(o.value);
                const dotClass = meta.text.replace(/^text-/, 'bg-');
                return (
                  <li
                    key={o.value}
                    className="flex items-center gap-2 rounded-none border border-border-soft bg-surface-card px-2 py-1 text-role-caption text-text-default"
                  >
                    <span className={cn('h-2 w-2 shrink-0 rounded-full', dotClass)} aria-hidden />
                    <span className="min-w-0 flex-1 truncate">{o.label}</span>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>
      </Popover>
    </>
  );
}
