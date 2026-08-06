'use client';

/**
 * SearchDetailWorkspace — full-bleed entity shell for `/search?sel=type:id`.
 *
 * Mounted only when a selection is active (the no-sel state is
 * {@link SearchFindStage}). ORDER → `SearchOrderFeedback` (not `/o` /
 * OrderRecordBody). Receiving / unit / sku embed their inspectors. Repair /
 * FBA show an in-pane preview + deep-link CTA.
 */

import { useEffect, useState, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { AnimatePresence, motion } from '@/design-system/motion';
import { ExternalLink, Loader2, Package, Search } from '@/components/Icons';
import { framerPresence, framerTransition } from '@/design-system/foundations/motion-framer';
import {
  useMotionPresence,
  useMotionTransition,
} from '@/design-system/foundations/motion-framer-hooks';
import { SearchOrderFeedback } from '@/components/search/order-feedback/SearchOrderFeedback';
import { CartonInspector } from '@/components/receiving/inspector/CartonInspector';
import { UnitDetailsPanel } from '@/components/inventory/panels/UnitDetailsPanel';
import { loadDetailStack } from '@/lib/detail-stacks/load-detail-stack';
import {
  searchHitHref,
  toDbEntityType,
  type SearchHitEntityType,
} from '@/lib/search/search-hit';
import type { SearchSelection } from '@/lib/search/search-selection';
import { ENTITY_ICONS, ENTITY_TONE, CHIP_TONE_CLASSES } from '@/components/search/search-result-chips';
import { cn } from '@/utils/_cn';

const SkuDetailView = dynamic(
  () => import('@/components/sku/SkuDetailView'),
  { ssr: false },
);

function TeachEmpty({
  title,
  body,
}: {
  title: string;
  body: string;
}) {
  return (
    <div className="flex h-full min-h-0 flex-1 items-center justify-center bg-surface-canvas p-8">
      <div className="max-w-sm rounded-xl border border-dashed border-border-soft bg-surface-canvas px-6 py-10 text-center">
        <Search className="mx-auto mb-3 h-8 w-8 text-text-faint" />
        <p className="text-role-caption font-semibold text-text-default">{title}</p>
        <p className="mt-1 text-role-caption text-text-muted">{body}</p>
      </div>
    </div>
  );
}

function LoadingShell() {
  return (
    <div className="flex h-full min-h-0 flex-1 items-center justify-center bg-surface-canvas">
      <span className="flex items-center gap-2 text-role-caption font-semibold text-text-muted">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
      </span>
    </div>
  );
}

/** In-pane preview for entity types whose detail shells are right-rail-only. */
function EntityPreviewCard({
  entityType,
  id,
  title,
  subtitle,
  loading,
  missing,
}: {
  entityType: SearchHitEntityType;
  id: number;
  title: string;
  subtitle?: string;
  loading?: boolean;
  missing?: boolean;
}) {
  const href = searchHitHref(toDbEntityType(entityType), id);
  const Icon = ENTITY_ICONS[entityType] ?? Package;
  const tone = ENTITY_TONE[entityType] ?? 'gray';

  if (loading) return <LoadingShell />;
  if (missing) {
    return (
      <TeachEmpty
        title="Record not found"
        body="It may have been removed. Try another result or open the home surface for this entity."
      />
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col items-center justify-center bg-surface-canvas p-8">
      <div className="w-full max-w-md rounded-xl border border-border-soft bg-surface-card p-6 shadow-sm">
        <div className="flex items-start gap-3">
          <span
            className={cn(
              'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset',
              CHIP_TONE_CLASSES[tone],
            )}
          >
            <Icon className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-role-eyebrow uppercase text-text-soft">{entityType}</p>
            <p className="mt-0.5 truncate text-role-body font-semibold text-text-default">
              {title}
            </p>
            {subtitle ? (
              <p className="mt-1 text-role-caption text-text-muted">{subtitle}</p>
            ) : null}
          </div>
        </div>
        <Link
          href={href}
          className="mt-5 flex w-full items-center justify-center gap-1.5 rounded-md bg-blue-600 px-3 py-2.5 text-role-caption font-semibold text-white hover:bg-blue-500"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Open full record
        </Link>
      </div>
    </div>
  );
}

function SkuByIdDetail({ id }: { id: number }) {
  const [sku, setSku] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setSku(null);
    setMissing(false);
    void (async () => {
      try {
        const res = await fetch(`/api/sku-catalog/${id}`, { cache: 'no-store' });
        if (!res.ok) {
          if (!cancelled) setMissing(true);
          return;
        }
        const data = await res.json();
        const code = String(data?.catalog?.sku ?? data?.sku ?? '').trim();
        if (!cancelled) {
          if (code) setSku(code);
          else setMissing(true);
        }
      } catch {
        if (!cancelled) setMissing(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (missing) {
    return (
      <TeachEmpty
        title="SKU not found"
        body="This catalog entry may have been removed. Open the full products surface to browse."
      />
    );
  }
  if (!sku) return <LoadingShell />;
  return <SkuDetailView sku={sku} variant="page" />;
}

function RepairPreview({ id }: { id: number }) {
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setMissing(false);
    void loadDetailStack({ kind: 'claim', id: String(id) }).then((result) => {
      if (cancelled) return;
      setLoading(false);
      if (result.kind !== 'claim') {
        setMissing(true);
        return;
      }
      const r = result.repair;
      setTitle(r.ticket_number?.trim() || `Repair #${r.id}`);
      setSubtitle([r.status, r.customer_name].filter(Boolean).join(' · ') || undefined);
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  return (
    <EntityPreviewCard
      entityType="repair"
      id={id}
      title={title || `Repair #${id}`}
      subtitle={subtitle}
      loading={loading}
      missing={missing}
    />
  );
}

function FbaPreview({ id }: { id: number }) {
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setMissing(false);
    void loadDetailStack({ kind: 'shipment', id: String(id) }).then((result) => {
      if (cancelled) return;
      setLoading(false);
      if (result.kind !== 'plan') {
        setMissing(true);
        return;
      }
      const item = result.item;
      setTitle(item.display_title?.trim() || item.fnsku || `Shipment #${id}`);
      setSubtitle([item.fnsku, item.shipment_ref].filter(Boolean).join(' · ') || undefined);
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  return (
    <EntityPreviewCard
      entityType="fba"
      id={id}
      title={title || `Shipment #${id}`}
      subtitle={subtitle}
      loading={loading}
      missing={missing}
    />
  );
}

export function SearchDetailWorkspace({
  sel,
  hasQuery,
}: {
  sel: SearchSelection | null;
  hasQuery: boolean;
}) {
  const presence = useMotionPresence(framerPresence.workbenchPaneSettle);
  const transition = useMotionTransition(framerTransition.workbenchPaneSettle);

  let body: ReactNode;
  if (!sel) {
    // Prefer SearchFindStage at the page level; this is a defensive fallback.
    body = hasQuery ? (
      <TeachEmpty
        title="Select a result"
        body="Pick a hit under the search bar to open its record. An exact sole match opens automatically."
      />
    ) : (
      <TeachEmpty
        title="Search everything"
        body="Type an order #, PO, tracking, serial, SKU, or customer in the search bar."
      />
    );
  } else {
    switch (sel.entityType) {
      case 'order':
        body = (
          <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
            <SearchOrderFeedback orderId={sel.id} />
          </div>
        );
        break;
      case 'receiving':
        body = (
          <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
            <CartonInspector receivingId={sel.id} />
          </div>
        );
        break;
      case 'unit':
        body = (
          <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
            <UnitDetailsPanel ref={String(sel.id)} />
          </div>
        );
        break;
      case 'sku':
        body = (
          <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
            <SkuByIdDetail id={sel.id} />
          </div>
        );
        break;
      case 'repair':
        body = <RepairPreview id={sel.id} />;
        break;
      case 'fba':
        body = <FbaPreview id={sel.id} />;
        break;
      default:
        body = (
          <div className="flex h-full min-h-0 flex-1 items-center justify-center bg-surface-canvas p-8">
            <div className="max-w-sm rounded-xl border border-dashed border-border-soft px-6 py-10 text-center">
              <Package className="mx-auto mb-3 h-8 w-8 text-text-faint" />
              <p className="text-role-caption font-semibold text-text-muted">
                Unknown selection
              </p>
            </div>
          </div>
        );
    }
  }

  const key = sel ? `${sel.entityType}:${sel.id}` : hasQuery ? 'pick' : 'empty';

  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden bg-surface-canvas">
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={key}
          className="flex h-full min-h-0 flex-1 flex-col overflow-hidden"
          {...presence}
          transition={transition}
        >
          {body}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
