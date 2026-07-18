/**
 * Transaction kind → label / dot / icon — the tone+label registry for the Sales
 * feed, mirroring `workflow-stages.ts` (lifecycle) and `condition-tone.ts`.
 *
 * Split from `transactions.ts` on purpose: that module is the pure data waist
 * (adapters / merge / rollup), this one is its display vocabulary. A view resolves
 * a kind through here and stays dumb — never hardcode a per-kind hue or glyph in
 * a component.
 */

import { DollarSign, Package, Wrench } from '@/components/Icons';
import type { TransactionKind } from './transactions';

interface TransactionKindMeta {
  kind: TransactionKind;
  /** Short row label ("SALE" renders via the meta row's uppercase role). */
  label: string;
  /** Tailwind `bg-*` for the row status dot (house dot anatomy). */
  dot: string;
  /** Tab tint in the chrome `TabSwitch`. */
  tabColor: 'emerald' | 'blue' | 'orange';
  icon: (props: { className?: string }) => JSX.Element;
}

const TRANSACTION_KINDS: Record<TransactionKind, TransactionKindMeta> = {
  sale: { kind: 'sale', label: 'Sale', dot: 'bg-emerald-600', tabColor: 'emerald', icon: DollarSign },
  pickup: { kind: 'pickup', label: 'Pickup', dot: 'bg-blue-500', tabColor: 'blue', icon: Package },
  repair: { kind: 'repair', label: 'Repair', dot: 'bg-orange-500', tabColor: 'orange', icon: Wrench },
};

export function transactionKindMeta(kind: TransactionKind): TransactionKindMeta {
  return TRANSACTION_KINDS[kind];
}
