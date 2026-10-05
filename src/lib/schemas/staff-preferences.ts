import { z } from 'zod';
import { isFnskuCopyRange } from '@/lib/print/labelCopies';
import {
  ACCENT_HEX_RE,
  DEFAULT_FOCUS_SCAN_HOTKEY,
  DEFAULT_THEME,
  DEFAULT_STATION_DEPTH_PREF,
  DEFAULT_STATION_SKIN_PREF,
  DEFAULT_TIME_FORMAT,
  FOCUS_SCAN_ALWAYS_AVAILABLE_RE,
  FOCUS_SCAN_HOTKEY_OPTIONS,
  isBindableFocusScanHotkey,
  STAFF_THEMES,
  STAFF_STATION_DEPTHS,
  STAFF_STATION_SKINS,
  TIME_FORMAT_VALUES,
  type StaffTheme,
  type StaffStationDepth,
  type StaffStationSkin,
  type TimeFormat,
} from '@/lib/schemas/staff-preferences-constants';
import type { ThemeName } from '@/design-system/themes/registry';
import type { StationDepthName } from '@/design-system/themes/station-depths';
import type { StationSkinName } from '@/design-system/themes/station-skins';

/** The constants live in `staff-preferences-constants.ts` — a module with no `zod` import — and are re-exported here so every existing… */
export {
  ACCENT_HEX_RE,
  DEFAULT_FOCUS_SCAN_HOTKEY,
  DEFAULT_THEME,
  DEFAULT_STATION_DEPTH_PREF,
  DEFAULT_STATION_SKIN_PREF,
  DEFAULT_TIME_FORMAT,
  FOCUS_SCAN_ALWAYS_AVAILABLE_RE,
  FOCUS_SCAN_HOTKEY_OPTIONS,
  isBindableFocusScanHotkey,
  STAFF_THEMES,
  STAFF_STATION_DEPTHS,
  STAFF_STATION_SKINS,
  TIME_FORMAT_VALUES,
};
export type { StaffTheme, StaffStationDepth, StaffStationSkin, TimeFormat };
import { MAX_PINS } from '@/lib/quick-access/types';
import { UNBOX_PINNED_EXTRA_TABS_MAX } from '@/lib/receiving/unbox-extra-tabs';

/**
 * Header pin stations — ordered bookmarks with display label + exact href
 * (path + search). Mirrored to localStorage `cf.quickAccess` for flash-free
 * reads; this bag is the durable cross-device SoT. Visit MRU stays device-local.
 */
const QUICK_ACCESS_PINNED_PAGE = z
  .object({
    id: z.string().min(1).max(64),
    /** Display name shown in tooltips / Settings. */
    label: z.string().min(1).max(120),
    /** Exact route, e.g. `/unbox?openReceivingId=50297`. Must be app-relative. */
    href: z
      .string()
      .min(1)
      .max(2000)
      .refine((s) => s.startsWith('/'), 'href must start with /'),
    iconKey: z.string().max(64).optional(),
    addedAt: z.number().int().nonnegative(),
  })
  .strict();

const QUICK_ACCESS_PREFS = z
  .object({
    pinned: z.array(QUICK_ACCESS_PINNED_PAGE).max(MAX_PINS),
  })
  .strict();

/**
 * PUT body for /api/staff-preferences — a partial patch. Only the keys present
 * are changed (server merges into the JSONB bag). `focusScanHotkey: null`
 * clears the binding back to the default; `theme: null` resets to light.
 */
