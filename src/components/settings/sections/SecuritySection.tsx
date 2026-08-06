'use client';

/**
 * /settings?section=security — per-user PIN + passkey management.
 *
 * Anyone signed in can use this to change their own PIN and add a passkey
 * for one-tap sign-in on their current device.
 */

import { useCallback, useEffect, useState } from 'react';
import { startRegistration } from '@simplewebauthn/browser';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/design-system/primitives';

export function SecuritySection() {
  const { user } = useAuth();
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [savingPin, setSavingPin] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);
  const [addingPasskey, setAddingPasskey] = useState(false);
  const [addingAcctPasskey, setAddingAcctPasskey] = useState(false);
  const [acctPasskeys, setAcctPasskeys] = useState<{ id: string; label: string | null; createdAt: string; lastUsedAt: string | null }[]>([]);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const loadAcctPasskeys = useCallback(async () => {
    try {
      const r = await fetch('/api/auth/account/passkey', { credentials: 'include', cache: 'no-store' });
      if (r.ok) {
        const data = await r.json() as { passkeys: typeof acctPasskeys };
        setAcctPasskeys(data.passkeys ?? []);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { void loadAcctPasskeys(); }, [loadAcctPasskeys]);

  const removeAcctPasskey = useCallback(async (id: string) => {
    if (removingId) return;
    setRemovingId(id);
    try {
      const r = await fetch(`/api/auth/account/passkey/${id}`, { method: 'DELETE', credentials: 'include' });
      if (r.ok) setAcctPasskeys((prev) => prev.filter((p) => p.id !== id));
    } finally {
      setRemovingId(null);
    }
  }, [removingId]);

  const savePin = useCallback(async () => {
    setErr(null); setOk(null);
    if (newPin.length < 4) { setErr('PIN must be at least 4 digits.'); return; }
    if (newPin !== confirmPin) { setErr("Confirmation doesn't match."); return; }
    setSavingPin(true);
    try {
      const r = await fetch('/api/auth/pin', {
        method: 'POST', credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ pin: newPin, currentPin: currentPin || undefined }),
      });
      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        setErr(String((data as { error?: string }).error || 'Could not save PIN.'));
      } else {
        setOk('PIN updated.');
        setCurrentPin(''); setNewPin(''); setConfirmPin('');
      }
    } finally {
      setSavingPin(false);
    }
  }, [currentPin, newPin, confirmPin]);

  const savePassword = useCallback(async () => {
    setErr(null); setOk(null);
    if (newPassword.length < 8) { setErr('Password must be at least 8 characters.'); return; }
    if (newPassword !== confirmPassword) { setErr("Confirmation doesn't match."); return; }
    setSavingPassword(true);
    try {
      const r = await fetch('/api/auth/account/change-password', {
        method: 'POST', credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ newPassword, currentPassword: currentPassword || undefined }),
      });
      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        const code = String((data as { error?: string }).error || '');
        setErr(
          code === 'CURRENT_PASSWORD_INVALID' ? 'Your current password is incorrect.'
          : code === 'NO_ACCOUNT' ? 'This profile has no email account to set a password on.'
          : code === 'WEAK_PASSWORD' ? 'Choose a stronger password.'
          : 'Could not update your password.',
        );
      } else {
        setOk('Password updated.');
        setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
      }
    } finally {
      setSavingPassword(false);
    }
  }, [currentPassword, newPassword, confirmPassword]);

  const addPasskey = useCallback(async () => {
    setErr(null); setOk(null);
    setAddingPasskey(true);
    try {
      const beginRes = await fetch('/api/auth/passkey/register/begin', {
        method: 'POST', credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!beginRes.ok) throw new Error('Could not start passkey registration.');
      const beginData = await beginRes.json() as { options: Parameters<typeof startRegistration>[0]['optionsJSON'] };
      const attResp = await startRegistration({ optionsJSON: beginData.options });
      const finishRes = await fetch('/api/auth/passkey/register/finish', {
        method: 'POST', credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ response: attResp, deviceLabel: navigator.userAgent.slice(0, 64) }),
      });
      if (!finishRes.ok) throw new Error('Could not save passkey.');
      setOk('Passkey added. Next sign-in can use Touch ID / Windows Hello / Face ID.');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Passkey setup failed.');
    } finally {
      setAddingPasskey(false);
    }
  }, []);

  const addAccountPasskey = useCallback(async () => {
    setErr(null); setOk(null);
    setAddingAcctPasskey(true);
    try {
      const beginRes = await fetch('/api/auth/account/passkey/register/begin', {
        method: 'POST', credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!beginRes.ok) {
        const data = await beginRes.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error === 'MULTI_ORG_NOT_PROVISIONED'
          ? 'Account sign-in isn’t enabled for this profile yet.'
          : 'Could not start passkey registration.');
      }
      const beginData = await beginRes.json() as { options: Parameters<typeof startRegistration>[0]['optionsJSON'] };
      const attResp = await startRegistration({ optionsJSON: beginData.options });
      const finishRes = await fetch('/api/auth/account/passkey/register/finish', {
        method: 'POST', credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ response: attResp, label: navigator.userAgent.slice(0, 64) }),
      });
      if (!finishRes.ok) throw new Error('Could not save passkey.');
      setOk('Account passkey added. You can now sign in by passkey at /account/signin across your workspaces.');
      void loadAcctPasskeys();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Passkey setup failed.');
    } finally {
      setAddingAcctPasskey(false);
    }
  }, [loadAcctPasskeys]);

  if (!user) {
    return <div className="text-sm text-text-soft">Sign in to manage your security.</div>;
  }

  return (
    <section className="space-y-8">
      <header>
        <h1 className="sr-only">Security</h1>
        <p className="text-sm text-text-soft">Manage your password, PIN, and passkeys.</p>
      </header>

      {err && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>}
      {ok && <div className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">{ok}</div>}

      <div className="rounded-none border border-border-soft bg-surface-card p-5 space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-text-default">Change your PIN</h2>
          <p className="text-xs text-text-soft">4–6 digit number. Used at shared stations.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <label className="block">
            <span className="block text-xs text-text-soft mb-1">Current PIN</span>
            <input type="password" inputMode="numeric" maxLength={6}
              value={currentPin} onChange={(e) => setCurrentPin(e.target.value.replace(/\D/g, ''))}
              className="w-full rounded-md border border-border-default px-2 py-1.5 text-sm" />
          </label>
          <label className="block">
            <span className="block text-xs text-text-soft mb-1">New PIN</span>
            <input type="password" inputMode="numeric" maxLength={6}
              value={newPin} onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))}
              className="w-full rounded-md border border-border-default px-2 py-1.5 text-sm" />
          </label>
          <label className="block">
            <span className="block text-xs text-text-soft mb-1">Confirm new PIN</span>
            <input type="password" inputMode="numeric" maxLength={6}
              value={confirmPin} onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ''))}
              className="w-full rounded-md border border-border-default px-2 py-1.5 text-sm" />
          </label>
        </div>
        <div className="flex justify-end">
          <Button variant="brand" size="sm" disabled={savingPin || newPin.length < 4} onClick={savePin}>
            {savingPin ? 'Saving…' : 'Save PIN'}
          </Button>
        </div>
      </div>

      <div className="rounded-none border border-border-soft bg-surface-card p-5 space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-text-default">Change your password</h2>
          <p className="text-xs text-text-soft">Used for email sign-in across your workspaces.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <label className="block">
            <span className="block text-xs text-text-soft mb-1">Current password</span>
            <input type="password" autoComplete="current-password"
              value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full rounded-md border border-border-default px-2 py-1.5 text-sm" />
          </label>
          <label className="block">
            <span className="block text-xs text-text-soft mb-1">New password</span>
            <input type="password" autoComplete="new-password" minLength={8}
              value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
              className="w-full rounded-md border border-border-default px-2 py-1.5 text-sm" />
          </label>
          <label className="block">
            <span className="block text-xs text-text-soft mb-1">Confirm new password</span>
            <input type="password" autoComplete="new-password"
              value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full rounded-md border border-border-default px-2 py-1.5 text-sm" />
          </label>
        </div>
        <div className="flex justify-end">
          <Button variant="brand" size="sm" disabled={savingPassword || newPassword.length < 8} onClick={savePassword}>
            {savingPassword ? 'Saving…' : 'Save password'}
          </Button>
        </div>
      </div>

      <div className="rounded-none border border-border-soft bg-surface-card p-5 space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-text-default">Passkeys</h2>
          <p className="text-xs text-text-soft">One-tap sign-in via Touch ID, Face ID, Windows Hello, or your device PIN.</p>
        </div>
        <Button variant="primary" size="sm" disabled={addingPasskey} onClick={addPasskey}>
          {addingPasskey ? 'Adding…' : 'Add a passkey on this device'}
        </Button>
      </div>

      <div className="rounded-none border border-border-soft bg-surface-card p-5 space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-text-default">Account passkey (cross-workspace)</h2>
          <p className="text-xs text-text-soft">
            Sign in by passkey at <code>/account/signin</code> — resolves your account and lands you in your
            workspace (switch from Settings if you belong to more than one).
          </p>
        </div>
        <Button variant="primary" size="sm" disabled={addingAcctPasskey} onClick={addAccountPasskey}>
          {addingAcctPasskey ? 'Adding…' : 'Add an account passkey'}
        </Button>

        {acctPasskeys.length > 0 && (
          <div className="divide-y divide-border-hairline overflow-hidden rounded-none border border-border-soft">
            {acctPasskeys.map((p) => (
              <div key={p.id} className="flex items-center gap-3 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-text-default">{p.label || 'Passkey'}</div>
                  <div className="truncate text-xs text-text-soft">
                    Added {new Date(p.createdAt).toLocaleDateString()}
                    {p.lastUsedAt ? ` · last used ${new Date(p.lastUsedAt).toLocaleDateString()}` : ' · never used'}
                  </div>
                </div>
                <Button variant="ghost" size="sm" disabled={removingId === p.id} onClick={() => void removeAcctPasskey(p.id)}
                  className="shrink-0 text-rose-600 hover:text-rose-700">
                  {removingId === p.id ? 'Removing…' : 'Remove'}
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
