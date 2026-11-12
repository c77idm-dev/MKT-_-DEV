import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import { obterDetalhe } from '@/modules/devolucoes/detalhe';
import { ErroTransicao } from '@/modules/devolucoes/transicoes';
import { criarDbTeste, limparTabelas } from '../../../tests/helpers/db';
import { criarProdutoTeste, criarUsuarioTeste } from '../../../tests/helpers/fabricas';
import type { DefinicaoImportacao } from './definicao';
import { obterDefinicao } from './definicoes';
import { ErroImportacao, calcularPrevia, confirmarImportacao, mapeamentoEfetivo, obterImportacao, registrarUpload } from './servico';

const { db, sql } = criarDbTeste();
let operador: UsuarioSessao;
const CABECALHOS = ['Marketplace', 'Pedido', 'Reclamação', 'Rastreio', 'Transportadora', 'SKU', 'Qtd', 'Motivo', 'Data de postagem'];

function definicao(): DefinicaoImportacao {
  const def = obterDefinicao('devolucoes');
  if (!def) throw new Error('sem definição de devoluções');
  return def;
}

async function enviar(linhas: string[][]) {
  const id = await registrarUpload(db, {
    tipo: 'devolucoes',
    nomeArquivo: 'devolucoes.csv',
    planilha: { cabecalhos: CABECALHOS, linhas },
    usuarioId: operador.id,
  });
  const imp = await obterImportacao(db, id, 'devolucoes');
  if (!imp) throw new Error('importação não gravada');
  return imp;
}

async function previa(linhas: string[][]) {
  const def = definicao();
  const imp = await enviar(linhas);
  return calcularPrevia(db, def, imp, await mapeamentoEfetivo(db, def, imp));
}

beforeEach(async () => {
  await limparTabelas(sql);
  operador = await criarUsuarioTeste(db, 'OPERADOR');
});
afterAll(async () => {
  await sql.end();
});

