/** The pack standard a SKU's packs are weighted at, as the record API sends it. */
export interface ProductPackProfile {
    minutes: number;
    tier: 'SMALL' | 'MEDIUM' | 'LARGE';
    /** 'profile' = a human set this. 'rules' = derived from the product title. */
    source: 'profile' | 'rules';
}

export interface ProductDetailPayload {
    success: true;
    product: {
        id: number;
        sku: string;
        product_title: string | null;
        category: string | null;
        gtin: string | null;
        upc: string | null;
        image_url: string | null;
        is_active: boolean;
        /** External inventory-provider item id (capability-neutral). */
        provider_item_id: string | null;
    };
    platforms: Array<{
        id: number;
        platform: string;
        platform_sku: string | null;
        platform_item_id: string | null;
        account_name: string | null;
        display_name: string | null;
        image_url: string | null;
        is_active: boolean;
    }>;
    stock: {
        warehouse_qty: number;
        units_by_status: Array<{ status: string; count: number }>;
    };
    /** The pack standard this SKU's packs are weighted at (never null). */
    packProfile: ProductPackProfile;
}
