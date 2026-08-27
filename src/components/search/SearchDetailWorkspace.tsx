'use client';

/**
 * SearchDetailWorkspace — full-bleed entity shell for `/search?sel=type:id`.
 *
 * Mounted only when a selection is active (the no-sel state is
 * {@link SearchBrowseShell}). ORDER → {@link SearchOrderStationPane} and UNIT →
 * {@link SearchUnitStationPane} — the real scan-station composition in preview
 * stance, not a desk inspector and no longer a hand-rolled `order-feedback`
 * twin (retired 2026-08-20). RECEIVING uses the same preview station chrome.
 * SKU still embeds its inspector.
 * Repair / FBA show an in-pane preview + deep-link CTA. `/o` is retired.
 *
 * **`sku` is deliberately still `SkuDetailView variant="page"`** (2026-08-21):
 * that surface is a full EDITING page here today — stock adjust, location,
 * deactivate — and its cards carry no capability prop, so moving it to
 * `preview` would either strip an operator's writes silently or produce the
 * lobotomized work chrome `pattern-evolution.md` #5 bans. It needs a required
 * `stance` threaded through `useSkuDetailView` + its four cards first.
 *
 * **Chrome is the house primitives, never a page-local twin** (2026-08-21): the
 * three shapes this file used to hand-roll — a dashed teach card, a spinner row
 * and an entity preview card with a `bg-blue-600` CTA — are now `EmptyState`,
 * `UniversalLoader` and `Button`. The old card also carried `radius="xl"`, which
 * is soft-radius debt on an ops surface.
 *
 * **This is the ONLY `AnimatePresence` on the `?sel=` path.** Neither
 * `EntityStationPane`, `StationScanPaneHost` nor the pane mounts one, and the
 * `receiving` / `sku` / `repair` / `fba` branches have no motion of their own —
 * so deleting it would make every record→record swap an enter-only flash.
 * Record→record therefore takes the station cover-replace contract Unbox uses
 * for carton→carton: `motionRole.swap.scan` + `mode="sync"` + an opaque pane
 * stacked over the outgoing one. `mode="wait"` punched a white hole through the
 * host between exit and enter.
 */

