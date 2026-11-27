// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ResultadoRestaurar } from './acoes';
import { ListaApagadas, type ApagadaVista } from './ListaApagadas';

const ITENS: ApagadaVista[] = [
  {
    tipo: 'devolucao',
    id: 'd1',
    codigo: 'DEV-000123',
    situacao: 'Aguardando NF',
    apagadaEmTexto: '26/11/2026 10:00',
    apagadaPorNome: 'Gestora Teste',
    diasParaSumir: 89,
    href: '/fluxo/devolucoes/DEV-000123',
  },
  {
    tipo: 'retirada',
    id: 'r1',
    codigo: 'RF-000007',
    situacao: 'Conferida',
    apagadaEmTexto: '20/11/2026 08:30',
    apagadaPorNome: null,
    diasParaSumir: 1,
    href: '/fluxo/retiradas-full/RF-000007',
  },
];

function montar(restaurar = vi.fn(async (): Promise<ResultadoRestaurar> => ({ ok: true, aviso: null })), itens = ITENS) {
  render(<ListaApagadas itens={itens} restaurar={restaurar} />);
  return restaurar;
}

function linha(codigo: string) {
  return screen.getAllByRole('listitem').find((li) => li.textContent?.includes(codigo))!;
}

describe('ListaApagadas (E29)', () => {
  it('cada item mostra o código (link para ver), o tipo, onde estava, quem e quando apagou e quando some de vez', () => {
    montar();
    const dev = linha('DEV-000123');
    expect(within(dev).getByRole('link', { name: 'DEV-000123' }).getAttribute('href')).toBe('/fluxo/devolucoes/DEV-000123');
    expect(dev.textContent).toContain('Devolução');
    expect(dev.textContent).toContain('Estava em: Aguardando NF');
    expect(dev.textContent).toContain('Apagada em 26/11/2026 10:00 por Gestora Teste');
    expect(dev.textContent).toContain('Some de vez em 89 dias');
    const ret = linha('RF-000007');
    expect(ret.textContent).toContain('Retirada do Full');
    expect(ret.textContent).toContain('Apagada em 20/11/2026 08:30');
    expect(ret.textContent).not.toContain(' por ');
    expect(ret.textContent).toContain('Some de vez em 1 dia');
  });

  it('a lista vazia tem um texto curto', () => {
    montar(undefined, []);
    expect(screen.getByText('Nada apagado nos últimos 90 dias.')).toBeTruthy();
  });

  it('"Restaurar" chama a ação com o tipo e o id e mostra a confirmação (com o foco) e o aviso', async () => {
    const restaurar = montar(vi.fn(async (): Promise<ResultadoRestaurar> => ({ ok: true, aviso: 'O pedido 123 também está na devolução DEV-000009, em andamento.' })));
    fireEvent.click(within(linha('DEV-000123')).getByRole('button', { name: 'Restaurar DEV-000123' }));
    await vi.waitFor(() => expect(screen.getByRole('status').textContent).toBe('DEV-000123 restaurada. Ela voltou para Aguardando NF.'));
    expect(restaurar).toHaveBeenCalledWith('devolucao', 'd1');
    expect(document.activeElement).toBe(screen.getByRole('status'));
    expect(screen.getByText('O pedido 123 também está na devolução DEV-000009, em andamento.')).toBeTruthy();
  });

  it('a recusa do servidor aparece num alerta na linha', async () => {
    const restaurar = montar(vi.fn(async (): Promise<ResultadoRestaurar> => ({ ok: false, mensagem: 'Esta retirada não está apagada.' })));
    fireEvent.click(within(linha('RF-000007')).getByRole('button', { name: 'Restaurar RF-000007' }));
    await vi.waitFor(() => expect(within(linha('RF-000007')).getByRole('alert').textContent).toBe('Esta retirada não está apagada.'));
    expect(restaurar).toHaveBeenCalledWith('retirada', 'r1');
    expect(screen.queryByRole('status')).toBeNull();
  });
});
