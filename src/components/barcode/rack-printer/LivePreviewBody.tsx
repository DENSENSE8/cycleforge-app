'use client';

import { rackToLocation, type RackSegments } from '@/lib/barcode-routing';
import { LocationLabelFacePreview } from '@/components/labels/LocationLabelFacePreview';

interface LivePreviewBodyProps {
  zoneLetter?: string;
  roomName?: string;
  aisle?: number;
  bay?: number;
  level?: number;
  gln: string;
}

/** Compact live preview (mobile): print-faithful 2×1 iframe. */
export function LivePreviewBody({
  zoneLetter,
  roomName,
  aisle,
  bay,
  level,
  gln,
}: LivePreviewBodyProps) {
  const all = zoneLetter && aisle != null && bay != null && level != null;
  const rack: RackSegments | null = all
    ? { zone: zoneLetter!, aisle: aisle!, bay: bay!, level: level! }
    : null;

  return (
    <LocationLabelFacePreview
      segments={rack ? rackToLocation(rack) : null}
      roomName={roomName}
      gln={gln}
      fit="capped"
    />
  );
}
