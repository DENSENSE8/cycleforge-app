'use client';

import React, { useCallback, useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Loader2, Lock, Check, AlertCircle, Plus, X } from '../Icons';
import { HorizontalButtonSlider, type HorizontalSliderItem } from '@/components/ui/HorizontalButtonSlider';
import { ConditionPills } from '@/components/receiving/workspace/ConditionPills';
import { normalizeCondition } from '@/components/tech/StationConditionEditor';
import { SearchableSelectField } from '@/design-system/components';
import { Button, FlushTerminalFooter, IconButton, TextField } from '@/design-system/primitives';
import { usePlatformCatalog, useReceivingTypeCatalog } from '@/hooks/useCatalog';
import { parseTrackingPaste } from '@/lib/receiving/tracking-paste';

/** Same rank as inbound Add — Amazon first, then the rest of the catalog. */
const ORDER_PLATFORM_PRIORITY = ['amazon', 'ebay', 'walmart', 'shopify', 'ecwid'] as const;

const INTAKE_MODE_ITEMS: HorizontalSliderItem[] = [
  { id: 'replacement', label: 'Replacement' },
  { id: 'add_order', label: 'Add Order' },
];

interface ShippedIntakeFormProps {
  onClose: () => void;
  onSubmit: (data: ShippedFormData) => void;
  /** Leaf-embedded: skip hero close/title (Displays leaf header owns the name). */
  embedded?: boolean;
  initialTab?: 'replacement' | 'add_order';
  hideModeTabs?: boolean;
  /** Flush classify cell above the fields (platform combobox). */
  classifySlot?: React.ReactNode;
  /** Overrides `account_source` on add-order submit. */
  accountSource?: string;
}

interface ReplacementShippedFormData {
  mode: 'replacement';
  order_id: string;
  product_title: string;
  reason: string;
  condition: string;
  shipping_tracking_number: string;
  sku: string;
}

interface AddOrderShippedFormData {
  mode: 'add_order';
  order_id: string;
  shipping_tracking_number: string;
  product_title: string;
  condition: string;
  sku: string;
  /** Channel label written to `orders.account_source`. Defaults to Manual. */
  accountSource?: string;
  /** Org catalog type slug (PO · RETURN · …) → `orders.type_id`. */
  typeSlug?: string;
  /** All tracking numbers after bulk paste / extra rows. First is primary. */
  shipping_tracking_numbers?: string[];
}

export type ShippedFormData = ReplacementShippedFormData | AddOrderShippedFormData;

type LookupStatus = 'idle' | 'searching' | 'found' | 'not-found';

