/**
 * Kiosk cart (`counter_session_lines`) — the column model.
 *
 * The SAME tracks Receiving, Incoming, To-Ship, Tasks and Daily mount, derived
 * from `COMPOUND_TRACKS` rather than copied. This file only narrows the key
 * type; there is no cart-flavoured geometry anywhere in it, which is the point.
 *
 * The cart is the family that made the shared model grow: it is the first with
 * MONEY, and the first that needed more per-row verbs than a chevron could
 * carry. Both landed as tracks every table now has — `amount` and `actions` —
 * because a cart-only array would have been the exact fork this layout exists
 * to prevent, and because Receiving and Orders both had money they were not
 * showing.
 */

import {
  compoundColumnsFor,
  type CompoundColumnKey,
} from '@/components/tables/compound/compound-columns';
import type { ColumnType } from '@/lib/tables/table-columns';

export type CartGridColumnKey = CompoundColumnKey;

export interface CartGridColumn {
  key: CartGridColumnKey;
  width: string;
  label?: string;
  gridLabel?: string;
  labelFitRem?: number;
  type?: ColumnType;
  align?: 'start' | 'end';
  frozen?: boolean;
  sortable?: boolean;
  hideKey?: string;
  resizable?: boolean;
  minTrackRem?: number;
}

export const CART_COMPOUND_COLUMNS: readonly CartGridColumn[] =
  compoundColumnsFor<CartGridColumn>();
