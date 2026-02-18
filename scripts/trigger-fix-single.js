
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

async function runSingle() {
    const sku = 'INF-EL-TT';
    console.log(`Fixing ${sku}...`);

    try {
        const res = await fetch('http://localhost:3000/api/debug/fix-batch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ skus: [sku] })
        });
        const data = await res.json();
        console.log('Processed:', data.processed);
        if (data.log) {
            console.log('Filtered Log:');
            data.log.forEach(l => {
                if (l.includes('Supabase Config') || l.includes('Final Stock') || l.match(/Qty [1-9]/)) {
                    console.log(l);
                }
            });
        }
        if (data.error) console.error('Error:', data.error, data.details);
    } catch (err) {
        console.error('Failed:', err);
    }
}

runSingle();
