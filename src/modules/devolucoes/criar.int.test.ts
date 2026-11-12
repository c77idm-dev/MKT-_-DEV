import { asc, eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { devolucoes, itensDevolucao } from '@/db/schema';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import { listarEventos } from '@/modules/historico/eventos';
import { criarDbTeste, limparTabelas } from '../../../tests/helpers/db';
import { criarProdutoTeste, criarUsuarioTeste } from '../../../tests/helpers/fabricas';
import { criarDevolucao, type DadosNovaDevolucao } from './criar';
import { ErroDevolucaoDuplicada } from './erros';
import { ErroTransicao } from './transicoes';

const { db, sql } = criarDbTeste();
let operador: UsuarioSessao;

const DADOS: DadosNovaDevolucao = {
  canal: 'SHOPEE',
  pedido: 'SHP-1001',
  reclamacaoId: null,
  rastreio: 'BR123456789BR',
  transportadora: 'Correios',
  motivoCliente: null,
  postadaEm: null,
  itens: [
    { sku: 'FONE-01', quantidade: 2 },
    { sku: 'CABO-02', quantidade: 1 },
  ],
};

beforeEach(async () => {
  await limparTabelas(sql);
  operador = await criarUsuarioTeste(db, 'OPERADOR');
});
afterAll(async () => {
  await sql.end();
});

/** O postgres.js põe o nome da restrição no erro; o Drizzle pode embrulhá-lo em `cause`. */
function nomeDaRestricao(erro: unknown): string | undefined {
  const e = erro as { constraint_name?: string; cause?: { constraint_name?: string } };
  return e.constraint_name ?? e.cause?.constraint_name;
}

describe('criarDevolucao', () => {
  it('cria com código DEV, uma linha por unidade física e o evento no histórico', async () => {
    const produtoId = await criarProdutoTeste(db, { sku: 'FONE-01', descricao: 'Fone' });
    const criada = await criarDevolucao(db, DADOS, { origem: 'MANUAL', usuario: operador });
    expect(criada).toEqual({ id: expect.any(String), codigo: 'DEV-000001', unidades: 3 });

    const [d] = await db.select().from(devolucoes).where(eq(devolucoes.id, criada.id));
    expect(d).toMatchObject({
      status: 'PENDENTE_CHEGADA',
      canal: 'SHOPEE',
      origem: 'MANUAL',
      pedidosExternos: ['SHP-1001'],
      rastreio: 'BR123456789BR',
      naoIdentificada: false,
      criadoPor: operador.id,
    });

    const itens = await db.select().from(itensDevolucao).where(eq(itensDevolucao.devolucaoId, criada.id)).orderBy(asc(itensDevolucao.unidade));
    expect(itens.map((i) => [i.unidade, i.sku, i.produtoEsperadoId, i.status])).toEqual([
      [1, 'FONE-01', produtoId, 'PENDENTE'],
      [2, 'FONE-01', produtoId, 'PENDENTE'],
      [3, 'CABO-02', null, 'PENDENTE'],
    ]);

    expect(await listarEventos(db, 'devolucao', criada.id)).toEqual([
      expect.objectContaining({ acao: 'criada', de: null, para: 'PENDENTE_CHEGADA', usuarioNome: operador.nome, dados: { origem: 'MANUAL', unidades: 3 } }),
    ]);
  });

  it('numera em sequência', async () => {
    const a = await criarDevolucao(db, DADOS, { origem: 'MANUAL', usuario: operador });
    const b = await criarDevolucao(db, { ...DADOS, pedido: 'SHP-1002' }, { origem: 'PLANILHA', usuario: operador });
    expect([a.codigo, b.codigo]).toEqual(['DEV-000001', 'DEV-000002']);
  });

  it('recusa outra devolução em andamento para o mesmo pedido no mesmo canal', async () => {
    await criarDevolucao(db, DADOS, { origem: 'MANUAL', usuario: operador });
    await expect(criarDevolucao(db, DADOS, { origem: 'MANUAL', usuario: operador })).rejects.toThrow(new ErroDevolucaoDuplicada('DEV-000001'));

    // o mesmo número de pedido em outro canal é outro pedido
    await expect(criarDevolucao(db, { ...DADOS, canal: 'AMAZON' }, { origem: 'MANUAL', usuario: operador })).resolves.toMatchObject({
      codigo: 'DEV-000002',
    });

    // depois de cancelada, o pedido pode ter uma devolução nova
    await db.update(devolucoes).set({ status: 'CANCELADA' }).where(eq(devolucoes.codigo, 'DEV-000001'));
    await expect(criarDevolucao(db, DADOS, { origem: 'MANUAL', usuario: operador })).resolves.toMatchObject({ codigo: 'DEV-000003' });
  });

  it('o Fiscal não cadastra devolução', async () => {
    const fiscal = await criarUsuarioTeste(db, 'FISCAL');
    await expect(criarDevolucao(db, DADOS, { origem: 'MANUAL', usuario: fiscal })).rejects.toBeInstanceOf(ErroTransicao);
  });

  it('o banco exige o canal (restrição devolucoes_canal_obrigatorio), a não ser no pacote não identificado', async () => {
    const semCanal = await db
      .insert(devolucoes)
      .values({ origem: 'MANUAL', status: 'PENDENTE_CHEGADA' })
      .then(
        () => null,
        (erro: unknown) => erro,
      );
    expect(semCanal).not.toBeNull();
    expect(nomeDaRestricao(semCanal)).toBe('devolucoes_canal_obrigatorio');

    await expect(
      db.insert(devolucoes).values({ origem: 'MANUAL', status: 'AGUARDANDO_CONFERENCIA', naoIdentificada: true }),
    ).resolves.toBeDefined();
  });
});
