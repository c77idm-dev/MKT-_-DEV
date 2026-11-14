// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { RegistroEnvio } from '@/components/midia/filaEnvios';
import { SlotEvidencia } from './SlotEvidencia';

const registro = { idCliente: 'c1', arquivo: new Blob(['x']) } as RegistroEnvio;

describe('SlotEvidencia', () => {
  it('vaga vazia: botão grande que abre a câmera traseira', () => {
    const aoEscolher = vi.fn();
    render(<SlotEvidencia titulo="Foto 1" descricao="Etiqueta" estado={{ tipo: 'vazio' }} aoEscolher={aoEscolher} aoTentarDeNovo={vi.fn()} />);
    expect(screen.getByRole('group', { name: 'Foto 1' }).textContent).toContain('Falta');
    const entrada = screen.getByLabelText('Tirar Foto 1');
    expect(entrada.getAttribute('capture')).toBe('environment');
    expect(entrada.getAttribute('accept')).toBe('image/*');
    const arquivo = new File(['x'], 'f.jpg', { type: 'image/jpeg' });
    fireEvent.change(entrada, { target: { files: [arquivo] } });
    expect(aoEscolher).toHaveBeenCalledWith(arquivo);
  });

  it('enviando: barra de progresso com o valor', () => {
    render(<SlotEvidencia titulo="Foto 2" descricao="" estado={{ tipo: 'enviando', progresso: 0.5, registro }} aoEscolher={vi.fn()} aoTentarDeNovo={vi.fn()} />);
    expect(screen.getByRole('progressbar', { name: 'Envio da Foto 2' }).getAttribute('aria-valuenow')).toBe('50');
  });

  it('não enviada: mostra o motivo e "Tentar de novo"; com arquivo, o botão vira "de novo"', () => {
    const aoTentarDeNovo = vi.fn();
    render(
      <SlotEvidencia titulo="Foto 3" descricao="" estado={{ tipo: 'nao_enviada', mensagem: 'Foto grande demais', registro }} aoEscolher={vi.fn()} aoTentarDeNovo={aoTentarDeNovo} />,
    );
    expect(screen.getByRole('alert').textContent).toContain('Foto grande demais');
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(aoTentarDeNovo).toHaveBeenCalledWith('c1');
    expect(screen.getByLabelText('Tirar Foto 3 de novo')).toBeTruthy();
  });

  it('vídeo: gravar na hora (com capture) ou escolher um arquivo (sem capture)', () => {
    render(<SlotEvidencia video titulo="Vídeo de Prova" descricao="" estado={{ tipo: 'vazio' }} aoEscolher={vi.fn()} aoTentarDeNovo={vi.fn()} />);
    expect(screen.getByLabelText('Gravar Vídeo de Prova').getAttribute('capture')).toBe('environment');
    expect(screen.getByLabelText('Escolher arquivo de vídeo').hasAttribute('capture')).toBe(false);
  });
});
