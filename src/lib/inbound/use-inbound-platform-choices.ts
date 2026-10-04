'use client';

import { useMemo } from 'react';
import { usePlatformCatalog } from '@/hooks/useCatalog';
import { inboundPlatformOptions } from '@/lib/inbound/inbound-platform-options';
import type { InboundOrderChoice } from '@/lib/inbound/inbound-order-compose';

/**
 * The platforms a hand-entered inbound order may name — the org catalog in
 * inbound-intake order, without Zoho (Zoho orders arrive by sync; a typed
 * order names the seller platform). Every face of the inbound form uses this.
 */
export function useInboundPlatformChoices(): InboundOrderChoice[] {
  const catalog = usePlatformCatalog();
  return useMemo(
    () => inboundPlatformOptions(catalog.options ?? []).filter(({ value }) => value !== 'zoho'),
    [catalog.options],
  );
}
