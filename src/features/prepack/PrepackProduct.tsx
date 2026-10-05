'use client';

import { useEffect, useState } from 'react';
import { Camera, Pencil } from '@/components/Icons';
import { MobileV2ScanInput } from '@/components/mobile/v2/scan/MobileV2ScanInput';
import { PhotoHoverPeek } from '@/design-system/components/PhotoHoverPeek';
import { Button, TextField } from '@/design-system/primitives';
import type { PrepackCatalogChoice, PrepackKit } from '@/lib/prepack/types';
import { safeRandomUUID } from '@/lib/safe-uuid';
import { prepackErrorText, readJson } from './prepack-client';
import { ProductThumb } from './prepack-ui';

/** Catalog search by SKU, UPC/EAN/GTIN, MPN or title; a wedge or camera scan of the product label lands here too. */
export function ProductPicker({
  onChoose,
  onPhone,
  staffId,
  busy,
}: {
  onChoose: (choice: PrepackCatalogChoice) => void;
  onPhone: boolean;
  staffId: number;
  busy: boolean;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PrepackCatalogChoice[]>([]);
  const [searching, setSearching] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setSearching(true);
      fetch(`/api/prepack/catalog?q=${encodeURIComponent(q)}`, { credentials: 'include', cache: 'no-store', signal: controller.signal })
        .then((response) => readJson<{ items: PrepackCatalogChoice[] }>(response))
        .then((data) => setResults(data.items))
        .catch((cause) => {
          if (cause instanceof DOMException && cause.name === 'AbortError') return;
          setError(prepackErrorText(cause, 'Could not search the catalog'));
        })
        .finally(() => setSearching(false));
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const createTitleOnly = async () => {
    const title = query.trim();
    if (!title) return;
    setCreating(true);
    setError(null);
    try {
      const data = await readJson<{ item: { id: number; sku: string; productTitle: string } }>(
        await fetch('/api/sku-catalog/provisional', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ productTitle: title, sourceRef: safeRandomUUID(), staffId: staffId || undefined }),
        }),
      );
      onChoose({ id: data.item.id, sku: data.item.sku, title: data.item.productTitle, mpn: null, isActive: true, isProvisional: true, imageUrl: null });
    } catch (cause) {
      setError(prepackErrorText(cause, 'Could not create the title-only SKU'));
    } finally {
      setCreating(false);
    }
  };

  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (results[0]) onChoose(results[0]);
      }}
    >
      <TextField
        label="SKU, UPC, MPN, or title"
        value={query}
        onChange={(value) => {
          setQuery(value);
          setError(null);
        }}
        autoFocus={!onPhone}
        autoComplete="off"
        data-testid="prepack-title-input"
      />
      {onPhone ? (
        <MobileV2ScanInput onDecode={(value) => setQuery(value)} placeholder="Scan the product label" autoFocus={false} prominentCamera />
      ) : null}
      {error ? <p role="alert" className="text-role-caption font-semibold text-text-danger">{error}</p> : null}
      {searching ? <p className="text-role-caption text-text-muted">Searching catalog…</p> : null}
      {results.length > 0 ? (
        <div className="divide-y divide-mode-rule border-y border-mode-rule" role="listbox" aria-label="Catalog matches">
          {results.map((item) => (
            <Button
              key={item.id}
              variant="ghost"
              size="lg"
              role="option"
              aria-selected={false}
              radius="flush"
              className="h-auto min-h-14 w-full items-center justify-start gap-3 whitespace-normal px-3 py-2 text-left"
              onClick={() => onChoose(item)}
              disabled={busy}
              data-testid="prepack-catalog-choice"
            >
              <ProductThumb src={item.imageUrl} title={item.title} />
              <span className="flex min-w-0 flex-1 flex-col items-start gap-0.5">
                <span className="break-words text-sm font-semibold text-mode-ink">{item.title}</span>
                <span className="break-all font-mono text-role-caption text-text-muted">
                  {item.sku}
                  {item.mpn ? ` · MPN ${item.mpn}` : ''}
                  {item.isActive ? '' : ' · inactive catalog SKU'}
                </span>
              </span>
            </Button>
          ))}
        </div>
      ) : null}
      {query.trim().length >= 2 && !searching && results.length === 0 ? (
        <Button variant="secondary" size="lg" className="w-full" onClick={() => void createTitleOnly()} loading={creating}>
          Use title only
        </Button>
      ) : null}
    </form>
  );
}

/** The catalog identity card: SKU, MPN (editable), and the SKU's own reference photos. */
export function ProductCard({
  catalog,
  catalogPhotoCount,
  onCatalogPhoto,
  catalogPhotoLabel,
  catalogPhotoBusy,
  onSaved,
  onChange,
}: {
  catalog: PrepackCatalogChoice;
  catalogPhotoCount: number;
  onCatalogPhoto: () => void;
  catalogPhotoLabel: string;
  catalogPhotoBusy: boolean;
  onSaved: (kit: PrepackKit) => void;
  onChange?: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(catalog.mpn ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const kit = await readJson<PrepackKit>(
        await fetch(`/api/prepack/catalog/${catalog.id}`, {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mpn: draft.trim() || null }),
        }),
      );
      onSaved(kit);
      setEditing(false);
    } catch (cause) {
      setError(prepackErrorText(cause, 'Could not save the MPN'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-mode-control border border-emerald-300 bg-emerald-50 p-3" data-testid="prepack-title-choice">
      <div className="flex items-start gap-3">
        <PhotoHoverPeek src={catalog.imageUrl} alt={catalog.title} className="block shrink-0" testId="prepack-product-photo">
          <ProductThumb src={catalog.imageUrl} title={catalog.title} className="size-16" />
        </PhotoHoverPeek>
        <div className="min-w-0 flex-1">
          <p className="break-words font-semibold text-emerald-900">{catalog.title}</p>
          <p className="break-all font-mono text-role-caption text-emerald-800">
            {catalog.sku}
            {catalog.isActive ? '' : ' · inactive catalog SKU'}
          </p>
        </div>
        {onChange ? (
          <Button variant="ghost" size="md" onClick={onChange}>
            Change
          </Button>
        ) : null}
      </div>
      {editing ? (
        <form
          className="mt-2 flex items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <div className="min-w-0 flex-1">
            <TextField label="Manufacturer part number" value={draft} onChange={setDraft} autoFocus autoComplete="off" />
          </div>
          <Button type="submit" variant="primary" size="lg" loading={saving}>
            Save
          </Button>
        </form>
      ) : (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="font-mono text-role-caption text-emerald-900">{catalog.mpn ? `MPN ${catalog.mpn}` : 'No MPN recorded'}</span>
          <Button
            variant="ghost"
            size="sm"
            icon={<Pencil />}
            onClick={() => {
              setDraft(catalog.mpn ?? '');
              setEditing(true);
            }}
          >
            {catalog.mpn ? 'Edit MPN' : 'Add MPN'}
          </Button>
        </div>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className="text-role-caption text-emerald-900">
          {catalogPhotoCount === 1 ? '1 catalog photo' : `${catalogPhotoCount} catalog photos`}
        </span>
        <Button variant="secondary" size="sm" icon={<Camera />} onClick={onCatalogPhoto} loading={catalogPhotoBusy}>
          {catalogPhotoLabel}
        </Button>
      </div>
      {error ? <p role="alert" className="mt-2 text-role-caption font-semibold text-text-danger">{error}</p> : null}
    </div>
  );
}

