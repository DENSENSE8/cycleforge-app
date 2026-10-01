import type { RecordCursorKeyOrder } from './store';

/** Resolve one ambient cursor key without changing arrow-key semantics. */
export function recordCursorKeyDirection(
  code: string,
  keyOrder: RecordCursorKeyOrder | undefined,
): 'prev' | 'next' | null {
  if (code === 'ArrowDown') return 'next';
  if (code === 'ArrowUp') return 'prev';
  if (code === 'KeyJ') return keyOrder === 'j-prev' ? 'prev' : 'next';
  if (code === 'KeyK') return keyOrder === 'j-prev' ? 'next' : 'prev';
  return null;
}
