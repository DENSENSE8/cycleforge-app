'use client';

import { Suspense, useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { Shield, CheckCircle2, AlertCircle, Smartphone, Lock, ArrowRight } from 'lucide-react';
import { Button } from '@/design-system/primitives/Button';
import { Panel } from '@/design-system/primitives/Panel';

type QrAuthState = 'loading' | 'ready_signed_in' | 'ready_pick_staff' | 'enter_pin' | 'authorizing' | 'success' | 'error';

interface CurrentUserResponse {
  staffId: number;
  staff: {
    name: string;
    role: string;
  };
}

interface StaffPickerItem {
  id: number;
  name: string;
  role: string;
  has_pin: boolean;
}

function QrAuthContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';

  const [state, setState] = useState<QrAuthState>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<CurrentUserResponse | null>(null);
  const [staffList, setStaffList] = useState<StaffPickerItem[]>([]);
  const [selectedStaff, setSelectedStaff] = useState<StaffPickerItem | null>(null);
  const [pin, setPin] = useState('');
  const [authorizedStaffName, setAuthorizedStaffName] = useState<string>('');

  useEffect(() => {
    if (!token) {
      setErrorMessage('No pairing token was provided. Please scan the QR code again.');
      setState('error');
      return;
    }

    async function init() {
      try {
        // 1. Check if user is already signed in on mobile
        const meRes = await fetch('/api/auth/me');
        if (meRes.ok) {
          const meData = await meRes.json() as CurrentUserResponse;
          if (meData?.staffId) {
            setCurrentUser(meData);
            setState('ready_signed_in');
            return;
          }
        }

        // 2. Not signed in: fetch staff list
        const staffRes = await fetch('/api/auth/staff-picker');
        if (staffRes.ok) {
          const staffData = await staffRes.json() as { staff?: StaffPickerItem[] } | StaffPickerItem[];
          const list = Array.isArray(staffData) ? staffData : (staffData.staff || []);
          setStaffList(list);
          setState('ready_pick_staff');
          return;
        }

        setState('ready_pick_staff');
      } catch (err) {
        console.error('[qr-auth] init failed:', err);
        setErrorMessage('Failed to initialize authorization session.');
        setState('error');
      }
    }

    void init();
  }, [token]);

  const handleAuthorizeSignedIn = useCallback(async () => {
    if (!token || !currentUser) return;
    setState('authorizing');
    setErrorMessage(null);

    try {
      const res = await fetch('/api/auth/qr/authorize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const data = await res.json() as { ok?: boolean; staffName?: string; error?: string };

      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Authorization failed.');
      }

      setAuthorizedStaffName(data.staffName || currentUser.staff.name);
      setState('success');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Could not authorize workstation.');
      setState('error');
    }
  }, [token, currentUser]);

  const handleAuthorizeWithPin = useCallback(async () => {
    if (!token || !selectedStaff || !pin) return;
    setState('authorizing');
    setErrorMessage(null);

    try {
      const res = await fetch('/api/auth/qr/authorize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          staffId: selectedStaff.id,
          pin,
        }),
      });
      const data = await res.json() as { ok?: boolean; staffName?: string; error?: string };

      if (!res.ok || !data.ok) {
        throw new Error(data.error === 'INVALID_PIN' ? 'Incorrect PIN entered.' : (data.error || 'Authorization failed.'));
      }

      setAuthorizedStaffName(data.staffName || selectedStaff.name);
      setState('success');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'PIN verification failed.');
      setState('enter_pin');
    }
  }, [token, selectedStaff, pin]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-surface-canvas p-4 text-text-default">
      <Panel radius="2xl" padding="lg" className="w-full max-w-sm space-y-6 text-center border border-border-soft bg-surface-card shadow-lg">
        {/* Header Branding */}
        <div className="flex flex-col items-center space-y-2">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-primary/10 text-brand-primary">
            <Smartphone className="h-6 w-6" />
          </div>
          <h1 className="text-role-title text-text-default">Workstation Sign-In</h1>
          <p className="text-role-body-sm text-text-soft">
            Authorize your desktop login from this mobile device.
          </p>
        </div>

        {/* Loading State */}
        {state === 'loading' && (
          <div className="py-8 text-center text-text-soft">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-brand-primary border-t-transparent" />
            <p className="mt-3 text-sm">Verifying QR pairing session...</p>
          </div>
        )}

        {/* Error State */}
        {state === 'error' && (
          <div className="space-y-4 py-4 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-status-danger/10 text-status-danger">
              <AlertCircle className="h-6 w-6" />
            </div>
            <p className="text-role-body text-status-danger">{errorMessage || 'Authorization encountered an error.'}</p>
            <Button
              variant="secondary"
              className="w-full"
              onClick={() => {
                if (currentUser) setState('ready_signed_in');
                else setState('ready_pick_staff');
              }}
            >
              Try Again
            </Button>
          </div>
        )}

        {/* Ready: Already signed in on mobile */}
        {state === 'ready_signed_in' && currentUser && (
          <div className="space-y-5 py-2">
            <div className="rounded-xl border border-border-subtle bg-surface-sunken p-4 text-left">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-primary text-text-inverse font-bold">
                  {currentUser.staff.name.charAt(0)}
                </div>
                <div className="min-w-0">
                  <p className="font-medium text-text-default truncate">{currentUser.staff.name}</p>
                  <p className="text-xs uppercase tracking-wider text-text-soft">{currentUser.staff.role}</p>
                </div>
              </div>
            </div>

            <p className="text-left text-role-body-sm text-text-soft">
              A desktop browser is requesting to sign into your CycleForge account.
            </p>

            <Button
              variant="brand"
              size="lg"
              className="w-full"
              icon={<Shield className="h-4 w-4" />}
              onClick={handleAuthorizeSignedIn}
            >
              Authorize Desktop Login
            </Button>
          </div>
        )}

        {/* Ready: Pick staff name */}
        {state === 'ready_pick_staff' && (
          <div className="space-y-4 text-left">
            <p className="text-role-body-sm text-text-soft">Select your staff profile to continue:</p>
            <div className="max-h-60 space-y-2 overflow-y-auto pr-1">
              {staffList.map((st) => (
                <button
                  key={st.id}
                  type="button"
                  onClick={() => {
                    setSelectedStaff(st);
                    setState('enter_pin');
                  }}
                  className="flex w-full items-center justify-between rounded-xl border border-border-subtle bg-surface-sunken p-3 text-left transition hover:border-brand-primary/50"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-card text-xs font-semibold text-text-default">
                      {st.name.charAt(0)}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-text-default">{st.name}</p>
                      <p className="text-xs uppercase tracking-wider text-text-soft">{st.role}</p>
                    </div>
                  </div>
                  <ArrowRight className="h-4 w-4 text-text-soft" />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Enter PIN State */}
        {state === 'enter_pin' && selectedStaff && (
          <div className="space-y-4 text-left">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-text-default">{selectedStaff.name}</span>
              <button
                type="button"
                onClick={() => setState('ready_pick_staff')}
                className="text-xs text-brand-primary underline"
              >
                Change
              </button>
            </div>

            {errorMessage && (
              <p className="text-xs text-status-danger">{errorMessage}</p>
            )}

            <div>
              <label htmlFor="staff-pin-input" className="block text-xs font-medium uppercase text-text-soft mb-1">
                Enter your 6-digit PIN
              </label>
              <input
                id="staff-pin-input"
                type="password"
                inputMode="numeric"
                maxLength={6}
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="••••••"
                className="w-full rounded-xl border border-border-default bg-surface-sunken px-4 py-3 text-center text-xl font-mono tracking-widest text-text-default focus:border-brand-primary focus:outline-none"
              />
            </div>

            <Button
              variant="brand"
              size="lg"
              className="w-full"
              disabled={pin.length < 4}
              icon={<Lock className="h-4 w-4" />}
              onClick={handleAuthorizeWithPin}
            >
              Verify &amp; Authorize
            </Button>
          </div>
        )}

        {/* Authorizing in Progress */}
        {state === 'authorizing' && (
          <div className="py-8 text-center text-text-soft">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-brand-primary border-t-transparent" />
            <p className="mt-3 text-sm font-medium">Authorizing workstation...</p>
          </div>
        )}

        {/* Success State */}
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
