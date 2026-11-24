// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { FichaVenda as DadosFicha, VendaDaFicha } from '@/modules/mercado-livre/ficha-venda';
import { FichaVenda, ResumoDevolucaoDoPedido } from './FichaVenda';

const VENDA: VendaDaFicha = {
  pedidoId: '2000008003035430',
  temDados: true,
  vendidaEm: '2026-10-28T12:00:00.000Z',
  situacao: 'paid',
  situacaoEnvio: 'delivered',
  itens: [
    {
      anuncioId: 'MLB1',
      titulo: 'Fone de Ouvido Bluetooth',
      sku: 'fone-01',
      variacaoId: null,
      quantidade: 2,
      valorUnitario: 129.9,
      fotoUrl: 'https://http2.mlstatic.com/fone.jpg',
    },
    { anuncioId: 'MLB2', titulo: null, sku: 'CABO-02', variacaoId: null, quantidade: 1, valorUnitario: 1234.5, fotoUrl: null },
  ],
  total: 1494.3,
  urlNoML: 'https://www.mercadolivre.com.br/vendas/2000008003035430/detalhe',
};

const FICHA: DadosFicha = {
  devolucaoId: 'd1',
  codigo: 'DEV-000071',
  status: 'NO_CD_MARKETPLACE',
  conta: 'Megadino 2',
  motivo: 'Comprador se arrependeu',
  situacaoReclamacao: 'opened',
  vendas: [VENDA],
  produtos: [{ sku: 'FONE-01', descricao: 'Fone de Ouvido (cadastro)', fotoUrl: 'https://http2.mlstatic.com/fone.jpg', quantidade: 2 }],
};

afterEach(cleanup);

