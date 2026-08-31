'use client';

/**
 * /signin/reset — public password reset.
 *
 * Two modes, chosen by the presence of `?token=`:
 *   • no token  → request a reset link (enter email → POST /api/auth/password-reset/request)
 *   • token     → set a new password (POST /api/auth/password-reset/confirm)
 *
 * Simple centered form (Notion-like, semantic tokens only) — not a dashboard.
 * Public: covered by proxy.ts `^/signin` PUBLIC_PATH.
 */

import { Suspense, useCallback, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
// Deep paths, not the barrel — see the note in `src/app/signin/page.tsx`.
import { Button } from '@/design-system/primitives/Button';
import { Panel } from '@/design-system/primitives/Panel';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';



function ResetInner() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get('token');
  const mode = token ? 'confirm' : 'request';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<null | 'requested' | 'reset' | 'reset-pick'>(null);

  const passwordMismatch = useMemo(
    () => mode === 'confirm' && password.length > 0 && confirm.length > 0 && password !== confirm,
    [mode, password, confirm],
  );

  const submitRequest = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      await fetch('/api/auth/password-reset/request', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      // Always shows the same confirmation — never reveals whether the email exists.
      setDone('requested');
    } catch {
      setDone('requested');
    } finally {
      setBusy(false);
    }
  }, [email]);

  const submitConfirm = useCallback(async () => {
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/password-reset/confirm', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        organizationId?: string;
        needsOrgChoice?: boolean;
        error?: string;
      };
      if (!res.ok || body.error) {
        setError(
          body.error === 'INVALID_OR_EXPIRED_TOKEN'
            ? 'This reset link is invalid or has expired. Request a new one.'
            : 'Could not reset your password. Please try again.',
        );
        return;
      }
      if (body.organizationId) {
        // Signed in — go to the app.
        router.replace('/');
        return;
      }
      // Password set but no auto-sign-in (0 or multiple workspaces) → go log in.
      setDone(body.needsOrgChoice ? 'reset-pick' : 'reset');
    } catch {
      setError('Could not reset your password. Please try again.');
    } finally {
      setBusy(false);
    }
  }, [token, password, confirm, router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-canvas px-4">
      <Panel padding="lg" radius="2xl" elevation="sm" className="w-full max-w-sm space-y-6">
        {/* No brand eyebrow — the heading already says what this page is. */}
        <h1 className="text-role-title text-text-default">
          {mode === 'request' ? 'Reset your password' : 'Choose a new password'}
        </h1>

        {done === 'requested' ? (
          <div className="rounded-xl border border-dashed border-border-soft bg-surface-canvas px-4 py-6 text-center text-sm text-text-muted">
            If an account exists for that email, we&apos;ve sent a reset link. Check your inbox.
          </div>
        ) : done === 'reset' || done === 'reset-pick' ? (
          <div className="space-y-4">
            <div className="rounded-xl border border-dashed border-emerald-200 bg-emerald-50 px-4 py-6 text-center text-sm text-emerald-700">
              Your password has been reset. Sign in with your new password.
            </div>
            <Button variant="primary" className="w-full" onClick={() => router.push('/signin')}>
              Go to sign in
            </Button>
          </div>
        ) : mode === 'request' ? (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (!busy) void submitRequest();
            }}
          >
            <div className="space-y-1">
              <label htmlFor="reset-email" className="text-role-micro uppercase tracking-widest text-text-soft">
                Email
              </label>
              <input
                id="reset-email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={cn("w-full rounded-lg border border-border-default px-3 py-2 text-sm", focusRing('field', 'accent'))}
                placeholder="you@company.com"
              />
            </div>
            <Button type="submit" variant="primary" className="w-full" disabled={busy || !email.trim()}>
              {busy ? 'Sending…' : 'Send reset link'}
            </Button>
          </form>
        ) : (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (!busy) void submitConfirm();
            }}
          >
            <div className="space-y-1">
              <label htmlFor="reset-pw" className="text-role-micro uppercase tracking-widest text-text-soft">
                New password
              </label>
              <input
                id="reset-pw"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={cn("w-full rounded-lg border border-border-default px-3 py-2 text-sm", focusRing('field', 'accent'))}
                placeholder="At least 8 characters"
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="reset-pw2" className="text-role-micro uppercase tracking-widest text-text-soft">
                Confirm password
              </label>
              <input
                id="reset-pw2"
                type="password"
                autoComplete="new-password"
                required
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className={cn("w-full rounded-lg border border-border-default px-3 py-2 text-sm", focusRing('field', 'accent'))}
                placeholder="Re-enter password"
              />
              {passwordMismatch && <p className="text-xs text-rose-600">Passwords do not match.</p>}
            </div>
            <Button
              type="submit"
              variant="primary"
              className="w-full"
              disabled={busy || password.length < 8 || password !== confirm}
            >
              {busy ? 'Saving…' : 'Set new password'}
            </Button>
          </form>
        )}

        {error && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</div>
        )}

        <div className="text-center">
          <Link href="/signin" className="text-xs font-semibold text-text-soft hover:text-text-default">
            Back to sign in
          </Link>
        </div>
      </Panel>
    </div>
  );
}

export default function ResetPage() {
  return (
    <Suspense fallback={null}>
      <ResetInner />
    </Suspense>
  );
}