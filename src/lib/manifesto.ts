import type { MetadataRoute } from 'next';

export const COR_TEMA = '#0F766E';
export const COR_FUNDO = '#F2F4F3';

/** App instalável na tela inicial (PWA básico da Fase 1). Sem service worker: o modo offline é da Fase 2. */
export function manifesto(): MetadataRoute.Manifest {
  return {
    name: 'Gestão de Devoluções',
    short_name: 'Devoluções',
    description: 'Recebimento e conferência das devoluções dos marketplaces',
    lang: 'pt-BR',
    start_url: '/fluxo',
    scope: '/',
    display: 'standalone',
    background_color: COR_FUNDO,
    theme_color: COR_TEMA,
    icons: [
      { src: '/icones/192', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icones/512', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icones/512', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
