'use client';

import { rackCode, rackToLocation, type RackSegments } from '@/lib/barcode-routing';
import { LocationLabelFacePreview } from '@/components/labels/LocationLabelFacePreview';
import { Panel } from '@/design-system/primitives';

interface GiantRackPreviewPanelProps {
  zoneLetter?: string;
  aisle?: number;
  bay?: number;
  level?: number;
  gln: string;
  roomName?: string | null;
}

/**
 * Desktop main-pane rack preview — print-faithful 2×1 iframe (same shell as Unbox).
 */
export function GiantRackPreviewPanel({
  zoneLetter,
  aisle,
  bay,
  level,
  gln,
  roomName,
}: GiantRackPreviewPanelProps) {
  const rack: RackSegments | null =
    zoneLetter && aisle != null && bay != null && level != null
      ? { zone: zoneLetter, aisle, bay, level }
      : null;
  const segments = rack ? rackToLocation(rack) : null;

  return (
    <Panel radius="2xl" padding="sm" className="stack-tight">
      <p className="text-role-micro font-semibold text-text-faint">
        Live preview · prints at 2″ × 1″
        {rack ? ` · ${rackCode(rack)}` : ''}
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
