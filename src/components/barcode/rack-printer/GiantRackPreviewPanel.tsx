import { Printer } from '@/components/Icons';
import { LocationDataMatrix } from '../LocationDataMatrix';
import { gs1LocationAi, rackCode, rackToLocation, type RackSegments } from '@/lib/barcode-routing';
import { humanReadable, partialCode } from './rack-code-format';
import { useAuth } from '@/contexts/AuthContext';
import { orgWarehouseLabel } from '@/lib/branding/letterhead';

interface GiantRackPreviewPanelProps {
  zoneLetter?: string;
  aisle?: number;
  bay?: number;
  level?: number;
  gln: string;
}

/**
 * Desktop main-pane rack preview — confirmation scale, not a hero.
 * Mirrors the bin printer preview (no position segment).
 */
export function GiantRackPreviewPanel({ zoneLetter, aisle, bay, level, gln }: GiantRackPreviewPanelProps) {
  const { user } = useAuth();
  const segments: RackSegments | null = zoneLetter && aisle != null && bay != null && level != null
    ? { zone: zoneLetter, aisle, bay, level }
    : null;
  const code = segments
    ? rackCode(segments)
    : partialCode({ zone: zoneLetter, aisle, bay, level });
  const ai = segments ? gs1LocationAi(rackToLocation(segments), { gln }) : null;

  return (
    <div className="rounded-2xl border border-border-soft bg-surface-card p-4">
      <p className="text-role-micro font-semibold uppercase tracking-[0.16em] text-text-faint">
        Live preview · prints at 3″ × 2″
      </p>

      <div className="mt-3 flex items-start gap-4 rounded-xl border border-dashed border-border-soft bg-surface-canvas/60 p-4">
        <div className="min-w-0 flex-1">
          <p className="text-role-caption font-semibold uppercase tracking-[0.14em] text-text-soft">
            {orgWarehouseLabel(user?.organizationName || 'Workspace', 'Rack')}
          </p>
          <p className="mt-1.5 whitespace-nowrap font-mono text-2xl font-semibold leading-none tracking-tight text-text-default">
            {code}
          </p>
          <p className="mt-1.5 text-role-caption font-medium leading-snug text-text-muted">
            {humanReadable({ zone: zoneLetter, aisle, bay, level })}
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
