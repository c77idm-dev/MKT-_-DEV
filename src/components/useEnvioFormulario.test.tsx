// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeAll, describe, expect, it } from 'vitest';
import { ListaErros } from './ListaErros';
import { useEnvioFormulario } from './useEnvioFormulario';

async function acaoComErro(): Promise<{ erros: string[] }> {
  return { erros: ['Campo inválido', 'Campo inválido'] };
}

function Formulario() {
  const [estado, aoEnviar] = useEnvioFormulario(acaoComErro, { erros: [] });
  return (
    <form onSubmit={aoEnviar}>
      <ListaErros erros={estado.erros} />
      <button type="submit">Salvar</button>
    </form>
  );
}

describe('foco nos erros do formulário', () => {
  beforeAll(() => {
    Element.prototype.scrollIntoView = () => undefined;
  });

  it('leva o foco para a lista de erros quando a ação devolve erros', async () => {
    render(<Formulario />);
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    const alerta = await screen.findByRole('alert');
    await waitFor(() => expect(document.activeElement).toBe(alerta));
    expect(alerta.id).toBe('erros-formulario');
  });
});
