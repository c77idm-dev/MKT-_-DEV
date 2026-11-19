import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { devolucoes, reclamacoesMl } from '@/db/schema';
import type { AfetaReputacao } from '@/modules/mercado-livre/dominio';
import { criarDbTeste, limparTabelas } from '../../../tests/helpers/db';
import { criarDevolucaoTeste, criarUsuarioTeste } from '../../../tests/helpers/fabricas';
import { buscarDevolucoes, type OpcoesBusca } from './busca';
import type { DevolucaoCriada } from './criar';
import type { StatusDevolucao } from './dominio';
import type { FiltrosBusca } from './filtros';
import { contarAfetamReputacao } from './reputacao';

const { db, sql } = criarDbTeste();
let claim = 0;

async function devolucaoML(status: StatusDevolucao, ...reclamacoes: (AfetaReputacao | null)[]): Promise<DevolucaoCriada> {
  const operador = await criarUsuarioTeste(db);
  const d = await criarDevolucaoTeste(db, operador, { canal: 'MERCADO_LIVRE' });
  await db.update(devolucoes).set({ status }).where(eq(devolucoes.id, d.id));
  // A última da lista é a mais recente (sincronizada por último).
  for (const [i, afetaReputacao] of reclamacoes.entries()) {
    claim += 1;
    await db.insert(reclamacoesMl).values({
      claimId: `51${String(claim).padStart(8, '0')}`,
      devolucaoId: d.id,
      afetaReputacao,
      sincronizadaEm: new Date(Date.UTC(2026, 10, 19, 12, i)),
    });
  }
  return d;
}

async function codigos(filtros: FiltrosBusca, opcoes: OpcoesBusca = {}) {
  return (await buscarDevolucoes(db, filtros, opcoes)).devolucoes.map((d) => d.codigo).sort();
}

let pendente: DevolucaoCriada;
let conferindo: DevolucaoCriada;
let aguardandoNf: DevolucaoCriada;
let concluida: DevolucaoCriada;

beforeEach(async () => {
  await limparTabelas(sql);
  // Afetam a reputação, nas etapas 1, 3 e 4 do quadro.
  pendente = await devolucaoML('PENDENTE_CHEGADA', 'AFETA');
  conferindo = await devolucaoML('EM_CONFERENCIA', 'AFETA');
  aguardandoNf = await devolucaoML('AGUARDANDO_NF', 'NAO_AFETA', 'AFETA');
  // Afetam, mas fora do quadro: encerradas e "No CD do marketplace".
  concluida = await devolucaoML('CONCLUIDA', 'AFETA');
  await devolucaoML('CANCELADA', 'AFETA');
  await devolucaoML('EXTRAVIADA', 'AFETA');
  await devolucaoML('NO_CD_MARKETPLACE', 'AFETA');
  // Não afetam: o ML disse que não, não se aplica, não informou, sem reclamação, ou a mais recente já não afeta.
  await devolucaoML('PENDENTE_CHEGADA', 'NAO_AFETA');
  await devolucaoML('AGUARDANDO_CONFERENCIA', 'NAO_SE_APLICA');
  await devolucaoML('AGUARDANDO_CONFERENCIA', null);
  await devolucaoML('AGUARDANDO_CONFERENCIA');
  await devolucaoML('PENDENTE_CHEGADA', 'AFETA', 'NAO_AFETA');
});
afterAll(async () => {
  await sql.end();
});

describe('(extra) filtro "Só as que afetam a reputação no ML"', () => {
  it('traz só as em andamento cuja reclamação mais recente afeta a reputação, de todas as etapas', async () => {
    const r = await buscarDevolucoes(db, { reputacao: '1' });
    expect(r.total).toBe(3);
    expect(r.devolucoes.map((d) => d.codigo).sort()).toEqual([pendente.codigo, conferindo.codigo, aguardandoNf.codigo].sort());
    expect(r.devolucoes.every((d) => d.selos.some((s) => s.texto === 'Afeta reputação'))).toBe(true);
  });

  it('combina com os outros filtros e com a lista da etapa', async () => {
    const [rastreio] = await db.select({ rastreio: devolucoes.rastreio }).from(devolucoes).where(eq(devolucoes.id, conferindo.id));
    expect(await codigos({ reputacao: '1', rastreio: rastreio.rastreio ?? '' })).toEqual([conferindo.codigo]);
    expect(await codigos({ reputacao: '1', canal: 'SHOPEE' })).toEqual([]);
    expect(await codigos({ reputacao: '1' }, { status: ['AGUARDANDO_NF'] })).toEqual([aguardandoNf.codigo]);
  });

  it('com um Status escolhido na Busca, vale o Status (as concluídas que afetaram, por exemplo)', async () => {
    expect(await codigos({ reputacao: '1', status: 'CONCLUIDA' })).toEqual([concluida.codigo]);
    expect(await codigos({ reputacao: '1', status: 'AGUARDANDO_CONFERENCIA' })).toEqual([]);
  });

  it('o número do botão do Fluxo é o total da Busca com o filtro', async () => {
    expect(await contarAfetamReputacao(db)).toBe(3);
    expect(await contarAfetamReputacao(db)).toBe((await buscarDevolucoes(db, { reputacao: '1' })).total);
    await db.update(devolucoes).set({ status: 'CONCLUIDA' }).where(eq(devolucoes.id, pendente.id));
    expect(await contarAfetamReputacao(db)).toBe(2);
    await limparTabelas(sql);
    expect(await contarAfetamReputacao(db)).toBe(0);
  });
});
