'use client';

import { locationCode, rackCode, type LocationSegments } from '@/lib/barcode-routing';
import { LocationLabelFacePreview } from '@/components/labels/LocationLabelFacePreview';
import { Panel } from '@/design-system/primitives';

interface GiantPreviewPanelProps {
  zoneLetter?: string;
  aisle?: number;
  bay?: number;
  level?: number;
  position?: number;
  gln: string;
  roomName?: string | null;
}

/**
 * Desktop main-pane preview — print-faithful 2×1 iframe (same shell as Unbox).
 */
export function GiantPreviewPanel({
  zoneLetter,
  aisle,
  bay,
  level,
  position,
  gln,
  roomName,
}: GiantPreviewPanelProps) {
  const segments: LocationSegments | null =
    zoneLetter && aisle != null && bay != null && level != null
      ? { zone: zoneLetter, aisle, bay, level, position: position ?? 0 }
      : null;
  const code = segments
    ? segments.position === 0
      ? rackCode({ zone: segments.zone, aisle: segments.aisle, bay: segments.bay, level: segments.level })
      : locationCode(segments)
    : '';

  return (
    <Panel radius="2xl" padding="sm" className="stack-tight">
      <p className="text-role-micro font-semibold uppercase tracking-[0.16em] text-text-faint">
        Live preview · prints at 2″ × 1″
        {segments ? ` · ${code}` : ''}
      </p>
      <LocationLabelFacePreview
        segments={segments}
        roomName={roomName}
        gln={gln}
        fit="host"
      />
    </Panel>
  );
}
