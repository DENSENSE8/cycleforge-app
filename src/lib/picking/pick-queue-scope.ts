/**
 * Resolve which staffer's pick queue to load.
 *
 * Session staff is the default. Admins with `admin.view_logs` may pass
 * `?staffId=` to inspect another picker. Pure — unit-tested without HTTP.
 */

type PickQueueScopeInput = {
  sessionStaffId: number | null | undefined;
  staffIdParam: string | null;
  canInspectOther: boolean;
};

type PickQueueScopeResult =
  | { ok: true; staffId: number }
  | { ok: false; error: string };

export function resolvePickQueueStaffId(input: PickQueueScopeInput): PickQueueScopeResult {
  const raw =
    input.canInspectOther && input.staffIdParam != null && input.staffIdParam !== ''
      ? Number(input.staffIdParam)
      : Number(input.sessionStaffId);
  if (!Number.isFinite(raw) || raw <= 0) {
    return { ok: false, error: 'Valid staff session required' };
  }
  return { ok: true, staffId: raw };
}
