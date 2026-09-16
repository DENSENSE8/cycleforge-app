'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Check, ScanBarcode, Upload } from '@/components/Icons';
import { Button } from '@/design-system/primitives';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { IntakeCombobox } from '@/components/outbound/orders/intake/IntakeCombobox';
import {
  emptyCanonicalOrderIntake,
  type CanonicalOrderIntake,
} from '@/lib/orders/canonical-order-intake';
import {
  MobileOrderSubmissionError,
  submitMobileOrder,
} from '@/lib/orders/mobile-order-submission';
import { safeRandomUUID } from '@/lib/safe-uuid';
import { CONDITION_GRADES, conditionLabel } from '@/lib/conditions';
import { cn } from '@/utils/_cn';

type Suggestion = {
  id: string;
  label: string;
  draft: Partial<CanonicalOrderIntake>;
  unavailableReason?: string;
};

type SuggestionResponse = {
  success?: boolean;
  connected?: boolean;
  suggestions?: Suggestion[];
  error?: string;
};

const CHANNELS = [
  { value: 'ebay', label: 'eBay' },
  { value: 'ecwid', label: 'Ecwid' },
  { value: 'amazon', label: 'Amazon' },
  { value: 'walmart', label: 'Walmart' },
  { value: 'shopify', label: 'Shopify' },
  { value: 'Manual', label: 'Manual' },
] as const;

function Field({ label, id, required, children }: { label: string; id: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="stack-tight">
      <Label htmlFor={id}>
        {label} {required ? <span aria-hidden="true">*</span> : null}
      </Label>
      {children}
    </div>
  );
}

function draftWithSuggestion(base: CanonicalOrderIntake, suggestion: Suggestion): CanonicalOrderIntake {
  return {
    ...base,
    ...suggestion.draft,
    platformInferred: suggestion.draft.platformInferred ?? base.platformInferred,
    platformChosen: suggestion.draft.platformChosen ?? base.platformChosen,
    trackingNumbers: suggestion.draft.trackingNumbers ?? base.trackingNumbers,
  };
}

