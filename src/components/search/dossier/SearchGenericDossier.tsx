'use client';

import { useEffect, useState } from 'react';
import { Search } from '@/components/Icons';
import { EmptyState } from '@/design-system/primitives';
import { useSearchPrimaryPaintOptional } from '@/components/search/search-primary-paint-context';
import { SearchEntityRecord } from '@/components/search/dossier/SearchEntityRecord';
import { loadDetailStack } from '@/lib/detail-stacks/load-detail-stack';
import type { FindEvent } from '@/lib/search/find-dossier-model';
import { searchHitHref, toDbEntityType, type SearchHitEntityType } from '@/lib/search/search-hit';
import {
  presentFact,
  type SearchDossierFact,
  type SearchDossierFinding,
  type SearchDossierLink,
} from '@/lib/search/search-dossier-model';
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
  if (!catalog) return null;

  const sku = presentFact(catalog.sku) || `SKU ${id}`;
  const title = presentFact(catalog.product_title) || sku;
  const barcode = presentFact(catalog.gtin) || presentFact(catalog.upc) || presentFact(catalog.ean);
  const category = presentFact(catalog.category);
  const facts: SearchDossierFact[] = [
    { id: 'sku', label: 'SKU', value: sku, copy: true },
    ...(barcode ? [{ id: 'barcode', label: 'Barcode', value: barcode, copy: true }] : []),
    ...(category ? [{ id: 'category', label: 'Category', value: category }] : []),
  ];
  // Every unit, carton and order carrying this SKU is one query away.
  const related: SearchDossierLink[] = [
    { id: `query:${sku}`, label: 'Everything', value: `Search “${sku}”`, target: { query: sku } },
  ];

  return (
    <SearchEntityRecord
      entity="SKU"
      reference={sku}
      title={title}
      status={category || 'catalog'}
      onBack={onBack}
      findings={[]}
      lines={[
        {
          id: catalog.id,
          title,
          imageUrl: presentFact(catalog.image_url),
          facts: [{ label: 'SKU', value: sku }, ...(barcode ? [{ label: 'Barcode', value: barcode }] : [])],
        },
      ]}
      linesLabel="item"
      emptyLines="No catalog item."
      events={[]}
      emptyEvents="A catalog entry has no history of its own — its units and orders do."
      facts={facts}
      related={related}
      handoffs={[{ href: searchHitHref('SKU', id), label: 'Open products', primary: true }]}
    />
  );
}

