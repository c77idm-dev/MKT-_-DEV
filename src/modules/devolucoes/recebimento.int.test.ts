import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { devolucoes } from '@/db/schema';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import { listarEventos } from '@/modules/historico/eventos';
import { criarDbTeste, limparTabelas } from '../../../tests/helpers/db';
import { criarDevolucaoTeste, criarUsuarioTeste } from '../../../tests/helpers/fabricas';
import type { DadosNovaDevolucao } from './criar';
import type { StatusDevolucao } from './dominio';
import { ErroDevolucao } from './erros';
import { criarNaoIdentificada, darChegadaPeloPedido, procurarPeloPedidoML, receberPorRastreio } from './recebimento';
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

/** Devolução do ML (cadastro manual basta aqui: o que importa é o pedido e o rastreio). */
function devolucaoML(dados: Partial<DadosNovaDevolucao>) {
  return criarDevolucaoTeste(db, operador, { canal: 'MERCADO_LIVRE', ...dados });
}
/**
 * (E27) Várias devoluções do ML com o mesmo pedido. A criação manual recusa o segundo pedido em andamento no mesmo canal;
 * pela API, cada devolução externa do mesmo pedido vira uma devolução. Aqui o pedido é trocado direto no banco.
 */
async function devolucoesDoMesmoPedido(pedido: string, quantas: number) {
  const criadas = [];
  for (let i = 0; i < quantas; i++) {
    const d = await devolucaoML({ pedido: `${pedido}-${i}` });
    await db.update(devolucoes).set({ pedidosExternos: [pedido] }).where(eq(devolucoes.id, d.id));
    criadas.push(d);
  }
  return criadas;
}
async function mudarStatus(id: string, status: StatusDevolucao) {
  await db.update(devolucoes).set({ status }).where(eq(devolucoes.id, id));
}
async function statusDe(id: string) {
  const [linha] = await db.select({ status: devolucoes.status, rastreio: devolucoes.rastreio }).from(devolucoes).where(eq(devolucoes.id, id));
  return linha;
}
async function ultimoEvento(id: string) {
  const e = (await listarEventos(db, 'devolucao', id)).at(-1);
  return e && { acao: e.acao, de: e.de, para: e.para, usuarioNome: e.usuarioNome, dados: e.dados };
}
/**
 * O banco de teste com uma ação logo antes (e outra logo depois) da transação do recebimento, ou seja, entre a busca e
 * o registro: simula a sincronização do ML (ou outra leitura) mudando o status no meio.
 */
