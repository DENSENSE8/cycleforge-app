'use client';

/**
 * Global Ask door — one circle, every route.
 *
 * Closed: primary Sparkles circle, bottom-right (thumb + safe-area).
 * Open: the same circle stays in that corner (X); the assistant stack grows
 * up and left from it. Not a RightRailHost occupant. Floor scan mouths stay
 * on {@link StationComposerHost} at the bench.
 *
 * Plan: docs/warehouse-os/PLAN-floating-assistant-composer.md
 */

import type { ReactNode } from 'react';
import { Sparkles, X } from '@/components/Icons';
import { Button, IconButton } from '@/design-system/primitives';
import { Layer } from '@/design-system/primitives/Layer';
import { BUTTON_VARIANTS } from '@/design-system/primitives/button-variants';
import { COMPOSER_SHELL_CORNER } from '@/design-system/tokens/radius';
import { elevationClass } from '@/design-system/tokens/shadows';
import { cn } from '@/utils/_cn';

export function AssistantFabHost({
  open,
  onToggle,
  onClose,
  children,
}: {
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <Layer
      level={open ? 'panel' : 'fab'}
      className="pointer-events-none fixed inset-0 print:hidden"
      data-testid="assistant-fab-layer"
    >
      {open ? (
        <Button
          type="button"
          variant="ghost"
          ariaLabel="Dismiss assistant"
          className="pointer-events-auto absolute inset-0 h-auto w-auto rounded-none bg-scrim/40 hover:bg-scrim/40"
          onClick={onClose}
        />
      ) : null}
      <div
        className="pointer-events-none absolute bottom-[max(1rem,env(safe-area-inset-bottom))] right-[max(1rem,env(safe-area-inset-right))] flex flex-col items-end gap-2"
      >
        {open ? (
          <div
            className={cn(
              'pointer-events-auto flex max-h-[min(75dvh,36rem)] w-[min(calc(100vw-1.5rem),28rem)] flex-col bg-surface-card',
              COMPOSER_SHELL_CORNER,
              elevationClass('overlay'),
            )}
            data-testid="assistant-fab-panel"
          >
            {children}
          </div>
        ) : null}
        <IconButton
          type="button"
          size="touch"
          radius="pill"
          ariaLabel={open ? 'Close assistant' : 'Open assistant'}
          aria-expanded={open}
          aria-keyshortcuts="Meta+J"
          data-testid="assistant-fab"
          className={cn('pointer-events-auto', BUTTON_VARIANTS.primary)}
          icon={
            open ? (
              <X className="h-5 w-5" />
            ) : (
              <Sparkles className="h-5 w-5" />
            )
          }
          onClick={onToggle}
        />
      </div>
    </Layer>
  );
}
