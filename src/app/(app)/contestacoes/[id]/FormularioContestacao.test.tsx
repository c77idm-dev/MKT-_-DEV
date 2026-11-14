// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { EstadoEnvio } from './acoes';
import { FormularioContestacao } from './FormularioContestacao';

const FOTOS = [
  { id: 'f1', rotulo: 'Foto 1', url: '/api/arquivos?c=1', selecionada: true },
  { id: 'f3', rotulo: 'Foto 3 · unidade 1', url: null, selecionada: false },
];

beforeAll(() => {
  Element.prototype.scrollIntoView = () => undefined;
});

describe('FormularioContestacao (spec §6.6)', () => {
  it('vem preenchido com o motivo, a mensagem e as fotos escolhidas', () => {
    render(<FormularioContestacao acao={vi.fn()} motivo="SRF2" mensagem="Chegou quebrado." limiteMensagem={2000} fotos={FOTOS} />);
    expect((screen.getByLabelText('Motivo para o Mercado Livre') as HTMLSelectElement).value).toBe('SRF2');
    expect((screen.getByLabelText('Mensagem') as HTMLTextAreaElement).value).toBe('Chegou quebrado.');
    expect((screen.getByRole('checkbox', { name: 'Foto 1' }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole('checkbox', { name: 'Foto 3 · unidade 1' }) as HTMLInputElement).checked).toBe(false);
    expect(screen.getByText('Sem prévia')).toBeTruthy();
  });

  it('o 2º toque em "Enviar ao ML" manda motivo, mensagem e fotos; o erro aparece e recebe o foco', async () => {
    const acao = vi.fn(async (): Promise<EstadoEnvio> => ({ erros: ['O motivo "Produto avariado" exige pelo menos 1 foto.'] }));
    render(<FormularioContestacao acao={acao} motivo="SRF2" mensagem="Chegou quebrado." limiteMensagem={2000} fotos={FOTOS} />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Foto 1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Enviar ao ML' }));
    fireEvent.click(screen.getByRole('button', { name: 'Toque de novo para enviar ao ML' }));
    const alerta = await screen.findByRole('alert');
    expect(alerta.textContent).toContain('exige pelo menos 1 foto');
    await waitFor(() => expect(document.activeElement).toBe(alerta));
    const dados = (acao.mock.calls[0] as unknown as [EstadoEnvio, FormData])[1];
    expect(dados.get('motivo')).toBe('SRF2');
    expect(dados.get('mensagem')).toBe('Chegou quebrado.');
    expect(dados.getAll('foto')).toEqual([]);
  });
});
