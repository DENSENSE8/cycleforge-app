'use client';

/**
 * The order desks' page-level realtime extras: FBA board invalidation and the
 * admin toasts. The order-table subscriptions themselves are the shell's
 * (`RouteRealtimeMount`, `/shipping` → dashboard + reconnect).
 */

import { useFbaRealtimeInvalidation } from '@/hooks/useFbaRealtimeInvalidation';
import { useRealtimeToasts } from '@/hooks/useRealtimeToasts';

export function useDashboardRealtime(): void {
  useFbaRealtimeInvalidation();
  useRealtimeToasts('admin');
}
