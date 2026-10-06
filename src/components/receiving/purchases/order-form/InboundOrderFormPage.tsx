'use client';

/**
 * `/purchasing/new` — THE desk form that adds an inbound order (purchase
 * order or return) or fixes a landed one (`?id=`). Two thirds: type in
 * everything (Order · Return · Tracking · Items); one third, sticky: the live
 * Details that confirm it and the one submit. Same model as the phone face
 * (`useInboundOrderForm`); lands through POST /api/receiving/inbound/orders,
 * then each line's listing photos upload to its landed receiving line.
 *
 * `?type=` (PO · RETURN) picks the type a new order opens on; switching it in
 * the form writes it back (replace) so a reload keeps it. ⌘Enter adds the
 * order when nothing is missing; Esc leaves while nothing is typed.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft } from '@/components/Icons';
import { DeskPageLayout } from '@/components/desk/DeskPageLayout';
import { IconButton } from '@/design-system/primitives';
import {
  DESK_RECORD_ASIDE_COLUMN_CLASS,
  DESK_RECORD_COLUMNS_CLASS,
  DESK_RECORD_MAIN_COLUMN_CLASS,
  DESK_STAGE_GUTTER_CLASS,
} from '@/design-system/tokens/desk-stage';
import { fetchInboundOrderEdit } from '@/lib/inbound/inbound-order-client';
import {
  inboundOrderFormHref,
  INBOUND_FORM_ID_PARAM,
  INBOUND_FORM_TYPE_PARAM,
  parseInboundFormOrderId,
  parseInboundFormType,
  type InboundFormType,
} from '@/lib/inbound/inbound-order-compose';
import { emptyInboundOrderDraft, INBOUND_ORDER_TYPE_LABELS } from '@/lib/inbound/inbound-order-draft';
import type { InboundOrderEditRecord } from '@/lib/inbound/inbound-order-edit';
import { useInboundOrderForm } from '@/lib/inbound/use-inbound-order-form';
import { RECEIVING_PATHS } from '@/lib/nav/route-tree';
import { hasOpenOverlay } from '@/lib/overlay-stack/store';
import { cn } from '@/utils/_cn';
import { InboundOrderDetails } from './InboundOrderDetails';
import { InboundItemsGroup, InboundOrderGroup, InboundReturnGroup } from './InboundOrderGroups';
import { InboundTrackingGroup } from './InboundTrackingGroup';
import { InboundOrderLanded } from './InboundOrderLanded';

/** Loads the order to fix (`?id=`), then mounts the form; remounts blank for the next order. */
export function InboundOrderFormPage() {
  const params = useSearchParams();
  const router = useRouter();
  const editId = parseInboundFormOrderId(params.get(INBOUND_FORM_ID_PARAM));
  const urlType = parseInboundFormType(params.get(INBOUND_FORM_TYPE_PARAM));
  const [session, setSession] = useState(0);
  const edit = useQuery({
    queryKey: ['inbound-order-edit', editId],
    queryFn: ({ signal }) => fetchInboundOrderEdit(editId!, signal),
    enabled: editId != null,
    staleTime: 0,
  });
  const leave = useCallback(() => router.push(RECEIVING_PATHS.purchasing), [router]);
  const back = useMemo(
    () => <IconButton size="md" icon={<ChevronLeft className="h-4 w-4" />} ariaLabel="Back to Purchasing" onClick={leave} />,
    [leave],
  );

  if (editId != null && !edit.data) {
    return (
      <DeskPageLayout title={`Inbound order ${editId}`} titleLead={back}>
        <p className="px-6 py-16 text-center text-role-body text-text-muted">
          {edit.error ? (edit.error as Error).message : 'Loading the order…'}
        </p>
      </DeskPageLayout>
    );
  }
  return (
    <InboundOrderForm
      key={`${editId ?? 'new'}:${session}`}
      record={editId != null ? (edit.data ?? null) : null}
      urlType={urlType}
      back={back}
      onLeave={leave}
      onAnother={(type) => {
        if (editId != null) router.push(inboundOrderFormHref('desk', { type }));
        else setSession((n) => n + 1);
      }}
    />
  );
}

