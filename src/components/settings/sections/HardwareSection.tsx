'use client';

import { PrintPreferences } from '@/components/settings/PrintPreferences';
import { SettingsPanel } from '@/components/settings/SettingsPanel';
import { Panel } from '@/design-system/primitives';


export function HardwareSection() {
  return (
    <div className="space-y-6">
      <header>
        <h2 className="sr-only">Hardware</h2>
        <p className="mt-1 text-sm text-text-soft">
          Peripherals attached to this workstation apply only to this device. Scan feedback follows you to every
          station.
        </p>
      </header>

      <PrintPreferences />

      <Panel radius="2xl">
        <h3 className="text-base font-semibold text-text-default">Camera / scanner</h3>
        <p className="mt-1 text-xs text-text-soft">
          The camera used for QR / barcode scanning across the app.
        </p>
        <p className="mt-3 text-xs text-text-muted">
          Camera selection is browser-managed. Use the browser permission popup the first time you scan.
        </p>
      </Panel>

      <SettingsPanel page="scan" />

      <div className="rounded-2xl border border-dashed border-border-default bg-surface-canvas p-5 text-text-soft">
        <h3 className="text-base font-semibold text-text-muted">Shipping scale</h3>
        <p className="mt-1 text-xs">Coming soon — USB scale integration via serial port.</p>
      </div>
    </div>
  );
}
