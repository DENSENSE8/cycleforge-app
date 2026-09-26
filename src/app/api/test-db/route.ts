import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import { withAuth } from '@/lib/auth/withAuth';

export const GET = withAuth(async () => {
    // Test existing pg pool connection
    const result = await pool.query('SELECT NOW()');
    
    return NextResponse.json({
        success: true,
        message: 'Database connection successful',
        timestamp: result.rows[0].now,
        database_url_set: !!process.env.DATABASE_URL,
        connection_type: 'pg Pool'
    });
}, { permission: 'admin.view' });

