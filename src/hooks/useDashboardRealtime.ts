'use client';

/** Wires up the dashboard's realtime side effects in one place: */

import { useRealtimeInvalidation } from '@/hooks/useRealtimeInvalidation';
import { useFbaRealtimeInvalidation } from '@/hooks/useFbaRealtimeInvalidation';
import { useRealtimeToasts } from '@/hooks/useRealtimeToasts';

export function useDashboardRealtime(): void {
  useRealtimeInvalidation({ dashboard: true, reconnect: true });
  useFbaRealtimeInvalidation();
  useRealtimeToasts('admin');
}
