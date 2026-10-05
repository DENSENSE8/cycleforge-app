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
  PrintStationDeviceHeartbeat,
  PrintStationDeviceState,
  PrintStationHeartbeat,
  PrintStationJob,
  PrintStationKind,
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
  kind: PrintStationKind;
  paused: boolean;
  label_ready: boolean;
  paper_ready: boolean;
  label_printer: string | null;
  paper_printer: string | null;
  /** Null when never heard: an enrolled station is created with `last_seen_at = to_timestamp(0)`. */
  last_seen_at: Date | null;
  online: boolean;
  last_seen_staff_id: number | null;
  assigned_label: boolean;
  assigned_paper: boolean;
  last_job_at: Date | null;
}

/**
 * Upsert one browser station's heartbeat. Never touches the org's assignment.
 * The REGISTRY owns the name: a first beat (or a registry row still unnamed)
 * adopts the computer's own name unless another station already wears it
 * (names are unique per org — it stays unnamed instead); after that a beat
 * never renames — only {@link renamePrintStation} does. A Forget-ed browser
 * station reappears the moment it beats again. An enrolled station's id is
 * never upserted here — it beats over its own device route. Returns the
 * registry's name so the computer adopts it.
 */
export async function recordPrintStationHeartbeat(
  organizationId: OrgId,
  staffId: number,
  heartbeat: PrintStationHeartbeat,
): Promise<{ name: string }> {
  const { rows } = await tenantQuery<{ name: string }>(
    organizationId,
    `INSERT INTO print_stations AS s
       (organization_id, station_id, name, label_ready, paper_ready, label_printer, paper_printer,
        last_seen_at, last_seen_staff_id)
     VALUES ($1, $2,
             CASE WHEN $3 <> $9 AND EXISTS (
                    SELECT 1 FROM print_stations o
                     WHERE o.organization_id = $1 AND o.station_id <> $2 AND lower(o.name) = lower($3)
                  ) THEN $9 ELSE $3 END,
             $4, $5, $6, $7, now(),
             (SELECT id FROM staff WHERE organization_id = $1 AND id = $8))
     ON CONFLICT (organization_id, station_id) DO UPDATE
       SET name = CASE WHEN s.name = $9 THEN EXCLUDED.name ELSE s.name END,
           label_ready = EXCLUDED.label_ready,
           paper_ready = EXCLUDED.paper_ready,
           label_printer = EXCLUDED.label_printer,
           paper_printer = EXCLUDED.paper_printer,
           last_seen_at = EXCLUDED.last_seen_at,
           last_seen_staff_id = EXCLUDED.last_seen_staff_id,
           revoked_at = NULL
       WHERE s.kind = 'browser'
     RETURNING name`,
    [
      organizationId,
      heartbeat.stationId,
      heartbeat.stationName,
      heartbeat.label.ready,
      heartbeat.paper.ready,
      heartbeat.label.printer,
      heartbeat.paper.printer,
      staffId,
      UNNAMED_PRINT_STATION,
    ],
  );
  return { name: rows[0]?.name ?? heartbeat.stationName };
}

export type PrintStationRenameResult =
  | { ok: true; name: string }
  | { ok: false; status: 400 | 403 | 404 | 409; error: string };

/**
 * Rename one station for the whole org (empty = back to unnamed). Anyone may
 * name the computer they are signed in on (its last heartbeat is theirs);
 * naming ANOTHER computer takes `canManage` (Hardware settings). Two stations
 * never share a name — the picker could not tell them apart. An enrolled
 * station always keeps a real name.
 */
