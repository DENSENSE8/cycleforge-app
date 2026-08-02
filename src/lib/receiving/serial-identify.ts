/**
 * Serial OCR candidate resolution — the domain half of
 * `POST /api/receiving/identify-serial`.
 *
 * ## It receives TEXT, never an image
 *
 * Same contract as the label path (`./label-identify.ts`): the browser posts the
 * captured frame straight to the LAN vision box, which does the OCR, and only
 * the resulting STRINGS come here. A full-res frame never reaches Vercel. This
 * module could not accept one if it wanted to.
 *
 * ## OCR proposes; the operator commits
 *
 * Nothing here writes. A read pre-fills the serial field and flags duplicates so
 * the operator can see what they are about to do; attaching a serial stays
 * `POST /api/receiving/scan-serial`. A vision system that wrote directly would
 * be attributing a scan to a person who never made one — the same class of
 * falsifiable claim the derived procedure exists to prevent.
 *
 * ## Classification is the existing scan vocabulary, not a new one
 *
 * Reads are normalized through `classifyInput` (`@/lib/scan-resolver`) — the
 * same classifier the station scan bar routes on — and anything that comes back
 * as a carrier tracking number, an FNSKU or a SKU is DROPPED. An OCR pass over a
 * unit's back panel picks up the shipping label, a barcode and a model string as
 * readily as it picks up the serial; offering those as serial candidates is how
 * a tracking number ends up attached as a unit's identity.
 */

import { classifyInput } from '@/lib/scan-resolver';
import { detectStationScanType } from '@/lib/station-scan-routing';

interface SerialCandidate {
  /** The read as the operator would type it — normalized, never the raw frame text. */
  serial: string;
  /** Normalized comparison key (the form duplicates are judged on). */
  normalized: string;
  /** Already attached to THIS line — re-scanning it is a no-op, not a new unit. */
  alreadyOnLine: boolean;
  /**
   * Attached to a DIFFERENT line in this org. Not an error — a return of a unit
   * this warehouse shipped is exactly this — but the operator must see it before
   * committing, because the alternative is silently minting a second unit for
   * one physical thing.
   */
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

/**
 * Normalize one OCR read to a serial candidate string, or null when it is not a
 * serial at all.
 *
 * TWO different normalizations are in play here and conflating them is the trap:
 *
 *   - The **verdict** ("is this a serial?") is `detectStationScanType`, the
 *     station's own precedence chain (SKU → repair → FNSKU → command → carrier
 *     tracking → serial). Asked rather than re-implemented, so an OCR read
 *     routes exactly the way the same string typed into the scan bar would.
 *   - The **identity key** ("is this the same unit?") is `upper(trim(...))`,
 *     because that is the definition of `serial_units.normalized_serial`
 *     (`serial-attach.ts`). `classifyInput`'s `normalized` must NOT be used
 *     here: for a long read it strips non-alphanumerics, so `ABC-1234…` would
 *     be compared as `ABC1234…` against a stored `ABC-1234…` and every
 *     dash-bearing serial would read as brand new.
 *
 * The lookup SQL applies the same `upper(trim())` to its parameter, so the two
 * sides cannot drift into disagreeing about what "the same serial" means.
 */
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
