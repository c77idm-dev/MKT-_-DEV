// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TRAVA_TOQUE_DUPLO_MS } from '@/components/venda/useTravaToqueDuplo';
import type { FichaVenda } from '@/modules/mercado-livre/ficha-venda';
import type { EstadoRecebimento } from './acoes';
import { EscolhaDoPedido } from './EscolhaDoPedido';

function ficha(devolucaoId: string, codigo: string): FichaVenda {
  return {
    devolucaoId,
    codigo,
    status: 'NO_CD_MARKETPLACE',
    conta: null,
    motivo: null,
    situacaoReclamacao: null,
    temReclamacao: true,
    vendas: [],
    produtos: [{ sku: `SKU-${codigo}`, descricao: `Produto ${codigo}`, fotoUrl: null, quantidade: 1 }],
  };
}

function escolha(fichas: FichaVenda[]): Extract<EstadoRecebimento, { tipo: 'escolher' }> {
  return { tipo: 'escolher', codigoLido: '000018992531744', lidaEm: 1, fichas, nota: 'Achada pelo número do pedido do ML (extra).' };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['performance'] });
});
afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

describe('EscolhaDoPedido (Receber pacote pelo pedido do ML, extra, E27)', () => {
  it('uma devolução: a ficha com o código DEV, o aviso de que nada foi registrado e "Dar chegada"', () => {
    render(<EscolhaDoPedido estado={escolha([ficha('a', 'DEV-000071')])} acao={vi.fn()} pendente={false} />);
    const bloco = screen.getByRole('region', { name: 'Confira antes de dar a chegada' });
    expect(bloco.textContent).toContain('Achada pelo número do pedido do ML (extra).');
    expect(bloco.textContent).toContain('A chegada ainda não foi registrada.');
    expect(within(bloco).getByText('DEV-000071')).toBeTruthy();
    expect(within(bloco).getByRole('button', { name: 'Dar chegada na DEV-000071' })).toBeTruthy();
  });

  it('várias: a lista, cada devolução com o seu "Dar chegada"', () => {
    render(<EscolhaDoPedido estado={escolha([ficha('a', 'DEV-000071'), ficha('b', 'DEV-000072')])} acao={vi.fn()} pendente={false} />);
    expect(screen.getByText(/Este pedido tem 2 devoluções esperando o pacote/)).toBeTruthy();
    const itens = within(screen.getByRole('list', { name: 'Devoluções do pedido' })).getAllByRole('listitem');
    expect(itens.map((i) => within(i).getByRole('button').textContent)).toEqual(['Dar chegada na DEV-000071', 'Dar chegada na DEV-000072']);
  });

  it('o toque logo que a ficha aparece não vale (toque duplo); depois, manda a devolução tocada e o pedido lido', async () => {
    const acao = vi.fn();
    render(<EscolhaDoPedido estado={escolha([ficha('a', 'DEV-000071'), ficha('b', 'DEV-000072')])} acao={acao} pendente={false} />);
    const segunda = screen.getByRole('button', { name: 'Dar chegada na DEV-000072' });
    await act(async () => fireEvent.click(segunda));
    expect(acao).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(TRAVA_TOQUE_DUPLO_MS));
    await act(async () => fireEvent.click(segunda));
    expect(acao).toHaveBeenCalledTimes(1);
    const dados = acao.mock.calls[0][0] as FormData;
    expect(Object.fromEntries(dados.entries())).toEqual({ intencao: 'dar_chegada', devolucaoId: 'b', codigoLido: '000018992531744' });
  });

  it('com um envio em andamento, os botões ficam travados', () => {
    render(<EscolhaDoPedido estado={escolha([ficha('a', 'DEV-000071'), ficha('b', 'DEV-000072')])} acao={vi.fn()} pendente />);
    for (const botao of screen.getAllByRole('button')) expect((botao as HTMLButtonElement).disabled).toBe(true);
  });
});
