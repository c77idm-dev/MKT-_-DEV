// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ResumoDevolucao } from '@/modules/devolucoes/busca';
import { CartaoDevolucao } from './CartaoDevolucao';

const BASE: ResumoDevolucao = {
  id: '1',
  codigo: 'DEV-000001',
  canal: 'SHOPEE',
  status: 'PENDENTE_CHEGADA',
  rastreio: 'BR123',
  pedidos: ['SHP-1'],
  produto: 'Fone Bluetooth',
  unidades: 3,
  naoIdentificada: false,
  criadaEm: new Date('2026-11-12T12:00:00Z'),
  recebidaEm: null,
  selos: [{ texto: 'Entregue (ML)', tom: 'atencao' }],
};

describe('CartaoDevolucao', () => {
  it('mostra código, canal, produto, rastreio e selos, e o cartão inteiro leva ao detalhe', () => {
    render(<CartaoDevolucao devolucao={BASE} />);
    expect(screen.getByRole('link').getAttribute('href')).toBe('/fluxo/devolucoes/DEV-000001');
    for (const texto of ['DEV-000001', 'Shopee', 'Fone Bluetooth + 2 unidades', 'BR123', 'Entregue (ML)', 'Pendente de chegada']) {
      expect(screen.getByText(texto)).toBeTruthy();
    }
  });

  it('pacote não identificado, sem canal e sem itens', () => {
    render(<CartaoDevolucao devolucao={{ ...BASE, canal: null, produto: null, unidades: 0, rastreio: null, selos: [] }} />);
    expect(screen.getByText('Canal a identificar')).toBeTruthy();
    expect(screen.getByText('Sem itens cadastrados')).toBeTruthy();
    expect(screen.getByText('Sem rastreio')).toBeTruthy();
  });
});

describe('CartaoDevolucao: motivo do cliente (melhoria 1)', () => {
  it('mostra o motivo numa linha só, com reticências, e o texto inteiro no title', () => {
    render(<CartaoDevolucao devolucao={{ ...BASE, motivoCliente: 'Comprador se arrependeu' }} />);
    const linha = screen.getByText('Motivo: Comprador se arrependeu');
    expect(linha.className).toContain('truncate');
    expect(linha.getAttribute('title')).toBe('Comprador se arrependeu');
  });

  it('sem motivo (nulo, ausente ou só espaços), não mostra a linha', () => {
    for (const motivoCliente of [null, undefined, '   ']) {
      const { unmount } = render(<CartaoDevolucao devolucao={{ ...BASE, motivoCliente }} />);
      expect(screen.queryByText(/^Motivo:/)).toBeNull();
      unmount();
    }
  });
});

describe('CartaoDevolucao na etapa 4', () => {
  it('mostra quantas unidades vão para Estoque Bom e Estoque Problema (spec §6.4)', () => {
    render(<CartaoDevolucao devolucao={{ ...BASE, status: 'AGUARDANDO_NF', selos: [], destinos: { bom: 2, problema: 1 } }} />);
    expect(screen.getByText('Estoque Bom: 2')).toBeTruthy();
    expect(screen.getByText('Estoque Problema: 1')).toBeTruthy();
  });

  it('sem unidades aguardando NF, nada de contagem', () => {
    render(<CartaoDevolucao devolucao={{ ...BASE, selos: [], destinos: { bom: 0, problema: 0 } }} />);
    expect(screen.queryByText(/^Estoque/)).toBeNull();
  });
});

describe('CartaoDevolucao: conta do Bitbrain (D18)', () => {
  it('mostra "Mercado Livre · <conta>" numa linha com reticências; sem conta, só o canal', () => {
    const { unmount } = render(<CartaoDevolucao devolucao={{ ...BASE, canal: 'MERCADO_LIVRE', contaML: 'IDM Shop' }} />);
    const linha = screen.getByText('Mercado Livre · IDM Shop');
    expect(linha.className).toContain('truncate');
    unmount();
    render(<CartaoDevolucao devolucao={{ ...BASE, canal: 'MERCADO_LIVRE' }} />);
    expect(screen.getByText('Mercado Livre')).toBeTruthy();
  });
});

describe('CartaoDevolucao: conta com nome longo (e2e do Bitbrain)', () => {
  it('a linha do código e do canal não alarga o cartão (w-0 min-w-full) e o canal trunca', () => {
    const longo = 'IDM COMERCIO DE PRODUTOS ELETRONICOS LTDA';
    render(<CartaoDevolucao devolucao={{ ...BASE, canal: 'MERCADO_LIVRE', contaML: longo }} />);
    const canal = screen.getByText(new RegExp(longo));
    expect(canal.className).toContain('truncate');
    const linha = canal.parentElement as HTMLElement;
    expect(linha.className).toContain('w-0');
    expect(linha.className).toContain('min-w-full');
  });
});

describe('CartaoDevolucao: foto do produto (produtos do ML, extra)', () => {
  const FOTO = 'https://http2.mlstatic.com/D_611111-MLB70000000001_072026-O.jpg';

  it('mostra a foto pequena (44 px) ao lado do nome do produto, com a descrição no alt', () => {
    render(<CartaoDevolucao devolucao={{ ...BASE, fotoProduto: FOTO }} />);
    const foto = screen.getByRole('img', { name: 'Fone Bluetooth' });
    expect(foto.getAttribute('src')).toBe(FOTO);
    expect(foto.className).toContain('size-11');
    // Foto e nome na mesma linha, que não alarga o cartão; o nome pode quebrar (min-w-0).
    const nome = screen.getByText('Fone Bluetooth + 2 unidades');
    expect(nome.className).toContain('min-w-0');
    expect(nome.parentElement).toBe(foto.parentElement);
    expect((nome.parentElement as HTMLElement).className).toContain('w-0');
    expect((nome.parentElement as HTMLElement).className).toContain('min-w-full');
  });

  it('produto sem foto: o ícone neutro no lugar', () => {
    render(<CartaoDevolucao devolucao={{ ...BASE, fotoProduto: null }} />);
    expect(screen.getByRole('img', { name: 'Sem foto do produto' })).toBeTruthy();
  });

  it('sem itens: nem foto nem ícone', () => {
    render(<CartaoDevolucao devolucao={{ ...BASE, produto: null, unidades: 0, fotoProduto: FOTO }} />);
    expect(screen.queryByRole('img')).toBeNull();
  });
});
