import { describe, expect, it } from 'vitest';
import {
  colunasDaDecisao,
  compararEan,
  decisaoDoItem,
  entradaDoItem,
  MOTIVOS_PROBLEMA,
  pendenciasDaConclusao,
  validarItem,
  videoExigido,
  type EntradaItem,
  type EvidenciaRegra,
  type ItemRegra,
} from './regras';

const VAZIA: EntradaItem = { serial: '', loteFabricacao: '', validade: '', decisao: null, motivo: null, observacao: '' };

describe('decisão de cada unidade (contrato §4.1 e D4)', () => {
  it('Estoque Bom, Estoque Problema com motivo, ausente e "ainda não decidiu"', () => {
    expect(colunasDaDecisao('BOM', 'AVARIADO')).toEqual({ destino: 'BOM', motivo: null });
    expect(colunasDaDecisao('PROBLEMA', 'AVARIADO')).toEqual({ destino: 'PROBLEMA', motivo: 'AVARIADO' });
    expect(colunasDaDecisao('AUSENTE', null)).toEqual({ destino: null, motivo: 'AUSENTE' });
    expect(colunasDaDecisao(null, 'USADO')).toEqual({ destino: null, motivo: null });
  });

  it('Estoque Problema exige motivo, e o motivo não pode ser "Ausente"', () => {
    expect(colunasDaDecisao('PROBLEMA', null)).toEqual({ erro: 'Escolha o motivo do Estoque Problema.' });
    expect(colunasDaDecisao('PROBLEMA', 'AUSENTE')).toEqual({ erro: 'Escolha o motivo do Estoque Problema.' });
    expect(MOTIVOS_PROBLEMA).not.toContain('AUSENTE');
  });

  it('decisaoDoItem lê as colunas de volta', () => {
    expect(decisaoDoItem('BOM', null)).toBe('BOM');
    expect(decisaoDoItem('PROBLEMA', 'USADO')).toBe('PROBLEMA');
    expect(decisaoDoItem(null, 'AUSENTE')).toBe('AUSENTE');
    expect(decisaoDoItem(null, null)).toBeNull();
  });
});

describe('validarItem', () => {
  it('apara os textos e transforma vazio em nulo', () => {
    expect(validarItem({ ...VAZIA, serial: '  SN-1 ', loteFabricacao: ' L9 ', validade: '12/2027', decisao: 'BOM', observacao: '  ' })).toEqual({
      colunas: { serial: 'SN-1', loteFabricacao: 'L9', validade: '12/2027', destino: 'BOM', motivo: null, observacao: null },
      erros: [],
    });
  });

  it('junta os erros de tamanho e de decisão', () => {
    const { colunas, erros } = validarItem({ ...VAZIA, serial: 'x'.repeat(101), validade: 'x'.repeat(21), decisao: 'PROBLEMA' });
    expect(colunas).toBeNull();
    expect(erros).toEqual(['Nº de série (S/N): no máximo 100 caracteres', 'Validade: no máximo 20 caracteres', 'Escolha o motivo do Estoque Problema.']);
  });

  it('entradaDoItem monta o formulário a partir das colunas', () => {
    expect(
      entradaDoItem({ serial: 'SN', loteFabricacao: null, validade: null, destino: null, motivo: 'AUSENTE', observacao: 'caixa vazia' }),
    ).toEqual({ serial: 'SN', loteFabricacao: '', validade: '', decisao: 'AUSENTE', motivo: 'AUSENTE', observacao: 'caixa vazia' });
  });
});

