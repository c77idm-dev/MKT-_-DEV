// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AlertasPainel } from './AlertasPainel';

describe('AlertasPainel (spec §6.0.1)', () => {
  it('uma linha por alerta, com a contagem ou o detalhe, levando para o lugar certo', () => {
    render(
      <AlertasPainel
        alertas={[
          { id: 'prazo_ml', titulo: 'Prazo do ML vencendo', quantidade: 3, detalhe: null, tom: 'erro', href: '/fluxo/alertas#prazo_ml' },
          { id: 'disco', titulo: 'Disco do servidor quase cheio', quantidade: null, detalhe: '92% em uso', tom: 'atencao', href: '/configuracoes/conferencia' },
        ]}
      />,
    );
    const regiao = screen.getByRole('region', { name: 'Alertas' });
    expect(screen.getByRole('link', { name: /^Prazo do ML vencendo/ }).getAttribute('href')).toBe('/fluxo/alertas#prazo_ml');
    expect(screen.getByRole('link', { name: /^Prazo do ML vencendo/ }).textContent).toContain('3');
    expect(screen.getByRole('link', { name: /^Disco do servidor quase cheio/ }).textContent).toContain('92% em uso');
    expect(regiao.querySelectorAll('li')).toHaveLength(2);
    expect(screen.queryByRole('link', { name: /^Ver todos os alertas/ })).toBeNull();
  });

  it('a linha tem respiro vertical e o título longo quebra sem empurrar a contagem', () => {
    render(
      <AlertasPainel
        alertas={[{ id: 'ml', titulo: 'Conta do Mercado Livre precisa ser reconectada', quantidade: 2, detalhe: null, tom: 'erro', href: '/x' }]}
      />,
    );
    const link = screen.getByRole('link', { name: /^Conta do Mercado Livre/ });
    expect(link.className).toContain('py-2');
    expect(link.querySelectorAll('span')[0].className).toContain('min-w-0');
    expect(link.querySelectorAll('span')[1].className).toContain('shrink-0');
  });

  it('no painel, só os 3 primeiros e "Ver todos os alertas (N)" (celular, decisão 13)', () => {
    const alertas = (['falhas', 'backup', 'disco', 'prazo_ml', 'nf_rejeitada'] as const).map((id) => ({
      id, titulo: `Alerta ${id}`, quantidade: 1, detalhe: null, tom: 'erro' as const, href: `/x#${id}`,
    }));
    render(<AlertasPainel alertas={alertas} limite={3} />);
    expect(screen.getByRole('region', { name: 'Alertas' }).querySelectorAll('li')).toHaveLength(3);
    expect(screen.getByRole('link', { name: 'Ver todos os alertas (5)' }).getAttribute('href')).toBe('/fluxo/alertas');
  });

  it('sem alertas, nada', () => {
    const { container } = render(<AlertasPainel alertas={[]} />);
    expect(container.innerHTML).toBe('');
  });
});
