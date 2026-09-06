'use client';

/**
 * SuperGrok device-code interstitial. Connect starts RFC 8628, then redirects
 * here with the user-facing code. The device_code itself stays in an httpOnly
 * cookie and is polled server-side.
 */
import { useEffect, useRef, useState } from 'react';
import { toast } from '@/lib/toast';
import { Button } from '@/design-system/primitives/Button';
import { Panel } from '@/design-system/primitives/Panel';
import { ExternalLink } from '@/components/Icons';

export function GrokDeviceConnect({
  userCode,
  verificationUri,
}: {
  userCode: string;
  verificationUri: string;
}) {
  const [status, setStatus] = useState<'waiting' | 'connected' | 'error'>('waiting');
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<number>(5);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const poll = async () => {
      try {
        const res = await fetch('/api/integrations/grok/device/poll', { method: 'POST' });
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          status?: string;
          error?: string;
          intervalSec?: number;
        };
        if (cancelled) return;
        if (data.status === 'authorized' && data.ok) {
          setStatus('connected');
          toast.success('Grok (SuperGrok) connected — Ask will use your subscription.');
          window.setTimeout(() => {
            window.location.href = '/settings/integrations?success=grok_connected';
          }, 600);
          return;
        }
        if (!res.ok || data.status === 'expired' || data.status === 'denied' || data.status === 'error') {
          setStatus('error');
          setError(data.error || 'SuperGrok sign-in failed.');
          toast.error(data.error || 'SuperGrok sign-in failed.');
          return;
        }
        if (typeof data.intervalSec === 'number' && data.intervalSec > 0) {
          intervalRef.current = data.intervalSec;
        }
      } catch (err) {
        if (cancelled) return;
        setStatus('error');
        setError(err instanceof Error ? err.message : 'SuperGrok sign-in failed.');
        return;
      }
      if (!cancelled) {
        timer = setTimeout(poll, intervalRef.current * 1000);
      }
    };

    timer = setTimeout(poll, 1500);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

  return (
    <Panel radius="xl" padding="md" className="border border-surface-strong bg-surface-raised">
      <div className="flex flex-col gap-3">
        <div>
          <p className="text-role-caption font-semibold text-text">Connect Grok with SuperGrok</p>
          <p className="mt-1 text-role-micro text-text-soft">
            Approve this code on xAI. Ask then runs on your SuperGrok / X Premium+ plan — no API credits.
          </p>
        </div>
        <p className="font-mono text-2xl tracking-[0.35em] text-text">{userCode}</p>
        {status === 'waiting' && (
          <p className="text-role-micro text-text-faint">Waiting for approval…</p>
        )}
        {status === 'error' && error && (
          <p className="text-role-micro text-text-danger">{error}</p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button
            variant="primary"
            size="sm"
            icon={<ExternalLink />}
            onClick={() => window.open(verificationUri, '_blank', 'noopener,noreferrer')}
          >
            Open xAI sign-in
          </Button>
          {status === 'error' && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                window.location.href = '/api/integrations/grok/connect';
              }}
            >
              Retry
            </Button>
          )}
        </div>
      </div>
    </Panel>
  );
}
