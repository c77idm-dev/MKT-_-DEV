// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RegistroEnvio } from '@/components/midia/filaEnvios';
import type { ItemRetiradaVista } from '@/modules/retiradas/consultas';

const fila = vi.hoisted(() => ({ envios: [] as unknown[], descartar: vi.fn<(id: string) => Promise<void>>(async () => undefined), ordem: [] as string[] }));

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock('@/components/conferencia/LeitorCodigo', () => ({ LeitorCodigo: () => null }));
vi.mock('@/components/midia/useFilaEnvios', () => ({
  useFilaEnvios: () => ({ envios: fila.envios, concluidos: [], adicionar: vi.fn(), tentarDeNovo: vi.fn(), descartar: fila.descartar }),
}));

import { TelaRetirada, type AcoesRetirada } from './TelaRetirada';

const RETIRADA = { id: 'r1', codigo: 'RF-000001', codigoEtiqueta: 'FULL123' };

function item(p: Partial<ItemRetiradaVista> = {}): ItemRetiradaVista {
  return { id: 'i1', produtoId: 'p1', sku: 'SKU1', descricao: 'Fone Bluetooth', eanLido: '789', quantidade: 1, semCadastro: false, ...p };
}

function acoesDe(parcial: Partial<AcoesRetirada> = {}): AcoesRetirada {
  return {
    bipar: vi.fn(async () => ({ ok: true as const, itens: [item()] })),
    quantidade: vi.fn(async () => ({ ok: true as const, itens: [item()] })),
    remover: vi.fn(async () => ({ ok: true as const, itens: [] })),
    concluir: vi.fn(async () => ({ ok: true as const, itens: [] })),
    etiquetaAmarela: { procurar: vi.fn(), darChegada: vi.fn() },
    ...parcial,
  };
}

afterEach(() => {
  cleanup();
  fila.envios = [];
  fila.ordem.length = 0;
  fila.descartar.mockClear();
});

function envio(p: Partial<RegistroEnvio>): RegistroEnvio {
  return { idCliente: 'c1', devolucaoId: 'r1', retirada: true, itemId: null, tipo: 'FOTO_1_ETIQUETA', estado: 'pendente', tentativas: 0, progresso: 0, criadoEm: 1, arquivo: new Blob(['x']), ...p } as RegistroEnvio;
}

