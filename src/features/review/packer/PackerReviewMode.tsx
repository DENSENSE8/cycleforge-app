'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/design-system/primitives/Button';
import { Check, AlertTriangle, Loader2 } from '@/components/Icons';
import { toast } from '@/lib/toast';
import { cn } from '@/utils/_cn';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { formatDateTimePST } from '@/utils/date';
import { safeRandomUUID } from '@/lib/safe-uuid';
import { useScopedPackerPhotos } from '@/hooks/useScopedPackerPhotos';
import { OutcomeChip } from '@/features/review/OutcomeChip';
import type { PackReviewQueueRow } from '@/lib/packing/pack-review-queue-types';

async function submitDecision(args: {
  packerLogId: number;
  outcome: 'REVIEW_APPROVED' | 'REVIEW_FLAGGED';
  note?: string | null;
}): Promise<{ ok: boolean; status: number }> {
  const res = await fetch('/api/packing/verification/decide', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...args, clientEventId: safeRandomUUID() }),
  });
  return { ok: res.ok, status: res.status };
}

/**
 * Right pane for `/review?mode=packer` — one packed order's review detail
 * (plan §4c): identity + tracking, a live ERP cross-check badge, the slip/box
 * photo strip, and the Approve / Flag decision (a flag requires a note). The
 * decision persists append-only via /api/packing/verification/decide, then the
 * queue re-reads and the selection clears.
 */
