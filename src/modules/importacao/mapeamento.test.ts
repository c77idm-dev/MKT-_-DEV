import { describe, expect, it } from 'vitest';
import { aplicarMapeamento, camposFaltando, sanitizarMapeamento, sugerirMapeamento, type CampoImportacao } from './mapeamento';

const CAMPOS: CampoImportacao[] = [
  { chave: 'sku', rotulo: 'SKU', obrigatorio: true, sinonimos: ['codigo', 'cod', 'codigo do produto', 'referencia'] },
  { chave: 'ean', rotulo: 'EAN (código de barras)', obrigatorio: false, sinonimos: ['ean', 'gtin', 'codigo de barras', 'cod barras'] },
  { chave: 'descricao', rotulo: 'Descrição', obrigatorio: true, sinonimos: ['produto', 'nome do produto', 'nome'] },
  { chave: 'unidade', rotulo: 'Unidade', obrigatorio: false, sinonimos: ['un', 'unid', 'unidade de medida'] },
];

describe('sugerirMapeamento', () => {
  it('casa os exemplos da spec §6.8: "Código" → sku e "Código de barras"/"GTIN" → ean', () => {
    expect(sugerirMapeamento(CAMPOS, ['Código', 'Código de barras', 'Descrição'])).toEqual({
      sku: 'Código',
      ean: 'Código de barras',
      descricao: 'Descrição',
      unidade: null,
    });
    expect(sugerirMapeamento(CAMPOS, ['GTIN', 'SKU', 'Nome do Produto'])).toMatchObject({ sku: 'SKU', ean: 'GTIN', descricao: 'Nome do Produto' });
  });

  it('usa todas as palavras de um sinônimo dentro do nome da coluna, sem repetir coluna', () => {
    expect(sugerirMapeamento(CAMPOS, ['Cod. Produto', 'Código de Barras', 'Descrição curta'])).toEqual({
      sku: 'Cod. Produto',
      ean: 'Código de Barras',
      descricao: 'Descrição curta',
      unidade: null,
    });
  });

  it('o mapeamento salvo vence a sugestão quando a coluna existe', () => {
    const salvo = { sku: 'Ref. Interna', ean: 'Coluna que sumiu', descricao: null, unidade: 'Und' };
    expect(sugerirMapeamento(CAMPOS, ['Código', 'Ref. Interna', 'Descrição', 'Und'], salvo)).toEqual({
      sku: 'Ref. Interna',
      ean: null,
      descricao: 'Descrição',
      unidade: 'Und',
    });
  });
});

describe('sanitizarMapeamento e camposFaltando', () => {
  it('aceita só campos conhecidos e colunas que existem, uma coluna por campo', () => {
    const bruto = { sku: 'Código', ean: 'Código', descricao: 'Não existe', extra: 'Código', unidade: 42 };
    const m = sanitizarMapeamento(CAMPOS, ['Código', 'Descrição'], bruto);
    expect(m).toEqual({ sku: 'Código', ean: null, descricao: null, unidade: null });
    expect(camposFaltando(CAMPOS, m).map((c) => c.rotulo)).toEqual(['Descrição']);
  });
});

describe('aplicarMapeamento', () => {
  it('monta as linhas com o número da linha na planilha e pula as vazias', () => {
    const planilha = {
      cabecalhos: ['Código', 'Nome', 'Obs'],
      linhas: [
        ['A1', ' Fone ', 'x'],
        ['', '', 'só observação'],
        ['B2', 'Cabo', ''],
      ],
    };
    const linhas = aplicarMapeamento(planilha, CAMPOS, { sku: 'Código', ean: null, descricao: 'Nome', unidade: null });
    expect(linhas).toEqual([
      { numeroLinha: 2, valores: { sku: 'A1', ean: '', descricao: 'Fone', unidade: '' } },
      { numeroLinha: 4, valores: { sku: 'B2', ean: '', descricao: 'Cabo', unidade: '' } },
    ]);
  });
});
