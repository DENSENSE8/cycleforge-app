'use client';

/**
 * Desktop companion QR for phone scan → authorize this computer.
 * Never mount on `/m/signin` — a phone cannot scan a QR on itself
 * (WhatsApp Web / Discord / QRAuth mobile pattern).
 *
 * Callers: `/signin` AuthCard qrPanel only when NOT mobileSignInFace.
 */

import { useEffect, useState, useRef, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { Smartphone, RefreshCw, CheckCircle2 } from 'lucide-react';
import { Button } from '@/design-system/primitives/Button';
import { cn } from '@/utils/_cn';

const QRCode = dynamic(() => import('react-qr-code'), {
  ssr: false,
  loading: () => <div className="h-[180px] w-[180px] animate-pulse rounded-2xl bg-surface-sunken" />,
});

export interface QrAuthSuccessData {
  staffId?: number | null;
  staffName?: string | null;
  role?: string | null;
  defaultHomePath?: string | null;
  defaultHomePathMobile?: string | null;
}

interface SignInQrPanelProps {
  rememberMe?: boolean;
  onSuccess?: (data: QrAuthSuccessData) => void;
  className?: string;
}

type QrPanelState = 'loading' | 'active' | 'expired' | 'completed' | 'error';

export function SignInQrPanel({ onSuccess, className }: SignInQrPanelProps) {
  const [state, setState] = useState<QrPanelState>('loading');
  const [url, setUrl] = useState<string>('');
  const [staffName, setStaffName] = useState<string | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const mountedRef = useRef(true);
  const onSuccessRef = useRef(onSuccess);
  onSuccessRef.current = onSuccess;
  const clearPolling = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const begin = useCallback(async () => {
    clearPolling();
    setState('loading');
    setUrl('');

    try {
      const res = await fetch('/api/auth/qr/begin', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ persistent: true }),
      });
      if (!res.ok) throw new Error('Could not initialize QR code session.');
      const data = await res.json() as {
        token: string;
        url: string;
        expiresAt: string;
        ably?: { token: string; channel: string } | null;
      };

      if (!mountedRef.current) return;
      setUrl(data.url);
      setState('active');

      const complete = (payload: QrAuthSuccessData) => {
        clearPolling();
        setState('completed');
        setStaffName(payload.staffName || null);
        setTimeout(() => {
          if (onSuccessRef.current) onSuccessRef.current(payload);
        }, 500);
      };
      const expire = () => {
        clearPolling();
        setState('expired');
      };

      const poll = async () => {
        if (!mountedRef.current || !data.token) return;
        try {
          const statusRes = await fetch(`/api/auth/qr/status?token=${encodeURIComponent(data.token)}`, {
            credentials: 'include',
            cache: 'no-store',
          });
          if (!statusRes.ok) return;
          const statusData = (await statusRes.json()) as QrAuthSuccessData & { status: string };
          if (statusData.status === 'completed') complete(statusData);
          else if (
            statusData.status === 'expired' ||
            statusData.status === 'consumed' ||
            statusData.status === 'already_consumed'
          ) {
            expire();
          }
        } catch {
          // ignore transient poll error
        }
      };
      timerRef.current = setInterval(() => void poll(), 1500);

      if (data.ably?.token && data.ably.channel) {
        void import('ably').then(({ Realtime }) => {
          if (!mountedRef.current) return;
          const client = new Realtime({ token: data.ably!.token, autoConnect: true });
          const channel = client.channels.get(data.ably!.channel);
          channel.subscribe((msg) => {
            if (msg.name === 'session.authorized') {
              client.close();
              void poll();
            }
          });
          const tighten = () => {
            if (timerRef.current) clearInterval(timerRef.current);
            timerRef.current = setInterval(() => void poll(), 10_000);
          };
          channel.once('attached', tighten);
          client.connection.on('failed', () => client.close());
        }).catch(() => {
          /* polling stays primary */
        });
      }
    } catch {
      if (mountedRef.current) setState('error');
    }
  }, [clearPolling]);

  useEffect(() => {
    mountedRef.current = true;
    void begin();
    return () => {
      mountedRef.current = false;
      clearPolling();
    };
  }, [begin, clearPolling]);

  return (
    <div className={cn('flex flex-col items-center justify-center my-auto text-center space-y-3 p-1', className)}>
      <div className="space-y-1">
        <h2 className="text-role-title text-text-default text-base font-semibold">Log in with QR Code</h2>
      </div>

      <div className="relative flex items-center justify-center">
        {state === 'loading' && (
          <div className="flex h-[156px] w-[156px] flex-col items-center justify-center space-y-1 rounded-lg bg-surface-sunken animate-pulse">
            <Smartphone className="h-6 w-6 text-text-faint animate-bounce" />
            <span className="text-role-caption text-text-soft">Loading code...</span>
          </div>
        )}

        {state === 'active' && url && <QRCode value={url} size={156} level="M" />}

        {state === 'expired' && (
          <>
            <div className="h-[156px] w-[156px] rounded-lg bg-surface-sunken" aria-hidden />
            <div className="absolute inset-0 flex flex-col items-center justify-center rounded-lg bg-surface-card/95 p-4 text-center backdrop-blur-sm">
              <p className="mb-2 text-sm font-medium text-text-default">QR Code Expired</p>
              <Button
                variant="brand"
                size="sm"
                icon={<RefreshCw className="h-3.5 w-3.5" />}
                onClick={() => void begin()}
              >
                Refresh
              </Button>
            </div>
          </>
        )}

        {state === 'completed' && (
          <>
            <div className="h-[156px] w-[156px] rounded-lg bg-surface-sunken" aria-hidden />
            <div className="absolute inset-0 flex flex-col items-center justify-center rounded-lg bg-surface-card/95 p-4 text-center">
              <CheckCircle2 className="h-12 w-12 animate-in zoom-in-75 text-text-success duration-300" />
              <p className="mt-2 text-sm font-semibold text-text-default">Authorized!</p>
              <p className="max-w-[170px] truncate text-xs text-text-soft">
                {staffName ? `Logging in as ${staffName}` : 'Logging you in...'}
              </p>
            </div>
          </>
        )}

        {state === 'error' && (
          <>
            <div className="h-[156px] w-[156px] rounded-lg bg-surface-sunken" aria-hidden />
            <div className="absolute inset-0 flex flex-col items-center justify-center rounded-lg bg-surface-card p-4 text-center">
              <p className="mb-2 text-xs text-text-danger">Could not generate QR</p>
              <Button variant="secondary" size="sm" onClick={() => void begin()}>
                Retry
              </Button>
            </div>
          </>
        )}
      </div>

      <div className="flex items-center justify-center gap-2 text-role-caption text-text-soft">
        <span className="relative flex h-2 w-2">
          <span
            className={cn(
              'absolute inline-flex h-full w-full rounded-full opacity-75',
              state === 'active' ? 'animate-ping bg-status-success' : 'bg-text-faint',
            )}
          />
          <span
            className={cn(
              'relative inline-flex h-2 w-2 rounded-full',
              state === 'active' ? 'bg-status-success' : 'bg-text-faint',
            )}
          />
        </span>
        <span>Scan with your phone — authorize this computer</span>
      </div>
    </div>
  );
}
