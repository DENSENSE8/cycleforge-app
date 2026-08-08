/**
 * Map the ONE realtime health model (`useRealtimeLink()` → `connection-health`)
 * to the `LiveFeedCard` pill state. The Ops dashboard used to hardcode
 * `ablyStatus="connected"`, so the green "Live" pill lied while realtime was
 * down — a best-in-class monitor never misreports its own connection (H1 Phase A;
 * `wms-premium-parity-gap-H1-HANDOFF.md`). This is a thin adapter over the shared
 * store, NOT a second health model.
 */
import type { RealtimeLinkHealth } from '@/lib/realtime/connection-health';

export type LiveFeedAblyStatus = 'connected' | 'connecting' | 'disconnected';

/**
 * `degraded` is the debounced "held past grace" signal; `health` is the raw
 * classification. Only claim **Live** when the link is genuinely healthy; a
 * routine reconnect (`wobbling`) or an un-established link (`unknown`) shows
 * *connecting*, never a green Live; a held degradation shows *disconnected*.
 */
export function realtimeLinkToAblyStatus(link: {
  health: RealtimeLinkHealth;
  degraded: boolean;
}): LiveFeedAblyStatus {
  if (link.degraded || link.health === 'degraded') return 'disconnected';
  if (link.health === 'healthy') return 'connected';
  // 'wobbling' (reconnecting within grace) and 'unknown' (not yet established).
  return 'connecting';
}
