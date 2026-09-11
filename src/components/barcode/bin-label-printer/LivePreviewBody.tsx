'use client';

import { type LocationSegments } from '@/lib/barcode-routing';
import { LocationLabelFacePreview } from '@/components/labels/LocationLabelFacePreview';

interface LivePreviewBodyProps {
  zoneLetter?: string;
  roomName?: string;
  aisle?: number;
  bay?: number;
  level?: number;
  position?: number;
  gln: string;
}

/** Compact live preview (mobile): print-faithful 2×1 iframe. */
export function LivePreviewBody({
  zoneLetter,
  roomName,
  aisle,
  bay,
  level,
  position,
  gln,
}: LivePreviewBodyProps) {
  const all = zoneLetter && aisle != null && bay != null && level != null;
  const segments: LocationSegments | null = all
    ? { zone: zoneLetter!, aisle: aisle!, bay: bay!, level: level!, position: position ?? 0 }
    : null;

  return (
    <LocationLabelFacePreview
      segments={segments}
      roomName={roomName}
      gln={gln}
      fit="capped"
    />
  );
}
