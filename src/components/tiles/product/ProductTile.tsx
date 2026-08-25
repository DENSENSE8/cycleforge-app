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

  if (vm === null) return <div className="tile-note">Resolving {sku}…</div>;
  if (vm === 'missing') {
    return <div className="tile-note">Nothing in the catalog matched “{sku}”.</div>;
  }

  const stockN = Number(vm.stock);
  const inStock = Number.isFinite(stockN) && stockN > 0;

  return (
    <div className="orders-tile">
      <div className="orders-tile-scroll orders-detail">
        <div className="orders-detail-title">{vm.title}</div>

        {vm.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- catalog
          // image hosts vary by platform; next/image needs a domain allowlist.
          <img className="product-tile-photo" src={vm.imageUrl} alt={vm.title} />
        ) : null}

        <dl className="orders-facts">
          <dt>SKU</dt>
          <dd className="mono">{vm.sku}</dd>
          <dt>Stock</dt>
          <dd>
            {inStock ? (
              <span className="mono">{vm.stock}</span>
            ) : (
              <span className="orders-chip warn">NONE ON HAND</span>
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
              className="orders-link mono"
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
          <div className="orders-band">
            <div className="recent-band-label standalone">Pack notes</div>
            <div className="settings-copy">{vm.packNotes}</div>
          </div>
        ) : null}

        {vm.qcFlags.length > 0 ? (
          <div className="orders-band">
            <div className="recent-band-label standalone">QC checks</div>
            <ul className="orders-trail">
              {vm.qcFlags.map((f) => (
                <li key={f.id}>
                  {f.label}
                  {f.category ? <span className="orders-trail-meta">{f.category}</span> : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {vm.kitParts.length > 0 ? (
          <div className="orders-band">
            <div className="recent-band-label standalone">Kit parts</div>
            <ul className="orders-trail">
              {vm.kitParts.map((p) => (
                <li key={p.id}>
                  <span className="mono">{p.qty}×</span> {p.name}
                  {p.critical ? <span className="orders-chip warn">CRITICAL</span> : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </div>
  );
}