describe('compararEan (spec §6.3: EAN diferente do esperado sugere "Divergente")', () => {
  const esperado = { id: 'p1', ean: '0036000291452' };

  it('confere com o esperado, mesmo com zeros à esquerda diferentes (UPC-A lido como EAN-13)', () => {
    expect(compararEan({ esperado, lido: '036000291452', achado: null })).toEqual({ situacao: 'confere', produtoRecebidoId: 'p1', sugerirMotivo: null });
  });

  it('diverge: o produto recebido é o achado pelo EAN (ou nenhum) e sugere Divergente', () => {
    expect(compararEan({ esperado, lido: '7891000000014', achado: { id: 'p2' } })).toEqual({ situacao: 'diverge', produtoRecebidoId: 'p2', sugerirMotivo: 'DIVERGENTE' });
    expect(compararEan({ esperado, lido: '7891000000014', achado: null })).toEqual({ situacao: 'diverge', produtoRecebidoId: null, sugerirMotivo: 'DIVERGENTE' });
  });

  it('sem EAN no cadastro: só diverge quando o EAN é de outro produto', () => {
    const semEan = { id: 'p1', ean: null };
    expect(compararEan({ esperado: semEan, lido: '7891000000014', achado: { id: 'p2' } })).toEqual({ situacao: 'diverge', produtoRecebidoId: 'p2', sugerirMotivo: 'DIVERGENTE' });
    expect(compararEan({ esperado: semEan, lido: '7891000000014', achado: null })).toEqual({ situacao: 'sem_referencia', produtoRecebidoId: 'p1', sugerirMotivo: null });
    expect(compararEan({ esperado: null, lido: '7891000000014', achado: null })).toEqual({ situacao: 'sem_referencia', produtoRecebidoId: null, sugerirMotivo: null });
  });
});

describe('pendenciasDaConclusao (spec §6.3 e contrato §5.4)', () => {
  const PACOTE: EvidenciaRegra[] = [
    { tipo: 'FOTO_1_ETIQUETA', itemId: null },
    { tipo: 'FOTO_2_EMBALAGEM', itemId: null },
  ];
  const fotosDa = (itemId: string): EvidenciaRegra[] => [
    { tipo: 'FOTO_3_PRODUTO', itemId },
    { tipo: 'FOTO_4_CODIGO_SERIAL', itemId },
  ];
  const bom: ItemRegra = { id: 'i1', unidade: 1, destino: 'BOM', motivo: null };
  const problema: ItemRegra = { id: 'i2', unidade: 2, destino: 'PROBLEMA', motivo: 'USADO' };
  const ausente: ItemRegra = { id: 'i3', unidade: 3, destino: null, motivo: 'AUSENTE' };

  it('nada falta: Fotos 1 e 2, Fotos 3 e 4 de cada unidade presente, destino de todas e o vídeo', () => {
    expect(
      pendenciasDaConclusao({
        itens: [bom, ausente],
        evidencias: [...PACOTE, ...fotosDa('i1'), { tipo: 'VIDEO_PROVA', itemId: null }],
        videoObrigatorio: 'SEMPRE',
      }),
    ).toEqual([]);
  });

  it('lista o que falta, na ordem do assistente', () => {
    expect(
      pendenciasDaConclusao({
        itens: [{ ...bom, destino: null }, problema],
        evidencias: [{ tipo: 'FOTO_2_EMBALAGEM', itemId: null }, { tipo: 'FOTO_3_PRODUTO', itemId: 'i2' }],
        videoObrigatorio: 'SEMPRE',
      }),
    ).toEqual([
      'Foto 1 (etiqueta de rastreio e declaração de conteúdo)',
      'Foto 3 da unidade 1',
      'Foto 4 da unidade 1',
      'Destino da unidade 1',
      'Foto 4 da unidade 2',
      'Vídeo de Prova',
    ]);
  });

  it('vídeo SO_PROBLEMA: só quando alguma unidade for Estoque Problema ou ausente (contrato D5)', () => {
    expect(videoExigido('SO_PROBLEMA', [bom])).toBe(false);
    expect(videoExigido('SO_PROBLEMA', [bom, problema])).toBe(true);
    expect(videoExigido('SO_PROBLEMA', [ausente])).toBe(true);
    expect(videoExigido('SEMPRE', [bom])).toBe(true);
    expect(pendenciasDaConclusao({ itens: [bom], evidencias: [...PACOTE, ...fotosDa('i1')], videoObrigatorio: 'SO_PROBLEMA' })).toEqual([]);
  });
});
