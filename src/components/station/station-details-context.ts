import type { ShippedDetailsContext } from '@/utils/events';

export type StationDetailsPanelContext =
  | 'dashboard'
  | 'queue'
  | 'fulfillment'
  | 'labels'
  | 'staged'
  | 'shipped'
  | 'station'
  | 'packer';

export function resolveStationDetailsPanelContext(
  payloadContext: ShippedDetailsContext | undefined,
  viewMode: 'history' | 'pending' | 'shipped' | 'manual',
  stationRole: 'tech' | 'packer',
): StationDetailsPanelContext {
  if (payloadContext === 'queue') return 'queue';
  if (viewMode === 'pending' || viewMode === 'shipped') return 'dashboard';
  return stationRole === 'packer' ? 'packer' : 'station';
}