export async function renamePrintStation(
  organizationId: OrgId,
  staffId: number,
  canManage: boolean,
  stationId: string,
  rawName: string,
): Promise<PrintStationRenameResult> {
  const name = rawName.trim() || UNNAMED_PRINT_STATION;
  const conflict: PrintStationRenameResult = { ok: false, status: 409, error: `Another print station is already called “${name}”.` };
  try {
    return await withTenantTransaction(organizationId, async (client): Promise<PrintStationRenameResult> => {
      const found = await client.query<{ last_seen_staff_id: number | null; kind: PrintStationKind }>(
        `SELECT last_seen_staff_id, kind FROM print_stations
          WHERE organization_id = $1 AND station_id = $2 AND revoked_at IS NULL
          FOR UPDATE`,
        [organizationId, stationId],
      );
      const row = found.rows[0];
      if (!row) return { ok: false, status: 404, error: 'That print station has never checked in.' };
      if (!canManage && row.last_seen_staff_id !== staffId) {
        return { ok: false, status: 403, error: 'Only Hardware settings can rename another computer.' };
      }
      if (row.kind === 'enrolled' && name === UNNAMED_PRINT_STATION) {
        return { ok: false, status: 400, error: 'An enrolled print station needs a name.' };
      }
      if (name !== UNNAMED_PRINT_STATION) {
        const taken = await client.query(
          `SELECT 1 FROM print_stations WHERE organization_id = $1 AND station_id <> $2 AND lower(name) = lower($3)`,
          [organizationId, stationId, name],
        );
        if ((taken.rowCount ?? 0) > 0) return conflict;
      }
      await client.query(`UPDATE print_stations SET name = $3 WHERE organization_id = $1 AND station_id = $2`, [organizationId, stationId, name]);
      return { ok: true, name };
    });
  } catch (error) {
    // A concurrent rename took the name after the pre-check: the unique name index answers.
    if (error && typeof error === 'object' && 'code' in error && error.code === '23505') return conflict;
    throw error;
  }
}

/**
 * The stations worth offering, by name, with the org's assignment: every
 * enrolled one, every one online, every assigned one, and named ones seen in
 * the window. Every desktop browser is a station, so an offline unnamed one is
 * noise nobody can pick out. Revoked / forgotten stations never list.
 */
