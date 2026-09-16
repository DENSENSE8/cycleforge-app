import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export type SharedSupabaseClient = SupabaseClient;

export function createSharedSupabaseClient({
  url,
  anonKey,
}: {
  url: string;
  anonKey: string;
}): SharedSupabaseClient {
  if (!url.trim() || !anonKey.trim()) {
    throw new Error('Supabase URL and anonymous key are required.');
  }

  return createClient(url, anonKey);
}
