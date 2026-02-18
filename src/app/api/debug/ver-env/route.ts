import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
    // Helper to mask secrets
    const mask = (val?: string) => {
        if (!val) return '❌ MISSING';
        if (val.trim() === '') return '❌ EMPTY STRING';
        if (val !== val.trim()) return `⚠️ HAS WHITESPACE (${val.length} chars)`;
        const visible = val.slice(0, 4) + '...' + val.slice(-4);
        return `✅ LOADED (${val.length} chars): ${visible}`;
    };

    const envStatus = {
        NEXT_PUBLIC_SUPABASE_URL: mask(process.env.NEXT_PUBLIC_SUPABASE_URL),
        ZOHO_BOOKS_CLIENT_ID: mask(process.env.ZOHO_BOOKS_CLIENT_ID),
        ZOHO_BOOKS_CLIENT_SECRET: mask(process.env.ZOHO_BOOKS_CLIENT_SECRET),
        ZOHO_BOOKS_REFRESH_TOKEN: mask(process.env.ZOHO_BOOKS_REFRESH_TOKEN),
        ZOHO_BOOKS_ORGANIZATION_ID: mask(process.env.ZOHO_BOOKS_ORGANIZATION_ID),
        CRON_SECRET: mask(process.env.CRON_SECRET),
        VERCEL_ENV: process.env.VERCEL_ENV || 'unknown',
        NODE_ENV: process.env.NODE_ENV,
    };

    return NextResponse.json(envStatus, { status: 200 });
}
