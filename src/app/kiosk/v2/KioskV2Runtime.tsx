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

const KioskShell = dynamic(
  () => import('../KioskShell').then((m) => m.KioskShell),
  { loading: () => <KioskCatalogFirstPaint /> },
);

export function KioskV2Runtime() {
  const bound = useDogfoodKioskBind();
  if (!bound) return <KioskCatalogFirstPaint />;

  return (
    <div className="relative h-full w-full overflow-hidden">
      <KioskShell />
    </div>
  );
}
