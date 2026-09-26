/** HID wedge scan machine — the PURE buffer classifier behind {@link createWedgeKeyListener}. */

export const WEDGE_MAX_INTER_KEY_MS = 50;
export const WEDGE_IDLE_FLUSH_MS = 80;
export const WEDGE_MIN_LENGTH = 3;

export interface WedgeScanState {
  buffer: string;
  lastKeyAt: number;
}

export const WEDGE_IDLE: WedgeScanState = { buffer: '', lastKeyAt: 0 };

export interface WedgeKeyInput {
  key: string;
  altKey: boolean;
  metaKey: boolean;
  ctrlKey: boolean;
  timeStamp: number;
  editable: boolean;
}

interface WedgeScanOpts {
  maxInterKeyMs: number;
  minLength: number;
}

type WedgeScanStep =
  | { state: WedgeScanState; kind: 'ignore' }
  | { state: WedgeScanState; kind: 'reset' }
  | { state: WedgeScanState; kind: 'append' }
  | {
      state: WedgeScanState;
      kind: 'commit';
      value: string;
      preventDefault: true;
    };

export function wedgeReduce(
  state: WedgeScanState,
  event: WedgeKeyInput,
  opts: WedgeScanOpts,
): WedgeScanStep {
  if (event.altKey || event.metaKey || event.ctrlKey) {
    return { state: WEDGE_IDLE, kind: 'reset' };
  }
  if (event.editable) {
    return { state: WEDGE_IDLE, kind: 'reset' };
  }

  if (event.key === 'Enter' || event.key === 'Tab') {
    if (state.buffer.length === 0) return { state, kind: 'ignore' };
    return {
      state: WEDGE_IDLE,
      kind: 'commit',
      value: state.buffer.trim(),
      preventDefault: true,
    };
  }

  if (event.key.length === 1) {
    const gap = state.lastKeyAt === 0 ? 0 : event.timeStamp - state.lastKeyAt;
    const buffer =
      gap > opts.maxInterKeyMs && state.buffer.length > 0 ? '' : state.buffer;
    return {
      state: { buffer: buffer + event.key, lastKeyAt: event.timeStamp },
      kind: 'append',
    };
  }

  return { state: WEDGE_IDLE, kind: 'reset' };
}

export function wedgeValueAcceptable(value: string, minLength: number): boolean {
  return value.length >= minLength;
}
