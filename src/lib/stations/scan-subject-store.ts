/** The scan SUBJECT — what the operator's last scan was about. */

export type ScanSubjectKind = 'unit' | 'order';

export interface ScanSubject {
  kind: ScanSubjectKind;
  /** Unit: serial / unit_uid / numeric id. Order: `orders.id` as a decimal string. */
  value: string;
  /** Epoch ms of the scan that set it. */
  at: number;
}

/** Two minutes. A verb sticker follows its noun within a breath, or not at all. */
export const SUBJECT_TTL_MS = 120_000;

let current: ScanSubject | null = null;

/** Injectable clock so the TTL is testable without waiting. */
let now: () => number = () => Date.now();

export function setScanSubject(kind: ScanSubjectKind, value: string): void {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return;
  current = { kind, value: trimmed, at: now() };
}

/** The live subject, or null when there is none or it has aged out. */
export function getScanSubject(): ScanSubject | null {
  if (!current) return null;
  if (now() - current.at > SUBJECT_TTL_MS) {
    current = null;
    return null;
  }
  return current;
}

/**
 * Drop the subject. Called after a command consumes it — a verdict that landed
 * must not be re-appliable by a second sticker scan, which on a double
 * trigger-pull is exactly what would happen.
 */
export function clearScanSubject(): void {
  current = null;
}

/** Test seam — node:test only. */
export function __setScanSubjectClockForTests(clock: () => number): void {
  now = clock;
}

/** Test seam — node:test only. */
export function __resetScanSubjectForTests(): void {
  current = null;
  now = () => Date.now();
}