function comAcaoNaTransacao(antes: () => Promise<void>, depois?: () => Promise<void>): typeof db {
  return new Proxy(db, {
    get(alvo, prop) {
      if (prop === 'transaction') {
        return async (fn: Parameters<typeof db.transaction>[0]) => {
          await antes();
          const resultado = await alvo.transaction(fn);
          await depois?.();
          return resultado;
        };
      }
      const valor: unknown = Reflect.get(alvo, prop, alvo);
      return typeof valor === 'function' ? valor.bind(alvo) : valor;
    },
  });
}

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

  it('devolução extraviada também fica bloqueada', async () => {
    const d = await criarDevolucaoTeste(db, operador, { rastreio: 'BR334' });
    await db.update(devolucoes).set({ status: 'EXTRAVIADA' }).where(eq(devolucoes.id, d.id));
    expect(await receberPorRastreio(db, 'BR334', operador)).toEqual({ tipo: 'bloqueada', codigo: d.codigo, status: 'EXTRAVIADA' });
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

describe('receberPorRastreio: pacote que voltou do armazém do ML (extra, emenda E25)', () => {
  it('No CD do marketplace: registra a chegada, e o histórico guarda que voltou do armazém do ML', async () => {
    const d = await criarDevolucaoTeste(db, operador, { rastreio: 'BR555' });
    await mudarStatus(d.id, 'NO_CD_MARKETPLACE');
    const agora = new Date();
    expect(await receberPorRastreio(db, 'BR555', operador, agora)).toEqual({
      tipo: 'recebidas',
      codigos: [d.codigo],
      em: agora,
      doArmazemML: [d.codigo],
    });
    const [linha] = await db.select().from(devolucoes).where(eq(devolucoes.id, d.id));
    expect(linha).toMatchObject({ status: 'AGUARDANDO_CONFERENCIA', recebidaEm: agora, recebidaPor: operador.id });
    expect(await ultimoEvento(d.id)).toEqual({
      acao: 'recebida',
      de: 'NO_CD_MARKETPLACE',
      para: 'AGUARDANDO_CONFERENCIA',
      usuarioNome: operador.nome,
      dados: { rastreio: 'BR555', voltouDoArmazemML: true },
    });
  });

  it('o Gestor também registra a chegada do pacote que voltou do armazém', async () => {
    const gestor = await criarUsuarioTeste(db, 'GESTOR');
    const d = await criarDevolucaoTeste(db, operador, { rastreio: 'BR556' });
    await mudarStatus(d.id, 'NO_CD_MARKETPLACE');
    expect(await receberPorRastreio(db, 'BR556', gestor)).toMatchObject({ tipo: 'recebidas', codigos: [d.codigo], doArmazemML: [d.codigo] });
    expect((await statusDe(d.id)).status).toBe('AGUARDANDO_CONFERENCIA');
  });

  it('duas leituras ao mesmo tempo do pacote No CD: só uma registra a chegada', async () => {
    const outro = await criarUsuarioTeste(db, 'OPERADOR');
    const d = await criarDevolucaoTeste(db, operador, { rastreio: 'BR557' });
    await mudarStatus(d.id, 'NO_CD_MARKETPLACE');
    const resultados = await Promise.all([receberPorRastreio(db, 'BR557', operador), receberPorRastreio(db, 'BR557', outro)]);
    expect(resultados.map((r) => r.tipo).sort()).toEqual(['ja_recebida', 'recebidas']);
    expect((await listarEventos(db, 'devolucao', d.id)).filter((e) => e.acao === 'recebida')).toHaveLength(1);
  });

  it('a pendente e a No CD do mesmo rastreio chegam juntas; só a No CD leva a marca do armazém', async () => {
    const a = await criarDevolucaoTeste(db, operador, { rastreio: 'BR558' });
    const b = await criarDevolucaoTeste(db, operador, { rastreio: 'BR558' });
    await mudarStatus(b.id, 'NO_CD_MARKETPLACE');
    expect(await receberPorRastreio(db, 'BR558', operador)).toMatchObject({ tipo: 'recebidas', codigos: [a.codigo, b.codigo], doArmazemML: [b.codigo] });
    expect((await ultimoEvento(a.id))?.dados).toEqual({ rastreio: 'BR558' });
    expect((await ultimoEvento(b.id))?.dados).toEqual({ rastreio: 'BR558', voltouDoArmazemML: true });
  });

  it('cancelada e extraviada continuam bloqueadas (Fale com o Gestor)', async () => {
    const c = await criarDevolucaoTeste(db, operador, { rastreio: 'BR559' });
    const e = await criarDevolucaoTeste(db, operador, { rastreio: 'BR560' });
    await mudarStatus(c.id, 'CANCELADA');
    await mudarStatus(e.id, 'EXTRAVIADA');
    expect(await receberPorRastreio(db, 'BR559', operador)).toEqual({ tipo: 'bloqueada', codigo: c.codigo, status: 'CANCELADA' });
    expect(await receberPorRastreio(db, 'BR560', operador)).toEqual({ tipo: 'bloqueada', codigo: e.codigo, status: 'EXTRAVIADA' });
    expect((await statusDe(c.id)).status).toBe('CANCELADA');
    expect((await statusDe(e.id)).status).toBe('EXTRAVIADA');
  });

  it('a sincronização do ML põe a pendente na No CD entre a busca e o registro: a chegada é registrada assim mesmo', async () => {
    const d = await criarDevolucaoTeste(db, operador, { rastreio: 'BR561' });
    const noMeio = comAcaoNaTransacao(() => mudarStatus(d.id, 'NO_CD_MARKETPLACE'));
    const agora = new Date();
    expect(await receberPorRastreio(noMeio, 'BR561', operador, agora)).toEqual({
      tipo: 'recebidas',
      codigos: [d.codigo],
      em: agora,
      doArmazemML: [d.codigo],
    });
    expect(await ultimoEvento(d.id)).toMatchObject({
      acao: 'recebida',
      de: 'NO_CD_MARKETPLACE',
      para: 'AGUARDANDO_CONFERENCIA',
      dados: { rastreio: 'BR561', voltouDoArmazemML: true },
    });
  });

  it('o reenvio da triagem volta a No CD para pendente entre a busca e o registro: a chegada é registrada assim mesmo', async () => {
    const d = await criarDevolucaoTeste(db, operador, { rastreio: 'BR562' });
    await mudarStatus(d.id, 'NO_CD_MARKETPLACE');
    const noMeio = comAcaoNaTransacao(() => mudarStatus(d.id, 'PENDENTE_CHEGADA'));
    const agora = new Date();
    expect(await receberPorRastreio(noMeio, 'BR562', operador, agora)).toEqual({ tipo: 'recebidas', codigos: [d.codigo], em: agora });
    expect(await ultimoEvento(d.id)).toMatchObject({ de: 'PENDENTE_CHEGADA', para: 'AGUARDANDO_CONFERENCIA', dados: { rastreio: 'BR562' } });
  });

  it('a sincronização do ML cancela entre a busca e o registro: fica bloqueada (Fale com o Gestor)', async () => {
    const d = await criarDevolucaoTeste(db, operador, { rastreio: 'BR563' });
    const noMeio = comAcaoNaTransacao(() => mudarStatus(d.id, 'CANCELADA'));
    expect(await receberPorRastreio(noMeio, 'BR563', operador)).toEqual({ tipo: 'bloqueada', codigo: d.codigo, status: 'CANCELADA' });
    expect((await statusDe(d.id)).status).toBe('CANCELADA');
  });

  it('(defensivo) nada registrado e a devolução de novo sem chegada: pede para ler de novo, em vez de dizer que já chegou', async () => {
    const d = await criarDevolucaoTeste(db, operador, { rastreio: 'BR564' });
    const noMeio = comAcaoNaTransacao(
      () => mudarStatus(d.id, 'AGUARDANDO_CONFERENCIA'),
      () => mudarStatus(d.id, 'PENDENTE_CHEGADA'),
    );
    await expect(receberPorRastreio(noMeio, 'BR564', operador)).rejects.toThrow(
      new ErroDevolucao('A situação desta devolução mudou agora. Leia o pacote de novo.'),
    );
  });
});

describe('receberPorRastreio: outros números da etiqueta do ML (extra, emenda E25)', () => {
  it('o rastreio exato vem primeiro: o mesmo número no rastreio de uma e no envio de outra recebe só a do rastreio', async () => {
    const porRastreio = await criarDevolucaoTeste(db, operador, { rastreio: '48515208229' });
    const porEnvio = await devolucaoML({ rastreio: 'MM48515208229BRSP02' });
    const agora = new Date();
    expect(await receberPorRastreio(db, '48515208229', operador, agora)).toEqual({ tipo: 'recebidas', codigos: [porRastreio.codigo], em: agora });
    expect((await statusDe(porEnvio.id)).status).toBe('PENDENTE_CHEGADA');
  });

  it('o rastreio exato que já chegou responde "já chegou" e não procura nos pedidos nem nos envios', async () => {
    const porRastreio = await criarDevolucaoTeste(db, operador, { rastreio: '2000011112222333' });
    const agora = new Date();
    await receberPorRastreio(db, '2000011112222333', operador, agora);
    const porPedido = await devolucaoML({ pedido: '2000011112222333' });
    expect(await receberPorRastreio(db, '2000011112222333', operador)).toEqual({
      tipo: 'ja_recebida',
      codigo: porRastreio.codigo,
      status: 'AGUARDANDO_CONFERENCIA',
      recebidaEm: agora,
    });
    expect((await statusDe(porPedido.id)).status).toBe('PENDENTE_CHEGADA');
  });

  it('(E27) pelo número do pedido do ML: acha a devolução, mas NÃO registra a chegada sozinha (a pessoa escolhe)', async () => {
    const d = await devolucaoML({ pedido: '2000018992531744', rastreio: 'MM48351759365BRSP06' });
    expect(await receberPorRastreio(db, ' 2000018992531744 ', operador)).toEqual({
      tipo: 'escolher',
      codigoLido: '2000018992531744',
      ids: [d.id],
      achadaPor: 'PEDIDO_ML',
    });
    expect(await statusDe(d.id)).toEqual({ status: 'PENDENTE_CHEGADA', rastreio: 'MM48351759365BRSP06' });
    expect((await listarEventos(db, 'devolucao', d.id)).filter((e) => e.acao === 'recebida')).toHaveLength(0);
  });

  it('pedido com 15 dígitos: vale com o "2" na frente (caso real: a etiqueta da DEV-000071 trazia 000018992531744)', async () => {
    const d = await devolucaoML({ pedido: '2000018992531744', rastreio: 'MM48351759365BRSP06' });
    await mudarStatus(d.id, 'NO_CD_MARKETPLACE');
    expect(await receberPorRastreio(db, '000018992531744', operador)).toEqual({
      tipo: 'escolher',
      codigoLido: '000018992531744',
      ids: [d.id],
      achadaPor: 'PEDIDO_ML',
    });
    expect((await statusDe(d.id)).status).toBe('NO_CD_MARKETPLACE');
  });

  it('o pedido é comparado inteiro: um pedaço do número ou o número com um dígito a mais não acha', async () => {
    const d = await devolucaoML({ pedido: '2000018992531744', rastreio: 'MM48351759365BRSP06' });
    for (const codigo of ['200001899253174', '18992531744', '20000189925317440', '00018992531744']) {
      expect(await receberPorRastreio(db, codigo, operador)).toEqual({ tipo: 'nao_encontrada', rastreio: codigo });
    }
    expect((await statusDe(d.id)).status).toBe('PENDENTE_CHEGADA');
  });

  it('pelo número do envio do ML dentro do rastreio do Mercado Envios (MM…BR… e MEL…FM…)', async () => {
    const mm = await devolucaoML({ rastreio: 'MM48503476449BRSP02' });
    const mel = await devolucaoML({ rastreio: 'MEL48249814112FMDOR01' });
    const agora = new Date();
    expect(await receberPorRastreio(db, '48503476449', operador, agora)).toEqual({ tipo: 'recebidas', codigos: [mm.codigo], em: agora, achadaPor: 'ENVIO_ML' });
    expect((await ultimoEvento(mm.id))?.dados).toEqual({ codigoLido: '48503476449', achadaPor: 'ENVIO_ML' });
    expect(await receberPorRastreio(db, '48249814112', operador)).toMatchObject({ tipo: 'recebidas', codigos: [mel.codigo], achadaPor: 'ENVIO_ML' });
    expect((await statusDe(mel.id)).status).toBe('AGUARDANDO_CONFERENCIA');
  });

  it('o número do envio que só aparece dentro de outro número não acha nada', async () => {
    const outras = [
      await devolucaoML({ rastreio: 'MM148515208229BRSP02' }),
      await devolucaoML({ rastreio: 'MM485152082291BRSP02' }),
      await devolucaoML({ rastreio: 'MM48506668229BRSP02' }),
      await devolucaoML({ pedido: '248515208229', rastreio: 'AP706547292BR' }),
    ];
    expect(await receberPorRastreio(db, '48515208229', operador)).toEqual({ tipo: 'nao_encontrada', rastreio: '48515208229' });
    for (const d of outras) expect((await statusDe(d.id)).status).toBe('PENDENTE_CHEGADA');
  });

  it('o pedido só é procurado nas devoluções do ML: a de outro canal com o mesmo número não é achada', async () => {
    const magalu = await criarDevolucaoTeste(db, operador, { canal: 'MAGALU', pedido: '2000018992531744' });
    for (const codigo of ['2000018992531744', '000018992531744']) {
      expect(await receberPorRastreio(db, codigo, operador)).toEqual({ tipo: 'nao_encontrada', rastreio: codigo });
    }
    expect((await statusDe(magalu.id)).status).toBe('PENDENTE_CHEGADA');
  });

  it('o mesmo pedido no ML e em outro canal: só a do ML é achada', async () => {
    const ml = await devolucaoML({ pedido: '2000044443333222' });
    const tiktok = await criarDevolucaoTeste(db, operador, { canal: 'TIKTOK_SHOP', pedido: '2000044443333222' });
    expect(await receberPorRastreio(db, '2000044443333222', operador)).toEqual({
      tipo: 'escolher',
      codigoLido: '2000044443333222',
      ids: [ml.id],
      achadaPor: 'PEDIDO_ML',
    });
    expect((await statusDe(tiktok.id)).status).toBe('PENDENTE_CHEGADA');
  });

  it('o envio só é procurado nos rastreios das devoluções do ML', async () => {
    const shopee = await criarDevolucaoTeste(db, operador, { canal: 'SHOPEE', rastreio: 'MM48503476449BRSP02' });
    expect(await receberPorRastreio(db, '48503476449', operador)).toEqual({ tipo: 'nao_encontrada', rastreio: '48503476449' });
    expect((await statusDe(shopee.id)).status).toBe('PENDENTE_CHEGADA');
  });

  it('com letra no código as regras novas não valem', async () => {
    const d = await devolucaoML({ pedido: 'ABC123', rastreio: 'MM48515208229BRSP02' });
    for (const codigo of ['ABC123', '48515208229BR', 'MM48515208229']) {
      expect(await receberPorRastreio(db, codigo, operador)).toEqual({ tipo: 'nao_encontrada', rastreio: codigo });
    }
    expect((await statusDe(d.id)).status).toBe('PENDENTE_CHEGADA');
  });

  it('(E27) várias devoluções do mesmo pedido: lista só as que esperam o pacote (pendente e No CD), sem registrar nenhuma', async () => {
    const PEDIDO = '2000099998888777';
    const [a, b, c, e] = await devolucoesDoMesmoPedido(PEDIDO, 4);
    await mudarStatus(b.id, 'NO_CD_MARKETPLACE');
    await mudarStatus(c.id, 'CONCLUIDA');
    await mudarStatus(e.id, 'CANCELADA');
    expect(await receberPorRastreio(db, PEDIDO, operador)).toEqual({ tipo: 'escolher', codigoLido: PEDIDO, ids: [a.id, b.id], achadaPor: 'PEDIDO_ML' });
    expect((await statusDe(a.id)).status).toBe('PENDENTE_CHEGADA');
    expect((await statusDe(b.id)).status).toBe('NO_CD_MARKETPLACE');
    expect((await statusDe(c.id)).status).toBe('CONCLUIDA');
  });

  it('achada pelo pedido mas já recebida: avisa que já chegou e diz por onde achou', async () => {
    const d = await devolucaoML({ pedido: '2000077776666555' });
    const agora = new Date();
    await darChegadaPeloPedido(db, { devolucaoId: d.id, codigoLido: '2000077776666555' }, operador, agora);
    expect(await receberPorRastreio(db, '000077776666555', operador)).toEqual({
      tipo: 'ja_recebida',
      codigo: d.codigo,
      status: 'AGUARDANDO_CONFERENCIA',
      recebidaEm: agora,
      achadaPor: 'PEDIDO_ML',
    });
  });

  it('achada pelo pedido ou pelo envio, mas cancelada ou extraviada: continua bloqueada', async () => {
    const c = await devolucaoML({ pedido: '2000055554444333' });
    const e = await devolucaoML({ rastreio: 'MM40000000001BRSP02' });
    await mudarStatus(c.id, 'CANCELADA');
    await mudarStatus(e.id, 'EXTRAVIADA');
    expect(await receberPorRastreio(db, '2000055554444333', operador)).toEqual({
      tipo: 'bloqueada',
      codigo: c.codigo,
      status: 'CANCELADA',
      achadaPor: 'PEDIDO_ML',
    });
    expect(await receberPorRastreio(db, '40000000001', operador)).toEqual({ tipo: 'bloqueada', codigo: e.codigo, status: 'EXTRAVIADA', achadaPor: 'ENVIO_ML' });
  });

  it('(E27) achada pelo pedido, uma esperando e outra cancelada: a cancelada fica fora da escolha', async () => {
    const PEDIDO = '2000012121212121';
    const [cancelada, pendente] = await devolucoesDoMesmoPedido(PEDIDO, 2);
    await mudarStatus(cancelada.id, 'CANCELADA');
    expect(await receberPorRastreio(db, PEDIDO, operador)).toEqual({ tipo: 'escolher', codigoLido: PEDIDO, ids: [pendente.id], achadaPor: 'PEDIDO_ML' });
  });
});

describe('darChegadaPeloPedido: "Dar chegada" numa devolução escolhida (extra, emenda E27)', () => {
  it('registra a chegada só da devolução tocada, com o código lido e por onde achou no histórico; a outra do pedido continua esperando', async () => {
    const PEDIDO = '2000018992531744';
    const [a, b] = await devolucoesDoMesmoPedido(PEDIDO, 2);
    const agora = new Date();
    expect(await darChegadaPeloPedido(db, { devolucaoId: b.id, codigoLido: ' 000018992531744 ' }, operador, agora)).toEqual({
      tipo: 'recebidas',
      codigos: [b.codigo],
      em: agora,
      achadaPor: 'PEDIDO_ML',
    });
    const [linha] = await db.select().from(devolucoes).where(eq(devolucoes.id, b.id));
    expect(linha).toMatchObject({ status: 'AGUARDANDO_CONFERENCIA', recebidaEm: agora, recebidaPor: operador.id });
    expect(await ultimoEvento(b.id)).toEqual({
      acao: 'recebida',
      de: 'PENDENTE_CHEGADA',
      para: 'AGUARDANDO_CONFERENCIA',
      usuarioNome: operador.nome,
      dados: { codigoLido: '000018992531744', achadaPor: 'PEDIDO_ML' },
    });
    expect((await statusDe(a.id)).status).toBe('PENDENTE_CHEGADA');
    // A lista do pedido agora só tem a outra.
    expect(await receberPorRastreio(db, PEDIDO, operador)).toMatchObject({ tipo: 'escolher', ids: [a.id] });
  });

  it('No CD do marketplace: vai para Aguardando conferência e o histórico guarda que voltou do armazém do ML', async () => {
    const d = await devolucaoML({ pedido: '2000018992531745' });
    await mudarStatus(d.id, 'NO_CD_MARKETPLACE');
    const agora = new Date();
    expect(await darChegadaPeloPedido(db, { devolucaoId: d.id, codigoLido: '2000018992531745' }, operador, agora)).toEqual({
      tipo: 'recebidas',
      codigos: [d.codigo],
      em: agora,
      achadaPor: 'PEDIDO_ML',
      doArmazemML: [d.codigo],
    });
    expect(await ultimoEvento(d.id)).toMatchObject({
      de: 'NO_CD_MARKETPLACE',
      para: 'AGUARDANDO_CONFERENCIA',
      dados: { codigoLido: '2000018992531745', achadaPor: 'PEDIDO_ML', voltouDoArmazemML: true },
    });
  });

  it('o Gestor também dá a chegada', async () => {
    const gestor = await criarUsuarioTeste(db, 'GESTOR');
    const d = await devolucaoML({ pedido: '2000018992531746' });
    expect(await darChegadaPeloPedido(db, { devolucaoId: d.id, codigoLido: '2000018992531746' }, gestor)).toMatchObject({ tipo: 'recebidas' });
  });

  it('dois toques ao mesmo tempo (dois celulares): só um registra a chegada e grava um evento', async () => {
    const outro = await criarUsuarioTeste(db, 'OPERADOR');
    const d = await devolucaoML({ pedido: '2000033332222111' });
    await mudarStatus(d.id, 'NO_CD_MARKETPLACE');
    const resultados = await Promise.all([
      darChegadaPeloPedido(db, { devolucaoId: d.id, codigoLido: '2000033332222111' }, operador),
      darChegadaPeloPedido(db, { devolucaoId: d.id, codigoLido: '000033332222111' }, outro),
    ]);
    expect(resultados.map((r) => r.tipo).sort()).toEqual(['ja_recebida', 'recebidas']);
    expect((await listarEventos(db, 'devolucao', d.id)).filter((e) => e.acao === 'recebida')).toHaveLength(1);
  });

  it('a segunda vez responde "já chegou", com a data da chegada', async () => {
    const d = await devolucaoML({ pedido: '2000033332222112' });
    const agora = new Date();
    await darChegadaPeloPedido(db, { devolucaoId: d.id, codigoLido: '2000033332222112' }, operador, agora);
    expect(await darChegadaPeloPedido(db, { devolucaoId: d.id, codigoLido: '2000033332222112' }, operador)).toEqual({
      tipo: 'ja_recebida',
      codigo: d.codigo,
      status: 'AGUARDANDO_CONFERENCIA',
      recebidaEm: agora,
      achadaPor: 'PEDIDO_ML',
    });
  });

  it('cancelada ou extraviada (por exemplo, pela sincronização depois de a ficha abrir): bloqueada, nada muda', async () => {
    const c = await devolucaoML({ pedido: '2000055554444331' });
    const e = await devolucaoML({ pedido: '2000055554444332' });
    await mudarStatus(c.id, 'CANCELADA');
    await mudarStatus(e.id, 'EXTRAVIADA');
    expect(await darChegadaPeloPedido(db, { devolucaoId: c.id, codigoLido: '2000055554444331' }, operador)).toEqual({
      tipo: 'bloqueada',
      codigo: c.codigo,
      status: 'CANCELADA',
      achadaPor: 'PEDIDO_ML',
    });
    expect(await darChegadaPeloPedido(db, { devolucaoId: e.id, codigoLido: '2000055554444332' }, operador)).toEqual({
      tipo: 'bloqueada',
      codigo: e.codigo,
      status: 'EXTRAVIADA',
      achadaPor: 'PEDIDO_ML',
    });
    expect((await statusDe(c.id)).status).toBe('CANCELADA');
    expect((await statusDe(e.id)).status).toBe('EXTRAVIADA');
    expect((await listarEventos(db, 'devolucao', c.id)).filter((x) => x.acao === 'recebida')).toHaveLength(0);
  });

  it('a sincronização troca pendente por No CD entre a ficha e o toque: vale o status de agora', async () => {
    const d = await devolucaoML({ pedido: '2000055554444334' });
    const noMeio = comAcaoNaTransacao(() => mudarStatus(d.id, 'NO_CD_MARKETPLACE'));
    expect(await darChegadaPeloPedido(noMeio, { devolucaoId: d.id, codigoLido: '2000055554444334' }, operador)).toMatchObject({
      tipo: 'recebidas',
      doArmazemML: [d.codigo],
    });
    expect(await ultimoEvento(d.id)).toMatchObject({ de: 'NO_CD_MARKETPLACE', dados: { voltouDoArmazemML: true } });
  });

  it('nunca registra a devolução de outro pedido ou de outro canal (o id veio da tela, o pedido é conferido de novo)', async () => {
    const outroPedido = await devolucaoML({ pedido: '2000066665555444' });
    const shopee = await criarDevolucaoTeste(db, operador, { canal: 'SHOPEE', pedido: '2000066665555443' });
    const mensagem = new ErroDevolucao('Esta devolução não é deste pedido. Leia o número do pedido de novo.');
    await expect(darChegadaPeloPedido(db, { devolucaoId: outroPedido.id, codigoLido: '2000066665555443' }, operador)).rejects.toThrow(mensagem);
    await expect(darChegadaPeloPedido(db, { devolucaoId: shopee.id, codigoLido: '2000066665555443' }, operador)).rejects.toThrow(mensagem);
    // Um pedaço do número também não vale.
    await expect(darChegadaPeloPedido(db, { devolucaoId: outroPedido.id, codigoLido: '66665555444' }, operador)).rejects.toThrow(mensagem);
    expect((await statusDe(outroPedido.id)).status).toBe('PENDENTE_CHEGADA');
    expect((await statusDe(shopee.id)).status).toBe('PENDENTE_CHEGADA');
  });

  it('recusa código com letras, id que não existe e o perfil Fiscal, com mensagem para a tela', async () => {
    const d = await devolucaoML({ pedido: '2000066665555445' });
    await expect(darChegadaPeloPedido(db, { devolucaoId: d.id, codigoLido: 'BR2000066665555445' }, operador)).rejects.toThrow(
      new ErroDevolucao('Leia o número do pedido de novo.'),
    );
    await expect(darChegadaPeloPedido(db, { devolucaoId: 'nao-e-uuid', codigoLido: '2000066665555445' }, operador)).rejects.toThrow(
      new ErroDevolucao('Devolução não encontrada.'),
    );
    await expect(
      darChegadaPeloPedido(db, { devolucaoId: '00000000-0000-4000-8000-000000000000', codigoLido: '2000066665555445' }, operador),
    ).rejects.toThrow(new ErroDevolucao('Devolução não encontrada.'));
    const fiscal = await criarUsuarioTeste(db, 'FISCAL');
    const erro = await darChegadaPeloPedido(db, { devolucaoId: d.id, codigoLido: '2000066665555445' }, fiscal).catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(ErroTransicao);
    expect((erro as Error).message).toBe('Seu perfil não pode registrar o recebimento de pacotes.');
    expect((await statusDe(d.id)).status).toBe('PENDENTE_CHEGADA');
  });

  it('pela Retirada do Full: o histórico guarda o código da retirada', async () => {
    const d = await devolucaoML({ pedido: '2000066665555446' });
    await darChegadaPeloPedido(db, { devolucaoId: d.id, codigoLido: '2000066665555446', retiradaFull: 'RF-000007' }, operador);
    expect((await ultimoEvento(d.id))?.dados).toEqual({ codigoLido: '2000066665555446', achadaPor: 'PEDIDO_ML', retiradaFull: 'RF-000007' });
  });
});

describe('procurarPeloPedidoML: só o número do pedido (Retirada do Full, extra, emenda E27)', () => {
  it('acha as que esperam o pacote; sem nenhuma esperando, diz se já chegou ou se está bloqueada', async () => {
    const [a, b] = await devolucoesDoMesmoPedido('2000077770000001', 2);
    expect(await procurarPeloPedidoML(db, ' 2000077770000001 ', operador)).toEqual({
      tipo: 'escolher',
      codigoLido: '2000077770000001',
      ids: [a.id, b.id],
      achadaPor: 'PEDIDO_ML',
    });
    await mudarStatus(a.id, 'CANCELADA');
    await mudarStatus(b.id, 'CANCELADA');
    expect(await procurarPeloPedidoML(db, '2000077770000001', operador)).toMatchObject({ tipo: 'bloqueada', codigo: b.codigo, achadaPor: 'PEDIDO_ML' });
    await mudarStatus(b.id, 'AGUARDANDO_CONFERENCIA');
    expect(await procurarPeloPedidoML(db, '000077770000001', operador)).toMatchObject({ tipo: 'ja_recebida', codigo: b.codigo, achadaPor: 'PEDIDO_ML' });
  });

  it('não procura pelo rastreio nem pelo envio; recusa letras e vazio', async () => {
    await devolucaoML({ pedido: 'P-X', rastreio: 'MM48503476449BRSP02' });
    await criarDevolucaoTeste(db, operador, { rastreio: '2000077770000002' });
    expect(await procurarPeloPedidoML(db, '48503476449', operador)).toEqual({ tipo: 'nao_encontrada', rastreio: '48503476449' });
    expect(await procurarPeloPedidoML(db, '2000077770000002', operador)).toEqual({ tipo: 'nao_encontrada', rastreio: '2000077770000002' });
    await expect(procurarPeloPedidoML(db, '  ', operador)).rejects.toThrow(new ErroDevolucao('Digite o número do pedido.'));
    await expect(procurarPeloPedidoML(db, 'AB12', operador)).rejects.toThrow(new ErroDevolucao('O número do pedido tem só algarismos.'));
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

  it('duas leituras ao mesmo tempo de um rastreio novo: uma cria, a outra recusa, e existe uma linha só', async () => {
    const outro = await criarUsuarioTeste(db, 'OPERADOR');
    const resultados = await Promise.allSettled([criarNaoIdentificada(db, 'NN-RACE', operador), criarNaoIdentificada(db, 'NN-RACE', outro)]);
    expect(resultados.map((r) => r.status).sort()).toEqual(['fulfilled', 'rejected']);
    const rejeitada = resultados.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(rejeitada.reason).toBeInstanceOf(ErroDevolucao);
    const linhas = await db.select({ id: devolucoes.id }).from(devolucoes).where(eq(devolucoes.rastreio, 'NN-RACE'));
    expect(linhas).toHaveLength(1);
  });

  it('o perfil Fiscal recebe mensagem para a tela', async () => {
    const fiscal = await criarUsuarioTeste(db, 'FISCAL');
    await expect(criarNaoIdentificada(db, 'NN1', fiscal)).rejects.toThrow('Seu perfil não pode registrar um pacote não identificado.');
  });
});
