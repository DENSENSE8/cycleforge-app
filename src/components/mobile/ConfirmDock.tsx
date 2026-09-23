'use client';

/**
 * ConfirmDock — the 96px bottom action dock for mobile task screens.
 *
 *   ┌───────────────────────────────────────────┐
 *   │           [ Primary action ]              │  56–64px tall button
 *   │            secondary text-link            │  optional, 32px tall
 *   └───────────────────────────────────────────┘
 *
 * Mounted by the route as a flex sibling that anchors to the viewport bottom
 * (see `app/m/(shell)/pick/[orderId]/page.tsx`). Caller is responsible for
 * choosing the dock variant ('inset' for a separated white strip, 'overlay'
 * when content scrolls beneath).
 *
 * Loading state shows a centered spinner inside the button and disables both
 * actions. Tone presets keep the brand palette consistent across screens.
 */

import { Button } from '@/design-system/primitives';

export type ConfirmDockTone = 'primary' | 'success' | 'warning' | 'neutral';

interface ConfirmDockProps {
  /** Primary action label, e.g. "Confirm Pick". */
  label: string;
  /** Called on primary press. Fire-and-forget — caller manages async state via `loading`. */
  onConfirm: () => void;
  /** Disable both actions (e.g., not enough info to confirm). */
  disabled?: boolean;
  /** Spinner + locked while a network call is in flight. */
  loading?: boolean;
  /** Primary button color family. Default `primary` (blue). */
  tone?: ConfirmDockTone;
  /** Optional secondary action shown below the primary as a text link. */
  secondary?: {
    label: string;
    onPress: () => void;
    /** Make the secondary visually destructive (red text). */
    destructive?: boolean;
  };
}

const TONE_VARIANT: Record<ConfirmDockTone, 'primary' | 'success' | 'warning' | 'secondary'> = {
  primary: 'primary',
  success: 'success',
  warning: 'warning',
  neutral: 'secondary',
};

export function ConfirmDock({
  label,
  onConfirm,
  disabled = false,
  loading = false,
  tone = 'primary',
  secondary,
}: ConfirmDockProps) {
  const blocked = disabled || loading;

  const handlePrimary = () => {
    if (blocked) return;
    onConfirm();
  };

  const handleSecondary = () => {
    if (loading || !secondary) return;
    secondary.onPress();
  };

  return (
    <div
      className="border-t border-border-hairline bg-surface-card px-4 pt-3"
      style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom, 0px))' }}
    >
      <Button
        type="button"
        variant={TONE_VARIANT[tone]}
        radius="flush"
        size="lg"
        onClick={handlePrimary}
        disabled={blocked}
        loading={loading}
        className="w-full text-sm tracking-wide"
      >
        {label}
      </Button>
      {secondary && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          radius="flush"
          onClick={handleSecondary}
          disabled={loading}
          className={`mt-2 h-8 w-full text-xs ${
            secondary.destructive ? 'text-text-danger' : 'text-text-soft'
          }`}
        >
          {secondary.label}
        </Button>
      )}
    </div>
  );
}
