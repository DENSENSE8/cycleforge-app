/** Transaction kind → label / dot / icon — the tone+label registry for the Sales feed, mirroring `workflow-stages.ts` (lifecycle) and… */

import { Package, SalesPrice, Wrench } from '@/components/Icons';
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
  sale: { kind: 'sale', label: 'Sale', dot: 'bg-emerald-600', tabColor: 'emerald', icon: SalesPrice },
  pickup: { kind: 'pickup', label: 'Pickup', dot: 'bg-blue-500', tabColor: 'blue', icon: Package },
  repair: { kind: 'repair', label: 'Repair', dot: 'bg-orange-500', tabColor: 'orange', icon: Wrench },
};

export function transactionKindMeta(kind: TransactionKind): TransactionKindMeta {
  return TRANSACTION_KINDS[kind];
}
