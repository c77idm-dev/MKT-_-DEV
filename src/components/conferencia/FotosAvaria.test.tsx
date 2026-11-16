// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { RegistroEnvio } from '@/components/midia/filaEnvios';
import type { FotoExtra } from './estadoSlot';
import { FotosAvaria } from './FotosAvaria';

const registro = (idCliente: string) => ({ idCliente, arquivo: new Blob(['x']) }) as RegistroEnvio;
const enviada = (id: string): FotoExtra => ({ chave: id, estado: { tipo: 'enviada', pronta: false, url: null }, alvo: { tipo: 'servidor', evidenciaId: id } });

function renderizar(fotos: FotoExtra[], extra: Partial<Parameters<typeof FotosAvaria>[0]> = {}) {
  const props = { fotos, aoEscolher: vi.fn(), aoTentarDeNovo: vi.fn(), aoRemover: vi.fn(async () => null as string | null), ...extra };
  render(<FotosAvaria {...props} />);
  return props;
}

describe('FotosAvaria (melhoria 2)', () => {
  it('Adicionar foto entrega o arquivo da câmera', () => {
    const p = renderizar([]);
    expect(screen.getByRole('heading', { name: 'Fotos da avaria (opcional)' })).toBeTruthy();
    const entrada = screen.getByLabelText('Adicionar foto');
    expect(entrada.getAttribute('capture')).toBe('environment');
    expect(entrada.getAttribute('accept')).toBe('image/*');
    const arquivo = new File(['x'], 'f.jpg', { type: 'image/jpeg' });
    fireEvent.change(entrada, { target: { files: [arquivo] } });
    expect(p.aoEscolher).toHaveBeenCalledWith(arquivo);
  });

  it('mostra o andamento de cada foto: progressbar, ✓ Enviada, Aguardando conexão e erro com Tentar de novo', () => {
    const p = renderizar([
      { chave: 'c1', estado: { tipo: 'enviando', progresso: 0.5, registro: registro('c1') }, alvo: { tipo: 'local', idCliente: 'c1' } },
      enviada('e2'),
      { chave: 'c3', estado: { tipo: 'aguardando', mensagem: 'Sem conexão', registro: registro('c3') }, alvo: { tipo: 'local', idCliente: 'c3' } },
      { chave: 'c4', estado: { tipo: 'nao_enviada', mensagem: 'Limite de 6 fotos', registro: registro('c4') }, alvo: { tipo: 'local', idCliente: 'c4' } },
    ]);
    expect(screen.getByRole('progressbar', { name: 'Envio da foto da avaria 1' }).getAttribute('aria-valuenow')).toBe('50');
    expect(screen.getByRole('group', { name: 'Foto da avaria 2' }).textContent).toContain('✓ Enviada');
    expect(screen.getByRole('group', { name: 'Foto da avaria 3' }).textContent).toContain('Aguardando conexão');
    const quarta = screen.getByRole('group', { name: 'Foto da avaria 4' });
    expect(within(quarta).getByRole('alert').textContent).toContain('Limite de 6 fotos');
    fireEvent.click(within(quarta).getByRole('button', { name: 'Tentar de novo' }));
    expect(p.aoTentarDeNovo).toHaveBeenCalledWith('c4');
  });

  it('Remover pede um segundo toque; Cancelar desfaz; Confirmar remoção chama aoRemover', async () => {
    const fotos = [enviada('e1'), enviada('e2')];
    const p = renderizar(fotos);
    const segunda = screen.getByRole('group', { name: 'Foto da avaria 2' });
    fireEvent.click(within(segunda).getByRole('button', { name: 'Remover' }));
    expect(p.aoRemover).not.toHaveBeenCalled();
    fireEvent.click(within(segunda).getByRole('button', { name: 'Cancelar' }));
    expect(within(segunda).queryByRole('button', { name: 'Confirmar remoção' })).toBeNull();
    fireEvent.click(within(segunda).getByRole('button', { name: 'Remover' }));
    fireEvent.click(within(segunda).getByRole('button', { name: 'Confirmar remoção' }));
    await waitFor(() => expect(p.aoRemover).toHaveBeenCalledWith(fotos[1]));
  });

  it('erro ao remover aparece em role=alert com foco', async () => {
    renderizar([enviada('e1')], { aoRemover: vi.fn(async () => 'Sem conexão: a remoção precisa de internet.') });
    fireEvent.click(screen.getByRole('button', { name: 'Remover' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar remoção' }));
    const alerta = await screen.findByRole('alert');
    expect(alerta.textContent).toContain('Sem conexão: a remoção precisa de internet.');
    await waitFor(() => expect(document.activeElement).toBe(alerta));
  });

  it('com 6 fotos, esconde Adicionar foto e mostra o limite', () => {
    renderizar(['e1', 'e2', 'e3', 'e4', 'e5', 'e6'].map(enviada));
    expect(screen.queryByLabelText('Adicionar foto')).toBeNull();
    expect(screen.getByText('Limite de 6 fotos da avaria nesta unidade.')).toBeTruthy();
    expect(screen.getAllByRole('group')).toHaveLength(6);
  });
});
