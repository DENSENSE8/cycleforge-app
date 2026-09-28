import 'server-only';
import { withTenantTransaction } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import type {
  DiagnosticCode,
  DiagnosticCodeUpsertBody,
  DiagnosticReading,
  DiagnosticReadingInput,
  DiagnosticReadingsWrite,
} from '@/lib/qc/contracts';

/**
 * Diagnostic code catalog (`diagnostic_codes`) and readings (`diagnostic_readings`) behind
 * `/api/qc/codes` and `/api/qc/readings`. Org-scoped explicitly on every statement, under the tenant GUC.
 */

const CODE_SELECT = `
  SELECT dc.id::int                   AS "id",
         dc.code                      AS "code",
         dc.device_family             AS "deviceFamily",
         dc.meaning                   AS "meaning",
         dc.severity                  AS "severity",
         dc.repair_issue_template_id  AS "repairIssueTemplateId",
         rit.label                    AS "repairIssueLabel",
         dc.active                    AS "active",
         to_json(dc.updated_at) #>> '{}' AS "updatedAt"
    FROM diagnostic_codes dc
    LEFT JOIN repair_issue_templates rit
           ON rit.id = dc.repair_issue_template_id AND rit.organization_id = dc.organization_id`;

export async function listDiagnosticCodes(
  orgId: OrgId,
  filter: { family?: string; q?: string; includeInactive?: boolean },
): Promise<DiagnosticCode[]> {
  return withTenantTransaction(orgId, async (client) => {
    const r = await client.query<DiagnosticCode>(
      `${CODE_SELECT}
        WHERE dc.organization_id = $1
          AND ($2::boolean OR dc.active)
          AND ($3::text IS NULL OR dc.device_family IS NULL OR dc.device_family = $3)
          AND ($4::text IS NULL OR dc.code ILIKE '%' || $4 || '%' OR dc.meaning ILIKE '%' || $4 || '%')
        ORDER BY dc.code, dc.device_family NULLS FIRST`,
      [orgId, filter.includeInactive === true, filter.family ?? null, filter.q ?? null],
    );
    return r.rows;
  });
}

export type DiagnosticCodeUpsertResult =
  | { ok: true; code: DiagnosticCode; created: boolean; before: DiagnosticCode | null }
  | { ok: false; status: 404; error: string };

/** Insert or update the org's meaning for (family, code). `active` omitted keeps the current value (new rows: active). */
export async function upsertDiagnosticCode(
  orgId: OrgId,
  input: Omit<DiagnosticCodeUpsertBody, 'code'> & { code: string },
): Promise<DiagnosticCodeUpsertResult> {
  return withTenantTransaction(orgId, async (client) => {
    if (input.repairIssueTemplateId != null) {
      const rit = await client.query(`SELECT 1 FROM repair_issue_templates WHERE id = $1 AND organization_id = $2`, [
        input.repairIssueTemplateId,
        orgId,
      ]);
      if (rit.rowCount === 0) return { ok: false, status: 404, error: 'Repair issue template not found' };
    }
    const family = input.deviceFamily ?? null;
    const before = await client.query<DiagnosticCode>(
      `${CODE_SELECT}
        WHERE dc.organization_id = $1 AND COALESCE(dc.device_family, '') = COALESCE($2::text, '') AND dc.code = $3`,
      [orgId, family, input.code],
    );
    const written = await client.query<{ id: number }>(
      `INSERT INTO diagnostic_codes
         (organization_id, code, device_family, meaning, severity, repair_issue_template_id, active)
       VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7::boolean, TRUE))
       ON CONFLICT (organization_id, COALESCE(device_family, ''), code) DO UPDATE SET
         meaning                  = EXCLUDED.meaning,
         severity                 = EXCLUDED.severity,
         repair_issue_template_id = EXCLUDED.repair_issue_template_id,
         active                   = COALESCE($7::boolean, diagnostic_codes.active),
         updated_at               = NOW()
       RETURNING id::int AS id`,
      [orgId, input.code, family, input.meaning, input.severity, input.repairIssueTemplateId ?? null, input.active ?? null],
    );
    const code = await client.query<DiagnosticCode>(`${CODE_SELECT} WHERE dc.organization_id = $1 AND dc.id = $2`, [
      orgId,
      written.rows[0].id,
    ]);
    return { ok: true, code: code.rows[0], created: before.rows.length === 0, before: before.rows[0] ?? null };
  });
}

/**
 * Readings with their catalog match. The unit's family is its SKU's `sku_catalog.category`; a
 * family-specific code row wins over the any-family row. Inactive codes don't resolve.
 */
const READING_SELECT = `
  SELECT r.id::int                AS "id",
         r.qc_session_id::int     AS "qcSessionId",
         r.serial_unit_id         AS "serialUnitId",
         r.source                 AS "source",
         r.kind                   AS "kind",
         r.code                   AS "code",
         r.value                  AS "value",
         to_json(r.read_at) #>> '{}'    AS "readAt",
         r.hub_device_id          AS "hubDeviceId",
         r.recorded_by_staff_id   AS "recordedByStaffId",
         r.client_event_id        AS "clientEventId",
         dc.meaning               AS "codeMeaning",
         dc.severity              AS "codeSeverity",
         dc.repair_issue_template_id AS "repairIssueTemplateId",
         to_json(r.created_at) #>> '{}' AS "createdAt"
    FROM diagnostic_readings r
    JOIN serial_units su ON su.id = r.serial_unit_id AND su.organization_id = r.organization_id
    LEFT JOIN sku_catalog sc ON sc.id = su.sku_catalog_id AND sc.organization_id = su.organization_id
    LEFT JOIN LATERAL (
      SELECT d.meaning, d.severity, d.repair_issue_template_id
        FROM diagnostic_codes d
       WHERE d.organization_id = r.organization_id
         AND d.code = r.code
         AND d.active
         AND (d.device_family IS NULL OR d.device_family = sc.category)
       ORDER BY d.device_family IS NULL
       LIMIT 1
    ) dc ON r.code IS NOT NULL`;

