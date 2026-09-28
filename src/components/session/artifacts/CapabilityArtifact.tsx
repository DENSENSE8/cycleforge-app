'use client';

/**
 * The capability card (SIMPLE-FIRST) — what the org can switch on from chat.
 * Inline, triage face, one block per capability: its state, what it adds,
 * and the "Still needed" checklist.
 *
 * Every action is a request, never a write from here:
 *  - a Still needed step with `href` opens it (the eBay OAuth start opens in
 *    its own window, beside the chat);
 *  - a step with `prompt`, and "Turn it on", send a chat turn — the chat
 *    proposes and waits for the operator's yes (confirm-before-write);
 *  - a proposal's "Yes, turn it on" is that yes.
 *
 * A card that reports a change repaints the sidebar on arrival (the same
 * invalidation the realtime event triggers in other tabs).
 */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { Check, ExternalLink, Lock, Send, Sparkles } from '@/components/Icons';
import { Button } from '@/design-system/primitives';
import { requestComposerSeed } from '@/lib/assistant/composer-seed-store';
import type { ArtifactCapability } from '@/lib/assistant/ui-artifacts';
import { invalidateCapabilityQueries } from '@/hooks/useOrgCapabilities';
import { cn } from '@/utils/_cn';

const STATE_FACE: Record<ArtifactCapability['items'][number]['state'], { label: string; tone: string }> = {
  active: { label: 'Active', tone: 'bg-surface-success text-text-success' },
  setting_up: { label: 'Setting up', tone: 'bg-surface-warning text-text-warning' },
  suggested: { label: 'Suggested', tone: 'bg-ai-sunken text-ai-muted' },
  locked: { label: 'Not on yet', tone: 'bg-ai-sunken text-ai-faint' },
};

export function CapabilityArtifact({ artifact }: { artifact: ArtifactCapability }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const changed = artifact.mode === 'result';

  useEffect(() => {
    if (changed) invalidateCapabilityQueries(queryClient);
  }, [changed, queryClient]);

  return (
    <div className="flex min-w-0 flex-col divide-y divide-ai-line text-ai-prose-sm text-ai-ink" data-capability-card={artifact.mode}>
      {artifact.items.map((item) => {
        const face = STATE_FACE[item.state];
        return (
          <section key={item.id} className="flex min-w-0 flex-col gap-2 px-3 py-3" data-capability={item.id} data-capability-state={item.state}>
            <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <span className="font-semibold">{item.label}</span>
              <span className={cn('inline-flex items-center gap-1 rounded-ai-control px-1.5 py-px text-ai-label font-medium', face.tone)}>
                {item.state === 'active' ? <Check className="h-3 w-3" aria-hidden /> : item.state === 'locked' ? <Lock className="h-3 w-3" aria-hidden /> : null}
                {face.label}
              </span>
            </div>
            {item.blurb ? <p className="text-ai-muted">{item.blurb}</p> : null}

            {item.unlocks.length > 0 ? (
              <div className="flex flex-wrap items-center gap-1.5" data-capability-unlocks>
                <span className="text-ai-label text-ai-faint">What you get</span>
                {item.unlocks.map((u) => (
                  <span key={u} className="inline-flex items-center rounded-ai-control border border-ai-line bg-ai-sunken px-1.5 py-px text-ai-label text-ai-muted">
                    {u}
                  </span>
                ))}
              </div>
            ) : null}

            {item.stillNeeded.length > 0 ? (
              <div className="flex flex-col gap-1.5 rounded-ai-card bg-ai-sunken px-3 py-2" data-capability-needed>
                <span className="text-ai-label font-medium text-text-warning">Still needed</span>
                <div className="flex flex-wrap gap-1.5">
                  {item.stillNeeded.map((step) => (
                    <Button
                      key={step.label}
                      type="button"
                      variant="secondary"
                      size="sm"
                      radius="pill"
                      icon={step.href ? <ExternalLink className="h-3.5 w-3.5" /> : undefined}
                      onClick={() => {
                        if (step.href?.startsWith('/api/')) {
                          // An OAuth start: the provider's consent screen opens beside the chat.
                          window.open(step.href, `cf-connect-${item.id}`, 'width=560,height=720');
                        } else if (step.href) {
                          router.push(step.href);
                        } else if (step.prompt) {
                          requestComposerSeed({ text: step.prompt, autoSend: true });
                        }
                      }}
                      data-capability-step
                    >
                      {step.label}
                    </Button>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="flex flex-wrap items-center justify-end gap-2">
              {artifact.mode === 'proposal' ? (
                <>
                  <Button type="button" variant="secondary" size="sm" onClick={() => requestComposerSeed({ text: 'no', autoSend: true })}>
                    Not now
                  </Button>
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    icon={<Send className="h-3.5 w-3.5" />}
                    onClick={() => requestComposerSeed({ text: 'yes', autoSend: true })}
                    data-capability-confirm
                  >
                    Yes, turn it on
                  </Button>
                </>
              ) : item.state === 'locked' || item.state === 'suggested' ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  icon={<Sparkles className="h-3.5 w-3.5" />}
                  onClick={() => requestComposerSeed({ text: `Turn on ${item.label}`, autoSend: true })}
                  data-capability-enable
                >
                  Turn it on
                </Button>
              ) : item.state === 'active' && item.href ? (
                <Button type="button" variant="primary" size="sm" onClick={() => router.push(item.href as string)} data-capability-open>
                  Open {item.label}
                </Button>
              ) : null}
            </div>
          </section>
        );
      })}
      {artifact.note ? <p className="px-3 py-2 text-ai-label text-ai-faint">{artifact.note}</p> : null}
    </div>
  );
}
