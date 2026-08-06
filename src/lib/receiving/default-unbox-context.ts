/**
 * Bare `/unbox` ReceivingModeContext — shared by nav hover prefetch and RSC
 * spine seed so cache keys stay byte-identical.
 */
import type { ReceivingModeContext } from '@/lib/receiving/receiving-modes';

export const DEFAULT_UNBOX_CONTEXT: ReceivingModeContext = {
  historySearch: '',
  historySearchField: 'all',
  historySearchScope: 'all',
  historySort: '',
  incomingSearch: '',
  incomingState: null,
  incomingSort: '',
  incomingPoFrom: '',
  incomingPoTo: '',
  incomingPage: 1,
  incomingSource: 'all',
  trackingIn: [],
  isDeliveredUnscannedFacet: false,
  isDeliveredNotUnboxedFacet: false,
  staffFilterId: null,
  listSearch: '',
  queueStage: null,
  queueLane: null,
  priorityOnly: false,
};