export async function listPrintStations(organizationId: OrgId): Promise<PrintStationRegistry> {
  const { rows } = await tenantQuery<PrintStationRow>(
    organizationId,
    `SELECT s.station_id, s.name, s.kind, s.paused_at IS NOT NULL AS paused,
            s.label_ready, s.paper_ready, s.label_printer, s.paper_printer,
            NULLIF(s.last_seen_at, to_timestamp(0)) AS last_seen_at,
            s.last_seen_staff_id, s.assigned_label, s.assigned_paper,
            s.last_seen_at > now() - make_interval(secs => $2::double precision / 1000) AS online,
            j.created_at AS last_job_at
       FROM print_stations s
       LEFT JOIN LATERAL (
         SELECT created_at FROM label_print_jobs
          WHERE organization_id = s.organization_id AND station_id = s.station_id
          ORDER BY created_at DESC
          LIMIT 1
       ) j ON true
      WHERE s.organization_id = $1
        AND s.revoked_at IS NULL
        AND (s.kind = 'enrolled' OR s.assigned_label OR s.assigned_paper
             OR s.last_seen_at > now() - make_interval(secs => $2::double precision / 1000)
             OR (s.name <> $4 AND s.last_seen_at > now() - make_interval(days => $3)))
      ORDER BY lower(s.name), s.station_id`,
    [organizationId, STAFF_PRINT_STATION_STALE_MS, PRINT_STATION_LIST_WINDOW_DAYS, UNNAMED_PRINT_STATION],
  );
  const assignment: PrintStationAssignment = { label: null, paper: null };
  const stations: OrgPrintStation[] = rows.map((row) => {
    if (row.assigned_label) assignment.label = row.station_id;
    if (row.assigned_paper) assignment.paper = row.station_id;
    return {
      stationId: row.station_id,
      name: row.name,
      kind: row.kind,
      paused: row.paused,
      label: { ready: row.label_ready, printer: row.label_printer },
      paper: { ready: row.paper_ready, printer: row.paper_printer },
      lastSeenAt: row.last_seen_at ? row.last_seen_at.toISOString() : null,
      online: row.online,
      lastSeenStaffId: row.last_seen_staff_id,
      lastJobAt: row.last_job_at ? row.last_job_at.toISOString() : null,
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
          `SELECT 1 FROM print_stations WHERE organization_id = $1 AND station_id = $2 AND revoked_at IS NULL FOR UPDATE`,
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

const UNKNOWN_STATION = { ok: false, status: 404, error: 'That print station is not in this organization.' } as const;

export type PrintStationPauseResult = { ok: true; paused: boolean } | { ok: false; status: 404; error: string };

/** Pause (the station refuses jobs, senders see Paused) or resume one station. */
export async function setPrintStationPaused(
  organizationId: OrgId,
  stationId: string,
  paused: boolean,
): Promise<PrintStationPauseResult> {
  const { rows } = await tenantQuery<{ paused: boolean }>(
    organizationId,
    `UPDATE print_stations
        SET paused_at = CASE WHEN $3 THEN COALESCE(paused_at, now()) ELSE NULL END
      WHERE organization_id = $1 AND station_id = $2 AND revoked_at IS NULL
      RETURNING paused_at IS NOT NULL AS paused`,
    [organizationId, stationId, paused],
  );
  return rows[0] ? { ok: true, paused: rows[0].paused } : UNKNOWN_STATION;
}

export type PrintStationRevokeResult =
  | { ok: true; kind: PrintStationKind; name: string }
  | { ok: false; status: 404; error: string };

/**
 * Take a station off every list and clear its defaults. An ENROLLED station's
 * device credential dies with it (its next request answers 401) and its name
 * is freed for a new station. A BROWSER station is only forgotten: its name
 * stays, and its next heartbeat brings it back.
 */
export async function revokePrintStation(organizationId: OrgId, stationId: string): Promise<PrintStationRevokeResult> {
  return withTenantTransaction(organizationId, async (client): Promise<PrintStationRevokeResult> => {
    const found = await client.query<{ kind: PrintStationKind; name: string; device_id: string | number | null }>(
      `SELECT kind, name, device_id FROM print_stations
        WHERE organization_id = $1 AND station_id = $2 AND revoked_at IS NULL
        FOR UPDATE`,
      [organizationId, stationId],
    );
    const row = found.rows[0];
    if (!row) return UNKNOWN_STATION;
    // The unique name index still sees a revoked row; an enrolled station never
    // comes back, so its name moves aside for the next station to take.
    await client.query(
      `UPDATE print_stations
          SET revoked_at = now(), paused_at = NULL, assigned_label = false, assigned_paper = false,
              name = CASE WHEN kind = 'enrolled'
                          THEN left(name, 80) || ' · revoked ' || left(replace(station_id, 'ps_', ''), 8)
                          ELSE name END
        WHERE organization_id = $1 AND station_id = $2`,
      [organizationId, stationId],
    );
    if (row.kind === 'enrolled' && row.device_id != null) {
      await client.query(
        `UPDATE kiosk_devices
            SET status = 'revoked', revoked_at = now(), device_token_hash = NULL,
                enroll_code_hash = NULL, enroll_code_expires_at = NULL, updated_at = now()
          WHERE organization_id = $1 AND id = $2 AND kind = 'print_station'`,
        [organizationId, Number(row.device_id)],
      );
    }
    return { ok: true, kind: row.kind, name: row.name };
  });
}

/** How many jobs a station's log shows. */
export const STATION_JOB_LOG_LIMIT = 50;

/** One station's newest logged prints (`label_print_jobs.station_id`). */
export async function listStationJobs(
  organizationId: OrgId,
  stationId: string,
  limit: number = STATION_JOB_LOG_LIMIT,
): Promise<PrintStationJob[]> {
  const { rows } = await tenantQuery<{ id: string | number; qr_payload: string; template_id: string | null; copies: number; created_at: Date }>(
    organizationId,
    `SELECT id, qr_payload, template_id, copies, created_at
       FROM label_print_jobs
      WHERE organization_id = $1 AND station_id = $2
      ORDER BY created_at DESC
      LIMIT $3`,
    [organizationId, stationId, limit],
  );
  return rows.map((row) => ({
    id: Number(row.id),
    payload: row.qr_payload,
    templateId: row.template_id,
    copies: row.copies,
    createdAt: row.created_at.toISOString(),
  }));
}

/**
 * An enrolled station's heartbeat: what its printers can do, stamped on the
 * server clock. Answers its registry name and whether it is paused; null when
 * the station is gone (revoked between the credential check and the beat).
 */
export async function recordEnrolledStationHeartbeat(
  organizationId: OrgId,
  stationId: string,
  heartbeat: PrintStationDeviceHeartbeat,
): Promise<PrintStationDeviceState | null> {
  const { rows } = await tenantQuery<{ name: string; paused: boolean }>(
    organizationId,
    `UPDATE print_stations
        SET label_ready = $3, paper_ready = $4, label_printer = $5, paper_printer = $6, last_seen_at = now()
      WHERE organization_id = $1 AND station_id = $2 AND kind = 'enrolled' AND revoked_at IS NULL
      RETURNING name, paused_at IS NOT NULL AS paused`,
    [
      organizationId,
      stationId,
      heartbeat.label.ready,
      heartbeat.paper.ready,
      heartbeat.label.printer,
      heartbeat.paper.printer,
    ],
  );
  const row = rows[0];
  return row ? { organizationId, stationId, name: row.name, paused: row.paused } : null;
}
