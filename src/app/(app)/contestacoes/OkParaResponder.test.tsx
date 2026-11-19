// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { OkParaResponder } from './OkParaResponder';
import type { EstadoOk, OkVista } from './tipos';

const ITENS: OkVista[] = [
  {
    devolucaoId: '11111111-1111-4111-8111-111111111111',
    codigo: 'DEV-000007',
    pedidos: '2000000200000001',
    reclamacaoId: '5200000001',
    conta: 'Loja 1',
    selo: { texto: 'Prazo 20/11/2026 23:59', tom: 'atencao' },
  },
];

beforeAll(() => {
  Element.prototype.scrollIntoView = () => undefined;
});

describe('OkParaResponder (extra, §4.6)', () => {
  it('um cartão por devolução, com pedido, reclamação, conta e prazo; vazio tem aviso', () => {
    const { unmount } = render(<OkParaResponder itens={ITENS} acao={vi.fn()} />);
    const cartao = screen.getByRole('article', { name: 'DEV-000007' });
    for (const texto of ['2000000200000001', '5200000001', 'Loja 1', 'Prazo 20/11/2026 23:59']) expect(cartao.textContent).toContain(texto);
    unmount();
    render(<OkParaResponder itens={[]} acao={vi.fn()} />);
    expect(screen.getByText('Nenhum "OK" para responder no ML.')).toBeTruthy();
  });

  it('2 toques em "Marcar como respondido" mandam a devolução; a resposta aparece em role=status', async () => {
    const acao = vi.fn(async (): Promise<EstadoOk> => ({ erros: [], ok: '"OK" marcado como respondido no ML.' }));
    render(<OkParaResponder itens={ITENS} acao={acao} />);
    fireEvent.click(screen.getByRole('button', { name: 'Marcar como respondido' }));
    fireEvent.click(screen.getByRole('button', { name: 'Toque de novo para marcar como respondido' }));
    // O BotaoConfirmar também tem um role="status" (vazio): procure pelo texto e confira o papel.
    expect((await screen.findByText('"OK" marcado como respondido no ML.')).getAttribute('role')).toBe('status');
    expect((acao.mock.calls[0] as unknown as [EstadoOk, FormData])[1].get('devolucao')).toBe(ITENS[0].devolucaoId);
  });
});
