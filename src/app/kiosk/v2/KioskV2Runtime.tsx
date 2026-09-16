'use client';

/**
 * /kiosk/v2 client runtime — landscape consult shell.
 *
 * Callers: `src/app/kiosk/v2/page.tsx`, `/m/consult`.
 * Affected API: POST `/api/kiosk/dev-autopair` before the shell fetches catalog.
 * Data schemas: none.
 * User: "Whenever you open a kiosk or a tablet page, I must see it automatically
 * connected to organization one for dog food testing".
 */

import dynamic from 'next/dynamic';
import { KioskCatalogFirstPaint } from '../KioskCatalogFirstPaint';
import { useDogfoodKioskBind } from '@/lib/kiosk/use-dogfood-kiosk-bind';
import type { KioskCatalogSeed } from '@/lib/kiosk/seed-catalog';
import { useEffect } from 'react';
import { kioskSessionStore } from '@/lib/kiosk/kiosk-session-store';
import { KIOSK_FALLBACK_COMMAND, type KioskCommandId } from '@/lib/kiosk/commands';

const KioskShell = dynamic(
  () => import('../KioskShell').then((m) => m.KioskShell),
  { loading: () => <KioskCatalogFirstPaint /> },
);

export function KioskV2Runtime({
  seed = null,
  defaultCommand = KIOSK_FALLBACK_COMMAND,
}: {
  seed?: KioskCatalogSeed | null;
  /**
   * The org's opening command, resolved server-side from
   * `OrgSettings.kiosk.defaultCommand`. Applied here rather than in
   * `KioskShell` because the shell is behind the bind gate below: by the time
   * it mounts the store must already hold the right command, or the first
   * frame is the wrong pane.
   */
  defaultCommand?: KioskCommandId;
}) {
  /*
   * `applyDefaultCommand` is pristine-only (see the store), so re-running it is
   * safe and an operator's own pick always wins. It runs in an effect rather
   * than at module scope because the store is a client singleton shared with
   * the customer face.
   */
  useEffect(() => {
    kioskSessionStore.applyDefaultCommand(defaultCommand);
  }, [defaultCommand]);

  const bound = useDogfoodKioskBind();
  /*
   * The bind gate is why the SEED lands here and not in the picker: until the
   * device is bound this component renders the skeleton, which means the
   * skeleton IS the server HTML. Putting the first screen's image URLs in it is
   * what makes them discoverable at parse time (lcp-discovery), and the live
   * grid then paints the same `src` values.
   */
  if (!bound) return <KioskCatalogFirstPaint seed={seed} />;

  return (
    <div className="relative h-full w-full overflow-hidden">
      <KioskShell />
    </div>
  );
}
