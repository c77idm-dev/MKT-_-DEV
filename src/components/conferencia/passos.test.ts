import { describe, expect, it } from 'vitest';
import { montarPassos, passoCompleto } from './passos';

const ITENS = [
  { id: 'i1', unidade: 1 },
  { id: 'i2', unidade: 2 },
];

describe('passos do assistente (spec §6.3)', () => {
  it('Pacote, uma etapa por unidade, Vídeo de Prova e Destino', () => {
    expect(montarPassos(ITENS).map((p) => p.rotulo)).toEqual(['Pacote', 'Unidade 1', 'Unidade 2', 'Vídeo de Prova', 'Destino']);
  });

  it('cada passo sabe quando está completo', () => {
    const [pacote, unidade1, unidade2, video, destino] = montarPassos(ITENS);
    const enviadas = new Set(['FOTO_1_ETIQUETA:', 'FOTO_2_EMBALAGEM:', 'FOTO_3_PRODUTO:i1']);
    const contexto = {
      enviada: (tipo: string, itemId: string | null) => enviadas.has(`${tipo}:${itemId ?? ''}`),
      decisao: (id: string) => (id === 'i2' ? ('AUSENTE' as const) : null),
      videoExigido: false,
      itens: ITENS,
    };
    expect(passoCompleto(pacote, contexto)).toBe(true);
    expect(passoCompleto(unidade1, contexto)).toBe(false); // falta a Foto 4
    expect(passoCompleto(unidade2, contexto)).toBe(true); // ausente
    expect(passoCompleto(video, contexto)).toBe(true); // não exigido
    expect(passoCompleto(destino, contexto)).toBe(false); // unidade 1 sem destino
  });
});
