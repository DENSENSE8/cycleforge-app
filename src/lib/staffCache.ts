import { getCurrentPSTDateKey } from '@/utils/date';

export interface StaffMember {
  id: number;
  name: string;
  /** Legacy primary-role string (mirror of staff_roles[0]). Kept for display. */
  role: string;
  /** RBAC role keys from staff_roles — the source of truth for membership. */
  roles: string[];
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
        return {
          id: Number(m.id),
          name: String(m.name || ''),
          role,
          roles,
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
      //
      // This used to read `res.ok ? res.json() : []`, which turned a 401 or a
      // dev-server hiccup into an empty ROSTER — and because `_data` is set
      // unconditionally on the next line and `[]` is truthy, the early return
      // above then served that empty array to every later caller for the life
      // of the page. One unlucky request and every staff picker on the surface
      // says "no staff" until a reload. A failure must stay retryable.
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

const FLOOR_LANE_KEYS = new Set(['technician', 'picker', 'pick', 'tech', 'packer', 'pack']);

/** Keep a warm roster after an inline Pick / Pack role write — no loading frame. */
export function patchCachedStaffLaneRole(
  staffId: number,
  role: 'technician' | 'packer',
): void {
  const patch = (list: StaffMember[]): StaffMember[] =>
    list.map((member) => {
      if (member.id !== staffId) return member;
      const kept = member.roles.filter((key) => !FLOOR_LANE_KEYS.has(key.trim().toLowerCase()));
      return { ...member, role, roles: [role, ...kept] };
    });
  if (_data) _data = patch(_data);
  if (_presentData) _presentData = patch(_presentData);
}

/** Call this when staff data changes (e.g. after a PUT/POST to /api/staff). */
export function invalidateStaffCache(): void {
  _data = null;
  _promise = null;
  _presentData = null;
  _presentPromise = null;
  _presentDateKey = null;
}
