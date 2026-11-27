// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { FormularioConfirmado } from './FormularioConfirmado';
import { TRAVA_TOQUE_DUPLO_MS } from './venda/useTravaToqueDuplo';

type Estado = { erros: string[] };

beforeAll(() => {
  Element.prototype.scrollIntoView = () => undefined;
});

// Só o performance.now é falso: a trava do toque duplo conta o tempo por ele, e os timers do React seguem reais.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['performance'] });
});
afterEach(() => {
  vi.useRealTimers();
});

const PERGUNTA = 'Tem certeza? A DEV-000437 vai para Apagadas.';

function montar(acao = vi.fn(async (): Promise<Estado> => ({ erros: [] }))) {
  render(
    <FormularioConfirmado
      acao={acao}
      id="apagar"
      titulo="Apagar"
      descricao="Some de tudo e fica 90 dias em Apagadas."
      botao="Apagar devolução"
      pergunta={PERGUNTA}
      confirmar="Sim, apagar"
      enviando="Apagando…"
    />,
  );
  return acao;
}

async function semEnvio(acao: ReturnType<typeof vi.fn>) {
  await new Promise((ok) => setTimeout(ok, 0));
  expect(acao).not.toHaveBeenCalled();
}

describe('FormularioConfirmado (o passo de confirmação da E24, nas correções do Gestor)', () => {
  it('mostra o título, o que faz e o botão vermelho; a pergunta só depois do 1º toque', () => {
    montar();
    expect(screen.getByRole('heading', { name: 'Apagar' })).toBeTruthy();
    expect(screen.getByText('Some de tudo e fica 90 dias em Apagadas.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Apagar devolução' }).className).toContain('text-erro');
    expect(screen.queryByText(PERGUNTA)).toBeNull();
  });

  it('o 1º toque só abre a pergunta, com o foco nela, e não chama a ação', async () => {
    const acao = montar();
    fireEvent.click(screen.getByRole('button', { name: 'Apagar devolução' }));
    expect(document.activeElement).toBe(screen.getByText(PERGUNTA));
    expect(screen.getByRole('button', { name: 'Sim, apagar' }).className).toContain('text-erro');
    await semEnvio(acao);
  });

  it('o "Sim" tocado antes de a pergunta ficar 0,7 s na tela não vale (toque duplo); depois, envia uma vez', async () => {
    const acao = montar();
    fireEvent.click(screen.getByRole('button', { name: 'Apagar devolução' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sim, apagar' }));
    vi.advanceTimersByTime(300);
    fireEvent.click(screen.getByRole('button', { name: 'Sim, apagar' }));
    await semEnvio(acao);
    vi.advanceTimersByTime(TRAVA_TOQUE_DUPLO_MS);
    fireEvent.click(screen.getByRole('button', { name: 'Sim, apagar' }));
    await vi.waitFor(() => expect(acao).toHaveBeenCalledTimes(1));
  });

  it('"Voltar" fecha a pergunta e devolve o foco ao botão; a trava recomeça quando ela abre de novo', async () => {
    const acao = montar();
    fireEvent.click(screen.getByRole('button', { name: 'Apagar devolução' }));
    vi.advanceTimersByTime(TRAVA_TOQUE_DUPLO_MS);
    fireEvent.click(screen.getByRole('button', { name: 'Voltar' }));
    expect(screen.queryByText(PERGUNTA)).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Apagar devolução' }));
    fireEvent.click(screen.getByRole('button', { name: 'Apagar devolução' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sim, apagar' }));
    await semEnvio(acao);
  });

  it('a recusa do servidor aparece num alerta, e durante o envio os botões ficam travados', async () => {
    let terminar: (estado: Estado) => void = () => undefined;
    const acao = vi.fn(() => new Promise<Estado>((ok) => (terminar = ok)));
    montar(acao);
    fireEvent.click(screen.getByRole('button', { name: 'Apagar devolução' }));
    vi.advanceTimersByTime(TRAVA_TOQUE_DUPLO_MS);
    fireEvent.click(screen.getByRole('button', { name: 'Sim, apagar' }));
    await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Apagando…' })).toBeTruthy());
    expect(screen.getByRole('button', { name: 'Apagando…' }).matches(':disabled')).toBe(true);
    expect(screen.getByRole('button', { name: 'Voltar' }).matches(':disabled')).toBe(true);
    await act(async () => terminar({ erros: ['A devolução tem NF de devolução autorizada: o Fiscal cancela a NF antes.'] }));
    expect(screen.getByRole('alert').textContent).toBe('A devolução tem NF de devolução autorizada: o Fiscal cancela a NF antes.');
    expect(screen.getByRole('button', { name: 'Sim, apagar' }).matches(':disabled')).toBe(false);
  });
});
