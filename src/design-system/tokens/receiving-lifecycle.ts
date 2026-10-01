import type { RecordStateFace } from './record';

/**
 * Inbound's Unboxed view lifecycle — the receiving of inbound orders and
 * boxes only (owner 2026-09-28): scanned at the door → unboxed. The unboxed
 * face keeps the id `RECEIVED` (the `?dstate=` vocabulary) but reads
 * "Unboxed": "Received" already means the door scan (`received_at`), the
 * Zoho receive (`DONE`) and a carrier delivery. Exception = needs a person.
 * What comes after (quality control) is the next step, never a state here.
 */
type ReceivingLifecycleState = 'SCANNED' | 'RECEIVED' | 'EXCEPTION';

export const RECEIVING_LIFECYCLE: Readonly<Record<ReceivingLifecycleState, RecordStateFace>> = {
  SCANNED: {
    id: 'SCANNED',
    code: 'SCN',
    label: 'Scanned',
    tone: 'info',
    icon: 'circle-dot',
  },
  RECEIVED: {
    id: 'RECEIVED',
    code: 'UNB',
    label: 'Unboxed',
    tone: 'success',
    icon: 'package-check',
  },
  EXCEPTION: {
    id: 'EXCEPTION',
    code: 'EXC',
    label: 'Exception',
    tone: 'danger',
    icon: 'triangle-alert',
  },
};
