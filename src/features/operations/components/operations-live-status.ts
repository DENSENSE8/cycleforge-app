/** Map the ONE realtime health model (`useRealtimeLink()` → `connection-health`) to the `LiveFeedCard` pill state. */
import type { RealtimeLinkHealth } from '@/lib/realtime/connection-health';

type LiveFeedAblyStatus = 'connected' | 'connecting' | 'disconnected';

/** `degraded` is the debounced "held past grace" signal; `health` is the raw classification. */
export function realtimeLinkToAblyStatus(link: {
  health: RealtimeLinkHealth;
  degraded: boolean;
}): LiveFeedAblyStatus {
  if (link.degraded || link.health === 'degraded') return 'disconnected';
  if (link.health === 'healthy') return 'connected';
  // 'wobbling' (reconnecting within grace) and 'unknown' (not yet established).
  return 'connecting';
}
