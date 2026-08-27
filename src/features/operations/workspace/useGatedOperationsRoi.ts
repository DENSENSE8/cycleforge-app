'use client';

/**
 * Permission-gated {@link useOperationsRoi} with a real pending flag.
 * A disabled React-Query stays `status: 'pending'` forever, so we read
 * `isLoading` (pending ∧ actively fetching) — false when the user lacks
 * `operations.view`, true only on a genuine cold fetch. Shared by Dashboard
 * Outbound and Shipping Pending attention strips.
 */

import { useAuth } from '@/contexts/AuthContext';
import {
  useOperationsRoi,
  type OperationsRoiData,
} from '@/features/operations/workspace/useOperationsRoi';

export function useGatedOperationsRoi(): {
  roi: OperationsRoiData | null;
  pending: boolean;
} {
  const { isLoaded, has } = useAuth();
  const enabled = isLoaded && has('operations.view');
  const query = useOperationsRoi({ enabled });
  return {
    roi: query.data?.hasData ? query.data : null,
    pending: enabled && query.isLoading,
  };
}
