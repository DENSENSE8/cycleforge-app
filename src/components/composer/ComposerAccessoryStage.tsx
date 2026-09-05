'use client';

/**
 * Claim accessory plate — {@link WeldedFeedbackPanel} with disclose=always.
 * Staff reaction SoT; do not add chrome here.
 */

import type { ReactNode } from 'react';
import {
  WeldedFeedbackPanel,
  type WeldedFeedbackCta,
} from '@/components/composer/WeldedFeedbackPanel';
import type { InlineActionFeedbackTone } from './inline-action-feedback-tone';

export function ComposerAccessoryStage({
  caption,
  children,
  cycling = false,
  leading,
  onDismiss,
  tone = 'context',
  cta,
}: {
  caption: string;
  children: ReactNode;
  cycling?: boolean;
  leading?: ReactNode;
  onDismiss?: () => void;
  /** Degraded AI draft uses `warning`; claim/seller stay `context`. */
  tone?: InlineActionFeedbackTone;
  /** Top-right verb on the hinge — Create ticket for claim. */
  cta?: WeldedFeedbackCta;
}) {
  return (
    <WeldedFeedbackPanel
      tone={tone}
      steps={[caption]}
      cycling={cycling}
      leading={leading}
      cta={cta}
      disclose="always"
      onDismiss={onDismiss}
    >
      {children}
    </WeldedFeedbackPanel>
  );
}
