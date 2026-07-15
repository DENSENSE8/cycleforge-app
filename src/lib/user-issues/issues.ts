/**
 * User-reported issues domain (ALP-5.*) — the in-app half of the
 * issue → fix → toast loop. Neon (`user_reported_issues`, tenant-from-birth)
 * is the primary record; GitHub is a best-effort mirror that feeds the
 * claude-fix-issue.yml automation. Status vocabulary mirrors the master-plan
 * TicketStatus enum: pending | in-progress | deployed.
 *
 * Deps-injected (query fn) so unit tests run DB-free (house pattern).
 */

export type UserIssueType = 'bug' | 'suggestion' | 'question';
export type UserIssueStatus = 'pending' | 'in-progress' | 'deployed';

export const USER_ISSUE_TYPES: readonly UserIssueType[] = ['bug', 'suggestion', 'question'];
export const USER_ISSUE_STATUSES: readonly UserIssueStatus[] = [
  'pending',
  'in-progress',
  'deployed',
];

export function isUserIssueType(value: unknown): value is UserIssueType {
  return typeof value === 'string' && (USER_ISSUE_TYPES as readonly string[]).includes(value);
}

export function isUserIssueStatus(value: unknown): value is UserIssueStatus {
  return typeof value === 'string' && (USER_ISSUE_STATUSES as readonly string[]).includes(value);
}

export interface UserIssuesDeps {
  /** Tenant-scoped query (real impl: tenantQuery(orgId, sql, params)). */
  query: (
    orgId: string,
    sql: string,
    params: unknown[],
  ) => Promise<{ rows: Array<Record<string, unknown>>; rowCount: number | null }>;
}

