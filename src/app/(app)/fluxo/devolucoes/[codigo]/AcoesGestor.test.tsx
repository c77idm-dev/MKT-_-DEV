// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EstadoAcaoGestor } from './acoes';
import { FormularioEncerrar, TRAVA_CONFIRMACAO_MS } from './AcoesGestor';

// O código vem da rota (useParams); cada teste pode trocar o que a URL traz.
const rota = vi.hoisted(() => ({ codigo: 'DEV-000437' }));
vi.mock('next/navigation', () => ({ useParams: () => ({ codigo: rota.codigo }) }));

beforeAll(() => {
  Element.prototype.scrollIntoView = () => undefined;
});

// Só o performance.now é falso: a trava do toque duplo conta o tempo por ele, e os timers do React seguem reais.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['performance'] });
});

afterEach(() => {
  vi.useRealTimers();
  rota.codigo = 'DEV-000437';
});

const PERGUNTA = 'Tem certeza? A DEV-000437 sai da espera de chegada e isso não se desfaz pela tela.';

function montar(acao = vi.fn(async (): Promise<EstadoAcaoGestor> => ({ erros: [] }))) {
  const tela = render(<FormularioEncerrar acao={acao} />);
  return { acao, ...tela };
}

function escreverMotivo(texto = 'Cliente desistiu da devolução') {
  fireEvent.change(screen.getByLabelText('Motivo'), { target: { value: texto } });
}

/** O tempo de ler a pergunta: depois dele, o "Sim" envia. */
function lerPergunta() {
  vi.advanceTimersByTime(TRAVA_CONFIRMACAO_MS);
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

  it('um toque duplo não cancela: o "Sim" tocado logo depois de a pergunta abrir não envia (E24)', async () => {
    const { acao } = montar();
    fireEvent.click(screen.getByRole('radio', { name: 'Cancelada' }));
    escreverMotivo();
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar devolução' }));
    // O 2º toque de um toque duplo cai no "Sim", que ocupa parte do lugar do botão.
    fireEvent.click(screen.getByRole('button', { name: 'Sim, cancelar devolução' }));
    vi.advanceTimersByTime(300);
    fireEvent.click(screen.getByRole('button', { name: 'Sim, cancelar devolução' }));
    await new Promise((ok) => setTimeout(ok, 0));
    expect(acao).not.toHaveBeenCalled();
    // A pergunta continua na tela, esperando o "Sim" de quem leu.
    expect(screen.getByText(PERGUNTA)).toBeTruthy();

    vi.advanceTimersByTime(TRAVA_CONFIRMACAO_MS - 300);
    fireEvent.click(screen.getByRole('button', { name: 'Sim, cancelar devolução' }));
    await vi.waitFor(() => expect(acao).toHaveBeenCalledTimes(1));
  });

  it('a trava recomeça a cada vez que a pergunta abre', async () => {
    const { acao } = montar();
    fireEvent.click(screen.getByRole('radio', { name: 'Cancelada' }));
    escreverMotivo();
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar devolução' }));
    lerPergunta();
    fireEvent.click(screen.getByRole('button', { name: 'Voltar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar devolução' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sim, cancelar devolução' }));
    await new Promise((ok) => setTimeout(ok, 0));
    expect(acao).not.toHaveBeenCalled();
  });

  it('Enter numa opção não envia: o navegador acionaria o "Sim", que é o botão padrão (E24)', () => {
    montar();
    const cancelada = screen.getByRole('radio', { name: 'Cancelada' });
    fireEvent.click(cancelada);
    escreverMotivo();
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar devolução' }));
    lerPergunta();
    // O fireEvent devolve false quando o evento foi cancelado (preventDefault).
    expect(fireEvent.keyDown(cancelada, { key: 'Enter' })).toBe(false);
    expect(fireEvent.keyDown(screen.getByRole('radio', { name: 'Extraviada' }), { key: 'Enter' })).toBe(false);
    // O motivo continua aceitando quebra de linha, e as outras teclas passam.
    expect(fireEvent.keyDown(screen.getByLabelText('Motivo'), { key: 'Enter' })).toBe(true);
    expect(fireEvent.keyDown(cancelada, { key: ' ' })).toBe(true);
  });

  it('a pergunta mostra o código como o título da página, mesmo com a URL em minúsculas', () => {
    rota.codigo = ' dev-000437 ';
    montar();
    fireEvent.click(screen.getByRole('radio', { name: 'Cancelada' }));
    escreverMotivo();
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar devolução' }));
    expect(screen.getByText(PERGUNTA)).toBeTruthy();
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

  it('o 2º toque, depois de ler a pergunta, chama a ação com o novo status e o motivo (Cancelada)', async () => {
    const { acao } = montar();
    fireEvent.click(screen.getByRole('radio', { name: 'Cancelada' }));
    escreverMotivo('Cliente desistiu da devolução');
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar devolução' }));
    lerPergunta();
    fireEvent.click(screen.getByRole('button', { name: 'Sim, cancelar devolução' }));
    await vi.waitFor(() => expect(acao).toHaveBeenCalledTimes(1));
    const dados = (acao.mock.calls[0] as unknown as [EstadoAcaoGestor, FormData])[1];
    expect(dados.get('para')).toBe('CANCELADA');
    expect(dados.get('motivo')).toBe('Cliente desistiu da devolução');
  });

  it('o 2º toque, depois de ler a pergunta, chama a ação com o novo status e o motivo (Extraviada)', async () => {
    const { acao } = montar();
    fireEvent.click(screen.getByRole('radio', { name: 'Extraviada' }));
    escreverMotivo('Correios confirmaram o extravio');
    fireEvent.click(screen.getByRole('button', { name: 'Marcar como extraviada' }));
    lerPergunta();
    fireEvent.click(screen.getByRole('button', { name: 'Sim, marcar como extraviada' }));
    await vi.waitFor(() => expect(acao).toHaveBeenCalledTimes(1));
    const dados = (acao.mock.calls[0] as unknown as [EstadoAcaoGestor, FormData])[1];
    expect(dados.get('para')).toBe('EXTRAVIADA');
    expect(dados.get('motivo')).toBe('Correios confirmaram o extravio');
  });

  it('durante o envio, as opções e o motivo ficam travados: a tela não mostra outra escolha', async () => {
    let terminar: (estado: EstadoAcaoGestor) => void = () => undefined;
    const acao = vi.fn(() => new Promise<EstadoAcaoGestor>((ok) => (terminar = ok)));
    montar(acao);
    fireEvent.click(screen.getByRole('radio', { name: 'Cancelada' }));
    escreverMotivo();
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar devolução' }));
    lerPergunta();
    fireEvent.click(screen.getByRole('button', { name: 'Sim, cancelar devolução' }));
    await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Registrando…' })).toBeTruthy());
    expect(screen.getByRole('radio', { name: 'Cancelada' }).matches(':disabled')).toBe(true);
    expect(screen.getByRole('radio', { name: 'Extraviada' }).matches(':disabled')).toBe(true);
    expect(screen.getByLabelText('Motivo').matches(':disabled')).toBe(true);
    expect(screen.getByText(PERGUNTA)).toBeTruthy();

    // A ação devolveu um erro: tudo volta a ficar editável.
    await act(async () => terminar({ erros: ['Esta devolução não está mais pendente de chegada.'] }));
    expect(screen.getByRole('radio', { name: 'Extraviada' }).matches(':disabled')).toBe(false);
    expect(screen.getByLabelText('Motivo').matches(':disabled')).toBe(false);
  });
});
