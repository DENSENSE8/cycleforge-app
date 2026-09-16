'use client';

import { useEffect, useState } from 'react';
import { Search } from '@/components/Icons';
import { EmptyState } from '@/design-system/primitives';
import { UniversalLoader } from '@/design-system/components/UniversalLoader';
import { useSearchPrimaryPaintOptional } from '@/components/search/search-primary-paint-context';
import { SearchDossierFrame } from '@/components/search/dossier/SearchDossierFrame';
import { loadDetailStack } from '@/lib/detail-stacks/load-detail-stack';
import { presentFindDossier } from '@/lib/search/find-dossier-model';
import { searchHitHref, toDbEntityType, type SearchHitEntityType } from '@/lib/search/search-hit';
import { joinMeta, presentFact, type SearchDossierFinding } from '@/lib/search/search-dossier-model';
import type { SkuCatalogRecordSource } from '@/lib/item-record/sku-catalog-item-record';
import type { RSRecord } from '@/lib/neon/repair-service-queries';
import type { FbaBoardItem } from '@/lib/fba/types';

function skuCatalogFromPayload(payload: unknown): SkuCatalogRecordSource | null {
  if (!payload || typeof payload !== 'object') return null;
  const nested = 'catalog' in payload ? payload.catalog : payload;
  if (!nested || typeof nested !== 'object') return null;
  if (!('id' in nested)) return null;
  const id = Number(nested.id);
  if (!Number.isFinite(id)) return null;
  const sku = 'sku' in nested ? String(nested.sku ?? '').trim() : '';
  if (!sku) return null;
  const text = (key: string): string | null =>
    key in nested ? String((nested as Record<string, unknown>)[key] ?? '').trim() || null : null;
  return {
    id,
    sku,
    product_title: text('product_title'),
    image_url: text('image_url'),
    upc: text('upc'),
    ean: text('ean'),
    gtin: text('gtin'),
    category: text('category'),
  };
}
function PaneCentre({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full min-h-0 flex-1 items-center justify-center bg-surface-card p-8">
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}

export function SearchSkuDossier({ id, onBack }: { id: number; onBack?: () => void }) {
  const [catalog, setCatalog] = useState<SkuCatalogRecordSource | null>(null);
  const [missing, setMissing] = useState(false);
  const primaryPaint = useSearchPrimaryPaintOptional();

  useEffect(() => {
    let cancelled = false;
    setCatalog(null);
    setMissing(false);
    void (async () => {
      try {
        const res = await fetch(`/api/sku-catalog/${id}`, { cache: 'no-store' });
        if (!res.ok) {
          if (!cancelled) setMissing(true);
          return;
        }
        const row = skuCatalogFromPayload(await res.json());
        if (!cancelled) {
          if (row) setCatalog(row);
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

  useEffect(() => {
    if (catalog || missing) primaryPaint?.onPrimaryPainted();
  }, [catalog, missing, primaryPaint]);

  if (missing) {
    return (
      <PaneCentre>
        <EmptyState
          icon={<Search className="h-6 w-6 text-text-faint" />}
          title="SKU not found"
          description="This catalog entry may have been removed."
        />
      </PaneCentre>
    );
  }
  if (!catalog) return <UniversalLoader isLoading label="Loading SKU" />;

  const sku = presentFact(catalog.sku) || `SKU ${id}`;
  const title = presentFact(catalog.product_title) || sku;
  const barcode =
    presentFact(catalog.gtin) || presentFact(catalog.upc) || presentFact(catalog.ean);
  const facts = [
    { id: 'status', label: 'Status', value: presentFact(catalog.category) || 'catalog' },
    { id: 'sku', label: 'SKU', value: sku },
    ...(barcode ? [{ id: 'barcode', label: 'Barcode', value: barcode }] : []),
  ];
  const dossier = presentFindDossier({
    entityType: 'sku',
    id: catalog.id,
    title,
    status: presentFact(catalog.category) || 'catalog',
    facts,
    findings: [],
    handoffs: [{ href: searchHitHref('SKU', id), label: 'Open products', primary: true }],
    events: [],
  });

  return (
    <SearchDossierFrame
      entity="SKU"
      title={title}
      onBack={onBack}
      outline={dossier.outline}
      findings={[]}
      facts={facts}
      events={dossier.events}
      lines={[{ id: catalog.id, title, meta: joinMeta([sku, barcode]) }]}
      emptyLines="This catalog entry has no chronology."
      handoffs={dossier.handoffs}
    />
  );
}

export function SearchStackDossier({
  entityType,
  id,
  kind,
  label,
  onBack,
}: {
  entityType: SearchHitEntityType;
  id: number;
  kind: 'claim' | 'shipment';
  label: string;
  onBack?: () => void;
}) {
  const [claim, setClaim] = useState<RSRecord | null>(null);
  const [plan, setPlan] = useState<FbaBoardItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);
  const primaryPaint = useSearchPrimaryPaintOptional();

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
        setClaim(result.repair);
        return;
      }
      if (result.kind !== 'plan') {
        setMissing(true);
        return;
      }
      setPlan(result.item);
    });
    return () => {
      cancelled = true;
    };
  }, [id, kind]);

  useEffect(() => {
    if (!loading) primaryPaint?.onPrimaryPainted();
  }, [loading, primaryPaint]);

  if (loading) return <UniversalLoader isLoading label={`Loading ${label.toLowerCase()}`} />;

  if (missing || (!claim && !plan)) {
    return (
      <PaneCentre>
        <EmptyState
          icon={<Search className="h-6 w-6 text-text-faint" />}
          title="Record not found"
          description="It may have been removed. Try another result."
        />
      </PaneCentre>
    );
  }

  const title = claim
    ? presentFact(claim.ticket_number) || `Repair #${claim.id}`
    : presentFact(plan?.display_title) || presentFact(plan?.fnsku) || `Shipment #${id}`;
  const status = claim
    ? presentFact(claim.status) || 'No status'
    : presentFact(plan?.item_status) || 'No status';
  const findings: SearchDossierFinding[] = [];
  if (claim && !presentFact(claim.status)) {
    findings.push({
      key: 'no_status',
      label: 'No repair status',
      hint: 'Open the repair desk to continue this claim.',
      href: searchHitHref(toDbEntityType(entityType), id),
      hrefLabel: `Open ${label.toLowerCase()}`,
    });
  }
  const facts = [
    { id: 'status', label: 'Status', value: status },
    {
      id: 'who',
      label: claim ? 'Customer' : 'FNSKU',
      value: claim
        ? presentFact(claim.customer_name) || '—'
        : presentFact(plan?.fnsku) || '—',
    },
  ];
  const handoffs = [
    {
      href: searchHitHref(toDbEntityType(entityType), id),
      label: `Open ${label.toLowerCase()}`,
      primary: true,
    },
  ];
  const at = claim?.updated_at || claim?.created_at || null;
  const streamEvents = at
    ? [
        {
          id: `hop:${kind}:${id}`,
          kind: 'custody' as const,
          at,
          title: status,
          body: claim
            ? presentFact(claim.notes) || presentFact(claim.issue) || undefined
            : presentFact(plan?.shipment_ref) || undefined,
          bind: {
            serial: presentFact(claim?.serial_number) || undefined,
            sku: presentFact(plan?.fnsku) || undefined,
          },
        },
      ]
    : [];
  const dossier = presentFindDossier({
    entityType,
    id,
    title,
    status,
    facts,
    findings,
    handoffs,
    events: streamEvents,
  });

  return (
    <SearchDossierFrame
      entity={label}
      title={title}
      onBack={onBack}
      outline={dossier.outline}
      findings={findings}
      facts={facts}
      events={dossier.events}
      emptyLines={`No ${label.toLowerCase()} chronology yet.`}
      handoffs={handoffs}
    />
  );
}
