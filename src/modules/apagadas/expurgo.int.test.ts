import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { count, eq, inArray } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  contestacoesCanal,
  devolucoes,
  eventosHistorico,
  evidencias,
  itensDevolucao,
  itensRetiradaFull,
  notasFiscais,
  notasVenda,
  reclamacoesMl,
  retiradasFull,
} from '@/db/schema';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import { registrarEvento } from '@/modules/historico/eventos';
import { aplicarReclamacao } from '@/modules/mercado-livre/sincronizar';
import { definirArmazenamentoParaTestes } from '@/modules/midia/armazenamento';
import { ArmazenamentoMemoria } from '@/modules/midia/armazenamento-memoria';
import { manipuladoresApagadas } from '@/worker/manipuladores/apagadas';
import { criarDbTeste, limparTabelas } from '../../../tests/helpers/db';
import { criarDevolucaoNoEstoqueTeste, inserirNotaVendaTeste } from '../../../tests/helpers/fabricas-fiscal';
import { dadosDevolucaoMLTeste, devolucaoExternaTeste, fotoTeste } from '../../../tests/helpers/fabricas-ml';
import { criarRetiradaTeste } from '../../../tests/helpers/fabricas-retiradas';
import { criarUsuarioTeste } from '../../../tests/helpers/fabricas';
import { listarApagadas } from './consultas';
import { expurgarApagadas } from './expurgo';

const { db, sql } = criarDbTeste();
const AGORA = new Date('2026-11-27T15:00:00Z');
const DEPOIS = new Date('2026-11-28T15:00:00Z');
const DIA = 24 * 60 * 60 * 1000;
const atras = (dias: number) => new Date(AGORA.getTime() - dias * DIA);

/** O armazenamento de memória que falha ao apagar os caminhos marcados (o S3 fora do ar, por exemplo). */
class ArmazenamentoQueFalha extends ArmazenamentoMemoria {
  readonly falhar = new Set<string>();
  override async apagar(chave: string): Promise<void> {
    if (this.falhar.has(chave)) throw new Error('armazenamento fora do ar');
    return super.apagar(chave);
  }
}

let armazenamento: ArmazenamentoQueFalha;
let operador: UsuarioSessao;
let gestor: UsuarioSessao;

beforeEach(async () => {
  await limparTabelas(sql);
  armazenamento = new ArmazenamentoQueFalha();
  definirArmazenamentoParaTestes(armazenamento);
  operador = await criarUsuarioTeste(db, 'OPERADOR');
  gestor = await criarUsuarioTeste(db, 'GESTOR');
});
afterAll(() => sql.end());

async function apagarHa(id: string, dias: number) {
  await db.update(devolucoes).set({ apagadaEm: atras(dias), apagadaPor: gestor.id }).where(eq(devolucoes.id, id));
}
async function devolucaoManualComFoto() {
  const dev = await criarDevolucaoNoEstoqueTeste(db, operador, { unidades: [{ destino: 'BOM' }, { destino: 'PROBLEMA', motivo: 'USADO' }] });
  const foto = await fotoTeste(db, { devolucaoId: dev.id, tipo: 'FOTO_3_PRODUTO', itemId: dev.itens[0].id });
  await registrarEvento(db, { entidade: 'devolucao', entidadeId: dev.id, acao: 'devolucao_apagada', usuarioId: gestor.id });
  await registrarEvento(db, { entidade: 'item', entidadeId: dev.itens[0].id, acao: 'item_status', usuarioId: null });
  return { ...dev, foto };
}
async function caminhoDa(evidenciaId: string): Promise<string> {
  const [e] = await db.select({ caminho: evidencias.caminho }).from(evidencias).where(eq(evidencias.id, evidenciaId));
  return e.caminho!;
}
async function eventosDe(ids: string[]): Promise<number> {
  const [{ total }] = await db.select({ total: count() }).from(eventosHistorico).where(inArray(eventosHistorico.entidadeId, ids));
  return total;
}
async function retiradaApagadaComFoto(dias: number) {
  const r = await criarRetiradaTeste(db, operador, { itens: [{ eanLido: '7890000000001', descricao: 'Fone', quantidade: 2 }], concluidaEm: atras(100) });
  const caminho = `retiradas/${r.id}/${randomUUID()}.jpg`;
  await armazenamento.salvar(caminho, Readable.from([Buffer.from('foto da etiqueta')]));
  await db.insert(evidencias).values({
    retiradaId: r.id,
    tipo: 'FOTO_1_ETIQUETA',
    tipoConteudo: 'image/jpeg',
    caminho,
    provedor: 'disco',
    tamanhoOriginal: 10,
    sha256Original: 'b'.repeat(64),
    situacaoProcessamento: 'PRONTA',
    idCliente: randomUUID(),
  });
  await registrarEvento(db, { entidade: 'retirada_full', entidadeId: r.id, acao: 'retirada_apagada', usuarioId: gestor.id });
  await db.update(retiradasFull).set({ apagadaEm: atras(dias), apagadaPor: gestor.id }).where(eq(retiradasFull.id, r.id));
  return { ...r, caminho };
}

