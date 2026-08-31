'use client';

/**
 * Sign-in credential fields.
 *
 * Both text entries stay on screen — email is always visible, and the password
 * field renders in beneath it once the user continues. There is no panel swap
 * and no back chip: the email is right there to edit, so nothing needs to travel
 * or be restored.
 *
 * The reveal is a plain conditional render — no motion import. This component
 * sits on `/signin`'s critical JS graph (the one public route), and the motion
 * barrel statically carries the whole engine; evicting it here is part of what
 * emptied ~48KB gz out of that graph (2026-08-28). The old framer reveal also
 * tweened `height: auto`, which the house motion law bans outright (a reflow
 * per frame) — showing the field at once is both the fast and the legal shape.
 */

import { useEffect, useRef, useState } from 'react';
// Deep path, not the barrel — see the note in `src/app/signin/page.tsx`.
import { TextField } from '@/design-system/primitives/TextField';

export interface SignInAuthStepPanelsProps {
  authStep: 'email' | 'password';
  email: string;
  password: string;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
}

export function SignInAuthStepPanels({
  authStep,
  email,
  password,
  onEmailChange,
  onPasswordChange,
}: SignInAuthStepPanelsProps) {
  const passwordRef = useRef<HTMLInputElement>(null);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (authStep !== 'password') {
      setShowPassword(false);
      return;
    }
    // The field is present the frame this flips, so focus lands immediately.
    passwordRef.current?.focus();
  }, [authStep]);

  return (
    <div className="space-y-3">
      <TextField
        id="email"
        name="email"
        label="Email"
        type="email"
        autoComplete="email"
        autoFocus
        value={email}
        onChange={onEmailChange}
      />

      {authStep === 'password' && (
        <div key="password-field" className="space-y-1.5">
          <TextField
            ref={passwordRef}
            id="password"
            name="password"
            label="Password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            value={password}
            onChange={onPasswordChange}
            trailing={
              <button
                type="button"
                // Keep focus in the input so toggling never breaks the flow.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setShowPassword((v) => !v)}
                aria-pressed={showPassword}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-text-soft transition hover:bg-surface-canvas hover:text-text-default"
              >
                {showPassword ? (
                  <svg
                    className="h-4 w-4"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  >
                    <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
                    <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
                    <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
                    <line x1="2" y1="2" x2="22" y2="22" />
                  </svg>
                ) : (
                  <svg
                    className="h-4 w-4"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  >
                    <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            }
          />
          <div className="flex justify-end">
            <a
              href="/signin/reset"
              className="text-role-caption font-semibold text-blue-600 hover:text-blue-700"
            >
              Forgot password?
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
