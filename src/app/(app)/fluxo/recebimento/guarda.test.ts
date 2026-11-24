import { describe, expect, it } from 'vitest';
import type { EstadoRecebimento } from './acoes';
import { comAvisoDoPedido, mesmaLeituraDaCamera, mesmoPedidoDaCamera, podeAceitarLeitura } from './guarda';

const INICIAL: EstadoRecebimento = { tipo: 'inicial' };

const ficha = (devolucaoId: string, codigo: string) => ({
  devolucaoId,
  codigo,
  status: 'PENDENTE_CHEGADA' as const,
  conta: null,
  motivo: null,
  situacaoReclamacao: null,
  vendas: [],
  produtos: [],
});
const ESCOLHA: EstadoRecebimento = {
  tipo: 'escolher',
  codigoLido: '2000018992531744',
  lidaEm: 1,
  fichas: [ficha('a', 'DEV-000001'), ficha('b', 'DEV-000002')],
  nota: 'Achada pelo número do pedido do ML (extra).',
};
/** O cartão verde de uma chegada dada pelo rastreio (sem nada do pedido). */
const VERDE_A: EstadoRecebimento = { tipo: 'sucesso', titulo: 'Chegada registrada', mensagem: 'DEV-000001 · 24/11/2026 10:30', codigos: ['DEV-000001'] };
/** O cartão amarelo "Este pacote já chegou" da DEV-000001, lida pelo rastreio (sem nada do pedido). */
const AMARELO_A: EstadoRecebimento = {
  tipo: 'aviso',
  titulo: 'Este pacote já chegou',
  mensagem: 'DEV-000001 já tinha chegado em 23/11/2026 17:30. Status: Aguardando conferência.',
  codigos: ['DEV-000001'],
  jaChegou: true,
};
/** O cartão amarelo "Fale com o Gestor" da DEV-000001: fica como está (só o "já chegou" ganhou a proteção). */
const GESTOR_A: EstadoRecebimento = {
  tipo: 'aviso',
  titulo: 'Fale com o Gestor',
  mensagem: 'DEV-000001 está cancelada. Separe o pacote e avise o Gestor.',
  codigos: ['DEV-000001'],
};

describe('podeAceitarLeitura', () => {
  it('aceita leitura quando está livre', () => {
    expect(podeAceitarLeitura(false, INICIAL)).toBe(true);
    expect(podeAceitarLeitura(false, { tipo: 'sucesso', titulo: 'a', mensagem: 'b', codigos: [] })).toBe(true);
  });

  it('ignora leitura enquanto um envio está pendente', () => {
    expect(podeAceitarLeitura(true, INICIAL)).toBe(false);
  });

  it('ignora leitura enquanto o cartão "não encontrada" espera a escolha da pessoa', () => {
    expect(podeAceitarLeitura(false, { tipo: 'nao_encontrada', rastreio: 'X' })).toBe(false);
  });

  it('(E27) ignora leitura com a ficha (ou a lista) do pedido na tela: outro código da mesma etiqueta não a troca', () => {
    expect(podeAceitarLeitura(false, ESCOLHA)).toBe(false);
  });

  it('(E27) depois de "Dar chegada" o cartão verde volta a aceitar leituras', () => {
    expect(podeAceitarLeitura(false, { ...VERDE_A, aindaEsperam: ['DEV-000002'] })).toBe(true);
  });
});

describe('mesmaLeituraDaCamera (extra, E25)', () => {
  const SUCESSO: EstadoRecebimento = { tipo: 'sucesso', titulo: 'Chegada registrada', mensagem: 'DEV-000071 · 23/11/2026 17:30', codigos: ['DEV-000071'] };

  it('pela câmera, o "já chegou" de uma devolução que está no cartão verde é outro código da mesma etiqueta: o cartão fica', () => {
    expect(mesmaLeituraDaCamera(SUCESSO, true, ['DEV-000071'])).toBe(true);
  });

  it('pelo campo (digitação ou leitor USB) o aviso "já chegou" aparece como sempre', () => {
    expect(mesmaLeituraDaCamera(SUCESSO, false, ['DEV-000071'])).toBe(false);
  });

  it('outra devolução, ou sem cartão verde na tela, o aviso aparece', () => {
    expect(mesmaLeituraDaCamera(SUCESSO, true, ['DEV-000072'])).toBe(false);
    expect(mesmaLeituraDaCamera(INICIAL, true, ['DEV-000071'])).toBe(false);
    expect(mesmaLeituraDaCamera({ tipo: 'aviso', titulo: 'Este pacote já chegou', mensagem: 'x', codigos: ['DEV-000071'] }, true, ['DEV-000071'])).toBe(false);
  });

  it('(E27) achada pelo pedido: o "já chegou" da mais recente do pedido, que é outra, é a mesma etiqueta se o cartão é de uma devolução do pedido', () => {
    // O pedido tem a DEV-000050 (mais recente, já recebida antes) e a DEV-000071 (a do cartão verde).
    expect(mesmaLeituraDaCamera(SUCESSO, true, ['DEV-000071', 'DEV-000050'])).toBe(true);
    expect(mesmaLeituraDaCamera(SUCESSO, false, ['DEV-000071', 'DEV-000050'])).toBe(false);
  });
});

