export interface EditableShippingFields {
  orderNumber: string;
  itemNumber: string;
  trackingNumber: string;
  shipByDate: string;
  isSaving?: boolean;
  isSavingShipByDate?: boolean;
  onOrderNumberChange: (value: string) => void;
  onItemNumberChange: (value: string) => void;
  onTrackingNumberChange: (value: string) => void;
  onShipByDateChange: (value: string) => void;
  onBlur: () => void;
  onShipByDateBlur: () => void;
}

interface PrepackedSkuInfo {
  staticSku: string;
  productTitle?: string | null;
  photos?: Array<{ id: number; url: string }>;
}

export type TrackingRow = {
  shipmentId: number | null;
  tracking: string;
  isPrimary: boolean;
};

/** A flat, deduped tracking entry rendered as Tracking 1, 2, 3, … */
export type FlatTrackingRow = { tracking: string; shipmentId: number | null };
