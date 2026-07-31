'use client';

import { Monitor } from '@/components/Icons';
import { IconButton, type IconButtonSize } from '@/design-system/primitives';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { cn } from '@/utils/_cn';
import { useAuth } from '@/contexts/AuthContext';
import { HEADER_ICON_BTN_CLASS, TOP_CHROME_ICON_GLYPH } from '@/components/layout/header-shell';
import { openKioskShellPreview } from '@/lib/kiosk/preview-url';

/**
 * Desktop testing entry — opens the landscape `/kiosk/v2` shell in a new tab
 * so staff can preview attract / left rail / bottom dock without an enrolled iPad.
 */
export function KioskPreviewButton({
  className,
  iconClassName = TOP_CHROME_ICON_GLYPH,
  size,
}: {
  className?: string;
  iconClassName?: string;
  size?: IconButtonSize;
}) {
  const { user } = useAuth();

  return (
    <HoverTooltip label="Open kiosk shell (preview)" asChild>
      <IconButton
        type="button"
        size={size}
        onClick={() => openKioskShellPreview(user?.organizationSlug)}
        ariaLabel="Open kiosk shell preview"
        className={cn(HEADER_ICON_BTN_CLASS, className)}
        icon={<Monitor className={iconClassName} />}
      />
    </HoverTooltip>
  );
}
