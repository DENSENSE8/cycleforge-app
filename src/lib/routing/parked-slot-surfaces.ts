/**
 * URLs of the retired compound-grid surfaces (deleted 2026-10-03).
 *
 * The pages and their grids are gone; this policy keeps old links and bookmarks
 * landing on the nearest retained surface instead of a 404.
 */

const PARKED_INVENTORY_PATHS = new Set([
  '/inventory',
  '/inventory/activity',
  '/inventory/alerts',
  '/inventory/bins',
  '/inventory/bulk-allocate',
  '/inventory/counts',
  '/inventory/events',
  '/inventory/holds',
  '/inventory/pulse',
  '/inventory/returns',
  '/inventory/skus',
  '/inventory/units',
]);

const PARKED_SETTINGS_PREFIXES = [
  '/settings/audit',
  '/settings/devices',
  '/settings/sessions',
  '/settings/staff',
] as const;

function normalizedPathname(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith('/')) return pathname.slice(0, -1);
  return pathname;
}

function isPathOrChild(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function withParams(pathname: string, params: URLSearchParams): string {
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

/** Return the retained destination for a parked URL, or `null` when it remains mounted. */
export function parkedSlotSurfaceDestination(
  rawPathname: string,
  searchParams: URLSearchParams,
): string | null {
  const pathname = normalizedPathname(rawPathname);

  const unitId =
    pathname === '/inventory/units' || pathname === '/inventory'
      ? searchParams.get('unit')
      : null;
  if (unitId && /^[1-9]\d*$/.test(unitId)) return `/serial/${unitId}`;

  const isRetainedInventorySection =
    pathname === '/inventory' &&
    (searchParams.get('section') === 'replenish' ||
      Boolean(searchParams.get('sku')?.trim()) ||
      Boolean(searchParams.get('bin')?.trim()));

  if (
    !isRetainedInventorySection &&
    (PARKED_INVENTORY_PATHS.has(pathname) ||
      isPathOrChild(pathname, '/inventory/cycle-counts') ||
      isPathOrChild(pathname, '/inventory/health') ||
      isPathOrChild(pathname, '/admin/inventory'))
  ) {
    return '/inventory/locations';
  }

  if (
    pathname === '/inventory/locations' &&
    String(searchParams.get('tab') ?? '').trim().toLowerCase() === 'bins'
  ) {
    return '/inventory/locations';
  }

  if (pathname === '/reports') {
    const tab = String(searchParams.get('tab') ?? '').trim().toLowerCase();
    if (tab !== 'packer' && tab !== 'activity') {
      const next = new URLSearchParams(searchParams);
      next.set('tab', 'packer');
      return withParams('/reports', next);
    }
  }

  if (isPathOrChild(pathname, '/review')) {
    const mode = String(searchParams.get('mode') ?? '').trim().toLowerCase();
    return mode === 'pairing' || mode === 'catalog-link' ? '/products' : '/operations';
  }

  if (PARKED_SETTINGS_PREFIXES.some((prefix) => isPathOrChild(pathname, prefix))) {
    return '/settings';
  }

  if (isPathOrChild(pathname, '/search')) {
    const rawSelection = searchParams.get('sel') ?? '';
    const separator = rawSelection.indexOf(':');
    const entityType = separator > 0 ? rawSelection.slice(0, separator) : '';
    const entityId = separator > 0 ? rawSelection.slice(separator + 1).trim() : '';
    const positiveId = /^[1-9]\d*$/.test(entityId) ? entityId : null;
    if (entityType === 'order' && entityId) {
      return withParams('/shipping/orders', new URLSearchParams({ openOrderId: entityId }));
    }
    if (entityType === 'unit' && positiveId) return `/serial/${positiveId}`;
    if (entityType === 'receiving' && positiveId) return `/unbox?openReceivingId=${positiveId}`;
    if (entityType === 'repair' && positiveId) return `/repair?openRepair=${positiveId}`;
    if (entityType === 'sku') return '/products';
    if (entityType === 'fba') return '/shipping/fba';
    return '/';
  }

  if (pathname === '/dashboard') {
    const mode = String(searchParams.get('mode') ?? '').trim().toLowerCase();
    if (mode === 'sales') return '/counter';
  }

  if (pathname === '/walk-in') {
    const mode = String(searchParams.get('mode') ?? '').trim().toLowerCase();
    const category = String(searchParams.get('category') ?? '').trim().toLowerCase();
    if (mode !== 'repair' && mode !== 'repairs' && category !== 'repair' && category !== 'repairs') {
      return '/counter';
    }
  }

  if (pathname === '/sourcing') {
    const mode = String(searchParams.get('mode') ?? '').trim().toLowerCase();
    if (mode === 'compatibility') {
      const next = new URLSearchParams(searchParams);
      next.delete('mode');
      return withParams('/sourcing', next);
    }
  }

  if (pathname === '/support') {
    const mode = String(searchParams.get('mode') ?? '').trim().toLowerCase();
    if (mode === 'warranty') {
      const next = new URLSearchParams(searchParams);
      next.delete('mode');
      return withParams('/support', next);
    }
  }

  if (isPathOrChild(pathname, '/audit-log')) return '/settings';

  // Deleted 2026-10-03: returns arrive through Unbox's return scan; phones pack from the pick job.
  if (isPathOrChild(pathname, '/warehouse/rma')) return '/unbox';
  if (pathname === '/m/pack') return '/m/pick';

  return null;
}
