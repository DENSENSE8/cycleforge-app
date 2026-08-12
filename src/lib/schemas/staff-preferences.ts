import { z } from 'zod';
import { THEME_NAMES, type ThemeName } from '@/design-system/themes/registry';
import { MAX_PINS } from '@/lib/quick-access/types';
import { UNBOX_PINNED_EXTRA_TABS_MAX } from '@/lib/receiving/unbox-extra-tabs';

/**
 * Keys that reclaim focus even while an editable field is focused — warehouse
 * classics a barcode wedge can emit without colliding with typed text.
 * Printable / named keys outside this set are still bindable, but the global
 * listener yields over inputs (see `isEditableKeyTarget`).
 */
export const FOCUS_SCAN_ALWAYS_AVAILABLE_RE =
  /^(Insert|ScrollLock|F([1-9]|1[0-2]))$/;

/** Modifier / cancel / dead keys — never a reclaim binding. */
const FOCUS_SCAN_RESERVED_KEYS = new Set([
  'Escape',
  'Meta',
  'Control',
  'Alt',
  'Shift',
  'Dead',
  'Unidentified',
  'Process',
  'Compose',
]);

/**
 * True when `key` (`KeyboardEvent.key`) may be stored as the focus-scan reclaim
 * binding. Any non-reserved key is allowed; always-available keys keep working
 * mid-field, others yield while typing.
 */
export function isBindableFocusScanHotkey(key: string): boolean {
  if (!key || key.length > 32) return false;
  if (FOCUS_SCAN_RESERVED_KEYS.has(key)) return false;
  return true;
}

/**
 * Legacy regex kept for call sites / docs that still name the classic set.
 * Prefer {@link isBindableFocusScanHotkey} for validation — reclaim is open to
 * any non-reserved key.
 */
export const FOCUS_SCAN_HOTKEY_RE = FOCUS_SCAN_ALWAYS_AVAILABLE_RE;

/**
 * Preset chips in Settings — classic non-typing keys. Operators can also capture
 * any other bindable key via the scan-bar gear or Settings “Press a key…”.
 */
export const FOCUS_SCAN_HOTKEY_OPTIONS: readonly string[] = [
  'Insert',
  'ScrollLock',
  ...Array.from({ length: 12 }, (_, i) => `F${i + 1}`),
];

/** Default binding when a staffer has never customized it. */
export const DEFAULT_FOCUS_SCAN_HOTKEY = 'Insert';

/**
 * Color themes — derived from the theme registry
 * (src/design-system/themes/registry.ts, the SoT), so registering a new
 * palette makes it valid here with zero schema changes. `light` is the
 * default when a staffer has never customized it.
 */
export const STAFF_THEMES = THEME_NAMES;
export type StaffTheme = ThemeName;
export const DEFAULT_THEME: StaffTheme = 'light';

/**
 * Clock display format for every timestamp the app renders. `12h` = h:mm AM/PM
 * (the historical default — existing users are unaffected); `24h` = HH:mm.
 * A personal display preference stored per-account (cross-device), mirrored to
 * localStorage for flash-free reads; see src/lib/time-format/store.ts. Storage /
 * API timestamp formats never change — this is display-only.
 */
export const TIME_FORMAT_VALUES = ['12h', '24h'] as const;
export type TimeFormat = (typeof TIME_FORMAT_VALUES)[number];
export const DEFAULT_TIME_FORMAT: TimeFormat = '12h';

/** `#RRGGBB` personal accent override when `useStaffAccent` is false. */
export const ACCENT_HEX_RE = /^#[0-9a-fA-F]{6}$/;

/** ISO day-range filter — `null` clears it. Shared by board + per-lane prefs. */
const BOARD_RANGE = z
  .object({
    from: z.string().nullable().optional(),
    to: z.string().nullable().optional(),
  })
  .strict();

/**
 * Generic swimlane-board prefs — one shape reused by every board surface
 * (Unshipped, Shipped, …) via {@link SwimlaneBoard}. Lane ids and sort ids are
 * open strings here: the SoT for which lanes/sorts are valid lives in each
 * consuming board (which validates + falls back on hydrate), so this schema
 * stays surface-agnostic and a new board needs no schema change.
 */
const BOARD_LANE_PREF = z
  .object({
    sort: z.string().max(40).optional(),
    expanded: z.boolean().optional(),
    /** Drag-resized body height (px). `null` clears it; absent leaves it unchanged
     *  — both snap back to the expanded/collapsed preset. */
    height: z.number().int().positive().max(4000).nullable().optional(),
    /** Per-lane date-range filter (each table header owns its own picker). */
    range: BOARD_RANGE.nullable().optional(),
  })
  .strict();

const BOARD_PREFS = z
  .object({
    columns: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
    /** Drag-reordered lane order (lane ids). Unknown/missing ids fall back to the
     *  board's canonical order on hydrate, so a partial list is safe. */
    order: z.array(z.string().max(40)).optional(),
    range: BOARD_RANGE.nullable().optional(),
    lanes: z.record(z.string().max(40), BOARD_LANE_PREF).optional(),
  })
  .strict();

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
    /** Per-board swimlane prefs. One generic shape ({@link BOARD_PREFS}) per
     *  surface; add a key here when a new board surface ships. */
    unshippedBoard: BOARD_PREFS.nullable().optional(),
    shippedBoard: BOARD_PREFS.nullable().optional(),
    /**
     * Per-staff list-table column config, keyed by TableId. Each table maps to
     * `{ hidden, shown, widths, order }`. Sent as the whole map (shallow JSONB
     * merge); each writer preserves the sibling fields (a widths write keeps
     * `hidden` + `order`, and so on).
     *
     * `hidden` + `shown` are a DELTA against the descriptor's default tier, not
     * an absolute column list — that is what lets a lean default widen later
     * without silently re-showing tracks a staffer curated away (and lets a new
     * `optional` column ship without appearing in anyone's grid unasked).
     */
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
    kpiCollapsed: z.record(z.string().max(64), z.boolean()).nullable().optional(),
    /**
     * Extra Unbox Band-1 tabs pinned via the Pin-list composer
     * (`unbox-extra-tabs` catalog). v1: `incoming` only. Bounded at
     * {@link UNBOX_PINNED_EXTRA_TABS_MAX} so a third pin never persists — the
     * Band-1 vocabulary stays 5 system + ≤2 pinned (Gemini D2 · D14).
     * `null` / absent = inherit the org/role default; `[]` = staff cleared.
     */
    unboxPinnedExtraTabs: z
      .array(z.literal('incoming'))
      .max(UNBOX_PINNED_EXTRA_TABS_MAX)
      .nullable()
      .optional(),
  })
  .strict();

export type StaffPreferencesPutBody = z.infer<typeof StaffPreferencesPutBody>;
