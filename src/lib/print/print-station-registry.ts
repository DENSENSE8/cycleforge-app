import 'server-only';
/**
 * The org print-station registry (`print_stations`): stations announce
 * themselves by heartbeat; the org assigns one station per stock. Online is
 * judged on the server clock so a skewed station clock never shows it live.
 */
import type { PrintStock } from '@/lib/label-prints/print-route';
import { STAFF_PRINT_STATION_STALE_MS, UNNAMED_PRINT_STATION } from '@/lib/print/staff-print-bridge';
import type { OrgId } from '@/lib/tenancy/constants';
import { tenantQuery, withTenantTransaction } from '@/lib/tenancy/db';
import type {
  OrgPrintStation,
  PrintStationAssignment,
  PrintStationHeartbeat,
  PrintStationRegistry,
} from './print-station-registry-contracts';

/** An offline NAMED station stays listed this long; an offline unnamed one (a throwaway browser) drops at once. */
const PRINT_STATION_LIST_WINDOW_DAYS = 30;

const ASSIGNED_COLUMN: Record<PrintStock, 'assigned_label' | 'assigned_paper'> = {
  label: 'assigned_label',
  paper: 'assigned_paper',
};

interface PrintStationRow {
  station_id: string;
  name: string;
  label_ready: boolean;
  paper_ready: boolean;
  label_printer: string | null;
  paper_printer: string | null;
  last_seen_at: Date;
  online: boolean;
  last_seen_staff_id: number | null;
  assigned_label: boolean;
  assigned_paper: boolean;
}

/** Upsert one station's heartbeat. Never touches the org's assignment. */
export async function recordPrintStationHeartbeat(
  organizationId: OrgId,
  staffId: number,
  heartbeat: PrintStationHeartbeat,
): Promise<void> {
  await tenantQuery(
    organizationId,
    `INSERT INTO print_stations AS s
       (organization_id, station_id, name, label_ready, paper_ready, label_printer, paper_printer,
        last_seen_at, last_seen_staff_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, now(),
             (SELECT id FROM staff WHERE organization_id = $1 AND id = $8))
     ON CONFLICT (organization_id, station_id) DO UPDATE
       SET name = EXCLUDED.name,
           label_ready = EXCLUDED.label_ready,
           paper_ready = EXCLUDED.paper_ready,
           label_printer = EXCLUDED.label_printer,
           paper_printer = EXCLUDED.paper_printer,
           last_seen_at = EXCLUDED.last_seen_at,
           last_seen_staff_id = EXCLUDED.last_seen_staff_id`,
    [
      organizationId,
      heartbeat.stationId,
      heartbeat.stationName,
      heartbeat.label.ready,
      heartbeat.paper.ready,
      heartbeat.label.printer,
      heartbeat.paper.printer,
      staffId,
    ],
  );
}

/**
 * The stations worth offering, by name, with the org's assignment: every one
 * online, every assigned one, and named ones seen in the window. Every desktop
 * browser is a station, so an offline unnamed one is noise nobody can pick out.
 */
export async function listPrintStations(organizationId: OrgId): Promise<PrintStationRegistry> {
  const { rows } = await tenantQuery<PrintStationRow>(
    organizationId,
    `SELECT station_id, name, label_ready, paper_ready, label_printer, paper_printer,
            last_seen_at, last_seen_staff_id, assigned_label, assigned_paper,
            last_seen_at > now() - make_interval(secs => $2::double precision / 1000) AS online
       FROM print_stations
      WHERE organization_id = $1
        AND (assigned_label OR assigned_paper
             OR last_seen_at > now() - make_interval(secs => $2::double precision / 1000)
             OR (name <> $4 AND last_seen_at > now() - make_interval(days => $3)))
      ORDER BY lower(name), station_id`,
    [organizationId, STAFF_PRINT_STATION_STALE_MS, PRINT_STATION_LIST_WINDOW_DAYS, UNNAMED_PRINT_STATION],
  );
  const assignment: PrintStationAssignment = { label: null, paper: null };
  const stations: OrgPrintStation[] = rows.map((row) => {
    if (row.assigned_label) assignment.label = row.station_id;
    if (row.assigned_paper) assignment.paper = row.station_id;
    return {
      stationId: row.station_id,
      name: row.name,
      label: { ready: row.label_ready, printer: row.label_printer },
      paper: { ready: row.paper_ready, printer: row.paper_printer },
      lastSeenAt: row.last_seen_at.toISOString(),
      online: row.online,
      lastSeenStaffId: row.last_seen_staff_id,
    };
  });
  return { stations, assignment };
}

/** The org's default station per stock. */
export async function readPrintStationAssignment(organizationId: OrgId): Promise<PrintStationAssignment> {
  const { rows } = await tenantQuery<{ station_id: string; assigned_label: boolean; assigned_paper: boolean }>(
    organizationId,
    `SELECT station_id, assigned_label, assigned_paper
       FROM print_stations
      WHERE organization_id = $1 AND (assigned_label OR assigned_paper)`,
    [organizationId],
  );
  return {
    label: rows.find((row) => row.assigned_label)?.station_id ?? null,
    paper: rows.find((row) => row.assigned_paper)?.station_id ?? null,
  };
}

export type PrintStationAssignmentResult =
  | { ok: true; assignment: PrintStationAssignment }
  | { ok: false; status: 404 | 409; error: string };

/**
 * Make `stationId` the org's station for `stock` (null clears it). The station
 * must have sent a heartbeat — an id nobody has heard of is refused.
 */
export async function setPrintStationAssignment(
  organizationId: OrgId,
  stock: PrintStock,
  stationId: string | null,
): Promise<PrintStationAssignmentResult> {
  const column = ASSIGNED_COLUMN[stock];
  try {
    const found = await withTenantTransaction(organizationId, async (client) => {
      if (stationId) {
        const known = await client.query(
          `SELECT 1 FROM print_stations WHERE organization_id = $1 AND station_id = $2 FOR UPDATE`,
          [organizationId, stationId],
        );
        if (known.rowCount === 0) return false;
      }
      // Clear first, then set: the one-per-stock unique index is checked per row.
      await client.query(
        `UPDATE print_stations SET ${column} = false WHERE organization_id = $1 AND ${column}`,
        [organizationId],
      );
      if (stationId) {
        await client.query(
          `UPDATE print_stations SET ${column} = true WHERE organization_id = $1 AND station_id = $2`,
          [organizationId, stationId],
        );
      }
      return true;
    });
    if (!found) return { ok: false, status: 404, error: 'That print station has never checked in.' };
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === '23505') {
      return { ok: false, status: 409, error: 'The print station assignment changed at the same time — try again.' };
    }
    throw error;
  }
  return { ok: true, assignment: await readPrintStationAssignment(organizationId) };
}
