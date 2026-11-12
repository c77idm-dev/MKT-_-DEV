import { describe, expect, it } from 'vitest';
import { descreverFiltros, filtrosParaQuery, lerFiltros, semFiltro, temFiltro } from './filtros';

describe('filtros da Busca Avançada', () => {
  it('lê da URL só o que é válido', () => {
    expect(
      lerFiltros({ rastreio: ' br1 ', pedido: '', canal: 'AMAZON', status: 'XX', de: '2026-11-01', ate: '01/11/2026', codigo: ['789', 'x'] }),
    ).toEqual({ rastreio: 'br1', canal: 'AMAZON', codigo: '789', de: '2026-11-01' });
    expect(temFiltro({})).toBe(false);
    expect(temFiltro({ status: 'CANCELADA' })).toBe(true);
  });

  it('volta para a URL, com parâmetros extras', () => {
    expect(filtrosParaQuery({ rastreio: 'BR 1', canal: 'SHOPEE' }, { pagina: '2' })).toBe('?rastreio=BR+1&canal=SHOPEE&pagina=2');
    expect(filtrosParaQuery({})).toBe('');
    expect(semFiltro({ rastreio: 'A', canal: 'SHOPEE' }, 'rastreio')).toEqual({ canal: 'SHOPEE' });
  });

  it('descreve os filtros ativos para as etiquetas', () => {
    expect(descreverFiltros({ de: '2026-11-01', canal: 'MAGALU', status: 'PENDENTE_CHEGADA', rastreio: 'BR1' })).toEqual([
      { chave: 'rastreio', texto: 'Rastreio: BR1' },
      { chave: 'canal', texto: 'Marketplace: Magalu' },
      { chave: 'status', texto: 'Status: Pendente de chegada' },
      { chave: 'de', texto: 'De: 01/11/2026' },
    ]);
  });
});
