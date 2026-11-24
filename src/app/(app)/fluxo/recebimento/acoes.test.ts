import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FichaVenda } from '@/modules/mercado-livre/ficha-venda';

const mocks = vi.hoisted(() => ({
  receber: vi.fn(),
  darChegada: vi.fn(),
  fichas: vi.fn(),
  revalidar: vi.fn(),
}));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidar }));
vi.mock('@/db', () => ({ obterDb: () => ({ db: true }) }));
vi.mock('@/modules/auth/servidor', () => ({ exigirPermissao: vi.fn(async () => ({ id: 'u1', perfil: 'OPERADOR' })) }));
vi.mock('@/modules/devolucoes/recebimento', () => ({
  receberPorRastreio: mocks.receber,
  darChegadaPeloPedido: mocks.darChegada,
  criarNaoIdentificada: vi.fn(),
}));
vi.mock('@/modules/mercado-livre/ficha-venda', () => ({ fichasDasDevolucoes: mocks.fichas }));

import { ErroDevolucao } from '@/modules/devolucoes/erros';
import { registrarChegadaAcao, type EstadoRecebimento } from './acoes';

const INICIAL: EstadoRecebimento = { tipo: 'inicial' };
const PEDIDO = '2000018992531744';

function ficha(devolucaoId: string, codigo: string): FichaVenda {
  return { devolucaoId, codigo, status: 'PENDENTE_CHEGADA', conta: null, motivo: null, situacaoReclamacao: null, temReclamacao: true, vendas: [], produtos: [] };
}

/** A resposta `escolher` do servidor: as que esperam o pacote ([id, código]) e todos os códigos do pedido. */
function escolher(codigoLido: string, esperando: [string, string][], codigosDoPedido: string[]) {
  return { tipo: 'escolher', codigoLido, ids: esperando.map(([id]) => id), codigos: esperando.map(([, c]) => c), codigosDoPedido, achadaPor: 'PEDIDO_ML' };
}

