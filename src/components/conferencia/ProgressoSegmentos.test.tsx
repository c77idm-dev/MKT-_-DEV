// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ProgressoSegmentos } from './ProgressoSegmentos';

describe('ProgressoSegmentos (spec §6.0: progresso em segmentos)', () => {
  it('diz o passo atual em texto e marca o segmento atual', () => {
    const passos = [
      { chave: 'a', rotulo: 'Pacote' },
      { chave: 'b', rotulo: 'Unidade 1' },
      { chave: 'c', rotulo: 'Destino' },
    ];
    render(<ProgressoSegmentos passos={passos} atual={1} completos={[true, false, false]} />);
    expect(screen.getByText('Passo 2 de 3:')).toBeTruthy();
    const lista = screen.getByRole('list', { name: 'Progresso da conferência' });
    const itens = within(lista).getAllByRole('listitem');
    expect(itens[1].getAttribute('aria-current')).toBe('step');
    expect(itens[0].textContent).toContain('Pacote: completo');
    expect(itens[2].textContent).toContain('Destino: falta');
  });
});
