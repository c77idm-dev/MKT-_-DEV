// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ usePathname: () => '/fluxo' }));

import { AppShell } from './AppShell';

describe('AppShell', () => {
  it('mostra o usuário, o perfil, só as abas do perfil e o botão Sair', () => {
    render(
      <AppShell
        usuario={{ id: '1', nome: 'Maria da Silva', email: 'maria@empresa.com', perfil: 'FISCAL' }}
        acaoSair={async () => {}}
      >
        <p>conteúdo da página</p>
      </AppShell>,
    );

    expect(screen.getByText('Maria da Silva')).toBeTruthy();
    expect(screen.getByText('Fiscal')).toBeTruthy();
    const nav = screen.getByRole('navigation', { name: 'Seções' });
    expect(within(nav).getAllByRole('link').map((a) => a.textContent)).toEqual([
      'Fluxo',
      'Lotes e Remessas',
      'Produtos e Fornecedores',
    ]);
    expect(screen.getByRole('button', { name: 'Sair' })).toBeTruthy();
    expect(screen.getByText('conteúdo da página')).toBeTruthy();
  });
});
