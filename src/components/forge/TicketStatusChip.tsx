'use client';

/**
 * <TicketStatus /> as rendered on /forge (ALP-3.3).
 *
 * Semantic 3-layer chip per status; a one-shot motion pulse (opacity+transform
 * only, through the reduced-motion hooks) fires when a ticket transitions to
 * `deployed` live. Out-of-enum statuses render as a loud INVALID chip — the
 * contract says reject, never coerce.
 */

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { useMotionTransition } from '@/design-system/foundations/motion-framer-hooks';
import { motionBezier } from '@/design-system/foundations/motion-framer';
import type { TicketStatus } from '@/lib/master-plan/ticket-status';

const STATUS_TONE: Record<TicketStatus, string> = {
  pending: 'bg-amber-50 text-amber-700 ring-amber-200',
  'in-progress': 'bg-blue-50 text-blue-700 ring-blue-200',
  deployed: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
};

const STATUS_DOT: Record<TicketStatus, string> = {
  pending: 'bg-amber-500',
  'in-progress': 'bg-blue-500',
  deployed: 'bg-emerald-500',
};

export interface TicketStatusChipProps {
  ticketId: string;
  status: TicketStatus | null;
  rawStatus?: string;
  href?: string;
  resolutionCommit?: string;
}

export function TicketStatusChip({ ticketId, status, rawStatus, href, resolutionCommit }: TicketStatusChipProps) {
  const prevStatus = useRef<TicketStatus | null>(status);
  const [justDeployed, setJustDeployed] = useState(false);
  const pulseTransition = useMotionTransition({ duration: 1.1, ease: motionBezier.easeOut });

  useEffect(() => {
    if (status === 'deployed' && prevStatus.current !== 'deployed' && prevStatus.current !== null) {
      setJustDeployed(true);
      const t = setTimeout(() => setJustDeployed(false), 1400);
      return () => clearTimeout(t);
    }
    prevStatus.current = status;
    return undefined;
  }, [status]);
  useEffect(() => {
    prevStatus.current = status;
  }, [status]);

  const tooltip = [
    status ? `Status: ${status}` : `Invalid status "${rawStatus ?? ''}" — allowed: pending · in-progress · deployed`,
    href ? `Plan doc: ${href}` : null,
    resolutionCommit ? `Resolved in ${resolutionCommit}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const tone = status ? STATUS_TONE[status] : 'bg-rose-50 text-rose-700 ring-rose-200';
  const dot = status ? STATUS_DOT[status] : 'bg-rose-500';

  return (
    <HoverTooltip label={tooltip} focusable={false}>
      <span className="relative my-0.5 inline-flex items-center gap-1.5 align-middle">
        <AnimatePresence>
          {justDeployed && (
            <motion.span
              key="deploy-pulse"
              className="absolute inset-0 rounded ring-2 ring-emerald-400"
              initial={{ opacity: 0.9, scale: 1 }}
              animate={{ opacity: 0, scale: 1.35 }}
              exit={{ opacity: 0 }}
              transition={pulseTransition}
            />
          )}
        </AnimatePresence>
        <span
          className={`inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 text-role-micro uppercase tracking-widest ring-1 ring-inset ${tone}`}
        >
          <span className={`h-2 w-2 rounded-full ${dot}`} />
          {ticketId}
          <span className="font-bold normal-case tracking-normal">{status ?? 'invalid'}</span>
          {resolutionCommit && status === 'deployed' && (
            <span className="font-mono font-semibold normal-case tracking-normal">{resolutionCommit.slice(0, 7)}</span>
          )}
        </span>
      </span>
    </HoverTooltip>
  );
}
