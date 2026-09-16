'use client';

/**
 * `/m/print` display step — print-faithful stickers before Print.
 *
 * Callers: MobilePrintWorkspace preview step. Mounts LocationLabelFacePreview
 * (bin / bay) or HandlingUnitLabelFacePreview (tote) — both LabelFacePreview
 * iframes. Do not hand-roll a second sticker.
 * User: printer, service, and display UX on mobile before printing; the tote
 * preview must render the real HTML that prints (operator, 2026-09-15).
 */

import { LocationLabelFacePreview } from '@/components/labels/LocationLabelFacePreview';
import { locationCode, rackCode, type LocationSegments } from '@/lib/barcode-routing';
import { cornerClass } from '@/design-system/tokens/radius';
import { cn } from '@/utils/_cn';
import {
  HandlingUnitLabelFacePreview,
  SPECIMEN_LPN_CODE,
} from '@/components/labels/HandlingUnitLabelFacePreview';

/** Dense tile sticker scale — same cap as LabelPrintRunPanel. */
const RUN_FACE_MAX_SCALE = 1.05;
const PREVIEW_FACE_CAP = 6;

function faceCode(seg: LocationSegments): string {
  if (seg.position === 0) {
    return rackCode({
      zone: seg.zone,
      aisle: seg.aisle,
      bay: seg.bay,
      level: seg.level,
    });
  }
  return locationCode(seg);
}

export function MobilePrintPreviewStep({
  segments,
  roomName,
  gln,
}: {
  segments: LocationSegments[];
  roomName: string;
  gln: string;
}) {
  const shown = segments.slice(0, PREVIEW_FACE_CAP);
  const extra = Math.max(0, segments.length - shown.length);

  return (
    <>
      <p className="text-role-caption text-text-muted">
        {segments.length} sticker{segments.length === 1 ? '' : 's'} — same 2×1 face the printer will fire.
      </p>
      {shown.map((seg) => (
        <div
          key={faceCode(seg)}
          className={cn('border border-border-soft bg-surface-card p-2', cornerClass('card'))}
        >
          <p className="mb-1 font-mono text-role-micro font-semibold text-text-default">
            {faceCode(seg)}
          </p>
          <LocationLabelFacePreview
            segments={seg}
            roomName={roomName}
            gln={gln}
            fit="capped"
            maxScale={RUN_FACE_MAX_SCALE}
          />
        </div>
      ))}
      {extra > 0 && (
        <p className="text-role-caption text-text-muted">+{extra} more print with this run</p>
      )}
    </>
  );
}

/**
 * Tote run preview. ONE specimen, not N: every plate in a bulk run carries the
 * same face until the desk mints, so six identical tiles would only cost
 * scrolling. The code reads `H-###` because the real serials do not exist yet.
 */
export function MobileTotePreviewStep({ count }: { count: number }) {
  return (
    <>
      <p className="text-role-caption text-text-muted">
        {count} tote plate{count === 1 ? '' : 's'} — same 2×1 face the printer will fire.
      </p>
      <div className={cn('border border-border-soft bg-surface-card p-2', cornerClass('card'))}>
        <p className="mb-1 font-mono text-role-micro font-semibold text-text-default">
          {SPECIMEN_LPN_CODE}
        </p>
        <HandlingUnitLabelFacePreview fit="capped" maxScale={RUN_FACE_MAX_SCALE} />
      </div>
      <p className="text-role-caption text-text-muted">
        Codes are assigned when the totes are created at Print — each plate gets its own.
      </p>
    </>
  );
}
