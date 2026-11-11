// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ETAPAS } from '@/modules/devolucoes/etapas';
import { QuadroFluxo } from './QuadroFluxo';

describe('QuadroFluxo', () => {
  it('mostra uma coluna por etapa do PDF, com título, total e aviso de vazio', () => {
    render(<QuadroFluxo colunas={ETAPAS.map((e) => ({ numero: e.numero, titulo: e.titulo, total: 0 }))} />);

    for (const etapa of ETAPAS) {
      expect(screen.getByRole('heading', { level: 2, name: etapa.titulo })).toBeTruthy();
    }
    expect(screen.getAllByText('Nenhuma devolução nesta etapa')).toHaveLength(5);
  });

  it('não mostra o aviso de vazio quando a coluna tem devoluções', () => {
    render(<QuadroFluxo colunas={[{ numero: 1, titulo: 'Pedidos Pendentes de Chegada', total: 3 }]} />);
    expect(screen.queryByText('Nenhuma devolução nesta etapa')).toBeNull();
    expect(screen.getByText('3')).toBeTruthy();
  });
});
