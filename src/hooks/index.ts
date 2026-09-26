/** Hooks barrel export — the CATEGORY hooks only. */

// ─── Consolidated category hooks ──────────────────────────────────────────────
export * from './_lifecycle';
export * from './_storage';
export * from './_ui';
export * from './_auth';
export * from './_cache';
export * from './_form';
export * from './_mutations';
export * from './_events';

// ─── Domain hooks with real barrel consumers ──────────────────────────────────
export { useChipTooltip, useCopyChip } from './useCopyChip';

export {
  invalidateSupportContextCaches,
  useLinkTicketTrackingReference,
} from './useLinkTicketTrackingReference';

export { useOrderAssignment } from './useOrderAssignment';
export { useDeleteOrderRow } from './useDeleteOrderRow';
