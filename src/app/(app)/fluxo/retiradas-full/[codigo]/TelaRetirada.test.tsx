// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ItemRetiradaVista } from '@/modules/retiradas/consultas';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock('@/components/conferencia/LeitorCodigo', () => ({ LeitorCodigo: () => null }));
vi.mock('@/components/midia/useFilaEnvios', () => ({
  useFilaEnvios: () => ({ envios: [], concluidos: [], adicionar: vi.fn(), tentarDeNovo: vi.fn(), descartar: vi.fn() }),
}));

import { TelaRetirada, type AcoesRetirada } from './TelaRetirada';

const RETIRADA = { id: 'r1', codigo: 'RF-000001', codigoEtiqueta: 'FULL123' };

function item(p: Partial<ItemRetiradaVista> = {}): ItemRetiradaVista {
  return { id: 'i1', produtoId: 'p1', sku: 'SKU1', descricao: 'Fone Bluetooth', eanLido: '789', quantidade: 1, semCadastro: false, ...p };
}

function acoesDe(parcial: Partial<AcoesRetirada> = {}): AcoesRetirada {
  return {
    bipar: vi.fn(async () => ({ ok: true as const, itens: [item()] })),
    quantidade: vi.fn(async () => ({ ok: true as const, itens: [item()] })),
    remover: vi.fn(async () => ({ ok: true as const, itens: [] })),
    concluir: vi.fn(async () => ({ ok: true as const, itens: [] })),
    ...parcial,
  };
}

afterEach(cleanup);

describe('TelaRetirada (melhoria 3)', () => {
  it('avisa que não é devolução', () => {
    render(<TelaRetirada retirada={RETIRADA} itensIniciais={[]} evidencias={[]} acoes={acoesDe()} />);
    expect(screen.getByText('Isto não é devolução. Confira os itens e guarde no estoque.')).toBeTruthy();
  });

  it('Concluir sem foto nem item mostra as pendências em alerta, com o foco nelas, sem chamar o servidor', async () => {
    const acoes = acoesDe();
    render(<TelaRetirada retirada={RETIRADA} itensIniciais={[]} evidencias={[]} acoes={acoes} />);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Concluir retirada' })));
    const alerta = screen.getByRole('alert');
    expect(alerta.textContent).toContain('Tire a foto da etiqueta.');
    expect(alerta.textContent).toContain('Bipe pelo menos 1 produto.');
    expect(document.activeElement).toBe(alerta);
    expect(acoes.concluir).not.toHaveBeenCalled();
  });

  it('EAN sem cadastro pede a descrição curta e inclui o item com o selo "sem cadastro"', async () => {
    const bipar = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, itens: [], pedirDescricao: '555' })
      .mockResolvedValueOnce({ ok: true, itens: [item({ id: 'i2', produtoId: null, sku: null, descricao: 'Cabo USB-C', eanLido: '555', semCadastro: true })] });
    render(<TelaRetirada retirada={RETIRADA} itensIniciais={[]} evidencias={[]} acoes={acoesDe({ bipar })} />);
    fireEvent.change(screen.getByLabelText('EAN do produto'), { target: { value: '555' } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Somar' })));
    expect(bipar).toHaveBeenCalledWith('r1', '555', null);
    fireEvent.change(screen.getByLabelText('Descrição curta'), { target: { value: 'Cabo USB-C' } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Incluir sem cadastro' })));
    expect(bipar).toHaveBeenLastCalledWith('r1', '555', 'Cabo USB-C');
    expect(screen.getByText('sem cadastro')).toBeTruthy();
    expect(screen.queryByLabelText('Descrição curta')).toBeNull();
  });

  it('Remover pede o segundo toque antes de tirar o item', async () => {
    const acoes = acoesDe();
    render(<TelaRetirada retirada={RETIRADA} itensIniciais={[item()]} evidencias={[]} acoes={acoes} />);
    fireEvent.click(screen.getByRole('button', { name: 'Remover Fone Bluetooth' }));
    expect(acoes.remover).not.toHaveBeenCalled();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Toque de novo para remover Fone Bluetooth' })));
    expect(acoes.remover).toHaveBeenCalledWith('r1', 'i1');
  });

  it('o − fica desabilitado com 1 e o + chama o servidor', async () => {
    const acoes = acoesDe();
    render(<TelaRetirada retirada={RETIRADA} itensIniciais={[item()]} evidencias={[]} acoes={acoes} />);
    expect((screen.getByRole('button', { name: 'Diminuir Fone Bluetooth' }) as HTMLButtonElement).disabled).toBe(true);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Aumentar Fone Bluetooth' })));
    expect(acoes.quantidade).toHaveBeenCalledWith('r1', 'i1', 1);
  });
});