export const StaffPreferencesPutBody = z
  .object({
    focusScanHotkey: z
      .string()
      .min(1)
      .max(32)
      .refine(isBindableFocusScanHotkey, 'Hotkey must be a single non-reserved key')
      .nullable()
      .optional(),
    theme: z.enum(STAFF_THEMES as [ThemeName, ...ThemeName[]]).nullable().optional(),
    /** Scan-station Color (porcelain, packing bench, coal, catalog materials). */
    stationSkin: z
      .enum(STAFF_STATION_SKINS as [StationSkinName, ...StationSkinName[]])
      .nullable()
      .optional(),
    /**
     * Scan-station depth (flat | mill | deep). `null` resets to flat.
     * Independent of Color (`stationSkin`) — relief only.
     */
    stationDepth: z
      .enum(STAFF_STATION_DEPTHS as [StationDepthName, ...StationDepthName[]])
      .nullable()
      .optional(),
    /**
     * Clock display format for all rendered timestamps. `null` resets to the
     * default (`12h`). Display-only — never affects stored/API timestamps.
     */
    timeFormat: z.enum(TIME_FORMAT_VALUES).nullable().optional(),
    /**
     * When true (default), operator accent chrome (`bg-accent-bg`, section tab
     * pills, floating CTAs) follows `staff.color_hex`. When false, uses
     * `accentHex` instead. `null` resets to the default (staff color ON).
     */
    useStaffAccent: z.boolean().nullable().optional(),
    /**
     * Personal accent hex when `useStaffAccent` is false. Snapped to the nearest
     * station theme at apply time. `null` clears back to the default blue anchor.
     */
    accentHex: z
      .string()
      .regex(ACCENT_HEX_RE, 'Accent color must be a #RRGGBB hex value')
      .nullable()
      .optional(),
    /**
     * "Skip for now" on the dashboard Getting-Started checklist. `true` hides
     * the card; `null` clears the dismissal (re-opens it). The underlying
     * read-time step truth is never deleted (onboarding-foundational-plan §4).
     */
    onboardingDismissed: z.boolean().nullable().optional(),
    /**
     * Last product-update catalog id the staffer dismissed ("Got it").
     * Kept so existing `staff_preferences` bags still parse; the What's-new
     * host is no longer mounted.
     */
    lastSeenProductUpdateId: z.string().nullable().optional(),
    /**
     * Last catalog buildSha the staffer dismissed. Kept for the same
     * parse-compat reason as `lastSeenProductUpdateId`.
     */
    lastSeenBuildSha: z.string().nullable().optional(),
    /** Per-staff list-table column config, keyed by TableId. */
    tableColumns: z
      .record(
        z.string(),
        z
          .object({
            /** `core` columns this staffer turned OFF. */
            hidden: z.array(z.string()).optional(),
            /** `optional` columns this staffer turned ON (opt-in delta). */
            shown: z.array(z.string().max(64)).max(64).optional(),
            /** Per-column drag-resized width in px, keyed by column key. */
            widths: z.record(z.string(), z.number().int().positive().max(2000)).optional(),
            /**
             * Per-column staff min/max resize clamps (px), keyed by column key.
             * Absolute rails stay 64…2000; unset max defaults to house 720 at
             * clamp time. Sibling of `widths` — writers preserve both.
             */
            widthBounds: z
              .record(
                z.string().max(64),
                z
                  .object({
                    min: z.number().int().positive().max(2000).optional(),
                    max: z.number().int().positive().max(2000).optional(),
                  })
                  .strict(),
              )
              .optional(),
            /** Drag-reordered column-key order (sanitized on read; locked keys
             *  re-front themselves — a stale/hostile list is harmless). */
            order: z.array(z.string().max(64)).max(64).optional(),
            /**
             * Per-hideKey display prefs (highlight wash + cell chrome).
             * Keyed by the same `hideKey` vocabulary as `hidden` / `shown`.
             */
            display: z
              .record(
                z.string().max(64),
                z
                  .object({
                    // Free `#rrggbb` (Sheets-style). Legacy named washes still
                    // accepted on write so older clients / prefs round-trip;
                    // readers normalize via `normalizeGridColumnHighlight`.
                    highlight: z
                      .union([
                        z.literal('none'),
                        z.enum(['blue', 'amber', 'rose', 'emerald']),
                        z.string().regex(/^#[0-9a-fA-F]{6}$/),
                      ])
                      .optional(),
                    cell: z.enum(['default', 'chip']).optional(),
                    /**
                     * Named text emphasis (never free hex). Absent / default =
                     * house text color.
                     */
                    text: z
                      .enum([
                        'default',
                        'muted',
                        'emphasis',
                        'warning',
                        'critical',
                      ])
                      .optional(),
                  })
                  .strict(),
              )
              .optional(),
            /**
             * Per-row fill washes (Unbox History paint-bucket). Keyed by
             * stringified row id; same highlight vocabulary as column
             * `display.highlight` (Rose + siblings via GRID_HIGHLIGHT_PRESETS).
             */
            rowFills: z
              .record(
                z.string().max(64),
                z.union([
                  z.literal('none'),
                  z.enum(['blue', 'amber', 'rose', 'emerald']),
                  z.string().regex(/^#[0-9a-fA-F]{6}$/),
                ]),
              )
              .optional(),
            /**
             * Record row zoom per list and staff. S = one 32px line, M = 3 × 32px bands
             * (default), L = 3 × 36px bands.
             */
            rowZoom: z.enum(['S', 'M', 'L']).optional(),
          })
          .strict(),
      )
      .nullable()
      .optional(),
    /**
     * GlobalHeader pin stations (display label + exact href routing). `null`
     * clears pins; absent leaves them unchanged. Device visit-MRU stays local.
     */
    quickAccess: QUICK_ACCESS_PREFS.nullable().optional(),
    /**
     * Workbench sheet-chrome KPI Band 2 snap-collapse, keyed by surface id
     * (`unbox`, … — see `WORKBENCH_KPI_SURFACE`). `true` = collapsed (hidden).
     * Absent / false = open. Shallow JSONB merge: writers send the whole map.
     */
    /** @deprecated Dead since 2026-08-29 — the workbench KPI bands were removed (`docs/todo/one-sheet-table-sot-PLAN.md` § 3.5) and nothing… */
    kpiCollapsed: z.record(z.string().max(64), z.boolean()).nullable().optional(),
    /** Extra Unbox Band-1 tabs pinned via the Pin-list composer (`unbox-extra-tabs` catalog). */
    unboxPinnedExtraTabs: z
      .array(z.literal('incoming'))
      .max(UNBOX_PINNED_EXTRA_TABS_MAX)
      .nullable()
      .optional(),
    /**
     * Triage list density per surface key (`useTriageDensity`): `card` = Full,
     * `row` = Compact. Shallow JSONB merge — writers send the whole map.
     */
    triageDensity: z.record(z.string().max(64), z.enum(['card', 'row'])).nullable().optional(),
    /** FNSKU quantity slider scale (`useFnskuCopyRange`): 20, 30 or 99. A UI scale, not a print limit. */
    fnskuCopyRange: z
      .number()
      .refine(isFnskuCopyRange, { message: 'fnskuCopyRange must be 20, 30 or 99' })
      .nullable()
      .optional(),
  })
  .strict();

export type StaffPreferencesPutBody = z.infer<typeof StaffPreferencesPutBody>;
