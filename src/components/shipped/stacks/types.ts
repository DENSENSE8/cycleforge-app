// These two unions live here (the leaf) so the panels can import them downward.
export type ShippedActiveSection =
  | 'shipping'
  | 'product'
  | 'timeline'
  | 'customer'
  | 'documents'
  | 'warranty'
  | 'conversation';
export type ShippedActiveInput =
  | 'none'
  | 'mark_shipped'
  | 'out_of_stock'
  | 'notes'
  | 'assign';

export interface DetailsStackDurationData {
  boxingDuration?: string;
  testingDuration?: string;
}
