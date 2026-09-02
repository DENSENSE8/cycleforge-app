/**
 * Hooks barrel export — the CATEGORY hooks only.
 *
 * Import the cross-cutting category hooks from '@/hooks'; never reach into the
 * internal `_*.ts` files directly.
 *
 * Category files (internal):
 *   _lifecycle.ts  useMount, useUnmount, usePrevious, useDebounce, useThrottle, useIsMounted
 *   _storage.ts    useLocalStorage, useSessionStorage
 *   _ui.ts         useScrollPosition, useWindowSize, useToggle, useInView, useClickOutside, useMediaQuery, useIsMobile, useDeviceMode
 *   _auth.ts       useAuthToken, usePermissions
 *   _cache.ts      useCache
 *   _form.ts       useAutoSaveForm, useUnsavedWarning
 *   _mutations.ts  useOptimisticMutation, useResourceMutation, useConfirmedAction, jsonOrThrow, HttpError
 *   _events.ts     useEventBridge, emitAppEvent (window CustomEvent bus)
 *
 * ## Domain hooks import from their own module, not from here
 *
 * This file used to say "always import hooks from '@/hooks'" and re-export ~27
 * domain hooks to back that up. The codebase had already voted the other way:
 * every one of those re-exports had **zero** barrel consumers while the same
 * hooks were imported by path 150+ times (`useAblyChannel` 33, `usePackerLogs`
 * 17, `useTechLogs` 16, …). A convention stated here and contradicted
 * everywhere is not a convention, so the rule now matches the code.
 *
 * The re-exports were not merely noise. `export *`-style aliasing made five
 * hook files reachable from an entry point, so file-level dead-code detection
 * could never see them: `useUnifiedKeyboard`, `useTodayStaffAvailability`,
 * `useStationHistory`, `useInfiniteScroll` and `useRepairQueries` had no
 * consumer at all and were deleted with this trim (638 LOC). A barrel that
 * re-exports something nothing imports doesn't just widen the public surface —
 * it hides the corpse.
 *
 * So: a domain hook earns a line here when two or more surfaces import it
 * through the barrel. Otherwise it lives at `@/hooks/<name>`.
 */

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
export { useMoveLocation, resolveLocationScan } from './useMoveLocation';
export { useDeleteOrderRow } from './useDeleteOrderRow';
