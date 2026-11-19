// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { lerFiltros } from '@/modules/devolucoes/filtros';
import { ListaDevolucoes } from './ListaDevolucoes';

vi.mock('./BuscaAvancada', () => ({ BuscaAvancada: () => null }));

const base = { titulo: 'Etapa', acaoBusca: '/fluxo/etapa/2', filtros: lerFiltros({}), devolucoes: [], total: 0, pagina: 1 };

describe('ListaDevolucoes: nota (extra)', () => {
  it('mostra a nota abaixo da contagem quando recebe', () => {
    render(<ListaDevolucoes {...base} nota="Urgentes do ML primeiro (extra)." />);
    expect(screen.getByText('Urgentes do ML primeiro (extra).')).toBeTruthy();
  });
  it('sem nota, nada extra', () => {
    render(<ListaDevolucoes {...base} />);
    expect(screen.queryByText(/extra/)).toBeNull();
  });
});
