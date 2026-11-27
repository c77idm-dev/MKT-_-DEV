// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TRAVA_TOQUE_DUPLO_MS } from '@/components/venda/useTravaToqueDuplo';
import type { CartaoFila, FilaBancada as Fila } from '@/modules/bancada/fila';

const mocks = vi.hoisted(() => ({ abrirConferencia: vi.fn() }));
vi.mock('../fluxo/conferencia/acoes', () => ({ abrirConferenciaAcao: mocks.abrirConferencia }));

import { FilaBancada } from './FilaBancada';

function cartao(codigo: string, mudancas: Partial<CartaoFila> = {}): CartaoFila {
  return {
    id: `id-${codigo}`,
    codigo,
    titulo: `Produto ${codigo}`,
    chegouEm: new Date('2026-11-27T13:30:00Z'),
    urgenteML: false,
    naoIdentificada: false,
    foto: null,
    selos: [],
    ...mudancas,
  };
}

const VAZIA: Fila = { esperando: [], totalEsperando: 0, continuar: [], retiradas: [] };

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['performance'] });
  mocks.abrirConferencia.mockReset().mockResolvedValue({ erros: [] });
});
afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

describe('FilaBancada (E29)', () => {
  it('"Esperando conferência (N)": cada devolução com "Conferir", que abre a conferência dela', async () => {
    render(
      <FilaBancada
        fila={{
          ...VAZIA,
          esperando: [cartao('DEV-000002', { urgenteML: true, selos: [{ texto: 'Urgente', tom: 'erro' }] }), cartao('DEV-000001')],
          totalEsperando: 2,
        }}
      />,
    );
    const secao = screen.getByRole('region', { name: 'Esperando conferência (2)' });
    const itens = within(secao).getAllByRole('listitem');
    expect(itens.map((i) => within(i).getByRole('link', { name: /^DEV-/ }).textContent)).toEqual(['DEV-000002', 'DEV-000001']);
    expect(within(itens[0]).getByText('Urgente')).toBeTruthy();
    expect(within(itens[0]).getByText('Produto DEV-000002')).toBeTruthy();
    expect(within(itens[0]).getByRole('link', { name: 'DEV-000002' }).getAttribute('href')).toBe('/fluxo/devolucoes/DEV-000002');
    const conferir = within(itens[1]).getByRole('button', { name: 'Conferir DEV-000001' });
    act(() => vi.advanceTimersByTime(TRAVA_TOQUE_DUPLO_MS));
    await act(async () => fireEvent.click(conferir));
    expect(Object.fromEntries((mocks.abrirConferencia.mock.calls[0][1] as FormData).entries())).toEqual({ codigo: 'DEV-000001' });
  });

  it('as conferências da pessoa aparecem primeiro, com "Continuar" para a tela da conferência', () => {
    render(<FilaBancada fila={{ ...VAZIA, continuar: [cartao('DEV-000005')], esperando: [cartao('DEV-000001')], totalEsperando: 1 }} />);
    const secao = screen.getByRole('region', { name: 'Esperando conferência (1)' });
    const itens = within(secao).getAllByRole('listitem');
    const continuar = within(itens[0]).getByRole('link', { name: 'Continuar DEV-000005' });
    expect(continuar.getAttribute('href')).toBe('/fluxo/devolucoes/DEV-000005/conferencia');
    expect(within(itens[0]).getByText('Em conferência com você')).toBeTruthy();
    expect(within(itens[1]).getByRole('button', { name: 'Conferir DEV-000001' })).toBeTruthy();
  });

  it('a não identificada não tem "Conferir": espera o Gestor', () => {
    render(<FilaBancada fila={{ ...VAZIA, esperando: [cartao('DEV-000009', { naoIdentificada: true, titulo: 'Pacote não identificado' })], totalEsperando: 1 }} />);
    const item = within(screen.getByRole('region', { name: 'Esperando conferência (1)' })).getByRole('listitem');
    expect(within(item).queryByRole('button')).toBeNull();
    expect(item.textContent).toContain('O Gestor liga ao pedido antes da conferência.');
  });

  it('mostra quantas ficaram de fora quando a lista é longa', () => {
    render(<FilaBancada fila={{ ...VAZIA, esperando: [cartao('DEV-000001')], totalEsperando: 51 }} />);
    expect(screen.getByRole('region', { name: 'Esperando conferência (51)' }).textContent).toContain('Mostrando 1 de 51');
  });

  it('"Retirada do Full aberta": cada uma com "Continuar"', () => {
    render(
      <FilaBancada
        fila={{ ...VAZIA, retiradas: [{ id: 'r1', codigo: 'RF-000003', codigoEtiqueta: '48609944489', abertaEm: new Date('2026-11-27T13:00:00Z') }] }}
      />,
    );
    const secao = screen.getByRole('region', { name: 'Retirada do Full aberta' });
    expect(secao.textContent).toContain('48609944489');
    expect(within(secao).getByRole('link', { name: 'Continuar RF-000003' }).getAttribute('href')).toBe('/fluxo/retiradas-full/RF-000003');
  });

  it('cada lista vazia tem um texto curto', () => {
    render(<FilaBancada fila={VAZIA} />);
    expect(screen.getByRole('region', { name: 'Esperando conferência (0)' }).textContent).toContain('Nenhuma devolução esperando conferência.');
    expect(screen.getByRole('region', { name: 'Retirada do Full aberta' }).textContent).toContain('Nenhuma retirada do Full aberta.');
  });
});
