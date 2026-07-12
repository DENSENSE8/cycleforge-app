'use client';

import { useQuery } from '@tanstack/react-query';
import type { MyDayFeed } from '@/lib/my-day/my-day-types';

async function fetchMyDayFeed(): Promise<MyDayFeed> {
  const res = await fetch('/api/my-day', { cache: 'no-store', credentials: 'include' });
  if (!res.ok) throw new Error(`my-day ${res.status}`);
  return res.json();
}

export function useMyDayFeed() {
  return useQuery({
    queryKey: ['my-day'],
    queryFn: fetchMyDayFeed,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });
}