// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PendenciasSemFornecedor } from './PendenciasSemFornecedor';

const unidade = { itemId: '0b9f1c2e-3d4a-4b5c-8d6e-7f8091a2b3c4', devolucaoCodigo: 'DEV-000123', unidade: 1, sku: 'FONE-01', descricao: 'Fone', motivo: 'Avariado', serial: 'SN-1', skuSugerido: 'FONE-01' };

describe('PendenciasSemFornecedor (decisões 11 e 23)', () => {
  it('a última unidade sai da lista e a mensagem de sucesso fica na seção', async () => {
    const acao = vi.fn(async () => ({ erros: [], ok: 'Unidade 1 da DEV-000123 incluída no lote LOT-000045.' }));
    const { rerender, container } = render(<PendenciasSemFornecedor unidades={[unidade]} total={1} verTodas={null} acao={acao} />);
    fireEvent.click(screen.getByRole('button', { name: 'Associar produto' }));
    expect(await screen.findByText('Unidade 1 da DEV-000123 incluída no lote LOT-000045.')).toBeTruthy();
    rerender(<PendenciasSemFornecedor unidades={[]} total={0} verTodas={null} acao={acao} />);
    expect(screen.queryByRole('button', { name: 'Associar produto' })).toBeNull();
    expect(screen.getByText('Unidade 1 da DEV-000123 incluída no lote LOT-000045.')).toBeTruthy();
    expect(container.querySelector('#retorno-sem-fornecedor')?.getAttribute('aria-live')).toBe('polite');
  });

  it('com mais unidades do que as mostradas, oferece "Ver todas (N)"', () => {
    render(<PendenciasSemFornecedor unidades={[unidade]} total={12} verTodas="/lotes/sem-fornecedor" acao={vi.fn()} />);
    expect(screen.getByRole('heading', { name: 'Sem fornecedor (12)' })).toBeTruthy();
    expect((screen.getByRole('link', { name: 'Ver todas (12)' })).getAttribute('href')).toBe('/lotes/sem-fornecedor');
  });

  it('sem unidades e sem mensagem, não mostra nada', () => {
    const { container } = render(<PendenciasSemFornecedor unidades={[]} total={0} verTodas={null} acao={vi.fn()} />);
    expect(container.innerHTML).toBe('');
  });
});
