/** Client-safe catalog list types (mirror of server SkuCatalogListRow). */

export interface CatalogListRow {
  id: number;
  sku: string;
  product_title: string;
  category: string | null;
  image_url: string | null;
  is_active: boolean;
  lifecycle_status: string;
  reorder_threshold: number | null;
  last_known_cost_cents: number | null;
  platform_count: number;
  manual_count: number;
  qc_step_count: number;
  order_count: number;
  provider_item_id: string | null;
  inventory_title: string | null;
  is_inventory_linked: boolean;
  has_pending_action: boolean;
  display_title: string;
  platform_ids: Array<{
    platform: string;
    platform_sku: string | null;
    platform_item_id: string | null;
    account_name: string | null;
  }>;
}
