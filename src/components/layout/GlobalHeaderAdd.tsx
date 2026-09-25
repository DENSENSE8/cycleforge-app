'use client';

/**
 * Global header `+` — the always-visible door into shipping-label intake.
 *
 * The specialized search entry keeps order identity first: resolve the order,
 * show it through the To-ship ledger, then buy the return and replacement
 * labels against that record.
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
