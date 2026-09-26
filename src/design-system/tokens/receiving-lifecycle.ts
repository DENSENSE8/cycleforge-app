import type { RecordStateFace } from './industrial-record';

type ReceivingLifecycleState =
  | 'SCANNED'
  | 'UNBOXED'
  | 'RECEIVED'
  | 'ON_HOLD'
  | 'EXCEPTION';

export const RECEIVING_LIFECYCLE: Readonly<Record<ReceivingLifecycleState, RecordStateFace>> = {
  SCANNED: {
    id: 'SCANNED',
    code: 'SCN',
    label: 'Scanned',
    tone: 'info',
    icon: 'circle-dot',
  },
  UNBOXED: {
    id: 'UNBOXED',
    code: 'UNB',
    label: 'Unboxed',
    tone: 'fulfillment',
    icon: 'package-open',
  },
  RECEIVED: {
    id: 'RECEIVED',
    code: 'RCV',
    label: 'Received',
    tone: 'success',
    icon: 'package-check',
  },
  ON_HOLD: {
    id: 'ON_HOLD',
    code: 'HLD',
    label: 'On hold',
    tone: 'warning',
    icon: 'circle-pause',
  },
  EXCEPTION: {
    id: 'EXCEPTION',
    code: 'EXC',
    label: 'Exception',
    tone: 'danger',
    icon: 'triangle-alert',
  },
};
