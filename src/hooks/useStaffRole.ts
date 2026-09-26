'use client';

import { useAuth } from '@/contexts/AuthContext';

export type ClientStaffRole =
  | 'packer'
  | 'receiving'
  | 'technician'
  | 'sales'
  | 'admin'
  | 'readonly'
  | 'unknown';

const ADMIN_TIER: ReadonlySet<ClientStaffRole> = new Set(['admin']);

function normalizeRole(raw: string | null | undefined): ClientStaffRole {
  const r = String(raw ?? '').trim().toLowerCase();
  return r === 'packer' ||
    r === 'receiving' ||
    r === 'technician' ||
    r === 'sales' ||
    r === 'admin' ||
    r === 'readonly'
    ? (r as ClientStaffRole)
    : 'unknown';
}

export interface UseStaffRoleResult {
  role: ClientStaffRole;
  isAdmin: boolean;
  isReadonly: boolean;
  loading: boolean;
}

/**
 * Client-side role resolver.
 * actual security boundary.
 */
export function useStaffRole(): UseStaffRoleResult {
  const { user, isLoaded } = useAuth();
  const role = normalizeRole(user?.role);
  return {
    role,
    isAdmin: ADMIN_TIER.has(role),
    isReadonly: role === 'readonly',
    loading: !isLoaded,
  };
}
