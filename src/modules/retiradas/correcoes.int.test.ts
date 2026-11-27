import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { devolucoes, retiradasFull } from '@/db/schema';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import { listarEventos } from '@/modules/historico/eventos';
import { listarVoltaAoArmazem } from '@/modules/volta-armazem/consulta';
import { criarDbTeste, limparTabelas } from '../../../tests/helpers/db';
import { criarRetiradaTeste } from '../../../tests/helpers/fabricas-retiradas';
import { criarDevolucaoTeste, criarUsuarioTeste } from '../../../tests/helpers/fabricas';
import { listarRetiradas } from './consultas';
import { apagarRetirada, reabrirRetirada, restaurarRetirada } from './correcoes';
import { biparProduto, concluirRetirada, darChegadaPelaEtiquetaAmarela } from './retiradas';

const { db, sql } = criarDbTeste();
const AGORA = new Date('2026-11-27T15:00:00Z');
const HOJE = { de: '2026-11-27', ate: '2026-11-27' };
let operador: UsuarioSessao;
let fiscal: UsuarioSessao;
let gestor: UsuarioSessao;

beforeEach(async () => {
  await limparTabelas(sql);
  operador = await criarUsuarioTeste(db, 'OPERADOR');
  fiscal = await criarUsuarioTeste(db, 'FISCAL');
  gestor = await criarUsuarioTeste(db, 'GESTOR');
});
afterAll(() => sql.end());

async function linha(id: string) {
  const [r] = await db.select().from(retiradasFull).where(eq(retiradasFull.id, id));
  return r;
}
async function ultimoEvento(id: string, acao: string) {
  const eventos = (await listarEventos(db, 'retirada_full', id)).filter((e) => e.acao === acao);
  return eventos[eventos.length - 1];
}

describe('reabrirRetirada (E29, item 7)', () => {
  it('Conferida → Aberta, limpando concluida_em; a retirada volta a aceitar itens e quantidades e conclui de novo', async () => {
    const r = await criarRetiradaTeste(db, operador, { itens: [{ descricao: 'Fone', eanLido: '789', quantidade: 2 }], concluidaEm: AGORA });
    await reabrirRetirada(db, r.id, gestor, AGORA);
    expect(await linha(r.id)).toMatchObject({ situacao: 'ABERTA', concluidaEm: null });
    expect(await ultimoEvento(r.id, 'retirada_reaberta')).toMatchObject({
      de: 'CONFERIDA',
      para: 'ABERTA',
      usuarioNome: gestor.nome,
      dados: { antes: { situacao: 'CONFERIDA', concluidaEm: AGORA.toISOString() }, depois: { situacao: 'ABERTA', concluidaEm: null } },
    });
    await expect(biparProduto(db, r.id, '789', null, operador)).resolves.toMatchObject({ tipo: 'somado' });
    // Sem a foto da etiqueta a conclusão continua recusada: a regra da conclusão não muda.
    await expect(concluirRetirada(db, r.id, operador, AGORA)).rejects.toThrow(/etiqueta/i);
  });

  it('recusa a retirada que já está Aberta e a apagada', async () => {
    const aberta = await criarRetiradaTeste(db, operador, { itens: [] });
    await expect(reabrirRetirada(db, aberta.id, gestor, AGORA)).rejects.toThrow('Esta retirada já está Aberta.');
    const conferida = await criarRetiradaTeste(db, operador, { itens: [], concluidaEm: AGORA });
    await apagarRetirada(db, conferida.id, gestor, AGORA);
    await expect(reabrirRetirada(db, conferida.id, gestor, AGORA)).rejects.toThrow('Retirada não encontrada.');
  });
});

describe('apagarRetirada e restaurarRetirada (E29, item 8)', () => {
  it('apagar esconde (lista e planilha Volta ao armazém) e grava quem e quando; restaurar devolve como estava', async () => {
    const r = await criarRetiradaTeste(db, operador, { itens: [{ descricao: 'Mouse', eanLido: '790', quantidade: 5 }], concluidaEm: AGORA });
    expect(await listarVoltaAoArmazem(db, HOJE)).toHaveLength(1);
    await apagarRetirada(db, r.id, gestor, AGORA);
    expect(await linha(r.id)).toMatchObject({ apagadaEm: AGORA, apagadaPor: gestor.id, situacao: 'CONFERIDA' });
    expect((await listarRetiradas(db, { pagina: 1 })).retiradas).toEqual([]);
    expect(await listarVoltaAoArmazem(db, HOJE)).toEqual([]);
    expect(await ultimoEvento(r.id, 'retirada_apagada')).toMatchObject({
      usuarioNome: gestor.nome,
      dados: { antes: { apagadaEm: null }, depois: { apagadaEm: AGORA.toISOString(), apagadaPor: gestor.id } },
    });
    await expect(apagarRetirada(db, r.id, gestor, AGORA)).rejects.toThrow('Esta retirada já está apagada.');

    await restaurarRetirada(db, r.id, gestor, AGORA);
    expect(await linha(r.id)).toMatchObject({ apagadaEm: null, apagadaPor: null, situacao: 'CONFERIDA', concluidaEm: AGORA });
    expect(await listarVoltaAoArmazem(db, HOJE)).toHaveLength(1);
    expect(await ultimoEvento(r.id, 'retirada_restaurada')).toMatchObject({ usuarioNome: gestor.nome, dados: { antes: { apagadaPor: gestor.id } } });
    await expect(restaurarRetirada(db, r.id, gestor, AGORA)).rejects.toThrow('Esta retirada não está apagada.');
  });

  it('as devoluções que tiveram chegada pela etiqueta amarela dentro dela não mudam', async () => {
    const r = await criarRetiradaTeste(db, operador, { itens: [] });
    const dev = await criarDevolucaoTeste(db, operador, { canal: 'MERCADO_LIVRE', pedido: '2000012345678901' });
    await darChegadaPelaEtiquetaAmarela(db, r.id, { devolucaoId: dev.id, codigoLido: '2000012345678901' }, operador, AGORA);
    await apagarRetirada(db, r.id, gestor, AGORA);
    const [d] = await db.select().from(devolucoes).where(eq(devolucoes.id, dev.id));
    expect(d).toMatchObject({ status: 'AGUARDANDO_CONFERENCIA', recebidaPor: operador.id, apagadaEm: null });
  });

  it('Operador e Fiscal recebem erro nas três funções', async () => {
    const r = await criarRetiradaTeste(db, operador, { itens: [], concluidaEm: AGORA });
    for (const quem of [operador, fiscal]) {
      await expect(reabrirRetirada(db, r.id, quem, AGORA)).rejects.toThrow('Só o Gestor reabre retiradas.');
      await expect(apagarRetirada(db, r.id, quem, AGORA)).rejects.toThrow('Só o Gestor apaga retiradas.');
      await expect(restaurarRetirada(db, r.id, quem, AGORA)).rejects.toThrow('Só o Gestor restaura retiradas.');
    }
    expect(await linha(r.id)).toMatchObject({ situacao: 'CONFERIDA', apagadaEm: null });
  });
});
