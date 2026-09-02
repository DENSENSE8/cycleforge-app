'use client';

/**
 * Claim accessory plate — {@link WeldedFeedbackPanel} with disclose=always.
 * Staff reaction SoT; do not add chrome here.
 */

import type { ReactNode } from 'react';
import { WeldedFeedbackPanel } from '@/components/composer/WeldedFeedbackPanel';

export function ComposerAccessoryStage({
  caption,
  children,
  cycling = false,
  leading,
  onDismiss,
}: {
  caption: string;
  children: ReactNode;
  cycling?: boolean;
  leading?: ReactNode;
  onDismiss?: () => void;
}) {
  return (
    <WeldedFeedbackPanel
      tone="context"
      steps={[caption]}
      cycling={cycling}
      leading={leading}
      disclose="always"
      onDismiss={onDismiss}
    >
      {children}
    </WeldedFeedbackPanel>
  );
}
