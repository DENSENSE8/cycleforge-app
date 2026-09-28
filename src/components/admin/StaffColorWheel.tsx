'use client';

/** Color wheel picker for staff identity color. */

import { useRef } from 'react';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';



interface StaffColorWheelProps {
  value: string;
  onChange: (hex: string) => void;
  disabled?: boolean;
  /** Outer wheel diameter in px. Defaults to 72. */
  size?: number;
}

// Full hue ring (red → orange → yellow → green → emerald → cyan → blue →
// indigo → purple → pink → red) so the conic gradient reads as a real
// color wheel.
const HUE_CONIC = [
  '#ef4444', '#f59e0b', '#eab308', '#22c55e', '#10b981',
  '#06b6d4', '#3b82f6', '#6366f1', '#a855f7', '#ec4899', '#ef4444',
].join(', ');

export function StaffColorWheel({ value, onChange, disabled, size = 72 }: StaffColorWheelProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  return (
    <div className="flex items-center gap-3">
      <HoverTooltip label="Click to open color wheel" asChild>
        {/* ds-raw-button: conic-gradient color-swatch tile wrapping a native color input — not a DS Button */}
        <button
          type="button"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
          aria-label={`Pick staff color (current ${value})`}
          className={cn("group relative flex flex-shrink-0 items-center justify-center rounded-full p-1.5 shadow-md shadow-gray-900/15 transition hover:scale-105 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-50", focusRing('field', 'neutral'))}
          style={{
            width: size,
            height: size,
            background: `conic-gradient(from 90deg, ${HUE_CONIC})`,
          }}
        >
          <span
            className="block h-full w-full rounded-full ring-2 ring-white shadow-inner"
            style={{ backgroundColor: value }}
            aria-hidden
          />
          <input
            ref={inputRef}
            type="color"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            className="absolute inset-0 cursor-pointer opacity-0"
            aria-hidden
          />
        </button>
      </HoverTooltip>
      <code className="rounded-full bg-surface-sunken px-3 py-1.5 text-role-caption font-mono text-text-muted">
        {value}
      </code>
    </div>
  );
}
