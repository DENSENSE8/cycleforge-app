import type { NextRequest } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { handleBrandProposalList } from '@/lib/brands/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/brands/proposals?status=&limit=&before= — the approval-first brand review queue (agent_mutations). */
export const GET = withAuth((req: NextRequest, ctx) => handleBrandProposalList(req, ctx), { permission: 'sku_stock.view' });