function form(campos: Record<string, string>): FormData {
  const dados = new FormData();
  for (const [k, v] of Object.entries(campos)) dados.set(k, v);
  return dados;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('registrarChegadaAcao pelo número do pedido (extra, E27)', () => {
  it('achada pelo pedido: mostra a ficha (ou a lista) e não registra nada', async () => {
    mocks.receber.mockResolvedValue(escolher(PEDIDO, [['a', 'DEV-000001'], ['b', 'DEV-000002']], ['DEV-000001', 'DEV-000002']));
    mocks.fichas.mockResolvedValue([ficha('a', 'DEV-000001'), ficha('b', 'DEV-000002')]);
    const estado = await registrarChegadaAcao(INICIAL, form({ intencao: 'receber', rastreio: PEDIDO }));
    expect(mocks.fichas).toHaveBeenCalledWith({ db: true }, ['a', 'b']);
    expect(estado).toMatchObject({
      tipo: 'escolher',
      codigoLido: PEDIDO,
      fichas: [{ codigo: 'DEV-000001' }, { codigo: 'DEV-000002' }],
      nota: 'Achadas pelo número do pedido do ML (extra).',
    });
    expect(mocks.darChegada).not.toHaveBeenCalled();
    expect(mocks.revalidar).not.toHaveBeenCalled();
  });

  it('pela câmera, o mesmo pedido com a ficha aberta: a ficha fica (o mesmo estado, sem montar de novo)', async () => {
    const aberta: EstadoRecebimento = { tipo: 'escolher', codigoLido: PEDIDO, lidaEm: 1, fichas: [ficha('a', 'DEV-000001')], nota: 'n' };
    mocks.receber.mockResolvedValue(escolher(PEDIDO.slice(1), [['a', 'DEV-000001']], ['DEV-000001']));
    mocks.fichas.mockResolvedValue([ficha('a', 'DEV-000001')]);
    expect(await registrarChegadaAcao(aberta, form({ intencao: 'receber', rastreio: PEDIDO.slice(1), origem: 'camera' }))).toBe(aberta);
    // Pelo campo, a resposta é nova.
    const pelo = await registrarChegadaAcao(aberta, form({ intencao: 'receber', rastreio: PEDIDO.slice(1) }));
    expect(pelo).not.toBe(aberta);
    expect(pelo).toMatchObject({ tipo: 'escolher', codigoLido: PEDIDO.slice(1) });
  });

  it('nenhuma ficha (a devolução saiu do ML entre a busca e a ficha): pede para ler de novo', async () => {
    mocks.receber.mockResolvedValue(escolher(PEDIDO, [['a', 'DEV-000001']], ['DEV-000001']));
    mocks.fichas.mockResolvedValue([]);
    expect(await registrarChegadaAcao(INICIAL, form({ intencao: 'receber', rastreio: PEDIDO }))).toEqual({
      tipo: 'erro',
      mensagem: 'A situação desta devolução mudou agora. Leia o pacote de novo.',
    });
  });

  it('"Dar chegada" registra só a devolução tocada, com o pedido lido', async () => {
    const aberta: EstadoRecebimento = {
      tipo: 'escolher',
      codigoLido: PEDIDO,
      lidaEm: 1,
      fichas: [ficha('a', 'DEV-000001'), ficha('b', 'DEV-000002')],
      nota: 'n',
    };
    mocks.darChegada.mockResolvedValue({ tipo: 'recebidas', codigos: ['DEV-000002'], em: new Date('2026-11-24T10:30:00-03:00'), achadaPor: 'PEDIDO_ML', doArmazemML: ['DEV-000002'] });
    const estado = await registrarChegadaAcao(aberta, form({ intencao: 'dar_chegada', devolucaoId: 'b', codigoLido: PEDIDO }));
    expect(mocks.darChegada).toHaveBeenCalledWith({ db: true }, { devolucaoId: 'b', codigoLido: PEDIDO }, { id: 'u1', perfil: 'OPERADOR' });
    expect(mocks.receber).not.toHaveBeenCalled();
    expect(estado).toEqual({
      tipo: 'sucesso',
      titulo: 'Chegada registrada',
      mensagem: 'DEV-000002 · voltou do armazém do ML (extra) · 24/11/2026 10:30',
      codigos: ['DEV-000002'],
      nota: 'Achada pelo número do pedido do ML (extra).',
    });
    expect(mocks.revalidar).toHaveBeenCalledWith('/fluxo');
  });

  it('"Dar chegada" de novo (outro celular já deu): "Este pacote já chegou"; cancelada: "Fale com o Gestor"', async () => {
    mocks.darChegada.mockResolvedValueOnce({ tipo: 'ja_recebida', codigo: 'DEV-000002', status: 'AGUARDANDO_CONFERENCIA', recebidaEm: null, achadaPor: 'PEDIDO_ML' });
    expect(await registrarChegadaAcao(INICIAL, form({ intencao: 'dar_chegada', devolucaoId: 'b', codigoLido: PEDIDO }))).toMatchObject({
      tipo: 'aviso',
      titulo: 'Este pacote já chegou',
      codigos: ['DEV-000002'],
    });
    mocks.darChegada.mockResolvedValueOnce({ tipo: 'bloqueada', codigo: 'DEV-000002', status: 'CANCELADA', achadaPor: 'PEDIDO_ML' });
    expect(await registrarChegadaAcao(INICIAL, form({ intencao: 'dar_chegada', devolucaoId: 'b', codigoLido: PEDIDO }))).toMatchObject({
      tipo: 'aviso',
      titulo: 'Fale com o Gestor',
      mensagem: 'DEV-000002 está cancelada. Separe o pacote e avise o Gestor.',
    });
  });

  it('"Dar chegada" com erro de regra: a mensagem vai para a tela', async () => {
    mocks.darChegada.mockRejectedValue(new ErroDevolucao('Esta devolução não é deste pedido. Leia o número do pedido de novo.'));
    expect(await registrarChegadaAcao(INICIAL, form({ intencao: 'dar_chegada', devolucaoId: 'x', codigoLido: PEDIDO }))).toEqual({
      tipo: 'erro',
      mensagem: 'Esta devolução não é deste pedido. Leia o número do pedido de novo.',
    });
  });
});

describe('registrarChegadaAcao: o cartão verde diante de outro código do mesmo pedido, pela câmera (extra, E27)', () => {
  /** O cartão verde da chegada da DEV-000001 (A), dada pelo rastreio: sem nada do pedido. */
  const VERDE_A: EstadoRecebimento = {
    tipo: 'sucesso',
    titulo: 'Chegada registrada',
    mensagem: 'DEV-000001 · 24/11/2026 10:30',
    codigos: ['DEV-000001'],
  };

  it('a câmera lê o pedido depois do rastreio: o cartão fica, sem a ficha da outra devolução, e avisa a que ainda espera', async () => {
    mocks.receber.mockResolvedValue(escolher(PEDIDO.slice(1), [['b', 'DEV-000002']], ['DEV-000001', 'DEV-000002']));
    const estado = await registrarChegadaAcao(VERDE_A, form({ intencao: 'receber', rastreio: PEDIDO.slice(1), origem: 'camera' }));
    expect(estado).toEqual({ ...VERDE_A, aindaEsperam: ['DEV-000002'] });
    expect(mocks.fichas).not.toHaveBeenCalled();
    expect(mocks.darChegada).not.toHaveBeenCalled();
    // A câmera relê a mesma etiqueta: nada muda (o mesmo estado).
    expect(await registrarChegadaAcao(estado, form({ intencao: 'receber', rastreio: PEDIDO, origem: 'camera' }))).toBe(estado);
  });

  it('pelo campo (digitação ou leitor USB), o mesmo pedido mostra a ficha da que espera o pacote', async () => {
    mocks.receber.mockResolvedValue(escolher(PEDIDO, [['b', 'DEV-000002']], ['DEV-000001', 'DEV-000002']));
    mocks.fichas.mockResolvedValue([ficha('b', 'DEV-000002')]);
    expect(await registrarChegadaAcao(VERDE_A, form({ intencao: 'receber', rastreio: PEDIDO }))).toMatchObject({
      tipo: 'escolher',
      fichas: [{ codigo: 'DEV-000002' }],
    });
  });

  it('outro pedido pela câmera: a ficha dele aparece', async () => {
    mocks.receber.mockResolvedValue(escolher('2000011112222333', [['c', 'DEV-000003']], ['DEV-000003']));
    mocks.fichas.mockResolvedValue([ficha('c', 'DEV-000003')]);
    expect(await registrarChegadaAcao(VERDE_A, form({ intencao: 'receber', rastreio: '2000011112222333', origem: 'camera' }))).toMatchObject({
      tipo: 'escolher',
      fichas: [{ codigo: 'DEV-000003' }],
    });
  });

  it('o "já chegou" da mais recente do pedido, que é outra devolução: o cartão fica e o aviso sai (nenhuma espera mais)', async () => {
    const comAviso: EstadoRecebimento = { ...VERDE_A, aindaEsperam: ['DEV-000002'] };
    mocks.receber.mockResolvedValue({
      tipo: 'ja_recebida',
      codigo: 'DEV-000002',
      status: 'AGUARDANDO_CONFERENCIA',
      recebidaEm: new Date('2026-11-20T10:00:00-03:00'),
      achadaPor: 'PEDIDO_ML',
      codigosDoPedido: ['DEV-000001', 'DEV-000002'],
    });
    expect(await registrarChegadaAcao(VERDE_A, form({ intencao: 'receber', rastreio: PEDIDO, origem: 'camera' }))).toBe(VERDE_A);
    expect(await registrarChegadaAcao(comAviso, form({ intencao: 'receber', rastreio: PEDIDO, origem: 'camera' }))).toEqual(VERDE_A);
    // Pelo campo, o aviso aparece como sempre.
    expect(await registrarChegadaAcao(VERDE_A, form({ intencao: 'receber', rastreio: PEDIDO }))).toMatchObject({
      tipo: 'aviso',
      titulo: 'Este pacote já chegou',
      codigos: ['DEV-000002'],
    });
  });

  it('a mais recente do pedido está cancelada: pela câmera, o cartão da devolução do pedido fica', async () => {
    mocks.receber.mockResolvedValue({ tipo: 'bloqueada', codigo: 'DEV-000003', status: 'CANCELADA', achadaPor: 'PEDIDO_ML', codigosDoPedido: ['DEV-000001', 'DEV-000003'] });
    expect(await registrarChegadaAcao(VERDE_A, form({ intencao: 'receber', rastreio: PEDIDO, origem: 'camera' }))).toBe(VERDE_A);
    expect(await registrarChegadaAcao(VERDE_A, form({ intencao: 'receber', rastreio: PEDIDO }))).toMatchObject({ tipo: 'aviso', titulo: 'Fale com o Gestor' });
  });

  it('"Fale com o Gestor" pelo rastreio (sem o pedido), mesmo da devolução do cartão: o aviso aparece, como na E25', async () => {
    mocks.receber.mockResolvedValue({ tipo: 'bloqueada', codigo: 'DEV-000001', status: 'CANCELADA' });
    expect(await registrarChegadaAcao(VERDE_A, form({ intencao: 'receber', rastreio: 'MM48503476449BRSP02', origem: 'camera' }))).toMatchObject({
      tipo: 'aviso',
      titulo: 'Fale com o Gestor',
      codigos: ['DEV-000001'],
    });
  });

  it('o rastreio de A de novo pela câmera ("já chegou" pelo rastreio): o cartão fica como está, com o aviso', async () => {
    const comAviso: EstadoRecebimento = { ...VERDE_A, aindaEsperam: ['DEV-000002'] };
    mocks.receber.mockResolvedValue({ tipo: 'ja_recebida', codigo: 'DEV-000001', status: 'AGUARDANDO_CONFERENCIA', recebidaEm: new Date() });
    expect(await registrarChegadaAcao(comAviso, form({ intencao: 'receber', rastreio: 'MM48503476449BRSP02', origem: 'camera' }))).toBe(comAviso);
  });

  it('depois de "Dar chegada" numa devolução da lista, o mesmo pedido pela câmera também não troca o cartão', async () => {
    const aberta: EstadoRecebimento = {
      tipo: 'escolher',
      codigoLido: PEDIDO,
      lidaEm: 1,
      fichas: [ficha('a', 'DEV-000001'), ficha('b', 'DEV-000002')],
      nota: 'n',
    };
    mocks.darChegada.mockResolvedValue({ tipo: 'recebidas', codigos: ['DEV-000001'], em: new Date('2026-11-24T10:30:00-03:00'), achadaPor: 'PEDIDO_ML' });
    const verde = await registrarChegadaAcao(aberta, form({ intencao: 'dar_chegada', devolucaoId: 'a', codigoLido: PEDIDO }));
    mocks.receber.mockResolvedValue(escolher(PEDIDO, [['b', 'DEV-000002']], ['DEV-000001', 'DEV-000002']));
    expect(await registrarChegadaAcao(verde, form({ intencao: 'receber', rastreio: PEDIDO, origem: 'camera' }))).toEqual({
      ...verde,
      aindaEsperam: ['DEV-000002'],
    });
    expect(mocks.fichas).not.toHaveBeenCalled();
  });
});

describe('registrarChegadaAcao: o amarelo "Este pacote já chegou" diante do número do pedido, pela câmera (extra, E27; 24/11)', () => {
  /** A DEV-000001 (A) já tinha chegado; a câmera leu o rastreio dela. B, do mesmo pedido, ainda espera o pacote. */
  const RASTREIO_A = 'MM48503476449BRSP02';
  const JA_A = { tipo: 'ja_recebida', codigo: 'DEV-000001', status: 'AGUARDANDO_CONFERENCIA', recebidaEm: new Date('2026-11-23T17:30:00-03:00') };

  async function amareloDeA(): Promise<EstadoRecebimento> {
    mocks.receber.mockResolvedValueOnce(JA_A);
    const estado = await registrarChegadaAcao(INICIAL, form({ intencao: 'receber', rastreio: RASTREIO_A, origem: 'camera' }));
    expect(estado).toMatchObject({ tipo: 'aviso', titulo: 'Este pacote já chegou', codigos: ['DEV-000001'] });
    return estado;
  }

  it('a câmera lê o pedido depois do rastreio: o amarelo fica, sem a ficha da outra devolução, e avisa a que ainda espera', async () => {
    const amarelo = await amareloDeA();
    mocks.receber.mockResolvedValue(escolher(PEDIDO.slice(1), [['b', 'DEV-000002']], ['DEV-000001', 'DEV-000002']));
    const estado = await registrarChegadaAcao(amarelo, form({ intencao: 'receber', rastreio: PEDIDO.slice(1), origem: 'camera' }));
    expect(estado).toEqual({ ...amarelo, aindaEsperam: ['DEV-000002'] });
    expect(mocks.fichas).not.toHaveBeenCalled();
    expect(mocks.darChegada).not.toHaveBeenCalled();
    // A câmera relê a mesma etiqueta: nada muda (o mesmo estado).
    expect(await registrarChegadaAcao(estado, form({ intencao: 'receber', rastreio: PEDIDO, origem: 'camera' }))).toBe(estado);
  });

  it('com o aviso, a câmera relê o rastreio (ou o número do envio) de A: o amarelo fica como está, com o aviso', async () => {
    const amarelo = await amareloDeA();
    const comAviso = { ...amarelo, aindaEsperam: ['DEV-000002'] } as EstadoRecebimento;
    mocks.receber.mockResolvedValueOnce(JA_A);
    expect(await registrarChegadaAcao(comAviso, form({ intencao: 'receber', rastreio: RASTREIO_A, origem: 'camera' }))).toBe(comAviso);
    mocks.receber.mockResolvedValueOnce({ ...JA_A, achadaPor: 'ENVIO_ML' });
    expect(await registrarChegadaAcao(comAviso, form({ intencao: 'receber', rastreio: '48503476449', origem: 'camera' }))).toBe(comAviso);
    // Pelo campo, o "já chegou" aparece de novo, sem o aviso (como antes).
    mocks.receber.mockResolvedValueOnce(JA_A);
    const peloCampo = await registrarChegadaAcao(comAviso, form({ intencao: 'receber', rastreio: RASTREIO_A }));
    expect(peloCampo).toMatchObject({ tipo: 'aviso', titulo: 'Este pacote já chegou', codigos: ['DEV-000001'] });
    expect(peloCampo).not.toHaveProperty('aindaEsperam');
  });

  it('pelo campo (digitação ou leitor USB), o mesmo pedido mostra a ficha da que espera o pacote, como antes', async () => {
    const amarelo = await amareloDeA();
    mocks.receber.mockResolvedValue(escolher(PEDIDO, [['b', 'DEV-000002']], ['DEV-000001', 'DEV-000002']));
    mocks.fichas.mockResolvedValue([ficha('b', 'DEV-000002')]);
    expect(await registrarChegadaAcao(amarelo, form({ intencao: 'receber', rastreio: PEDIDO }))).toMatchObject({
      tipo: 'escolher',
      fichas: [{ codigo: 'DEV-000002' }],
    });
  });

  it('outro pedido pela câmera: a ficha dele aparece', async () => {
    const amarelo = await amareloDeA();
    mocks.receber.mockResolvedValue(escolher('2000011112222333', [['c', 'DEV-000003']], ['DEV-000003']));
    mocks.fichas.mockResolvedValue([ficha('c', 'DEV-000003')]);
    expect(await registrarChegadaAcao(amarelo, form({ intencao: 'receber', rastreio: '2000011112222333', origem: 'camera' }))).toMatchObject({
      tipo: 'escolher',
      fichas: [{ codigo: 'DEV-000003' }],
    });
  });

  it('o pedido só tem devoluções que já chegaram (o "já chegou" é da mais recente, outra): pela câmera o amarelo de A fica e o aviso sai', async () => {
    const amarelo = await amareloDeA();
    const comAviso = { ...amarelo, aindaEsperam: ['DEV-000002'] } as EstadoRecebimento;
    mocks.receber.mockResolvedValue({
      tipo: 'ja_recebida',
      codigo: 'DEV-000002',
      status: 'AGUARDANDO_CONFERENCIA',
      recebidaEm: new Date('2026-11-24T09:00:00-03:00'),
      achadaPor: 'PEDIDO_ML',
      codigosDoPedido: ['DEV-000001', 'DEV-000002'],
    });
    expect(await registrarChegadaAcao(amarelo, form({ intencao: 'receber', rastreio: PEDIDO, origem: 'camera' }))).toBe(amarelo);
    expect(await registrarChegadaAcao(comAviso, form({ intencao: 'receber', rastreio: PEDIDO, origem: 'camera' }))).toEqual(amarelo);
    // Pelo campo, o "já chegou" da mais recente aparece como sempre.
    expect(await registrarChegadaAcao(amarelo, form({ intencao: 'receber', rastreio: PEDIDO }))).toMatchObject({
      tipo: 'aviso',
      titulo: 'Este pacote já chegou',
      codigos: ['DEV-000002'],
    });
  });

  it('"Fale com o Gestor" de A (pelo rastreio) não ganhou a proteção: o pedido pela câmera mostra a ficha de B, como antes', async () => {
    mocks.receber.mockResolvedValueOnce({ tipo: 'bloqueada', codigo: 'DEV-000001', status: 'CANCELADA' });
    const gestor = await registrarChegadaAcao(INICIAL, form({ intencao: 'receber', rastreio: RASTREIO_A, origem: 'camera' }));
    expect(gestor).toMatchObject({ tipo: 'aviso', titulo: 'Fale com o Gestor' });
    mocks.receber.mockResolvedValue(escolher(PEDIDO, [['b', 'DEV-000002']], ['DEV-000001', 'DEV-000002']));
    mocks.fichas.mockResolvedValue([ficha('b', 'DEV-000002')]);
    expect(await registrarChegadaAcao(gestor, form({ intencao: 'receber', rastreio: PEDIDO, origem: 'camera' }))).toMatchObject({
      tipo: 'escolher',
      fichas: [{ codigo: 'DEV-000002' }],
    });
  });

  it('o "já chegou" depois de "Dar chegada" (outro celular deu antes) também fica diante do pedido pela câmera', async () => {
    mocks.darChegada.mockResolvedValueOnce({ tipo: 'ja_recebida', codigo: 'DEV-000001', status: 'AGUARDANDO_CONFERENCIA', recebidaEm: null, achadaPor: 'PEDIDO_ML' });
    const amarelo = await registrarChegadaAcao(INICIAL, form({ intencao: 'dar_chegada', devolucaoId: 'a', codigoLido: PEDIDO }));
    expect(amarelo).toMatchObject({ tipo: 'aviso', titulo: 'Este pacote já chegou' });
    mocks.receber.mockResolvedValue(escolher(PEDIDO, [['b', 'DEV-000002']], ['DEV-000001', 'DEV-000002']));
    expect(await registrarChegadaAcao(amarelo, form({ intencao: 'receber', rastreio: PEDIDO, origem: 'camera' }))).toEqual({
      ...amarelo,
      aindaEsperam: ['DEV-000002'],
    });
    expect(mocks.fichas).not.toHaveBeenCalled();
  });
});