export function ShippedIntakeForm({
  onClose,
  onSubmit,
  embedded = false,
  initialTab = 'replacement',
  hideModeTabs = false,
  classifySlot,
  accountSource,
}: ShippedIntakeFormProps) {
  const router = useRouter();
  const pathname = usePathname();

  const handleClose = useCallback(() => {
    try {
      onClose();
    } catch {
      /* parent close should not block URL cleanup */
    }
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (!params.has('new') && !params.has('ingest')) return;
    params.delete('new');
    params.delete('ingest');
    const path = pathname || window.location.pathname || '/dashboard';
    const qs = params.toString();
    router.replace(qs ? `${path}?${qs}` : path);
  }, [onClose, pathname, router]);

  const [activeTab, setActiveTab] = useState<'replacement' | 'add_order'>(initialTab);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lookupStatus, setLookupStatus] = useState<LookupStatus>('idle');

  const [replacementData, setReplacementData] = useState<ReplacementShippedFormData>({
    mode: 'replacement',
    order_id: '',
    product_title: '',
    reason: '',
    condition: '',
    shipping_tracking_number: '',
    sku: '',
  });

  const [addOrderData, setAddOrderData] = useState<AddOrderShippedFormData>({
    mode: 'add_order',
    order_id: '',
    shipping_tracking_number: '',
    product_title: '',
    condition: '',
    sku: '',
  });
  const [platform, setPlatform] = useState('amazon');
  const [orderType, setOrderType] = useState('PO');
  const [trackingNumbers, setTrackingNumbers] = useState<string[]>(['']);
  const [focusLastTracking, setFocusLastTracking] = useState(false);

  const platformCatalog = usePlatformCatalog();
  const typeCatalog = useReceivingTypeCatalog();

  const platformOptions = useMemo(() => {
    const catalog = platformCatalog.options ?? [];
    const ranked = [...catalog].sort((a, b) => {
      const ai = ORDER_PLATFORM_PRIORITY.indexOf(
        a.value.toLowerCase() as (typeof ORDER_PLATFORM_PRIORITY)[number],
      );
      const bi = ORDER_PLATFORM_PRIORITY.indexOf(
        b.value.toLowerCase() as (typeof ORDER_PLATFORM_PRIORITY)[number],
      );
      const ar = ai === -1 ? 99 : ai;
      const br = bi === -1 ? 99 : bi;
      return ar - br || a.label.localeCompare(b.label);
    });
    return ranked.map((o) => ({
      value: o.value,
      label: o.label,
      group: 'Platforms',
    }));
  }, [platformCatalog.options]);

  const typeOptions = useMemo(
    () =>
      (typeCatalog.options ?? [])
        .filter((o) => o.value !== 'PICKUP')
        .map((o) => ({
          value: o.value,
          label: o.label,
          group: 'Standard types',
        })),
    [typeCatalog.options],
  );

  const classifyBand = classifySlot ?? (
    <div
      className="divide-y divide-border-hairline border-b border-border-hairline"
      data-testid="add-order-classify"
    >
      <SearchableSelectField
        appearance="flush"
        label="Platform"
        autoFocus
        value={platform}
        onChange={(id) => {
          if (id == null) return;
          setPlatform(String(id));
        }}
        options={platformOptions}
        placeholder="Search or select…"
        searchPlaceholder="Type to filter…"
        emptyMessage="No platforms match"
        ariaLabel="Platform"
      />
      <SearchableSelectField
        appearance="flush"
        label="Type"
        value={orderType}
        onChange={(id) => {
          if (id == null) return;
          setOrderType(String(id));
        }}
        options={typeOptions}
        placeholder="Search or select…"
        searchPlaceholder="Type to filter…"
        emptyMessage="No types match"
        ariaLabel="Type"
      />
    </div>
  );

  const [isProductTitleLocked, setIsProductTitleLocked] = useState(false);

  const lookupOrder = async (orderId: string) => {
    if (!orderId.trim()) {
      setLookupStatus('idle');
      setIsProductTitleLocked(false);
      return;
    }

    setLookupStatus('searching');
    try {
      const res = await fetch(`/api/shipped/lookup-order?order_id=${encodeURIComponent(orderId)}`);
      const data = await res.json();

      if (res.ok && data.found) {
        setReplacementData((prev) => ({ ...prev, product_title: data.product_title }));
        setIsProductTitleLocked(true);
        setLookupStatus('found');
      } else {
        setIsProductTitleLocked(false);
        setLookupStatus('not-found');
      }
    } catch (error) {
      console.error('Error looking up order:', error);
      setIsProductTitleLocked(false);
      setLookupStatus('not-found');
    }
  };

  const handleOrderIdChange = (value: string) => {
    setReplacementData((prev) => ({ ...prev, order_id: value }));

    if (!value.trim()) {
      setReplacementData((prev) => ({ ...prev, product_title: '' }));
      setIsProductTitleLocked(false);
      setLookupStatus('idle');
    }
  };

  const handleOrderIdBlur = () => {
    if (replacementData.order_id.trim()) {
      lookupOrder(replacementData.order_id.trim());
    }
  };

  const canSubmitReplacement =
    replacementData.order_id.trim() &&
    replacementData.reason.trim() &&
    replacementData.product_title.trim() &&
    replacementData.condition.trim() &&
    replacementData.shipping_tracking_number.trim();

  const filledTrackings = trackingNumbers.map((t) => t.trim()).filter(Boolean);
  const canSubmitAddOrder =
    addOrderData.order_id.trim() &&
    filledTrackings.length > 0 &&
    addOrderData.product_title.trim() &&
    addOrderData.condition.trim();

  const handleSubmit = async () => {
    const platformLabel =
      platformOptions.find((o) => o.value === platform)?.label?.trim() || platform;
    const submitData: ShippedFormData =
      activeTab === 'replacement'
        ? replacementData
        : {
            ...addOrderData,
            accountSource:
              accountSource?.trim() || addOrderData.accountSource?.trim() || platformLabel,
            typeSlug: orderType,
            shipping_tracking_number: filledTrackings[0] ?? '',
            shipping_tracking_numbers: filledTrackings,
          };
    const canSubmit = activeTab === 'replacement' ? canSubmitReplacement : canSubmitAddOrder;
    if (!canSubmit) return;

    setIsSubmitting(true);
    try {
      await onSubmit(submitData);
    } catch (error) {
      console.error('Error submitting form:', error);
      setIsSubmitting(false);
    }
  };

  const canSubmit = activeTab === 'replacement' ? canSubmitReplacement : canSubmitAddOrder;

  return (
    <div
      className="flex h-full min-h-0 flex-col bg-surface-card"
      data-testid="shipped-intake-form"
    >
      {embedded ? null : (
        <div className="flex shrink-0 items-center justify-between border-b border-border-hairline px-3 py-2">
          <h2 className="text-role-caption font-semibold text-text-default">New order</h2>
          <Button type="button" variant="ghost" size="sm" onClick={handleClose} ariaLabel="Close form">
            Close
          </Button>
        </div>
      )}

      {activeTab === 'add_order' ? classifyBand : null}

      {hideModeTabs ? null : (
        <div className="border-b border-border-hairline">
          <HorizontalButtonSlider
            items={INTAKE_MODE_ITEMS}
            value={activeTab}
            onChange={(tab) => setActiveTab(tab as 'replacement' | 'add_order')}
            variant="nav"
            aria-label="Intake mode"
          />
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {activeTab === 'replacement' ? (
          <div className="divide-y divide-border-hairline">
            <TextField
              label="Order ID"
              value={replacementData.order_id}
              onChange={handleOrderIdChange}
              onBlur={handleOrderIdBlur}
              required
              appearance="flush"
            />
            {lookupStatus !== 'idle' ? (
              <div className="flex items-center gap-2 px-3 py-2 text-role-caption">
                {lookupStatus === 'searching' ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-text-muted" />
                    <span className="text-text-muted">Looking up order…</span>
                  </>
                ) : null}
                {lookupStatus === 'found' ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-green-700" />
                    <span className="text-green-700">Order found — title filled.</span>
                  </>
                ) : null}
                {lookupStatus === 'not-found' ? (
                  <>
                    <AlertCircle className="h-3.5 w-3.5 text-amber-700" />
                    <span className="text-amber-800">Not found — enter the title.</span>
                  </>
                ) : null}
              </div>
            ) : null}

            <TextField
              label="Shipping tracking number"
              value={replacementData.shipping_tracking_number}
              onChange={(next) =>
                setReplacementData((prev) => ({ ...prev, shipping_tracking_number: next }))
              }
              required
              mono
              appearance="flush"
            />

            <TextField
              label="Reason or ticket #"
              value={replacementData.reason}
              onChange={(next) => setReplacementData((prev) => ({ ...prev, reason: next }))}
              required
              appearance="flush"
            />
            {replacementData.reason.trim() || replacementData.product_title.trim() ? (
              <p className="px-3 py-2 text-role-caption text-text-muted">
                Saved as{' '}
                <span className="font-medium text-text-default">
                  {replacementData.reason || '[Reason]'} —{' '}
                  {replacementData.product_title || '[Product title]'}
                </span>
              </p>
            ) : null}

            <TextField
              label={isProductTitleLocked ? 'Product title (locked)' : 'Product title'}
              value={replacementData.product_title}
              onChange={(next) => setReplacementData((prev) => ({ ...prev, product_title: next }))}
              required
              disabled={isProductTitleLocked}
              readOnly={isProductTitleLocked}
              appearance="flush"
              trailing={
                isProductTitleLocked ? (
                  <Lock className="h-3.5 w-3.5 text-text-muted" aria-hidden />
                ) : null
              }
            />

            <div className="flex h-11 w-full min-w-0 items-stretch gap-0">
              <div className="flex h-full min-w-0 w-full flex-1 items-stretch overflow-x-auto">
                <ConditionPills
                  value={replacementData.condition}
                  onChange={(next) =>
                    setReplacementData((prev) => ({ ...prev, condition: normalizeCondition(next) }))
                  }
                  labelVariant="full"
                  layout="barDistribute"
                />
              </div>
            </div>

            <TextField
              label="SKU (optional)"
              value={replacementData.sku}
              onChange={(next) => setReplacementData((prev) => ({ ...prev, sku: next }))}
              mono
              appearance="flush"
            />
          </div>
        ) : (
          <div className="divide-y divide-border-hairline">
            <TextField
              label="Order ID"
              value={addOrderData.order_id}
              onChange={(next) => setAddOrderData((prev) => ({ ...prev, order_id: next }))}
              required
              appearance="flush"
            />
            {trackingNumbers.map((value, index) => (
              <FlushTrackingField
                key={index}
                index={index}
                value={value}
                autoFocus={focusLastTracking && index === trackingNumbers.length - 1}
                onChange={(next) => {
                  const merged = expandTrackingPaste(trackingNumbers, index, next);
                  if (merged) {
                    setTrackingNumbers(merged);
                    setFocusLastTracking(true);
                    return;
                  }
                  setTrackingNumbers((rows) => rows.map((row, i) => (i === index ? next : row)));
                }}
                onPaste={(text) => {
                  const merged = expandTrackingPaste(trackingNumbers, index, text);
                  if (!merged) return false;
                  setTrackingNumbers(merged);
                  setFocusLastTracking(true);
                  return true;
                }}
                onAdd={
                  index === 0
                    ? () => {
                        setTrackingNumbers((rows) => [...rows, '']);
                        setFocusLastTracking(true);
                      }
                    : undefined
                }
                onRemove={
                  index > 0
                    ? () =>
                        setTrackingNumbers((rows) =>
                          rows.length <= 1 ? rows : rows.filter((_, i) => i !== index),
                        )
                    : undefined
                }
              />
            ))}
            <TextField
              label="Product title"
              value={addOrderData.product_title}
              onChange={(next) => setAddOrderData((prev) => ({ ...prev, product_title: next }))}
              required
              appearance="flush"
            />
            <div className="flex h-11 w-full min-w-0 items-stretch gap-0">
              <div className="flex h-full min-w-0 w-full flex-1 items-stretch overflow-x-auto">
                <ConditionPills
                  value={addOrderData.condition}
                  onChange={(next) =>
                    setAddOrderData((prev) => ({ ...prev, condition: normalizeCondition(next) }))
                  }
                  labelVariant="full"
                  layout="barDistribute"
                />
              </div>
            </div>
            <TextField
              label="SKU (optional)"
              value={addOrderData.sku}
              onChange={(next) => setAddOrderData((prev) => ({ ...prev, sku: next }))}
              mono
              appearance="flush"
            />
          </div>
        )}
      </div>

      <FlushTerminalFooter layout="bleed">
        <Button
          type="button"
          variant="primary"
          onClick={() => void handleSubmit()}
          loading={isSubmitting}
          disabled={!canSubmit}
          className="min-h-9 w-full flex-1"
          data-testid="shipped-intake-submit"
        >
          {isSubmitting ? 'Submitting…' : activeTab === 'replacement' ? 'Submit order' : 'Add order'}
        </Button>
      </FlushTerminalFooter>
    </div>
  );
}

