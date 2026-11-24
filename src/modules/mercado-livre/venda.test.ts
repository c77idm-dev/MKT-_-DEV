import { describe, expect, it } from 'vitest';
import { rotuloSituacaoReclamacao, rotuloSituacaoVenda, totalDaVenda, urlVendaML } from './venda';

describe('ficha da venda (emenda E27, extra): rótulos, total e link', () => {
  it('situação do pedido e da entrega em pt-BR, separadas por um ponto', () => {
    expect(rotuloSituacaoVenda('paid', 'delivered')).toBe('Paga · Entregue');
    expect(rotuloSituacaoVenda('cancelled', 'cancelled')).toBe('Cancelada · Envio cancelado');
    expect(rotuloSituacaoVenda('partially_refunded', 'shipped')).toBe('Reembolsada em parte · A caminho');
    expect(rotuloSituacaoVenda('paid', null)).toBe('Paga');
    expect(rotuloSituacaoVenda(null, 'not_delivered')).toBe('Não entregue');
    expect(rotuloSituacaoVenda(null, null)).toBeNull();
  });

  it('código que o sistema não conhece aparece como veio', () => {
    expect(rotuloSituacaoVenda('status_novo', 'envio_novo')).toBe('status_novo · envio_novo');
    expect(rotuloSituacaoReclamacao('stale')).toBe('stale');
  });

  it('situação da reclamação: aberta ou encerrada', () => {
    expect(rotuloSituacaoReclamacao('opened')).toBe('Aberta');
    expect(rotuloSituacaoReclamacao('closed')).toBe('Encerrada');
    expect(rotuloSituacaoReclamacao(null)).toBeNull();
  });

  it('total = soma de quantidade × valor, em centavos (sem erro de ponto flutuante)', () => {
    expect(totalDaVenda([{ quantidade: 1, valorUnitario: 129.9 }])).toBe(129.9);
    expect(
      totalDaVenda([
        { quantidade: 3, valorUnitario: 0.1 },
        { quantidade: 1, valorUnitario: 0.2 },
      ]),
    ).toBe(0.5);
    expect(
      totalDaVenda([
        { quantidade: 2, valorUnitario: 129.9 },
        { quantidade: 1, valorUnitario: 10.05 },
      ]),
    ).toBe(269.85);
  });

  it('sem itens, ou com um item sem quantidade ou sem valor: sem total (nunca um total pela metade)', () => {
    expect(totalDaVenda([])).toBeNull();
    expect(
      totalDaVenda([
        { quantidade: 1, valorUnitario: 10 },
        { quantidade: 1, valorUnitario: null },
      ]),
    ).toBeNull();
    expect(totalDaVenda([{ quantidade: null, valorUnitario: 10 }])).toBeNull();
    // Defesa: um total que estoura (não finito) não aparece.
    expect(totalDaVenda([{ quantidade: 2, valorUnitario: 1e308 }])).toBeNull();
  });

  it('"Abrir a venda no ML": o detalhe da venda pelo número do pedido; número com outra coisa além de dígitos: sem link', () => {
    expect(urlVendaML('2000008003035430')).toBe('https://www.mercadolivre.com.br/vendas/2000008003035430/detalhe');
    expect(urlVendaML('PED-1')).toBeNull();
    expect(urlVendaML('')).toBeNull();
  });
});
