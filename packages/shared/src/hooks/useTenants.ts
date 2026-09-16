import { useQuery } from '@tanstack/react-query';
import type { SharedSupabaseClient } from '../supabase/client';
import { TenantListSchema, type Tenant } from '../types/tenant';

export async function listTenants(client: SharedSupabaseClient): Promise<Tenant[]> {
  const { data, error } = await client
    .from('tenants')
    .select('id, name, slug')
    .order('name', { ascending: true });

  if (error) throw new Error(`Unable to load tenants: ${error.message}`);
  return TenantListSchema.parse(data);
}

export function useTenants(client: SharedSupabaseClient) {
  return useQuery({
    queryKey: ['tenants'],
    queryFn: () => listTenants(client),
  });
}
