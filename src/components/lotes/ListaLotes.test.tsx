// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ListaLotes } from './ListaLotes';

const BASE = { titulo: 'Lotes e Remessas', lotes: [], fornecedores: [{ id: 'f1', razaoSocial: 'Peças Brasil Ltda' }], acaoFiltro: '/lotes', vazio: 'Nenhum lote encontrado.' };

describe('ListaLotes (spec §6.5: filtrável por fornecedor e por status; §6.7: busca)', () => {
  it('filtros GET com os valores atuais e o aviso de vazio', () => {
    render(<ListaLotes {...BASE} total={0} pagina={1} filtros={{ status: 'FECHADO', busca: 'SN-1' }} />);
    const form = screen.getByRole('search');
    expect((form).getAttribute('action')).toBe('/lotes');
    expect((form).getAttribute('method')).toBe('get');
    expect((screen.getByLabelText('Status') as HTMLSelectElement).value).toBe('FECHADO');
    expect((screen.getByLabelText('Buscar') as HTMLInputElement).value).toBe('SN-1');
    expect(screen.getByRole('option', { name: 'Peças Brasil Ltda' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Filtrar' })).toBeTruthy();
    expect(screen.getByText('Nenhum lote encontrado.')).toBeTruthy();
  });

  it('a paginação leva os filtros junto', () => {
    render(<ListaLotes {...BASE} total={45} pagina={1} filtros={{ status: 'FECHADO' }} />);
    expect((screen.getByRole('link', { name: 'Próxima' })).getAttribute('href')).toBe('/lotes?status=FECHADO&pagina=2');
  });
});
