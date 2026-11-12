// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FormularioConfirmacao } from './FormularioConfirmacao';
import { FormularioColunas, ImportacaoInterativa, mesmoMapeamento } from './ImportacaoInterativa';

const CAMPOS = [
  { chave: 'sku', rotulo: 'SKU', obrigatorio: true },
  { chave: 'custo', rotulo: 'Custo', obrigatorio: false },
];
const CABECALHOS = ['Código', 'Preço'];

async function nada() {}
async function confirmarNada() {
  return { erros: [] };
}

function Tela({ mapeamento }: { mapeamento: Record<string, string | null> }) {
  return (
    <ImportacaoInterativa chaves={CAMPOS.map((c) => c.chave)} mapeamento={mapeamento}>
      <FormularioColunas campos={CAMPOS} cabecalhos={CABECALHOS} exemplo={[]} acao={nada} />
      <FormularioConfirmacao acao={confirmarNada} mapeamento={mapeamento} habilitado />
    </ImportacaoInterativa>
  );
}

describe('prévia desatualizada', () => {
  it('compara ignorando nulo e ausente', () => {
    expect(mesmoMapeamento({ a: null }, { a: '' }, ['a'])).toBe(true);
    expect(mesmoMapeamento({}, { a: null }, ['a'])).toBe(true);
    expect(mesmoMapeamento({ a: 'X' }, { a: null }, ['a'])).toBe(false);
  });

  it('desabilita a confirmação enquanto a escolha difere da prévia e libera quando o servidor devolve a mesma', () => {
    const { rerender } = render(<Tela mapeamento={{ sku: 'Código', custo: 'Preço' }} />);
    const confirmar = screen.getByRole('button', { name: 'Confirmar importação' });
    expect((confirmar as HTMLButtonElement).disabled).toBe(false);

    fireEvent.change(screen.getByLabelText('Custo'), { target: { value: '' } });
    expect((screen.getByRole('button', { name: 'Confirmar importação' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('Atualizando a prévia…')).toBeTruthy();

    // O mesmo mapeamento antigo continua desabilitando: depende da propriedade, não de tempo.
    rerender(<Tela mapeamento={{ sku: 'Código', custo: 'Preço' }} />);
    expect((screen.getByRole('button', { name: 'Confirmar importação' }) as HTMLButtonElement).disabled).toBe(true);

    rerender(<Tela mapeamento={{ sku: 'Código', custo: null }} />);
    expect((screen.getByRole('button', { name: 'Confirmar importação' }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByText('Atualizando a prévia…')).toBeNull();
  });
});
