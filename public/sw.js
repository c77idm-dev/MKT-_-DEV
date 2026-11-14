// Modo offline básico (spec §6.0, Fase 2). Sem build: este arquivo é servido como está.
// - navegação: rede primeiro; sem rede, uma página "Sem conexão" montada aqui mesmo (HTML mínimo, estilo inline,
//   sem depender de chunks com hash de outro build);
// - /_next/static: do cache (os nomes têm hash), guardando só os mais recentes;
// - /zxing: rede primeiro, cache de reserva (o .wasm não tem hash e precisa combinar com o JS do build);
// - /api/* e pedidos que não são GET: nunca passam por aqui (upload tus, links das mídias, Server Actions).
// Suba a VERSAO quando mudar este arquivo ou o HTML offline: o activate apaga os caches antigos.
const VERSAO = 'devolucoes-v2';

const HTML_SEM_CONEXAO = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sem conexão · Gestão de Devoluções</title>
<style>
body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#f2f4f3;color:#13201d}
main{box-sizing:border-box;max-width:28rem;min-height:100vh;margin:0 auto;padding:2.5rem 1rem;display:flex;flex-direction:column;justify-content:center;gap:1rem}
h1{margin:0;font-size:1.5rem}
p{margin:0;font-size:15px;line-height:1.5}
p.sec{color:#3a4a46}
a{display:flex;align-items:center;justify-content:center;box-sizing:border-box;min-height:56px;border-radius:.5rem;background:#0f766e;color:#fff;font-size:1.125rem;font-weight:600;text-decoration:none}
a:focus-visible{outline:3px solid #115e59;outline-offset:2px}
</style>
</head>
<body>
<main>
<h1>Sem conexão</h1>
<p>O aparelho está sem internet. As fotos e os vídeos da conferência ficam guardados nele e sobem sozinhos quando a conexão voltar.</p>
<p class="sec">Para concluir a conferência é preciso estar com internet.</p>
<a href="">Tentar de novo</a>
</main>
</body>
</html>`;

const MAX_ESTATICOS = 150;

/** Os builds antigos não se acumulam: acima do limite, apaga os mais antigos (as chaves vêm na ordem de gravação). */
async function limparAntigos(cache) {
  const chaves = (await cache.keys()).filter((c) => new URL(c.url).pathname.startsWith('/_next/static/'));
  await Promise.all(chaves.slice(0, Math.max(0, chaves.length - MAX_ESTATICOS)).map((c) => cache.delete(c)));
}

self.addEventListener('install', (evento) => {
  evento.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches
      .keys()
      .then((chaves) => Promise.all(chaves.filter((c) => c !== VERSAO).map((c) => caches.delete(c))))
      .then(() => self.clients.claim()),
  );
});

function paginaSemConexao() {
  return new Response(HTML_SEM_CONEXAO, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

self.addEventListener('fetch', (evento) => {
  const pedido = evento.request;
  if (pedido.method !== 'GET') return;
  const url = new URL(pedido.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  if (pedido.mode === 'navigate') {
    evento.respondWith(fetch(pedido).catch(paginaSemConexao));
    return;
  }

  if (url.pathname.startsWith('/zxing/')) {
    // Rede primeiro: o .wasm não tem hash e tem de combinar com o JS do build atual. Sem rede, usa o cache.
    evento.respondWith(
      caches.open(VERSAO).then(async (cache) => {
        try {
          const resposta = await fetch(pedido);
          if (resposta.ok) await cache.put(pedido, resposta.clone());
          return resposta;
        } catch {
          return (await cache.match(pedido)) ?? Response.error();
        }
      }),
    );
    return;
  }

  if (url.pathname.startsWith('/_next/static/')) {
    evento.respondWith(
      caches.open(VERSAO).then(async (cache) => {
        const guardado = await cache.match(pedido);
        if (guardado) return guardado;
        const resposta = await fetch(pedido);
        if (resposta.ok) {
          await cache.put(pedido, resposta.clone());
          evento.waitUntil(limparAntigos(cache));
        }
        return resposta;
      }),
    );
  }
});