export default function MobileOrderIntakeForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [draft, setDraft] = useState<CanonicalOrderIntake>(() => emptyCanonicalOrderIntake('manual'));
  const [saleAmount, setSaleAmount] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [isUrgent, setIsUrgent] = useState(false);
  const [orderQuery, setOrderQuery] = useState('');
  const [productQuery, setProductQuery] = useState('');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [suggestionKind, setSuggestionKind] = useState<'orders' | 'products'>('orders');
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [files, setFiles] = useState<{ shipping_label?: File; packing_slip?: File }>({});
  const [submitting, setSubmitting] = useState(false);
  const [createdOrderId, setCreatedOrderId] = useState<number | null>(null);
  const [error, setError] = useState<MobileOrderSubmissionError | null>(null);
  const [success, setSuccess] = useState(false);
  const eventIdRef = useRef<string | null>(null);
  const scanValue = searchParams.get('scan')?.trim() ?? '';

  useEffect(() => {
    if (!scanValue) return;
    setDraft((current) => ({ ...current, orderNumber: current.orderNumber || scanValue }));
    router.replace('/m/orders/new');
  }, [router, scanValue]);

  const channelOptions = useMemo(
    () => CHANNELS.map((option) => ({ value: option.value, label: option.label })),
    [],
  );
  const locked = createdOrderId != null;
  const conditionOptions = useMemo(
    () => CONDITION_GRADES.map((value) => ({ value, label: conditionLabel(value, 'option') })),
    [],
  );
  const activeQuery = suggestionKind === 'orders' ? orderQuery : productQuery;

  useEffect(() => {
    if (activeQuery.trim().length < 2) {
      setSuggestions([]);
      setConnected(null);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSuggestionsLoading(true);
      try {
        const response = await fetch(
          `/api/orders/intake-suggestions?q=${encodeURIComponent(activeQuery)}&kind=${suggestionKind}`,
          { credentials: 'same-origin', signal: controller.signal },
        );
        const body = (await response.json().catch(() => ({}))) as SuggestionResponse;
        if (!response.ok || !body.success) throw new Error(body.error || 'Suggestions unavailable.');
        setConnected(body.connected === true);
        setSuggestions(body.suggestions ?? []);
      } catch (requestError) {
        if (requestError instanceof DOMException && requestError.name === 'AbortError') return;
        setSuggestions([]);
        setConnected(null);
      } finally {
        setSuggestionsLoading(false);
      }
    }, 250);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [activeQuery, suggestionKind]);

  const update = <K extends keyof CanonicalOrderIntake>(key: K, value: CanonicalOrderIntake[K]) => {
    if (locked && key !== 'docsNotRequired') return;
    setDraft((current) => ({ ...current, [key]: value }));
    setError(null);
    setSuccess(false);
  };

  const applySuggestion = (suggestion: Suggestion) => {
    if (suggestion.unavailableReason) return;
    setDraft((current) => draftWithSuggestion(current, suggestion));
    if (suggestionKind === 'orders') setOrderQuery(suggestion.id);
    else setProductQuery(suggestion.label);
    setSuggestions([]);
    setError(null);
  };

  const setFile = (type: 'shipping_label' | 'packing_slip', file: File | undefined) => {
    if (!file) return;
    setFiles((current) => ({ ...current, [type]: file }));
    setError(null);
    setSuccess(false);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccess(false);
    const clientEventId = eventIdRef.current ?? safeRandomUUID();
    eventIdRef.current = clientEventId;
    try {
      const result = await submitMobileOrder(
        {
          draft,
          saleAmount,
          currency,
          isUrgent,
          clientEventId,
          files,
          existingOrderId: createdOrderId ?? undefined,
        },
        { onCreated: (id) => setCreatedOrderId(id) },
      );
      setCreatedOrderId(result.orderId);
      setSuccess(true);
      setError(null);
    } catch (submissionError) {
      const normalized = submissionError instanceof MobileOrderSubmissionError
        ? submissionError
        : new MobileOrderSubmissionError('Could not add the order.', createdOrderId, 'unknown');
      setError(normalized);
      if (normalized.orderId) setCreatedOrderId(normalized.orderId);
    } finally {
      setSubmitting(false);
    }
  };

  const startAnother = () => {
    setDraft(emptyCanonicalOrderIntake('manual'));
    setSaleAmount('');
    setCurrency('USD');
    setIsUrgent(false);
    setFiles({});
    setCreatedOrderId(null);
    setError(null);
    setSuccess(false);
    eventIdRef.current = null;
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="mx-auto flex w-full max-w-xl flex-col gap-4 px-4 pb-10 pt-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-role-eyebrow text-text-soft">Outbound</p>
          <h2 className="text-role-title font-semibold text-text-default">Add order</h2>
          <p className="mt-1 text-role-caption text-text-soft">Create a live To-ship order from the phone.</p>
        </div>
        <Button type="button" variant="secondary" size="sm" onClick={() => router.push('/m/scan?returnTo=/m/orders/new')} icon={<ScanBarcode className="h-4 w-4" />}>
          Scan
        </Button>
      </div>

      <section className="stack-section border border-border-soft bg-surface-card inset-card" aria-labelledby="identity-heading">
        <h3 id="identity-heading" className="text-role-data font-semibold text-text-default">Identity</h3>
        <Field label="Order number" id="mobile-order-number" required>
          <Input id="mobile-order-number" value={draft.orderNumber} onChange={(event) => update('orderNumber', event.target.value)} disabled={locked} required aria-required="true" autoComplete="off" />
        </Field>
        <Field label="Selling channel" id="mobile-order-channel" required>
          <IntakeCombobox triggerId="mobile-order-channel" value={(draft.platformInferred ?? draft.platformChosen) || null} onChange={(value) => update('platformChosen', value)} options={channelOptions} disabled={locked} ariaLabel="Selling channel" placeholder="Choose a channel" />
        </Field>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant={suggestionKind === 'orders' ? 'primary' : 'secondary'} size="sm" disabled={locked} onClick={() => setSuggestionKind('orders')}>Ecwid orders</Button>
          <Button type="button" variant={suggestionKind === 'products' ? 'primary' : 'secondary'} size="sm" disabled={locked} onClick={() => setSuggestionKind('products')}>Ecwid products</Button>
        </div>
        <Field label={suggestionKind === 'orders' ? 'Find linked Ecwid order' : 'Find linked Ecwid product'} id="mobile-ecwid-search">
          <Input id="mobile-ecwid-search" value={activeQuery} onChange={(event) => suggestionKind === 'orders' ? setOrderQuery(event.target.value) : setProductQuery(event.target.value)} disabled={locked} placeholder="Search by number or name" autoComplete="off" />
        </Field>
        {suggestionsLoading ? <p className="text-role-caption text-text-soft" role="status">Searching Ecwid…</p> : null}
        {connected === false && activeQuery.length >= 2 ? <p className="text-role-caption text-text-soft" role="status">Ecwid is not connected for this workspace. Manual entry is available.</p> : null}
        {suggestions.length > 0 ? (
          <ul className="divide-y divide-border-hairline border-y border-border-hairline" aria-label="Ecwid suggestions">
            {suggestions.map((suggestion) => (
              <li key={suggestion.id} className="py-2">
                <Button type="button" variant="ghost" className={cn('h-auto w-full justify-start whitespace-normal py-2 text-left text-role-body', suggestion.unavailableReason ? 'cursor-not-allowed text-text-soft' : 'text-text-default')} onClick={() => applySuggestion(suggestion)} disabled={locked || Boolean(suggestion.unavailableReason)}>
                  <span className="block">{suggestion.label}</span>
                  {suggestion.unavailableReason ? <span className="mt-1 block text-role-caption text-text-soft">{suggestion.unavailableReason}</span> : null}
                </Button>
              </li>
            ))}
          </ul>
        ) : null}
        <Field label="Product title" id="mobile-product-title" required>
          <Input id="mobile-product-title" value={draft.productTitle} onChange={(event) => update('productTitle', event.target.value)} disabled={locked} required aria-required="true" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Item number" id="mobile-item-number"><Input id="mobile-item-number" value={draft.itemNumber} onChange={(event) => update('itemNumber', event.target.value)} disabled={locked} /></Field>
          <Field label="SKU" id="mobile-sku"><Input id="mobile-sku" value={draft.sku} onChange={(event) => update('sku', event.target.value)} disabled={locked} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Quantity" id="mobile-quantity" required><Input id="mobile-quantity" type="number" min="1" step="1" value={draft.quantity} onChange={(event) => update('quantity', event.target.value)} disabled={locked} required aria-required="true" /></Field>
          <Field label="Condition" id="mobile-condition"><IntakeCombobox triggerId="mobile-condition" value={draft.condition || null} onChange={(value) => update('condition', value)} options={conditionOptions} disabled={locked} ariaLabel="Condition" placeholder="Choose grade" /></Field>
        </div>
      </section>

      <section className="stack-section border border-border-soft bg-surface-card inset-card" aria-labelledby="shipping-heading">
        <h3 id="shipping-heading" className="text-role-data font-semibold text-text-default">Shipping</h3>
        <Field label="Tracking number(s)" id="mobile-tracking"><Textarea id="mobile-tracking" value={draft.trackingNumbers.join('\n')} onChange={(event) => update('trackingNumbers', event.target.value.split(/[\n,;]+/).map((value) => value.trim()).filter(Boolean))} disabled={locked} placeholder="One per line" rows={3} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Sale amount" id="mobile-sale-amount"><Input id="mobile-sale-amount" inputMode="decimal" value={saleAmount} onChange={(event) => setSaleAmount(event.target.value)} disabled={locked} placeholder="0.00" /></Field>
          <Field label="Currency" id="mobile-currency"><Input id="mobile-currency" value={currency} onChange={(event) => setCurrency(event.target.value.toUpperCase())} disabled={locked} maxLength={3} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Weight (oz)" id="mobile-weight"><Input id="mobile-weight" type="number" min="0" step="any" value={draft.weightOz ?? ''} onChange={(event) => update('weightOz', event.target.value ? Number(event.target.value) : null)} disabled={locked} /></Field>
          <Field label="Length (in)" id="mobile-length"><Input id="mobile-length" type="number" min="0" step="any" value={draft.dimL ?? ''} onChange={(event) => update('dimL', event.target.value ? Number(event.target.value) : null)} disabled={locked} /></Field>
          <Field label="Width (in)" id="mobile-width"><Input id="mobile-width" type="number" min="0" step="any" value={draft.dimW ?? ''} onChange={(event) => update('dimW', event.target.value ? Number(event.target.value) : null)} disabled={locked} /></Field>
          <Field label="Height (in)" id="mobile-height"><Input id="mobile-height" type="number" min="0" step="any" value={draft.dimH ?? ''} onChange={(event) => update('dimH', event.target.value ? Number(event.target.value) : null)} disabled={locked} /></Field>
        </div>
        <label className="flex items-center gap-2 text-role-body text-text-default" htmlFor="mobile-urgent"><Checkbox id="mobile-urgent" checked={isUrgent} disabled={locked} onCheckedChange={(value) => setIsUrgent(value === true)} /> Mark urgent</label>
      </section>

      <section className="stack-section border border-border-soft bg-surface-card inset-card" aria-labelledby="documents-heading">
        <h3 id="documents-heading" className="text-role-data font-semibold text-text-default">Documents</h3>
        <p className="text-role-caption text-text-soft">Upload an existing label or packing slip. The file is attached after the order is durable.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {(['shipping_label', 'packing_slip'] as const).map((type) => (
            <label key={type} className="flex cursor-pointer items-center gap-2 border border-border-soft inset-field text-role-body text-text-default" htmlFor={`mobile-${type}`}>
              <Upload className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate">{files[type]?.name ?? (type === 'shipping_label' ? 'Add shipping label' : 'Add packing slip')}</span>
              <input id={`mobile-${type}`} type="file" accept="application/pdf,image/png,image/jpeg" className="sr-only" onChange={(event) => { setFile(type, event.target.files?.[0]); event.currentTarget.value = ''; }} />
            </label>
          ))}
        </div>
        <label className="flex items-start gap-2 text-role-body text-text-default" htmlFor="mobile-docs-exempt"><Checkbox id="mobile-docs-exempt" checked={draft.docsNotRequired} onCheckedChange={(value) => update('docsNotRequired', value === true)} /><span>Documents are not required for this order.</span></label>
      </section>

      {error ? <p className="border border-rose-200 bg-rose-50 inset-field text-role-caption text-rose-700" role="alert">{error.message}{error.orderId ? ` Order ${error.orderId} exists; retry to finish ${error.stage}.` : ''}</p> : null}
      {success ? <div className="flex flex-wrap items-center gap-2 border border-emerald-200 bg-emerald-50 inset-field text-role-body text-emerald-800" role="status"><Check className="h-4 w-4" aria-hidden="true" /> Order added to To-ship.{createdOrderId ? <a className="underline" href={`/m/orders/${createdOrderId}`}>Open order</a> : null}<Button type="button" variant="secondary" size="sm" onClick={startAnother}>Add another</Button></div> : null}
      <Button type="submit" variant="primary" size="lg" disabled={submitting || success}>{submitting ? 'Adding order…' : createdOrderId && !success ? 'Finish order' : 'Add outbound order'}</Button>
    </form>
  );
}