function expandTrackingPaste(rows: string[], at: number, raw: string): string[] | null {
  const parsed = parseTrackingPaste(raw);
  if (!parsed.ok || parsed.trackings.length <= 1) return null;
  const next = [...rows];
  next[at] = parsed.trackings[0];
  const rest = parsed.trackings.slice(1);
  const after = next.slice(at + 1).filter((row) => row.trim());
  return [...next.slice(0, at + 1), ...rest, ...after];
}

function FlushTrackingField({
  index,
  value,
  autoFocus,
  onChange,
  onPaste,
  onAdd,
  onRemove,
}: {
  index: number;
  value: string;
  autoFocus?: boolean;
  onChange: (next: string) => void;
  onPaste: (text: string) => boolean;
  onAdd?: () => void;
  onRemove?: () => void;
}) {
  const label = index === 0 ? 'Shipping tracking number' : `Shipping tracking number ${index + 1}`;
  return (
    <TextField
      label={label}
      value={value}
      onChange={onChange}
      onPaste={(event) => {
        const text = event.clipboardData.getData('text');
        if (onPaste(text)) event.preventDefault();
      }}
      required={index === 0}
      autoFocus={autoFocus}
      mono
      appearance="flush"
      trailing={
        <span className="flex items-center">
          {onAdd ? (
            <IconButton
              type="button"
              size="xs"
              ariaLabel="Add shipping tracking number"
              title="Add another tracking number"
              onClick={onAdd}
              icon={<Plus className="h-3.5 w-3.5" />}
            />
          ) : null}
          {onRemove ? (
            <IconButton
              type="button"
              size="xs"
              ariaLabel={`Remove shipping tracking number ${index + 1}`}
              title="Remove this tracking number"
              onClick={onRemove}
              icon={<X className="h-3.5 w-3.5" />}
            />
          ) : null}
        </span>
      }
    />
  );
}
