'use client';

/**
 * Color picker for the Role editor identity card.
 *
 * Thin wrapper around {@link ColorSwatchPicker} with the staff-theme preset
 * palette (8 mid-saturation tints + 4 neutrals).
 */

import {
  ColorSwatchPicker,
  type ColorSwatch,
} from '@/components/ui/ColorSwatchPicker';

interface RoleColorPickerProps {
  value: string;
  onChange: (hex: string) => void;
  disabled?: boolean;
}

// 8 staff-theme tints (mid-saturation) + 4 neutrals. Chosen to match the
// vibe of staff-colors.ts so a new role visually slots into the existing
// palette without clashing.
const PRESETS: ReadonlyArray<ColorSwatch> = [
  { hex: '#10b981', label: 'Emerald' },
  { hex: '#0ea5e9', label: 'Sky' },
  { hex: '#a855f7', label: 'Purple' },
  { hex: '#f59e0b', label: 'Amber' },
  { hex: '#ef4444', label: 'Red' },
  { hex: '#ec4899', label: 'Pink' },
  { hex: '#06b6d4', label: 'Cyan' },
  { hex: '#84cc16', label: 'Lime' },
  { hex: '#1f2937', label: 'Slate' },
  { hex: '#6b7280', label: 'Gray' },
  { hex: '#3b82f6', label: 'Blue' },
  { hex: '#22c55e', label: 'Green' },
];

export function RoleColorPicker({ value, onChange, disabled }: RoleColorPickerProps) {
  return (
    <ColorSwatchPicker
      value={value}
      onChange={(hex) => {
        if (hex) onChange(hex);
      }}
      presets={PRESETS}
      showHex
      shape="round"
      disabled={disabled}
    />
  );
}