function InboundOrderForm({
  record,
  urlType,
  back,
  onLeave,
  onAnother,
}: {
  record: InboundOrderEditRecord | null;
  urlType: InboundFormType;
  back: ReactNode;
  onLeave: () => void;
  onAnother: (type: InboundFormType) => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const form = useInboundOrderForm({ record, type: urlType });
  const { draft, landing, patch, submit } = form;
  const pristine = useMemo(
    () => record == null && JSON.stringify(draft) === JSON.stringify(emptyInboundOrderDraft(draft.type)),
    [draft, record],
  );
  const typeLabel = INBOUND_ORDER_TYPE_LABELS[draft.type];
  const title = record ? `Fix ${typeLabel.toLowerCase()} ${record.draft.orderNumber}` : `Add ${typeLabel.toLowerCase()}`;

  // Switching the type writes `?type=` back — replace, so a reload reopens on it.
  const changeType = useCallback(
    (type: InboundFormType) => {
      patch({ type });
      if (record || type === urlType) return;
      const params = new URLSearchParams(searchParams.toString());
      params.set(INBOUND_FORM_TYPE_PARAM, type);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [patch, record, urlType, searchParams, pathname, router],
  );

  // A door that lands here with another `?type=` (header Add return) switches the open form in place.
  const shownType = useRef(urlType);
  useEffect(() => {
    if (shownType.current === urlType || record) return;
    shownType.current = urlType;
    if (landing) onAnother(urlType);
    else patch({ type: urlType });
  }, [urlType, landing, onAnother, patch, record]);

  // Esc leaves while nothing is typed (or once it landed) and no popover owns the key.
  const canLeave = pristine || landing != null;
  useEffect(() => {
    if (!canLeave) return;
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || hasOpenOverlay()) return;
      event.preventDefault();
      onLeave();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [canLeave, onLeave]);

  // ⌘Enter submits; a bare Enter in a field never lands the order by accident.
  const onKeyDown = (event: KeyboardEvent<HTMLFormElement>) => {
    if (event.key !== 'Enter' || event.defaultPrevented) return;
    if (event.metaKey || event.ctrlKey) {
      event.preventDefault();
      void submit();
      return;
    }
    if (event.target instanceof HTMLInputElement) event.preventDefault();
  };

  return (
    <DeskPageLayout title={landing ? `${typeLabel} landed` : title} titleLead={back}>
      {/* The gutter keeps the cards' frame and shadow inside the scroll box, which clips both axes. */}
      <div className={cn('@container min-h-0 flex-1 overflow-y-auto', DESK_STAGE_GUTTER_CLASS)} data-testid="inbound-order-form-page">
        {landing ? (
          <InboundOrderLanded landing={landing} onAnother={() => onAnother(landing.type === 'RETURN' ? 'RETURN' : 'PO')} />
        ) : (
          <form
            aria-label={title}
            className={cn(DESK_RECORD_COLUMNS_CLASS, 'py-5')}
            onKeyDown={onKeyDown}
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
            data-testid="inbound-order-form"
          >
            <div className={cn(DESK_RECORD_MAIN_COLUMN_CLASS, 'flex flex-col gap-4')}>
              <InboundOrderGroup form={form} onTypeChange={changeType} />
              {draft.type === 'RETURN' ? <InboundReturnGroup form={form} /> : null}
              <InboundTrackingGroup form={form} />
              <InboundItemsGroup form={form} />
            </div>
            <aside className={cn(DESK_RECORD_ASIDE_COLUMN_CLASS, '@4xl:sticky @4xl:top-5')} aria-label="Details">
              <InboundOrderDetails form={form} onCancel={onLeave} />
            </aside>
          </form>
        )}
      </div>
    </DeskPageLayout>
  );
}
