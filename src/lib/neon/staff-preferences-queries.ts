/** Per-staff UI preference queries — a generic JSONB key/value bag, one row per (org, staff). */

import { tenantQuery, tenantQueryOneTrip } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';

/**
 * Per-lane prefs inside a swimlane board. Lane ids and `sort` are open strings:
 * the valid set is owned by each board surface (which validates + falls back on
 * hydrate), so one shape serves every board. See {@link SwimlaneBoard}.
 */
export interface BoardLanePref {
  sort?: string;
  expanded?: boolean;
  /** Drag-resized body height (px); `null`/absent → expanded/collapsed preset. */
  height?: number | null;
  /** Per-lane date-range filter (each lane header owns its own picker). */
  range?: { from?: string | null; to?: string | null } | null;
}

/** Generic swimlane-board layout prefs (cross-device), reused per surface. */
export interface BoardPrefs {
  columns?: 1 | 2 | 3;
  order?: string[];
  range?: { from?: string | null; to?: string | null } | null;
  lanes?: Record<string, BoardLanePref>;
}

/** Top-level prefs keys that hold a {@link BoardPrefs} bag (one per board surface). */
export type BoardPrefsKey =
  | 'unshippedBoard'
  | 'shippedBoard'
  | 'techHistoryBoard'
  | 'packerHistoryBoard'
  | 'receivingHistoryBoard'
  | 'receivingIncomingBoard'
  | 'testingHistoryBoard';

/** Known, typed preference keys. The column is open JSONB; this is the contract. */
export interface StaffPreferences {
  /** Insert / ScrollLock / F1–F12 that focuses the active scan bar. Absent = default (Insert). */
  focusScanHotkey?: string | null;
  /** Color theme name from the theme registry (light | dark | mono | slate — see src/design-system/themes/registry.ts). */
  theme?: string | null;
  /**
   * Scan-station Color from the station-skin registry. Absent = porcelain.
   * Drives `data-station-skin` on <html>.
   */
  stationSkin?: string | null;
  /**
   * Scan-station depth from the station-depth registry (flat | mill | deep).
   * Absent = flat. Drives `data-station-depth` on <html>.
   */
  stationDepth?: string | null;
  /** Clock display format for every rendered timestamp: */
  timeFormat?: string | null;
  /**
   * Operator accent chrome: when true (default / absent), `staff.color_hex`
   * drives `theme-*` on `<html>`. When false, `accentHex` is used instead.
   */
  useStaffAccent?: boolean | null;
  /** Custom `#RRGGBB` accent when `useStaffAccent` is false. */
  accentHex?: string | null;
  /**
   * "Skip for now" on the dashboard Getting-Started checklist. `true` hides the
   * card; absent/`null` shows it while activation steps remain incomplete.
   */
  onboardingDismissed?: boolean | null;
  /**
   * Last product-update catalog id dismissed via the former What's-new panel.
   * Absent/`null` = never seen. Kept so existing preference bags still parse.
   */
  lastSeenProductUpdateId?: string | null;
  /** Last catalog buildSha dismissed with the update id. Parse-compat only. */
  lastSeenBuildSha?: string | null;
  /**
   * Unshipped · Shelf-board layout prefs (cross-device). Lanes are PENDING /
   * PICKED / BLOCKED; see {@link BoardPrefs} for the shape. One board surface =
   * one key; the generic {@link SwimlaneBoard} reads/writes `prefs[prefsKey]`.
   */
  unshippedBoard?: BoardPrefs | null;
  /**
   * Dashboard · Shipped board layout prefs (cross-device). Lanes are the
   * outbound states (`OUTBOUND_STATE_META`); same shape as {@link BoardPrefs}.
   */
  shippedBoard?: BoardPrefs | null;
  /**
   * Station history Pipeline-board layout prefs (cross-device), one bag per
   * station surface — same {@link BoardPrefs} shape as the dashboard boards.
   * Lanes come from the station lane SoT modules (`tech-board-lanes.ts`, …).
   */
  techHistoryBoard?: BoardPrefs | null;
  packerHistoryBoard?: BoardPrefs | null;
  receivingHistoryBoard?: BoardPrefs | null;
  receivingIncomingBoard?: BoardPrefs | null;
  testingHistoryBoard?: BoardPrefs | null;
  /** Per-staff column config for the shared list tables, keyed by TableId (see src/lib/tables/table-columns.ts). */
  tableColumns?: Record<
    string,
    {
      hidden?: string[];
      shown?: string[];
      widths?: Record<string, number>;
      /** Per-column staff min/max resize clamps (px). */
      widthBounds?: Record<string, { min?: number; max?: number }>;
      order?: string[];
      display?: Record<
        string,
        {
          /** `#rrggbb`, legacy named wash, or `'none'`. */
          highlight?: string;
          cell?: 'default' | 'chip';
          /** Named text emphasis — never free hex. */
          text?: 'default' | 'muted' | 'emphasis' | 'warning' | 'critical';
        }
      >;
      /** Per-row fill hex / legacy wash, keyed by stringified row id. */
      rowFills?: Record<string, string>;
      /** Record row zoom — S / M (default) / L. */
      rowZoom?: 'S' | 'M' | 'L';
    }
  > | null;
  /**
   * GlobalHeader pin stations — ordered bookmarks with display label + exact
   * href. Mirrored to `cf.quickAccess` for flash-free chrome; this key is the
   * durable cross-device SoT. Visit MRU stays device-local.
   */
  quickAccess?: {
    pinned: Array<{
      id: string;
      label: string;
      href: string;
      iconKey?: string;
      addedAt: number;
    }>;
  } | null;
  /**
   * Workbench KPI Band 2 snap-collapse per surface (`WORKBENCH_KPI_SURFACE`).
   * `true` = collapsed. Shallow JSONB merge — writers send the whole map.
   */
  /** @deprecated Dead since 2026-08-29 — see the schema note. Stored rows keep it. */
  kpiCollapsed?: Record<string, boolean> | null;
  /** Extra Unbox Band-1 tabs pinned via the Pin-list composer (catalog: */
  unboxPinnedExtraTabs?: Array<'incoming'> | null;
}

