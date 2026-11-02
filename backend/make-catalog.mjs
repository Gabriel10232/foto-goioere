// Gera backend/catalog.json a partir de data/products.js.
// Só entram preço e estoque CONFIRMADOS: itens com "valor de referência" ficam sem preço e o servidor recusa a venda.
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(here, '..', 'data', 'products.js'), 'utf8');
const ctx = { window: {} };
vm.createContext(ctx);
vm.runInContext(src, ctx);

const catalog = {};
let confirmed = 0;
for (const p of ctx.window.PRODUCTS) {
  const ok = typeof p.price === 'number' && !p.priceEstimated;
  if (ok) confirmed++;
  catalog[p.id] = { id: p.id, name: p.name, stock: p.stock, priceCents: ok ? Math.round(p.price * 100) : null };
}
fs.writeFileSync(path.join(here, 'catalog.json'), JSON.stringify(catalog));
console.log(`catalog.json: ${Object.keys(catalog).length} produtos, ${confirmed} com preço confirmado`);
