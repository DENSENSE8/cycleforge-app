'use client';

import React, { useCallback, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Loader2, Lock, Check, AlertCircle } from '../Icons';
import { HorizontalButtonSlider, type HorizontalSliderItem } from '@/components/ui/HorizontalButtonSlider';
import { ConditionPills } from '@/components/receiving/workspace/ConditionPills';
import { normalizeCondition } from '@/components/tech/StationConditionEditor';
import { Button, TextField } from '@/design-system/primitives';
import {
  FormField,
  SidebarIntakeFormShell,
  SIDEBAR_INTAKE_SUBMIT_BUTTON_CLASS,
} from '@/design-system/components';

const INTAKE_MODE_ITEMS: HorizontalSliderItem[] = [
  { id: 'replacement', label: 'Replacement' },
  { id: 'add_order', label: 'Add Order' },
];

/** Default grade — legacy intake used coarse "Used" (maps to USED_B). */
const DEFAULT_CONDITION = 'USED_B';

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
    condition: DEFAULT_CONDITION,
    shipping_tracking_number: '',
    sku: '',
  });

  const [addOrderData, setAddOrderData] = useState<AddOrderShippedFormData>({
    mode: 'add_order',
    order_id: '',
    shipping_tracking_number: '',
    product_title: '',
    condition: DEFAULT_CONDITION,
    sku: '',
  });

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

  const canSubmitAddOrder =
    addOrderData.order_id.trim() &&
    addOrderData.shipping_tracking_number.trim() &&
    addOrderData.product_title.trim() &&
    addOrderData.condition.trim();

  const handleSubmit = async () => {
    const submitData: ShippedFormData =
      activeTab === 'replacement'
        ? replacementData
        : {
            ...addOrderData,
            accountSource: accountSource?.trim() || addOrderData.accountSource,
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

  return (
    <SidebarIntakeFormShell
      title="New Order Entry"
      subtitle="Order Information"
      subtitleAccent="green"
      onClose={handleClose}
      hideHeader={embedded}
      bandBelowHeader={
        hideModeTabs ? (
          classifySlot
        ) : (
          <>
            {classifySlot}
            <HorizontalButtonSlider
              items={INTAKE_MODE_ITEMS}
              value={activeTab}
              onChange={(tab) => setActiveTab(tab as 'replacement' | 'add_order')}
              variant="nav"
              aria-label="Intake mode"
            />
          </>
        )
      }
      footer={
        <Button
          type="button"
          onClick={handleSubmit}
          loading={isSubmitting}
          disabled={activeTab === 'replacement' ? !canSubmitReplacement : !canSubmitAddOrder}
          className={`${SIDEBAR_INTAKE_SUBMIT_BUTTON_CLASS} h-auto`}
        >
          {isSubmitting ? 'Submitting...' : activeTab === 'replacement' ? 'Submit Order' : 'Add Order'}
        </Button>
      }
    >
      {activeTab === 'replacement' ? (
        <>
          <div className="space-y-2">
            <TextField
              label="Order ID"
              value={replacementData.order_id}
              onChange={handleOrderIdChange}
              onBlur={handleOrderIdBlur}
              required
              tone="emerald"
            />
            {lookupStatus !== 'idle' ? (
              <div className="flex items-center gap-2 text-xs">
                {lookupStatus === 'searching' ? (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin text-blue-500" />
                    <span className="font-semibold text-blue-600">Searching...</span>
                  </>
                ) : null}
                {lookupStatus === 'found' ? (
                  <>
                    <Check className="h-3 w-3 text-green-600" />
                    <span className="font-semibold text-green-600">Order found! Product title auto-filled.</span>
                  </>
                ) : null}
                {lookupStatus === 'not-found' ? (
                  <>
                    <AlertCircle className="h-3 w-3 text-amber-600" />
                    <span className="font-semibold text-amber-600">
                      Order not found. Please enter product title manually.
                    </span>
                  </>
                ) : null}
              </div>
            ) : null}
          </div>

          <TextField
            label="Shipping Tracking Number"
            value={replacementData.shipping_tracking_number}
            onChange={(next) =>
              setReplacementData((prev) => ({ ...prev, shipping_tracking_number: next }))
            }
            required
            mono
            tone="emerald"
          />

          <div className="space-y-2">
            <TextField
              label="Reason or Ticket #"
              value={replacementData.reason}
              onChange={(next) => setReplacementData((prev) => ({ ...prev, reason: next }))}
              required
              tone="emerald"
            />
            <p className="text-role-eyebrow font-medium text-text-soft">
              Will be saved as:{' '}
              <span className="font-semibold">
                {replacementData.reason || '[Reason]'} - {replacementData.product_title || '[Product Title]'}
              </span>
            </p>
          </div>

          <div className="space-y-2">
            <TextField
              label={isProductTitleLocked ? 'Product Title (locked)' : 'Product Title'}
              value={replacementData.product_title}
              onChange={(next) => setReplacementData((prev) => ({ ...prev, product_title: next }))}
              required
              disabled={isProductTitleLocked}
              readOnly={isProductTitleLocked}
              tone="emerald"
              trailing={
                isProductTitleLocked ? (
                  <Lock className="h-3.5 w-3.5 text-green-600" aria-hidden />
                ) : null
              }
            />
            {isProductTitleLocked ? (
              <p className="text-role-eyebrow font-medium text-green-600">
                Locked — order ID was found in the database.
              </p>
            ) : null}
          </div>

          <FormField label="Condition" required>
            <ConditionPills
              value={replacementData.condition}
              onChange={(next) =>
                setReplacementData((prev) => ({ ...prev, condition: normalizeCondition(next) }))
              }
            />
          </FormField>

          <TextField
            label="SKU (optional)"
            value={replacementData.sku}
            onChange={(next) => setReplacementData((prev) => ({ ...prev, sku: next }))}
            mono
            tone="emerald"
          />
        </>
      ) : (
        <>
          <TextField
            label="Order ID"
            value={addOrderData.order_id}
            onChange={(next) => setAddOrderData((prev) => ({ ...prev, order_id: next }))}
            required
            tone="emerald"
          />

          <TextField
            label="Shipping Tracking Number"
            value={addOrderData.shipping_tracking_number}
            onChange={(next) =>
              setAddOrderData((prev) => ({ ...prev, shipping_tracking_number: next }))
            }
            required
            mono
            tone="emerald"
          />

          <TextField
            label="Product Title"
            value={addOrderData.product_title}
            onChange={(next) => setAddOrderData((prev) => ({ ...prev, product_title: next }))}
            required
            tone="emerald"
          />

          <FormField label="Condition" required>
            <ConditionPills
              value={addOrderData.condition}
              onChange={(next) =>
                setAddOrderData((prev) => ({ ...prev, condition: normalizeCondition(next) }))
              }
            />
          </FormField>

          <TextField
            label="SKU (optional)"
            value={addOrderData.sku}
            onChange={(next) => setAddOrderData((prev) => ({ ...prev, sku: next }))}
            mono
            tone="emerald"
          />
        </>
      )}
    </SidebarIntakeFormShell>
  );
}
