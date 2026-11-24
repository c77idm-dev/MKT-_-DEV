import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { devolucoes } from '@/db/schema';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import type { StatusDevolucao } from '@/modules/devolucoes/dominio';
import { criarDbTeste, limparTabelas } from '../../../tests/helpers/db';
import { criarDevolucaoTeste, criarUsuarioTeste } from '../../../tests/helpers/fabricas';
import { criarDevolucaoChegada } from '../../../tests/helpers/fabricas-conferencia';
import { ErroConferencia } from './erros';
import { localizarParaConferencia } from './localizar';

const { db, sql } = criarDbTeste();
let operador: UsuarioSessao;
beforeEach(async () => {
  await limparTabelas(sql);
  operador = await criarUsuarioTeste(db, 'OPERADOR');
});
afterAll(async () => {
  await sql.end();
});

const NAO_ACHOU =
  'Nenhuma devolução com este código de rastreamento ou número do pedido do ML. Use o código DEV ou abra a devolução pela lista da etapa 2.';

describe('localizarParaConferencia ("Conferir pacote", extra)', () => {
  it('acha pelo código DEV ou pelo rastreio lido na etiqueta', async () => {
    const d = await criarDevolucaoChegada(db, operador, { rastreio: 'BR123456789BR' });
    expect(await localizarParaConferencia(db, d.codigo.toLowerCase(), operador)).toEqual({ tipo: 'devolucao', id: d.id, codigo: d.codigo });
    expect(await localizarParaConferencia(db, ' br 123 456 789 br ', operador)).toEqual({ tipo: 'devolucao', id: d.id, codigo: d.codigo });
  });

  it('explica quando não dá', async () => {
    await expect(localizarParaConferencia(db, '  ', operador)).rejects.toThrow(
      'Leia ou digite o código de rastreamento, o código DEV ou o número do pedido do ML (extra).',
    );
    // (extra, E27) A mensagem cita também o número do pedido do ML, que o Conferir pacote passou a aceitar.
    await expect(localizarParaConferencia(db, 'BRNADA', operador)).rejects.toThrow(new ErroConferencia(NAO_ACHOU));
    const pendente = await criarDevolucaoTeste(db, operador, { rastreio: 'BRPENDENTE' });
    await expect(localizarParaConferencia(db, 'BRPENDENTE', operador)).rejects.toThrow(`${pendente.codigo} está pendente de chegada. Registre a chegada no Recebimento primeiro.`);
    // (extra) A No CD também chega pelo Recebimento (E25), e a sigla "CD" fica.
    const noCd = await criarDevolucaoTeste(db, operador, { rastreio: 'BRNOCD' });
    await db.update(devolucoes).set({ status: 'NO_CD_MARKETPLACE' }).where(eq(devolucoes.id, noCd.id));
    await expect(localizarParaConferencia(db, 'BRNOCD', operador)).rejects.toThrow(
      new ErroConferencia(`${noCd.codigo} está no CD do marketplace. Registre a chegada no Recebimento primeiro.`),
    );
  });

  it('mesmo rastreio em duas devoluções abertas (o mesmo pacote, Fase 1 decisão 8): pede para escolher pela lista', async () => {
    await criarDevolucaoChegada(db, operador, { rastreio: 'BRDUPLO' });
    const segunda = await criarDevolucaoChegada(db, operador, { rastreio: 'BRDUPLO' });
    await expect(localizarParaConferencia(db, 'BRDUPLO', operador)).rejects.toThrow(/tem 2 devoluções/);
    await db.update(devolucoes).set({ status: 'CANCELADA' }).where(eq(devolucoes.id, segunda.id));
    await expect(localizarParaConferencia(db, 'BRDUPLO', operador)).resolves.toMatchObject({ tipo: 'devolucao', codigo: expect.stringMatching(/^DEV-/) });
  });
});