export function PackerReviewMode({ row }: { row: PackReviewQueueRow }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const [note, setNote] = useState('');

  const tracking = (row.tracking || row.detectedTracking || '').trim();
  const { query: photosQuery } = useScopedPackerPhotos(row.packerLogId);
  const photos = photosQuery.data?.photos ?? [];

  const verifyQuery = useQuery({
    queryKey: ['orders-verify', tracking],
    enabled: tracking.length > 0,
    staleTime: 30_000,
    queryFn: async () => {
      const res = await fetch(`/api/orders/verify?tracking=${encodeURIComponent(tracking)}`, {
        cache: 'no-store',
      });
      if (!res.ok) return null;
      return (await res.json().catch(() => null)) as { found?: boolean; orderId?: string } | null;
    },
  });

  const clearSelection = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete('packerLogId');
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  };

  const decide = useMutation({
    mutationFn: (outcome: 'REVIEW_APPROVED' | 'REVIEW_FLAGGED') =>
      submitDecision({ packerLogId: row.packerLogId, outcome, note: note.trim() || null }),
    onSuccess: (res, outcome) => {
      if (!res.ok) {
        toast.error(res.status === 409 ? 'Already decided elsewhere — refreshing.' : 'Could not save the decision.');
      } else {
        toast.success(outcome === 'REVIEW_APPROVED' ? 'Approved' : 'Flagged for follow-up');
      }
      queryClient.invalidateQueries({ queryKey: ['pack-review-queue'] });
      clearSelection();
    },
    onError: () => toast.error('Could not save the decision.'),
  });

  const title = row.orderId || `PL-${row.packerLogId}`;
  const busy = decide.isPending;
  const flagDisabled = busy || note.trim().length === 0;

  return (
    <div className="flex h-full flex-col overflow-hidden bg-surface-canvas">
      {/* Identity band */}
      <div className="shrink-0 border-b border-border-hairline bg-surface-card px-5 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-role-eyebrow font-black uppercase tracking-widest text-text-soft">Review · Packing</p>
            <p className="truncate text-role-title font-black text-text-default">{title}</p>
          </div>
          <OutcomeChip outcome={row.outcome} />
        </div>
        {row.productTitle ? (
          <p className="mt-0.5 truncate text-role-caption text-text-muted">{row.productTitle}</p>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
        {/* Tracking + live ERP cross-check */}
        <section className="space-y-1.5">
          <p className="text-role-eyebrow font-black uppercase tracking-widest text-text-soft">Tracking</p>
          <div className="flex items-center gap-2">
            <span className="truncate font-mono text-role-caption font-bold text-text-default">
              {tracking || 'No tracking captured'}
            </span>
            <VerifyBadge
              loading={verifyQuery.isFetching}
              found={verifyQuery.data?.found ?? null}
              hasTracking={tracking.length > 0}
            />
          </div>
        </section>

        {/* Slip / box photo strip */}
        <section className="space-y-1.5">
          <p className="text-role-eyebrow font-black uppercase tracking-widest text-text-soft">
            Photos ({photos.length})
          </p>
          {photos.length === 0 ? (
            <p className="text-role-caption text-text-faint">No packer photos on this order yet.</p>
          ) : (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {photos.map((p) => {
                const kind =
                  p.photoType === 'pack_slip' ? 'Slip' : p.photoType === 'pack_box' ? 'Box' : null;
                return (
                  <div key={p.id} className="relative shrink-0">
                    <img
                      src={p.photoUrl}
                      alt={kind ? `Pack ${kind.toLowerCase()}` : 'Pack photo'}
                      className="h-24 w-24 rounded-lg border border-border-hairline object-cover"
                      loading="lazy"
                    />
                    {kind ? (
                      <span className="absolute bottom-1 left-1 rounded bg-scrim/70 px-1 py-0.5 text-role-micro font-black uppercase tracking-widest text-white">
                        {kind}
                      </span>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Decision note (required to flag) */}
        <section className="space-y-1.5">
          <p className="text-role-eyebrow font-black uppercase tracking-widest text-text-soft">
            Note <span className="text-text-faint">· required to flag</span>
          </p>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder="What's wrong / what to fix (required when flagging)…"
            className={cn(
              'w-full resize-none rounded-xl border border-border-soft bg-surface-card px-3 py-2 text-role-caption text-text-default placeholder:text-text-faint',
              focusRing('field', 'accent'),
            )}
          />
        </section>

        <p className="text-role-micro text-text-faint">
          Captured {formatDateTimePST(row.createdAt)}
        </p>
      </div>

      {/* Decision footer */}
      <div className="shrink-0 border-t border-border-hairline bg-surface-card px-5 py-3">
        <div className="flex items-center gap-2">
          <Button
            variant="primary"
            className="flex-1"
            loading={busy && decide.variables === 'REVIEW_APPROVED'}
            icon={<Check className="h-4 w-4" />}
            onClick={() => decide.mutate('REVIEW_APPROVED')}
            disabled={busy}
          >
            Approve
          </Button>
          <Button
            variant="danger"
            className="flex-1"
            loading={busy && decide.variables === 'REVIEW_FLAGGED'}
            icon={<AlertTriangle className="h-4 w-4" />}
            onClick={() => decide.mutate('REVIEW_FLAGGED')}
            disabled={flagDisabled}
          >
            Flag
          </Button>
        </div>
      </div>
    </div>
  );
}

function VerifyBadge({
  loading,
  found,
  hasTracking,
}: {
  loading: boolean;
  found: boolean | null;
  hasTracking: boolean;
}) {
  if (!hasTracking) return null;
  if (loading) {
    return (
      <span className="inline-flex items-center gap-1 rounded bg-surface-sunken px-1.5 py-0.5 text-role-micro font-black uppercase tracking-widest text-text-muted ring-1 ring-inset ring-border-soft">
        <Loader2 className="h-3 w-3 animate-spin" /> Checking
      </span>
    );
  }
  return found ? (
    <span className="inline-flex items-center gap-1 rounded bg-emerald-50 px-1.5 py-0.5 text-role-micro font-black uppercase tracking-widest text-emerald-700 ring-1 ring-inset ring-emerald-200">
      <Check className="h-3 w-3" /> Order matched
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded bg-amber-50 px-1.5 py-0.5 text-role-micro font-black uppercase tracking-widest text-amber-700 ring-1 ring-inset ring-amber-200">
      <AlertTriangle className="h-3 w-3" /> Not matched
    </span>
  );
}
