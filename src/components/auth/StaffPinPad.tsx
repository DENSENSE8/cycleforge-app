'use client';

/** Themed PIN numpad. */

import { useCallback, useState } from 'react';
import { PinPadKey } from '@/components/auth/PinPadKey';
import { PinPadStaffHeader } from '@/components/auth/PinPadStaffHeader';
import { THEME_NUMPAD } from '@/components/auth/theme-numpad';
import { getStaffTheme } from '@/utils/staff-colors';

interface StaffPinPadProps {
  staff: { id: number; name: string; role: string; color_hex?: string; avatar_photo_id?: number | null };
  /** Submit handler. Resolve/reject controls error display + re-entry. */
  onSubmit: (pin: string) => Promise<{ ok: true } | { ok: false; error?: string }>;
  /** Optional passkey shortcut, e.g. /signin's passkey button. */
  onPasskey?: () => Promise<void>;
  /** Optional label override for the submit button. */
  submitLabel?: string;
  /** Tap to go back to the picker. */
  onBack?: () => void;
  /** Initial error to display (e.g. after a router refresh). */
  initialError?: string | null;
}

export function StaffPinPad({ staff, onSubmit, onPasskey, submitLabel, onBack, initialError = null }: StaffPinPadProps) {
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(initialError);
  const theme = getStaffTheme(staff);
  const t = THEME_NUMPAD[theme];

  const submit = useCallback(async (rawPin?: string) => {
    const enteredPin = rawPin ?? pin;
    if (enteredPin.length < 4) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await onSubmit(enteredPin);
      if (!r.ok) {
        setErr(r.error || 'Sign-in failed. Try again.');
        setPin('');
      }
    } finally {
      setBusy(false);
    }
  }, [pin, onSubmit]);

  const press = useCallback((digit: string) => {
    setErr(null);
    setPin((prev) => {
      if (prev.length >= 6) return prev;
      const next = prev + digit;
      if (next.length === 6) setTimeout(() => void submit(next), 30);
      return next;
    });
  }, [submit]);

  return (
    <div className="flex flex-col items-center">
      <PinPadStaffHeader staff={staff} theme={theme} onBack={onBack} />
      <div className="mt-4 text-sm text-text-soft">Enter your PIN</div>

      <div className="mt-5 flex gap-3">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className={`h-3 w-3 rounded-full transition-all duration-200 ${
              i < pin.length ? `${t.dotActive} scale-110` : 'bg-surface-strong scale-100'
            }`}
          />
        ))}
      </div>

      {err && (
        <div className="mt-4 rounded-lg bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700">
          {err}
        </div>
      )}

      <div className="mt-6 grid grid-cols-3 gap-3">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
          <PinPadKey key={d} value={d} disabled={busy} onClick={() => press(d)} theme={theme} />
        ))}
        {onPasskey ? (
          <PinPadKey
            value=""
            disabled={busy}
            onClick={() => { setErr(null); void onPasskey().catch((e) => setErr(e instanceof Error ? e.message : 'Passkey failed.')); }}
            theme={theme}
            ariaLabel="Sign in with passkey"
            icon={(
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="6.5" r="3.5"/>
                <path d="M12 10v11"/>
                <path d="M12 16h3"/>
                <path d="M12 19h2"/>
              </svg>
            )}
          />
        ) : (
          <span aria-hidden />
        )}
        <PinPadKey value="0" disabled={busy} onClick={() => press('0')} theme={theme} />
        <PinPadKey
          value=""
          disabled={busy || pin.length === 0}
          onClick={() => setPin((p) => p.slice(0, -1))}
          theme={theme}
          ariaLabel="Backspace"
          icon={(
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 5H8l-7 7 7 7h13a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2z"/>
              <line x1="18" y1="9" x2="12" y2="15"/>
              <line x1="12" y1="9" x2="18" y2="15"/>
            </svg>
          )}
        />
      </div>

      {/* ds-raw-button: themed full-width submit CTA (per-staff solid accent, e.g. emerald) */}
      <button
        type="button"
        disabled={busy || pin.length < 4}
        onClick={() => void submit()}
        className={`mt-6 inline-flex h-12 w-72 items-center justify-center rounded-2xl ${t.primaryBg} ${t.primaryHover} text-base font-semibold text-white shadow-lg shadow-gray-900/15 transition-all hover:shadow-xl hover:shadow-gray-900/20 disabled:cursor-not-allowed disabled:opacity-50`}
      >
        {busy ? 'Signing in…' : (submitLabel ?? 'Sign in')}
      </button>
    </div>
  );
}
