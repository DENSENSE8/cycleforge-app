'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { Check, Minus, Pencil, Plus, X } from '@/components/Icons';
import { AnimatedStat } from '@/design-system/components/AnimatedStat';
import { CollapseItem } from '@/design-system/components/Collapse';
import { WorkspaceCard } from '@/design-system/components/WorkspaceCard';
import { AnimatePresence, motion, motionRole, useAnimate, useReducedMotion } from '@/design-system/motion';
import { motionTransition, motionTransitionMobile, motionPresenceMobile } from '@/design-system/foundations/motion-presets';
import { useMotionTransition } from '@/design-system/foundations/motion-presets-hooks';
import { Button, DeferredQtyInput } from '@/design-system/primitives';
import { PREPACK_KIT_PART_TYPE_LABEL, type PrepackKit } from '@/lib/prepack/types';
import { PrepackManualPopover } from './PrepackManualManager';
import { PrepackPairing } from './PrepackPairing';
import { ProductIdentity } from './prepack-ui';
import type { PrepackSerialEntry, PrepackSerialEntryProps } from './serial-entry';
import { PREPACK_MAX_PACKAGES, serialSettled, type PrepackForm } from './usePrepackForm';

/** A field's label inside a group — sentence case, one step under the group title. */
export const FIELD_LABEL_CLASS = 'text-role-caption font-semibold text-text-muted';

/**
 * One group of the form: a raised card with a sentence-case title (and an
 * optional one-line hint) above its fields — the scan is the grouping, so no
 * field floats loose on the page.
 */
export function PrepackGroup({
  title,
  hint,
  actions,
  children,
  testId,
}: {
  title: string;
  hint?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  testId?: string;
}) {
  return (
    <WorkspaceCard overflow="visible" bodyClassName="space-y-4 px-4 py-4">
      <section aria-label={title} className="space-y-4" data-testid={testId}>
        <header className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-role-data font-semibold text-mode-ink">{title}</h2>
            {hint ? <div className="mt-0.5 break-words text-role-caption text-text-muted">{hint}</div> : null}
          </div>
          {actions ? <div className="flex shrink-0 items-center gap-1.5">{actions}</div> : null}
        </header>
        {children}
      </section>
    </WorkspaceCard>
  );
}

/**
 * Serial and product: the serial entry until the verdict settles, then a
 * one-line summary with Edit; the product's identity card under it on the
 * desk. Match pulses, refusal shakes, "Not in the system" only morphs its
 * status text — it is not an error.
 */
