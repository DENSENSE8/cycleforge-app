'use client';

import { useEffect, useState } from 'react';
import {
  DENSITY_OPTIONS,
  FONT_SCALE_OPTIONS,
  getAppearance,
  setAppearance,
  WASH_NAMES,
  type AppearanceSettings,
  type Density,
  type WashName,
} from '@/lib/settings/appearance';
import { WASH_PRESETS } from '@/design-system/tokens/app-surface';
import { useStaffPreferences } from '@/hooks/useStaffPreferences';
import { useTimeFormat } from '@/lib/time-format/useTimeFormat';
import { setTimeFormat } from '@/lib/time-format/store';
import { TIME_FORMAT_VALUES, type TimeFormat } from '@/lib/schemas/staff-preferences';
import { formatTime12hPST } from '@/utils/date';
import { applyTheme, applyAccentTheme, type ThemeName } from '@/lib/theme/theme';
import {
  THEME_NAMES,
  THEME_PALETTES,
  resolveTheme,
  type ThemePalette,
} from '@/design-system/themes/registry';
import { useAuth } from '@/contexts/AuthContext';
import { RoleColorPicker } from '@/components/admin/roles/RoleColorPicker';
import { getStaffColorHex, themeFromHex } from '@/utils/staff-colors';
import {
  DEFAULT_CUSTOM_ACCENT_HEX,
  resolveOperatorAccentTheme,
  resolvesUseStaffAccent,
} from '@/utils/operator-accent';
import { Switch } from '@/design-system/primitives/Switch';
import { StaffPhotoCard } from './StaffPhotoCard';

/**
 * True palette miniature — a tiny "app" rendered from the theme's actual
 * variables (canvas, card, text bars, accent chip, status-dot triad), so the
 * preview IS the theme, not an approximation. Inline styles are required
 * here: these are cross-theme colors shown while a different theme is active.
 */
function ThemePreviewMini({ palette }: { palette: ThemePalette }) {
  const { vars } = palette;
  const accent = palette.accent?.bg ?? palette.preview.accent;
  return (
    <span
      aria-hidden
      className="block h-16 w-full overflow-hidden rounded-lg border border-border-soft"
      style={{ backgroundColor: vars['background-canvas'] }}
    >
      <span
        className="mx-2 mt-2 block rounded-md p-1.5 shadow-sm"
        style={{
          backgroundColor: vars['background-surface'],
          border: `1px solid ${vars['border-subtle']}`,
        }}
      >
        <span className="block h-1.5 w-10 rounded-full" style={{ backgroundColor: vars['text-primary'] }} />
        <span className="mt-1 block h-1 w-16 rounded-full" style={{ backgroundColor: vars['text-faint'] }} />
        <span className="mt-1.5 flex items-center gap-1">
          <span className="h-2 w-6 rounded-full" style={{ backgroundColor: accent }} />
          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: vars['fill-success'] }} />
          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: vars['fill-warning'] }} />
          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: vars['fill-danger'] }} />
        </span>
      </span>
    </span>
  );
}

/** Chrome strip + washed content with soft TL radius — teaches the shell join. */
function WashPreviewMini({ wash }: { wash: WashName }) {
  const preset = WASH_PRESETS[wash];
  return (
    <span
      aria-hidden
      className="relative block h-16 w-full overflow-hidden rounded-lg border border-border-soft bg-surface-card"
    >
      <span className="absolute inset-y-0 left-0 w-3 bg-surface-card" />
      <span className="absolute inset-x-0 top-0 h-3 bg-surface-card" />
      <span
        className="absolute inset-0 left-3 top-3 overflow-hidden rounded-tl-xl border-l border-t border-border-hairline"
        style={{
          backgroundImage: `linear-gradient(180deg, ${preset.previewFrom} 0%, ${preset.previewTo} 100%)`,
        }}
      />
    </span>
  );
}

const DENSITY_LABELS: Record<Density, string> = {
  compact: 'Compact',
  cozy: 'Cozy',
  comfortable: 'Comfortable',
};

