// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TRAVA_TOQUE_DUPLO_MS } from '@/components/venda/useTravaToqueDuplo';
import type { FichaVenda } from '@/modules/mercado-livre/ficha-venda';
import type { EstadoRecebimento } from './acoes';

const mocks = vi.hoisted(() => ({
  /** As respostas do servidor, na ordem; sem resposta na fila, devolve o estado anterior. */
  respostas: [] as unknown[],
  registrar: vi.fn(),
  criarRetirada: vi.fn(),
  abrirConferencia: vi.fn(),
  abrir: vi.fn(),
  fechar: vi.fn(),
  situacao: 'parada' as 'parada' | 'abrindo' | 'lendo',
  aoLer: null as null | ((codigo: string) => void),
  pontoFino: true,
}));
vi.mock('./acoes', () => ({ registrarChegadaAcao: mocks.registrar }));
vi.mock('../retiradas-full/acoes', () => ({ criarRetiradaAcao: mocks.criarRetirada }));
vi.mock('../conferencia/acoes', () => ({ abrirConferenciaAcao: mocks.abrirConferencia }));
vi.mock('@/components/leitor/useLeitorCamera', () => ({
  useLeitorCamera: (aoLer: (codigo: string) => void) => {
    mocks.aoLer = aoLer;
    return { videoRef: { current: null }, situacao: mocks.situacao, erro: null, abrir: mocks.abrir, fechar: mocks.fechar };
  },
}));
vi.mock('@/components/midia/useFilaEnvios', () => ({ useManterFilaAtiva: () => undefined }));
vi.mock('@/components/conferencia/FotosPacote', () => ({ FotosPacote: () => <p>Fotos do pacote</p> }));

import { FormularioRecebimento } from './FormularioRecebimento';

const VERDE: EstadoRecebimento = { tipo: 'sucesso', titulo: 'Chegada registrada', mensagem: 'DEV-000001 · 27/11/2026 10:30', codigos: ['DEV-000001'] };
const VERDE_DUAS: EstadoRecebimento = {
  tipo: 'sucesso',
  titulo: 'Chegada registrada',
  mensagem: 'DEV-000001, DEV-000002 · 27/11/2026 10:30',
  codigos: ['DEV-000001', 'DEV-000002'],
};
const AMARELO: EstadoRecebimento = {
  tipo: 'aviso',
  titulo: 'Este pacote já chegou',
  mensagem: 'DEV-000001 já tinha chegado em 27/11/2026 10:30. Status: Aguardando conferência.',
  codigos: ['DEV-000001'],
  jaChegou: true,
};

function ficha(devolucaoId: string, codigo: string): FichaVenda {
  return { devolucaoId, codigo, status: 'NO_CD_MARKETPLACE', conta: null, motivo: null, situacaoReclamacao: null, temReclamacao: true, vendas: [], produtos: [] };
}

const campos = (dados: FormData) => Object.fromEntries(dados.entries());

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['performance'] });
  mocks.respostas = [];
  mocks.situacao = 'parada';
  mocks.pontoFino = true;
  mocks.registrar.mockReset().mockImplementation(async (anterior: EstadoRecebimento) => (mocks.respostas.shift() as EstadoRecebimento | undefined) ?? anterior);
  mocks.criarRetirada.mockReset().mockResolvedValue({ erro: null });
  mocks.abrirConferencia.mockReset().mockResolvedValue({ erros: [] });
  mocks.abrir.mockReset();
  mocks.fechar.mockReset();
  window.matchMedia = ((consulta: string) => ({ matches: consulta === '(pointer: fine)' ? mocks.pontoFino : false })) as unknown as typeof window.matchMedia;
});
afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

/** Abre a Bancada ("Chegou um pacote") e lê o código pelo campo. */
async function lerPeloCampo(codigo: string) {
  if (!screen.queryByLabelText('Código de Rastreamento')) fireEvent.click(screen.getByRole('button', { name: 'Chegou um pacote' }));
  fireEvent.change(screen.getByLabelText('Código de Rastreamento'), { target: { value: codigo } });
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Registrar chegada' })));
}

