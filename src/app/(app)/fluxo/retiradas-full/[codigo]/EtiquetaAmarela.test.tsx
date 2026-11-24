// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TRAVA_TOQUE_DUPLO_MS } from '@/components/venda/useTravaToqueDuplo';
import type { FichaVenda } from '@/modules/mercado-livre/ficha-venda';
import type { ResultadoEtiquetaAmarela } from './acoes';
import { EtiquetaAmarela, type AcoesEtiquetaAmarela } from './EtiquetaAmarela';

const PEDIDO = '2000018992531744';

function ficha(devolucaoId: string, codigo: string): FichaVenda {
  return {
    devolucaoId,
    codigo,
    status: 'NO_CD_MARKETPLACE',
    conta: null,
    motivo: null,
    situacaoReclamacao: null,
    vendas: [],
    produtos: [{ sku: `SKU-${codigo}`, descricao: `Produto ${codigo}`, fotoUrl: null, quantidade: 1 }],
  };
}

function acoesDe(procurar: ResultadoEtiquetaAmarela, darChegada?: ResultadoEtiquetaAmarela): AcoesEtiquetaAmarela {
  return { procurar: vi.fn(async () => procurar), darChegada: vi.fn(async () => darChegada ?? procurar) };
}

/** (extra) A região role="status" que anuncia a ficha (ou a lista), sempre no DOM. */
function anuncio(): HTMLElement {
  const regiao = document.getElementById('anuncio-etiqueta-amarela');
  if (!regiao || regiao.getAttribute('role') !== 'status') throw new Error('sem a região do anúncio');
  return regiao;
}

async function procurarPedido(numero = PEDIDO) {
  fireEvent.click(screen.getByRole('button', { name: 'Etiqueta amarela (devolução do ML)' }));
  fireEvent.change(screen.getByLabelText('Número do pedido (impresso na etiqueta)'), { target: { value: numero } });
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Procurar' })));
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['performance'] });
});
afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

describe('EtiquetaAmarela (Retirada do Full, extra, E27)', () => {
  it('o botão abre o campo do número do pedido, com o foco nele', () => {
    render(<EtiquetaAmarela retiradaId="r1" acoes={acoesDe({ tipo: 'erro', mensagem: 'x' })} />);
    expect(anuncio().textContent).toBe('');
    const botao = screen.getByRole('button', { name: 'Etiqueta amarela (devolução do ML)' });
    expect(botao.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByLabelText('Número do pedido (impresso na etiqueta)')).toBeNull();
    fireEvent.click(botao);
    expect(botao.getAttribute('aria-expanded')).toBe('true');
    expect(document.activeElement).toBe(screen.getByLabelText('Número do pedido (impresso na etiqueta)'));
  });

  it('achada: a ficha com "Dar chegada nesta devolução"; o toque logo que ela aparece não vale; depois, registra a tocada', async () => {
    const acoes = acoesDe(
      { tipo: 'escolher', codigoLido: PEDIDO, lidaEm: 1, fichas: [ficha('a', 'DEV-000071')] },
      { tipo: 'chegada', codigos: ['DEV-000071'], mensagem: 'DEV-000071 · voltou do armazém do ML (extra) · 24/11/2026 10:30' },
    );
    const aoDarChegada = vi.fn();
    render(<EtiquetaAmarela retiradaId="r1" acoes={acoes} aoDarChegada={aoDarChegada} />);
    await procurarPedido();
    expect(acoes.procurar).toHaveBeenCalledWith('r1', PEDIDO);
    expect(screen.getByText('DEV-000071', { selector: 'p' })).toBeTruthy();
    // (extra) A ficha não recebe o foco (o Enter não cai no botão): a região role="status", sempre no DOM, a anuncia.
    expect(anuncio().textContent).toBe('Achada: DEV-000071. Confira a venda e toque em “Dar chegada nesta devolução”. A chegada ainda não foi registrada.');
    expect(document.activeElement).toBe(screen.getByLabelText('Número do pedido (impresso na etiqueta)'));
    const dar = screen.getByRole('button', { name: 'Dar chegada nesta devolução DEV-000071' });
    await act(async () => fireEvent.click(dar));
    expect(acoes.darChegada).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(TRAVA_TOQUE_DUPLO_MS));
    await act(async () => fireEvent.click(dar));
    expect(acoes.darChegada).toHaveBeenCalledWith('r1', 'a', PEDIDO);
    expect(aoDarChegada).toHaveBeenCalledWith(1);
    const aviso = screen.getByText('Chegada registrada').closest('[role="status"]') as HTMLElement;
    expect(aviso.textContent).toContain('Chegada registrada');
    expect(aviso.textContent).toContain('DEV-000071 · voltou do armazém do ML (extra)');
    expect(aviso.textContent).toContain('não entra nos itens desta retirada');
    expect(document.activeElement).toBe(aviso);
    expect((screen.getByLabelText('Número do pedido (impresso na etiqueta)') as HTMLInputElement).value).toBe('');
  });

  it('várias devoluções do pedido: a lista, cada uma com o seu botão', async () => {
    render(
      <EtiquetaAmarela
        retiradaId="r1"
        acoes={acoesDe({ tipo: 'escolher', codigoLido: PEDIDO, lidaEm: 1, fichas: [ficha('a', 'DEV-000071'), ficha('b', 'DEV-000072')] })}
      />,
    );
    await procurarPedido();
    expect(anuncio().textContent).toBe(
      'Este pedido tem 2 devoluções esperando o pacote: DEV-000071 e DEV-000072. Toque em “Dar chegada nesta devolução” na que chegou.',
    );
    const itens = within(screen.getByRole('list', { name: 'Devoluções do pedido' })).getAllByRole('listitem');
    expect(itens.map((i) => within(i).getByRole('button').textContent)).toEqual(['Dar chegada nesta devolução DEV-000071', 'Dar chegada nesta devolução DEV-000072']);
  });

  it('não achou, ou bloqueada: a mensagem em alerta, com o foco nela', async () => {
    render(<EtiquetaAmarela retiradaId="r1" acoes={acoesDe({ tipo: 'erro', mensagem: `Nenhuma devolução do ML com o pedido ${PEDIDO}.` })} />);
    await procurarPedido();
    expect(screen.getByRole('alert').textContent).toBe(`Nenhuma devolução do ML com o pedido ${PEDIDO}.`);
    expect(document.activeElement).toBe(screen.getByRole('alert'));
    cleanup();
    render(
      <EtiquetaAmarela
        retiradaId="r1"
        acoes={acoesDe({ tipo: 'aviso', titulo: 'Fale com o Gestor', mensagem: 'DEV-000071 está cancelada. Separe o pacote e avise o Gestor.', codigos: ['DEV-000071'] })}
      />,
    );
    await procurarPedido();
    expect(screen.getByRole('alert').textContent).toContain('Fale com o Gestor');
    expect(screen.getByRole('link', { name: 'DEV-000071' }).getAttribute('href')).toBe('/fluxo/devolucoes/DEV-000071');
  });

  it('campo vazio: pede o número sem chamar o servidor', async () => {
    const acoes = acoesDe({ tipo: 'erro', mensagem: 'x' });
    render(<EtiquetaAmarela retiradaId="r1" acoes={acoes} />);
    await procurarPedido('  ');
    expect(screen.getByRole('alert').textContent).toBe('Digite o número do pedido.');
    expect(acoes.procurar).not.toHaveBeenCalled();
  });
});
