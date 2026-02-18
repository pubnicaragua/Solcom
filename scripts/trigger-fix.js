

// Use dynamic import for node-fetch or native fetch in newer node
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

const fs = require('fs');

async function runFix() {
    if (!fs.existsSync('mismatches.json')) {
        console.error('mismatches.json not found. Run find-mismatches.js first.');
        return;
    }

    const skus = JSON.parse(fs.readFileSync('mismatches.json', 'utf8'));
    console.log(`Loaded ${skus.length} SKUs to fix.`);

    const BATCH_SIZE = 5;
    for (let i = 0; i < skus.length; i += BATCH_SIZE) {
        const batch = skus.slice(i, i + BATCH_SIZE);
        console.log(`Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(skus.length / BATCH_SIZE)}... (${batch.length} items)`);

        try {
            const res = await fetch('http://localhost:3000/api/debug/fix-batch', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ skus: batch })
            });
            const data = await res.json();
            if (data.processed !== undefined) {
                console.log(`  Result: processed ${data.processed}.`);
                if (data.log && data.log.length > 0) console.log('  Log:', data.log.filter(l => l.includes('ERROR')));
            } else {
                console.error('  Batch Error Response:', JSON.stringify(data, null, 2));
            }
        } catch (err) {
            console.error('  Batch failed:', err.message);
        }

        // Wait 1s to respect rate limits
        await new Promise(r => setTimeout(r, 3000));
    }

    console.log('Done.');
}

runFix().catch(console.error);
