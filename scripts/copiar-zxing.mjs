// Copia o .wasm do leitor ZXing para public/zxing, para o celular baixar do próprio sistema (sem CDN).
// Roda sozinho antes do `npm run dev` e do `npm run build` (scripts predev e prebuild).
import { copyFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const origem = require.resolve('zxing-wasm/reader/zxing_reader.wasm');
const destino = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'zxing', 'zxing_reader.wasm');
mkdirSync(dirname(destino), { recursive: true });
copyFileSync(origem, destino);
console.log(`zxing_reader.wasm copiado para ${destino}`);
