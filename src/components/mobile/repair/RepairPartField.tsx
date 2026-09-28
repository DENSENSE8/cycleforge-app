'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Button } from '@/design-system/primitives';
import { cornerClass } from '@/design-system/tokens/radius';
import {
  isProvisionalSku,
  normalizeProvisionalBarcode,
  provisionalSkuForBarcode,
} from '@/lib/inventory/provisional-sku';
import { cn } from '@/utils/_cn';
import { REPAIR_FIELD_INPUT_CLASS, ScanValueField } from './ScanValueField';

export interface RepairPartValue {
  sku: string | null;
  title: string;
  provisional: boolean;
}

/** `GET /api/sku-catalog/search?searchField=zoho_catalog` row — only what this field reads. */
interface CatalogItem {
  id: number | string;
  sku: string | null;
  /** Zoho item name — the SKU identity title. Never re-titled here. */
  product_title: string | null;
}

/** `GET /api/sku-catalog/provisional` row. `barcode` is stored normalized. */
interface ProvisionalItem {
  sku: string;
  productTitle: string;
  barcode: string;
}

interface PartHit {
  key: string;
  sku: string;
  title: string;
  provisional: boolean;
  /** SKU (or a provisional's barcode) equals the query exactly. */
  exact: boolean;
}

type SearchState =
  | { kind: 'idle' }
  | { kind: 'loading'; q: string }
  | { kind: 'ok'; q: string; hits: PartHit[]; exact: PartHit | null }
  | { kind: 'forbidden'; q: string }
  | { kind: 'error'; q: string; message: string };

const SEARCH_DEBOUNCE_MS = 250;
const MIN_QUERY = 2;
const MAX_HITS = 8;
const MIN_TITLE = 2;
const MAX_TITLE = 200;
const MAX_BARCODE = 64;

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function getJson<T>(url: string, signal: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal, cache: 'no-store' });
  const json = (await res.json().catch(() => null)) as ({ success?: boolean; error?: string } & T) | null;
  if (!res.ok || !json || json.success === false) {
    throw new HttpError(res.status, json?.error || `HTTP ${res.status}`);
  }
  return json;
}

function mergeHits(q: string, catalog: CatalogItem[], provisionals: ProvisionalItem[]) {
  const lower = q.toLowerCase();
  const upper = q.toUpperCase();
  const norm = normalizeProvisionalBarcode(q);

  const provHits: PartHit[] = provisionals
    .filter(
      (p) =>
        p.productTitle.toLowerCase().includes(lower) ||
        p.sku.toLowerCase().includes(lower) ||
        p.barcode.toLowerCase().includes(lower) ||
        (norm !== '' && p.barcode.includes(norm)),
    )
    .map((p) => ({
      key: `tmp:${p.sku}`,
      sku: p.sku,
      title: p.productTitle.trim() || p.sku,
      provisional: true,
      exact: p.sku.toUpperCase() === upper || (norm !== '' && p.barcode === norm),
    }));

  const catHits: PartHit[] = catalog.flatMap((c) => {
    const sku = c.sku?.trim();
    if (!sku) return [];
    return [
      {
        key: `cat:${c.id}:${sku}`,
        sku,
        title: c.product_title?.trim() || sku,
        provisional: isProvisionalSku(sku),
        exact: sku.toUpperCase() === upper,
      },
    ];
  });

  // An exact placeholder match (usually a scanned barcode) outranks everything.
  const seen = new Set<string>();
  const ordered = [...provHits.filter((h) => h.exact), ...catHits, ...provHits.filter((h) => !h.exact)].filter(
    (h) => {
      const k = h.sku.toUpperCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    },
  );
  return { hits: ordered.slice(0, MAX_HITS), exact: ordered.find((h) => h.exact) ?? null };
}

function TemporaryChip() {
  return (
    <span
      className={cn(
        'shrink-0 bg-amber-100 px-1.5 text-role-micro font-semibold text-amber-800',
        cornerClass('chip'),
      )}
    >
      Temporary
    </span>
  );
}

