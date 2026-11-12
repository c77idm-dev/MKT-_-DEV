// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CamposItens } from './CamposItens';

describe('CamposItens', () => {
  it('começa com um item e acrescenta e remove itens', () => {
    render(<CamposItens />);
    expect(screen.getAllByRole('textbox', { name: /^SKU do item/ })).toHaveLength(1);
    expect(screen.queryByRole('button', { name: /^Remover item/ })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Adicionar item' }));
    expect(screen.getAllByRole('textbox', { name: /^SKU do item/ })).toHaveLength(2);

    fireEvent.click(screen.getByRole('button', { name: 'Remover item 1' }));
    expect(screen.getAllByRole('textbox', { name: /^SKU do item/ })).toHaveLength(1);
    expect(screen.getByRole('spinbutton', { name: /quantidade do item 1/ })).toBeTruthy();
  });

  it('pode começar vazio quando os itens são opcionais', () => {
    render(<CamposItens iniciais={[]} permitirVazio />);
    expect(screen.queryAllByRole('textbox')).toHaveLength(0);
    expect(screen.getByRole('button', { name: 'Adicionar item' })).toBeTruthy();
  });
});
