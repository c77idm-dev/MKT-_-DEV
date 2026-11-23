// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { EstadoAcaoGestor } from './acoes';
import { FormularioEncerrar } from './AcoesGestor';

vi.mock('next/navigation', () => ({ useParams: () => ({ codigo: 'DEV-000437' }) }));

beforeAll(() => {
  Element.prototype.scrollIntoView = () => undefined;
});

const PERGUNTA = 'Tem certeza? A DEV-000437 sai da espera de chegada e isso não se desfaz pela tela.';

function montar() {
  const acao = vi.fn(async (): Promise<EstadoAcaoGestor> => ({ erros: [] }));
  const tela = render(<FormularioEncerrar acao={acao} />);
  return { acao, ...tela };
}

function escreverMotivo(texto = 'Cliente desistiu da devolução') {
  fireEvent.change(screen.getByLabelText('Motivo'), { target: { value: texto } });
}

describe('FormularioEncerrar (spec §5.2: Pendente de chegada → Cancelada ou Extraviada, só o Gestor)', () => {
  it('fica recolhido em "Mais ações do Gestor", fechado por padrão', () => {
    const { container } = montar();
    const bloco = container.querySelector('details');
    expect(bloco).not.toBeNull();
    expect(bloco?.open).toBe(false);
    expect(bloco?.querySelector('summary')?.textContent).toBe('Mais ações do Gestor');
    expect(screen.getByRole('heading', { name: 'Cancelar ou marcar como extraviada' })).toBeTruthy();
  });

  it('avisa que não é a chegada e leva ao Receber pacote (extra)', () => {
    montar();
    const aviso = screen.getByText(/Para registrar a chegada do pacote, use Receber pacote no Fluxo\./);
    expect(aviso.textContent).toContain('Isto não registra a chegada.');
    expect(aviso.textContent).toContain('(extra)');
    expect(screen.getByRole('link', { name: 'Ir para Receber pacote' }).getAttribute('href')).toBe('/fluxo/recebimento');
  });

  it('nenhuma opção vem marcada e o botão é neutro até a escolha', () => {
    montar();
    expect((screen.getByRole('radio', { name: 'Cancelada' }) as HTMLInputElement).checked).toBe(false);
    expect((screen.getByRole('radio', { name: 'Extraviada' }) as HTMLInputElement).checked).toBe(false);
    expect(screen.getByRole('button', { name: 'Escolha uma opção' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Registrar' })).toBeNull();
  });

  it('o texto do botão segue a escolha', () => {
    montar();
    fireEvent.click(screen.getByRole('radio', { name: 'Cancelada' }));
    expect(screen.getByRole('button', { name: 'Cancelar devolução' })).toBeTruthy();
    fireEvent.click(screen.getByRole('radio', { name: 'Extraviada' }));
    expect(screen.getByRole('button', { name: 'Marcar como extraviada' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Cancelar devolução' })).toBeNull();
  });

  it('sem escolha, mostra o erro em português, leva o foco à 1ª opção e não chama a ação', async () => {
    const { acao } = montar();
    escreverMotivo();
    fireEvent.click(screen.getByRole('button', { name: 'Escolha uma opção' }));
    expect(screen.getByRole('alert').textContent).toBe('Escolha se a devolução foi cancelada ou extraviada.');
    expect(document.activeElement).toBe(screen.getByRole('radio', { name: 'Cancelada' }));
    expect(screen.queryByText(PERGUNTA)).toBeNull();
    await new Promise((ok) => setTimeout(ok, 0));
    expect(acao).not.toHaveBeenCalled();
    // Escolher tira o erro.
    fireEvent.click(screen.getByRole('radio', { name: 'Cancelada' }));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('o 1º toque só mostra a confirmação (com o foco nela) e não chama a ação', async () => {
    const { acao } = montar();
    fireEvent.click(screen.getByRole('radio', { name: 'Cancelada' }));
    escreverMotivo();
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar devolução' }));
    const pergunta = screen.getByText(PERGUNTA);
    expect(document.activeElement).toBe(pergunta);
    expect(screen.getByRole('button', { name: 'Sim, cancelar devolução' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Voltar' })).toBeTruthy();
    await new Promise((ok) => setTimeout(ok, 0));
    expect(acao).not.toHaveBeenCalled();
  });

  it('"Voltar" fecha a confirmação, devolve o foco ao botão e não chama a ação', async () => {
    const { acao } = montar();
    fireEvent.click(screen.getByRole('radio', { name: 'Extraviada' }));
    escreverMotivo();
    fireEvent.click(screen.getByRole('button', { name: 'Marcar como extraviada' }));
    expect(screen.getByRole('button', { name: 'Sim, marcar como extraviada' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Voltar' }));
    expect(screen.queryByText(PERGUNTA)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Sim, marcar como extraviada' })).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Marcar como extraviada' }));
    await new Promise((ok) => setTimeout(ok, 0));
    expect(acao).not.toHaveBeenCalled();
  });

  it('trocar a escolha durante a confirmação volta ao 1º passo', () => {
    montar();
    fireEvent.click(screen.getByRole('radio', { name: 'Cancelada' }));
    escreverMotivo();
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar devolução' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Extraviada' }));
    expect(screen.queryByText(PERGUNTA)).toBeNull();
    expect(screen.getByRole('button', { name: 'Marcar como extraviada' })).toBeTruthy();
  });

  it('o 2º toque chama a ação com o novo status e o motivo (Cancelada)', async () => {
    const { acao } = montar();
    fireEvent.click(screen.getByRole('radio', { name: 'Cancelada' }));
    escreverMotivo('Cliente desistiu da devolução');
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar devolução' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sim, cancelar devolução' }));
    await vi.waitFor(() => expect(acao).toHaveBeenCalledTimes(1));
    const dados = (acao.mock.calls[0] as unknown as [EstadoAcaoGestor, FormData])[1];
    expect(dados.get('para')).toBe('CANCELADA');
    expect(dados.get('motivo')).toBe('Cliente desistiu da devolução');
  });

  it('o 2º toque chama a ação com o novo status e o motivo (Extraviada)', async () => {
    const { acao } = montar();
    fireEvent.click(screen.getByRole('radio', { name: 'Extraviada' }));
    escreverMotivo('Correios confirmaram o extravio');
    fireEvent.click(screen.getByRole('button', { name: 'Marcar como extraviada' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sim, marcar como extraviada' }));
    await vi.waitFor(() => expect(acao).toHaveBeenCalledTimes(1));
    const dados = (acao.mock.calls[0] as unknown as [EstadoAcaoGestor, FormData])[1];
    expect(dados.get('para')).toBe('EXTRAVIADA');
    expect(dados.get('motivo')).toBe('Correios confirmaram o extravio');
  });
});