describe('TelaRetirada (melhoria 3)', () => {
  it('remover o item descarta antes as fotos dele que estão na fila do aparelho (senão ficariam presas com erro 400)', async () => {
    fila.envios = [
      envio({ idCliente: 'foto-item-1', itemId: 'i1', tipo: 'FOTO_3_PRODUTO', estado: 'erro' }),
      envio({ idCliente: 'foto-item-2', itemId: 'i1', tipo: 'FOTO_3_PRODUTO', estado: 'pendente' }),
      envio({ idCliente: 'foto-outro', itemId: 'i9', tipo: 'FOTO_3_PRODUTO' }),
      envio({ idCliente: 'foto-etiqueta', itemId: null }),
    ];
    fila.descartar.mockImplementation(async (id: string) => void fila.ordem.push(`descartar:${id}`));
    const remover = vi.fn(async () => {
      fila.ordem.push('remover');
      return { ok: true as const, itens: [] };
    });
    render(<TelaRetirada retirada={RETIRADA} itensIniciais={[item()]} evidencias={[]} acoes={acoesDe({ remover })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Remover Fone Bluetooth' }));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Toque de novo para remover Fone Bluetooth' })));
    expect(fila.ordem).toEqual(['descartar:foto-item-1', 'descartar:foto-item-2', 'remover']);
  });

  it('Concluir espera as fotos dos itens que ainda estão subindo (depois de conferida, o servidor recusaria com 409)', async () => {
    fila.envios = [envio({ idCliente: 'foto-item', itemId: 'i1', tipo: 'FOTO_3_PRODUTO', estado: 'enviando' })];
    const acoes = acoesDe();
    const evidencias = [{ id: 'e1', tipo: 'FOTO_1_ETIQUETA' as const, itemId: null, situacao: 'PRONTA' as const, url: null, erro: null }];
    render(<TelaRetirada retirada={RETIRADA} itensIniciais={[item()]} evidencias={evidencias} acoes={acoes} />);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Concluir retirada' })));
    expect(screen.getByRole('alert').textContent).toBe('Espere as fotos dos itens terminarem de enviar.');
    expect(acoes.concluir).not.toHaveBeenCalled();
  });

  it('Concluir descarta as fotos de item que o servidor recusou de vez (ficariam presas no aparelho)', async () => {
    fila.envios = [envio({ idCliente: 'recusada', itemId: 'i1', tipo: 'FOTO_3_PRODUTO', estado: 'erro' })];
    const acoes = acoesDe();
    const evidencias = [{ id: 'e1', tipo: 'FOTO_1_ETIQUETA' as const, itemId: null, situacao: 'PRONTA' as const, url: null, erro: null }];
    render(<TelaRetirada retirada={RETIRADA} itensIniciais={[item()]} evidencias={evidencias} acoes={acoes} />);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Concluir retirada' })));
    expect(acoes.concluir).toHaveBeenCalledWith('r1');
    expect(fila.descartar).toHaveBeenCalledWith('recusada');
  });

  it('avisa que não é devolução', () => {
    render(<TelaRetirada retirada={RETIRADA} itensIniciais={[]} evidencias={[]} acoes={acoesDe()} />);
    expect(screen.getByText('Isto não é devolução. Confira os itens e guarde no estoque.')).toBeTruthy();
  });

  it('Concluir sem foto nem item mostra as pendências em alerta, com o foco nelas, sem chamar o servidor', async () => {
    const acoes = acoesDe();
    render(<TelaRetirada retirada={RETIRADA} itensIniciais={[]} evidencias={[]} acoes={acoes} />);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Concluir retirada' })));
    const alerta = screen.getByRole('alert');
    expect(alerta.textContent).toContain('Tire a foto da etiqueta.');
    expect(alerta.textContent).toContain('Bipe pelo menos 1 produto.');
    expect(document.activeElement).toBe(alerta);
    expect(acoes.concluir).not.toHaveBeenCalled();
  });

  it('EAN sem cadastro pede a descrição curta e inclui o item com o selo "sem cadastro"', async () => {
    const bipar = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, itens: [], pedirDescricao: '555' })
      .mockResolvedValueOnce({ ok: true, itens: [item({ id: 'i2', produtoId: null, sku: null, descricao: 'Cabo USB-C', eanLido: '555', semCadastro: true })] });
    render(<TelaRetirada retirada={RETIRADA} itensIniciais={[]} evidencias={[]} acoes={acoesDe({ bipar })} />);
    fireEvent.change(screen.getByLabelText('EAN do produto'), { target: { value: '555' } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Somar' })));
    expect(bipar).toHaveBeenCalledWith('r1', '555', null);
    fireEvent.change(screen.getByLabelText('Descrição curta'), { target: { value: 'Cabo USB-C' } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Incluir sem cadastro' })));
    expect(bipar).toHaveBeenLastCalledWith('r1', '555', 'Cabo USB-C');
    expect(screen.getByText('sem cadastro')).toBeTruthy();
    expect(screen.queryByLabelText('Descrição curta')).toBeNull();
  });

  it('Remover pede o segundo toque antes de tirar o item', async () => {
    const acoes = acoesDe();
    render(<TelaRetirada retirada={RETIRADA} itensIniciais={[item()]} evidencias={[]} acoes={acoes} />);
    fireEvent.click(screen.getByRole('button', { name: 'Remover Fone Bluetooth' }));
    expect(acoes.remover).not.toHaveBeenCalled();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Toque de novo para remover Fone Bluetooth' })));
    expect(acoes.remover).toHaveBeenCalledWith('r1', 'i1');
  });

  it('o − fica desabilitado com 1 e o + chama o servidor', async () => {
    const acoes = acoesDe();
    render(<TelaRetirada retirada={RETIRADA} itensIniciais={[item()]} evidencias={[]} acoes={acoes} />);
    expect((screen.getByRole('button', { name: 'Diminuir Fone Bluetooth' }) as HTMLButtonElement).disabled).toBe(true);
    // A quantidade é lida como "Quantidade: 1" por texto escondido (sem aria-label num span, que o leitor de tela ignora).
    const rotulo = screen.getByText('Quantidade:');
    expect(rotulo.className).toContain('sr-only');
    expect(rotulo.parentElement?.textContent).toBe('Quantidade: 1');
    expect(rotulo.parentElement?.hasAttribute('aria-label')).toBe(false);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Aumentar Fone Bluetooth' })));
    expect(acoes.quantidade).toHaveBeenCalledWith('r1', 'i1', 1);
  });
});