describe('mesmoPedidoDaCamera (extra, E27)', () => {
  it('pela câmera, o mesmo pedido com a ficha aberta é a mesma leitura: a ficha fica', () => {
    expect(mesmoPedidoDaCamera(ESCOLHA, true, ['DEV-000001', 'DEV-000002'])).toBe(true);
    // Uma das duas já chegou por outro celular: continua sendo o mesmo pedido.
    expect(mesmoPedidoDaCamera(ESCOLHA, true, ['DEV-000002'])).toBe(true);
  });

  it('pela câmera, o cartão verde de qualquer chegada (aqui, pelo rastreio) fica diante de outro código do mesmo pedido', () => {
    expect(mesmoPedidoDaCamera(VERDE_A, true, ['DEV-000001', 'DEV-000002'])).toBe(true);
  });

  it('(24/11) pela câmera, o amarelo "Este pacote já chegou" de uma devolução do pedido também fica', () => {
    expect(mesmoPedidoDaCamera(AMARELO_A, true, ['DEV-000001', 'DEV-000002'])).toBe(true);
    // Pelo campo, outro pedido, ou o "Fale com o Gestor": a resposta nova aparece, como antes.
    expect(mesmoPedidoDaCamera(AMARELO_A, false, ['DEV-000001', 'DEV-000002'])).toBe(false);
    expect(mesmoPedidoDaCamera(AMARELO_A, true, ['DEV-000003', 'DEV-000004'])).toBe(false);
    expect(mesmoPedidoDaCamera(GESTOR_A, true, ['DEV-000001', 'DEV-000002'])).toBe(false);
  });

  it('pelo campo (digitação ou leitor USB), outro pedido ou outra tela: a resposta nova aparece', () => {
    expect(mesmoPedidoDaCamera(VERDE_A, false, ['DEV-000001', 'DEV-000002'])).toBe(false);
    expect(mesmoPedidoDaCamera(ESCOLHA, false, ['DEV-000001'])).toBe(false);
    expect(mesmoPedidoDaCamera(ESCOLHA, true, ['DEV-000003'])).toBe(false);
    expect(mesmoPedidoDaCamera(VERDE_A, true, ['DEV-000003', 'DEV-000004'])).toBe(false);
    expect(mesmoPedidoDaCamera(INICIAL, true, ['DEV-000001'])).toBe(false);
    expect(mesmoPedidoDaCamera({ tipo: 'aviso', titulo: 't', mensagem: 'm', codigos: ['DEV-000001'] }, true, ['DEV-000001'])).toBe(false);
  });
});

describe('comAvisoDoPedido (extra, E27)', () => {
  it('o cartão verde ganha as devoluções do pedido que ainda esperam o pacote', () => {
    expect(comAvisoDoPedido(VERDE_A, ['DEV-000002'])).toEqual({ ...VERDE_A, aindaEsperam: ['DEV-000002'] });
  });

  it('sem mudança, devolve o mesmo estado', () => {
    const comAviso = comAvisoDoPedido(VERDE_A, ['DEV-000002']);
    expect(comAvisoDoPedido(comAviso, ['DEV-000002'])).toBe(comAviso);
    expect(comAvisoDoPedido(VERDE_A, [])).toBe(VERDE_A);
  });

  it('nenhuma esperando mais: o aviso sai', () => {
    expect(comAvisoDoPedido({ ...VERDE_A, aindaEsperam: ['DEV-000002'] }, [])).toEqual(VERDE_A);
  });

  it('a devolução do próprio cartão não entra no aviso; fora do cartão verde (e do amarelo "já chegou"), nada muda', () => {
    expect(comAvisoDoPedido(VERDE_A, ['DEV-000001'])).toBe(VERDE_A);
    expect(comAvisoDoPedido(ESCOLHA, ['DEV-000002'])).toBe(ESCOLHA);
    expect(comAvisoDoPedido(INICIAL, ['DEV-000002'])).toBe(INICIAL);
    expect(comAvisoDoPedido(GESTOR_A, ['DEV-000002'])).toBe(GESTOR_A);
  });

  it('(24/11) o amarelo "Este pacote já chegou" ganha o mesmo aviso, e o perde quando nenhuma espera mais', () => {
    const comAviso = comAvisoDoPedido(AMARELO_A, ['DEV-000001', 'DEV-000002']);
    expect(comAviso).toEqual({ ...AMARELO_A, aindaEsperam: ['DEV-000002'] });
    expect(comAvisoDoPedido(comAviso, ['DEV-000002'])).toBe(comAviso);
    expect(comAvisoDoPedido(comAviso, [])).toEqual(AMARELO_A);
  });
});
