import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { devolucoes } from '@/db/schema';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import { listarEventos } from '@/modules/historico/eventos';
import { criarDbTeste, limparTabelas } from '../../../tests/helpers/db';
import { criarDevolucaoTeste, criarUsuarioTeste } from '../../../tests/helpers/fabricas';
import { ErroDevolucao } from './erros';
import { criarNaoIdentificada, receberPorRastreio } from './recebimento';
import { ErroTransicao } from './transicoes';

const { db, sql } = criarDbTeste();
let operador: UsuarioSessao;

beforeEach(async () => {
  await limparTabelas(sql);
  operador = await criarUsuarioTeste(db, 'OPERADOR');
});
afterAll(async () => {
  await sql.end();
});

describe('receberPorRastreio (spec §6.2)', () => {
  it('registra a chegada com data, hora e usuário, e grava o histórico', async () => {
    const d = await criarDevolucaoTeste(db, operador, { rastreio: 'BR111' });
    const agora = new Date();
    expect(await receberPorRastreio(db, ' br 111 ', operador, agora)).toEqual({ tipo: 'recebidas', codigos: [d.codigo], em: agora });
    const [linha] = await db.select().from(devolucoes).where(eq(devolucoes.id, d.id));
    expect(linha).toMatchObject({ status: 'AGUARDANDO_CONFERENCIA', recebidaEm: agora, recebidaPor: operador.id });
    expect((await listarEventos(db, 'devolucao', d.id)).map((e) => [e.acao, e.de, e.para, e.usuarioNome])).toEqual([
      ['criada', null, 'PENDENTE_CHEGADA', operador.nome],
      ['recebida', 'PENDENTE_CHEGADA', 'AGUARDANDO_CONFERENCIA', operador.nome],
    ]);
  });

  it('na segunda leitura avisa que o pacote já chegou', async () => {
    const d = await criarDevolucaoTeste(db, operador, { rastreio: 'BR111' });
    const agora = new Date();
    await receberPorRastreio(db, 'BR111', operador, agora);
    expect(await receberPorRastreio(db, 'BR111', operador)).toEqual({
      tipo: 'ja_recebida',
      codigo: d.codigo,
      status: 'AGUARDANDO_CONFERENCIA',
      recebidaEm: agora,
    });
  });

  it('duas leituras ao mesmo tempo (dois celulares): só uma registra a chegada e grava um evento', async () => {
    const outro = await criarUsuarioTeste(db, 'OPERADOR');
    const d = await criarDevolucaoTeste(db, operador, { rastreio: 'BR777' });
    const resultados = await Promise.all([receberPorRastreio(db, 'BR777', operador), receberPorRastreio(db, 'BR777', outro)]);
    expect(resultados.map((r) => r.tipo).sort()).toEqual(['ja_recebida', 'recebidas']);
    const recebidas = (await listarEventos(db, 'devolucao', d.id)).filter((e) => e.acao === 'recebida');
    expect(recebidas).toHaveLength(1);
  });

  it('o mesmo rastreio em duas devoluções pendentes registra a chegada das duas', async () => {
    const a = await criarDevolucaoTeste(db, operador, { rastreio: 'BR222' });
    const b = await criarDevolucaoTeste(db, operador, { rastreio: 'BR222' });
    const resultado = await receberPorRastreio(db, 'BR222', operador);
    expect(resultado).toMatchObject({ tipo: 'recebidas', codigos: [a.codigo, b.codigo] });
  });

  it('devolução cancelada fica bloqueada', async () => {
    const d = await criarDevolucaoTeste(db, operador, { rastreio: 'BR333' });
    await db.update(devolucoes).set({ status: 'CANCELADA' }).where(eq(devolucoes.id, d.id));
    expect(await receberPorRastreio(db, 'BR333', operador)).toEqual({ tipo: 'bloqueada', codigo: d.codigo, status: 'CANCELADA' });
  });

  it('rastreio desconhecido', async () => {
    expect(await receberPorRastreio(db, 'xyz 9', operador)).toEqual({ tipo: 'nao_encontrada', rastreio: 'XYZ9' });
  });

  it('recusa rastreio vazio e o perfil Fiscal, com mensagem para a tela', async () => {
    await expect(receberPorRastreio(db, '   ', operador)).rejects.toThrow(new ErroDevolucao('Leia ou digite o código de rastreamento.'));
    const fiscal = await criarUsuarioTeste(db, 'FISCAL');
    const erro = await receberPorRastreio(db, 'BR111', fiscal).catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(ErroTransicao);
    expect((erro as Error).message).toBe('Seu perfil não pode registrar o recebimento de pacotes.');
  });
});

describe('criarNaoIdentificada (spec §5.2 e §6.2)', () => {
  it('cria já em "Aguardando conferência", sem canal, com a marca e a chegada registrada', async () => {
    const agora = new Date();
    const criada = await criarNaoIdentificada(db, 'nn 123', operador, agora);
    const [linha] = await db.select().from(devolucoes).where(eq(devolucoes.id, criada.id));
    expect(linha).toMatchObject({
      codigo: criada.codigo,
      canal: null,
      naoIdentificada: true,
      rastreio: 'NN123',
      status: 'AGUARDANDO_CONFERENCIA',
      recebidaEm: agora,
      recebidaPor: operador.id,
    });
    expect((await listarEventos(db, 'devolucao', criada.id)).map((e) => [e.acao, e.de, e.para])).toEqual([
      ['criada_nao_identificada', null, 'AGUARDANDO_CONFERENCIA'],
    ]);
  });

  it('recusa quando o rastreio já existe', async () => {
    const d = await criarDevolucaoTeste(db, operador, { rastreio: 'BR444' });
    await expect(criarNaoIdentificada(db, 'BR444', operador)).rejects.toThrow(
      new ErroDevolucao(`Já existe a devolução ${d.codigo} com este rastreio. Registre a chegada por ela.`),
    );
  });

  it('o perfil Fiscal recebe mensagem para a tela', async () => {
    const fiscal = await criarUsuarioTeste(db, 'FISCAL');
    await expect(criarNaoIdentificada(db, 'NN1', fiscal)).rejects.toThrow('Seu perfil não pode registrar um pacote não identificado.');
  });
});