const DENSITY_HINTS: Record<Density, string> = {
  compact: 'Tighter spacing — fits more rows.',
  cozy: 'Balanced spacing.',
  comfortable: 'Roomier — easier to read.',
};

const TIME_FORMAT_LABELS: Record<TimeFormat, string> = {
  '12h': '12-hour',
  '24h': '24-hour',
};

const TIME_FORMAT_HINTS: Record<TimeFormat, string> = {
  '12h': 'AM / PM',
  '24h': '00:00–23:59',
};

function AccentToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4">
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-text-default">{label}</span>
        {description ? (
          <span className="mt-0.5 block text-role-caption text-text-soft">{description}</span>
        ) : null}
      </span>
      <Switch checked={checked} onCheckedChange={onChange} aria-label={label} />
    </label>
  );
}

export function AppearanceSection() {
  const [settings, setSettings] = useState<AppearanceSettings>({
    density: 'cozy',
    fontScale: 1.0,
    pageWash: 'mint',
  });

  useEffect(() => { setSettings(getAppearance()); }, []);

  const { prefs, update } = useStaffPreferences();
  const { user } = useAuth();
  // Unknown/stale stored names resolve to light, so the switcher never shows
  // an impossible selection.
  const currentTheme: ThemeName = resolveTheme(prefs?.theme).name;
  const useStaffAccent = resolvesUseStaffAccent(prefs);
  const staffColorHex = user?.staffId
    ? getStaffColorHex({ id: user.staffId })
    : DEFAULT_CUSTOM_ACCENT_HEX;
  const customAccentHex = prefs?.accentHex ?? staffColorHex;

  // Live clock-format preference (12h/24h). The store handles the instant local
  // flip + localStorage cache; <TimeFormatSync/> mirrors it to the server.
  const timeFormat = useTimeFormat();

  function updateTheme(t: ThemeName) {
    applyTheme(t); // instant local feedback
    update({ theme: t }); // durable, cross-device via staff_preferences
  }

  function updateTimeFormat(tf: TimeFormat) {
    setTimeFormat(tf); // instant local feedback + persists via the registered persister
  }

  function updateDensity(d: Density) {
    setSettings(setAppearance({ density: d }));
  }

  function updateFontScale(s: number) {
    setSettings(setAppearance({ fontScale: s }));
  }

  function updatePageWash(wash: WashName) {
    setSettings(setAppearance({ pageWash: wash }));
  }

  function updateUseStaffAccent(next: boolean) {
    if (!user?.staffId) {
      update({ useStaffAccent: next });
      return;
    }
    const patch = next
      ? { useStaffAccent: true as const }
      : { useStaffAccent: false as const, accentHex: prefs?.accentHex ?? staffColorHex };
    applyAccentTheme(resolveOperatorAccentTheme({ ...prefs, ...patch }, user.staffId));
    update(patch);
  }

  function updateAccentHex(hex: string) {
    applyAccentTheme(themeFromHex(hex));
    update({ accentHex: hex, useStaffAccent: false });
  }

  return (
    <div className="space-y-6">
      <header>
        <h2 className="sr-only">Appearance</h2>
        <p className="mt-1 text-sm text-text-soft">How the interface looks on this device.</p>
      </header>

      {/* Identity first: the photo follows the staffer across every device,
          unlike the device-scoped density/text/wash controls below it. */}
      <StaffPhotoCard />

      <div className="rounded-none border border-border-soft bg-surface-card p-5 shadow-sm">
        <h3 className="mb-3 text-sm font-semibold text-text-default">UI density</h3>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {DENSITY_OPTIONS.map((d) => {
            const isActive = settings.density === d;
            return (
              <button
                key={d}
                type="button"
                onClick={() => updateDensity(d)}
                className={`ds-raw-button rounded-none border px-4 py-3 text-left transition ${
                  isActive
                    ? 'border-blue-500 bg-blue-50 text-text-default ring-2 ring-blue-500/20'
                    : 'border-border-soft bg-surface-card text-text-muted hover:border-border-default hover:bg-surface-canvas'
                }`}
                aria-pressed={isActive}
              >
                <div className="text-sm font-semibold">{DENSITY_LABELS[d]}</div>
                <div className="mt-1 text-role-caption text-text-soft">{DENSITY_HINTS[d]}</div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="rounded-none border border-border-soft bg-surface-card p-5 shadow-sm">
        <h3 className="mb-3 text-sm font-semibold text-text-default">Text size</h3>
        <div className="flex flex-wrap items-center gap-2">
          {FONT_SCALE_OPTIONS.map((scale) => {
            const isActive = Math.abs(settings.fontScale - scale) < 0.01;
            return (
              <button
                key={scale}
                type="button"
                onClick={() => updateFontScale(scale)}
                className={`ds-raw-button min-w-16 rounded-none border px-4 py-2 font-medium transition ${
                  isActive
                    ? 'border-blue-500 bg-blue-50 text-text-default ring-2 ring-blue-500/20'
                    : 'border-border-soft bg-surface-card text-text-muted hover:border-border-default hover:bg-surface-canvas'
                }`}
                style={{ fontSize: `${14 * scale}px` }}
                aria-pressed={isActive}
              >
                {Math.round(scale * 100)}%
              </button>
            );
          })}
        </div>
        <p className="mt-3 text-role-caption text-text-soft">
          Applies globally. 100% is the default; higher values are easier to read from across the warehouse.
        </p>
      </div>

      <div className="rounded-none border border-border-soft bg-surface-card p-5 shadow-sm">
        <h3 className="mb-3 text-sm font-semibold text-text-default">Time format</h3>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {TIME_FORMAT_VALUES.map((tf) => {
            const isActive = timeFormat === tf;
            // Real formatter output for a sample afternoon instant, so the
            // preview always matches what the app will actually render.
            const sample = formatTime12hPST('2026-01-01 16:17:00', { hour12: tf === '12h' });
            return (
              <button
                key={tf}
                type="button"
                onClick={() => updateTimeFormat(tf)}
                className={`ds-raw-button rounded-none border px-4 py-3 text-left transition ${
                  isActive
                    ? 'border-blue-500 bg-blue-50 text-text-default ring-2 ring-blue-500/20'
                    : 'border-border-soft bg-surface-card text-text-muted hover:border-border-default hover:bg-surface-canvas'
                }`}
                aria-pressed={isActive}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold">{TIME_FORMAT_LABELS[tf]}</span>
                  <span className="text-role-caption font-semibold tabular-nums text-text-soft">{sample}</span>
                </div>
                <div className="mt-1 text-role-caption text-text-soft">{TIME_FORMAT_HINTS[tf]}</div>
              </button>
            );
          })}
        </div>
        <p className="mt-3 text-role-caption text-text-soft">
          Applies to every timestamp across the app. Saved to your account — follows you across devices.
        </p>
      </div>

      <div className="rounded-none border border-border-soft bg-surface-card p-5 shadow-sm">
        <h3 className="mb-3 text-sm font-semibold text-text-default">Accent color</h3>
        <p className="mb-4 text-role-caption text-text-soft">
          Highlights action buttons, section tabs, and other operator chrome — the same tint as
          dashboard tabs and station floating actions.
        </p>

        <AccentToggleRow
          label="Use my staff color"
          description="Follows your identity color set in Staff settings. Recommended."
          checked={useStaffAccent}
          onChange={updateUseStaffAccent}
        />

        {useStaffAccent ? (
          <div className="mt-4 flex items-center gap-3 rounded-none border border-border-soft bg-surface-canvas px-4 py-3">
            <span
              aria-hidden
              className="h-8 w-8 shrink-0 rounded-full ring-2 ring-white ring-offset-2 ring-offset-surface-canvas"
              style={{ backgroundColor: staffColorHex }}
            />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-text-default">Staff identity color</p>
              <p className="text-role-caption font-mono text-text-soft">{staffColorHex}</p>
            </div>
          </div>
        ) : (
          <div className="mt-4 space-y-3 rounded-none border border-border-soft bg-surface-canvas px-4 py-3">
            <p className="text-sm font-semibold text-text-default">Custom accent</p>
            <RoleColorPicker value={customAccentHex} onChange={updateAccentHex} />
          </div>
        )}

        <p className="mt-3 text-role-caption text-text-soft">
          Saved to your account — follows you across devices.
        </p>
      </div>

      <div className="rounded-none border border-border-soft bg-surface-card p-5 shadow-sm">
        <h3 className="mb-3 text-sm font-semibold text-text-default">Page background</h3>
        <p className="mb-3 text-role-caption text-text-soft">
          Soft wash behind Unbox, receiving, and admin workbenches. Chrome (sidebar + header)
          stays flat; the content corner keeps a visible radius hairline.
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {WASH_NAMES.map((name) => {
            const preset = WASH_PRESETS[name];
            const isActive = settings.pageWash === name;
            return (
              <button
                key={name}
                type="button"
                onClick={() => updatePageWash(name)}
                className={`ds-raw-button rounded-none border p-2 text-left transition ${
                  isActive
                    ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-500/20'
                    : 'border-border-soft bg-surface-card hover:border-border-default hover:bg-surface-canvas'
                }`}
                aria-pressed={isActive}
              >
                <WashPreviewMini wash={name} />
                <span className="mt-2 flex items-center justify-between px-0.5">
                  <span className="text-role-caption font-semibold text-text-default">{preset.label}</span>
                  {isActive ? (
                    <span className="h-2 w-2 rounded-full bg-blue-500" aria-hidden />
                  ) : null}
                </span>
                <span className="mt-0.5 block truncate px-0.5 text-role-micro text-text-soft">
                  {preset.hint}
                </span>
              </button>
            );
          })}
        </div>
        <p className="mt-3 text-role-caption text-text-soft">
          Saved on this device. Theme still owns the absolute colors.
        </p>
      </div>

      <div className="rounded-none border border-border-soft bg-surface-card p-5 shadow-sm">
        <h3 className="mb-3 text-sm font-semibold text-text-default">Theme</h3>
        {/* Options come straight from the theme registry — registering a new
            palette (src/design-system/themes/registry.ts) lists it here with
            zero switcher changes. Grouped by scheme: light-family first, then
            dark-family (which also flips native widgets + the neutral remap). */}
        <div className="space-y-4">
          {(['light', 'dark'] as const).map((scheme) => {
            const names = THEME_NAMES.filter((n) => THEME_PALETTES[n].scheme === scheme);
            if (names.length === 0) return null;
            return (
              <div key={scheme}>
                <p className="mb-2 text-role-eyebrow uppercase tracking-widest text-text-soft">
                  {scheme === 'light' ? 'Light themes' : 'Dark themes'}
                </p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {names.map((name) => {
                    const palette = THEME_PALETTES[name];
                    const isActive = currentTheme === name;
                    return (
                      <button
                        key={name}
                        type="button"
                        onClick={() => updateTheme(name)}
                        className={`ds-raw-button rounded-none border p-2 text-left transition ${
                          isActive
                            ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-500/20'
                            : 'border-border-soft bg-surface-card hover:border-border-default hover:bg-surface-canvas'
                        }`}
                        aria-pressed={isActive}
                      >
                        <ThemePreviewMini palette={palette} />
                        <span className="mt-2 flex items-center justify-between px-0.5">
                          <span className="text-role-caption font-semibold text-text-default">{palette.label}</span>
                          {isActive ? (
                            <span className="h-2 w-2 rounded-full bg-blue-500" aria-hidden />
                          ) : null}
                        </span>
                        <span className="mt-0.5 block truncate px-0.5 text-role-micro text-text-soft">
                          {palette.hint}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-role-caption text-text-soft">
          Saved to your account — follows you across devices.
        </p>
      </div>
    </div>
  );
}
