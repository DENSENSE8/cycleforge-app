'use client';

import type { ComponentPropsWithoutRef } from 'react';
import { LayoutGroup } from '@/design-system/motion';
import { cn } from '@/utils/_cn';
import { AI_SURFACE_CLASS } from './classes';

/**
 * AiSurface — the root of an AI surface.
 *
 * Stamps `data-ai-surface` (the hook `aiSystemCssText()` uses to remap the
 * neutral `--ds-color-*` vars onto the AI palette, so shared primitives inside
 * adopt it) and opens ONE `LayoutGroup`, so the composer's centre → bottom move
 * and the column's re-centre beside the panel animate as one layout pass.
 */
export function AiSurface({ className, children, ...rest }: ComponentPropsWithoutRef<'div'>) {
  return (
    <div data-ai-surface className={cn(AI_SURFACE_CLASS, className)} {...rest}>
      <LayoutGroup id="ai-surface">{children}</LayoutGroup>
    </div>
  );
}