import { useEffect, useState, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import {
  AnimatePresence,
  motion,
  motionRole,
  useMotionRole,
  useOverlaySwapHardCut,
} from '@/design-system/motion';
import { ExternalLink, Package, Search } from '@/components/Icons';
import { SearchOrderStationPane } from '@/components/search/station/SearchOrderStationPane';
import { SearchUnitStationPane } from '@/components/search/station/SearchUnitStationPane';
import { SearchReceivingStationPane } from '@/components/search/station/SearchReceivingStationPane';
import { loadDetailStack } from '@/lib/detail-stacks/load-detail-stack';
import {
  searchHitHref,
  toDbEntityType,
  type SearchHitEntityType,
} from '@/lib/search/search-hit';
import type { SearchSelection } from '@/lib/search/search-selection';
import { ENTITY_ICONS } from '@/components/search/search-result-chips';
import { useSearchPrimaryPaintOptional } from '@/components/search/search-primary-paint-context';
import { UniversalLoader } from '@/design-system/components/UniversalLoader';
import { Button, EmptyState } from '@/design-system/primitives';
import { zIndex } from '@/design-system/tokens/z-index';

const SkuDetailView = dynamic(
  () => import('@/components/sku/SkuDetailView'),
  { ssr: false },
);

/** Centred host so a body-sized `EmptyState` sits in the middle of the pane. */
function PaneCentre({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full min-h-0 flex-1 items-center justify-center bg-surface-card p-8">
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}

function PaneLoading({ label }: { label: string }) {
  return (
    <div className="relative flex h-full min-h-0 flex-1 flex-col bg-surface-card">
      <UniversalLoader isLoading label={label} />
    </div>
  );
}

/** Deep-link CTA for entity types whose detail shells are right-rail-only. */
function OpenRecordAction({
  entityType,
  id,
}: {
  entityType: SearchHitEntityType;
  id: number;
}) {
  // `Link` outside, `Button` inside — the house shape for a CTA whose job is
  // navigation (`ClaimSuccessView` is the precedent). `Button` renders a real
  // `<button>` and carries no `href`/`asChild`, so wrapping is what keeps
  // middle-click and prefetch working without a page-local anchor skin.
  return (
    <Link href={searchHitHref(toDbEntityType(entityType), id)}>
      <Button variant="primary" icon={<ExternalLink className="h-3.5 w-3.5" />}>
        Open full record
      </Button>
    </Link>
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
      <PaneCentre>
        <EmptyState
          icon={<Search className="h-6 w-6 text-text-faint" />}
          title="SKU not found"
          description="This catalog entry may have been removed. Open the full products surface to browse."
        />
      </PaneCentre>
    );
  }
  if (!sku) return <PaneLoading label="Loading SKU" />;
  return <SkuDetailView sku={sku} variant="page" />;
}

/**
 * Repair / FBA have no in-page detail shell — resolve enough of the record to
 * name it honestly, then hand the operator its durable surface.
 */
function DetailStackPreview({
  entityType,
  id,
  kind,
  label,
}: {
  entityType: SearchHitEntityType;
  id: number;
  kind: 'claim' | 'shipment';
  label: string;
}) {
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setMissing(false);
    void loadDetailStack({ kind, id: String(id) }).then((result) => {
      if (cancelled) return;
      setLoading(false);
      if (kind === 'claim') {
        if (result.kind !== 'claim') {
          setMissing(true);
          return;
        }
        const r = result.repair;
        setTitle(r.ticket_number?.trim() || `Repair #${r.id}`);
        setSubtitle([r.status, r.customer_name].filter(Boolean).join(' · ') || undefined);
        return;
      }
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
  }, [id, kind]);

  if (loading) return <PaneLoading label={`Loading ${label.toLowerCase()}`} />;

  const Icon = ENTITY_ICONS[entityType] ?? Package;

  if (missing) {
    return (
      <PaneCentre>
        <EmptyState
          icon={<Icon className="h-6 w-6 text-text-faint" />}
          title="Record not found"
          description="It may have been removed. Try another result or open the home surface for this entity."
        />
      </PaneCentre>
    );
  }

  return (
    <PaneCentre>
      <EmptyState
        icon={<Icon className="h-6 w-6 text-text-faint" />}
        title={title || `${label} #${id}`}
        description={subtitle}
        action={<OpenRecordAction entityType={entityType} id={id} />}
      />
    </PaneCentre>
  );
}

export function SearchDetailWorkspace({
  sel,
  hasQuery,
  onExit,
}: {
  sel: SearchSelection | null;
  hasQuery: boolean;
  /** Clear `?sel=` — the station identity ◁ returns to the results list. */
  onExit: () => void;
}) {
  const { presence, transition } = useMotionRole(motionRole.swap.scan);
  /**
   * The two STATION branches release the page cover themselves, when their
   * resolve settles — they really are blank until then. Every other branch
   * paints its own loading face immediately (the inspectors, `PaneLoading`), so
   * the cover has nothing left to wait for and must lift on mount.
   */
  const primaryPaint = useSearchPrimaryPaintOptional();
  const branchOwnsPaint =
    sel?.entityType !== 'order' &&
    sel?.entityType !== 'unit' &&
    sel?.entityType !== 'receiving';
  useEffect(() => {
    if (branchOwnsPaint) primaryPaint?.onPrimaryPainted();
  }, [branchOwnsPaint, primaryPaint]);
  // Record→record while a record is ALREADY painted: sync + hard cut so the new
  // opaque pane covers the old one. First open and the return to the list keep
  // wait + enter fade.
  const hardCut = useOverlaySwapHardCut(Boolean(sel));

  let body: ReactNode;
  if (!sel) {
    // Rail auto-selects the most recent find when `?q=` is absent — hold the
    // plane until that lands rather than painting a teach card.
    body = hasQuery ? (
      <PaneCentre>
        <EmptyState
          icon={<Search className="h-6 w-6 text-text-faint" />}
          title="Select a result"
          description="Pick a hit under the search bar to open its record. An exact sole match opens automatically."
        />
      </PaneCentre>
    ) : (
      <div className="min-h-0 flex-1 bg-surface-card" aria-busy />
    );
  } else {
    switch (sel.entityType) {
      case 'order':
        body = (
          <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
            <SearchOrderStationPane orderId={sel.id} />
          </div>
        );
        break;
      case 'receiving':
        body = (
          <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
            <SearchReceivingStationPane receivingId={sel.id} />
          </div>
        );
        break;
      case 'unit':
        body = (
          <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
            <SearchUnitStationPane unitRef={sel.id} onExit={onExit} />
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
        body = (
          <DetailStackPreview entityType="repair" id={sel.id} kind="claim" label="Repair" />
        );
        break;
      case 'fba':
        body = (
          <DetailStackPreview entityType="fba" id={sel.id} kind="shipment" label="Shipment" />
        );
        break;
      default:
        body = (
          <PaneCentre>
            <EmptyState
              icon={<Package className="h-6 w-6 text-text-faint" />}
              title="Unknown selection"
              description="This selection does not name an entity `/search` can open."
            />
          </PaneCentre>
        );
    }
  }

  const key = sel ? `${sel.entityType}:${sel.id}` : hasQuery ? 'pick' : 'empty';

  return (
    <div className="relative flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden bg-surface-card">
      <AnimatePresence initial={false} mode={hardCut ? 'sync' : 'wait'}>
        <motion.div
          key={key}
          // Absolute + opaque: under `mode="sync"` both panes are mounted for a
          // frame, so the entering one must COVER the outgoing one rather than
          // stack beneath it in flow (which would halve both their heights).
          className="absolute inset-0 flex min-h-0 flex-col overflow-hidden bg-surface-card"
          initial={hardCut ? false : presence.initial}
          animate={presence.animate}
          exit={presence.exit}
          transition={transition}
          style={{ zIndex: zIndex.panel + (hardCut ? 1 : 0) }}
        >
          {body}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
