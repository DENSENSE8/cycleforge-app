'use client';

/**
 * `/m/exceptions/[key]` — one exception as a full phone screen with an X back
 * to the list it was opened from (SURFACE_LAW §7: a record is a screen, never
 * a sheet). The frame paints what every kind shares — the tag band and the
 * row's facts — and hosts the ONE phone resolver for the row's kind, which
 * completes the exception in place through the hub's resolve hooks.
 *
 * A bare numeric segment is an old order deep link (`/m/exceptions/<orderId>`,
 * before the hub): it lands on that order's exception — FBM first, then
 * Missing pairs — else on the list.
 */

import { useEffect, type ReactNode } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { DetailFact, DetailFacts } from '@/components/mobile/detail/DetailParts';
import { ExceptionTag } from '@/components/mobile/exceptions/ExceptionTag';
import { mobileExceptionHref } from '@/components/mobile/exceptions/mobile-exception-href';
import { BinsResolver } from '@/components/mobile/exceptions/resolvers/BinsResolver';
import { ClaimResolver } from '@/components/mobile/exceptions/resolvers/ClaimResolver';
import { FbmResolver } from '@/components/mobile/exceptions/resolvers/FbmResolver';
import { LabelsResolver } from '@/components/mobile/exceptions/resolvers/LabelsResolver';
import { PairsOrderResolver, PairsPlaceholderResolver } from '@/components/mobile/exceptions/resolvers/PairsResolver';
import { PaperworkResolver } from '@/components/mobile/exceptions/resolvers/PaperworkResolver';
import { ShortResolver } from '@/components/mobile/exceptions/resolvers/ShortResolver';
import { TrackingResolver } from '@/components/mobile/exceptions/resolvers/TrackingResolver';
import { UnfoundResolver } from '@/components/mobile/exceptions/resolvers/UnfoundResolver';
import { DetailRecordFrame } from '@/design-system/components/DetailHubScreen';
import { useException } from '@/hooks/exceptions';
import type { ExceptionRecordResponse } from '@/lib/exceptions/facts';
import {
  EXCEPTION_DOMAIN_LABEL,
  EXCEPTION_KIND_SPEC,
  MOBILE_EXCEPTIONS_PATH,
  exceptionRowKey,
  parseExceptionRowKey,
} from '@/lib/exceptions/types';
import { mobileJobReturn } from '@/lib/mobile/nav-trail';
import { toast } from '@/lib/toast';
import { formatMonthDayTimePST } from '@/utils/date';

/** The kinds an old `/m/exceptions/<orderId>` link can mean, in the order they are tried. */
const LEGACY_ORDER_KINDS = ['fbm', 'pairs'] as const;

function LegacyOrderExceptionLink({ orderId }: { orderId: string }) {
  const router = useRouter();
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      for (const kind of LEGACY_ORDER_KINDS) {
        const key = exceptionRowKey(kind, orderId);
        const res = await fetch(`/api/exceptions/${encodeURIComponent(key)}`, {
          credentials: 'same-origin',
          cache: 'no-store',
        }).catch(() => null);
        if (cancelled) return;
        if (res?.ok) {
          router.replace(mobileExceptionHref(key));
          return;
        }
      }
      router.replace(MOBILE_EXCEPTIONS_PATH);
    })();
    return () => {
      cancelled = true;
    };
  }, [orderId, router]);
  return (
    <div className="flex min-h-screen flex-col bg-mode-panel" data-testid="mobile-exception-legacy-link">
      <p className="px-mode-page py-10 text-center text-sm font-semibold text-text-soft">Finding order {orderId}…</p>
    </div>
  );
}

function resolverFor(record: ExceptionRecordResponse, onResolved: (message: string) => void): ReactNode {
  const { row, facts } = record;
  switch (facts.kind) {
    case 'fbm':
      return <FbmResolver row={row} facts={facts} onResolved={onResolved} />;
    case 'pairs':
      return facts.source === 'order' ? (
        <PairsOrderResolver row={row} facts={facts} onResolved={onResolved} />
      ) : (
        <PairsPlaceholderResolver row={row} facts={facts} onResolved={onResolved} />
      );
    case 'paperwork':
      return <PaperworkResolver row={row} facts={facts} onResolved={onResolved} />;
    case 'labels':
      return <LabelsResolver row={row} facts={facts} onResolved={onResolved} />;
    case 'bins':
      return <BinsResolver row={row} facts={facts} onResolved={onResolved} />;
    case 'tracking':
      return <TrackingResolver row={row} facts={facts} onResolved={onResolved} />;
    case 'claim':
      return <ClaimResolver row={row} facts={facts} onResolved={onResolved} />;
    case 'short':
      return <ShortResolver row={row} facts={facts} onResolved={onResolved} />;
    case 'unfound':
      return <UnfoundResolver row={row} facts={facts} onResolved={onResolved} />;
  }
}

export function MobileExceptionRecord() {
  const router = useRouter();
  const params = useParams<{ key: string }>();
  const searchParams = useSearchParams();
  const key = decodeURIComponent(params?.key ?? '');
  const legacyOrderId = /^\d+$/.test(key) ? key : null;
  const parsed = legacyOrderId ? null : parseExceptionRowKey(key);
  const back = mobileJobReturn(searchParams?.get('back')) ?? MOBILE_EXCEPTIONS_PATH;
  const record = useException(parsed ? key : null);

  if (legacyOrderId) return <LegacyOrderExceptionLink orderId={legacyOrderId} />;

  const onResolved = (message: string) => {
    toast.success(message);
    router.replace(back);
  };
  const kindLabel = parsed ? EXCEPTION_KIND_SPEC[parsed.kind].label : 'Exception';

  return (
    <DetailRecordFrame
      record={record.data}
      state={{
        loading: Boolean(parsed) && record.isPending,
        error: parsed
          ? record.isError
            ? record.error.message || 'Could not load this exception.'
            : null
          : 'Not an exception link.',
        onRetry: () => void record.refetch(),
        missing: 'This exception is resolved or no longer exists.',
      }}
      bar={{
        title: record.data?.row.entity.label ?? 'Exception',
        mono: Boolean(record.data),
        subtitle: parsed
          ? `${EXCEPTION_DOMAIN_LABEL[EXCEPTION_KIND_SPEC[parsed.kind].domain]} · ${kindLabel}`
          : 'Exceptions',
        meta: (live) => live.row.title,
        backHref: back,
        close: true,
      }}
    >
      {(live) => (
        <div className="flex flex-1 flex-col divide-y divide-mode-rule" data-testid="mobile-exception-record" data-kind={live.row.kind}>
          <section
            aria-label="Why this is an exception"
            className="flex flex-col items-start gap-1 bg-mode-panel px-mode-page py-3"
          >
            <ExceptionTag row={live.row} />
            {live.row.detail ? <p className="text-mode-body text-mode-ink">{live.row.detail}</p> : null}
            <p className="text-role-caption text-text-muted">{EXCEPTION_KIND_SPEC[live.row.kind].membership}</p>
          </section>
          <DetailFacts label="Exception">
            <DetailFact label="Blocked" value={live.row.entity.label} mono copy={live.row.entity.id} />
            {live.row.raisedAt ? <DetailFact label="Raised" value={formatMonthDayTimePST(live.row.raisedAt)} /> : null}
          </DetailFacts>
          {resolverFor(live, onResolved)}
        </div>
      )}
    </DetailRecordFrame>
  );
}
