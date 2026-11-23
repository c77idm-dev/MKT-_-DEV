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

/** Devolução do ML (cadastro manual basta aqui: o que importa é o pedido e o rastreio). */
function devolucaoML(dados: Partial<DadosNovaDevolucao>) {
  return criarDevolucaoTeste(db, operador, { canal: 'MERCADO_LIVRE', ...dados });
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

  it('pelo número do pedido do ML: registra a chegada, diz por onde achou e guarda o código lido no histórico', async () => {
    const d = await devolucaoML({ pedido: '2000018992531744', rastreio: 'MM48351759365BRSP06' });
    const agora = new Date();
    expect(await receberPorRastreio(db, ' 2000018992531744 ', operador, agora)).toEqual({
      tipo: 'recebidas',
      codigos: [d.codigo],
      em: agora,
      achadaPor: 'PEDIDO_ML',
    });
    const [linha] = await db.select().from(devolucoes).where(eq(devolucoes.id, d.id));
    // O rastreio guardado não muda: o código lido foi o do pedido.
    expect(linha).toMatchObject({ status: 'AGUARDANDO_CONFERENCIA', rastreio: 'MM48351759365BRSP06', recebidaEm: agora, recebidaPor: operador.id });
    expect(await ultimoEvento(d.id)).toEqual({
      acao: 'recebida',
      de: 'PENDENTE_CHEGADA',
      para: 'AGUARDANDO_CONFERENCIA',
      usuarioNome: operador.nome,
      dados: { codigoLido: '2000018992531744', achadaPor: 'PEDIDO_ML' },
    });
  });

  it('pedido com 15 dígitos: vale com o "2" na frente (caso real: a etiqueta da DEV-000071 trazia 000018992531744)', async () => {
    const d = await devolucaoML({ pedido: '2000018992531744', rastreio: 'MM48351759365BRSP06' });
    await mudarStatus(d.id, 'NO_CD_MARKETPLACE');
    expect(await receberPorRastreio(db, '000018992531744', operador)).toMatchObject({
      tipo: 'recebidas',
      codigos: [d.codigo],
      achadaPor: 'PEDIDO_ML',
      doArmazemML: [d.codigo],
    });
    expect(await ultimoEvento(d.id)).toMatchObject({
      de: 'NO_CD_MARKETPLACE',
      para: 'AGUARDANDO_CONFERENCIA',
      dados: { codigoLido: '000018992531744', achadaPor: 'PEDIDO_ML', voltouDoArmazemML: true },
    });
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

  it('o mesmo pedido no ML e em outro canal: só a do ML é recebida', async () => {
    const ml = await devolucaoML({ pedido: '2000044443333222' });
    const tiktok = await criarDevolucaoTeste(db, operador, { canal: 'TIKTOK_SHOP', pedido: '2000044443333222' });
    const agora = new Date();
    expect(await receberPorRastreio(db, '2000044443333222', operador, agora)).toEqual({
      tipo: 'recebidas',
      codigos: [ml.codigo],
      em: agora,
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

  it('várias devoluções do mesmo pedido: todas as pendentes e No CD chegam juntas; a concluída fica como está', async () => {
    const PEDIDO = '2000099998888777';
    const a = await devolucaoML({ pedido: 'P-A' });
    const b = await devolucaoML({ pedido: 'P-B' });
    const c = await devolucaoML({ pedido: 'P-C' });
    for (const d of [a, b, c]) await db.update(devolucoes).set({ pedidosExternos: [PEDIDO] }).where(eq(devolucoes.id, d.id));
    await mudarStatus(b.id, 'NO_CD_MARKETPLACE');
    await mudarStatus(c.id, 'CONCLUIDA');
    expect(await receberPorRastreio(db, PEDIDO, operador)).toMatchObject({
      tipo: 'recebidas',
      codigos: [a.codigo, b.codigo],
      achadaPor: 'PEDIDO_ML',
      doArmazemML: [b.codigo],
    });
    expect((await statusDe(c.id)).status).toBe('CONCLUIDA');
  });

  it('achada pelo pedido mas já recebida: avisa que já chegou e diz por onde achou', async () => {
    const d = await devolucaoML({ pedido: '2000077776666555' });
    const agora = new Date();
    await receberPorRastreio(db, '2000077776666555', operador, agora);
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

  it('duas leituras ao mesmo tempo pelo número do pedido: só uma registra a chegada e grava um evento', async () => {
    const outro = await criarUsuarioTeste(db, 'OPERADOR');
    const d = await devolucaoML({ pedido: '2000033332222111' });
    const resultados = await Promise.all([receberPorRastreio(db, '2000033332222111', operador), receberPorRastreio(db, '000033332222111', outro)]);
    expect(resultados.map((r) => r.tipo).sort()).toEqual(['ja_recebida', 'recebidas']);
    expect((await listarEventos(db, 'devolucao', d.id)).filter((e) => e.acao === 'recebida')).toHaveLength(1);
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
