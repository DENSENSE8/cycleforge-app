'use client';

/**
 * Sign-in credential fields.
 *
 * Both text entries stay on screen — email is always visible, and the password
 * field animates in beneath it once the user continues. There is no panel swap
 * and no back chip: the email is right there to edit, so nothing needs to travel
 * or be restored.
 *
 * The reveal animates `height: auto` via `framerPresence.collapseHeight`, which
 * is the one sanctioned height animation in the house motion law — a
 * low-frequency expand/collapse, not a per-interaction transition
 * (`.claude/rules/display/motion-crossfade.md`).
 */

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  framerDuration,
  framerPresence,
  framerTransition,
} from '@/design-system/foundations/motion-framer';
import { useMotionPresence, useMotionTransition } from '@/design-system/foundations/motion-framer-hooks';
import { TextField } from '@/design-system/primitives';
import { cn } from '@/utils/_cn';

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
  // TextField's focus affordance is an OUTWARD `focus:ring-2`, so the clip that
  // the height animation requires would cut the glow off. Clip only while the
  // row is opening, then release to `overflow-visible` once it settles.
  const [revealSettled, setRevealSettled] = useState(false);
  const reduceMotion = useReducedMotion();
  const revealPresence = useMotionPresence(framerPresence.collapseHeight);
  const revealTransition = useMotionTransition(framerTransition.signInStepSlide);

  useEffect(() => {
    if (authStep !== 'password') {
      setShowPassword(false);
      setRevealSettled(false);
      return;
    }
    // Focus once the row has finished opening, so the caret doesn't ride the reveal.
    const delayMs = reduceMotion ? 0 : Math.round(framerDuration.signInStepSlide * 1000);
    const t = window.setTimeout(() => passwordRef.current?.focus(), delayMs);
    return () => window.clearTimeout(t);
  }, [authStep, reduceMotion]);

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
        tone="blue"
      />

      <AnimatePresence initial={false}>
        {authStep === 'password' && (
          <motion.div
            key="password-field"
            initial={revealPresence.initial}
            animate={revealPresence.animate}
            exit={revealPresence.exit}
            transition={revealTransition}
            onAnimationComplete={() => setRevealSettled(true)}
            // `px-1 -mx-1` keeps the horizontal glow off the clip edge while the
            // row is still opening; once settled the clip is dropped entirely so
            // the focus ring renders in full.
            className={cn('px-1 -mx-1', revealSettled ? 'overflow-visible' : 'overflow-hidden')}
          >
            <div className="space-y-1.5">
              <TextField
                ref={passwordRef}
                id="password"
                name="password"
                label="Password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={onPasswordChange}
                tone="blue"
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
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
