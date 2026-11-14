// Modo offline básico (spec §6.0, Fase 2). Sem build: este arquivo é servido como está.
// - navegação: rede primeiro; sem rede, a página "Sem conexão" guardada;
// - /_next/static e /zxing: do cache (os nomes têm hash ou não mudam);
// - /api/* e pedidos que não são GET: nunca passam por aqui (upload tus, links das mídias, Server Actions).
const VERSAO = 'devolucoes-v1';
const PAGINA_OFFLINE = '/offline';

self.addEventListener('install', (evento) => {
  evento.waitUntil(
    caches
      .open(VERSAO)
      .then((cache) => cache.add(new Request(PAGINA_OFFLINE, { cache: 'reload' })))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches
      .keys()
      .then((chaves) => Promise.all(chaves.filter((c) => c !== VERSAO).map((c) => caches.delete(c))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (evento) => {
  const pedido = evento.request;
  if (pedido.method !== 'GET') return;
  const url = new URL(pedido.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  if (pedido.mode === 'navigate') {
    evento.respondWith(fetch(pedido).catch(() => caches.match(PAGINA_OFFLINE)));
    return;
  }

  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/zxing/')) {
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
