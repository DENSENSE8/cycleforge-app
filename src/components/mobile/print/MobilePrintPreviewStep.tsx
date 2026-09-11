'use client';

/**
 * /m/print display step — print-faithful location stickers before Print.
 *
 * Callers: MobilePrintWorkspace preview step. Mounts LocationLabelFacePreview
 * (LabelFacePreview iframe). Do not hand-roll a second sticker.
 * User: printer, service, and display UX on mobile before printing.
 */

import { LocationLabelFacePreview } from '@/components/labels/LocationLabelFacePreview';
import { locationCode, rackCode, type LocationSegments } from '@/lib/barcode-routing';
import { cornerClass } from '@/design-system/tokens/radius';
import { cn } from '@/utils/_cn';

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
