'use client';

/**
 * ReceiveFeedbackTester — the bench control for refining the welded receive
 * panel.
 *
 * It is INLINE, in the dock float column, directly above the panel it drives —
 * not a popover, not a dialog, not a Displays leaf. A popover would cover the
 * thing under test and close on the first click outside it, which is exactly
 * the interaction you need while comparing two states. Sitting in the stack
 * means the tester, the panel and the composer are all on screen at once and
 * the panel's peel is measured against the real composer edge.
 *
 * It drives the region through its REAL props ({@link receiveFeedbackState}) —
 * no preview branch inside the panel — so what you are refining is the shipped
 * render path. A live receive always wins: the moment `c.receiving` or
 * `c.receiveResult` is set, the override is dropped (see `LineEditPanel`).
 *
 * MOUNTED IN DEVELOPMENT ONLY. The ⓘ in the composer's top-right corner opens
 * this instead of the status-history route while `NODE_ENV !== 'production'`;
 * on a production build that button goes back to Displays → Timeline
 * untouched. The tester keeps a Timeline button of its own so the route it
 * displaces is still one click away.
 */

import { X } from '@/components/Icons';
import { Button } from '@/design-system/primitives';
import { cn } from '@/utils/_cn';
import {
  INLINE_ACTION_FEEDBACK_TONE,
  type InlineActionFeedbackTone,
} from './inline-action-feedback-tone';
import { RECEIVE_FEEDBACK_SCENARIOS } from './receive-feedback-scenarios';

/** Tone swatch so a row reads as the state it will produce before you click. */
function ToneDot({ tone }: { tone: InlineActionFeedbackTone }) {
  return (
    <span
      className={cn('h-2 w-2 shrink-0 rounded-full', INLINE_ACTION_FEEDBACK_TONE[tone].bar)}
      aria-hidden
    />
  );
}

export function ReceiveFeedbackTester({
  activeId,
  onPick,
  onClear,
  onClose,
  onOpenStatusHistory,
}: {
  /** Scenario currently overriding the region, if any. */
  activeId: string | null;
  onPick: (id: string) => void;
  onClear: () => void;
  onClose: () => void;
  /**
   * The route the ⓘ normally takes. Kept here so opening the tester does not
   * cost the operator access to the timeline.
   */
  onOpenStatusHistory?: () => void;
}) {
  const active = RECEIVE_FEEDBACK_SCENARIOS.find((s) => s.id === activeId) ?? null;

  return (
    <div
      className="mb-1 rounded-lg border border-dashed border-border-soft bg-surface-sunken px-2.5 py-2"
      data-testid="receive-feedback-tester"
    >
      <div className="flex items-center gap-2">
        <p className="min-w-0 flex-1 truncate text-role-eyebrow font-semibold uppercase tracking-widest text-text-faint">
          Receive panel · dev tester
        </p>
        {onOpenStatusHistory ? (
          <Button variant="ghost" size="sm" onClick={onOpenStatusHistory}>
            Timeline
          </Button>
        ) : null}
        <Button variant="ghost" size="sm" onClick={onClear} disabled={activeId == null}>
          Clear
        </Button>
        <Button
          variant="ghost"
          size="sm"
          iconOnly
          ariaLabel="Close tester"
          icon={<X className="h-3 w-3" />}
          onClick={onClose}
        >
          Close
        </Button>
      </div>

      {/* Wraps rather than scrolls: on a station tablet a horizontal scroller
          hides half the states behind a gesture nobody discovers. */}
      <div className="mt-1.5 flex flex-wrap gap-1">
        {RECEIVE_FEEDBACK_SCENARIOS.map((s) => {
          const on = s.id === activeId;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => onPick(s.id)}
              aria-pressed={on}
              className={cn(
                'ds-raw-button inline-flex items-center gap-1.5 rounded border px-1.5 py-1 text-role-micro font-semibold transition',
                on
                  ? 'border-blue-300 bg-blue-50 text-blue-900'
                  : 'border-border-soft bg-surface-card text-text-muted hover:bg-surface-canvas hover:text-text-default',
              )}
            >
              <ToneDot tone={s.expect} />
              {s.label}
            </button>
          );
        })}
      </div>

      {active ? (
        <p className="mt-1.5 text-role-micro font-medium leading-snug text-text-muted">
          {active.hint}
        </p>
      ) : (
        <p className="mt-1.5 text-role-micro font-medium leading-snug text-text-faint">
          Pick a state to drive the panel below. A real receive overrides any
          selection.
        </p>
      )}
    </div>
  );
}
