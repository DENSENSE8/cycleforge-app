'use client';

/**
 * A small live camera that scans as soon as it shows — no scan bar, no input,
 * no toggle. For a sheet step whose job is one label (park a tote, move into a
 * tote or onto a shelf); a hardware scanner still reads through `wedge-scan`.
 * Where the browser offers no camera (plain http: no `getUserMedia`) it draws
 * nothing — the host shows its typing fallback instead ({@link useScanCameraAvailable}).
 */

import { useEffect, useRef, useSyncExternalStore } from 'react';
import { useBarcodeScanner } from '@/hooks/useBarcodeScanner';
import { canUseContinuousWebCamera } from '@/lib/photos/capture-session';
import { cn } from '@/utils/_cn';
import { ScanViewfinderFrame } from './ScanViewfinderFrame';

/** Camera availability never changes while a page is open: nothing to subscribe to (stable identity for the store). */
const noSubscription = () => () => undefined;

/**
 * Whether this page can open a camera to scan with. False on the server and on
 * plain-http pages, where browsers withhold `navigator.mediaDevices`.
 */
export function useScanCameraAvailable(): boolean {
  return useSyncExternalStore(noSubscription, canUseContinuousWebCamera, () => false);
}

type ViewfinderProps = {
  onDecode: (value: string) => void;
  className?: string;
  testId?: string;
};

export function MobileScanViewfinder(props: ViewfinderProps) {
  return useScanCameraAvailable() ? <LiveScanViewfinder {...props} /> : null;
}

function LiveScanViewfinder({ onDecode, className, testId }: ViewfinderProps) {
  const scanner = useBarcodeScanner({ dedupMs: 2000 });
  const onDecodeRef = useRef(onDecode);
  onDecodeRef.current = onDecode;

  const { startScanning, stopScanning } = scanner;
  useEffect(() => {
    void startScanning();
    return () => { void stopScanning(); };
  }, [startScanning, stopScanning]);

  useEffect(() => {
    if (!scanner.lastScannedValue) return;
    onDecodeRef.current(scanner.lastScannedValue.trim());
    scanner.acceptScan();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed off the decode only (MobileV2ScanInput's race note)
  }, [scanner.lastScannedValue]);

  return (
    <div className={cn('overflow-hidden rounded-surface', className)} data-testid={testId}>
      <ScanViewfinderFrame videoRef={scanner.videoRef} height="18vh" boxSize="h-24 w-24" />
      {scanner.error ? <p role="alert" className="px-1 pt-1 text-role-caption text-text-danger">{scanner.error}</p> : null}
    </div>
  );
}
