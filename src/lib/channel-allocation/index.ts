export type {
  AllocationEntityType,
  AllocationHit,
  AllocationReason,
  ChannelDisposition,
  DispositionFacts,
  DispositionRecommendation,
  ReadyAllocationState,
} from './types';
export {
  ALLOCATION_REASON_LABELS,
  CHANNEL_DISPOSITION_LABELS,
} from './types';
export {
  compareAllocationHits,
  recommendDisposition,
} from './recommend-disposition';
// ready-queue is deliberately NOT re-exported: it imports tenancy/db (the
// server-only Neon driver) and this barrel is consumed by client outbound
// tables. Server callers import '@/lib/channel-allocation/ready-queue' directly.