/** Espera a trava do toque duplo (0,7 s) dos botões que acabaram de aparecer. */
function passarTrava() {
  act(() => vi.advanceTimersByTime(TRAVA_TOQUE_DUPLO_MS));
}

describe('"Chegou um pacote" (Bancada, E29)', () => {
  it('no começo só o botão grande; o toque abre o campo e, no celular, a câmera', () => {
    mocks.pontoFino = false;
    render(<FormularioRecebimento />);
    const botao = screen.getByRole('button', { name: 'Chegou um pacote' });
    expect(screen.queryByLabelText('Código de Rastreamento')).toBeNull();
    fireEvent.click(botao);
    expect(screen.getByLabelText('Código de Rastreamento')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Ler com a câmera' })).toBeTruthy();
    expect(mocks.abrir).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'Chegou um pacote' })).toBeNull();
  });

  it('no computador (leitor USB ou teclado) o toque abre o campo com o foco nele, sem abrir a câmera', () => {
    render(<FormularioRecebimento />);
    fireEvent.click(screen.getByRole('button', { name: 'Chegou um pacote' }));
    expect(document.activeElement).toBe(screen.getByLabelText('Código de Rastreamento'));
    expect(mocks.abrir).not.toHaveBeenCalled();
  });
});

describe('depois da chegada (Bancada, E29)', () => {
  it('pelo rastreio: o cartão verde com "Conferir agora" e "Próximo pacote"; "Conferir agora" abre a conferência dessa devolução', async () => {
    mocks.respostas = [VERDE];
    render(<FormularioRecebimento />);
    await lerPeloCampo('BR123');
    expect(campos(mocks.registrar.mock.calls[0][1] as FormData)).toMatchObject({ intencao: 'receber', rastreio: 'BR123' });
    const cartao = screen.getByTestId('cartao-resultado');
    expect(cartao.textContent).toContain('Chegada registrada');
    const conferir = within(cartao).getByRole('button', { name: 'Conferir agora' });
    expect(within(cartao).getByRole('button', { name: 'Próximo pacote' })).toBeTruthy();
    // O toque logo que o cartão aparece não vale (toque duplo, como a ficha da E27).
    await act(async () => fireEvent.click(conferir));
    expect(mocks.abrirConferencia).not.toHaveBeenCalled();
    passarTrava();
    await act(async () => fireEvent.click(conferir));
    expect(mocks.abrirConferencia).toHaveBeenCalledTimes(1);
    expect(campos(mocks.abrirConferencia.mock.calls[0][1] as FormData)).toEqual({ codigo: 'DEV-000001' });
  });

  it('a chegada de mais de uma devolução: um "Conferir" para cada código', async () => {
    mocks.respostas = [VERDE_DUAS];
    render(<FormularioRecebimento />);
    await lerPeloCampo('BR123');
    const cartao = screen.getByTestId('cartao-resultado');
    expect(within(cartao).queryByRole('button', { name: 'Conferir agora' })).toBeNull();
    passarTrava();
    await act(async () => fireEvent.click(within(cartao).getByRole('button', { name: 'Conferir DEV-000002' })));
    expect(campos(mocks.abrirConferencia.mock.calls[0][1] as FormData)).toEqual({ codigo: 'DEV-000002' });
    expect(within(cartao).getByRole('button', { name: 'Conferir DEV-000001' })).toBeTruthy();
  });

  it('"Próximo pacote" limpa a tela e volta o foco ao campo', async () => {
    mocks.respostas = [VERDE];
    render(<FormularioRecebimento />);
    await lerPeloCampo('BR123');
    passarTrava();
    fireEvent.click(screen.getByRole('button', { name: 'Próximo pacote' }));
    expect(screen.queryByTestId('cartao-resultado')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Conferir agora' })).toBeNull();
    const campo = screen.getByLabelText('Código de Rastreamento') as HTMLInputElement;
    expect(document.activeElement).toBe(campo);
    expect(campo.value).toBe('');
  });

  it('no celular, "Próximo pacote" abre a câmera de novo se ela estava fechada', async () => {
    mocks.pontoFino = false;
    mocks.respostas = [VERDE];
    render(<FormularioRecebimento />);
    await lerPeloCampo('BR123');
    mocks.abrir.mockClear();
    passarTrava();
    fireEvent.click(screen.getByRole('button', { name: 'Próximo pacote' }));
    expect(mocks.abrir).toHaveBeenCalledTimes(1);
  });

  it('pelo número do pedido: depois do "Dar chegada", os mesmos dois botões', async () => {
    mocks.respostas = [
      { tipo: 'escolher', codigoLido: '2000018992531744', lidaEm: 1, fichas: [ficha('a', 'DEV-000001')], nota: 'Achada pelo número do pedido do ML (extra).' },
      VERDE,
    ];
    render(<FormularioRecebimento />);
    await lerPeloCampo('2000018992531744');
    passarTrava();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Dar chegada na DEV-000001' })));
    expect(campos(mocks.registrar.mock.calls[1][1] as FormData)).toEqual({ intencao: 'dar_chegada', devolucaoId: 'a', codigoLido: '2000018992531744' });
    expect(screen.getByRole('button', { name: 'Conferir agora' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Próximo pacote' })).toBeTruthy();
  });

  it('a não identificada não tem "Conferir agora" (o Gestor liga ao pedido antes); tem as fotos e "Próximo pacote"', async () => {
    mocks.respostas = [
      { tipo: 'nao_encontrada', rastreio: 'XYZ' },
      { tipo: 'sucesso', titulo: 'Pacote não identificado registrado', mensagem: 'DEV-000009 foi…', codigos: ['DEV-000009'], naoIdentificada: { id: 'n', codigo: 'DEV-000009' } },
    ];
    render(<FormularioRecebimento />);
    await lerPeloCampo('XYZ');
    passarTrava();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'De cliente, sem cadastro' })));
    expect(screen.queryByRole('button', { name: /^Conferir/ })).toBeNull();
    expect(screen.getByText('Fotos do pacote')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Próximo pacote' })).toBeTruthy();
  });

  it('o aviso amarelo "Este pacote já chegou" continua igual, sem os botões novos', async () => {
    mocks.respostas = [AMARELO];
    render(<FormularioRecebimento />);
    await lerPeloCampo('BR123');
    const cartao = screen.getByTestId('cartao-resultado');
    expect(cartao.textContent).toContain('Este pacote já chegou');
    expect(within(cartao).getByRole('link', { name: 'DEV-000001' })).toBeTruthy();
    expect(within(cartao).queryByRole('button')).toBeNull();
  });
});

describe('"De onde veio este pacote?" (código desconhecido, E29)', () => {
  it('pergunta, com dois botões do mesmo tamanho e a dica de cada um', async () => {
    mocks.respostas = [{ tipo: 'nao_encontrada', rastreio: '48609944489' }];
    render(<FormularioRecebimento />);
    await lerPeloCampo('48609944489');
    const pergunta = screen.getByRole('region', { name: 'De onde veio este pacote?' });
    expect(pergunta.textContent).toContain('48609944489');
    const full = within(pergunta).getByRole('button', { name: 'Do armazém do ML (Full)' });
    const cliente = within(pergunta).getByRole('button', { name: 'De cliente, sem cadastro' });
    expect(full.className).toBe(cliente.className);
    expect(full.getAttribute('aria-describedby')).toBeTruthy();
    expect(document.getElementById(full.getAttribute('aria-describedby') ?? '')?.textContent).toBe("remetente MELI e 'Ret. ID' na etiqueta");
    expect(document.getElementById(cliente.getAttribute('aria-describedby') ?? '')?.textContent).toBe('vira não identificada e o Gestor liga depois');
    // Nada do cartão antigo.
    expect(screen.queryByText('Rastreio não encontrado')).toBeNull();
  });

  it('"Do armazém do ML (Full)" abre a retirada com o código lido', async () => {
    mocks.respostas = [{ tipo: 'nao_encontrada', rastreio: '48609944489' }];
    render(<FormularioRecebimento />);
    await lerPeloCampo('48609944489');
    const full = screen.getByRole('button', { name: 'Do armazém do ML (Full)' });
    await act(async () => fireEvent.click(full));
    expect(mocks.criarRetirada).not.toHaveBeenCalled(); // toque duplo
    passarTrava();
    await act(async () => fireEvent.click(full));
    expect(mocks.criarRetirada).toHaveBeenCalledTimes(1);
    expect(campos(mocks.criarRetirada.mock.calls[0][1] as FormData)).toEqual({ codigoEtiqueta: '48609944489' });
    expect(mocks.registrar).toHaveBeenCalledTimes(1);
  });

  it('"De cliente, sem cadastro" registra a não identificada com o código lido', async () => {
    mocks.respostas = [{ tipo: 'nao_encontrada', rastreio: 'BRXYZ' }];
    render(<FormularioRecebimento />);
    await lerPeloCampo('BRXYZ');
    const cliente = screen.getByRole('button', { name: 'De cliente, sem cadastro' });
    await act(async () => fireEvent.click(cliente));
    expect(mocks.registrar).toHaveBeenCalledTimes(1); // toque duplo
    passarTrava();
    await act(async () => fireEvent.click(cliente));
    expect(campos(mocks.registrar.mock.calls[1][1] as FormData)).toEqual({ intencao: 'criar_nao_identificada', rastreio: 'BRXYZ' });
    expect(mocks.criarRetirada).not.toHaveBeenCalled();
  });
});

describe('as proteções da câmera da E27 continuam (guarda.ts)', () => {
  it('com a pergunta "De onde veio" ou a ficha do pedido na tela, a câmera não manda nada', async () => {
    mocks.respostas = [{ tipo: 'nao_encontrada', rastreio: 'XYZ' }];
    render(<FormularioRecebimento />);
    await lerPeloCampo('XYZ');
    await act(async () => mocks.aoLer?.('OUTRO'));
    expect(mocks.registrar).toHaveBeenCalledTimes(1);

    mocks.respostas = [{ tipo: 'escolher', codigoLido: '2000018992531744', lidaEm: 2, fichas: [ficha('a', 'DEV-000001')], nota: 'n' }];
    await lerPeloCampo('2000018992531744');
    await act(async () => mocks.aoLer?.('48515208229'));
    expect(mocks.registrar).toHaveBeenCalledTimes(2);
  });

  it('com o cartão verde, a câmera manda a leitura com origem=camera (o servidor compara com o cartão)', async () => {
    mocks.respostas = [VERDE];
    render(<FormularioRecebimento />);
    await lerPeloCampo('BR123');
    await act(async () => mocks.aoLer?.('2000018992531744'));
    expect(mocks.registrar).toHaveBeenCalledTimes(2);
    const [anterior, dados] = mocks.registrar.mock.calls[1] as [EstadoRecebimento, FormData];
    expect(anterior).toEqual(VERDE);
    expect(campos(dados)).toMatchObject({ rastreio: '2000018992531744', origem: 'camera' });
  });

  it('depois de "Próximo pacote", o servidor ainda compara com o cartão verde: a mesma etiqueta lida de novo não volta a tela', async () => {
    mocks.respostas = [VERDE];
    render(<FormularioRecebimento />);
    await lerPeloCampo('BR123');
    passarTrava();
    fireEvent.click(screen.getByRole('button', { name: 'Próximo pacote' }));
    // A câmera relê outro código da mesma etiqueta: o servidor recebe o cartão verde e o devolve igual.
    mocks.respostas = [structuredClone(VERDE)];
    await act(async () => mocks.aoLer?.('2000018992531744'));
    expect(mocks.registrar.mock.calls[1][0]).toEqual(VERDE);
    expect(screen.queryByTestId('cartao-resultado')).toBeNull();
    // Com o aviso das devoluções do pedido que ainda esperam o pacote, o cartão volta (o aviso é novo).
    mocks.respostas = [{ ...VERDE, aindaEsperam: ['DEV-000002'] }];
    await act(async () => mocks.aoLer?.('2000018992531744'));
    expect(screen.getByTestId('aviso-ainda-esperam').textContent).toContain('DEV-000002');
  });
});
