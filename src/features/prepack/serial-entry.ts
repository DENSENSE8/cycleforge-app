import type { ComponentType } from 'react';

/**
 * How a surface takes one serial — the form's first serial and every
 * package row's Add serial. The phone scans with its camera
 * (`src/components/mobile/prepack`); the desk types into a floating-label
 * field with a phone icon that hands the scan to the staffer's phone
 * (`src/components/inventory/qc-labels`). The shared form never imports either.
 */
export interface PrepackSerialEntryProps {
  /** Take one typed or scanned serial. */
  onSerial: (raw: string) => void;
  busy: boolean;
  /** Field label; defaults to "Serial number". */
  label?: string;
  /** Focus (desk) / open the camera prompt (phone) on mount. Default true. */
  autoFocus?: boolean;
  /** Desk → phone serial handoff for THIS entry; the phone may answer with several serials. */
  phone: {
    send: () => void;
    /** The request is being delivered. */
    sending: boolean;
    /** The phone has this entry's request open and may still send serials. */
    waiting: boolean;
    stop: () => void;
    available: boolean;
  };
}

export type PrepackSerialEntry = ComponentType<PrepackSerialEntryProps>;
