'use client';

/**
 * The tablet's "Scan with phone" control on Device & quote: a key that opens
 * the phone link, then the QR a signed-in staff phone scans to join this visit
 * and scan serials into it (`/m/repair-scan`).
 *
 * Inline, never a modal: the device cards stay in view under it, so the
 * staffer watches each scanned serial land in its field.
 *
 * Callers: `KioskRepairPane`. Affected API: none (the hook owns the fetches).
 * User: "a QR code that you would be able to scan on your phone to join the
 *   same repair service session".
 */

import dynamic from 'next/dynamic';
import { useState } from 'react';
import { QrCode } from '@/components/Icons';
import { Button } from '@/design-system/primitives';
import { MOBILE_SCAN_ROW_CORNER } from '@/design-system/tokens/radius';
import { KIOSK_META } from '@/app/kiosk/kiosk-chrome';
import { cn } from '@/utils/_cn';
import type { KioskCompanionLink } from './useKioskCompanionLink';

const QRCode = dynamic(() => import('react-qr-code'), {
  ssr: false,
  loading: () => <div className="h-[132px] w-[132px] animate-pulse bg-surface-sunken" />,
});

export function KioskCompanionPanel({
  link,
  opening,
  onOpen,
}: {
  link: KioskCompanionLink | null;
  opening: boolean;
  onOpen: () => void;
}) {
  const [shown, setShown] = useState(true);

  if (!link) {
    return (
      <Button
        variant="secondary"
        size="lg"
        className="w-full"
        icon={<QrCode className="h-4 w-4" />}
        disabled={opening}
        onClick={onOpen}
        data-testid="kiosk-companion-open"
      >
        {opening ? 'Opening…' : 'Scan serials with phone'}
      </Button>
    );
  }

  return (
    <div
      className={cn(
        'flex items-center gap-4 border border-border-hairline bg-surface-card px-4 py-3',
        MOBILE_SCAN_ROW_CORNER,
      )}
      data-testid="kiosk-companion-panel"
      data-companion-url={link.url}
    >
      {shown ? (
        <div className="shrink-0 bg-white p-1.5" aria-hidden>
          <QRCode value={link.url} size={132} level="M" />
        </div>
      ) : null}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-text-default">Phone link on</p>
        <p className={KIOSK_META}>
          {shown
            ? 'Scan with a signed-in phone, then scan each serial.'
            : 'Scanned serials land in the fields below.'}
        </p>
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setShown((s) => !s)}
        data-testid="kiosk-companion-toggle"
      >
        {shown ? 'Hide QR' : 'Show QR'}
      </Button>
    </div>
  );
}