/** Read one staffer's prefs bag (empty object when no row yet). */
export async function getStaffPreferences(staffId: number, orgId: OrgId): Promise<StaffPreferences> {
  const { rows } = await tenantQueryOneTrip<{ prefs: StaffPreferences }>(
    orgId,
    `SELECT prefs
       FROM staff_preferences
      WHERE organization_id = $1 AND staff_id = $2
      LIMIT 1`,
    [orgId, staffId],
  );
  return rows[0]?.prefs ?? {};
}

/**
 * Merge a partial patch into the staffer's prefs bag (upsert). The JSONB `||`
 * merge means callers only send the keys they're changing; everything else is
 * preserved. Returns the full, merged prefs.
 */
export async function updateStaffPreferences(
  staffId: number,
  orgId: OrgId,
  patch: StaffPreferences,
): Promise<StaffPreferences> {
  const { rows } = await tenantQuery<{ prefs: StaffPreferences }>(
    orgId,
    `INSERT INTO staff_preferences (organization_id, staff_id, prefs)
     VALUES ($1, $2, $3::jsonb)
     ON CONFLICT (organization_id, staff_id)
     DO UPDATE SET prefs = staff_preferences.prefs || EXCLUDED.prefs,
                   updated_at = now()
     RETURNING prefs`,
    [orgId, staffId, JSON.stringify(patch)],
  );
  return rows[0]?.prefs ?? {};
}

/** Settings-Registry raw merge — write arbitrary top-level namespaced keys (e.g. */
export async function mergeStaffPreferencesRaw(
  staffId: number,
  orgId: OrgId,
  patch: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const { rows } = await tenantQuery<{ prefs: Record<string, unknown> }>(
    orgId,
    `INSERT INTO staff_preferences (organization_id, staff_id, prefs)
     VALUES ($1, $2, $3::jsonb)
     ON CONFLICT (organization_id, staff_id)
     DO UPDATE SET prefs = staff_preferences.prefs || EXCLUDED.prefs,
                   updated_at = now()
     RETURNING prefs`,
    [orgId, staffId, JSON.stringify(patch)],
  );
  return rows[0]?.prefs ?? {};
}
