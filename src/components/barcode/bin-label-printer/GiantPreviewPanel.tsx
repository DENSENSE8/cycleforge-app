'use client';

import { Printer } from '@/components/Icons';
import { LocationDataMatrix } from '../LocationDataMatrix';
import {
  gs1LocationAi,
  locationCode,
  type LocationSegments,
} from '@/lib/barcode-routing';
import { humanReadable, partialCode } from './utils';
import { useAuth } from '@/contexts/AuthContext';
import { orgWarehouseLabel } from '@/lib/branding/letterhead';

interface GiantPreviewPanelProps {
  zoneLetter?: string;
  aisle?: number;
  bay?: number;
  level?: number;
  position?: number;
  gln: string;
}

/**
 * Desktop main-pane preview — confirmation scale, not a hero.
 */
export function GiantPreviewPanel({
  zoneLetter,
  aisle,
  bay,
  level,
  position,
  gln,
}: GiantPreviewPanelProps) {
  const { user } = useAuth();
  const segments: LocationSegments | null =
    zoneLetter && aisle != null && bay != null && level != null && position != null
      ? { zone: zoneLetter, aisle, bay, level, position }
      : null;
  const code = segments
    ? locationCode(segments)
    : partialCode({ zone: zoneLetter, aisle, bay, level, position });
  const ai = segments ? gs1LocationAi(segments, { gln }) : null;

  return (
    <div className="rounded-2xl border border-border-soft bg-surface-card p-4">
      <p className="text-role-micro font-semibold uppercase tracking-[0.16em] text-text-faint">
        Live preview · prints at 3″ × 2″
      </p>

      <div className="mt-3 flex items-start gap-4 rounded-xl border border-dashed border-border-soft bg-surface-canvas/60 p-4">
        <div className="min-w-0 flex-1">
          <p className="text-role-caption font-semibold uppercase tracking-[0.14em] text-text-soft">
            {orgWarehouseLabel(user?.organizationName || 'Workspace', 'Location')}
          </p>
          <p className="mt-1.5 whitespace-nowrap font-mono text-2xl font-semibold leading-none tracking-tight text-text-default">
            {code}
          </p>
          <p className="mt-1.5 text-role-caption font-medium leading-snug text-text-muted">
            {humanReadable({ zone: zoneLetter, aisle, bay, level, position })}
          </p>
        </div>
        <div className="flex h-[132px] w-[132px] shrink-0 items-center justify-center rounded-lg bg-surface-card p-2 ring-1 ring-border-soft">
          {ai ? (
            <LocationDataMatrix value={ai} size={116} fgColor="#0F172A" />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 text-center">
              <Printer className="h-5 w-5 text-text-faint" />
              <p className="px-2 text-role-caption font-medium text-text-faint">
                Completes when every step is picked
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
