/**
 * Section tabs for Dashboard Search order detail — independent of
 * ShippedActiveSection so search chrome can evolve without the slide-over.
 */
export type SearchOrderSection =
  | 'overview'
  | 'shipping'
  | 'product'
  | 'documents'
  | 'timeline'
  | 'customer'
  | 'warranty'
  | 'conversation';

export const SEARCH_ORDER_SECTION_TABS: ReadonlyArray<{
  value: SearchOrderSection;
  label: string;
}> = [
  { value: 'overview', label: 'Overview' },
  { value: 'shipping', label: 'Shipping' },
  { value: 'product', label: 'Product' },
  { value: 'documents', label: 'Documents' },
  { value: 'timeline', label: 'Timeline' },
  { value: 'customer', label: 'Customer' },
  { value: 'warranty', label: 'Warranty' },
  { value: 'conversation', label: 'Conversation' },
];
