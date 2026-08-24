'use client';

/**
 * Two-step "set your PIN" pad used by /signin and /m/signin for staff who
 * haven't enrolled yet.
 *
 *   Step 1 (enter):   choose a 4–6 digit PIN
 *   Step 2 (confirm): type the same PIN again — mismatch resets to step 1
 *
 * On 6th digit at step 2 (matched) → calls onSubmit. Auto-advance from step 1
 * to step 2 when the user reaches 4-6 digits and taps the confirm CTA, or
 * when they type the 6th digit (matches the existing StaffPinPad UX).
 */

import { useCallback, useState } from 'react';
import { PinPadKey } from '@/components/auth/PinPadKey';
import { PinPadStaffHeader } from '@/components/auth/PinPadStaffHeader';
import { THEME_NUMPAD } from '@/components/auth/theme-numpad';
import { getStaffTheme } from '@/utils/staff-colors';

interface SetPinPadProps {
  staff: { id: number; name: string; role: string; color_hex?: string; avatar_photo_id?: number | null };
  /** Submit handler. Resolve/reject controls error display + re-entry. */
  onSubmit: (pin: string) => Promise<{ ok: true } | { ok: false; error?: string }>;
  /** Tap to go back to the picker. */
  onBack?: () => void;
}

type Step = 'enter' | 'confirm';

export function SetPinPad({ staff, onSubmit, onBack }: SetPinPadProps) {
  const [step, setStep] = useState<Step>('enter');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const theme = getStaffTheme(staff);
  const t = THEME_NUMPAD[theme];

  const target = step === 'enter' ? pin : confirmPin;
  const setTarget = step === 'enter' ? setPin : setConfirmPin;

  const submitMatched = useCallback(async (entered: string, confirmed: string) => {
    if (entered !== confirmed) {
      setErr('PINs don\'t match. Try again.');
      setPin('');
      setConfirmPin('');
      setStep('enter');
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const r = await onSubmit(entered);
      if (!r.ok) {
        setErr(r.error || 'Could not set PIN.');
        setPin('');
        setConfirmPin('');
        setStep('enter');
      }
    } finally {
      setBusy(false);
    }
  }, [onSubmit]);

  const press = useCallback((digit: string) => {
    setErr(null);
    if (busy) return;
    setTarget((prev) => {
      if (prev.length >= 6) return prev;
      const next = prev + digit;
      if (step === 'enter') {
        // Auto-advance to confirm step once they hit 6 digits (max).
        if (next.length === 6) setTimeout(() => setStep('confirm'), 80);
      } else {
        // Auto-submit when confirm reaches the same length as the entered PIN
        // and is 4–6 digits.
        if (next.length === pin.length) {
          setTimeout(() => void submitMatched(pin, next), 80);
        }
      }
      return next;
    });
  }, [busy, setTarget, step, pin, submitMatched]);

  const backspace = useCallback(() => {
    setErr(null);
    setTarget((p) => p.slice(0, -1));
  }, [setTarget]);

  const advance = useCallback(() => {
    if (step === 'enter') {
      if (pin.length < 4) { setErr('Pick at least 4 digits.'); return; }
      setStep('confirm');
      setConfirmPin('');
      setErr(null);
    } else {
      void submitMatched(pin, confirmPin);
    }
  }, [step, pin, confirmPin, submitMatched]);

  const goBackStep = useCallback(() => {
    setErr(null);
    if (step === 'confirm') {
      setStep('enter');
      setConfirmPin('');
    }
  }, [step]);

  const advanceLabel = step === 'enter'
    ? (pin.length >= 4 ? 'Confirm' : `Pick ${4 - pin.length} more`)
    : (busy ? 'Saving…' : 'Save PIN');

  return (
    <div className="flex flex-col items-center">
      <PinPadStaffHeader staff={staff} theme={theme} onBack={onBack} />

      <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-scrim/95 px-3 py-1 text-role-micro font-semibold uppercase tracking-[0.18em] text-white">
        First-time setup
      </div>

      <div className="mt-3 text-sm text-text-soft">
        {step === 'enter' ? 'Pick a 4–6 digit PIN' : 'Re-enter the same PIN'}
      </div>

      <div className="mt-4 flex gap-3">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className={`h-3 w-3 rounded-full transition-all duration-200 ${
              i < target.length ? `${t.dotActive} scale-110` : 'bg-surface-strong scale-100'
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
        {step === 'confirm' ? (
          <PinPadKey
            value=""
            disabled={busy}
            onClick={goBackStep}
            theme={theme}
            ariaLabel="Back to enter step"
            icon={(
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 18l-6-6 6-6" />
              </svg>
            )}
          />
        ) : (
          <span aria-hidden />
        )}
        <PinPadKey value="0" disabled={busy} onClick={() => press('0')} theme={theme} />
        <PinPadKey
          value=""
          disabled={busy || target.length === 0}
          onClick={backspace}
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
        disabled={busy || target.length < 4 || (step === 'confirm' && target.length !== pin.length)}
        onClick={advance}
        className={`mt-6 inline-flex h-12 w-72 items-center justify-center rounded-2xl ${t.primaryBg} ${t.primaryHover} text-base font-semibold text-white shadow-lg shadow-gray-900/15 transition-all hover:shadow-xl hover:shadow-gray-900/20 disabled:cursor-not-allowed disabled:opacity-50`}
      >
        {advanceLabel}
      </button>

      <p className="mt-4 max-w-xs text-center text-role-caption leading-relaxed text-text-faint">
        Your PIN is hashed with scrypt before being saved. You can change it later from Settings.
      </p>
    </div>
  );
}
