export interface ZohoPageContext {
  page?: number;
  per_page?: number;
  has_more_page?: boolean;
  report_name?: string;
  applied_filter?: string;
  sort_column?: string;
  sort_order?: string;
}

export interface ZohoListResponse<_T, _TKey extends string = string> {
  code: number;
  message?: string;
  page_context?: ZohoPageContext;
  [key: string]: unknown;
}

export interface ZohoItem {
  item_id: string;
  item_group_id?: string;
  name?: string;
  sku?: string;
  upc?: string;
  ean?: string;
  description?: string;
  item_type?: string;
  product_type?: string;
  /** Native item field (free text) — mirrored to items.brand; the Zoho item governs SKU brand. */
  brand?: string;
  /** Native item field (free text) — mirrored to items.manufacturer; brand fallback. */
  manufacturer?: string;
  status?: string;
  rate?: number | string;
  purchase_rate?: number | string;
  unit?: string;
  reorder_level?: number | string;
  initial_stock?: number | string;
  tax_id?: string;
  tax_name?: string;
  tax_percentage?: number | string;
  image_name?: string;
  image_document_id?: string;
  image_url?: string;
  available_stock?: number | string;
  stock_on_hand?: number | string;
  custom_fields?: unknown[];
  warehouses?: Array<{
    warehouse_id?: string;
    warehouse_name?: string;
    initial_stock?: number | string;
    warehouse_stock_on_hand?: number | string;
    warehouse_available_stock?: number | string;
    available_stock?: number | string;
    stock_on_hand?: number | string;
  }>;
  locations?: Array<{
    location_id?: string;
    location_name?: string;
    available_stock?: number | string;
    stock_on_hand?: number | string;
  }>;
  last_modified_time?: string;
}

export interface ZohoWarehouse {
  warehouse_id: string;
  warehouse_name: string;
  is_primary?: boolean;
  status?: string;
  address?: unknown;
}

export interface ZohoOrganization {
  organization_id: string;
  name?: string;
  is_default_org?: boolean;
  time_zone?: string;
  currency_code?: string;
}

export interface ZohoItemAdjustment {
  inventory_adjustment_id?: string;
  adjustment_id?: string;
  reference_number?: string;
  reason?: string;
  date?: string;
  line_items?: unknown[];
}

export interface CreateAdjustmentPayload {
  date: string;
  reason: string;
  reference_number?: string;
  line_items: unknown[];
}

// Purchase-order / receive shapes. Moved here out of `./index` so the mock
// provider can reference them without importing the client barrel (cycle).
// `./index` re-exports all four for backwards compatibility.
interface ZohoPurchaseReceiveLine {
  line_item_id: string;
  quantity_received: number;
  item_id?: string;
}

interface ZohoPurchaseReceive {
  purchase_receive_id: string;
  purchaseorder_id?: string;
  purchaseorder_number?: string;
  date?: string;
  status?: string;
  vendor_name?: string;
  warehouse_id?: string;
  warehouse_name?: string;
  line_items?: ZohoPurchaseReceiveLine[];
}

interface ZohoPurchaseOrderLine {
  line_item_id: string;
  item_id: string;
  name?: string;
  description?: string;
  sku?: string;
  quantity?: number;
  quantity_received?: number;
  rate?: number;
  total?: number;
  unit?: string;
  item_order?: number;
  account_id?: string;
}

interface ZohoPurchaseOrder {
  purchaseorder_id: string;
  purchaseorder_number?: string;
  vendor_id?: string;
  vendor_name?: string;
  status?: string;
  date?: string;
  delivery_date?: string;
  expected_delivery_date?: string;
  total?: number;
  sub_total?: number;
  currency_code?: string;
  warehouse_id?: string;
  warehouse_name?: string;
  line_items?: ZohoPurchaseOrderLine[];
  notes?: string;
  reference_number?: string;
  bills?: Array<{ bill_id?: string; bill_number?: string; status?: string }>;
}
