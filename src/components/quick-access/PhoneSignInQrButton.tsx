'use client';

import { useEffect, useState } from 'react';
import QRCode from 'react-qr-code';
import { Smartphone } from '@/components/Icons';
import { Panel, IconButton, type IconButtonSize } from '@/design-system/primitives';
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
import { COMPOSER_SHELL_CORNER } from '@/design-system/tokens/radius';

/**
 * The scan overlay on its own, controlled — encodes the mobile sign-in URL
 * (`<origin>/m/signin`) so staff can point a phone camera at it and open the
 * site without typing anything.
 *
 * This is a **deep link**, not a pairing / device-code session. It does not
 * mint a token and does not sign the phone in. Real desk↔phone pairing lives
 * on `/signin` ({@link SignInQrPanel} → `/m/qr-auth?token=…`).
 *
 * Split out from {@link PhoneSignInQrButton} 2026-08-01 so every surface that
 * offers this action shares ONE dialog: Settings → Workstation and the desk
 * spine account ⋯. Re-typing the QR markup at a second call site would have
 * been the page-local fork the house rules ban.
 */
export function PhoneSignInQrDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
}) {
  const [url, setUrl] = useState('');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setUrl(`${window.location.origin}/m/signin`);
    }
  }, []);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          'w-[min(20rem,calc(100vw-2rem))] max-w-none items-center overflow-hidden text-center',
          COMPOSER_SHELL_CORNER,
        )}
      >
        <DialogHeader className="items-center space-y-1 text-center">
          <DialogDescription className="text-role-micro uppercase tracking-widest text-text-soft">
            Scan to open on your phone
          </DialogDescription>
          <DialogTitle className="text-sm font-semibold text-text-default">
            Point your camera at the code
          </DialogTitle>
        </DialogHeader>
        <Panel radius="2xl" padding="sm" className="mx-auto shadow-inner shadow-gray-900/[0.03]">
          {url ? (
            <QRCode value={url} size={220} level="M" />
          ) : (
            <div className="h-[220px] w-[220px] animate-pulse rounded-lg bg-surface-sunken" />
          )}
        </Panel>
        <p className="w-full break-all rounded-lg bg-surface-canvas px-3 py-2 text-center text-role-micro font-mono text-text-soft">
          {url || ' '}
        </p>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Header phone icon + the scan overlay above.
 *
 * **Mobile chrome only** since the 2026-08-01 altitude pass — the desktop
 * top-right cluster is down to find · add · goal · inbox · assistant, and this
 * action lives on Settings → Workstation (this device). Mobile keeps the icon
 * because it has no Settings workstation surface in the scan-first shell.
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

      <PhoneSignInQrDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
