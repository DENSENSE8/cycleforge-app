'use client';

/**
 * Carton-bar action faces — geometry by construction.
 *
 * Listing / overflow / claim on the one-row strip go through these cells.
 * Height is `h-full` on the chrome class. Callers cannot pass `className`
 * or swap in IconButton. Photos stay on ReceivingPhotoButton appearance=chrome.
 */
import type { ReactNode } from 'react';
import { Ticket } from '@/components/Icons';
import { Button } from '@/design-system/primitives';
import { STATION_CHROME_GLYPH_CLASS } from './station-identity-chrome';
import {
  STATION_CONTEXT_ACTION_CELL_CLASS,
  STATION_CONTEXT_CLAIM_CHROME_CLASS,
} from './station-context-action-pill';

export function StationContextIconCell({
  ariaLabel,
  disabled,
  onClick,
  testId,
  children,
}: {
  ariaLabel: string;
  disabled?: boolean;
  onClick?: () => void;
  testId: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={onClick}
      className={STATION_CONTEXT_ACTION_CELL_CLASS}
      data-testid={testId}
    >
      {children}
    </button>
  );
}

export function StationContextClaimCell({
  active,
  onClick,
}: {
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={onClick}
      ariaLabel={active ? 'Hide claim' : 'File claim'}
      aria-pressed={active}
      icon={<Ticket className={STATION_CHROME_GLYPH_CLASS} />}
      className={STATION_CONTEXT_CLAIM_CHROME_CLASS}
      data-testid="carton-context-claim"
    >
      claim
    </Button>
  );
}
