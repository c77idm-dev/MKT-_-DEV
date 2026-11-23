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
  pedidos: '2000001, 2000002',
  reclamacaoId: '5200000001',
  motivo: 'SRF2' as const,
  rotuloMotivo: 'Produto avariado',
  mensagem: 'Na conferência da devolução DEV-000001 encontramos:\n- Unidade 1: avariado.',
  fotos: FOTOS,
  video: '/api/arquivos?c=video',
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
    expect(screen.getByText(/Abra no ML a venda 2000001, 2000002 \(reclamação 5200000001\)/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Copiar' })).toBeTruthy();
    const baixar = screen.getAllByRole('link', { name: /^Baixar Foto/ });
    expect(baixar).toHaveLength(1);
    expect(baixar[0].getAttribute('download')).toBe('DEV-000001-1.jpg');
    expect(baixar[0].getAttribute('href')).toBe('/api/arquivos?c=1');
  });

  it('(extra) junto das fotos: o dossiê de provas em PDF e o vídeo, que vai separado', () => {
    render(<RespondaNoML acao={vi.fn()} {...props} />);
    const dossie = screen.getByRole('link', { name: 'Baixar dossiê de provas (PDF)' });
    expect(dossie.getAttribute('href')).toBe('/api/devolucoes/DEV-000001/dossie');
    expect(dossie.hasAttribute('download')).toBe(false);
    expect(screen.getByText('(extra) Tudo da devolução num arquivo só, para anexar na resposta ao ML.')).toBeTruthy();
    expect(screen.getByText('O vídeo vai separado: o ML não aceita vídeo dentro do PDF.')).toBeTruthy();
    const video = screen.getByRole('link', { name: 'Baixar vídeo' });
    expect(video.getAttribute('href')).toBe('/api/arquivos?c=video');
    expect(video.getAttribute('download')).toBe('DEV-000001-video.mp4');
    // O passo a passo cita o dossiê e o vídeo à parte, e avisa da validade dos links (como o detalhe).
    expect(screen.getByText(/cole a mensagem e anexe o dossiê de provas \(PDF\) ou as fotos e, à parte, o vídeo \(extra\)\. Depois/)).toBeTruthy();
    expect(screen.getByText('Os links das fotos e do vídeo valem 10 minutos. Para gerar novos, recarregue a página.')).toBeTruthy();
  });

  it('sem vídeo pronto: avisa em vez do link', () => {
    render(<RespondaNoML acao={vi.fn()} {...props} video={null} />);
    expect(screen.queryByRole('link', { name: 'Baixar vídeo' })).toBeNull();
    expect(screen.getByText('Nenhum vídeo pronto desta devolução.')).toBeTruthy();
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
