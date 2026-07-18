/**
 * Channel allocation waist — post-test disposition types.
 *
 * SoT for "where does a passed unit go next": FBA inbound prep vs pre-box/stock
 * vs hold. Views render dispositions/reasons; they must not re-derive the rules.
 *
 * @see docs/todo/fba-surface-split-plan.md
 */

import type { VelocityTier } from '@/lib/velocity-tier-tone';

/** Operator-facing destination after QC pass. */
export type ChannelDisposition = 'FBA' | 'PREBOX_STOCK' | 'HOLD';

/** Transparent reason chips — presentation maps labels from these codes only. */
export type AllocationReason =
  | 'OVERRIDE'
  | 'AMAZON_OOS'
  | 'HIGH_VELOCITY'
  | 'FBA_PLAN_OPEN'
  | 'FBA_FILLED'
  | 'LOW_VELOCITY'
  | 'DEFAULT_POLICY';

export type AllocationEntityType = 'SERIAL_UNIT' | 'RECEIVING_LINE';

/** Whether a recently-tested unit can still enter channel allocation. */
export type ReadyAllocationState =
  | 'READY'
  | 'FBA_STAGED'
  | 'ORDER_ALLOCATED'
  | 'NOT_READY';

/** Facts fed into the pure recommender — no I/O. */
export interface DispositionFacts {
  /** Explicit staff/system hold. */
  hold?: boolean;
  /** Amazon FC quantity at or below OOS threshold (or unknown treated as false). */
  amazonOos?: boolean;
  /** Velocity tier from reports SoT (A–D). */
  velocityTier?: VelocityTier | null;
  /** Remaining open qty on non-shipped FBA plan lines for this FNSKU/ASIN. */
  openFbaPlanRemaining?: number;
  /**
   * True when FBA depth (or open plan) already meets the tenant fill target
   * for this SKU — used when not OOS and no open plan gap.
   */
  fbaFilled?: boolean;
  /** Tenant default when no stronger rule fires. */
  defaultDisposition?: Exclude<ChannelDisposition, 'HOLD'>;
}

export interface DispositionRecommendation {
  disposition: ChannelDisposition;
  reasons: AllocationReason[];
  /** Higher = earlier in the outbound ready queue. */
  score: number;
}

/** One ready-queue row after allocation (display facts attached by the loader). */
export interface AllocationHit {
  /** Append-only testing_results id; distinct when the same unit is tested again. */
  testingResultId: number;
  entityType: AllocationEntityType;
  entityId: number;
  skuCatalogId: number | null;
  /** Display SKU string only — never join key. */
  sku: string | null;
  serialNumber: string | null;
  fnsku: string | null;
  asin: string | null;
  title: string | null;
  conditionGrade: string | null;
  unitStatus: string | null;
  verdict: string | null;
  testedBy: number | null;
  testedByName: string | null;
  testedAt: string | null;
  /** Null when the history row no longer has a channel-allocation destination. */
  disposition: ChannelDisposition | null;
  allocationState: ReadyAllocationState;
  reasons: AllocationReason[];
  score: number;
  velocityTier: VelocityTier | null;
}

export const ALLOCATION_REASON_LABELS: Record<AllocationReason, string> = {
  OVERRIDE: 'Hold override',
  AMAZON_OOS: 'Amazon OOS',
  HIGH_VELOCITY: 'High velocity',
  FBA_PLAN_OPEN: 'Open FBA plan',
  FBA_FILLED: 'FBA filled',
  LOW_VELOCITY: 'Low velocity',
  DEFAULT_POLICY: 'Default policy',
};

export const CHANNEL_DISPOSITION_LABELS: Record<ChannelDisposition, string> = {
  FBA: 'FBA',
  PREBOX_STOCK: 'Pre-box & stock',
  HOLD: 'Hold',
};