describe('expurgarApagadas: a tarefa diária dos 90 dias (E29, spec §9)', () => {
  it('com 89 dias nada muda; com 91, a devolução que não é do ML sai de vez: linha, itens, evidências com os arquivos e o histórico', async () => {
    const dev = await devolucaoManualComFoto();
    const caminho = await caminhoDa(dev.foto.id);
    await inserirNotaVendaTeste(db, dev.id, { itens: [{ codigo: 'SKU-TESTE' }] });
    await apagarHa(dev.id, 89);

    expect(await expurgarApagadas(db, AGORA)).toEqual({ devolucoes: 0, retiradas: 0 });
    expect(await db.select().from(devolucoes).where(eq(devolucoes.id, dev.id))).toHaveLength(1);
    expect(armazenamento.arquivos.has(caminho)).toBe(true);

    await apagarHa(dev.id, 91);
    expect(await expurgarApagadas(db, AGORA)).toEqual({ devolucoes: 1, retiradas: 0 });
    expect(await db.select().from(devolucoes).where(eq(devolucoes.id, dev.id))).toEqual([]);
    expect(await db.select().from(itensDevolucao).where(eq(itensDevolucao.devolucaoId, dev.id))).toEqual([]);
    expect(await db.select().from(evidencias).where(eq(evidencias.devolucaoId, dev.id))).toEqual([]);
    expect(await db.select().from(notasVenda).where(eq(notasVenda.devolucaoId, dev.id))).toEqual([]);
    expect(armazenamento.arquivos.has(caminho)).toBe(false);
    expect(await eventosDe([dev.id, ...dev.itens.map((i) => i.id)])).toBe(0);
  });

  it('a retirada: com 89 dias fica; com 91 sai de vez, com os itens, as fotos e o histórico', async () => {
    const fica = await retiradaApagadaComFoto(89);
    const sai = await retiradaApagadaComFoto(91);
    expect(await expurgarApagadas(db, AGORA)).toEqual({ devolucoes: 0, retiradas: 1 });
    expect(await db.select().from(retiradasFull).where(eq(retiradasFull.id, sai.id))).toEqual([]);
    expect(await db.select().from(itensRetiradaFull).where(eq(itensRetiradaFull.retiradaId, sai.id))).toEqual([]);
    expect(await db.select().from(evidencias).where(eq(evidencias.retiradaId, sai.id))).toEqual([]);
    expect(armazenamento.arquivos.has(sai.caminho)).toBe(false);
    expect(await eventosDe([sai.id])).toBe(0);
    expect(await db.select().from(retiradasFull).where(eq(retiradasFull.id, fica.id))).toHaveLength(1);
    expect(armazenamento.arquivos.has(fica.caminho)).toBe(true);
  });

  it('a do ML fica só com a linha mínima, escondida e expurgada; sai da lista, e a sincronização não cria outra', async () => {
    const externa = devolucaoExternaTeste();
    const r = await aplicarReclamacao(db, dadosDevolucaoMLTeste(externa), atras(120));
    if (!('devolucaoId' in r)) throw new Error('esperava a devolução do ML');
    const id = r.devolucaoId;
    const [item] = await db.select({ id: itensDevolucao.id }).from(itensDevolucao).where(eq(itensDevolucao.devolucaoId, id));
    const foto = await fotoTeste(db, { devolucaoId: id, tipo: 'FOTO_1_ETIQUETA' });
    const caminho = await caminhoDa(foto.id);
    await db.insert(contestacoesCanal).values({ devolucaoId: id, motivoCanal: 'SRF2', mensagem: 'produto avariado' });
    await db.update(devolucoes).set({ observacoes: 'cliente ligou' }).where(eq(devolucoes.id, id));
    await apagarHa(id, 91);

    expect(await expurgarApagadas(db, AGORA)).toEqual({ devolucoes: 1, retiradas: 0 });
    const [linha] = await db.select().from(devolucoes).where(eq(devolucoes.id, id));
    expect(linha).toMatchObject({ apagadaEm: atras(91), expurgadaEm: AGORA, devolucaoExternaId: externa.devolucaoExternaId, observacoes: null });
    expect(await db.select().from(itensDevolucao).where(eq(itensDevolucao.devolucaoId, id))).toEqual([]);
    expect(await db.select().from(evidencias).where(eq(evidencias.devolucaoId, id))).toEqual([]);
    expect(await db.select().from(contestacoesCanal).where(eq(contestacoesCanal.devolucaoId, id))).toEqual([]);
    expect(armazenamento.arquivos.has(caminho)).toBe(false);
    expect(await eventosDe([id, item.id])).toBe(0);
    const [reclamacao] = await db.select({ devolucaoId: reclamacoesMl.devolucaoId }).from(reclamacoesMl).where(eq(reclamacoesMl.claimId, externa.reclamacaoId!));
    expect(reclamacao.devolucaoId).toBe(id);
    expect(await listarApagadas(db, AGORA)).toEqual([]);
    // Uma 2ª rodada não mexe de novo.
    expect(await expurgarApagadas(db, DEPOIS)).toEqual({ devolucoes: 0, retiradas: 0 });

    // A reclamação chega de novo: acha a mesma linha, não cria outra nem traz os itens de volta.
    const de_novo = await aplicarReclamacao(db, dadosDevolucaoMLTeste({ ...externa, statusCanal: 'delivered/delivered' }), DEPOIS);
    expect(de_novo).toMatchObject({ acao: 'atualizada', devolucaoId: id });
    expect(await db.select({ total: count() }).from(devolucoes)).toEqual([{ total: 1 }]);
    expect(await db.select().from(itensDevolucao).where(eq(itensDevolucao.devolucaoId, id))).toEqual([]);
    const [depois] = await db.select().from(devolucoes).where(eq(devolucoes.id, id));
    expect(depois).toMatchObject({ apagadaEm: atras(91), expurgadaEm: AGORA });
  });

  it('a devolução com NF de devolução (mesmo cancelada) também fica só com a linha mínima: o registro fiscal não sai', async () => {
    const dev = await devolucaoManualComFoto();
    await db.insert(notasFiscais).values({
      tipo: 'DEVOLUCAO_VENDA',
      devolucaoId: dev.id,
      ambiente: 'HOMOLOGACAO',
      situacao: 'CANCELADA',
      referenciaEmissor: randomUUID().replaceAll('-', ''),
    });
    await apagarHa(dev.id, 91);
    expect(await expurgarApagadas(db, AGORA)).toEqual({ devolucoes: 1, retiradas: 0 });
    expect(await db.select({ expurgadaEm: devolucoes.expurgadaEm }).from(devolucoes).where(eq(devolucoes.id, dev.id))).toEqual([{ expurgadaEm: AGORA }]);
    expect(await db.select().from(itensDevolucao).where(eq(itensDevolucao.devolucaoId, dev.id))).toEqual([]);
    expect(await db.select().from(notasFiscais).where(eq(notasFiscais.devolucaoId, dev.id))).toHaveLength(1);
  });

  it('a falha ao apagar um arquivo não para as outras: a que falhou fica para a próxima rodada, e a tarefa avisa no fim', async () => {
    const falha = await devolucaoManualComFoto();
    const boa = await devolucaoManualComFoto();
    const retirada = await retiradaApagadaComFoto(91);
    const caminhoFalha = await caminhoDa(falha.foto.id);
    const caminhoBoa = await caminhoDa(boa.foto.id);
    armazenamento.falhar.add(caminhoFalha);
    await apagarHa(falha.id, 92);
    await apagarHa(boa.id, 91);

    await expect(expurgarApagadas(db, AGORA)).rejects.toThrow('Apagadas: 1 item(ns) não puderam ser apagados de vez.');
    expect(await db.select().from(devolucoes).where(eq(devolucoes.id, boa.id))).toEqual([]);
    expect(armazenamento.arquivos.has(caminhoBoa)).toBe(false);
    expect(await db.select().from(retiradasFull).where(eq(retiradasFull.id, retirada.id))).toEqual([]);
    // A que falhou fica inteira (a transação dela voltou) e continua na lista.
    expect(await db.select({ id: evidencias.id }).from(evidencias).where(eq(evidencias.devolucaoId, falha.id))).toEqual([{ id: falha.foto.id }]);
    expect((await listarApagadas(db, AGORA)).map((i) => i.id)).toEqual([falha.id]);

    armazenamento.falhar.clear();
    expect(await expurgarApagadas(db, DEPOIS)).toEqual({ devolucoes: 1, retiradas: 0 });
    expect(await db.select().from(devolucoes).where(eq(devolucoes.id, falha.id))).toEqual([]);
  });

  it('o manipulador apagadas.expurgo roda a tarefa com o relógio do worker', async () => {
    const dev = await devolucaoManualComFoto();
    await apagarHa(dev.id, 91);
    await manipuladoresApagadas['apagadas.expurgo']!({}, { db, agora: AGORA } as never);
    expect(await db.select().from(devolucoes).where(eq(devolucoes.id, dev.id))).toEqual([]);
  });
});
