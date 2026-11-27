import { count, eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { devolucoes } from '@/db/schema';
import { aplicarReclamacao, type ResultadoAplicacao } from '@/modules/mercado-livre/sincronizar';
import { criarDbTeste, limparTabelas } from '../../../tests/helpers/db';
import { criarDevolucaoTeste, criarUsuarioTeste } from '../../../tests/helpers/fabricas';
import { dadosDevolucaoMLTeste, devolucaoExternaTeste } from '../../../tests/helpers/fabricas-ml';

const { db, sql } = criarDbTeste();
const AGORA = new Date('2026-11-27T15:00:00Z');
const DEPOIS = new Date('2026-11-27T16:00:00Z');

beforeEach(() => limparTabelas(sql));
afterAll(() => sql.end());

function idDe(r: ResultadoAplicacao): string {
  if (!('devolucaoId' in r)) throw new Error(`esperava uma devolução, veio ${r.acao}`);
  return r.devolucaoId;
}
async function totalDevolucoes(): Promise<number> {
  const [{ total }] = await db.select({ total: count() }).from(devolucoes);
  return total;
}

describe('sincronização do ML com a devolução apagada (E29)', () => {
  it('a reclamação da devolução apagada chega de novo: acha a mesma linha, não cria outra e ela continua apagada', async () => {
    const gestor = await criarUsuarioTeste(db, 'GESTOR');
    const externa = devolucaoExternaTeste();
    const id = idDe(await aplicarReclamacao(db, dadosDevolucaoMLTeste(externa), AGORA));
    await db.update(devolucoes).set({ apagadaEm: AGORA, apagadaPor: gestor.id }).where(eq(devolucoes.id, id));

    // O ML mudou o status e o prazo: a linha é atualizada, escondida.
    const mudada = { ...externa, statusCanal: 'delivered/delivered', entregueEm: AGORA };
    const r = await aplicarReclamacao(db, dadosDevolucaoMLTeste(mudada), DEPOIS);
    expect(r).toMatchObject({ acao: 'atualizada', devolucaoId: id });
    expect(await totalDevolucoes()).toBe(1);
    const [linha] = await db.select().from(devolucoes).where(eq(devolucoes.id, id));
    expect(linha).toMatchObject({ apagadaEm: AGORA, apagadaPor: gestor.id, statusCanal: 'delivered/delivered' });
  });

  it('a devolução manual apagada do mesmo pedido não recebe a reclamação nova: a sincronização a ignora e cria a do ML', async () => {
    const operador = await criarUsuarioTeste(db, 'OPERADOR');
    const manual = await criarDevolucaoTeste(db, operador, { canal: 'MERCADO_LIVRE', pedido: 'PED-MANUAL-APAGADA' });
    await db.update(devolucoes).set({ apagadaEm: AGORA }).where(eq(devolucoes.id, manual.id));
    const externa = devolucaoExternaTeste({ pedidos: ['PED-MANUAL-APAGADA'] });
    const r = await aplicarReclamacao(db, dadosDevolucaoMLTeste(externa), DEPOIS);
    expect(r).toMatchObject({ acao: 'criada' });
    expect(idDe(r)).not.toBe(manual.id);
    const [escondida] = await db.select().from(devolucoes).where(eq(devolucoes.id, manual.id));
    expect(escondida).toMatchObject({ devolucaoExternaId: null, apagadaEm: AGORA });
  });
});
