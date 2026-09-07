'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { Smartphone, RefreshCw, CheckCircle2 } from 'lucide-react';
import { Button } from '@/design-system/primitives/Button';
import { cn } from '@/utils/_cn';

const QRCode = dynamic(() => import('react-qr-code'), {
  ssr: false,
  loading: () => <div className="h-[180px] w-[180px] animate-pulse rounded-2xl bg-surface-sunken" />,
});

interface SignInQrPanelProps {
  onSuccess?: (staffName?: string) => void;
  className?: string;
}

type QrPanelState = 'loading' | 'active' | 'expired' | 'completed' | 'error';

export function SignInQrPanel({ onSuccess, className }: SignInQrPanelProps) {
  const [state, setState] = useState<QrPanelState>('loading');
  const [url, setUrl] = useState<string>('');
  const [staffName, setStaffName] = useState<string | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const mountedRef = useRef(true);

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
        headers: { 'Content-Type': 'application/json' },
        // Sessions are always persistent — switching staff is one tap, so a
        // standing session never needs a "keep me signed in" opt-out.
        body: JSON.stringify({ persistent: true }),
      });
      if (!res.ok) throw new Error('Could not initialize QR code session.');
      const data = await res.json() as { token: string; url: string; expiresAt: string };

      if (!mountedRef.current) return;
      setUrl(data.url);
      setState('active');

      // Start polling status every 1500ms
      const poll = async () => {
        if (!mountedRef.current || !data.token) return;
        try {
          const statusRes = await fetch(`/api/auth/qr/status?token=${encodeURIComponent(data.token)}`);
          if (!statusRes.ok) return;
          const statusData = await statusRes.json() as { status: string; staffName?: string };

          if (statusData.status === 'completed') {
            clearPolling();
            setState('completed');
            setStaffName(statusData.staffName || null);
            setTimeout(() => {
              if (onSuccess) onSuccess(statusData.staffName);
            }, 800);
          } else if (statusData.status === 'expired') {
            clearPolling();
            setState('expired');
          }
        } catch {
          // ignore transient poll error
        }
      };

      timerRef.current = setInterval(() => void poll(), 1500);
    } catch {
      if (mountedRef.current) setState('error');
    }
  }, [clearPolling, onSuccess]);

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

      {/* Compact QR Tile with matching rounded-2xl corner radius */}
      <div className="relative flex h-[156px] w-[156px] items-center justify-center rounded-2xl border border-border-soft bg-surface-card p-2 shadow-sm transition-all">
        {state === 'loading' && (
          <div className="flex h-full w-full flex-col items-center justify-center space-y-1 rounded-xl bg-surface-sunken animate-pulse">
            <Smartphone className="h-6 w-6 text-text-faint animate-bounce" />
            <span className="text-role-micro text-text-soft">Loading code...</span>
          </div>
        )}

        {state === 'active' && url && (
          <div className="rounded-xl overflow-hidden bg-white p-1">
            <QRCode value={url} size={136} level="M" />
          </div>
        )}
        {state === 'expired' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center rounded-2xl bg-surface-card/95 p-4 backdrop-blur-sm">
            <p className="text-sm font-medium text-text-default mb-2">QR Code Expired</p>
            <Button
              variant="brand"
              size="sm"
              icon={<RefreshCw className="h-3.5 w-3.5" />}
              onClick={() => void begin()}
            >
              Refresh
            </Button>
          </div>
        )}

        {state === 'completed' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center rounded-2xl bg-surface-card/95 p-4 text-center">
            <CheckCircle2 className="h-12 w-12 text-status-success animate-in zoom-in-75 duration-300" />
            <p className="text-sm font-semibold text-text-default mt-2">Authorized!</p>
            <p className="text-xs text-text-soft truncate max-w-[170px]">
              {staffName ? `Logging in as ${staffName}` : 'Logging you in...'}
            </p>
          </div>
        )}

        {state === 'error' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center rounded-2xl bg-surface-card p-4">
            <p className="text-xs text-status-danger mb-2">Could not generate QR</p>
            <Button variant="secondary" size="sm" onClick={() => void begin()}>
              Retry
            </Button>
          </div>
        )}
      </div>

      {/* The one microcopy line — the live dot carries the state. */}
      <div className="flex items-center gap-2 text-role-micro text-text-soft">
        <span className="relative flex h-2 w-2">
          <span className={cn(
            'absolute inline-flex h-full w-full rounded-full opacity-75',
            state === 'active' ? 'bg-status-success animate-ping' : 'bg-text-faint'
          )} />
          <span className={cn(
            'relative inline-flex h-2 w-2 rounded-full',
            state === 'active' ? 'bg-status-success' : 'bg-text-faint'
          )} />
        </span>
        <span>Scan with your phone</span>
      </div>
    </div>
  );
}
