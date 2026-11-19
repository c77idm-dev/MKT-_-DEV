// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AtalhoReputacao } from './AtalhoReputacao';

describe('AtalhoReputacao (extra)', () => {
  it('com devoluções, é um link para a Busca com o filtro ligado e mostra quantas são', () => {
    render(<AtalhoReputacao total={3} />);
    const link = screen.getByRole('link', { name: 'Afetam a reputação · 3' });
    expect(link.getAttribute('href')).toBe('/fluxo/busca?reputacao=1');
    expect(link.querySelector('svg[aria-hidden="true"]')).toBeTruthy();
  });

  it('some quando nenhuma devolução em andamento afeta a reputação', () => {
    const { container } = render(<AtalhoReputacao total={0} />);
    expect(container.innerHTML).toBe('');
  });
});
