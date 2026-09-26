import { getCurrentPSTDateKey } from '@/utils/date';
import type { StaffFunctionalRoleKey } from '@/lib/schemas/staff-functional-roles';

export interface StaffMember {
  id: number;
  name: string;
  /** Legacy primary-role string (mirror of staff_roles[0]). Kept for display. */
  role: string;
  /** RBAC role keys from staff_roles — what the staffer may ACCESS. */
  roles: string[];
  /** Floor functional roles — what the staffer DOES (Pick / Pack lists). */
  functionalRoles: StaffFunctionalRoleKey[];
}

// Module-level singleton: one fetch per page load, shared across all consumers.
let _promise: Promise<StaffMember[]> | null = null;
let _data: StaffMember[] | null = null;
let _presentPromise: Promise<StaffMember[]> | null = null;
let _presentData: StaffMember[] | null = null;
let _presentDateKey: string | null = null;

function normalizeStaff(raw: any[]): StaffMember[] {
  return Array.isArray(raw)
    ? raw.map((m) => {
        const roleKeys = Array.isArray(m.role_keys)
          ? m.role_keys.map((k: unknown) => String(k)).filter(Boolean)
          : [];
        const role = String(m.role || '');
        // Fall back to the legacy primary-role string if no staff_roles rows.
        const roles = roleKeys.length > 0 ? roleKeys : role ? [role] : [];
        const functionalRoles = Array.isArray(m.functional_roles)
          ? (m.functional_roles as unknown[])
              .map((k) => String(k))
              .filter((k): k is StaffFunctionalRoleKey => k === 'picker' || k === 'packer')
          : [];
        return {
          id: Number(m.id),
          name: String(m.name || ''),
          role,
          roles,
          functionalRoles,
        };
      })
    : [];
}

/** Synced snapshot — skip a loading frame when the roster is already warm. */
export function peekActiveStaff(): StaffMember[] | null {
  return _data;
}

export function getActiveStaff(): Promise<StaffMember[]> {
  if (_data) return Promise.resolve(_data);
  if (!_promise) {
    _promise = fetch('/api/staff?active=true')
      // THROW on a bad response so the catch below owns every failure.
      .then((res) => {
        if (!res.ok) throw new Error(`staff roster ${res.status}`);
        return res.json();
      })
      .then((raw: any[]) => {
        const result = normalizeStaff(raw);
        _data = result;
        return result;
      })
      .catch(() => {
        // Reset so the next mount can retry — and leave `_data` unset.
        _promise = null;
        return [];
      });
  }
  return _promise;
}

export function getPresentStaffForToday(): Promise<StaffMember[]> {
  const todayKey = getCurrentPSTDateKey();
  if (_presentData && _presentDateKey === todayKey) return Promise.resolve(_presentData);

  if (!_presentPromise || _presentDateKey !== todayKey) {
    _presentDateKey = todayKey;
    _presentPromise = fetch('/api/staff?active=true&presentToday=true')
      // Same rule as `getActiveStaff` — a failed read is not an empty roster.
      .then((res) => {
        if (!res.ok) throw new Error(`present roster ${res.status}`);
        return res.json();
      })
      .then((raw: any[]) => {
        const result = normalizeStaff(raw);
        _presentData = result;
        return result;
      })
      .catch(() => {
        // Reset so the next mount can retry
        _presentPromise = null;
        _presentData = null;
        return [];
      });
  }

  return _presentPromise;
}

function patchCachedStaffFunctionalRole(
  staffId: number,
  functionalRoles: StaffFunctionalRoleKey[],
): void {
  const patch = (list: StaffMember[]): StaffMember[] =>
    list.map((member) => (member.id === staffId ? { ...member, functionalRoles } : member));
  if (_data) _data = patch(_data);
  if (_presentData) _presentData = patch(_presentData);
}

/**
 * Grant / revoke a floor functional role (picker / packer). Never touches RBAC
 * access roles. Keeps the warm roster in step so an open list does not flash.
 * Resolves to the staffer's full functional-role set; throws on failure.
 */
export async function saveStaffFunctionalRole(
  staffId: number,
  role: StaffFunctionalRoleKey,
  enabled: boolean,
): Promise<StaffFunctionalRoleKey[]> {
  const res = await fetch(`/api/staff/${staffId}/functional-roles`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ role, enabled }),
  });
  const body = (await res.json().catch(() => null)) as
    | { success?: boolean; functionalRoles?: StaffFunctionalRoleKey[]; error?: string }
    | null;
  if (!res.ok || !body?.success || !Array.isArray(body.functionalRoles)) {
    throw new Error(body?.error || `functional role ${res.status}`);
  }
  patchCachedStaffFunctionalRole(staffId, body.functionalRoles);
  return body.functionalRoles;
}

/** Call this when staff data changes (e.g. after a PUT/POST to /api/staff). */
function invalidateStaffCache(): void {
  _data = null;
  _promise = null;
  _presentData = null;
  _presentPromise = null;
  _presentDateKey = null;
}
