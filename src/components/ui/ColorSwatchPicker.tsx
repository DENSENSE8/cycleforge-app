'use client';

/** Controlled color swatch picker — preset grid + native custom `<input type="color">`. */

import { useRef } from 'react';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { cn } from '@/utils/_cn';

export type ColorSwatch = { hex: string; label: string };

interface ColorSwatchPickerProps {
  /** Current hex (`#rrggbb`). Null/empty when {@link allowNone} and nothing is picked. */
  value: string | null;
  onChange: (hex: string | null) => void;
  presets: readonly ColorSwatch[];
  /** Leading "None" control that clears the value. */
  allowNone?: boolean;
  /** Show the live hex chip after the swatches. */
  showHex?: boolean;
  /** `round` = role/avatar chips; `square` = Sheets-like cell fills. */
  shape?: 'round' | 'square';
  disabled?: boolean;
  className?: string;
}

function eq(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

export function ColorSwatchPicker({
  value,
  onChange,
  presets,
  allowNone = false,
  showHex = false,
  shape = 'round',
  disabled = false,
  className,
}: ColorSwatchPickerProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const normalized = value?.trim() ? value.trim() : null;
  const isCustom = Boolean(normalized && !presets.some((p) => eq(p.hex, normalized)));
  const swatchShape = shape === 'square' ? 'rounded-sm' : 'rounded-full';

  return (
    <div className={cn('flex flex-wrap items-center gap-1.5', className)} role="radiogroup" aria-label="Color">
      {allowNone ? (
        <HoverTooltip label="None" asChild>
          {/* ds-raw-button */}
          <button
            type="button"
            role="radio"
            aria-checked={!normalized}
            aria-label="None"
            data-highlight="none"
            disabled={disabled}
            onClick={() => onChange(null)}
            className={cn(
              'relative flex h-7 w-7 items-center justify-center bg-surface-card ring-2 transition disabled:cursor-not-allowed',
              swatchShape,
              !normalized
                ? 'ring-border-strong ring-offset-2 ring-offset-white'
                : 'ring-border-soft hover:ring-border-default',
            )}
          >
            <span className="block h-px w-3.5 rotate-45 bg-text-muted" aria-hidden />
          </button>
        </HoverTooltip>
      ) : null}

      {presets.map((p) => {
        const selected = Boolean(normalized && eq(p.hex, normalized));
        return (
          <HoverTooltip key={p.hex} label={p.label} asChild>
            {/* ds-raw-button */}
            <button
              type="button"
              role="radio"
              aria-checked={selected}
              data-highlight={p.hex}
              onClick={() => onChange(p.hex)}
              disabled={disabled}
              aria-label={`${p.label} (${p.hex})${selected ? ' — selected' : ''}`}
              className={cn(
                'relative h-7 w-7 ring-2 transition disabled:cursor-not-allowed',
                swatchShape,
                selected
                  ? 'ring-border-strong ring-offset-2 ring-offset-white'
                  : 'ring-white hover:ring-border-default',
              )}
              style={{ backgroundColor: p.hex }}
            />
          </HoverTooltip>
        );
      })}

      <HoverTooltip label="Custom" asChild>
        {/* ds-raw-button */}
        <button
          type="button"
          role="radio"
          aria-checked={isCustom}
          aria-label="Pick a custom color"
          data-highlight="custom"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
          className={cn(
            'relative h-7 w-7 overflow-hidden ring-2 transition disabled:cursor-not-allowed',
            swatchShape,
            isCustom
              ? 'ring-border-strong ring-offset-2 ring-offset-white'
              : 'ring-white hover:ring-border-default',
          )}
          style={{
            background: isCustom && normalized
              ? normalized
              : 'conic-gradient(from 90deg, #ef4444, #f59e0b, #22c55e, #06b6d4, #3b82f6, #a855f7, #ec4899, #ef4444)',
          }}
        >
          <input
            ref={inputRef}
            type="color"
            value={normalized ?? '#eff6ff'}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            className="absolute inset-0 cursor-pointer opacity-0"
            aria-hidden
          />
        </button>
      </HoverTooltip>

      {showHex && normalized ? (
        <code className="rounded-md bg-surface-sunken inset-chip text-role-micro font-mono text-text-muted">
          {normalized}
        </code>
      ) : null}
    </div>
  );
}
