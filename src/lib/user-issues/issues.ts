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

export interface UserIssuesDeps {
  /** Tenant-scoped query (real impl: tenantQuery(orgId, sql, params)). */
  query: (
    orgId: string,
    sql: string,
    params: unknown[],
  ) => Promise<{ rows: Array<Record<string, unknown>>; rowCount: number | null }>;
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
