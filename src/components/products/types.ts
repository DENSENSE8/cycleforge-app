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
        /**
         * The channel's real listing page. Populated for ecwid rows by the
         * product-mirror sync; null on channels whose listing URL we have not
         * captured, where the caller falls back to a keyword-search link.
         */
        listing_url: string | null;
        is_active: boolean;
    }>;
    stock: {
        warehouse_qty: number;
        units_by_status: Array<{ status: string; count: number }>;
        /**
         * On-hand serial units per condition grade — units that have SHIPPED /
         * SCRAPPED / gone to RMA are excluded, so this is what is sellable
         * right now. `grade` is a condition_grade_enum code or `UNGRADED`.
         */
        units_by_grade: Array<{ grade: string; count: number }>;
    };
}
