/**
 * Kiosk cart (`counter_session_lines`) — the column model.
 *
 * The SAME tracks Receiving, Incoming, To-Ship, Tasks and Daily mount, derived
 * from `COMPOUND_TRACKS` rather than copied. This file only narrows the key
 * type; there is no cart-flavoured geometry anywhere in it, which is the point.
 *
 * The cart mounts the shared compound skeleton. Line money is under the
 * title, not a private Amount column.
 */

import {
  compoundColumnsFor,
  type CompoundColumnKey,
} from '@/components/tables/compound/compound-columns';
import type { LedgerGridColumnModel } from '@/design-system/components/grid';
import { makeGridSurfaceDescriptor } from '@/design-system/components/grid/grid-surface-descriptor';
import type { ColumnType } from '@/lib/tables/table-columns';
import type { KioskCartLine } from './cart-line';

export type CartGridColumnKey = CompoundColumnKey;

export interface CartGridColumn extends LedgerGridColumnModel {
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
  compoundColumnsFor();

/** Canonical grid descriptor for the transient kiosk cart surface. */
export const makeKioskCartGridDescriptor = (visible: readonly CartGridColumn[]) =>
  makeGridSurfaceDescriptor<KioskCartLine, CartGridColumn>('kiosk.cart', visible, undefined, {
    rowTriageFlags: false,
    multiSelect: false,
    inCellEdit: false,
    fieldsMenu: false,
    dayBands: false,
  });
