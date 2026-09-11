'use client';

/**
 * Phone QR companion — signed-in phone session authorizes the desktop.
 *
 * Callers / importers: Next.js route `/m/qr-auth`; desktop SignInQrPanel QR URL.
 * Affected API: GET /api/auth/session; POST /api/auth/qr/authorize body `{ token }`.
 * Schemas: session user; qr_login_sessions.
 * User instruction: auth desktop button, not Face ID; phone session binds desk.
 */

import { Suspense, useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { Shield, CheckCircle2, AlertCircle, Smartphone } from 'lucide-react';
import { Button } from '@/design-system/primitives/Button';
import { Panel } from '@/design-system/primitives/Panel';
import { StaffChoiceRowButton } from '@/components/auth/StaffChoiceRowButton';

type QrAuthState =
  | 'loading'
  | 'ready_signed_in'
  | 'authorizing'
  | 'success'
  | 'error';

interface CurrentUserResponse {
  staffId: number;
  name: string;
  role: string;
  avatarPhotoId?: number | null;
}

function QrAuthContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';

  const [state, setState] = useState<QrAuthState>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<CurrentUserResponse | null>(null);
  const [authorizedStaffName, setAuthorizedStaffName] = useState<string>('');

  useEffect(() => {
    if (!token) {
      setErrorMessage('No pairing token was provided. Please scan the QR code again.');
      setState('error');
      return;
    }

    async function init() {
      try {
        const meRes = await fetch('/api/auth/session', {
          credentials: 'include',
          cache: 'no-store',
        });
        if (meRes.ok) {
          const meData = (await meRes.json()) as { user?: CurrentUserResponse | null };
          const me = meData?.user ?? null;
          if (me?.staffId) {
            setCurrentUser(me);
            setState('ready_signed_in');
            return;
          }
        }

        const nextUrl = `/m/qr-auth?token=${encodeURIComponent(token)}`;
        window.location.href = `/m/signin?next=${encodeURIComponent(nextUrl)}`;
      } catch (err) {
        console.error('[qr-auth] init failed:', err);
        setErrorMessage('Failed to initialize authorization session.');
        setState('error');
      }
    }

    void init();
  }, [token]);

  const handleAuthorize = useCallback(async () => {
    if (!token || !currentUser) return;
    setState('authorizing');
    setErrorMessage(null);

    try {
      const res = await fetch('/api/auth/qr/authorize', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const data = (await res.json()) as { ok?: boolean; staffName?: string; error?: string };

      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Authorization failed.');
      }

      setAuthorizedStaffName(data.staffName || currentUser.name);
      setState('success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not authorize workstation.';
      setErrorMessage(msg);
      setState('error');
    }
  }, [token, currentUser]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-surface-canvas p-4 text-text-default">
      <Panel
        radius="2xl"
        padding="lg"
        className="w-full max-w-sm space-y-6 border border-border-soft bg-surface-card text-center shadow-lg"
      >
        <div className="flex flex-col items-center space-y-2">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-primary/10 text-brand-primary">
            <Smartphone className="h-6 w-6" />
          </div>
          <h1 className="text-role-title text-text-default">Workstation Sign-In</h1>
          <p className="text-role-body-sm text-text-soft">
            Authorize this computer to sign in with your phone session.
          </p>
        </div>

        {state === 'loading' && (
          <div className="py-8 text-center text-text-soft">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-brand-primary border-t-transparent" />
            <p className="mt-3 text-sm">Checking session...</p>
          </div>
        )}

        {state === 'error' && (
          <div className="space-y-4 py-4 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-status-danger/10 text-status-danger">
              <AlertCircle className="h-6 w-6" />
            </div>
            <p className="text-role-body text-status-danger">
              {errorMessage || 'Authorization encountered an error.'}
            </p>
            <Button
              variant="secondary"
              className="w-full"
              onClick={() => {
                if (currentUser) setState('ready_signed_in');
                else window.location.reload();
              }}
            >
              Try Again
            </Button>
          </div>
        )}

        {state === 'ready_signed_in' && currentUser && (
          <div className="space-y-5 py-2">
            <StaffChoiceRowButton
              staffId={currentUser.staffId}
              name={currentUser.name}
              role={currentUser.role}
              avatarPhotoId={currentUser.avatarPhotoId}
            />

            <p className="text-left text-role-body-sm text-text-soft">
              A desktop browser is requesting to sign in as <strong>{currentUser.name}</strong>.
            </p>

            <Button
              variant="brand"
              size="lg"
              className="w-full"
              icon={<Shield className="h-4 w-4" />}
              onClick={() => void handleAuthorize()}
            >
              Authorize desktop login
            </Button>
          </div>
        )}

        {state === 'authorizing' && (
          <div className="py-8 text-center text-text-soft">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-brand-primary border-t-transparent" />
            <p className="mt-3 text-sm font-medium">Authorizing desktop…</p>
          </div>
        )}

        {state === 'success' && (
          <div className="space-y-4 py-4 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-status-success/10 text-status-success">
              <CheckCircle2 className="h-8 w-8 text-status-success" />
            </div>
            <div className="space-y-1">
              <h2 className="text-lg font-semibold text-text-default">Desktop Authorized!</h2>
              <p className="text-sm text-text-soft">
                Your workstation has signed in as{' '}
                <strong className="text-text-default">{authorizedStaffName}</strong>.
              </p>
            </div>
            <p className="text-xs text-text-soft">You can safely close this screen.</p>
          </div>
        )}
      </Panel>
    </div>
  );
}

export default function QrAuthPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-text-soft">Loading...</div>}>
      <QrAuthContent />
    </Suspense>
  );
}
