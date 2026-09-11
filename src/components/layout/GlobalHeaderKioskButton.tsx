'use client';

/**
 * GlobalHeader far-right action — open landscape kiosk shell preview.
 *
 * Callers: `GlobalHeader` far-right (`data-header-zone="kiosk"`). Prefer
 * top-right over bottom-left: FOH already glances at the beam. Reuses
 * `openKioskShellPreview` (same as Settings Workstation / quick-access).
 * Affected API: none. Schemas: none.
 * User: "there must be a way to access the kisok from the bottom left side or
 * the top right of the global header which ever would be best" / "execute now"
 */

import { Monitor } from '@/components/Icons';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { IconButton } from '@/design-system/primitives';
import { useAuth } from '@/contexts/AuthContext';
import { openKioskShellPreview } from '@/lib/kiosk/preview-url';
import {
  HEADER_ICON_BTN_CLASS,
  HEADER_ICON_WRAP,
  TOP_CHROME_ICON_FACE,
} from '@/components/layout/header-shell';

export function GlobalHeaderKioskButton() {
  const { user } = useAuth();

  return (
    <div className={HEADER_ICON_WRAP} data-testid="global-header-kiosk-wrap">
      <HoverTooltip label="Kiosk" asChild>
        <IconButton
          icon={<Monitor className={TOP_CHROME_ICON_FACE} aria-hidden />}
          ariaLabel="Open kiosk"
          size="md"
          className={HEADER_ICON_BTN_CLASS}
          data-testid="global-header-kiosk"
          onClick={() => openKioskShellPreview(user?.organizationSlug)}
        />
      </HoverTooltip>
    </div>
  );
}
