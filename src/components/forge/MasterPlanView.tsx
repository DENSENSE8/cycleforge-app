'use client';

/** Live master-plan Monitor region (ALP-3.1/3.2) — read-only render of the shared MDX. */

import { useEffect, useMemo, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { parseMasterPlanSegments } from '@/lib/master-plan/segments';
import { TicketStatusChip } from './TicketStatusChip';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { cn } from '@/utils/_cn';

const MD_COMPONENTS: React.ComponentProps<typeof ReactMarkdown>['components'] = {
  h1: (props) => <h2 className="text-base font-semibold text-text-default" {...props} />,
  h2: (props) => (
    <h3 className="mt-4 text-role-eyebrow uppercase tracking-[0.18em] text-text-faint" {...props} />
  ),
  h3: (props) => <h4 className="mt-3 text-role-caption font-semibold text-text-default" {...props} />,
  p: (props) => <p className="text-role-caption leading-relaxed text-text-muted" {...props} />,
  li: (props) => <li className="text-role-caption leading-relaxed text-text-muted" {...props} />,
  ul: (props) => <ul className="list-disc space-y-1 pl-5" {...props} />,
  ol: (props) => <ol className="list-decimal space-y-1 pl-5" {...props} />,
  a: (props) => <a className="text-text-accent underline decoration-border-default underline-offset-2" {...props} />,
  code: (props) => (
    <code className="rounded bg-surface-sunken px-1 py-0.5 font-mono text-role-micro text-text-default" {...props} />
  ),
  hr: () => <hr className="my-4 border-border-hairline" />,
  strong: (props) => <strong className="font-semibold text-text-default" {...props} />,
};

function AgentLogChip({ runUid, stage }: { runUid: string; stage?: string }) {
  return (
    <HoverTooltip label={`Forge run ${runUid}${stage ? ` — ${stage} stage` : ''}`} focusable={false}>
      <span className="my-0.5 inline-flex items-center gap-1.5 rounded bg-surface-sunken px-1.5 py-0.5 text-role-micro uppercase tracking-widest text-text-muted ring-1 ring-inset ring-border-soft">
        <span className="h-2 w-2 rounded-full bg-blue-500" />
        run {runUid.slice(0, 18)}
        {stage && <span className="font-semibold normal-case tracking-normal">{stage}</span>}
      </span>
    </HoverTooltip>
  );
}

export function MasterPlanView({
  mdx,
  highlightTicketId,
}: {
  mdx: string;
  /** Scrolls the matching ticket chip into view and rings it. */
  highlightTicketId?: string | null;
}) {
  const segments = useMemo(() => parseMasterPlanSegments(mdx), [mdx]);
  const highlightRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!highlightTicketId || !highlightRef.current) return;
    highlightRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [highlightTicketId, segments]);

  if (segments.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border-default bg-surface-sunken px-4 py-6 text-center text-role-caption text-text-muted">
        The master plan is empty. Seed it by saving <code className="font-mono">master-plan.mdx</code> with the sync
        daemon running.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {segments.map((seg, i) => {
        if (seg.kind === 'markdown') {
          return (
            <div key={`md-${i}`} className="space-y-2">
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD_COMPONENTS}>
                {seg.text}
              </ReactMarkdown>
            </div>
          );
        }
        if (seg.kind === 'ticket') {
          const highlighted = highlightTicketId === seg.ticketId;
          return (
            <div
              key={`ticket-${seg.ticketId}-${i}`}
              ref={highlighted ? highlightRef : undefined}
              data-ticket-id={seg.ticketId}
              className={cn(
                'rounded-md transition-shadow',
                highlighted && 'ring-2 ring-border-focus ring-offset-2 ring-offset-surface-card',
              )}
            >
              <TicketStatusChip
                ticketId={seg.ticketId}
                status={seg.status}
                rawStatus={seg.rawStatus}
                href={seg.href}
                resolutionCommit={seg.resolutionCommit}
              />
            </div>
          );
        }
        return (
          <div key={`log-${seg.runUid}-${i}`}>
            <AgentLogChip runUid={seg.runUid} stage={seg.stage} />
          </div>
        );
      })}
    </div>
  );
}
