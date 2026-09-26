'use client';

/** /kiosk/v2 client runtime — landscape consult shell. */

import dynamic from 'next/dynamic';
import { KioskCatalogFirstPaint } from '../KioskCatalogFirstPaint';
import { useDogfoodKioskBind } from '@/lib/kiosk/use-dogfood-kiosk-bind';
import type { KioskCatalogSeed } from '@/lib/kiosk/seed-catalog';
import { useEffect, type CSSProperties } from 'react';
import { ModeRegion } from '@/design-system/providers/ModeRegion';
import { kioskSessionStore } from '@/lib/kiosk/kiosk-session-store';
import { KIOSK_FALLBACK_COMMAND, type KioskCommandId } from '@/lib/kiosk/commands';
import { DEFAULT_LINE_REASONS, type KioskLineReasons } from '@/lib/kiosk/price-approval-kinds';

const KioskShell = dynamic(
  () => import('../KioskShell').then((m) => m.KioskShell),
  { loading: () => <KioskCatalogFirstPaint /> },
);

export function KioskV2Runtime({
  seed = null,
  defaultCommand = KIOSK_FALLBACK_COMMAND,
  lineReasons = DEFAULT_LINE_REASONS,
  brandColor = null,
}: {
  seed?: KioskCatalogSeed | null;
  /** The org's opening command, resolved server-side from `OrgSettings.kiosk.defaultCommand`. */
  defaultCommand?: KioskCommandId;
  /** The org's comp reason chips (`OrgSettings.kiosk`), delivered with the HTML likewise. */
  lineReasons?: KioskLineReasons;
  /** The org's brand colour (`OrgSettings.brand.primaryColor`) for the counter mode; null ⇒ registry default. */
  brandColor?: string | null;
}) {
  /* `applyDefaultCommand` is pristine-only (see the store), so re-running it is safe and an operator's own pick always wins. */
  useEffect(() => {
    kioskSessionStore.applyDefaultCommand(defaultCommand);
  }, [defaultCommand]);

  useEffect(() => {
    kioskSessionStore.applyLineReasons(lineReasons);
  }, [lineReasons]);

  const bound = useDogfoodKioskBind();
  /* The bind gate is why the SEED lands here and not in the picker: */
  if (!bound) return <KioskCatalogFirstPaint seed={seed} />;

  // The counter task mode wraps the whole shell (staff AND customer face); the
  // org's brand colour overrides the registry default on the region root,
  // where the `[data-mode='counter']` declaration would otherwise win.
  return (
    <ModeRegion
      mode="counter"
      className="relative h-full w-full overflow-hidden"
      style={brandColor ? ({ '--mode-brand': brandColor } as CSSProperties) : undefined}
    >
      <KioskShell />
    </ModeRegion>
  );
}
