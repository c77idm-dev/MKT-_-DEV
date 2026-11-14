// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { FalhaVista } from '@/modules/acabamento/falhas';
import { ListaFalhas } from './ListaFalhas';

const falha: FalhaVista = {
  id: '0b9f1c2e-3d4a-4b5c-8d6e-7f8091a2b3c4', tarefa: 'nfe.emitir', rotuloTarefa: 'Emitir NF-e', erro: 'Focus fora do ar',
  tentativas: 5, ocorrencias: 3, primeiraFalhaEm: '20/11/2026 10:00', ultimaFalhaEm: '20/11/2026 11:00',
  referencia: { texto: 'DEV-000123', href: '/fluxo/devolucoes/DEV-000123' },
};

describe('ListaFalhas (spec §6.8)', () => {
  it('cartão com a tarefa, o motivo, as ocorrências e a referência', () => {
    render(<ListaFalhas falhas={[falha]} acao={vi.fn()} />);
    const cartao = screen.getByRole('article', { name: 'Emitir NF-e' });
    expect(cartao.textContent).toContain('Focus fora do ar');
    expect(cartao.textContent).toContain('Falhou 3 vezes');
    expect(screen.getByRole('link', { name: 'DEV-000123' }).getAttribute('href')).toBe('/fluxo/devolucoes/DEV-000123');
  });

  it('"Tentar de novo" manda a operação e o id; a mensagem fica quando o cartão some', async () => {
    const acao = vi.fn(async (_e: unknown, dados: FormData) => {
      expect([dados.get('operacao'), dados.get('falha')]).toEqual(['reenviar', falha.id]);
      return { erros: [], ok: 'Tarefa "Emitir NF-e" reenviada. Ela roda em instantes.' };
    });
    const { rerender, container } = render(<ListaFalhas falhas={[falha]} acao={acao} />);
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(await screen.findByText('Tarefa "Emitir NF-e" reenviada. Ela roda em instantes.')).toBeTruthy();
    rerender(<ListaFalhas falhas={[]} acao={acao} />);
    expect(screen.getByText('Tarefa "Emitir NF-e" reenviada. Ela roda em instantes.')).toBeTruthy();
    expect(container.querySelector('#retorno-falhas')?.getAttribute('aria-live')).toBe('polite');
  });

  it('"Dispensar" pede o segundo toque (extra)', async () => {
    const acao = vi.fn(async () => ({ erros: [], ok: 'Falha dispensada.' }));
    render(<ListaFalhas falhas={[falha]} acao={acao} />);
    fireEvent.click(screen.getByRole('button', { name: 'Dispensar' }));
    expect(acao).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Toque de novo para dispensar' }));
    expect(await screen.findByText('Falha dispensada.')).toBeTruthy();
    expect((acao.mock.calls[0] as unknown as [unknown, FormData])[1].get('operacao')).toBe('dispensar');
  });

  it('sem falhas', () => {
    render(<ListaFalhas falhas={[]} acao={vi.fn()} />);
    expect(screen.getByText('Nenhuma tarefa em Falhas.')).toBeTruthy();
  });
});
