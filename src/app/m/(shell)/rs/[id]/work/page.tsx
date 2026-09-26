'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation';
import { MobileDetailTopBar } from '@/components/mobile/redesign/MobileDetailTopBar';
import { DetailDock } from '@/design-system/components/DetailDock';
import { Wrench } from '@/components/Icons';
import { RepairActionTimeline } from '@/components/mobile/repair/RepairActionTimeline';
import { RepairBenchTimer } from '@/components/mobile/repair/RepairBenchTimer';
import { useRepairBenchSession } from '@/components/mobile/repair/useRepairBenchSession';
import { RepairLogWorkSheet } from '@/components/mobile/repair/RepairLogWorkSheet';
import { DetailAck } from '@/components/mobile/detail/DetailParts';
import {
  ticketBlockedReason,
  ticketThreadHref,
  useRepairActions,
  useRepairRecord,
  useRepairTicketLink,
} from '@/components/mobile/repair/useRepairWorkbench';
import { resolveRepairContact } from '@/lib/repair/contact-info';
import { customerUpdateDraft } from '@/lib/repair/customer-update-drafts';
import {
  actionSuggestsCustomerUpdate,
  repairActionLabel,
  type RepairActionRecord,
} from '@/lib/repair/repair-actions';
import { formatMonthDayTimePST } from '@/utils/date';
import { ModeRegion } from '@/design-system/providers/ModeRegion';

/** `/m/rs/[id]/work` — the bench log. */
function RepairWorkInner() {
  const params = useParams<{ id: string }>();
  const repairId = Number(params?.id);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { repair } = useRepairRecord(repairId);
  const { actions, loading, error, reload } = useRepairActions(repairId);
  const { link } = useRepairTicketLink(repairId);
  const bench = useRepairBenchSession(repairId);

  const [logOpen, setLogOpen] = useState(false);
  const [saved, setSaved] = useState<RepairActionRecord | null>(null);

  // Arrive-and-log: open once, then drop the flag so Back/refresh does not reopen it.
  useEffect(() => {
    if (searchParams?.get('log') === '1') {
      setLogOpen(true);
      router.replace(pathname);
    }
  }, [searchParams, router, pathname]);

  const rsCode = `RS-${repairId}`;
  const contact = useMemo(() => (repair ? resolveRepairContact(repair) : null), [repair]);
  // A saved repair/test usually means "tell the customer": hand the thread the
  // repair-complete draft; the tech still edits and sends it there.
  const draft = customerUpdateDraft('Repaired, Contact Customer', {
    firstName: (contact?.name ?? '').trim().split(/\s+/)[0] ?? '',
    device: repair?.product_title ?? '',
    rsCode,
  });
  const threadHref = ticketThreadHref(link, draft);

  // Timeline "Failed — Retry": re-post the note, then refetch the actions facet.
  const retryTicketPost = async (actionId: number): Promise<string | null> => {
    try {
      const res = await fetch(`/api/repair/actions/${actionId}/ticket-post`, { method: 'POST' });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      return res.ok ? null : body.error || `HTTP ${res.status}`;
    } catch (err) {
      return err instanceof Error ? err.message : 'Retry failed';
    } finally {
      await reload();
    }
  };

  return (
    <ModeRegion mode="triage" className="flex min-h-screen flex-col bg-mode-panel">
      <MobileDetailTopBar
        backHref={`/m/rs/${repairId}`}
        subtitle="Bench log"
        title={rsCode}
        mono
        meta={repair?.product_title || undefined}
      />

      <div className="flex-1 divide-y divide-mode-rule">
        {repair?.issue ? (
          <p className="bg-mode-panel px-mode-page py-3 text-role-caption text-mode-muted">
            Reported issue: <span className="font-semibold text-mode-ink">{repair.issue}</span>
          </p>
        ) : null}

        {saved ? (
          <DetailAck onDismiss={() => setSaved(null)}>
            <span>
              Saved — {repairActionLabel(saved.action_type)} ·{' '}
              <time dateTime={saved.created_at}>{formatMonthDayTimePST(saved.created_at)}</time>
            </span>
            {actionSuggestsCustomerUpdate(saved.action_type) ? (
              threadHref ? (
                <Link
                  href={threadHref}
                  className="mt-2 inline-flex min-h-mode-hit items-center border border-emerald-300 bg-mode-panel px-3 text-role-caption font-semibold text-emerald-800"
                >
                  Draft customer update
                </Link>
              ) : link ? (
                <span className="mt-1 font-normal">Customer update: {ticketBlockedReason(link)}</span>
              ) : null
            ) : null}
          </DetailAck>
        ) : null}

        <RepairBenchTimer
          sessions={bench.sessions}
          open={bench.open}
          loading={bench.loading}
          busy={bench.busy}
          error={bench.error}
          serverNowMs={bench.serverNowMs}
          onStart={() => void bench.start()}
          onStop={() => void bench.stop()}
        />

        <RepairActionTimeline
          actions={actions}
          loading={loading}
          error={error}
          highlightId={saved?.id ?? null}
          onRetryTicketPost={retryTicketPost}
        />
      </div>

      {logOpen ? (
        <RepairLogWorkSheet
          repairId={repairId}
          sessionId={bench.open?.id ?? null}
          onClose={() => setLogOpen(false)}
          onSaved={(action) => {
            setLogOpen(false);
            setSaved(action);
            void reload();
          }}
        />
      ) : null}

      <DetailDock
        label="Bench actions"
        verbs={[{ id: 'log', label: 'Log work', icon: <Wrench />, primary: true }]}
        onVerb={() => setLogOpen(true)}
      />
    </ModeRegion>
  );
}

export default function RepairWorkPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-surface-card" />}>
      <RepairWorkInner />
    </Suspense>
  );
}
