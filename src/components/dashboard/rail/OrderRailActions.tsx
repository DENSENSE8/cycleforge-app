'use client';

/**
 * Re-export seam — orders rail bodies keep importing from this path.
 * Implementation lives in `@/components/right-rail/RailSelectionActions` so
 * receiving (and any future selection plane) can share the band + action region
 * without importing dashboard UI.
 */

export {
  RailActionRegion,
  RailSelectionBand,
  useRailActionSnapshot,
  useRailHeaderActions,
} from '@/components/right-rail/RailSelectionActions';
