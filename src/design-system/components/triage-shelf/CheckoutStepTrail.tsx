'use client';

/**
 * The new-order trail — Customer › Products › Team › Order › Shipping ›
 * Payment — ONE face for the desk (`/orders/new`) and the phone
 * (`/m/orders/new`). One step on screen at a time; every crumb is a way back
 * (or forward) to its step, a finished one wears a check, the current one the
 * sunken wash. Each crumb's number is its key on the desk: `1`–`6` outside a
 * text field (`crumbFromKey`). The trail scrolls sideways and keeps the
 * current crumb in view. `touch` lifts each crumb to the phone's hit height.
 */

import { Fragment, useEffect, useRef } from 'react';
import { Check, ChevronRight } from '@/components/Icons';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { CHECKOUT_STEPS, type CheckoutStepId } from '@/lib/orders/intake/checkout-model';
import { cn } from '@/utils/_cn';

export function CheckoutStepTrail({
  current,
  done,
  onGo,
  touch = false,
  testIdPrefix,
  className,
}: {
  current: CheckoutStepId;
  done: Readonly<Record<CheckoutStepId, boolean>>;
  onGo: (step: CheckoutStepId) => void;
  /** Phone: crumbs at the region's touch height. */
  touch?: boolean;
  /** Each crumb gets `${testIdPrefix}${step.id}`. */
  testIdPrefix: string;
  className?: string;
}) {
  const currentRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    currentRef.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [current]);

  return (
    <nav
      aria-label="Order steps"
      className={cn('overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden', className)}
      data-testid={`${testIdPrefix}trail`}
    >
      <ol className="flex min-w-max items-center gap-0.5 px-1 py-0.5">
        {CHECKOUT_STEPS.map((step, index) => {
          const here = step.id === current;
          return (
            <Fragment key={step.id}>
              {index > 0 ? <ChevronRight className="size-3.5 shrink-0 text-mode-muted" aria-hidden /> : null}
              <li>
                {/* ds-raw-button: breadcrumb text link — a Button would add fill and height to the trail */}
                <button
                  ref={here ? currentRef : undefined}
                  type="button"
                  aria-current={here ? 'step' : undefined}
                  onClick={() => onGo(step.id)}
                  aria-keyshortcuts={touch ? undefined : String(index + 1)}
                  title={`${step.title} · ${index + 1}`}
                  data-testid={`${testIdPrefix}${step.id}`}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-mode-control px-2 text-role-caption font-medium transition-colors',
                    touch ? 'min-h-mode-hit' : 'h-8',
                    here ? 'bg-mode-well text-mode-ink' : 'text-mode-muted hover:text-mode-ink',
                    focusRing('control'),
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      'flex size-5 items-center justify-center rounded-mode-pill text-role-micro font-semibold tabular-nums',
                      done[step.id] ? 'bg-surface-success text-text-success' : here ? 'bg-mode-panel text-mode-ink' : 'bg-mode-well text-mode-muted',
                    )}
                  >
                    {done[step.id] ? <Check className="size-3" /> : index + 1}
                  </span>
                  {step.title}
                  {done[step.id] ? <span className="sr-only"> (done)</span> : null}
                </button>
              </li>
            </Fragment>
          );
        })}
      </ol>
    </nav>
  );
}