export function IdentifyGroup({
  form,
  SerialEntry,
  phone,
  entryKey,
  showProduct,
}: {
  form: PrepackForm;
  SerialEntry: PrepackSerialEntry;
  phone: PrepackSerialEntryProps['phone'];
  entryKey: number;
  /** Desk only — the phone carries the product in its sticky context card. */
  showProduct: boolean;
}) {
  const { verdict, verdictSeq, catalog } = form.state;
  const [scope, animate] = useAnimate();
  const reduced = useReducedMotion();
  const morph = motionTransition.liveValueMorph;

  useEffect(() => {
    if (reduced || !scope.current) return;
    if (verdict.kind === 'matched') {
      void animate(scope.current, motionPresenceMobile.scanSuccess.animate, motionTransitionMobile.scanSuccess);
    } else if (verdict.kind === 'refused') {
      void animate(scope.current, motionPresenceMobile.scanFailure.animate, motionTransitionMobile.scanFailure);
    }
    // One animation per verdict (`verdictSeq`), never on unrelated renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verdictSeq]);

  const settled = serialSettled(verdict);
  const status =
    verdict.kind === 'checking' ? `Checking ${verdict.serial}…`
      : verdict.kind === 'refused' ? verdict.message
        : verdict.kind === 'new' ? 'Not in the system — it is created when you print.'
          : verdict.kind === 'unpaired' ? 'In CycleForge, but no product yet.'
            : verdict.kind === 'matched' ? `In CycleForge · ${verdict.unit.title || verdict.unit.sku || 'matched'}`
              : verdict.kind === 'none' ? 'The label gets a CycleForge U- handle.'
                : null;

  return (
    <PrepackGroup
      title={showProduct ? 'Serial and product' : 'Serial'}
      hint={settled ? undefined : 'Scan the serial first — it finds the product for you.'}
      testId="prepack-identify-group"
    >
      <div ref={scope} className="space-y-1.5" data-testid="prepack-serial-section">
        <AnimatePresence initial={false} mode="popLayout">
          {settled ? (
            <CollapseItem key="summary" className="flex items-center gap-3">
              <span className={`${FIELD_LABEL_CLASS} w-16 shrink-0`}>Serial</span>
              <span className="min-w-0 flex-1 truncate font-mono text-sm font-semibold text-mode-ink" data-testid="prepack-serial-summary">
                {verdict.kind === 'none' ? 'No serial' : 'serial' in verdict ? verdict.serial : ''}
              </span>
              <Button variant="ghost" size="md" icon={<Pencil />} ariaLabel="Edit serial" onClick={form.editSerial} data-testid="prepack-serial-edit" />
            </CollapseItem>
          ) : (
            <CollapseItem key={`entry-${entryKey}`} className="space-y-2">
              <SerialEntry onSerial={form.submitSerial} busy={verdict.kind === 'checking'} phone={phone} />
              <Button variant="ghost" size="sm" onClick={form.skipSerial} data-testid="prepack-no-serial">
                This product has no serial
              </Button>
            </CollapseItem>
          )}
        </AnimatePresence>
        {status ? (
          <motion.p
            key={status}
            role={verdict.kind === 'refused' ? 'alert' : 'status'}
            className={`break-words text-role-caption ${verdict.kind === 'refused' ? 'font-semibold text-text-danger' : 'text-text-muted'}`}
            initial={{ opacity: 1 }}
            animate={{ opacity: [1, 0.25, 1] }}
            transition={morph}
            data-testid="prepack-serial-status"
          >
            {status}
          </motion.p>
        ) : null}
      </div>
      {showProduct && settled ? (
        <div className="space-y-1.5 border-t border-mode-rule pt-4" data-testid="prepack-product-section">
          <p className={FIELD_LABEL_CLASS}>Product</p>
          {catalog ? (
            <ProductIdentity
              product={catalog}
              size="card"
              trailing={
                <Button
                  variant="ghost"
                  size="md"
                  icon={<Pencil />}
                  ariaLabel="Change product"
                  onClick={() => form.setBrowsing(true)}
                  data-testid="prepack-product-edit"
                />
              }
            />
          ) : (
            <p className="text-role-caption text-text-muted">Pick the product in the browser on the right.</p>
          )}
        </div>
      ) : null}
    </PrepackGroup>
  );
}

/** Quantity = labels = packages: − / typed value / +, min 1. The value rolls (Motion+) unless the operator is typing. */
export function QuantityField({ form }: { form: PrepackForm }) {
  const count = form.state.packages.length;
  const [typing, setTyping] = useState(false);
  const locked = Boolean(form.state.saved);
  return (
    <div className="space-y-1.5" data-testid="prepack-quantity-section">
      <p className={FIELD_LABEL_CLASS}>Labels to print</p>
      <div role="group" aria-label="Labels to print" className="grid grid-cols-3 divide-x divide-mode-rule overflow-hidden rounded-mode-control border border-mode-rule">
        <Button
          variant="secondary"
          size="lg"
          radius="flush"
          className="min-h-mode-hit-cta w-full shadow-none ring-0"
          icon={<Minus />}
          ariaLabel="One fewer label"
          disabled={locked || count <= 1}
          onClick={() => form.setQuantity(count - 1)}
          data-testid="prepack-quantity-minus"
        />
        <label className="relative flex items-center justify-center">
          <AnimatedStat
            value={count}
            className={`pointer-events-none font-mono text-role-title font-semibold text-mode-ink ${typing ? 'opacity-0' : ''}`}
          />
          <span onFocus={() => setTyping(true)} onBlur={() => setTyping(false)} className="absolute inset-0">
            <DeferredQtyInput
              value={count}
              min={1}
              max={PREPACK_MAX_PACKAGES}
              disabled={locked}
              onChange={form.setQuantity}
              aria-label="Labels to print"
              className={`size-full bg-transparent text-center font-mono text-role-title font-semibold text-mode-ink outline-none ${typing ? '' : 'opacity-0'}`}
            />
          </span>
        </label>
        <Button
          variant="secondary"
          size="lg"
          radius="flush"
          className="min-h-mode-hit-cta w-full shadow-none ring-0"
          icon={<Plus />}
          ariaLabel="One more label"
          disabled={locked || count >= PREPACK_MAX_PACKAGES}
          onClick={() => form.setQuantity(count + 1)}
          data-testid="prepack-quantity-plus"
        />
      </div>
    </div>
  );
}

/**
 * Contents: every part Included by default, tap to mark Missing; the manual
 * packers print (popover: use cases, preview, pair, unpair, delete, upload);
 * parts pairing inline.
 */
export function ContentsGroup({ form, kit }: { form: PrepackForm; kit: PrepackKit }) {
  const ack = useMotionTransition(motionRole.feedback.hitMarker.transition);
  const locked = Boolean(form.state.saved);
  const missingCount = kit.parts.filter((part) => form.state.missing.has(part.id)).length;
  return (
    <PrepackGroup
      title="Contents"
      hint={kit.parts.length ? (missingCount ? `${missingCount} missing — tap a part to change it` : 'Everything included — tap a part that is missing') : undefined}
      testId="prepack-contents-section"
    >
      <div className="space-y-1.5">
        <p className={FIELD_LABEL_CLASS}>Parts in every package</p>
        {kit.parts.length > 0 ? (
          <ul className="divide-y divide-mode-rule rounded-mode-control border border-mode-rule">
            <AnimatePresence initial={false}>
              {kit.parts.map((part) => {
                const included = !form.state.missing.has(part.id);
                return (
                  <CollapseItem key={part.id} as="li">
                    <Button
                      variant="ghost"
                      size="lg"
                      radius="flush"
                      aria-pressed={!included}
                      disabled={locked}
                      className="h-auto min-h-12 w-full justify-start gap-3 whitespace-normal px-3 py-2 text-left"
                      onClick={() => form.toggleMissing(part.id)}
                      data-testid="prepack-kit-part"
                    >
                      <motion.span
                        key={String(included)}
                        initial={{ opacity: 0.4 }}
                        animate={{ opacity: 1 }}
                        transition={ack}
                        className={`flex size-6 shrink-0 items-center justify-center rounded-full ${included ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}
                      >
                        {included ? <Check className="size-3.5" /> : <X className="size-3.5" />}
                      </motion.span>
                      <span className="flex min-w-0 flex-1 flex-col items-start">
                        <span className="break-words text-sm font-semibold text-mode-ink">
                          {part.qtyRequired > 1 ? `${part.qtyRequired} × ` : ''}{part.componentName}
                        </span>
                        <span className="text-role-caption text-text-muted">
                          {PREPACK_KIT_PART_TYPE_LABEL[part.componentType]}
                          {part.componentSku ? ` · ${part.componentSku}` : ''}
                        </span>
                      </span>
                      <span className={`w-16 shrink-0 text-right text-role-caption ${included ? 'text-text-muted' : 'font-semibold text-rose-700'}`}>
                        {included ? 'Included' : 'Missing'}
                      </span>
                    </Button>
                  </CollapseItem>
                );
              })}
            </AnimatePresence>
          </ul>
        ) : (
          <p className="text-role-caption text-text-muted">This product has no parts list yet.</p>
        )}
      </div>
      <div className="space-y-1.5">
        <p className={FIELD_LABEL_CLASS}>Manual packers print</p>
        <PrepackManualPopover kit={kit} onKit={form.applyKit} />
      </div>
      <PrepackPairing kit={kit} onKit={form.applyKit} />
    </PrepackGroup>
  );
}
