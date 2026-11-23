'use client';

import { useState } from 'react';

/** 44, 64 e 128 px. Classes inteiras (o Tailwind só gera as que aparecem escritas). */
const TAMANHOS = { p: 'size-11', m: 'size-16', g: 'size-32' } as const;
export type TamanhoFoto = keyof typeof TAMANHOS;

const CAIXA = 'shrink-0 overflow-hidden rounded-lg border border-borda bg-fundo';

/**
 * Produtos do ML (extra, emenda E22): a foto do anúncio num quadrado fixo, para o Operador comparar com o que tem na mão.
 * Sem foto, ou se ela não carregar, um ícone neutro do mesmo tamanho: nunca uma imagem quebrada. `<img>` simples, sem o
 * otimizador do Next: a foto é do ML (a CSP já aceita `img-src https:`) e vai sem referer.
 */
export function FotoProduto({ url, descricao, tamanho = 'p' }: { url: string | null | undefined; descricao: string; tamanho?: TamanhoFoto }) {
  // A URL que falhou: uma foto nova volta a aparecer.
  const [falhou, setFalhou] = useState<string | null>(null);
  if (!url || falhou === url) {
    return (
      <span role="img" aria-label="Sem foto do produto" className={`${TAMANHOS[tamanho]} ${CAIXA} flex items-center justify-center text-borda-campo`}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="size-1/2">
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <circle cx="9" cy="10" r="1.75" />
          <path d="m21 16-5-5-9 9" />
        </svg>
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- foto do anúncio do ML (https): sem o otimizador de imagens
    <img
      // O erro pode acontecer antes da hidratação, quando o React ainda não ouve o onError: confere ao ligar o elemento.
      ref={(img) => {
        if (img?.complete && img.naturalWidth === 0) setFalhou(url);
      }}
      src={url}
      alt={descricao}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFalhou(url)}
      className={`${TAMANHOS[tamanho]} ${CAIXA} object-cover`}
    />
  );
}
