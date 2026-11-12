import { describe, expect, it } from 'vitest';
import { textoDoForm } from './formulario';

describe('textoDoForm', () => {
  it('lê o texto do campo, vazio quando falta e vazio quando é arquivo', () => {
    const dados = new FormData();
    dados.set('pedido', ' PED-1 ');
    dados.set('arquivo', new File(['x'], 'a.txt'));
    expect(textoDoForm(dados, 'pedido')).toBe(' PED-1 ');
    expect(textoDoForm(dados, 'nao-existe')).toBe('');
    expect(textoDoForm(dados, 'arquivo')).toBe('');
  });
});
