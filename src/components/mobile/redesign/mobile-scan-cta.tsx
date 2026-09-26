'use client';

/** The mobile SCAN control — one host-owned CTA, pinned top-right on every mobile page that shows {@link MobileTopBar}. */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Plus, ScanBarcode } from '@/components/Icons';
import { IconButton } from '@/design-system/primitives';
import { cn } from '@/utils/_cn';
import { MOBILE_BAR_CELL_CLASS } from './MobileActionSlot';

/**
 * The scan surface's own route — the CTA's destination and its "here" test.
 * Module-local: nothing outside needs it, and a pass-through export nothing
 * imports is dead weight the knip gate counts.
 */
const MOBILE_SCAN_PATH = '/m/scan';

type NewScanHandler = () => void;

interface MobileScanContextValue {
  /** Registered by the scan page; null when no scan surface is mounted. */
  handlerRef: React.MutableRefObject<NewScanHandler | null>;
}

const MobileScanContext = createContext<MobileScanContextValue | null>(null);

/**
 * Mounted once by the mobile shell so the top bar's CTA can reach whichever
 * scan surface is currently on screen.
 */
export function MobileScanProvider({ children }: { children: ReactNode }) {
  const handlerRef = useRef<NewScanHandler | null>(null);
  const value = useMemo<MobileScanContextValue>(() => ({ handlerRef }), []);
  return <MobileScanContext.Provider value={value}>{children}</MobileScanContext.Provider>;
}

/**
 * Register the "start a new scan" reset for the mounted scan surface. Held in a
 * ref, not state, so re-registering on every render costs nothing and never
 * re-renders the top bar.
 */
export function useRegisterNewScan(handler: NewScanHandler): void {
  const ctx = useContext(MobileScanContext);
  const handlerRef = ctx?.handlerRef;

  useEffect(() => {
    if (!handlerRef) return;
    handlerRef.current = handler;
    return () => {
      // Only clear our own registration — a fast route swap can mount the next
      // surface before this cleanup runs.
      if (handlerRef.current === handler) handlerRef.current = null;
    };
  }, [handlerRef, handler]);
}

/**
 * The CTA itself.
 * top-right corner, no radius, no padding around it (operator 2026-09-24) —
 */
export function MobileScanCta({
  fill = false,
}: {
  /**
   * Stretch to the full height of a bar taller than the 44px cell (the 56px
   * `MobileDetailTopBar`), so the cell stays flush to its top and bottom edges.
   */
  fill?: boolean;
} = {}) {
  const router = useRouter();
  const pathname = usePathname();
  const ctx = useContext(MobileScanContext);
  const onScanSurface = pathname === MOBILE_SCAN_PATH;

  const onClick = useCallback(() => {
    if (!onScanSurface) {
      router.push(MOBILE_SCAN_PATH);
      return;
    }
    // On the scan surface the CTA re-arms in place. If no surface registered
    // (an unexpected mount order), fall back to a route refresh rather than
    // leaving the tap dead.
    const reset = ctx?.handlerRef.current;
    if (reset) reset();
    else router.refresh();
  }, [onScanSurface, router, ctx]);

  return (
    <IconButton
      size="touch"
      onClick={onClick}
      // `ScanBarcode`, not `Barcode` (operator 2026-09-15).
      // `ScanBarcode`, not `Barcode` (operator 2026-09-15). A bare barcode is
      icon={onScanSurface ? <Plus className="h-5 w-5" /> : <ScanBarcode className="h-5 w-5" />}
      ariaLabel={onScanSurface ? 'Start a new scan' : 'Go to scan'}
      className={cn(
        MOBILE_BAR_CELL_CLASS,
        'border-l text-text-default',
        fill && 'h-auto self-stretch',
      )}
    />
  );
}
