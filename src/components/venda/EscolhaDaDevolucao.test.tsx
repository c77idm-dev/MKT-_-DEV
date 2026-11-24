// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FichaVenda } from '@/modules/mercado-livre/ficha-venda';
import { EscolhaDaDevolucao } from './EscolhaDaDevolucao';
import { TRAVA_TOQUE_DUPLO_MS, useTravaToqueDuplo } from './useTravaToqueDuplo';

function ficha(devolucaoId: string, codigo: string, descricao: string): FichaVenda {
  return {
    devolucaoId,
    codigo,
    status: 'PENDENTE_CHEGADA',
    conta: null,
    motivo: null,
    situacaoReclamacao: null,
    temReclamacao: true,
    vendas: [],
    produtos: [{ sku: `SKU-${devolucaoId}`, descricao, fotoUrl: null, quantidade: 1 }],
  };
}

afterEach(cleanup);

describe('EscolhaDaDevolucao (extra, E27)', () => {
  it('uma devolução: a ficha da venda com o código DEV e o botão', () => {
    render(<EscolhaDaDevolucao fichas={[ficha('a', 'DEV-000001', 'Fone')]} acao={(f) => <button type="button">Dar chegada {f.codigo}</button>} />);
    expect(screen.getByText('DEV-000001')).toBeTruthy();
    expect(screen.getByText('Os dados da venda ainda não chegaram do ML.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Dar chegada DEV-000001' })).toBeTruthy();
    expect(screen.queryByRole('list', { name: 'Devoluções do pedido' })).toBeNull();
  });

  it('mais de uma: a lista com código, produto e um botão em cada', () => {
    render(
      <EscolhaDaDevolucao
        fichas={[ficha('a', 'DEV-000001', 'Fone'), ficha('b', 'DEV-000002', 'Cabo')]}
        acao={(f) => <button type="button">Dar chegada {f.codigo}</button>}
      />,
    );
    const itens = within(screen.getByRole('list', { name: 'Devoluções do pedido' })).getAllByRole('listitem');
    expect(itens).toHaveLength(2);
    expect(itens[0].textContent).toContain('DEV-000001');
    expect(itens[0].textContent).toContain('Fone');
    expect(within(itens[1]).getByRole('button', { name: 'Dar chegada DEV-000002' })).toBeTruthy();
  });
});

describe('useTravaToqueDuplo (extra, E27)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['performance'] });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function Botao({ aoEnviar }: { aoEnviar: () => void }) {
    const cedoDemais = useTravaToqueDuplo();
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!cedoDemais()) aoEnviar();
        }}
      >
        <button type="submit">Dar chegada</button>
      </form>
    );
  }

  it('o toque antes de o botão ficar 0,7 s na tela não vale (toque duplo); depois, vale', () => {
    const aoEnviar = vi.fn();
    render(<Botao aoEnviar={aoEnviar} />);
    fireEvent.click(screen.getByRole('button', { name: 'Dar chegada' }));
    act(() => vi.advanceTimersByTime(TRAVA_TOQUE_DUPLO_MS - 100));
    fireEvent.click(screen.getByRole('button', { name: 'Dar chegada' }));
    expect(aoEnviar).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(100));
    fireEvent.click(screen.getByRole('button', { name: 'Dar chegada' }));
    expect(aoEnviar).toHaveBeenCalledTimes(1);
  });

  it('remontado (outra leitura), a trava recomeça', () => {
    const aoEnviar = vi.fn();
    const { rerender } = render(<Botao key="1" aoEnviar={aoEnviar} />);
    act(() => vi.advanceTimersByTime(TRAVA_TOQUE_DUPLO_MS));
    rerender(<Botao key="2" aoEnviar={aoEnviar} />);
    fireEvent.click(screen.getByRole('button', { name: 'Dar chegada' }));
    expect(aoEnviar).not.toHaveBeenCalled();
  });
});
