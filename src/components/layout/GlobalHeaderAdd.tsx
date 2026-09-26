'use client';

/**
 * Global header `+` — the always-visible door into shipping-label intake.
 *
 * Opens `LabelIntakeDesk` (`/search?entry=label`): type an order number, it
 * pairs to its order or stays a reference-only number, and the return /
 * replacement label is bought on that one surface.
 */

import { useRouter } from 'next/navigation';
import { Plus } from '@/components/Icons';
import { IconButton } from '@/design-system/primitives';
import {
  HEADER_ICON_BTN_CLASS,
  HEADER_ICON_WRAP,
  TOP_CHROME_ICON_FACE,
} from './header-shell';
export const SHIPPING_LABEL_ORDER_SEARCH_HREF = '/search?entry=label';

export function GlobalHeaderAdd() {
  const router = useRouter();

  return (
    <div className={HEADER_ICON_WRAP}>
      <IconButton
        type="button"
        size="md"
        ariaLabel="Add shipping labels"
        title="Find order · buy return and replacement labels"
        data-testid="global-add-button"
        onClick={() => router.push(SHIPPING_LABEL_ORDER_SEARCH_HREF)}
        className={HEADER_ICON_BTN_CLASS}
        icon={<Plus className={TOP_CHROME_ICON_FACE} aria-hidden />}
      />
    </div>
  );
}