describe('FichaVenda (E27, extra)', () => {
  it('mostra o pedido, a data, a conta, a situação em pt-BR, os itens, o total, o motivo e a situação da reclamação', () => {
    render(<FichaVenda ficha={FICHA} />);
    expect(screen.getByText('2000008003035430')).toBeTruthy();
    expect(screen.getByText('28/10/2026 09:00')).toBeTruthy();
    expect(screen.getByText('Megadino 2')).toBeTruthy();
    expect(screen.getByText('Paga · Entregue')).toBeTruthy();
    const itens = screen.getByRole('list', { name: 'Itens vendidos' });
    const [fone, cabo] = within(itens).getAllByRole('listitem');
    expect(fone.textContent).toContain('Fone de Ouvido Bluetooth');
    expect(fone.textContent).toContain('SKU fone-01');
    expect(fone.textContent).toContain('2 × R$ 129,90');
    expect(within(fone).getByRole('img', { name: 'Fone de Ouvido Bluetooth' }).getAttribute('src')).toBe('https://http2.mlstatic.com/fone.jpg');
    // Sem título, o SKU no lugar; sem foto, o ícone neutro.
    expect(cabo.textContent).toContain('1 × R$ 1.234,50');
    expect(within(cabo).getByRole('img', { name: 'Sem foto do produto' })).toBeTruthy();
    expect(screen.getByText('R$ 1.494,30')).toBeTruthy();
    expect(screen.getByText('Comprador se arrependeu')).toBeTruthy();
    expect(screen.getByText('Aberta')).toBeTruthy();
  });

  it('"Abrir a venda no ML" abre o detalhe da venda em outra aba, sem levar a página de origem', () => {
    render(<FichaVenda ficha={FICHA} />);
    const link = screen.getByRole('link', { name: /Abrir a venda no ML/ });
    expect(link.getAttribute('href')).toBe('https://www.mercadolivre.com.br/vendas/2000008003035430/detalhe');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('sem os dados da venda: o aviso e o resto (pedido, conta, reclamação e link)', () => {
    const vazia: VendaDaFicha = { ...VENDA, temDados: false, vendidaEm: null, situacao: null, situacaoEnvio: null, itens: [], total: null };
    render(<FichaVenda ficha={{ ...FICHA, vendas: [vazia] }} />);
    expect(screen.getByText('Os dados da venda ainda não chegaram do ML.')).toBeTruthy();
    expect(screen.getByText('2000008003035430')).toBeTruthy();
    expect(screen.getByText('Megadino 2')).toBeTruthy();
    expect(screen.getByText('Comprador se arrependeu')).toBeTruthy();
    expect(screen.queryByRole('list', { name: 'Itens vendidos' })).toBeNull();
    expect(screen.getByRole('link', { name: /Abrir a venda no ML/ })).toBeTruthy();
  });

  it('código que o sistema não conhece aparece como veio; sem valor de um item, o total fica "—"', () => {
    const estranha: VendaDaFicha = { ...VENDA, situacao: 'status_novo', situacaoEnvio: null, total: null };
    render(<FichaVenda ficha={{ ...FICHA, vendas: [estranha], situacaoReclamacao: 'stale' }} />);
    expect(screen.getByText('status_novo')).toBeTruthy();
    expect(screen.getByText('stale')).toBeTruthy();
    expect(screen.getByText('—')).toBeTruthy();
  });

  it('pedido que não é número do ML: sem link; mais de um pedido: um bloco por pedido', () => {
    const outro: VendaDaFicha = { ...VENDA, pedidoId: 'P-DIGITADO', temDados: false, itens: [], total: null, urlNoML: null };
    render(<FichaVenda ficha={{ ...FICHA, vendas: [VENDA, outro] }} />);
    expect(screen.getAllByRole('link', { name: /Abrir a venda no ML/ })).toHaveLength(1);
    expect(screen.getByText('P-DIGITADO')).toBeTruthy();
  });

  it('o código DEV (para as telas do Fluxo) e as ações vêm de fora', () => {
    render(
      <FichaVenda ficha={FICHA} mostrarCodigo>
        <button type="button">Dar chegada</button>
      </FichaVenda>,
    );
    expect(screen.getByText('DEV-000071')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Dar chegada' })).toBeTruthy();
    // Com os itens da venda, o produto esperado não se repete.
    expect(screen.queryByRole('list', { name: 'Produto esperado' })).toBeNull();
  });

  it('(extra) a ficha de uma devolução sem os itens da venda mostra o produto esperado, com a foto, para comparar com o pacote', () => {
    const vazia: VendaDaFicha = { ...VENDA, temDados: false, vendidaEm: null, situacao: null, situacaoEnvio: null, itens: [], total: null };
    const cabo = { sku: 'CABO-02', descricao: null, fotoUrl: null, quantidade: 3 };
    render(<FichaVenda ficha={{ ...FICHA, vendas: [vazia], produtos: [...FICHA.produtos, cabo] }} mostrarCodigo />);
    expect(screen.getByText('Os dados da venda ainda não chegaram do ML.')).toBeTruthy();
    const [fone, semNome] = within(screen.getByRole('list', { name: 'Produto esperado' })).getAllByRole('listitem');
    expect(fone.textContent).toContain('Fone de Ouvido (cadastro)');
    expect(fone.textContent).toContain('SKU FONE-01 · 2 unidades');
    expect(within(fone).getByRole('img', { name: 'Fone de Ouvido (cadastro)' }).getAttribute('src')).toBe('https://http2.mlstatic.com/fone.jpg');
    expect(semNome.textContent).toContain('CABO-02');
    expect(semNome.textContent).toContain('3 unidades');
    // Sem nenhuma venda gravada também; no detalhe (sem o código DEV) não aparece: lá os itens têm a seção própria.
    cleanup();
    render(<FichaVenda ficha={{ ...FICHA, vendas: [] }} mostrarCodigo />);
    expect(screen.getByRole('list', { name: 'Produto esperado' })).toBeTruthy();
    cleanup();
    render(<FichaVenda ficha={{ ...FICHA, vendas: [vazia] }} />);
    expect(screen.queryByRole('list', { name: 'Produto esperado' })).toBeNull();
  });
});

describe('ResumoDevolucaoDoPedido (lista das devoluções do mesmo pedido, E27)', () => {
  it('código DEV, foto e produto esperado, com a ação ao lado', () => {
    render(
      <ResumoDevolucaoDoPedido ficha={FICHA}>
        <button type="button">Dar chegada</button>
      </ResumoDevolucaoDoPedido>,
    );
    expect(screen.getByText('DEV-000071')).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Fone de Ouvido (cadastro)' })).toBeTruthy();
    expect(screen.getByText('Fone de Ouvido (cadastro)')).toBeTruthy();
    expect(screen.getByText(/FONE-01/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Dar chegada' })).toBeTruthy();
  });

  it('produto fora do cadastro: o SKU no lugar do nome', () => {
    render(<ResumoDevolucaoDoPedido ficha={{ ...FICHA, produtos: [{ sku: 'SKU-X', descricao: null, fotoUrl: null, quantidade: 1 }] }} />);
    expect(screen.getByText('SKU-X')).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Sem foto do produto' })).toBeTruthy();
  });
});
