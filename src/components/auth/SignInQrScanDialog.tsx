'use client';

/**
 * Mobile sign-in — type the desk pairing code (primary); optional collapsed QR camera.
 * GateGuard: /signin + /m/signin. User: no paste-link copy; camera collapses to code entry.
 * The code is digits only so the phone raises a number pad (no keyboard hopping).
 */

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { QrCode } from '@/components/Icons';
import { ScanSurface } from '@/components/mobile/ScanSurface';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/design-system/components/Dialog';
import { Button } from '@/design-system/primitives/Button';
import { OneTimeCodeInput } from '@/design-system/primitives/OneTimeCodeInput';
import { COMPOSER_SHELL_CORNER } from '@/design-system/tokens/radius';
import { useBarcodeScanner } from '@/hooks/useBarcodeScanner';
import {
  formatHandoffCodeInput,
  HANDOFF_SHORT_CODE_LENGTH,
  parseHandoffDisplayCode,
} from '@/lib/auth/qr-handoff-code';
import { cn } from '@/utils/_cn';

/**
 * Map a scanned / typed payload to an in-app path, or null if it is not ours.
 * Bare 6-digit code (and legacy CF-prefixed paste) → `/m/claim?code=NNNNNN`.
 */
export function resolveSignInQrPayload(raw: string, origin: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const handoffCode = parseHandoffDisplayCode(trimmed);
  if (handoffCode) {
    return `/m/claim?code=${encodeURIComponent(handoffCode)}`;
  }

  const looksLikeUrl =
    /^https?:\/\//i.test(trimmed) ||
    trimmed.startsWith('/') ||
    trimmed.startsWith('m/qr-auth') ||
    trimmed.startsWith('m/claim');

  if (looksLikeUrl) {
    try {
      const url = new URL(trimmed.startsWith('m/') ? `/${trimmed}` : trimmed, origin);
      if (url.origin !== origin) return null;
      if (
        url.pathname === '/m/qr-auth' ||
        url.pathname === '/qr-auth' ||
        url.pathname === '/m/claim'
      ) {
        return `${url.pathname}${url.search}${url.hash}`;
      }
      return null;
    } catch {
      return null;
    }
  }

  // Long bare token (QR payload without URL) → phone→desk authorize path.
  if (/^[A-Za-z0-9_-]{16,}$/.test(trimmed)) {
    return `/m/qr-auth?token=${encodeURIComponent(trimmed)}`;
  }
  return null;
}

export function SignInQrScanDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
}) {
  const scanner = useBarcodeScanner({ dedupMs: 1800 });
  const [scanError, setScanError] = useState<string | null>(null);
  const [pairingInput, setPairingInput] = useState('');
  const [submittingCode, setSubmittingCode] = useState(false);
  /** Camera stays collapsed until the operator asks for it. */
  const [cameraOpen, setCameraOpen] = useState(false);

  useEffect(() => {
    if (!open) {
      void scanner.stopScanning();
      return;
    }
    setScanError(null);
    setPairingInput('');
    setSubmittingCode(false);
    setCameraOpen(false);
    scanner.resetLastScan();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- open resets the sheet
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (cameraOpen) {
      void scanner.startScanning();
    } else {
      void scanner.stopScanning();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- camera toggle owns lifecycle
  }, [open, cameraOpen]);

  const go = useCallback(
    (next: string) => {
      onOpenChange(false);
      window.location.assign(next);
    },
    [onOpenChange],
  );

  const handleDecode = useCallback(
    (value: string) => {
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      const next = resolveSignInQrPayload(value, origin);
      if (!next) {
        setScanError('That isn’t a desk sign-in QR. Point at the code on your computer.');
        scanner.resetLastScan();
        return;
      }
      go(next);
    },
    [go, scanner],
  );

  const submitCode = useCallback(
    (raw: string) => {
      const shortCode = parseHandoffDisplayCode(raw);
      if (!shortCode) {
        setScanError(`Enter the ${HANDOFF_SHORT_CODE_LENGTH} digits shown on your computer.`);
        return;
      }
      setSubmittingCode(true);
      setScanError(null);
      go(`/m/claim?code=${encodeURIComponent(shortCode)}`);
    },
    [go],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          'w-[min(22rem,calc(100vw-1.5rem))] max-w-none gap-3 overflow-hidden p-4',
          COMPOSER_SHELL_CORNER,
        )}
      >
        <DialogHeader className="space-y-1 pr-8">
          <DialogDescription className="text-role-micro uppercase tracking-widest text-text-soft">
            Desk pairing
          </DialogDescription>
          <DialogTitle className="text-sm font-semibold text-text-default">
            Enter the code from your computer
          </DialogTitle>
        </DialogHeader>

        <form
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            submitCode(pairingInput);
          }}
          className="space-y-2.5"
        >
          <OneTimeCodeInput
            value={pairingInput}
            onChange={(next) => {
              setPairingInput(next);
              setScanError(null);
            }}
            // OTP behaviour: the last digit IS the submit.
            onComplete={submitCode}
            length={HANDOFF_SHORT_CODE_LENGTH}
            inputMode="numeric"
            label="Pairing code from your computer"
            transform={formatHandoffCodeInput}
            invalid={Boolean(scanError)}
            disabled={submittingCode}
            autoFocus
          />
          <Button
            type="submit"
            variant="brand"
            size="sm"
            className="w-full"
            disabled={pairingInput.length < HANDOFF_SHORT_CODE_LENGTH || submittingCode}
          >
            {submittingCode ? 'Signing in…' : 'Sign in with code'}
          </Button>
        </form>

        {cameraOpen ? (
          <div className="space-y-2">
            <div className={cn('overflow-hidden border border-border-soft', COMPOSER_SHELL_CORNER)}>
              <ScanSurface
                scanner={scanner}
                onDecode={handleDecode}
                showManualEntry={false}
                aspectRatio="1 / 1"
              />
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full"
              onClick={() => setCameraOpen(false)}
            >
              Hide camera
            </Button>
          </div>
        ) : (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="w-full"
            icon={<QrCode className="h-4 w-4" />}
            onClick={() => {
              setScanError(null);
              setCameraOpen(true);
            }}
          >
            Scan QR instead
          </Button>
        )}

        {scanError ? (
          <p className="text-center text-role-caption text-text-danger">{scanError}</p>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

/** Full-width chooser CTA — opens {@link SignInQrScanDialog}. */
export function SignInWithQrCodeButton({
  disabled,
  onClick,
}: {
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant="secondary"
      size="lg"
      className="w-full"
      disabled={disabled}
      icon={<QrCode className="h-4 w-4" />}
      onClick={onClick}
    >
      Sign in with pairing code
    </Button>
  );
}

/**
 * Mobile choose-face entry: button + rounded scan dialog. Dynamic-import this
 * from `/signin` so ZXing stays off the signed-out critical graph until tapped.
 */
export function MobileSignInQrChooser({ disabled }: { disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <SignInWithQrCodeButton disabled={disabled} onClick={() => setOpen(true)} />
      <SignInQrScanDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
