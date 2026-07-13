#!/usr/bin/env node
// Emergency wrapper: delegates to the same worker route used in production.
// It intentionally performs no direct queue writes, so it cannot mark a job
// completed without executing the real inventory synchronization.
require('dotenv').config({ path: ['.env.local', '.env'], quiet: true });

const cronSecret = String(process.env.CRON_SECRET || '').trim();
const baseUrl = String(
    process.env.INVENTORY_SYNC_WORKER_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    'http://localhost:3000'
).trim().replace(/\/+$/, '');

if (!cronSecret) {
    console.error('Falta CRON_SECRET. No se ejecutó el worker.');
    process.exit(2);
}

async function main() {
    const url = new URL('/api/cron/process-queue', baseUrl);
    url.searchParams.set('cron_secret', cronSecret);

    const response = await fetch(url, {
        method: 'GET',
        headers: { Accept: 'application/json' },
    });
    const rawText = await response.text();
    let payload;
    try {
        payload = rawText ? JSON.parse(rawText) : {};
    } catch {
        payload = { raw: rawText.slice(0, 500) };
    }

    console.log(JSON.stringify({ httpStatus: response.status, ...payload }, null, 2));
    if (!response.ok || payload?.ok === false || payload?.error) {
        process.exitCode = 1;
    }
}

main().catch((error) => {
    console.error('No se pudo invocar el worker:', error.message || error);
    process.exit(2);
});
