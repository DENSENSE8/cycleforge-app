/** Serial OCR candidate resolution — the domain half of `POST /api/receiving/identify-serial`. */

import { classifyInput } from '@/lib/scan-resolver';
import { detectStationScanType } from '@/lib/station-scan-routing';

interface SerialCandidate {
  /** The read as the operator would type it — normalized, never the raw frame text. */
  serial: string;
  /** Normalized comparison key (the form duplicates are judged on). */
  normalized: string;
  /** Already attached to THIS line — re-scanning it is a no-op, not a new unit. */
  alreadyOnLine: boolean;
  /** Attached to a DIFFERENT line in this org. */
  alreadyOnAnotherLine: boolean;
  /** The other line's id, when known. */
  otherReceivingLineId: number | null;
}

export interface SerialIdentifyDeps {
  /**
   * Existing units for these normalized serials in this org, with the receiving
   * line each currently sits on (null when it sits on none).
   */
  findExisting: (
    orgId: string,
    normalized: string[],
  ) => Promise<Array<{ normalized: string; receivingLineId: number | null }>>;
}

/** Normalize one OCR read to a serial candidate string, or null when it is not a serial at all. */
export function normalizeSerialRead(raw: string): string | null {
  const trimmed = String(raw ?? '').trim();
  if (!trimmed) return null;
  if (detectStationScanType(trimmed) !== 'SERIAL') return null;
  // Belt-and-braces: the station chain already routes carrier patterns away,
  // but this is the one misclassification that would attach a shipping label's
  // tracking number as a unit's identity.
  if (classifyInput(trimmed).type === 'tracking') return null;
  return trimmed.toUpperCase();
}

/**
 * Resolve OCR reads against the carton. Read-only.
 *
 * Duplicate reads collapse: an OCR consensus pass sends the same string several
 * times, and returning it three times would read as three units.
 */
export async function resolveSerialReads(
  input: { orgId: string; receivingLineId: number; reads: string[] },
  deps: SerialIdentifyDeps,
): Promise<SerialCandidate[]> {
  const normalized: string[] = [];
  for (const read of input.reads) {
    const value = normalizeSerialRead(read);
    if (value && !normalized.includes(value)) normalized.push(value);
  }
  if (normalized.length === 0) return [];

  const existing = await deps.findExisting(input.orgId, normalized);
  const byNormalized = new Map(existing.map((row) => [row.normalized, row.receivingLineId]));

  return normalized.map((value) => {
    const onLine = byNormalized.has(value) ? byNormalized.get(value)! : undefined;
    const alreadyOnLine = onLine === input.receivingLineId;
    return {
      serial: value,
      normalized: value,
      alreadyOnLine,
      alreadyOnAnotherLine: onLine != null && !alreadyOnLine,
      otherReceivingLineId: onLine != null && !alreadyOnLine ? onLine : null,
    };
  });
}
