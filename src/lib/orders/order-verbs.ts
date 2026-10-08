/**
 * The order verbs' ids — what `useOrderActionVerbs` (`to-ship/MorphingRowActionMenu.tsx`)
 * emits on its own, beside the catalog action keys it forwards (`copy`, `print`,
 * …). A view spec names verbs from this list only; the builder owns labels,
 * hotkeys and handlers.
 */
export const ORDER_VERB_IDS = [
  'paste',
  'resolve',
  'out-of-stock',
  'pair-sku-location',
  'urgent',
  'documents',
  'label',
  'scan-out',
  'notes',
  'select',
  'copy',
  'print',
  'create-rule',
  'print-slip',
  'return-label',
  'replacement-label',
  'more-info',
  'delete',
] as const;

export type OrderVerbId = (typeof ORDER_VERB_IDS)[number];
