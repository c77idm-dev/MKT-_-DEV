// Modo offline básico (spec §6.0, Fase 2). Sem build: este arquivo é servido como está.
// - navegação: rede primeiro; sem rede, uma página "Sem conexão" montada aqui mesmo (HTML mínimo, estilo inline,
//   sem depender de chunks com hash de outro build);
// - /_next/static: do cache (os nomes têm hash);
// - /zxing: do cache e atualizado em segundo plano (os arquivos não têm hash);
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
body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#fff;color:#1a1a1a}
main{box-sizing:border-box;max-width:28rem;min-height:100vh;margin:0 auto;padding:2.5rem 1rem;display:flex;flex-direction:column;justify-content:center;gap:1rem}
h1{margin:0;font-size:1.5rem}
p{margin:0;font-size:15px;line-height:1.5}
p.sec{color:#4a4a4a}
a{display:flex;align-items:center;justify-content:center;box-sizing:border-box;min-height:56px;border-radius:.5rem;background:#1a1a1a;color:#fff;font-size:1.125rem;font-weight:600;text-decoration:none}
a:focus-visible{outline:3px solid #2563eb;outline-offset:2px}
</style>
</head>
<body>
<main>
<h1>Sem conexão</h1>
<p>O aparelho está sem internet. As fotos e os vídeos da conferência ficam guardados nele e sobem sozinhos quando a conexão voltar.</p>
<p class="sec">Para concluir a conferência é preciso estar com internet.</p>
<a href="/fluxo">Tentar de novo</a>
</main>
</body>
</html>`;

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
    // Stale-while-revalidate: responde do cache e atualiza em segundo plano.
    evento.respondWith(
      caches.open(VERSAO).then(async (cache) => {
        const guardado = await cache.match(pedido);
        const atualizando = fetch(pedido)
          .then((resposta) => {
            if (resposta.ok) cache.put(pedido, resposta.clone());
            return resposta;
          })
          .catch(() => null);
        if (guardado) {
          evento.waitUntil(atualizando);
          return guardado;
        }
        return (await atualizando) ?? Response.error();
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
        if (resposta.ok) cache.put(pedido, resposta.clone());
        return resposta;
      }),
    );
  }
});
