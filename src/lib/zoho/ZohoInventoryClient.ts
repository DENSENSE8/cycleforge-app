import { paginateZohoList, zohoDelete, zohoGet, zohoPost, zohoPut } from '@/lib/zoho/httpClient';
import type {
  CreateAdjustmentPayload,
  ZohoItem,
  ZohoItemAdjustment,
  ZohoListResponse,
  ZohoOrganization,
  ZohoWarehouse,
} from '@/lib/zoho/types';

type Query = Record<string, string | number | boolean | null | undefined>;

export class ZohoInventoryClient {
  async listItems(params: Query = {}): Promise<ZohoListResponse<ZohoItem> & { items?: ZohoItem[] }> {
    return zohoGet('/api/v1/items', params);
  }

  paginateItems(params: Query = {}) {
    return paginateZohoList<ZohoItem>('/api/v1/items', 'items', params);
  }

  async getItem(itemId: string): Promise<ZohoItem> {
    const res = await zohoGet<{ item?: ZohoItem }>(`/api/v1/items/${encodeURIComponent(itemId)}`);
    if (!res.item) throw new Error(`Zoho item not found: ${itemId}`);
    return res.item;
  }

  async createItem(payload: Record<string, unknown>): Promise<ZohoItem> {
    const res = await zohoPost<{ item?: ZohoItem }>('/api/v1/items', payload);
    if (!res.item) throw new Error('Zoho item create returned no item');
    return res.item;
  }

  async updateItem(itemId: string, payload: Record<string, unknown>): Promise<ZohoItem> {
    const res = await zohoPut<{ item?: ZohoItem }>(`/api/v1/items/${encodeURIComponent(itemId)}`, payload);
    if (!res.item) throw new Error(`Zoho item update returned no item for ${itemId}`);
    return res.item;
  }

  async markItemInactive(itemId: string): Promise<void> {
    await zohoPost(`/api/v1/items/${encodeURIComponent(itemId)}/inactive`, {});
  }

  async listWarehouses(params: Query = {}): Promise<ZohoListResponse<ZohoWarehouse> & { warehouses?: ZohoWarehouse[] }> {
    return zohoGet('/api/v1/warehouses', params);
  }

  paginateWarehouses(params: Query = {}) {
    return paginateZohoList<ZohoWarehouse>('/api/v1/warehouses', 'warehouses', params);
  }

  async listOrganizations(): Promise<ZohoListResponse<ZohoOrganization> & { organizations?: ZohoOrganization[] }> {
    return zohoGet('/api/v1/organizations');
  }

  async createItemAdjustment(payload: CreateAdjustmentPayload): Promise<ZohoItemAdjustment> {
    const res = await zohoPost<{ inventory_adjustment?: ZohoItemAdjustment; item_adjustment?: ZohoItemAdjustment }>(
      '/api/v1/itemadjustments',
      payload
    );
    return res.inventory_adjustment || res.item_adjustment || {};
  }

  async deleteItem(itemId: string): Promise<void> {
    await zohoDelete(`/api/v1/items/${encodeURIComponent(itemId)}`);
  }
}

export const zohoClient = new ZohoInventoryClient();
