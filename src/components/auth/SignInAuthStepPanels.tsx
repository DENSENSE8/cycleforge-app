'use client';

/** Sign-in credential fields — email AND password, together, one step. */

import { useState } from 'react';
// Deep path, not the barrel — see the note in `src/app/signin/page.tsx`.
import { TextField } from '@/design-system/primitives/TextField';

interface SignInAuthStepPanelsProps {
  email: string;
  password: string;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  /** Back control on the left of the bottom row: returns to the method list. */
  onAllOptions?: () => void;
}

export function SignInAuthStepPanels({
  email,
  password,
  onEmailChange,
  onPasswordChange,
  onAllOptions,
}: SignInAuthStepPanelsProps) {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className="space-y-3">
      <TextField
        id="email"
        name="username"
        label="Email"
        type="email"
        inputMode="email"
        autoComplete="username webauthn"
        autoCapitalize="none"
        spellCheck={false}
        enterKeyHint="next"
        autoFocus
        appearance="auth"
        value={email}
        onChange={onEmailChange}
      />

      <div className="space-y-1.5">
        <TextField
          id="password"
          name="password"
          label="Password"
          type={showPassword ? 'text' : 'password'}
          autoComplete="current-password"
          autoCapitalize="none"
          spellCheck={false}
          enterKeyHint="go"
          appearance="auth"
          value={password}
          onChange={onPasswordChange}
          trailing={
            <button
              type="button"
              // Keep focus in the input so toggling never breaks the flow.
              onPointerDown={(e) => e.preventDefault()}
              onClick={() => setShowPassword((v) => !v)}
              aria-pressed={showPassword}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-text-soft transition hover:bg-blue-50 hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30"
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
        <div className="flex items-center justify-between gap-2">
          {onAllOptions ? (
            <button
              type="button"
              onClick={onAllOptions}
              // ds-raw-button: tertiary back control - the page TextLink's
              // quiet shape, never a second blue action in this row.
              className="inline-flex items-center gap-1 rounded text-left text-role-caption font-semibold text-text-soft transition-colors hover:text-text-default"
            >
              <svg
                className="h-3.5 w-3.5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M15 18l-6-6 6-6" />
              </svg>
              All sign-in options
            </button>
          ) : (
            <span aria-hidden />
          )}
          <a
            href="/signin/reset"
            className="text-role-caption font-semibold text-blue-600 hover:text-blue-700"
          >
            Forgot password?
          </a>
        </div>
      </div>
    </div>
  );
}
