// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { ContasBitbrain } from './ContasBitbrain';
import type { ContaVista, EstadoContasBitbrain } from './tipos-bitbrain';

const CONTAS: ContaVista[] = [
  { empresa: 'loja-1', nome: 'Loja 1', sellerId: '123', recebeDevolucoes: false, disponivel: true, ultimaSincronizacao: null, atrasada: false },
  { empresa: 'loja-2', nome: 'Loja 2', sellerId: '223', recebeDevolucoes: true, disponivel: false, ultimaSincronizacao: '18/11/2026 10:00', atrasada: false },
  { empresa: 'loja-3', nome: 'Loja 3', sellerId: '323', recebeDevolucoes: true, disponivel: true, ultimaSincronizacao: '18/11/2026 08:00', atrasada: true },
];

beforeAll(() => {
  Element.prototype.scrollIntoView = () => undefined;
});

describe('ContasBitbrain (§4.3)', () => {
  it('um cartão por conta, com os selos e o botão certo', () => {
    render(<ContasBitbrain contas={CONTAS} acao={vi.fn()} />);
    const loja1 = screen.getByRole('article', { name: 'Loja 1' });
    expect(loja1.textContent).toContain('Não recebe');
    expect(screen.getByRole('button', { name: 'Receber devoluções' })).toBeTruthy();
    const loja2 = screen.getByRole('article', { name: 'Loja 2' });
    expect(loja2.textContent).toContain('Indisponível no Bitbrain');
    expect(loja2.textContent).toContain('Recebe devoluções');
    expect(screen.getByRole('article', { name: 'Loja 3' }).textContent).toContain('Sincronização parada há mais de 1 hora');
    expect(screen.getAllByRole('button', { name: 'Parar de receber' })).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Sincronizar agora' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Atualizar contas' })).toBeTruthy();
  });

  it('marcar manda operacao, empresa e recebe; a resposta aparece em role=status', async () => {
    const acao = vi.fn(async (): Promise<EstadoContasBitbrain> => ({ erros: [], ok: 'A conta passa a mandar devoluções para a bancada.' }));
    render(<ContasBitbrain contas={CONTAS} acao={acao} />);
    fireEvent.click(screen.getByRole('button', { name: 'Receber devoluções' }));
    expect((await screen.findByRole('status')).textContent).toBe('A conta passa a mandar devoluções para a bancada.');
    const dados = (acao.mock.calls[0] as unknown as [EstadoContasBitbrain, FormData])[1];
    expect([dados.get('operacao'), dados.get('empresa'), dados.get('recebe')]).toEqual(['marcar', 'loja-1', 'sim']);
  });

  it('erro aparece em role=alert e recebe o foco', async () => {
    const acao = vi.fn(async (): Promise<EstadoContasBitbrain> => ({ erros: ['Bitbrain recusou: confira o BITBRAIN_TOKEN (HTTP 401).'], ok: null }));
    render(<ContasBitbrain contas={[]} acao={acao} />);
    expect(screen.getByText('Nenhuma conta do Bitbrain ainda. Toque em "Atualizar contas".')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Atualizar contas' }));
    const alerta = await screen.findByRole('alert');
    expect(alerta.textContent).toContain('BITBRAIN_TOKEN');
    await waitFor(() => expect(document.activeElement).toBe(alerta));
  });
});
