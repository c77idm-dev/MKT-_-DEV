// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CANAIS, ROTULO_CANAL } from '@/modules/devolucoes/dominio';
import { SelectCanal } from './SelectCanal';

describe('SelectCanal', () => {
  it('lista os marketplaces, começa sem escolha e é obrigatório', () => {
    render(<SelectCanal id="canal" />);
    const select = screen.getByLabelText('Canal (obrigatório)') as HTMLSelectElement;
    expect(select.name).toBe('canal');
    expect(select.required).toBe(true);
    expect(select.value).toBe('');
    for (const c of CANAIS) expect(screen.getByRole('option', { name: ROTULO_CANAL[c] })).toBeTruthy();
  });
});
