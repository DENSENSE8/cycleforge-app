/**
 * Shared scan types for the receiving scan loop — extracted so the effectful
 * apply layer (`scan-apply.ts`) and the orchestrator hook (`useTrackingScan.ts`)
 * can both reference them WITHOUT importing each other (which would cycle).
 */

import type { Dispatch, MutableRefObject, RefObject, SetStateAction } from 'react';
import type { QueryClient } from '@tanstack/react-query';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import type { PhotoRequestPublisher } from '@/components/sidebar/receiving/usePhotoRequestPublisher';
import type { PoContext } from '@/components/sidebar/receiving/receiving-sidebar-shared';

/**
 * Result echoed to a scan's caller — phone-paired scans listen for this to
 * render their matched/unmatched result.
 */
export interface TrackingScanResult {
  tracking: string;
  matched: boolean;
  po_ids: string[];
  receiving_id?: number;
  exception_id?: number | null;
  exception_reason?: string | null;
  error?: string;
}

/** Everything the effectful apply layer needs to open a carton: */
export interface ScanApplyCtx {
  // — per-scan —
  /** The scanned value (carried into onResult + the promote follow-up body). */
  trackingNumber: string;
  staffId: string;
  /** Stale-guard: false once the operator switched modes mid-scan. */
  isCurrent: () => boolean;
  onResult?: (result: TrackingScanResult) => void;
  // — hook collaborators —
  queryClient: QueryClient;
  publishPhotoRequestFor: PhotoRequestPublisher;
  /**
   * Focus target for `refocusScanInput`. Deliberately kept while no input is
   * attached to it (the refocus is a no-op today) — capture-stack Phase 3
   * mounts the anchored Unbox input here. Do not prune as dead code.
   */
  serialInputRef: RefObject<HTMLInputElement | null>;
  accordionBootstrapRef: MutableRefObject<'default' | 'all'>;
  autoPushCameraRef: MutableRefObject<boolean>;
  autoFocusSerialRef: MutableRefObject<boolean>;
  setSelectedLine: Dispatch<SetStateAction<ReceivingLineRow | null>>;
  setScanMatchedRows: Dispatch<SetStateAction<ReceivingLineRow[]>>;
  setLineAccordionBootstrap: Dispatch<SetStateAction<'default' | 'all'>>;
  setScanDriven: Dispatch<SetStateAction<boolean>>;
  setPoContext: Dispatch<SetStateAction<PoContext | null>>;
  setArmedLineId: Dispatch<SetStateAction<number | null>>;
  /** Unbox vs triage — forwarded to background lookup-po follow-ups. */
  intakeSurface?: 'unbox' | 'triage';
}
