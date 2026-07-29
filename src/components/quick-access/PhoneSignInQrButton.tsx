'use client';

import { useEffect, useState } from 'react';
import QRCode from 'react-qr-code';
import { Smartphone } from '@/components/Icons';
import { IconButton, type IconButtonSize } from '@/design-system/primitives';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/design-system/components/Dialog';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { cn } from '@/utils/_cn';
import { HEADER_ICON_BTN_CLASS, TOP_CHROME_ICON_GLYPH } from '@/components/layout/header-shell';

/**
 * Header phone icon + centered scan overlay. Encodes the mobile sign-in URL
 * (`<origin>/m/signin`) so staff can point their phone camera at it and open
 * the site on their phone without typing anything.
 */
export function PhoneSignInQrButton({
  className,
  iconClassName = TOP_CHROME_ICON_GLYPH,
  size,
}: {
  className?: string;
  iconClassName?: string;
  size?: IconButtonSize;
}) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState('');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setUrl(`${window.location.origin}/m/signin`);
    }
  }, []);

  return (
    <>
      <HoverTooltip label="Scan to open on your phone" asChild>
        <IconButton
          type="button"
          size={size}
          onClick={() => setOpen(true)}
          ariaLabel="Show sign-in QR code"
          className={cn(HEADER_ICON_BTN_CLASS, className)}
          icon={<Smartphone className={iconClassName} />}
        />
      </HoverTooltip>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="w-[min(20rem,calc(100vw-2rem))] max-w-none items-center text-center">
          <DialogHeader className="items-center space-y-1 text-center">
            <DialogDescription className="text-role-micro uppercase tracking-widest text-text-soft">
              Scan to open on your phone
            </DialogDescription>
            <DialogTitle className="text-sm font-semibold text-text-default">
              Point your camera at the code
            </DialogTitle>
          </DialogHeader>
          <div className="mx-auto rounded-2xl border border-border-soft bg-surface-card p-3 shadow-inner shadow-gray-900/[0.03]">
            {url ? (
              <QRCode value={url} size={220} level="M" />
            ) : (
              <div className="h-[220px] w-[220px] animate-pulse rounded-lg bg-surface-sunken" />
            )}
          </div>
          <p className="w-full break-all rounded-lg bg-surface-canvas px-3 py-2 text-center text-role-micro font-mono text-text-soft">
            {url || ' '}
          </p>
        </DialogContent>
      </Dialog>
    </>
  );
}
