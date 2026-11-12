// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BuscaAvancada } from './BuscaAvancada';

describe('BuscaAvancada (spec §6.7)', () => {
  it('tem os filtros do PDF, com os nomes exatos, num formulário GET', () => {
    render(<BuscaAvancada acao="/fluxo/etapa/1" filtros={{}} />);
    const formulario = screen.getByRole('search', { name: 'Busca Avançada' });
    expect(formulario.getAttribute('method')).toBe('get');
    expect(formulario.getAttribute('action')).toBe('/fluxo/etapa/1');
    expect(Array.from(formulario.querySelectorAll('legend')).map((l) => l.textContent)).toEqual([
      'Código de Rastreamento',
      'Número do Pedido e ID da Reclamação/Mediação do Marketplace',
      'Marketplace de Origem e Status Operacional Atual',
      'Fornecedor ou Código de Barras/Serial Number',
      'Período',
    ]);
    expect(screen.getByRole('combobox', { name: 'Marketplace de Origem' }).querySelectorAll('option')).toHaveLength(7);
    expect(screen.getByRole('combobox', { name: 'Status Operacional Atual' }).querySelectorAll('option')).toHaveLength(9);
  });

  it('no celular fica atrás do botão "Filtros", que abre e fecha o painel', () => {
    render(<BuscaAvancada acao="/fluxo/busca" filtros={{}} />);
    const botao = screen.getByRole('button', { name: 'Filtros' });
    expect(botao.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(botao);
    expect(botao.getAttribute('aria-expanded')).toBe('true');
  });

  it('mostra os filtros ativos como etiquetas que se removem com um toque, e preenche o formulário', () => {
    render(<BuscaAvancada acao="/fluxo/busca" filtros={{ rastreio: 'BR1', canal: 'SHOPEE' }} />);
    expect(screen.getByRole('button', { name: 'Filtros (2)' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Remover filtro: Rastreio: BR1' }).getAttribute('href')).toBe('/fluxo/busca?canal=SHOPEE');
    expect((screen.getByRole('textbox', { name: 'Código de Rastreamento' }) as HTMLInputElement).value).toBe('BR1');
  });
});
