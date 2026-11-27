import { randomUUID } from 'node:crypto';
import { and, asc, eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { contestacoesCanal, devolucoes, evidencias, itensDevolucao, lotes, notasFiscais } from '@/db/schema';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import { concluirConferencia } from '@/modules/conferencia/concluir';
import { salvarItem } from '@/modules/conferencia/itens';
import type { EntradaItem } from '@/modules/conferencia/regras';
import { iniciarConferencia } from '@/modules/conferencia/trava';
import { definirFilaParaTestes, FilaMemoria } from '@/modules/fila/fila';
import { listarEventos } from '@/modules/historico/eventos';
import { listarContestacoes } from '@/modules/mercado-livre/contestacoes';
import { processarResultadoConferencia } from '@/modules/mercado-livre/resultado';
import { obterArmazenamento } from '@/modules/midia/armazenamento';
import type { ArmazenamentoMemoria } from '@/modules/midia/armazenamento-memoria';
import { criarDbTeste, limparTabelas } from '../../../tests/helpers/db';
import { criarDevolucaoChegada, criarDevolucaoEmConferencia, criarEvidenciasCompletas } from '../../../tests/helpers/fabricas-conferencia';
import { criarDevolucaoNoEstoqueTeste } from '../../../tests/helpers/fabricas-fiscal';
import {
  criarDevolucaoComProblemasTeste,
  criarFornecedorCompletoTeste,
  criarLoteTeste,
  criarProdutoDoFornecedorTeste,
} from '../../../tests/helpers/fabricas-lotes';
import { devolucaoMLConferidaTeste, fotoTeste } from '../../../tests/helpers/fabricas-ml';
import { criarDevolucaoTeste, criarProdutoTeste, criarUsuarioTeste } from '../../../tests/helpers/fabricas';
import {
  apagarDevolucao,
  corrigirDados,
  desfazerChegada,
  reabrirConferencia,
  restaurarDevolucao,
  trocarDestinoItem,
} from './correcoes';
import { encerrarPendente } from './excecoes';
import { criarNaoIdentificada, receberPorRastreio } from './recebimento';

const { db, sql } = criarDbTeste();
const AGORA = new Date('2026-11-27T15:00:00Z');
let operador: UsuarioSessao;
let fiscal: UsuarioSessao;
let gestor: UsuarioSessao;
let fila: FilaMemoria;

beforeEach(async () => {
  await limparTabelas(sql);
  operador = await criarUsuarioTeste(db, 'OPERADOR');
  fiscal = await criarUsuarioTeste(db, 'FISCAL');
  gestor = await criarUsuarioTeste(db, 'GESTOR');
  fila = new FilaMemoria();
  definirFilaParaTestes(fila);
});
afterAll(() => sql.end());

async function linhaDevolucao(id: string) {
  const [d] = await db.select().from(devolucoes).where(eq(devolucoes.id, id));
  return d;
}
async function linhaItem(id: string) {
  const [i] = await db.select().from(itensDevolucao).where(eq(itensDevolucao.id, id));
  return i;
}
async function itensDe(devolucaoId: string) {
  return db.select().from(itensDevolucao).where(eq(itensDevolucao.devolucaoId, devolucaoId)).orderBy(asc(itensDevolucao.unidade));
}
async function ultimoEvento(id: string, acao: string) {
  const eventos = (await listarEventos(db, 'devolucao', id)).filter((e) => e.acao === acao);
  return eventos[eventos.length - 1];
}
async function contestacaoDe(devolucaoId: string) {
  const [c] = await db.select().from(contestacoesCanal).where(eq(contestacoesCanal.devolucaoId, devolucaoId));
  return c ?? null;
}
async function notaDeDevolucao(devolucaoId: string, situacao: 'PROCESSANDO' | 'AUTORIZADA') {
  await db.insert(notasFiscais).values({
    tipo: 'DEVOLUCAO_VENDA',
    devolucaoId,
    ambiente: 'HOMOLOGACAO',
    situacao,
    referenciaEmissor: randomUUID().replaceAll('-', ''),
    ...(situacao === 'AUTORIZADA' ? { autorizadaEm: AGORA } : {}),
  });
}
/** Devolução que já passou pela NF autorizada: CONCLUIDA, BOM em DISPONIVEL_VENDA, PROBLEMA como o teste deixar. */
async function depoisDaNf(unidades: Parameters<typeof criarDevolucaoComProblemasTeste>[2]['unidades']) {
  const dev = await criarDevolucaoComProblemasTeste(db, operador, { unidades });
  for (const [i, item] of dev.itens.entries()) {
    if (unidades[i].destino === 'BOM') await db.update(itensDevolucao).set({ status: 'DISPONIVEL_VENDA' }).where(eq(itensDevolucao.id, item.id));
  }
  await db.update(devolucoes).set({ status: 'CONCLUIDA', concluidaEm: AGORA }).where(eq(devolucoes.id, dev.id));
  await notaDeDevolucao(dev.id, 'AUTORIZADA');
  return dev;
}
const BOM: EntradaItem = { serial: 'SN-1', loteFabricacao: '', validade: '', decisao: 'BOM', motivo: null, observacao: 'caixa ok' };

describe('1. trocarDestinoItem (Bom ↔ Problema)', () => {
  it('antes da NF: Problema exige motivo (não ausente) e volta para Bom limpando o motivo; o histórico guarda antes e depois', async () => {
    const dev = await criarDevolucaoNoEstoqueTeste(db, operador, { unidades: [{ destino: 'BOM' }, { destino: 'PROBLEMA', motivo: 'USADO' }] });
    const [bom, problema] = dev.itens;
    await expect(trocarDestinoItem(db, bom.id, 'PROBLEMA', null, gestor, AGORA)).rejects.toThrow('Escolha o motivo do Estoque Problema.');
    await expect(trocarDestinoItem(db, bom.id, 'PROBLEMA', 'AUSENTE', gestor, AGORA)).rejects.toThrow('Escolha o motivo do Estoque Problema.');
    await expect(trocarDestinoItem(db, bom.id, 'PROBLEMA', 'AVARIADO', gestor, AGORA)).resolves.toEqual({ aviso: null });
    expect(await linhaItem(bom.id)).toMatchObject({ destino: 'PROBLEMA', motivo: 'AVARIADO', status: 'AGUARDANDO_NF', loteId: null });
    await trocarDestinoItem(db, problema.id, 'BOM', null, gestor, AGORA);
    expect(await linhaItem(problema.id)).toMatchObject({ destino: 'BOM', motivo: null, status: 'AGUARDANDO_NF' });
    const evento = await ultimoEvento(dev.id, 'destino_trocado');
    expect(evento).toMatchObject({
      usuarioNome: gestor.nome,
      dados: {
        itemId: problema.id,
        unidade: 2,
        antes: { destino: 'PROBLEMA', motivo: 'USADO', status: 'AGUARDANDO_NF' },
        depois: { destino: 'BOM', motivo: null, status: 'AGUARDANDO_NF' },
      },
    });
    // O motivo também muda pela troca (Problema → Problema).
    await trocarDestinoItem(db, bom.id, 'PROBLEMA', 'COM_DEFEITO', gestor, AGORA);
    expect(await linhaItem(bom.id)).toMatchObject({ destino: 'PROBLEMA', motivo: 'COM_DEFEITO' });
    await expect(trocarDestinoItem(db, problema.id, 'BOM', null, gestor, AGORA)).rejects.toThrow('A unidade 2 já está no Estoque Bom.');
  });

  it('a unidade ausente e a devolução que não terminou a conferência são recusadas', async () => {
    const dev = await criarDevolucaoNoEstoqueTeste(db, operador, { unidades: [{ destino: 'AUSENTE' }, { destino: 'BOM' }] });
    await expect(trocarDestinoItem(db, dev.itens[0].id, 'BOM', null, gestor, AGORA)).rejects.toThrow(
      'A unidade 1 está ausente. Para mudar, reabra a conferência.',
    );
    const conferindo = await criarDevolucaoEmConferencia(db, operador);
    await expect(trocarDestinoItem(db, conferindo.itens[0], 'BOM', null, gestor, AGORA)).rejects.toThrow(
      'A conferência desta devolução ainda não terminou: o estoque da unidade se escolhe na conferência.',
    );
  });

  it('depois da NF: Bom (disponível para venda) → Problema entra no lote Aberto do fornecedor do produto recebido, criando o lote', async () => {
    const fornecedor = await criarFornecedorCompletoTeste(db);
    const produto = await criarProdutoDoFornecedorTeste(db, { cnpjFornecedor: fornecedor.cnpj });
    const dev = await depoisDaNf([{ destino: 'BOM', produtoId: produto.id }, { destino: 'BOM', produtoId: produto.id }]);
    await trocarDestinoItem(db, dev.itens[0].id, 'PROBLEMA', 'AVARIADO', gestor, AGORA);
    const [aberto] = await db.select().from(lotes).where(and(eq(lotes.fornecedorId, fornecedor.id), eq(lotes.status, 'ABERTO')));
    expect(aberto).toBeDefined();
    expect(await linhaItem(dev.itens[0].id)).toMatchObject({ status: 'EM_LOTE', loteId: aberto.id, destino: 'PROBLEMA', motivo: 'AVARIADO' });
    expect((await listarEventos(db, 'lote', aberto.id)).map((e) => e.acao)).toEqual(['lote_criado', 'lote_item_incluido']);
    // O segundo entra no mesmo lote Aberto.
    await trocarDestinoItem(db, dev.itens[1].id, 'PROBLEMA', 'USADO', gestor, AGORA);
    expect(await linhaItem(dev.itens[1].id)).toMatchObject({ status: 'EM_LOTE', loteId: aberto.id });
    expect((await ultimoEvento(dev.id, 'destino_trocado'))?.dados).toMatchObject({
      antes: { destino: 'BOM', status: 'DISPONIVEL_VENDA', loteCodigo: null },
      depois: { destino: 'PROBLEMA', motivo: 'USADO', status: 'EM_LOTE', loteCodigo: aberto.codigo },
    });
  });

  it('depois da NF: sem fornecedor no cadastro, a unidade vai para Sem fornecedor (a mesma regra da autorização)', async () => {
    const produto = await criarProdutoDoFornecedorTeste(db, { cnpjFornecedor: null });
    const dev = await depoisDaNf([{ destino: 'BOM', produtoId: produto.id }]);
    await trocarDestinoItem(db, dev.itens[0].id, 'PROBLEMA', 'AVARIADO', gestor, AGORA);
    expect(await linhaItem(dev.itens[0].id)).toMatchObject({ status: 'SEM_FORNECEDOR', loteId: null, destino: 'PROBLEMA' });
    // E volta para Bom.
    await trocarDestinoItem(db, dev.itens[0].id, 'BOM', null, gestor, AGORA);
    expect(await linhaItem(dev.itens[0].id)).toMatchObject({ status: 'DISPONIVEL_VENDA', destino: 'BOM', motivo: null });
  });

  it('Problema (no lote Aberto) → Bom: sai do lote e vai para disponível para venda', async () => {
    const fornecedor = await criarFornecedorCompletoTeste(db);
    const produto = await criarProdutoDoFornecedorTeste(db, { cnpjFornecedor: fornecedor.cnpj });
    const dev = await depoisDaNf([{ destino: 'PROBLEMA', produtoId: produto.id }]);
    const lote = await criarLoteTeste(db, { fornecedorId: fornecedor.id, itemIds: [dev.itens[0].id] });
    await trocarDestinoItem(db, dev.itens[0].id, 'BOM', null, gestor, AGORA);
    expect(await linhaItem(dev.itens[0].id)).toMatchObject({ status: 'DISPONIVEL_VENDA', loteId: null, destino: 'BOM', motivo: null });
    const doLote = await listarEventos(db, 'lote', lote.id);
    expect(doLote[doLote.length - 1]).toMatchObject({ acao: 'lote_item_removido', usuarioNome: gestor.nome, dados: { itemId: dev.itens[0].id } });
  });

  it('recusa a unidade enviada ou resolvida e a que está num lote que não está mais Aberto', async () => {
    const fornecedor = await criarFornecedorCompletoTeste(db);
    const produto = await criarProdutoDoFornecedorTeste(db, { cnpjFornecedor: fornecedor.cnpj });
    const dev = await depoisDaNf([
      { destino: 'PROBLEMA', produtoId: produto.id },
      { destino: 'PROBLEMA', produtoId: produto.id },
      { destino: 'PROBLEMA', produtoId: produto.id },
    ]);
    const fechado = await criarLoteTeste(db, { fornecedorId: fornecedor.id, status: 'FECHADO', itemIds: [dev.itens[0].id] });
    await criarLoteTeste(db, { fornecedorId: fornecedor.id, status: 'ENVIADO', itemIds: [dev.itens[1].id] });
    await criarLoteTeste(db, { fornecedorId: fornecedor.id, status: 'FINALIZADO', itemIds: [dev.itens[2].id] });
    await expect(trocarDestinoItem(db, dev.itens[0].id, 'BOM', null, gestor, AGORA)).rejects.toThrow(
      `A unidade 1 está no lote ${fechado.codigo} (Fechado): só dá para trocar o estoque enquanto o lote está Aberto.`,
    );
    await expect(trocarDestinoItem(db, dev.itens[1].id, 'BOM', null, gestor, AGORA)).rejects.toThrow(
      'A unidade 2 já foi enviada ao fornecedor: o estoque dela não muda mais.',
    );
    await expect(trocarDestinoItem(db, dev.itens[2].id, 'BOM', null, gestor, AGORA)).rejects.toThrow(
      'A unidade 3 já foi resolvida com o fornecedor: o estoque dela não muda mais.',
    );
    expect(await linhaItem(dev.itens[0].id)).toMatchObject({ status: 'EM_LOTE', loteId: fechado.id, destino: 'PROBLEMA' });
  });

  it('ML: ir para Problema abre a contestação AGUARDANDO_GESTOR; voltar para Bom a descarta; a enviada fica e volta um aviso', async () => {
    const dev = await devolucaoMLConferidaTeste(db, { itens: [{ destino: 'BOM' }, { destino: 'BOM' }] });
    const [u1, u2] = dev.itens;
    await trocarDestinoItem(db, u1.id, 'PROBLEMA', 'AVARIADO', gestor, AGORA);
    const aberta = await contestacaoDe(dev.id);
    expect(aberta).toMatchObject({ status: 'AGUARDANDO_GESTOR', revisadoPor: null });
    expect(aberta?.mensagem).toContain('Unidade 1');
    // A segunda também vai para Problema: a contestação que espera o Gestor é refeita com as duas.
    await trocarDestinoItem(db, u2.id, 'PROBLEMA', 'USADO', gestor, AGORA);
    expect((await contestacaoDe(dev.id))?.mensagem).toMatch(/Unidade 1[\s\S]*Unidade 2/);
    // A primeira volta para Bom: a contestação passa a citar só a segunda.
    await trocarDestinoItem(db, u1.id, 'BOM', null, gestor, AGORA);
    const refeita = await contestacaoDe(dev.id);
    expect(refeita?.mensagem).toContain('Unidade 2');
    expect(refeita?.mensagem).not.toContain('Unidade 1');
    // Sem problema nenhum, a contestação que espera o Gestor é descartada.
    await expect(trocarDestinoItem(db, u2.id, 'BOM', null, gestor, AGORA)).resolves.toEqual({ aviso: null });
    expect(await contestacaoDe(dev.id)).toBeNull();
    expect((await ultimoEvento(dev.id, 'destino_trocado'))?.dados).toMatchObject({ contestacaoDescartada: refeita?.id });

    // A já enviada ao ML fica, e a função avisa.
    await trocarDestinoItem(db, u1.id, 'PROBLEMA', 'AVARIADO', gestor, AGORA);
    await db.update(contestacoesCanal).set({ status: 'ENVIADA', enviadaEm: AGORA }).where(eq(contestacoesCanal.devolucaoId, dev.id));
    const { aviso } = await trocarDestinoItem(db, u1.id, 'BOM', null, gestor, AGORA);
    expect(aviso).toBe('A contestação desta devolução já foi enviada ao Mercado Livre e continua lá.');
    expect(await contestacaoDe(dev.id)).toMatchObject({ status: 'ENVIADA' });
  });
});

describe('2. reabrirConferencia', () => {
  it('Aguardando NF → Aguardando conferência; itens, evidências e destinos ficam; a contestação que espera o Gestor é descartada e volta no fim da nova conferência', async () => {
    const conferindo = await criarDevolucaoEmConferencia(db, operador, { canal: 'MERCADO_LIVRE', itens: [{ sku: 'A', quantidade: 2 }] });
    await db.update(devolucoes).set({ devolucaoExternaId: 'RET-REABRIR', reclamacaoId: 'CLM-REABRIR' }).where(eq(devolucoes.id, conferindo.id));
    await salvarItem(db, conferindo.id, conferindo.itens[0], BOM, operador);
    await salvarItem(db, conferindo.id, conferindo.itens[1], { ...BOM, serial: 'SN-2', decisao: 'PROBLEMA', motivo: 'AVARIADO' }, operador);
    await criarEvidenciasCompletas(db, conferindo.id, conferindo.itens);
    await concluirConferencia(db, conferindo.id, operador, AGORA);
    expect(fila.enviadas.filter((e) => e.nome === 'ml.enviar-resultado').map((e) => e.opcoes?.chaveUnica)).toEqual([conferindo.id]);
    await processarResultadoConferencia(db, conferindo.id, AGORA);
    const primeira = await contestacaoDe(conferindo.id);
    expect(primeira?.status).toBe('AGUARDANDO_GESTOR');

    await expect(reabrirConferencia(db, conferindo.id, gestor, AGORA)).resolves.toEqual({ aviso: null });
    expect(await linhaDevolucao(conferindo.id)).toMatchObject({ status: 'AGUARDANDO_CONFERENCIA', conferenteId: null, conferidaEm: null });
    expect((await itensDe(conferindo.id)).map((i) => [i.status, i.destino, i.motivo, i.serial])).toEqual([
      ['PENDENTE', 'BOM', null, 'SN-1'],
      ['PENDENTE', 'PROBLEMA', 'AVARIADO', 'SN-2'],
    ]);
    expect(await db.select().from(evidencias).where(eq(evidencias.devolucaoId, conferindo.id))).toHaveLength(7);
    expect(await contestacaoDe(conferindo.id)).toBeNull();
    expect(await ultimoEvento(conferindo.id, 'conferencia_reaberta')).toMatchObject({
      de: 'AGUARDANDO_NF',
      para: 'AGUARDANDO_CONFERENCIA',
      usuarioNome: gestor.nome,
      dados: { antes: { status: 'AGUARDANDO_NF' }, depois: { status: 'AGUARDANDO_CONFERENCIA' }, contestacaoDescartada: primeira?.id },
    });

    // Quem abrir continua de onde estava e, no fim, a contestação volta (outra chave na fila).
    await iniciarConferencia(db, conferindo.id, operador, AGORA);
    await concluirConferencia(db, conferindo.id, operador, AGORA);
    expect(fila.enviadas.filter((e) => e.nome === 'ml.enviar-resultado').map((e) => e.opcoes?.chaveUnica)).toEqual([
      conferindo.id,
      `${conferindo.id}:1`,
    ]);
    expect(await processarResultadoConferencia(db, conferindo.id, AGORA)).toBe('contestacao_criada');
  });

  it('só a partir de Aguardando NF e sem NF de devolução em processamento ou autorizada', async () => {
    const chegou = await criarDevolucaoChegada(db, operador);
    await expect(reabrirConferencia(db, chegou.id, gestor, AGORA)).rejects.toThrow('Só dá para reabrir a conferência de uma devolução Aguardando NF.');
    const dev = await criarDevolucaoNoEstoqueTeste(db, operador, { unidades: [{ destino: 'BOM' }] });
    await notaDeDevolucao(dev.id, 'PROCESSANDO');
    await expect(reabrirConferencia(db, dev.id, gestor, AGORA)).rejects.toThrow(
      'A NF de devolução está em processamento: espere o resultado antes de corrigir.',
    );
    const concluida = await depoisDaNf([{ destino: 'BOM' }]);
    await expect(reabrirConferencia(db, concluida.id, gestor, AGORA)).rejects.toThrow(
      'A devolução tem NF de devolução autorizada: o Fiscal cancela a NF antes.',
    );
  });
});

describe('3. desfazerChegada', () => {
  it('Aguardando conferência → Pendente de chegada, sem quem e quando recebeu', async () => {
    const dev = await criarDevolucaoTeste(db, operador, { rastreio: 'BR-DESFAZER-1' });
    await receberPorRastreio(db, 'BR-DESFAZER-1', operador, AGORA);
    await expect(desfazerChegada(db, dev.id, gestor, AGORA)).resolves.toEqual({ aviso: null });
    expect(await linhaDevolucao(dev.id)).toMatchObject({ status: 'PENDENTE_CHEGADA', recebidaEm: null, recebidaPor: null });
    expect(await ultimoEvento(dev.id, 'chegada_desfeita')).toMatchObject({
      de: 'AGUARDANDO_CONFERENCIA',
      para: 'PENDENTE_CHEGADA',
      dados: { antes: { status: 'AGUARDANDO_CONFERENCIA', recebidaPor: operador.id }, depois: { status: 'PENDENTE_CHEGADA', recebidaEm: null } },
    });
    // A leitura registra a chegada de novo.
    expect(await receberPorRastreio(db, 'BR-DESFAZER-1', operador, AGORA)).toMatchObject({ tipo: 'recebidas', codigos: [dev.codigo] });
  });

  it('a que voltou do armazém do ML (E25) volta para No CD do marketplace, e a trava da conferência é solta', async () => {
    const dev = await criarDevolucaoTeste(db, operador, { canal: 'MERCADO_LIVRE', rastreio: 'BR-NOCD-1' });
    await db.update(devolucoes).set({ status: 'NO_CD_MARKETPLACE' }).where(eq(devolucoes.id, dev.id));
    await receberPorRastreio(db, 'BR-NOCD-1', operador, AGORA);
    await iniciarConferencia(db, dev.id, operador, AGORA);
    await desfazerChegada(db, dev.id, gestor, AGORA);
    expect(await linhaDevolucao(dev.id)).toMatchObject({ status: 'NO_CD_MARKETPLACE', conferenteId: null, conferenciaIniciadaEm: null });
  });

  it('de Aguardando NF: descarta as fotos do pacote, a conferência (com as mídias) e a contestação que espera o Gestor', async () => {
    const dev = await devolucaoMLConferidaTeste(db, { itens: [{ destino: 'PROBLEMA', motivo: 'AVARIADO', observacao: 'riscado' }, { destino: null }] });
    await db.update(itensDevolucao).set({ serial: 'SN-X', eanLido: '789' }).where(eq(itensDevolucao.id, dev.itens[0].id));
    const f1 = await fotoTeste(db, { devolucaoId: dev.id, tipo: 'FOTO_1_ETIQUETA' });
    await fotoTeste(db, { devolucaoId: dev.id, tipo: 'FOTO_3_PRODUTO', itemId: dev.itens[0].id });
    await fotoTeste(db, { devolucaoId: dev.id, tipo: 'VIDEO_PROVA' });
    await processarResultadoConferencia(db, dev.id, AGORA);
    expect(await contestacaoDe(dev.id)).not.toBeNull();
    const armazenamento = obterArmazenamento() as ArmazenamentoMemoria;
    expect(armazenamento.arquivos.size).toBe(3);

    await desfazerChegada(db, dev.id, gestor, AGORA);
    expect(await linhaDevolucao(dev.id)).toMatchObject({ status: 'PENDENTE_CHEGADA', conferidaEm: null, recebidaEm: null });
    expect((await itensDe(dev.id)).map((i) => [i.status, i.destino, i.motivo, i.serial, i.eanLido, i.observacao])).toEqual([
      ['PENDENTE', null, null, null, null, null],
      ['PENDENTE', null, null, null, null, null],
    ]);
    expect(await db.select().from(evidencias).where(eq(evidencias.devolucaoId, dev.id))).toEqual([]);
    expect(armazenamento.arquivos.size).toBe(0);
    expect(await contestacaoDe(dev.id)).toBeNull();
    const evento = await ultimoEvento(dev.id, 'chegada_desfeita');
    expect(evento?.dados).toMatchObject({ evidenciasDescartadas: 3, contestacaoDescartada: expect.any(String) });
    expect(JSON.stringify(evento?.dados)).toContain(f1.id);
  });

  it('recusa a não identificada, a que ainda espera o pacote e a que tem NF em processamento ou autorizada', async () => {
    const ni = await criarNaoIdentificada(db, 'NI-DESFAZER', operador, AGORA);
    await expect(desfazerChegada(db, ni.id, gestor, AGORA)).rejects.toThrow(
      'O pacote não identificado não tem para onde voltar. Para tirá-lo da lista, apague-o.',
    );
    const pendente = await criarDevolucaoTeste(db, operador);
    await expect(desfazerChegada(db, pendente.id, gestor, AGORA)).rejects.toThrow(
      'Só dá para desfazer a chegada de uma devolução Aguardando conferência, Em conferência ou Aguardando NF.',
    );
    const comNota = await criarDevolucaoNoEstoqueTeste(db, operador, { unidades: [{ destino: 'BOM' }] });
    await notaDeDevolucao(comNota.id, 'PROCESSANDO');
    await expect(desfazerChegada(db, comNota.id, gestor, AGORA)).rejects.toThrow(
      'A NF de devolução está em processamento: espere o resultado antes de corrigir.',
    );
  });
});

describe('4. corrigirDados', () => {
  it('corrige o produto recebido de cada unidade, a observação da unidade e a da devolução; o histórico guarda antes e depois', async () => {
    const certo = await criarProdutoTeste(db, { sku: 'CERTO-1' });
    const dev = await criarDevolucaoNoEstoqueTeste(db, operador, { unidades: [{ destino: 'BOM' }, { destino: 'BOM' }] });
    await corrigirDados(
      db,
      dev.id,
      { observacao: '  Cliente mandou a caixa errada  ', itens: [{ itemId: dev.itens[1].id, produtoRecebidoId: certo, observacao: 'trocado na loja' }] },
      gestor,
      AGORA,
    );
    expect(await linhaDevolucao(dev.id)).toMatchObject({ observacoes: 'Cliente mandou a caixa errada' });
    expect(await linhaItem(dev.itens[1].id)).toMatchObject({ produtoRecebidoId: certo, observacao: 'trocado na loja' });
    expect(await ultimoEvento(dev.id, 'dados_corrigidos')).toMatchObject({
      usuarioNome: gestor.nome,
      dados: {
        antes: { observacoes: null, unidades: { 2: { produtoRecebidoId: null, observacao: null } } },
        depois: { observacoes: 'Cliente mandou a caixa errada', unidades: { 2: { produtoRecebidoId: certo, observacao: 'trocado na loja' } } },
      },
    });
    await expect(corrigirDados(db, dev.id, { observacao: 'Cliente mandou a caixa errada' }, gestor, AGORA)).resolves.toEqual({
      aviso: 'Nenhum dado mudou.',
    });
  });

  it('o rastreio só muda onde a origem não é a API do ML; o servidor recusa o campo que vem do ML', async () => {
    const manual = await criarDevolucaoTeste(db, operador, { rastreio: 'BR-ERRADO' });
    await corrigirDados(db, manual.id, { rastreio: ' br 123 certo ' }, gestor, AGORA);
    expect((await linhaDevolucao(manual.id)).rastreio).toBe('BR123CERTO');
    const doML = await devolucaoMLConferidaTeste(db, { itens: [{ destino: 'BOM' }] });
    await expect(corrigirDados(db, doML.id, { rastreio: 'OUTRO' }, gestor, AGORA)).rejects.toThrow(
      'O rastreio desta devolução vem do Mercado Livre: a sincronização o atualiza.',
    );
  });

  it('recusa unidade de outra devolução, unidade ausente, produto inexistente e unidade já em lote', async () => {
    const fornecedor = await criarFornecedorCompletoTeste(db);
    const produto = await criarProdutoDoFornecedorTeste(db, { cnpjFornecedor: fornecedor.cnpj });
    const outra = await criarDevolucaoNoEstoqueTeste(db, operador, { unidades: [{ destino: 'BOM' }] });
    const dev = await criarDevolucaoNoEstoqueTeste(db, operador, { unidades: [{ destino: 'AUSENTE' }, { destino: 'BOM' }] });
    await expect(corrigirDados(db, dev.id, { itens: [{ itemId: outra.itens[0].id, observacao: 'x' }] }, gestor, AGORA)).rejects.toThrow(
      'Unidade não encontrada nesta devolução.',
    );
    await expect(corrigirDados(db, dev.id, { itens: [{ itemId: dev.itens[0].id, produtoRecebidoId: produto.id }] }, gestor, AGORA)).rejects.toThrow(
      'A unidade 1 está ausente: não tem produto recebido.',
    );
    await expect(corrigirDados(db, dev.id, { itens: [{ itemId: dev.itens[1].id, produtoRecebidoId: randomUUID() }] }, gestor, AGORA)).rejects.toThrow(
      'Produto não encontrado no cadastro.',
    );
    const noLote = await depoisDaNf([{ destino: 'PROBLEMA', produtoId: produto.id }]);
    const lote = await criarLoteTeste(db, { fornecedorId: fornecedor.id, itemIds: [noLote.itens[0].id] });
    const outro = await criarProdutoTeste(db, { sku: 'OUTRO-1' });
    await expect(corrigirDados(db, noLote.id, { itens: [{ itemId: noLote.itens[0].id, produtoRecebidoId: outro }] }, gestor, AGORA)).rejects.toThrow(
      `A unidade 1 está no lote ${lote.codigo}: o produto recebido não muda depois de entrar no lote.`,
    );
  });

  it('a quantidade se corrige reabrindo a conferência e marcando a unidade como ausente', async () => {
    const conferindo = await criarDevolucaoEmConferencia(db, operador, { itens: [{ sku: 'A', quantidade: 2 }] });
    for (const id of conferindo.itens) await salvarItem(db, conferindo.id, id, BOM, operador);
    await criarEvidenciasCompletas(db, conferindo.id, conferindo.itens);
    await concluirConferencia(db, conferindo.id, operador, AGORA);
    await reabrirConferencia(db, conferindo.id, gestor, AGORA);
    await iniciarConferencia(db, conferindo.id, operador, AGORA);
    await salvarItem(db, conferindo.id, conferindo.itens[1], { ...BOM, decisao: 'AUSENTE' }, operador);
    await concluirConferencia(db, conferindo.id, operador, AGORA);
    expect((await itensDe(conferindo.id)).map((i) => i.status)).toEqual(['AGUARDANDO_NF', 'AUSENTE']);
  });
});

describe('5. encerrarPendente estendido (antes da NF)', () => {
  it('cancela em Aguardando conferência, marca extraviada em Em conferência (soltando a trava) e cancela em Aguardando NF', async () => {
    const chegou = await criarDevolucaoChegada(db, operador);
    await encerrarPendente(db, chegou.id, 'CANCELADA', 'Cliente desistiu', gestor, AGORA);
    expect(await linhaDevolucao(chegou.id)).toMatchObject({ status: 'CANCELADA' });
    expect(await ultimoEvento(chegou.id, 'cancelada')).toMatchObject({
      de: 'AGUARDANDO_CONFERENCIA',
      para: 'CANCELADA',
      dados: { motivo: 'Cliente desistiu', antes: { status: 'AGUARDANDO_CONFERENCIA' }, depois: { status: 'CANCELADA' } },
    });

    const conferindo = await criarDevolucaoEmConferencia(db, operador);
    await encerrarPendente(db, conferindo.id, 'EXTRAVIADA', 'Sumiu na bancada', gestor, AGORA);
    expect(await linhaDevolucao(conferindo.id)).toMatchObject({ status: 'EXTRAVIADA', conferenteId: null, conferenciaIniciadaEm: null });

    const aguardandoNf = await criarDevolucaoNoEstoqueTeste(db, operador, { unidades: [{ destino: 'BOM' }] });
    await encerrarPendente(db, aguardandoNf.id, 'CANCELADA', 'O ML cancelou', gestor, AGORA);
    expect(await linhaDevolucao(aguardandoNf.id)).toMatchObject({ status: 'CANCELADA' });
  });

  it('recusa depois da NF (em processamento, autorizada ou concluída)', async () => {
    const processando = await criarDevolucaoNoEstoqueTeste(db, operador, { unidades: [{ destino: 'BOM' }] });
    await notaDeDevolucao(processando.id, 'PROCESSANDO');
    await expect(encerrarPendente(db, processando.id, 'CANCELADA', 'Tarde demais', gestor, AGORA)).rejects.toThrow(
      'A NF de devolução está em processamento: espere o resultado antes de corrigir.',
    );
    const concluida = await depoisDaNf([{ destino: 'BOM' }]);
    await expect(encerrarPendente(db, concluida.id, 'CANCELADA', 'Tarde demais', gestor, AGORA)).rejects.toThrow(
      'Só dá para cancelar ou marcar como extraviada uma devolução antes da NF (Pendente de chegada, Aguardando conferência, Em conferência ou Aguardando NF).',
    );
  });
});

describe('6. apagarDevolucao e restaurarDevolucao', () => {
  it('grava quem e quando apagou, solta a trava e esconde a contestação; restaurar limpa a marca e o status fica o mesmo', async () => {
    const dev = await criarDevolucaoEmConferencia(db, operador, { canal: 'MERCADO_LIVRE' });
    await db.insert(contestacoesCanal).values({ devolucaoId: dev.id, motivoCanal: 'SRF2', mensagem: 'Teste da contestação' });
    expect(await listarContestacoes(db, 'AGUARDANDO_GESTOR', AGORA)).toHaveLength(1);
    await expect(apagarDevolucao(db, dev.id, gestor, AGORA)).resolves.toEqual({ aviso: null });
    expect(await linhaDevolucao(dev.id)).toMatchObject({
      apagadaEm: AGORA,
      apagadaPor: gestor.id,
      status: 'AGUARDANDO_CONFERENCIA',
      conferenteId: null,
      conferenciaIniciadaEm: null,
    });
    expect(await listarContestacoes(db, 'AGUARDANDO_GESTOR', AGORA)).toEqual([]);
    expect(await contestacaoDe(dev.id)).not.toBeNull();
    expect(await ultimoEvento(dev.id, 'devolucao_apagada')).toMatchObject({
      de: 'EM_CONFERENCIA',
      para: 'AGUARDANDO_CONFERENCIA',
      usuarioNome: gestor.nome,
      dados: { antes: { status: 'EM_CONFERENCIA', apagadaEm: null }, depois: { status: 'AGUARDANDO_CONFERENCIA' } },
    });
    await expect(apagarDevolucao(db, dev.id, gestor, AGORA)).rejects.toThrow('Esta devolução já está apagada.');

    await restaurarDevolucao(db, dev.id, gestor, AGORA);
    expect(await linhaDevolucao(dev.id)).toMatchObject({ apagadaEm: null, apagadaPor: null, status: 'AGUARDANDO_CONFERENCIA' });
    expect(await listarContestacoes(db, 'AGUARDANDO_GESTOR', AGORA)).toHaveLength(1);
    expect(await ultimoEvento(dev.id, 'devolucao_restaurada')).toMatchObject({ usuarioNome: gestor.nome, dados: { antes: { apagadaPor: gestor.id } } });
    await expect(restaurarDevolucao(db, dev.id, gestor, AGORA)).rejects.toThrow('Esta devolução não está apagada.');
  });

  it('funciona numa devolução do ML e restaurar não mexe no status', async () => {
    const dev = await devolucaoMLConferidaTeste(db, { itens: [{ destino: 'BOM' }] });
    await apagarDevolucao(db, dev.id, gestor, AGORA);
    await restaurarDevolucao(db, dev.id, gestor, AGORA);
    expect(await linhaDevolucao(dev.id)).toMatchObject({ status: 'AGUARDANDO_NF', apagadaEm: null, origem: 'API' });
  });

  it('recusa com NF de devolução autorizada ou em processamento e com unidade em lote', async () => {
    const autorizada = await depoisDaNf([{ destino: 'BOM' }]);
    await expect(apagarDevolucao(db, autorizada.id, gestor, AGORA)).rejects.toThrow(
      'A devolução tem NF de devolução autorizada: o Fiscal cancela a NF antes.',
    );
    const processando = await criarDevolucaoNoEstoqueTeste(db, operador, { unidades: [{ destino: 'BOM' }] });
    await notaDeDevolucao(processando.id, 'PROCESSANDO');
    await expect(apagarDevolucao(db, processando.id, gestor, AGORA)).rejects.toThrow(
      'A NF de devolução está em processamento: espere o resultado antes de corrigir.',
    );
    // NF cancelada com a unidade presa num lote que já andou (decisão 13): a devolução volta a Aguardando NF.
    const fornecedor = await criarFornecedorCompletoTeste(db);
    const presa = await criarDevolucaoNoEstoqueTeste(db, operador, { unidades: [{ destino: 'PROBLEMA' }] });
    const lote = await criarLoteTeste(db, { fornecedorId: fornecedor.id, status: 'ENVIADO', itemIds: [presa.itens[0].id] });
    await expect(apagarDevolucao(db, presa.id, gestor, AGORA)).rejects.toThrow(
      `A unidade 1 está no lote ${lote.codigo}: tire-a do lote antes de apagar a devolução.`,
    );
  });

  it('restaurar avisa quando o pedido ganhou outra devolução em andamento enquanto ela estava apagada', async () => {
    const dev = await criarDevolucaoTeste(db, operador, { canal: 'SHOPEE', pedido: 'SHP-RESTAURAR' });
    await apagarDevolucao(db, dev.id, gestor, AGORA);
    const nova = await criarDevolucaoTeste(db, operador, { canal: 'SHOPEE', pedido: 'SHP-RESTAURAR' });
    await expect(restaurarDevolucao(db, dev.id, gestor, AGORA)).resolves.toEqual({
      aviso: `O pedido SHP-RESTAURAR também está na devolução ${nova.codigo}, em andamento.`,
    });
  });
});

describe('7. perfil: só o Gestor corrige', () => {
  it('Operador e Fiscal recebem erro em todas as correções', async () => {
    const dev = await criarDevolucaoNoEstoqueTeste(db, operador, { unidades: [{ destino: 'BOM' }] });
    const chegou = await criarDevolucaoChegada(db, operador);
    for (const quem of [operador, fiscal]) {
      await expect(trocarDestinoItem(db, dev.itens[0].id, 'PROBLEMA', 'AVARIADO', quem, AGORA)).rejects.toThrow('Só o Gestor troca o estoque de uma unidade.');
      await expect(reabrirConferencia(db, dev.id, quem, AGORA)).rejects.toThrow('Só o Gestor reabre a conferência.');
      await expect(desfazerChegada(db, chegou.id, quem, AGORA)).rejects.toThrow('Só o Gestor desfaz a chegada.');
      await expect(corrigirDados(db, dev.id, { observacao: 'x' }, quem, AGORA)).rejects.toThrow('Só o Gestor corrige os dados da devolução.');
      await expect(encerrarPendente(db, chegou.id, 'CANCELADA', 'Cliente desistiu', quem, AGORA)).rejects.toThrow(
        'Só o Gestor cancela ou marca como extraviada uma devolução.',
      );
      await expect(apagarDevolucao(db, dev.id, quem, AGORA)).rejects.toThrow('Só o Gestor apaga devoluções.');
      await expect(restaurarDevolucao(db, dev.id, quem, AGORA)).rejects.toThrow('Só o Gestor restaura devoluções.');
    }
    expect(await linhaDevolucao(dev.id)).toMatchObject({ status: 'AGUARDANDO_NF', apagadaEm: null });
    expect(await linhaDevolucao(chegou.id)).toMatchObject({ status: 'AGUARDANDO_CONFERENCIA' });
  });
});