describe('localizarParaConferencia pelo número do pedido do ML (extra, emenda E27)', () => {
  /** Devoluções do ML com o mesmo pedido (pela API, cada devolução externa do pedido vira uma). */
  async function doPedido(pedido: string, status: StatusDevolucao[]) {
    const criadas = [];
    for (const [i, s] of status.entries()) {
      const d = await criarDevolucaoChegada(db, operador, { canal: 'MERCADO_LIVRE', pedido: `${pedido}-${i}` });
      await db.update(devolucoes).set({ pedidosExternos: [pedido], status: s }).where(eq(devolucoes.id, d.id));
      criadas.push(d);
    }
    return criadas;
  }

  it('uma devolução aberta: a ficha para "Iniciar conferência" (não abre sozinha)', async () => {
    const [d] = await doPedido('2000018992531744', ['AGUARDANDO_CONFERENCIA']);
    expect(await localizarParaConferencia(db, ' 2000018992531744 ', operador)).toEqual({ tipo: 'pedido', codigoLido: '2000018992531744', ids: [d.id] });
    // 15 dígitos: vale com o "2" na frente, como no Recebimento.
    expect(await localizarParaConferencia(db, '000018992531744', operador)).toEqual({ tipo: 'pedido', codigoLido: '000018992531744', ids: [d.id] });
  });

  it('mais de uma aberta (aguardando ou em conferência): a lista, só com as abertas', async () => {
    const [a, b, c] = await doPedido('2000018992531745', ['AGUARDANDO_CONFERENCIA', 'EM_CONFERENCIA', 'CONCLUIDA']);
    void c;
    expect(await localizarParaConferencia(db, '2000018992531745', operador)).toEqual({ tipo: 'pedido', codigoLido: '2000018992531745', ids: [a.id, b.id] });
  });

  it('nenhuma aberta: diz como está a mais recente, achada pelo número do pedido (a que espera o pacote pede a chegada primeiro)', async () => {
    const [, pendente] = await doPedido('2000018992531746', ['CONCLUIDA', 'PENDENTE_CHEGADA']);
    await expect(localizarParaConferencia(db, '2000018992531746', operador)).rejects.toThrow(
      new ErroConferencia(
        `${pendente.codigo} está pendente de chegada. Registre a chegada no Recebimento primeiro. Achada pelo número do pedido do ML (extra).`,
      ),
    );
    const [, noCd] = await doPedido('2000018992531749', ['CONCLUIDA', 'NO_CD_MARKETPLACE']);
    await expect(localizarParaConferencia(db, '2000018992531749', operador)).rejects.toThrow(
      new ErroConferencia(`${noCd.codigo} está no CD do marketplace. Registre a chegada no Recebimento primeiro. Achada pelo número do pedido do ML (extra).`),
    );
    const [, concluida] = await doPedido('2000018992531750', ['CANCELADA', 'CONCLUIDA']);
    await expect(localizarParaConferencia(db, '2000018992531750', operador)).rejects.toThrow(
      new ErroConferencia(`${concluida.codigo} está concluída. Achada pelo número do pedido do ML (extra).`),
    );
  });

  it('só no canal ML e só o número inteiro; o rastreio vem primeiro', async () => {
    const shopee = await criarDevolucaoChegada(db, operador, { canal: 'SHOPEE', pedido: '2000018992531747' });
    void shopee;
    await expect(localizarParaConferencia(db, '2000018992531747', operador)).rejects.toThrow(new ErroConferencia(NAO_ACHOU));
    await doPedido('2000018992531748', ['AGUARDANDO_CONFERENCIA']);
    await expect(localizarParaConferencia(db, '18992531748', operador)).rejects.toThrow(new ErroConferencia(NAO_ACHOU));
    const porRastreio = await criarDevolucaoChegada(db, operador, { rastreio: '2000018992531748' });
    expect(await localizarParaConferencia(db, '2000018992531748', operador)).toEqual({ tipo: 'devolucao', id: porRastreio.id, codigo: porRastreio.codigo });
  });
});
