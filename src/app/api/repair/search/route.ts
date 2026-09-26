import { NextRequest, NextResponse } from 'next/server';
import { searchRepairs } from '@/lib/neon/repair-service-queries';
import { withAuth } from '@/lib/auth/withAuth';

export const GET = withAuth(async (req: NextRequest, ctx) => {
    const { searchParams } = new URL(req.url);
    const query = searchParams.get('q');

    if (!query || query.trim() === '') {
        return NextResponse.json({ results: [] });
    }

    const result = await searchRepairs(query.trim(), undefined, ctx.organizationId);

    return NextResponse.json({
        results: result,
        count: result.length
    });
}, { permission: 'repair.view' });
