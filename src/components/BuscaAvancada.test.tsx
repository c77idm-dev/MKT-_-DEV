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

  it('(extra) caixa "Só as que afetam a reputação no ML" no painel; a etiqueta "Afetam a reputação" remove o filtro', () => {
    const { unmount } = render(<BuscaAvancada acao="/fluxo/busca" filtros={{}} />);
    const caixa = screen.getByRole('checkbox', { name: 'Só as que afetam a reputação no ML (extra)' }) as HTMLInputElement;
    expect(caixa.name).toBe('reputacao');
    expect(caixa.value).toBe('1');
    expect(caixa.checked).toBe(false);
    unmount();

    render(<BuscaAvancada acao="/fluxo/busca" filtros={{ reputacao: '1', canal: 'MERCADO_LIVRE' }} />);
    expect((screen.getByRole('checkbox', { name: 'Só as que afetam a reputação no ML (extra)' }) as HTMLInputElement).checked).toBe(true);
    const etiqueta = screen.getByRole('link', { name: 'Remover filtro: Afetam a reputação' });
    expect(etiqueta.textContent).toContain('Afetam a reputação');
    expect(etiqueta.getAttribute('href')).toBe('/fluxo/busca?canal=MERCADO_LIVRE');
  });

  it('(extra) o atalho fica na mesma linha do botão "Filtros"', () => {
    render(<BuscaAvancada acao="/fluxo/busca" filtros={{}} atalho={<a href="/fluxo/busca?reputacao=1">Atalho</a>} />);
    const botao = screen.getByRole('button', { name: 'Filtros' });
    const atalho = screen.getByRole('link', { name: 'Atalho' });
    expect(atalho.parentElement).toBe(botao.parentElement);
  });

  it('mostra os filtros ativos como etiquetas que se removem com um toque, e preenche o formulário', () => {
    render(<BuscaAvancada acao="/fluxo/busca" filtros={{ rastreio: 'BR1', canal: 'SHOPEE' }} />);
    expect(screen.getByRole('button', { name: 'Filtros (2)' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Remover filtro: Rastreio: BR1' }).getAttribute('href')).toBe('/fluxo/busca?canal=SHOPEE');
    expect((screen.getByRole('textbox', { name: 'Código de Rastreamento' }) as HTMLInputElement).value).toBe('BR1');
  });
});