/** Wire shape for list + detail (LEFT JOIN staff for reporter name). */
export interface ReportedIssue {
  id: number;
  reporterStaffId: number | null;
  reporterName: string | null;
  issueType: UserIssueType;
  title: string;
  description: string;
  pagePath: string | null;
  githubIssueNumber: number | null;
  githubIssueUrl: string | null;
  status: UserIssueStatus;
  resolutionCommit: string | null;
  resolvedAt: string | null;
  clientEventId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ListReportedIssuesFilters {
  status?: UserIssueStatus | null;
  type?: UserIssueType | null;
  reporterId?: number | null;
  q?: string | null;
  /** Keyset: last row's (created_at, id) from the previous page. */
  cursor?: { createdAt: string; id: number } | null;
  limit?: number;
}

export interface ListReportedIssuesResult {
  issues: ReportedIssue[];
  nextCursor: { createdAt: string; id: number } | null;
}

const ISSUE_SELECT = `
  uri.id,
  uri.reporter_staff_id,
  s.name AS reporter_name,
  uri.issue_type,
  uri.title,
  uri.description,
  uri.page_path,
  uri.github_issue_number,
  uri.github_issue_url,
  uri.status,
  uri.resolution_commit,
  uri.resolved_at,
  uri.client_event_id,
  uri.created_at,
  uri.updated_at
`;

function toIso(v: unknown): string {
  return v instanceof Date ? v.toISOString() : String(v);
}

function mapIssue(row: Record<string, unknown>): ReportedIssue {
  return {
    id: Number(row.id),
    reporterStaffId: row.reporter_staff_id == null ? null : Number(row.reporter_staff_id),
    reporterName: row.reporter_name == null ? null : String(row.reporter_name),
    issueType: String(row.issue_type) as UserIssueType,
    title: String(row.title),
    description: String(row.description ?? ''),
    pagePath: row.page_path == null ? null : String(row.page_path),
    githubIssueNumber: row.github_issue_number == null ? null : Number(row.github_issue_number),
    githubIssueUrl: row.github_issue_url == null ? null : String(row.github_issue_url),
    status: String(row.status) as UserIssueStatus,
    resolutionCommit: row.resolution_commit == null ? null : String(row.resolution_commit),
    resolvedAt: row.resolved_at == null ? null : toIso(row.resolved_at),
    clientEventId: row.client_event_id == null ? null : String(row.client_event_id),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

/** Escape ILIKE wildcards so a pathological `q` can't backtrack. */
function escapeLike(raw: string): string {
  return raw.replace(/[\\%_]/g, '\\$&');
}

/**
 * Tenant-scoped issue list. Keyset-paginated on (created_at, id) DESC.
 * Soft-delete filter (`deleted_at IS NULL`) lands with UIC-4 — column does
 * not exist yet, so omit here.
 */
export async function listReportedIssues(
  orgId: string,
  filters: ListReportedIssuesFilters,
  deps: UserIssuesDeps,
): Promise<ListReportedIssuesResult> {
  const limit = Math.min(Math.max(filters.limit ?? 50, 1), 100);
  const status = filters.status ?? null;
  const type = filters.type ?? null;
  const reporterId =
    typeof filters.reporterId === 'number' && Number.isFinite(filters.reporterId) && filters.reporterId > 0
      ? Math.floor(filters.reporterId)
      : null;
  const rawQ = filters.q?.trim() ? filters.q.trim().slice(0, 200) : null;
  const q = rawQ ? `%${escapeLike(rawQ)}%` : null;
  const cursorAt = filters.cursor?.createdAt ?? null;
  const cursorId =
    filters.cursor && Number.isFinite(filters.cursor.id) && filters.cursor.id > 0
      ? filters.cursor.id
      : null;

  const result = await deps.query(
    orgId,
    `SELECT ${ISSUE_SELECT}
       FROM user_reported_issues uri
       LEFT JOIN staff s
         ON s.id = uri.reporter_staff_id
        AND s.organization_id = uri.organization_id
      WHERE uri.organization_id = $1::uuid
        AND ($2::text IS NULL OR uri.status = $2)
        AND ($3::text IS NULL OR uri.issue_type = $3)
        AND ($4::int IS NULL OR uri.reporter_staff_id = $4)
        AND ($5::text IS NULL OR (
              uri.title ILIKE $5 ESCAPE '\\'
           OR uri.description ILIKE $5 ESCAPE '\\'
           OR COALESCE(uri.page_path, '') ILIKE $5 ESCAPE '\\'
        ))
        AND ($6::timestamptz IS NULL
             OR (uri.created_at, uri.id) < ($6::timestamptz, $7::bigint))
      ORDER BY uri.created_at DESC, uri.id DESC
      LIMIT $8`,
    [orgId, status, type, reporterId, q, cursorAt, cursorId, limit + 1],
  );

  const rows = result.rows;
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const issues = page.map(mapIssue);
  const last = issues[issues.length - 1];
  return {
    issues,
    nextCursor: hasMore && last ? { createdAt: last.createdAt, id: last.id } : null,
  };
}

export async function getReportedIssue(
  orgId: string,
  id: number,
  deps: UserIssuesDeps,
): Promise<ReportedIssue | null> {
  if (!Number.isFinite(id) || id <= 0) return null;
  const result = await deps.query(
    orgId,
    `SELECT ${ISSUE_SELECT}
       FROM user_reported_issues uri
       LEFT JOIN staff s
         ON s.id = uri.reporter_staff_id
        AND s.organization_id = uri.organization_id
      WHERE uri.organization_id = $1::uuid AND uri.id = $2
      LIMIT 1`,
    [orgId, id],
  );
  const row = result.rows[0];
  return row ? mapIssue(row) : null;
}

export interface CreateIssueInput {
  reporterStaffId: number | null;
  issueType: UserIssueType;
  title: string;
  description: string;
  pagePath?: string | null;
  clientEventId?: string | null;
}

export interface CreatedIssue {
  id: number;
  /** True when clientEventId matched an existing row (retry replay). */
  idempotent: boolean;
}

export async function createReportedIssue(
  orgId: string,
  input: CreateIssueInput,
  deps: UserIssuesDeps,
): Promise<CreatedIssue> {
  if (input.clientEventId) {
    const existing = await deps.query(
      orgId,
      `SELECT id FROM user_reported_issues
        WHERE organization_id = $1::uuid AND client_event_id = $2 LIMIT 1`,
      [orgId, input.clientEventId],
    );
    if (existing.rows[0]) return { id: Number(existing.rows[0].id), idempotent: true };
  }
  const inserted = await deps.query(
    orgId,
    `INSERT INTO user_reported_issues
       (organization_id, reporter_staff_id, issue_type, title, description, page_path, client_event_id)
     VALUES ($1::uuid, $2, $3, $4, $5, $6, $7)
     RETURNING id`,
    [
      orgId,
      input.reporterStaffId,
      input.issueType,
      input.title.trim(),
      input.description.trim(),
      input.pagePath?.trim() || null,
      input.clientEventId ?? null,
    ],
  );
  return { id: Number(inserted.rows[0].id), idempotent: false };
}

/** Best-effort GitHub linkage after the dual-write's mirror half succeeds. */
export async function attachGithubIssue(
  orgId: string,
  issueId: number,
  github: { number: number; url: string },
  deps: UserIssuesDeps,
): Promise<void> {
  await deps.query(
    orgId,
    `UPDATE user_reported_issues
        SET github_issue_number = $3, github_issue_url = $4, updated_at = now()
      WHERE organization_id = $1::uuid AND id = $2`,
    [orgId, issueId, github.number, github.url],
  );
}

export interface ResolveIssueInput {
  issueId?: number;
  githubIssueNumber?: number;
  resolutionCommit?: string | null;
}

export type ResolveIssueResult =
  | { ok: true; issueId: number; reporterStaffId: number | null; title: string; idempotent: boolean }
  | { ok: false; error: 'not_found' | 'bad_input' };

/**
 * Flip an issue to `deployed` (ALP-5.3). Idempotent: re-resolving an already
 * deployed issue reports `idempotent: true` and does NOT re-notify — the
 * reporter gets exactly one toast per fix.
 */
export async function resolveReportedIssue(
  orgId: string,
  input: ResolveIssueInput,
  deps: UserIssuesDeps,
): Promise<ResolveIssueResult> {
  const byId = Number.isFinite(input.issueId) && (input.issueId as number) > 0;
  const byGithub = Number.isFinite(input.githubIssueNumber) && (input.githubIssueNumber as number) > 0;
  if (!byId && !byGithub) return { ok: false, error: 'bad_input' };

  const where = byId ? 'id = $2' : 'github_issue_number = $2';
  const key = byId ? input.issueId : input.githubIssueNumber;

  const found = await deps.query(
    orgId,
    `SELECT id, reporter_staff_id, title, status FROM user_reported_issues
      WHERE organization_id = $1::uuid AND ${where}
      ORDER BY id DESC LIMIT 1`,
    [orgId, key],
  );
  const row = found.rows[0];
  if (!row) return { ok: false, error: 'not_found' };

  const issueId = Number(row.id);
  const reporterStaffId = row.reporter_staff_id == null ? null : Number(row.reporter_staff_id);
  const title = String(row.title);

  if (String(row.status) === 'deployed') {
    return { ok: true, issueId, reporterStaffId, title, idempotent: true };
  }

  // Conditional UPDATE — the `AND status <> 'deployed'` makes the flip atomic
  // at the row level, so two concurrent resolves can't both see 'pending' and
  // both fire a toast (each query runs in its own tx via tenantQuery). The
  // loser's rowCount is 0 → reported idempotent → no second toast.
  const updated = await deps.query(
    orgId,
    `UPDATE user_reported_issues
        SET status = 'deployed', resolution_commit = $3, resolved_at = now(), updated_at = now()
      WHERE organization_id = $1::uuid AND id = $2 AND status <> 'deployed'`,
    [orgId, issueId, input.resolutionCommit?.trim() || null],
  );
  const changed = (updated.rowCount ?? 0) > 0;
  return { ok: true, issueId, reporterStaffId, title, idempotent: !changed };
}
