import { asc, eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { devolucoes, itensDevolucao } from '@/db/schema';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import { listarEventos } from '@/modules/historico/eventos';
import { criarDbTeste, limparTabelas } from '../../../tests/helpers/db';
import { criarDevolucaoTeste, criarProdutoTeste, criarUsuarioTeste } from '../../../tests/helpers/fabricas';
import { ErroDevolucao } from './erros';
import { encerrarPendente, identificarDevolucao } from './excecoes';
import { criarNaoIdentificada, receberPorRastreio } from './recebimento';
import { ErroTransicao } from './transicoes';

const { db, sql } = criarDbTeste();
let operador: UsuarioSessao;
let gestor: UsuarioSessao;

beforeEach(async () => {
  await limparTabelas(sql);
  operador = await criarUsuarioTeste(db, 'OPERADOR');
  gestor = await criarUsuarioTeste(db, 'GESTOR');
});
afterAll(async () => {
  await sql.end();
});

async function statusDe(id: string) {
  const [linha] = await db.select({ status: devolucoes.status }).from(devolucoes).where(eq(devolucoes.id, id));
  return linha.status;
}

describe('encerrarPendente (spec §5.2: Pendente de chegada → Cancelada ou Extraviada, pelo Gestor)', () => {
  it('o Gestor cancela com motivo e o histórico guarda o motivo', async () => {
    const d = await criarDevolucaoTeste(db, operador);
    await encerrarPendente(db, d.id, 'CANCELADA', '  Cliente desistiu  ', gestor);
    expect(await statusDe(d.id)).toBe('CANCELADA');
    const eventos = await listarEventos(db, 'devolucao', d.id);
    expect(eventos[eventos.length - 1]).toMatchObject({
      acao: 'cancelada',
      de: 'PENDENTE_CHEGADA',
      para: 'CANCELADA',
      usuarioNome: gestor.nome,
      dados: { motivo: 'Cliente desistiu' },
    });
  });

  it('o Gestor marca como extraviada', async () => {
    const d = await criarDevolucaoTeste(db, operador);
    await encerrarPendente(db, d.id, 'EXTRAVIADA', 'Transportadora confirmou extravio', gestor);
    expect(await statusDe(d.id)).toBe('EXTRAVIADA');
  });

  it('o Operador não cancela (mensagem para a tela) e o motivo é obrigatório', async () => {
    const d = await criarDevolucaoTeste(db, operador);
    const erro = await encerrarPendente(db, d.id, 'CANCELADA', 'Quero cancelar', operador).catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(ErroTransicao);
    expect((erro as Error).message).toBe('Só o Gestor cancela ou marca como extraviada uma devolução.');
    await expect(encerrarPendente(db, d.id, 'CANCELADA', ' a ', gestor)).rejects.toThrow('Explique o motivo (pelo menos 3 letras).');
  });

  it('só encerra o que ainda está pendente de chegada', async () => {
    const d = await criarDevolucaoTeste(db, operador, { rastreio: 'BR900' });
    await receberPorRastreio(db, 'BR900', operador);
    await expect(encerrarPendente(db, d.id, 'CANCELADA', 'Tarde demais', gestor)).rejects.toThrow(
      new ErroDevolucao('Só dá para cancelar ou marcar como extraviada uma devolução Pendente de chegada.'),
    );
  });

  it('devolução inexistente', async () => {
    await expect(encerrarPendente(db, '00000000-0000-4000-8000-000000000000', 'CANCELADA', 'Motivo qualquer', gestor)).rejects.toThrow(
      'Devolução não encontrada.',
    );
  });

  it('dois cancelamentos ao mesmo tempo: um vence e só um evento é gravado', async () => {
    const gestor2 = await criarUsuarioTeste(db, 'GESTOR');
    const d = await criarDevolucaoTeste(db, operador);
    const resultados = await Promise.allSettled([
      encerrarPendente(db, d.id, 'CANCELADA', 'Primeiro gestor', gestor),
      encerrarPendente(db, d.id, 'EXTRAVIADA', 'Segundo gestor', gestor2),
    ]);
    expect(resultados.map((r) => r.status).sort()).toEqual(['fulfilled', 'rejected']);
    const eventos = (await listarEventos(db, 'devolucao', d.id)).filter((e) => e.acao !== 'criada');
    expect(eventos).toHaveLength(1);
  });
});

describe('identificarDevolucao (spec §5.2: o Gestor liga o pacote ao pedido)', () => {
  it('preenche canal, pedido e itens, e a marca de não identificada sai', async () => {
    const produtoId = await criarProdutoTeste(db, { sku: 'FONE-01' });
    const pacote = await criarNaoIdentificada(db, 'NI-1', operador);
    await identificarDevolucao(
      db,
      pacote.id,
      { canal: 'Magalu', pedido: 'MGL-9', reclamacaoId: 'R-1', transportadora: 'Jadlog', itens: [{ sku: 'fone-01', quantidade: '2' }] },
      gestor,
    );
    const [linha] = await db.select().from(devolucoes).where(eq(devolucoes.id, pacote.id));
    expect(linha).toMatchObject({
      canal: 'MAGALU',
      pedidosExternos: ['MGL-9'],
      reclamacaoId: 'R-1',
      transportadora: 'Jadlog',
      naoIdentificada: false,
      rastreio: 'NI-1',
      status: 'AGUARDANDO_CONFERENCIA',
    });
    const itens = await db.select().from(itensDevolucao).where(eq(itensDevolucao.devolucaoId, pacote.id)).orderBy(asc(itensDevolucao.unidade));
    expect(itens.map((i) => [i.unidade, i.sku, i.produtoEsperadoId])).toEqual([
      [1, 'FONE-01', produtoId],
      [2, 'FONE-01', produtoId],
    ]);
    const eventos = await listarEventos(db, 'devolucao', pacote.id);
    expect(eventos[eventos.length - 1]).toMatchObject({ acao: 'identificada', dados: { canal: 'MAGALU', pedido: 'MGL-9', unidades: 2 } });
  });

  it('recusa pedido que já tem outra devolução em andamento', async () => {
    const outra = await criarDevolucaoTeste(db, operador, { canal: 'SHOPEE', pedido: 'SHP-7' });
    const pacote = await criarNaoIdentificada(db, 'NI-2', operador);
    await expect(identificarDevolucao(db, pacote.id, { canal: 'SHOPEE', pedido: 'SHP-7', itens: [] }, gestor)).rejects.toThrow(
      `O pedido já tem a devolução ${outra.codigo}. Se ela ainda está pendente de chegada, cancele-a e tente de novo.`,
    );
  });

  it('recusa quem não é Gestor, dados inválidos e devolução já identificada', async () => {
    const pacote = await criarNaoIdentificada(db, 'NI-3', operador);
    await expect(identificarDevolucao(db, pacote.id, { canal: 'SHOPEE', pedido: 'P1', itens: [] }, operador)).rejects.toThrow(
      'Só o Gestor identifica um pacote não identificado.',
    );
    await expect(identificarDevolucao(db, pacote.id, { canal: '', pedido: '', itens: [] }, gestor)).rejects.toThrow(
      'Escolha o canal (marketplace); Informe o número do pedido',
    );
    await identificarDevolucao(db, pacote.id, { canal: 'SHOPEE', pedido: 'P1', itens: [] }, gestor);
    await expect(identificarDevolucao(db, pacote.id, { canal: 'SHOPEE', pedido: 'P2', itens: [] }, gestor)).rejects.toThrow(
      'Esta devolução já foi identificada.',
    );
  });

  it('id inexistente diz "Devolução não encontrada."', async () => {
    await expect(
      identificarDevolucao(db, '00000000-0000-4000-8000-000000000000', { canal: 'SHOPEE', pedido: 'P9', itens: [] }, gestor),
    ).rejects.toThrow('Devolução não encontrada.');
  });

  it('duas identificações ao mesmo tempo: uma vence e só um evento "identificada" é gravado', async () => {
    const gestor2 = await criarUsuarioTeste(db, 'GESTOR');
    const pacote = await criarNaoIdentificada(db, 'NI-4', operador);
    const resultados = await Promise.allSettled([
      identificarDevolucao(db, pacote.id, { canal: 'SHOPEE', pedido: 'RACE-1', itens: [] }, gestor),
      identificarDevolucao(db, pacote.id, { canal: 'MAGALU', pedido: 'RACE-2', itens: [] }, gestor2),
    ]);
    expect(resultados.map((r) => r.status).sort()).toEqual(['fulfilled', 'rejected']);
    const eventos = (await listarEventos(db, 'devolucao', pacote.id)).filter((e) => e.acao === 'identificada');
    expect(eventos).toHaveLength(1);
  });
});
