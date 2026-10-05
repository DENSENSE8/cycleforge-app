import type { ComponentType } from 'react';

/**
 * How a surface adds serials to the package in the unit step. The phone scans
 * with its camera (`src/components/mobile/prepack`); the desk types into a
 * floating-label field and can hand the scan to a phone
 * (`src/components/inventory/qc-labels`). The shared form never imports either.
 */
export interface PrepackSerialEntryProps {
  /** Add one typed or scanned serial to the package. */
  onSerial: (raw: string) => void;
  busy: boolean;
  /** Desk → phone serial handoff; the phone may answer with several serials. */
  phone: {
    send: () => void;
    /** The request is being delivered. */
    sending: boolean;
    /** The phone has the request open and may still send serials. */
    waiting: boolean;
    stop: () => void;
    available: boolean;
  };
}

export type PrepackSerialEntry = ComponentType<PrepackSerialEntryProps>;
