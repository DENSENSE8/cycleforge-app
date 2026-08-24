/**
 * Labels sub-view URL contract for `/products?view=labels`.
 * `print` (Products) is the default and stays out of the URL.
 */

export type LabelsSubView = 'print' | 'recent' | 'history';

export function parseLabelsView(raw: string | null): LabelsSubView {
  if (raw === 'recent') return 'recent';
  if (raw === 'history') return 'history';
  return 'print';
}

export const LABELS_PRODUCTS_TAB_LABEL: Record<LabelsSubView, string> = {
  print: 'Products',
  recent: 'Recent',
  history: 'History',
};
