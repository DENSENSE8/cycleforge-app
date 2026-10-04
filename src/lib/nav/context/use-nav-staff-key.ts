'use client';

import { useAuth } from '@/contexts/AuthContext';

/**
 * The React Query identity every nav read is keyed on: organization +
 * staff member. A staff-only key could reuse the previous tenant's cached
 * answers after a workspace switch and briefly paint that tenant's nav.
 */
export function useNavStaffKey(): string {
  const { user } = useAuth();
  return user?.staffId != null && user.organizationId ? `${user.organizationId}:${user.staffId}` : 'anon';
}
