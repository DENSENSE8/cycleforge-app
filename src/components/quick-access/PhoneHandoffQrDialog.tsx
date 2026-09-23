'use client';

/**
 * Desk → phone session handoff QR.
 *
 * Radix Dialog + Motion enter/exit matching shadcn Dialog:
 *   overlay fade · content fade + zoom 95% · 200ms
 * (see shadcn new-york dialog: fade-in-0 / zoom-in-95 / duration-200).
 *
 * Callers: StaffAccountFooter. API /api/auth/qr/handoff/begin.
 */

import { useCallback, useEffect, useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import QRCode from 'react-qr-code';
import { RefreshCw, X } from '@/components/Icons';
import { Panel } from '@/design-system/primitives';
import { Button } from '@/design-system/primitives/Button';
import {
  AnimatePresence,
  motion,
  useReducedMotion,
} from '@/design-system/motion';
import { COMPOSER_SHELL_CORNER, MOBILE_CONTROL_CORNER } from '@/design-system/tokens/radius';
import { elevationClass } from '@/design-system/tokens/shadows';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';

type HandoffState = 'loading' | 'active' | 'error';

/** shadcn Dialog duration-200 — keep in lockstep with their fade/zoom recipe. */
const SHADCN_DIALOG_MS = 0.2;

export function PhoneHandoffQrDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
}) {
  const prefersReducedMotion = useReducedMotion();
  const [state, setState] = useState<HandoffState>('loading');
  const [url, setUrl] = useState('');
  const [displayCode, setDisplayCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  const begin = useCallback(async () => {
    setState('loading');
    setUrl('');
    setDisplayCode('');
    setError(null);
    try {
      const res = await fetch('/api/auth/qr/handoff/begin', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ persistent: true }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error === 'UNAUTHENTICATED' ? 'Sign in on this desk first.' : 'Could not start handoff.');
      }
      const data = (await res.json()) as {
        url: string;
        displayCode: string;
        expiresAt: string;
      };
      setUrl(data.url);
      setDisplayCode(data.displayCode);
      setState('active');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start handoff.');
      setState('error');
    }
  }, []);

  useEffect(() => {
    if (open) void begin();
  }, [open, begin]);

  const overlayTransition = prefersReducedMotion
    ? { duration: 0 }
    : { duration: SHADCN_DIALOG_MS, ease: [0.16, 1, 0.3, 1] as const };
  const contentTransition = prefersReducedMotion
    ? { duration: 0 }
    : { duration: SHADCN_DIALOG_MS, ease: [0.16, 1, 0.3, 1] as const };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open ? (
          <DialogPrimitive.Portal forceMount key="phone-handoff-portal">
            <DialogPrimitive.Overlay asChild forceMount>
              <motion.div
                key="phone-handoff-overlay"
                className="fixed inset-0 z-modal bg-scrim/60"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={overlayTransition}
              />
            </DialogPrimitive.Overlay>

            <DialogPrimitive.Content asChild forceMount>
              <motion.div
                key="phone-handoff-content"
                className={cn(
                  'fixed left-1/2 top-1/2 z-modal grid w-[min(20rem,calc(100vw-2rem))] max-w-none',
                  'gap-5 border border-border-soft bg-surface-card p-6',
                  'items-center overflow-hidden text-center text-text-default',
                  COMPOSER_SHELL_CORNER,
                  elevationClass('overlay'),
                )}
                // Keep x/y at -50% while scaling — CSS -translate-* fights Motion's transform.
                initial={
                  prefersReducedMotion
                    ? { opacity: 0, x: '-50%', y: '-50%' }
                    : { opacity: 0, scale: 0.95, x: '-50%', y: '-50%' }
                }
                animate={{ opacity: 1, scale: 1, x: '-50%', y: '-50%' }}
                exit={
                  prefersReducedMotion
                    ? { opacity: 0, x: '-50%', y: '-50%' }
                    : { opacity: 0, scale: 0.95, x: '-50%', y: '-50%' }
                }
                transition={contentTransition}
              >
                <DialogPrimitive.Close
                  className={cn(
                    'absolute right-4 top-4 rounded-md p-1 text-text-muted opacity-70 transition-opacity hover:opacity-100',
                    focusRing('control'),
                  )}
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </DialogPrimitive.Close>

                <div className="flex flex-col items-center gap-1.5 pr-6">
                  <DialogPrimitive.Description className="text-role-micro uppercase tracking-widest text-text-soft">
                    Sign in on your phone
                  </DialogPrimitive.Description>
                  <DialogPrimitive.Title className="text-sm font-semibold leading-snug text-text-default">
                    Scan with your phone camera
                  </DialogPrimitive.Title>
                </div>

                <Panel radius="2xl" padding="sm" className="mx-auto shadow-inner shadow-gray-900/[0.03]">
                  {state === 'loading' && (
                    <div className="flex h-[220px] w-[220px] items-center justify-center animate-pulse rounded-lg bg-surface-sunken" />
                  )}
                  {state === 'active' && url ? (
                    <QRCode value={url} size={220} level="M" />
                  ) : null}
                  {state === 'error' && (
                    <div className="flex h-[220px] w-[220px] flex-col items-center justify-center gap-3 px-3 text-center">
                      <p className="text-role-caption text-text-danger">{error}</p>
                      <Button
                        variant="secondary"
                        size="sm"
                        icon={<RefreshCw className="h-3.5 w-3.5" />}
                        onClick={() => void begin()}
                      >
                        Retry
                      </Button>
                    </div>
                  )}
                </Panel>

                {displayCode ? (
                  <div className="flex flex-col items-center gap-2">
                    <p className="text-role-micro uppercase tracking-widest text-text-soft">
                      Or type this code on your phone
                    </p>
                    {/* One tile per digit — the desk reads exactly like the
                        phone's OneTimeCodeInput boxes. */}
                    <div className="flex justify-center gap-1.5" aria-label={`Pairing code ${displayCode}`}>
                      {displayCode.split('').map((char, index) => (
                        <span
                          key={index}
                          aria-hidden
                          className={cn(
                            'flex h-12 w-10 items-center justify-center border border-border-soft bg-surface-canvas',
                            'font-mono text-xl font-semibold text-text-default',
                            MOBILE_CONTROL_CORNER,
                          )}
                        >
                          {char}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}

                {state === 'active' ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full"
                    icon={<RefreshCw className="h-3.5 w-3.5" />}
                    onClick={() => void begin()}
                  >
                    Refresh code
                  </Button>
                ) : null}
              </motion.div>
            </DialogPrimitive.Content>
          </DialogPrimitive.Portal>
        ) : null}
      </AnimatePresence>
    </DialogPrimitive.Root>
  );
}
