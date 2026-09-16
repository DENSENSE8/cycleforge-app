import { DeviceEventEmitter, type EmitterSubscription } from 'react-native';
import { useEffect, useRef } from 'react';
import { parseHardwareScannerPayload, type HardwareScannerPayload } from '../scanner/scanner-payload';

export const HARDWARE_SCANNER_INPUT_EVENT = 'cycleforge.hardwareScanner.input';

export function emitMockHardwareScan(value: string): void {
  DeviceEventEmitter.emit(HARDWARE_SCANNER_INPUT_EVENT, { value });
}

/**
 * Subscribes to the native scanner bridge. The mock emitter uses the same
 * event contract, so a simulator can exercise the complete L3 flow without a
 * scanner accessory. The subscription is always removed on unmount.
 */
export function useHardwareScanner(onScan: (value: string) => void): void {
  const onScanRef = useRef(onScan);

  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  useEffect(() => {
    const subscription: EmitterSubscription = DeviceEventEmitter.addListener(
      HARDWARE_SCANNER_INPUT_EVENT,
      (payload: HardwareScannerPayload) => {
        const value = parseHardwareScannerPayload(payload);
        if (value) onScanRef.current(value);
      },
    );

    return () => subscription.remove();
  }, []);
}