/** Pick the exact part a repair tech removed or installed: */
export function RepairPartField({
  label,
  repairId,
  value,
  onChange,
  disabled = false,
}: {
  /** e.g. 'Part removed', 'Part installed'. */
  label: string;
  /** Used to mint a label-less part number. */
  repairId: number;
  value: RepairPartValue | null;
  onChange: (value: RepairPartValue | null) => void;
  disabled?: boolean;
}) {
  const uid = useId();
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState<SearchState>({ kind: 'idle' });
  const [retryNonce, setRetryNonce] = useState(0);
  /** Fetched once, on the first search; placeholders only change when someone mints one. */
  const provisionalRef = useRef<ProvisionalItem[] | null>(null);
  /** The trimmed value of a camera scan still waiting for its results. */
  const pendingScanRef = useRef<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [numberDraft, setNumberDraft] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createNote, setCreateNote] = useState<string | null>(null);
  const createAbortRef = useRef<AbortController | null>(null);

  const trimmed = query.trim();
  const active = trimmed.length >= MIN_QUERY;

  useEffect(() => () => createAbortRef.current?.abort(), []);

  // Debounced search. The cleanup aborts the in-flight request on every new
  // keystroke and on unmount, so a slow answer never paints over a newer query.
  useEffect(() => {
    const q = query.trim();
    if (q.length < MIN_QUERY) return;
    const controller = new AbortController();
    const { signal } = controller;
    const delay = pendingScanRef.current === q ? 0 : SEARCH_DEBOUNCE_MS;

    const timer = window.setTimeout(() => {
      setSearch({ kind: 'loading', q });
      const catalogP = getJson<{ items?: CatalogItem[] }>(
        `/api/sku-catalog/search?searchField=zoho_catalog&q=${encodeURIComponent(q)}&limit=${MAX_HITS}`,
        signal,
      ).then((json) => (Array.isArray(json.items) ? json.items : []));
      const cached = provisionalRef.current;
      const provisionalP = cached
        ? Promise.resolve(cached)
        : getJson<{ items?: ProvisionalItem[] }>('/api/sku-catalog/provisional', signal).then((json) => {
            const items = Array.isArray(json.items) ? json.items : [];
            provisionalRef.current = items;
            return items;
          });

      Promise.all([catalogP, provisionalP])
        .then(([catalog, provisionals]) => {
          if (signal.aborted) return;
          setSearch({ kind: 'ok', q, ...mergeHits(q, catalog, provisionals) });
        })
        .catch((err: unknown) => {
          if (signal.aborted) return;
          if (err instanceof HttpError && err.status === 403) {
            setSearch({ kind: 'forbidden', q });
            return;
          }
          setSearch({ kind: 'error', q, message: err instanceof Error ? err.message : 'Search failed' });
        });
    }, delay);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, retryNonce]);

  const choose = useCallback(
    (next: RepairPartValue) => {
      pendingScanRef.current = null;
      setCreateOpen(false);
      setCreateError(null);
      onChange(next);
    },
    [onChange],
  );

  // A scan that lands exactly on a SKU (or a placeholder's barcode) picks it.
  useEffect(() => {
    if (search.kind !== 'ok' || pendingScanRef.current !== search.q) return;
    pendingScanRef.current = null;
    if (search.exact) {
      choose({ sku: search.exact.sku, title: search.exact.title, provisional: search.exact.provisional });
    }
  }, [search, choose]);

  const handleScanned = useCallback((scanned: string) => {
    pendingScanRef.current = scanned.trim();
  }, []);

  const clear = () => {
    setQuery('');
    setSearch({ kind: 'idle' });
    setCreateNote(null);
    setCreateError(null);
    setCreateOpen(false);
    pendingScanRef.current = null;
    onChange(null);
  };

  const openCreate = () => {
    // No spaces and at least one digit reads as a part number, not a name.
    const code = trimmed !== '' && !/\s/.test(trimmed) && /\d/.test(trimmed);
    setTitleDraft(code ? '' : trimmed);
    setNumberDraft(code ? trimmed : '');
    setCreateError(null);
    setCreateOpen(true);
  };

  const titleValue = titleDraft.trim();
  const numberValue = numberDraft.trim();
  const mintedSku = provisionalSkuForBarcode(numberValue);
  const createProblem =
    titleValue.length < MIN_TITLE
      ? 'Give the part a title (2+ characters).'
      : titleValue.length > MAX_TITLE
        ? `Keep the title under ${MAX_TITLE} characters.`
        : !numberValue
          ? 'Scan or type the part number, or tap “No number on the part”.'
          : numberValue.length > MAX_BARCODE
            ? `Keep the number under ${MAX_BARCODE} characters.`
            : !mintedSku
              ? 'The number needs at least one letter or digit.'
              : null;

  const create = async () => {
    if (createProblem || creating) return;
    createAbortRef.current?.abort();
    const controller = new AbortController();
    createAbortRef.current = controller;
    setCreating(true);
    setCreateError(null);
    try {
      const res = await fetch('/api/sku-catalog/provisional', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ barcode: numberValue, productTitle: titleValue }),
        signal: controller.signal,
      });
      const json = (await res.json().catch(() => null)) as
        | { success?: boolean; error?: string; item?: ProvisionalItem }
        | null;
      if (res.status === 403) {
        throw new Error('Your role cannot create temporary parts — use the name without a SKU or ask a lead.');
      }
      if (!res.ok || !json?.success || !json.item) {
        throw new Error(json?.error || `Could not create the temporary part (HTTP ${res.status}).`);
      }
      const item = json.item;
      const cached = provisionalRef.current;
      if (cached && !cached.some((p) => p.sku === item.sku)) provisionalRef.current = [item, ...cached];
      // Idempotent per barcode: an existing placeholder keeps its own title.
      setCreateNote(
        item.productTitle.trim() !== titleValue
          ? `That number already had a temporary part: ${item.productTitle} — using it.`
          : null,
      );
      choose({ sku: item.sku, title: item.productTitle, provisional: true });
    } catch (err) {
      if (controller.signal.aborted) return;
      setCreateError(err instanceof Error ? err.message : 'Could not create the temporary part.');
    } finally {
      if (!controller.signal.aborted) setCreating(false);
    }
  };

  if (value) {
    return (
      <div className="flex flex-col gap-1.5">
        <span id={`${uid}-label`} className="text-role-caption font-semibold text-mode-ink">
          {label}
        </span>
        <div
          role="group"
          aria-labelledby={`${uid}-label`}
          className="flex items-start justify-between gap-3 rounded-mode border border-mode-edge bg-mode-panel p-mode-page"
        >
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="text-mode-body font-semibold text-mode-ink">{value.title}</span>
            <span className="flex flex-wrap items-center gap-2">
              {value.sku ? (
                <span className="truncate font-mono text-role-caption text-mode-ink">{value.sku}</span>
              ) : (
                <span className="text-role-caption text-mode-muted">No SKU</span>
              )}
              {value.provisional ? <TemporaryChip /> : null}
            </span>
          </div>
          <Button
            variant="secondary"
            size="sm"
            disabled={disabled}
            onClick={clear}
            ariaLabel={`Change ${label.toLowerCase()}`}
            className="shrink-0 rounded-mode"
          >
            Change
          </Button>
        </div>
        {createNote ? (
          <p role="status" className="text-role-caption text-mode-muted">
            {createNote}
          </p>
        ) : null}
      </div>
    );
  }

  const shown = active && search.kind !== 'idle' && search.q === trimmed ? search : null;
  const staleHits = active && search.kind === 'ok' && search.q !== trimmed ? search.hits : null;
  const hits = shown?.kind === 'ok' ? shown.hits : staleHits ?? [];
  const searching = active && (!shown || shown.kind === 'loading');

  return (
    <div className="flex flex-col gap-2">
      <ScanValueField
        id={`${uid}-search`}
        label={label}
        value={query}
        onChange={setQuery}
        placeholder="Search part name or SKU, or scan"
        disabled={disabled || creating}
        onScanned={handleScanned}
      />

      {createOpen ? (
        <div className="flex flex-col gap-3 rounded-mode border border-mode-edge bg-mode-panel p-mode-page">
          <p className="text-mode-body font-semibold text-mode-ink">Create temporary part</p>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${uid}-tmp-title`} className="text-role-caption font-semibold text-mode-ink">
              Part title
            </label>
            <input
              id={`${uid}-tmp-title`}
              type="text"
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              placeholder="What the part is, e.g. Brake lever, left"
              disabled={disabled || creating}
              autoComplete="off"
              required
              minLength={MIN_TITLE}
              maxLength={MAX_TITLE}
              className={REPAIR_FIELD_INPUT_CLASS}
            />
          </div>
          <div className="flex flex-col gap-1">
            <ScanValueField
              id={`${uid}-tmp-number`}
              label="Part number or barcode"
              value={numberDraft}
              onChange={setNumberDraft}
              mono
              disabled={disabled || creating}
              helper={`Becomes ${mintedSku ?? 'TMP-<number>'}; pair it to the real SKU later from stock.`}
            />
            <Button
              variant="ghost"
              size="sm"
              disabled={disabled || creating}
              onClick={() => setNumberDraft(`RS${repairId}-${Date.now().toString(36).toUpperCase()}`)}
              className="self-start rounded-mode"
            >
              No number on the part
            </Button>
          </div>

          {createError ? (
            <p role="alert" className="text-role-caption font-semibold text-rose-700">
              {createError}
            </p>
          ) : null}

          <div className="flex gap-2">
            <Button
              variant="secondary"
              disabled={creating}
              onClick={() => {
                setCreateOpen(false);
                setCreateError(null);
              }}
              className="flex-1 rounded-mode"
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={disabled || createProblem !== null}
              loading={creating}
              onClick={() => void create()}
              className="flex-1 rounded-mode"
            >
              {creating ? 'Creating' : 'Create'}
            </Button>
          </div>
          {createProblem && !createError ? (
            <p className="text-role-caption text-mode-muted">{createProblem}</p>
          ) : null}
        </div>
      ) : (
        <>
          <div aria-live="polite" className="flex flex-col gap-1.5">
            {searching ? <p className="text-role-caption text-mode-muted">Searching…</p> : null}
            {shown?.kind === 'forbidden' ? (
              <p className="text-role-caption text-mode-muted">
                No catalog access for your role — you can still use the typed name.
              </p>
            ) : null}
            {shown?.kind === 'error' ? (
              <div className="flex items-center justify-between gap-3">
                <p role="alert" className="min-w-0 text-role-caption font-semibold text-rose-700">
                  Search failed — {shown.message}
                </p>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={disabled}
                  onClick={() => setRetryNonce((n) => n + 1)}
                  className="shrink-0 rounded-mode"
                >
                  Retry
                </Button>
              </div>
            ) : null}
            {shown?.kind === 'ok' && hits.length === 0 ? (
              <p className="text-role-caption text-mode-muted">No match in the catalog or temporary parts.</p>
            ) : null}
          </div>

          {hits.length > 0 ? (
            <ul aria-label={`${label} matches`} className="flex flex-col gap-1.5">
              {hits.map((hit) => (
                <li key={hit.key}>
                  {/* ds-raw-button: full-width result row (title over mono SKU + chip), not an action button */}
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => choose({ sku: hit.sku, title: hit.title, provisional: hit.provisional })}
                    className="flex min-h-mode-hit w-full flex-col items-start justify-center gap-0.5 rounded-mode border border-mode-edge bg-mode-panel px-mode-page py-2 text-left transition-colors active:bg-mode-hover disabled:opacity-60"
                  >
                    <span className="text-mode-body font-semibold text-mode-ink">{hit.title}</span>
                    <span className="flex items-center gap-2">
                      <span className="font-mono text-role-caption text-mode-muted">{hit.sku}</span>
                      {hit.provisional ? <TemporaryChip /> : null}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          <div className="flex flex-col gap-1.5 border-t border-mode-rule pt-2">
            {trimmed ? (
              <Button
                variant="secondary"
                disabled={disabled}
                onClick={() => choose({ sku: null, title: trimmed, provisional: false })}
                className="w-full justify-start rounded-mode"
              >
                {`Use “${trimmed}” without a SKU`}
              </Button>
            ) : null}
            <Button
              variant="ghost"
              disabled={disabled}
              onClick={openCreate}
              className="w-full justify-start rounded-mode"
            >
              Not in the system? Create temporary part
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