describe('importação de devoluções', () => {
  it('é feita por quem opera devoluções e volta para a etapa 1', () => {
    expect(definicao()).toMatchObject({ acao: 'operar_devolucoes', voltarPara: '/fluxo/etapa/1', rotuloAtualizados: null });
  });

  it('sugere as colunas do modelo da spec §6.1', async () => {
    const imp = await enviar([['Shopee', 'SHP-1', '', 'BR1', '', 'FONE-01', '1', '', '']]);
    expect(await mapeamentoEfetivo(db, definicao(), imp)).toEqual({
      canal: 'Marketplace',
      numero_pedido: 'Pedido',
      id_reclamacao: 'Reclamação',
      rastreio: 'Rastreio',
      transportadora: 'Transportadora',
      sku: 'SKU',
      quantidade: 'Qtd',
      motivo_cliente: 'Motivo',
      data_postagem: 'Data de postagem',
    });
  });

  it('junta as linhas do mesmo pedido, avisa SKU fora do cadastro e aponta os erros de cada linha, sempre com o pedido', async () => {
    await criarProdutoTeste(db, { sku: 'FONE-01' });
    const p = await previa([
      ['Shopee', 'SHP-1', '', 'BR1', 'Correios', 'FONE-01', '1', 'Defeito', '05/11/2026'],
      ['Shopee', 'SHP-1', '', 'BR1', 'Correios', 'CABO-99', '2', 'Defeito', '05/11/2026'],
      ['Amazon', 'AMZ-2', '', 'BR2', 'Correios', 'FONE-01', '', '', ''],
      ['Loja X', 'X-3', '', 'BR3', '', 'FONE-01', '1', '', ''],
      ['Magalu', 'MGL-4', '', 'BR4', '', 'FONE-01', '1', '', ''],
      ['Magalu', 'MGL-4', '', 'BR4', '', '', '1', '', ''],
      ['Amazon', 'AMZ-2', '', 'BR9', '', 'FONE-01', '1', '', ''],
    ]);
    expect(p.linhas.map((l) => [l.numeroLinha, l.erros, l.avisos])).toEqual([
      [2, [], []],
      [3, [], ['Pedido SHP-1: SKU CABO-99 fora do cadastro de produtos']],
      [4, [], []],
      [5, ['Pedido X-3: Canal desconhecido: Loja X. Use: Mercado Livre, Amazon, Shopee, Magalu, TikTok Shop ou Shein.'], []],
      [6, ['Pedido MGL-4: outra linha deste pedido tem erro (linha 7); o pedido inteiro fica de fora'], []],
      [7, ['Pedido MGL-4: Informe o SKU'], []],
      [8, ['Pedido AMZ-2: aparece com outro rastreio ou reclamação na linha 4'], []],
    ]);
    expect(p.validas).toBe(3);
  });

  it('quantidade e data seguem as regras da planilha: 1.000 é mil (recusado), 12.0 é 12, data ISO vale', async () => {
    const p = await previa([
      ['Shopee', 'SHP-1', '', 'BR1', '', 'FONE-01', '1.000', '', ''],
      ['Shopee', 'SHP-2', '', 'BR2', '', 'FONE-01', '12.0', '', '2026-11-05'],
      ['Shopee', 'SHP-3', '', 'BR3', '', 'FONE-01', '1', '', '31/02/2026'],
    ]);
    expect(p.linhas.map((l) => l.erros)).toEqual([
      ['Pedido SHP-1: Quantidade inválida: use um número de 1 a 50'],
      [],
      ['Pedido SHP-3: Data de postagem inválida: 31/02/2026'],
    ]);
  });

  it('confirma: uma devolução por pedido, uma linha por unidade, com origem Planilha', async () => {
    const def = definicao();
    const imp = await enviar([
      ['Shopee', 'SHP-1', 'R-1', 'br 1', 'Correios', 'FONE-01', '1', 'Defeito', '05/11/2026'],
      ['Shopee', 'SHP-1', 'R-1', 'BR1', 'Correios', 'CABO-02', '2', 'Defeito', '05/11/2026'],
      ['Amazon', 'AMZ-2', '', 'BR2', '', 'FONE-01', '1', '', ''],
    ]);
    const resumo = await confirmarImportacao(db, def, imp, await mapeamentoEfetivo(db, def, imp), operador);
    expect(resumo).toEqual({ criados: 2, atualizados: 0, ignorados: 0, linhasComErro: [] });
    const shopee = await obterDetalhe(db, 'DEV-000001');
    expect(shopee).toMatchObject({
      canal: 'SHOPEE',
      origem: 'PLANILHA',
      pedidos: ['SHP-1'],
      reclamacaoId: 'R-1',
      rastreio: 'BR1',
      motivoCliente: 'Defeito',
      postadaEm: '2026-11-05',
      status: 'PENDENTE_CHEGADA',
    });
    expect(shopee?.itens.map((i) => i.sku)).toEqual(['FONE-01', 'CABO-02', 'CABO-02']);
  });

  it('um pedido com erro fica de fora inteiro e os outros entram', async () => {
    const def = definicao();
    const imp = await enviar([
      ['Shopee', 'SHP-1', '', 'BR1', '', 'FONE-01', '1', '', ''],
      ['Shopee', 'SHP-1', '', 'BR1', '', 'CABO-02', 'abc', '', ''],
      ['Amazon', 'AMZ-2', '', 'BR2', '', 'FONE-01', '1', '', ''],
    ]);
    const resumo = await confirmarImportacao(db, def, imp, await mapeamentoEfetivo(db, def, imp), operador);
    expect(resumo).toEqual({ criados: 1, atualizados: 0, ignorados: 2, linhasComErro: [2, 3] });
    expect((await obterDetalhe(db, 'DEV-000001'))?.pedidos).toEqual(['AMZ-2']);
    expect(await obterDetalhe(db, 'DEV-000002')).toBeNull();
  });

  it('confirmar duas vezes não importa duas vezes', async () => {
    const def = definicao();
    const imp = await enviar([['Shopee', 'SHP-1', '', 'BR1', '', 'FONE-01', '1', '', '']]);
    const mapa = await mapeamentoEfetivo(db, def, imp);
    const resultados = await Promise.allSettled([
      confirmarImportacao(db, def, imp, mapa, operador),
      confirmarImportacao(db, def, imp, mapa, operador),
    ]);
    expect(resultados.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejeitada = resultados.find((r) => r.status === 'rejected');
    expect(rejeitada && 'reason' in rejeitada && rejeitada.reason).toBeInstanceOf(ErroImportacao);
    expect(await obterDetalhe(db, 'DEV-000001')).not.toBeNull();
    expect(await obterDetalhe(db, 'DEV-000002')).toBeNull();
  });

  it('a mesma planilha de novo não duplica: o pedido já tem devolução', async () => {
    const def = definicao();
    const linhas = [['Shopee', 'SHP-1', '', 'BR1', '', 'FONE-01', '1', '', '']];
    const primeira = await enviar(linhas);
    await confirmarImportacao(db, def, primeira, await mapeamentoEfetivo(db, def, primeira), operador);
    const p = await previa(linhas);
    expect(p.linhas[0].erros).toEqual(['Pedido SHP-1: já existe a devolução DEV-000001 para este pedido neste canal']);
  });

  it('se o pedido ganhar devolução entre a prévia e a confirmação, ele vai para as ignoradas com o motivo', async () => {
    const def = definicao();
    const linhas = [
      ['Shopee', 'SHP-1', '', 'BR1', '', 'FONE-01', '1', '', ''],
      ['Shopee', 'SHP-1', '', 'BR1', '', 'CABO-02', '1', '', ''],
      ['Amazon', 'AMZ-2', '', 'BR2', '', 'FONE-01', '1', '', ''],
    ];
    const imp = await enviar(linhas);
    const mapa = await mapeamentoEfetivo(db, def, imp);
    await calcularPrevia(db, def, imp, mapa);
    // A confirmação recalcula a prévia; só a corrida dentro da gravação chega a `puladas`. Simulada: o duplicado nasce
    // no banco no instante em que a gravação começa (depois da prévia da confirmação).
    const comCorrida: DefinicaoImportacao = {
      ...def,
      aplicar: async (tx, validas, usuario) => {
        const outra = await enviar([linhas[0]]);
        await confirmarImportacao(db, def, outra, await mapeamentoEfetivo(db, def, outra), operador);
        return def.aplicar(tx, validas, usuario);
      },
    };
    const resumo = await confirmarImportacao(db, comCorrida, imp, mapa, operador);
    expect(resumo).toMatchObject({ criados: 1, ignorados: 2, linhasComErro: [2, 3] });
    expect(resumo.puladas?.map((x) => x.linha)).toEqual([2, 3]);
    expect(resumo.puladas?.[0].erro).toMatch(/Pedido SHP-1: .*á existe a devolução DEV-000001/);
  });

  it('campos do pacote: vale o primeiro valor preenchido e um valor diferente vira aviso', async () => {
    const p = await previa([
      ['Shopee', 'SHP-1', '', 'BR1', '', 'FONE-01', '1', '', ''],
      ['Shopee', 'SHP-1', '', 'BR1', 'Correios', 'CABO-02', '1', 'Defeito', ''],
      ['Shopee', 'SHP-1', '', 'BR1', 'Jadlog', 'CABO-03', '1', 'Defeito', ''],
    ]);
    expect(p.linhas.map((l) => l.avisos.filter((a) => !a.includes('fora do cadastro')))).toEqual([
      [],
      [],
      ['Pedido SHP-1: transportadora diferente da linha 3; ficou a da linha 3'],
    ]);
  });

  it('a quantidade soma por SKU dentro do pedido: acima de 50 é erro e o pedido fica de fora', async () => {
    const def = definicao();
    const imp = await enviar([
      ['Shopee', 'SHP-1', '', 'BR1', '', 'FONE-01', '30', '', ''],
      ['Shopee', 'SHP-1', '', 'BR1', '', 'FONE-01', '30', '', ''],
      ['Shopee', 'SHP-1', '', 'BR1', '', 'CABO-02', '1', '', ''],
    ]);
    const p = await calcularPrevia(db, def, imp, await mapeamentoEfetivo(db, def, imp));
    expect(p.linhas.map((l) => l.erros)).toEqual([
      ['Pedido SHP-1: o SKU FONE-01 soma 60 unidades no pedido (máximo 50)'],
      ['Pedido SHP-1: o SKU FONE-01 soma 60 unidades no pedido (máximo 50)'],
      ['Pedido SHP-1: outra linha deste pedido tem erro (linha 2); o pedido inteiro fica de fora'],
    ]);
  });

  it('o Fiscal não importa devoluções e nada fica gravado', async () => {
    const def = definicao();
    const fiscal = await criarUsuarioTeste(db, 'FISCAL');
    const imp = await enviar([['Shopee', 'SHP-1', '', 'BR1', '', 'FONE-01', '1', '', '']]);
    await expect(confirmarImportacao(db, def, imp, await mapeamentoEfetivo(db, def, imp), fiscal)).rejects.toBeInstanceOf(ErroTransicao);
    expect((await obterImportacao(db, imp.id, 'devolucoes'))?.situacao).toBe('PENDENTE');
    expect(await obterDetalhe(db, 'DEV-000001')).toBeNull();
  });
});
