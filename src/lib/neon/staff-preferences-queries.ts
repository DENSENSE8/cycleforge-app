/** Per-staff UI preference queries — a generic JSONB key/value bag, one row per (org, staff). */

import { tenantQuery, tenantQueryOneTrip } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import type { FnskuCopyRange } from '@/lib/print/labelCopies';

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
  /**
   * Triage list density per surface (`outbound.allocate`,
   * `incoming.pasted`, `live-feed`): `card` = Full, `row` = Compact — the operator's own pick
   * (`useTriageDensity`). Shallow JSONB merge — writers send the whole map.
   */
  triageDensity?: Record<string, 'card' | 'row'> | null;
  /** FNSKU quantity slider scale — 20, 30 or 99 (`useFnskuCopyRange`). */
  fnskuCopyRange?: FnskuCopyRange | null;
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
 * preserved. `triageDensity` merges one level deeper (per surface), so a tab
 * that sets one list's density cannot put back a stale value for another list
 * (two tabs, two devices). Returns the full, merged prefs.
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
     DO UPDATE SET prefs = (staff_preferences.prefs || EXCLUDED.prefs)
                   || CASE
                        WHEN jsonb_typeof(EXCLUDED.prefs -> 'triageDensity') = 'object'
                         AND jsonb_typeof(staff_preferences.prefs -> 'triageDensity') = 'object'
                        THEN jsonb_build_object('triageDensity',
                               (staff_preferences.prefs -> 'triageDensity') || (EXCLUDED.prefs -> 'triageDensity'))
                        ELSE '{}'::jsonb
                      END,
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