function repairEvents(claim: RSRecord): FindEvent[] {
  const history = claim.status_history ?? [];
  if (history.length > 0) {
    return history.map((entry, index) => ({
      id: `repair:${claim.id}:${index}`,
      kind: 'custody' as const,
      at: entry.timestamp,
      title: entry.previous_status ? `${entry.previous_status} → ${entry.status}` : entry.status,
      ...(entry.user_name ? { actor: entry.user_name } : {}),
      ...(entry.source ? { stationCaption: entry.source } : {}),
    }));
  }
  return [{ id: `repair:${claim.id}:created`, kind: 'custody', at: claim.created_at, title: 'Repair opened' }];
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

  if (loading) return null;

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

  const deskHref = searchHitHref(toDbEntityType(entityType), id);
  const handoffs = [{ href: deskHref, label: `Open ${label.toLowerCase()}`, primary: true }];

  if (claim) {
    const status = presentFact(claim.status) || 'No status';
    const findings: SearchDossierFinding[] = presentFact(claim.status)
      ? []
      : [
          {
            key: 'no_status',
            label: 'No repair status',
            hint: 'Open the repair desk to continue this claim.',
            href: deskHref,
            hrefLabel: `Open ${label.toLowerCase()}`,
          },
        ];
    const serial = presentFact(claim.serial_number);
    const sourceOrder = presentFact(claim.source_order_id);
    const sourceTracking = presentFact(claim.source_tracking_number);
    const sku = presentFact(claim.source_sku);
    const contact = [claim.customer_email, claim.customer_phone, claim.contact_info]
      .map((part) => presentFact(part))
      .find(Boolean);
    const facts: SearchDossierFact[] = [
      { id: 'ticket', label: 'Ticket', value: presentFact(claim.ticket_number) || `#${claim.id}`, copy: true },
      ...(presentFact(claim.customer_name) ? [{ id: 'customer', label: 'Customer', value: claim.customer_name as string }] : []),
      ...(contact ? [{ id: 'contact', label: 'Contact', value: contact }] : []),
      ...(serial ? [{ id: 'serial', label: 'Serial', value: serial, copy: true }] : []),
      ...(sourceTracking ? [{ id: 'tracking', label: 'Tracking #', value: sourceTracking, copy: true }] : []),
      ...(presentFact(claim.price) ? [{ id: 'price', label: 'Price', value: claim.price }] : []),
      ...(presentFact(claim.intake_channel) ? [{ id: 'channel', label: 'Intake', value: claim.intake_channel as string }] : []),
    ];
    const related: SearchDossierLink[] = [
      ...(sourceOrder ? [{ id: `order:${sourceOrder}`, label: 'Order', value: sourceOrder, target: { query: sourceOrder } }] : []),
      ...(serial ? [{ id: `serial:${serial}`, label: 'Serial', value: serial, target: { query: serial } }] : []),
    ];
    const title = presentFact(claim.product_title) || `Repair #${claim.id}`;
    return (
      <SearchEntityRecord
        entity={label}
        reference={presentFact(claim.ticket_number) || String(claim.id)}
        title={title}
        status={status}
        onBack={onBack}
        findings={findings}
        lines={[
          {
            id: claim.id,
            title,
            facts: [
              ...(sku ? [{ label: 'SKU', value: sku }] : []),
              ...(serial ? [{ label: 'Serial', value: serial }] : []),
              ...(presentFact(claim.issue) ? [{ label: 'Issue', value: claim.issue }] : []),
            ],
            finding: null,
          },
        ]}
        linesLabel="item"
        emptyLines="No item on this repair."
        events={[
          ...repairEvents(claim),
          ...(presentFact(claim.notes)
            ? [{ id: `repair:${claim.id}:note`, kind: 'note' as const, at: claim.updated_at, title: 'Note', body: claim.notes as string }]
            : []),
        ]}
        emptyEvents="No history on this repair yet."
        facts={facts}
        related={related}
        handoffs={handoffs}
      />
    );
  }

  const item = plan as FbaBoardItem;
  const title = presentFact(item.display_title) || presentFact(item.fnsku) || `Shipment #${id}`;
  const facts: SearchDossierFact[] = [
    { id: 'shipment', label: 'Shipment', value: presentFact(item.shipment_ref) || `#${item.shipment_id}`, copy: true },
    ...(presentFact(item.amazon_shipment_id) ? [{ id: 'amazon', label: 'Amazon ID', value: item.amazon_shipment_id as string, copy: true }] : []),
    ...(presentFact(item.destination_fc) ? [{ id: 'fc', label: 'Ships to', value: item.destination_fc as string }] : []),
    ...(presentFact(item.due_date) ? [{ id: 'due', label: 'Due', value: item.due_date as string }] : []),
    ...item.tracking_numbers.map((t) => ({
      id: `tracking:${t.tracking_number}`,
      label: 'Tracking #',
      value: t.tracking_number,
      copy: true,
    })),
  ];
  const related: SearchDossierLink[] = [
    ...(presentFact(item.fnsku) ? [{ id: `fnsku:${item.fnsku}`, label: 'FNSKU', value: item.fnsku, target: { query: item.fnsku } }] : []),
    ...(presentFact(item.sku) ? [{ id: `sku:${item.sku}`, label: 'SKU', value: item.sku as string, target: { query: item.sku as string } }] : []),
  ];
  return (
    <SearchEntityRecord
      entity={label}
      reference={presentFact(item.shipment_ref) || String(id)}
      title={title}
      status={presentFact(item.shipment_status) || presentFact(item.item_status) || 'No status'}
      onBack={onBack}
      findings={[]}
      lines={[
        {
          id: item.item_id,
          title,
          facts: [
            ...(presentFact(item.fnsku) ? [{ label: 'FNSKU', value: item.fnsku }] : []),
            ...(presentFact(item.asin) ? [{ label: 'ASIN', value: item.asin as string }] : []),
            { label: 'Packed', value: `${item.actual_qty} of ${item.expected_qty}` },
            ...(presentFact(item.condition) ? [{ label: 'Condition', value: item.condition as string }] : []),
          ],
        },
      ]}
      linesLabel="item"
      emptyLines="No items on this shipment."
      events={[]}
      emptyEvents="No history on this shipment yet."
      facts={facts}
      related={related}
      handoffs={handoffs}
    />
  );
}
