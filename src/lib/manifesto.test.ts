import { describe, expect, it } from 'vitest';
import { manifesto } from './manifesto';

describe('manifesto', () => {
  it('descreve o app instalável com as cores da direção C e abre no Fluxo', () => {
    const m = manifesto();
    expect(m).toMatchObject({
      name: 'Gestão de Devoluções',
      short_name: 'Devoluções',
      display: 'standalone',
      start_url: '/fluxo',
      theme_color: '#0F766E',
      background_color: '#F2F4F3',
      lang: 'pt-BR',
    });
    expect(m.icons?.map((i) => [i.src, i.sizes, i.purpose])).toEqual([
      ['/icones/192', '192x192', 'any'],
      ['/icones/512', '512x512', 'any'],
      ['/icones/512', '512x512', 'maskable'],
    ]);
  });
});
