'use client';

/**
 * THE PRODUCT TILE (HANDOFF-orders-first, Step 3) — a SKU resolved to its
 * catalog identity, beside the order it came from. Read-only on purpose: the
 * catalog's write surfaces stay where they are; this tile is the desk's
 * "what is this, do we have it, where" card.
 *
 * Data: `GET /api/get-title-by-sku` (orders.view-adjacent read) — the same
 * four-table merge the scan surfaces use (Zoho items mirror wins the title),
 * including live stock and location. HOST-AGNOSTIC: no shell imports.
 */

import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';

interface ProductVM {
  readonly sku: string;
  readonly title: string;
  readonly stock: string;
  readonly location: string;
  readonly imageUrl: string;
  readonly skuCatalogId: number | null;
  readonly gtin: string | null;
  readonly packNotes: string | null;
  readonly qcFlags: readonly { id: number; label: string; category: string | null }[];
  readonly kitParts: readonly {
    id: number;
    name: string;
    type: string;
    qty: number;
    critical: boolean;
  }[];
}

async function fetchProduct(sku: string): Promise<ProductVM | null> {
  const res = await fetch(`/api/get-title-by-sku?sku=${encodeURIComponent(sku)}`);
  if (!res.ok) return null;
  const body = (await res.json()) as ProductVM & { error?: string };
  if (body.error || !body.title) return null;
  return body;
}

export function ProductTile({ sku }: { sku: string }) {
  const [vm, setVm] = useState<ProductVM | null | 'missing'>(null);

  useEffect(() => {
    let alive = true;
    setVm(null);
    fetchProduct(sku)
      .then((p) => {
        if (alive) setVm(p ?? 'missing');
      })
      .catch(() => {
        if (alive) setVm('missing');
      });
    return () => {
      alive = false;
    };
  }, [sku]);

  if (vm === null) return <div className="p-2 text-xs text-muted-foreground">Resolving {sku}…</div>;
  if (vm === 'missing') {
    return <div className="p-2 text-xs text-muted-foreground">Nothing in the catalog matched “{sku}”.</div>;
  }

  const stockN = Number(vm.stock);
  const inStock = Number.isFinite(stockN) && stockN > 0;

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col">
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto p-3">
        <div className="text-base font-semibold text-foreground">{vm.title}</div>

        {vm.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- catalog
          // image hosts vary by platform; next/image needs a domain allowlist.
          <img className="max-h-56 max-w-full self-start border border-border object-contain" src={vm.imageUrl} alt={vm.title} />
        ) : null}

        <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 text-xs [&_dd]:min-w-0 [&_dd]:[overflow-wrap:anywhere] [&_dt]:self-baseline [&_dt]:font-condensed [&_dt]:text-technical [&_dt]:font-bold [&_dt]:uppercase [&_dt]:tracking-[0.1em] [&_dt]:text-muted-foreground">
          <dt>SKU</dt>
          <dd className="mono">{vm.sku}</dd>
          <dt>Stock</dt>
          <dd>
            {inStock ? (
              <span className="mono">{vm.stock}</span>
            ) : (
              <Badge variant="outline" className="border-edge-warning font-condensed text-technical font-bold uppercase tracking-[0.08em] text-ink-warning">NONE ON HAND</Badge>
            )}
            {vm.location ? <span className="mono"> · {vm.location}</span> : null}
          </dd>
          {vm.gtin ? (
            <>
              <dt>GTIN</dt>
              <dd className="mono">{vm.gtin}</dd>
            </>
          ) : null}
          {vm.skuCatalogId !== null ? (
            <>
              <dt>Catalog</dt>
              <dd className="mono">#{vm.skuCatalogId}</dd>
            </>
          ) : null}
          <dt>Sticker</dt>
          <dd>
            <a
              className="mono cursor-pointer text-ink-accent underline underline-offset-4"
              href={`/s/${encodeURIComponent(vm.sku)}`}
              target="_blank"
              rel="noreferrer"
              title="The public GS1 resolver printed on this SKU's stickers (T31)"
            >
              /s/{vm.sku}
            </a>
          </dd>
        </dl>

        {vm.packNotes ? (
          <div className="flex flex-col gap-1">
            <div className="font-condensed text-technical font-bold uppercase tracking-[0.14em] text-muted-foreground">Pack notes</div>
            <div className="text-xs leading-relaxed text-muted-foreground">{vm.packNotes}</div>
          </div>
        ) : null}

        {vm.qcFlags.length > 0 ? (
          <div className="flex flex-col gap-1">
            <div className="font-condensed text-technical font-bold uppercase tracking-[0.14em] text-muted-foreground">QC checks</div>
            <ul className="flex list-none flex-col gap-1 text-xs [&_li]:border-l-2 [&_li]:border-border [&_li]:pl-2">
              {vm.qcFlags.map((f) => (
                <li key={f.id}>
                  {f.label}
                  {f.category ? <span className="block text-technical text-muted-foreground">{f.category}</span> : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {vm.kitParts.length > 0 ? (
          <div className="flex flex-col gap-1">
            <div className="font-condensed text-technical font-bold uppercase tracking-[0.14em] text-muted-foreground">Kit parts</div>
            <ul className="flex list-none flex-col gap-1 text-xs [&_li]:border-l-2 [&_li]:border-border [&_li]:pl-2">
              {vm.kitParts.map((p) => (
                <li key={p.id}>
                  <span className="mono">{p.qty}×</span> {p.name}
                  {p.critical ? <Badge variant="outline" className="ml-1 border-edge-warning font-condensed text-technical font-bold uppercase tracking-[0.08em] text-ink-warning">CRITICAL</Badge> : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </div>
  );
}
