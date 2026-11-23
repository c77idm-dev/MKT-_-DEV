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

  it('descarta datas impossíveis em vez de quebrar a consulta', () => {
    expect(lerFiltros({ de: '2026-02-30' })).toEqual({});
    expect(lerFiltros({ ate: '2026-13-45' })).toEqual({});
    expect(lerFiltros({ de: '2028-02-29' })).toEqual({ de: '2028-02-29' });
  });

  it('volta para a URL, com parâmetros extras', () => {
    expect(filtrosParaQuery({ rastreio: 'BR 1', canal: 'SHOPEE' }, { pagina: '2' })).toBe('?rastreio=BR+1&canal=SHOPEE&pagina=2');
    expect(filtrosParaQuery({})).toBe('');
    expect(semFiltro({ rastreio: 'A', canal: 'SHOPEE' }, 'rastreio')).toEqual({ canal: 'SHOPEE' });
  });

  it('(extra) "Só as que afetam a reputação no ML": reputacao=1 na URL, ida e volta', () => {
    expect(lerFiltros({ reputacao: '1' })).toEqual({ reputacao: '1' });
    // Só o "1" do formulário liga o filtro.
    expect(lerFiltros({ reputacao: 'sim' })).toEqual({});
    expect(lerFiltros({ reputacao: '' })).toEqual({});
    const filtros = { canal: 'MERCADO_LIVRE', reputacao: '1' } as const;
    const query = filtrosParaQuery(filtros, { pagina: '2' });
    expect(query).toBe('?canal=MERCADO_LIVRE&reputacao=1&pagina=2');
    expect(lerFiltros(Object.fromEntries(new URLSearchParams(query)))).toEqual(filtros);
    expect(temFiltro({ reputacao: '1' })).toBe(true);
    expect(semFiltro(filtros, 'reputacao')).toEqual({ canal: 'MERCADO_LIVRE' });
  });

  it('(extra) a etiqueta do filtro de reputação é "Afetam a reputação", depois das outras', () => {
    expect(descreverFiltros({ reputacao: '1', canal: 'MERCADO_LIVRE' })).toEqual([
      { chave: 'canal', texto: 'Marketplace: Mercado Livre' },
      { chave: 'reputacao', texto: 'Afetam a reputação' },
    ]);
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
