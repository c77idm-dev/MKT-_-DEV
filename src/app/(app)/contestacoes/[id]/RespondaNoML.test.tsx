// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { EstadoEnvio } from './acoes';
import { RespondaNoML } from './RespondaNoML';

const FOTOS = [
  { id: 'f1', rotulo: 'Foto 1', url: '/api/arquivos?c=1' },
  { id: 'f3', rotulo: 'Foto 3 · unidade 1', url: null },
];
const props = {
  codigo: 'DEV-000001',
  conta: 'Loja 1',
  motivo: 'SRF2' as const,
  rotuloMotivo: 'Produto avariado',
  mensagem: 'Na conferência da devolução DEV-000001 encontramos:\n- Unidade 1: avariado.',
  fotos: FOTOS,
};

beforeAll(() => {
  Element.prototype.scrollIntoView = () => undefined;
});

describe('RespondaNoML (§4.6)', () => {
  it('mostra o motivo, a mensagem, a conta, "Copiar" e só as fotos prontas, para baixar', () => {
    render(<RespondaNoML acao={vi.fn()} {...props} />);
    expect(screen.getByRole('heading', { name: 'Responda no ML' })).toBeTruthy();
    expect(screen.getByText('SRF2')).toBeTruthy();
    expect(screen.getByText(/Produto avariado/)).toBeTruthy();
    expect(screen.getByText(/na conta Loja 1/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Copiar' })).toBeTruthy();
    const baixar = screen.getAllByRole('link', { name: /^Baixar/ });
    expect(baixar).toHaveLength(1);
    expect(baixar[0].getAttribute('download')).toBe('DEV-000001-1.jpg');
    expect(baixar[0].getAttribute('href')).toBe('/api/arquivos?c=1');
  });

  it('"Marcar como respondida" pede o 2º toque e chama a ação', () => {
    const acao = vi.fn(async (): Promise<EstadoEnvio> => ({ erros: [] }));
    render(<RespondaNoML acao={acao} {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Marcar como respondida' }));
    expect(acao).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Toque de novo para marcar como respondida' }));
    expect(acao).toHaveBeenCalledTimes(1);
  });
});
