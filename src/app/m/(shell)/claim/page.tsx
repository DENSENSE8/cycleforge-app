'use client';

/**
 * /m/claim — phone lands here after scanning the desk handoff QR or typing the code.
 * GateGuard: public path. Claims via POST /api/auth/qr/handoff/claim.
 * User: desk→phone handoff; accept ?token= or ?code=.
 */

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { CheckCircle2, AlertCircle, Smartphone } from 'lucide-react';
import { Button } from '@/design-system/primitives/Button';
import { Panel } from '@/design-system/primitives/Panel';
import { parseHandoffDisplayCode } from '@/lib/auth/qr-handoff-code';

type ClaimState = 'claiming' | 'success' | 'error';

function ClaimContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';
  const codeParam = searchParams.get('code') || searchParams.get('shortCode') || '';
  const shortCode = parseHandoffDisplayCode(codeParam);
  const [state, setState] = useState<ClaimState>('claiming');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [staffName, setStaffName] = useState<string>('');

  const claim = useCallback(async () => {
    if (!token && !shortCode) {
      setErrorMessage('No pairing code. Scan the QR on your computer, or type the four characters.');
      setState('error');
      return;
    }
    setState('claiming');
    setErrorMessage(null);
    try {
      const res = await fetch('/api/auth/qr/handoff/claim', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(token ? { token } : { code: shortCode }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        staffName?: string;
        redirectUrl?: string;
        error?: string;
      };
      if (!res.ok || !data.ok) {
        const map: Record<string, string> = {
          EXPIRED: 'That code expired. Ask the desk to refresh the QR.',
          ALREADY_CONSUMED: 'That code was already used.',
          NOT_FOUND: 'Unknown pairing code.',
          WRONG_FLOW: 'That QR is for a different sign-in flow.',
          CLAIM_FAILED: 'Could not claim this code. Refresh the desk QR.',
          STAFF_NOT_ACTIVE: 'This staff account is not active.',
          RATE_LIMITED: 'Too many attempts. Wait a minute.',
          TOKEN_OR_CODE_REQUIRED: 'Enter the four-character code from your computer.',
        };
        throw new Error(map[data.error ?? ''] || data.error || 'Claim failed.');
      }
      setStaffName(data.staffName || '');
      setState('success');
      window.setTimeout(() => {
        window.location.assign(data.redirectUrl || '/m/home');
      }, 700);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Could not sign in.');
      setState('error');
    }
  }, [token, shortCode]);

  useEffect(() => {
    void claim();
  }, [claim]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-surface-canvas p-4 text-text-default">
      <Panel radius="2xl" padding="lg" className="w-full max-w-sm space-y-6 border border-border-soft bg-surface-card text-center shadow-lg">
        <div className="flex flex-col items-center space-y-2">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-primary/10 text-brand-primary">
            <Smartphone className="h-6 w-6" />
          </div>
          <h1 className="text-role-title text-text-default">Sign in on this phone</h1>
          <p className="text-role-caption text-text-soft">
            Taking the session from your computer.
          </p>
        </div>

        {state === 'claiming' && (
          <p className="text-role-caption text-text-soft animate-pulse">Signing you in…</p>
        )}

        {state === 'success' && (
          <div className="flex flex-col items-center gap-2">
            <CheckCircle2 className="h-10 w-10 text-text-success" />
            <p className="text-sm font-semibold text-text-default">
              {staffName ? `Welcome, ${staffName}` : 'Signed in'}
            </p>
          </div>
        )}

        {state === 'error' && (
          <div className="flex flex-col items-center gap-3">
            <AlertCircle className="h-10 w-10 text-text-danger" />
            <p className="text-sm text-text-danger">{errorMessage}</p>
            <Button variant="secondary" size="sm" onClick={() => void claim()}>
              Try again
            </Button>
            <Button variant="ghost" size="sm" onClick={() => { window.location.href = '/m/signin'; }}>
              Sign in another way
            </Button>
          </div>
        )}
      </Panel>
    </div>
  );
}

export default function ClaimPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-surface-canvas" />}>
      <ClaimContent />
    </Suspense>
  );
}