export async function listDiagnosticReadings(
  orgId: OrgId,
  filter: { unitId?: number; sessionId?: number },
): Promise<DiagnosticReading[]> {
  return withTenantTransaction(orgId, async (client) => {
    const r = await client.query<DiagnosticReading>(
      `${READING_SELECT}
        WHERE r.organization_id = $1
          AND ($2::int IS NULL OR r.serial_unit_id = $2)
          AND ($3::bigint IS NULL OR r.qc_session_id = $3)
        ORDER BY r.read_at DESC, r.id DESC
        LIMIT 500`,
      [orgId, filter.unitId ?? null, filter.sessionId ?? null],
    );
    return r.rows;
  });
}

export type DiagnosticReadingsWriteResult =
  | ({ ok: true } & DiagnosticReadingsWrite)
  | { ok: false; status: 404 | 409; error: string };

/**
 * Record a batch of readings, all-or-nothing. Idempotent per reading: a `clientEventId` the org has
 * already recorded is a replay — the stored row is returned untouched. A reading's session must be
 * on the same unit (409 otherwise); unknown units / sessions are 404.
 */
export async function recordDiagnosticReadings(
  orgId: OrgId,
  staffId: number | null,
  readings: Array<Omit<DiagnosticReadingInput, 'kind' | 'code'> & { kind: string; code?: string | null }>,
): Promise<DiagnosticReadingsWriteResult> {
  const unitIds = [...new Set(readings.map((r) => r.serialUnitId))];
  const sessionIds = [...new Set(readings.flatMap((r) => (r.qcSessionId != null ? [r.qcSessionId] : [])))];

  return withTenantTransaction(orgId, async (client) => {
    const units = await client.query<{ id: number }>(
      `SELECT id FROM serial_units WHERE organization_id = $1 AND id = ANY($2::int[])`,
      [orgId, unitIds],
    );
    const missingUnit = unitIds.find((id) => !units.rows.some((u) => u.id === id));
    if (missingUnit != null) return { ok: false, status: 404, error: `Unit ${missingUnit} not found` };

    if (sessionIds.length > 0) {
      const sessions = await client.query<{ id: number; serial_unit_id: number | null }>(
        `SELECT id::int AS id, serial_unit_id FROM qc_sessions WHERE organization_id = $1 AND id = ANY($2::bigint[])`,
        [orgId, sessionIds],
      );
      const sessionUnit = new Map(sessions.rows.map((s) => [s.id, s.serial_unit_id]));
      for (const r of readings) {
        if (r.qcSessionId == null) continue;
        if (!sessionUnit.has(r.qcSessionId)) return { ok: false, status: 404, error: `Session ${r.qcSessionId} not found` };
        if (sessionUnit.get(r.qcSessionId) !== r.serialUnitId) {
          return { ok: false, status: 409, error: `Session ${r.qcSessionId} is not on unit ${r.serialUnitId}` };
        }
      }
    }

    const rows = readings.map((r) => ({
      client_event_id: r.clientEventId,
      serial_unit_id: r.serialUnitId,
      qc_session_id: r.qcSessionId ?? null,
      source: r.source,
      kind: r.kind,
      code: r.code ?? null,
      value: r.value ?? {},
      read_at: r.readAt ?? null,
      hub_device_id: r.hubDeviceId ?? null,
    }));
    const inserted = await client.query<{ client_event_id: string }>(
      `INSERT INTO diagnostic_readings
         (organization_id, client_event_id, serial_unit_id, qc_session_id, source, kind, code, value,
          read_at, hub_device_id, recorded_by_staff_id)
       SELECT $1, x.client_event_id, x.serial_unit_id, x.qc_session_id, x.source, x.kind, x.code,
              COALESCE(x.value, '{}'::jsonb), COALESCE(x.read_at, NOW()), x.hub_device_id, $3
         FROM jsonb_to_recordset($2::jsonb) AS x(
                client_event_id text, serial_unit_id int, qc_session_id bigint, source text, kind text,
                code text, value jsonb, read_at timestamptz, hub_device_id text)
       ON CONFLICT (organization_id, client_event_id) DO NOTHING
       RETURNING client_event_id`,
      [orgId, JSON.stringify(rows), staffId],
    );

    const clientEventIds = rows.map((r) => r.client_event_id);
    const stored = await client.query<DiagnosticReading>(
      `${READING_SELECT} WHERE r.organization_id = $1 AND r.client_event_id = ANY($2::text[])`,
      [orgId, clientEventIds],
    );
    const byKey = new Map(stored.rows.map((r) => [r.clientEventId, r]));
    const created = inserted.rowCount ?? 0;
    return {
      ok: true,
      readings: clientEventIds.map((k) => byKey.get(k)!),
      created,
      replayed: readings.length - created,
    };
  });
}
