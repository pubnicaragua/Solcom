const fs = require('fs');
const path = require('path');

const mismatchesPath = path.join(__dirname, '..', 'mismatches_full.json');
const artifactDir = 'C:\\Users\\rafae\\.gemini\\antigravity-ide\\brain\\3440d63a-7642-4e0d-be01-36665509bde3';
const outputPath = path.join(artifactDir, 'discrepancias_reporte.md');

try {
  const data = JSON.parse(fs.readFileSync(mismatchesPath, 'utf8'));
  let md = '# Reporte Detallado de Discrepancias (Zoho vs ERP)\n\n';
  md += 'Este reporte detalla los ' + data.length + ' SKUs que presentan diferencias de stock entre Zoho Inventory y la base de datos de Supabase (ERP).\n\n';
  md += '| SKU | Nombre del Producto | Stock Zoho | Stock ERP | Diferencia (ERP - Zoho) |\n';
  md += '|---|---|---|---|---|\n';
  
  data.forEach(item => {
    const diff = item.erpStock - item.zohoStock;
    const diffText = diff > 0 ? `+${diff}` : diff;
    md += `| ${item.sku} | ${item.name} | ${item.zohoStock} | ${item.erpStock} | **${diffText}** |\n`;
  });
  
  fs.writeFileSync(outputPath, md);
  console.log('Reporte generado en: ' + outputPath);
} catch(e) {
  console.error(e);
}
