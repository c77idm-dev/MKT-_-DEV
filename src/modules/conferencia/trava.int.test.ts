import { asc, eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { devolucoes, eventosHistorico, itensDevolucao } from '@/db/schema';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import { criarNaoIdentificada } from '@/modules/devolucoes/recebimento';
import { ErroTransicao } from '@/modules/devolucoes/transicoes';
import { criarDbTeste, limparTabelas } from '../../../tests/helpers/db';
import { criarDevolucaoTeste, criarUsuarioTeste } from '../../../tests/helpers/fabricas';
import { criarDevolucaoChegada, criarDevolucaoEmConferencia } from '../../../tests/helpers/fabricas-conferencia';
import { ErroConferencia } from './erros';
import { desistirConferencia, iniciarConferencia, liberarTrava } from './trava';

const { db, sql } = criarDbTeste();
let operador: UsuarioSessao;
let outro: UsuarioSessao;
let gestor: UsuarioSessao;

beforeEach(async () => {
  await limparTabelas(sql);
  operador = await criarUsuarioTeste(db, 'OPERADOR');
  outro = await criarUsuarioTeste(db, 'OPERADOR');
  gestor = await criarUsuarioTeste(db, 'GESTOR');
});
afterAll(async () => {
  await sql.end();
});

async function estado(id: string) {
  const [d] = await db
    .select({ status: devolucoes.status, conferenteId: devolucoes.conferenteId, iniciadaEm: devolucoes.conferenciaIniciadaEm })
    .from(devolucoes)
    .where(eq(devolucoes.id, id));
  return d;
}
async function acoes(id: string) {
  const eventos = await db
    .select({ acao: eventosHistorico.acao })
    .from(eventosHistorico)
    .where(eq(eventosHistorico.entidadeId, id))
    .orderBy(asc(eventosHistorico.id));
  return eventos.map((e) => e.acao);
}

describe('iniciarConferencia (spec §5.2: Aguardando conferência → Em conferência, travada com o operador)', () => {
  it('trava a devolução com o operador e registra o evento', async () => {
    const d = await criarDevolucaoChegada(db, operador);
    const agora = new Date('2026-11-12T13:00:00Z');
    await iniciarConferencia(db, d.id, operador, agora);
    expect(await estado(d.id)).toEqual({ status: 'EM_CONFERENCIA', conferenteId: operador.id, iniciadaEm: agora });
    expect(await acoes(d.id)).toEqual(['criada', 'conferencia_iniciada']);
  });

  it('abrir de novo pelo mesmo operador só continua, sem evento novo', async () => {
    const d = await criarDevolucaoChegada(db, operador);
    await iniciarConferencia(db, d.id, operador);
    await iniciarConferencia(db, d.id, operador);
    expect(await acoes(d.id)).toEqual(['criada', 'conferencia_iniciada']);
  });

  it('outra pessoa vê "Em conferência por ..." (spec §11)', async () => {
    const d = await criarDevolucaoChegada(db, operador);
    await iniciarConferencia(db, d.id, operador);
    await expect(iniciarConferencia(db, d.id, outro)).rejects.toThrow(`Em conferência por ${operador.nome}.`);
  });

  it('pacote não identificado ou sem unidades não entra em conferência (contrato D3)', async () => {
    const naoIdentificada = await criarNaoIdentificada(db, 'BRNI0001', operador);
    await expect(iniciarConferencia(db, naoIdentificada.id, operador)).rejects.toThrow(/não identificado/);
    const vazia = await criarDevolucaoChegada(db, operador, { itens: [] });
    await expect(iniciarConferencia(db, vazia.id, operador)).rejects.toThrow('A devolução não tem unidades para conferir.');
  });

  it('só confere devolução que chegou', async () => {
    const pendente = await criarDevolucaoTeste(db, operador);
    await expect(iniciarConferencia(db, pendente.id, operador)).rejects.toThrow(ErroConferencia);
    await expect(iniciarConferencia(db, pendente.id, operador)).rejects.toThrow(/pendente de chegada/);
  });

  it('o Fiscal não confere', async () => {
    const d = await criarDevolucaoChegada(db, operador);
    const fiscal = await criarUsuarioTeste(db, 'FISCAL');
    await expect(iniciarConferencia(db, d.id, fiscal)).rejects.toThrow(ErroTransicao);
  });
});

describe('desistirConferencia e liberarTrava (contrato D7: o que foi feito fica guardado)', () => {
  it('quem está conferindo desiste: volta para Aguardando conferência e mantém o que preencheu', async () => {
    const d = await criarDevolucaoEmConferencia(db, operador);
    await db.update(itensDevolucao).set({ serial: 'SN-1' }).where(eq(itensDevolucao.id, d.itens[0]));
    await desistirConferencia(db, d.id, operador);
    expect(await estado(d.id)).toEqual({ status: 'AGUARDANDO_CONFERENCIA', conferenteId: null, iniciadaEm: null });
    const [item] = await db.select({ serial: itensDevolucao.serial }).from(itensDevolucao).where(eq(itensDevolucao.id, d.itens[0]));
    expect(item.serial).toBe('SN-1');
    expect(await acoes(d.id)).toContain('conferencia_interrompida');
  });

  it('outra pessoa não desiste pela outra', async () => {
    const d = await criarDevolucaoEmConferencia(db, operador);
    await expect(desistirConferencia(db, d.id, outro)).rejects.toThrow('A conferência desta devolução não está aberta por você.');
  });

  it('o Gestor libera a trava de outra pessoa; o Operador não', async () => {
    const d = await criarDevolucaoEmConferencia(db, operador);
    await expect(liberarTrava(db, d.id, outro)).rejects.toThrow('Só o Gestor libera a trava da conferência.');
    await liberarTrava(db, d.id, gestor);
    expect((await estado(d.id)).status).toBe('AGUARDANDO_CONFERENCIA');
    const [evento] = await db
      .select({ acao: eventosHistorico.acao, usuarioId: eventosHistorico.usuarioId, dados: eventosHistorico.dados })
      .from(eventosHistorico)
      .where(eq(eventosHistorico.acao, 'conferencia_trava_liberada'));
    expect(evento).toEqual({ acao: 'conferencia_trava_liberada', usuarioId: gestor.id, dados: { conferenteId: operador.id, conferente: operador.nome } });
    await expect(liberarTrava(db, d.id, gestor)).rejects.toThrow('Esta devolução não está em conferência.');
  });
});
