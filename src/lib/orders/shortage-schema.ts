/** Detect item-level OOS tables/columns so assign does not 500 before migrate. */

export type ShortageSchemaClient = {
  query: (sql: string, values?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>;
};

export type ShortageSchemaFlags = {
  tables: boolean;
  oosZohoColumn: boolean;
};

let cache: { flags: ShortageSchemaFlags; at: number } | null = null;

export async function readShortageSchema(client: ShortageSchemaClient): Promise<ShortageSchemaFlags> {
  if (cache && Date.now() - cache.at < 15_000) return cache.flags;

  const tablesQ = await client.query(
    `SELECT to_regclass('public.order_line_shortages') IS NOT NULL AS present`,
  );
  const colQ = await client.query(
    `SELECT EXISTS (
       SELECT 1
         FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'orders'
          AND column_name = 'oos_zoho_item_id'
     ) AS present`,
  );

  const flags: ShortageSchemaFlags = {
    tables: Boolean(tablesQ.rows[0]?.present),
    oosZohoColumn: Boolean(colQ.rows[0]?.present),
  };
  cache = { flags, at: Date.now() };
  return flags;
}

export function invalidateShortageSchemaCache(): void {
  cache = null;
}
