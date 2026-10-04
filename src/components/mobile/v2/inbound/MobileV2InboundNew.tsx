'use client';

/**
 * `/m/receiving/new` — the phone's ONE door for adding purchase orders. Three
 * ways in, all landing through the one inbound writer:
 *   - Type it in      → `/m/receiving/order` (the inbound-order form);
 *   - Paste or photo  → the same form, opened on its fast fill;
 *   - Upload CSV      → `/m/receiving/import-csv` (many orders at once —
 *                       Goodwill and platforms without an API).
 * eBay purchases arrive by API sync and need none of these.
 */

import type { ComponentType } from 'react';
import { ChevronRight, ClipboardPaste, Type, Upload } from '@/components/Icons';
import { MobileV2DetailTopBar } from '@/components/mobile/v2/MobileV2DetailTopBar';
import { MobileDataListRow } from '@/design-system/components/MobileDataListRow';
import { INBOUND_ROW_CLASS, InboundRowText } from './MobileV2InboundParts';

const DOORS: ReadonlyArray<{ id: string; href: string; label: string; hint: string; icon: ComponentType<{ className?: string }> }> = [
  { id: 'type', href: '/m/receiving/order', label: 'Type it in', hint: 'One order — platform, number, items, tracking', icon: Type },
  { id: 'fill', href: '/m/receiving/order?fill=1', label: 'Paste or photo', hint: 'Read a confirmation or receipt; you check it before it lands', icon: ClipboardPaste },
  { id: 'csv', href: '/m/receiving/import-csv', label: 'Upload CSV', hint: 'Many orders at once — Goodwill and platforms without an API', icon: Upload },
];

export function MobileV2InboundNew() {
  return (
    <div className="flex min-h-full flex-col bg-mode-panel" data-testid="m-inbound-new">
      <MobileV2DetailTopBar title="Add purchase orders" subtitle="Receiving" backHref="/m/receiving" close />
      <nav aria-label="Ways to add purchase orders">
        {DOORS.map(({ id, href, label, hint, icon: Icon }) => (
          <MobileDataListRow key={id} href={href} ariaLabel={label} testId={`m-inbound-new-${id}`}>
            <span className={INBOUND_ROW_CLASS}>
              <Icon className="h-5 w-5 shrink-0 text-mode-muted" />
              <span className="min-w-0 flex-1">
                <InboundRowText title={label} meta={hint} />
              </span>
              <ChevronRight aria-hidden className="h-5 w-5 shrink-0 text-mode-muted" />
            </span>
          </MobileDataListRow>
        ))}
      </nav>
      <p className="px-mode-page py-3 text-role-caption text-text-muted">eBay purchases sync on their own.</p>
    </div>
  );
}
