// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CartaoBackup } from './CartaoBackup';

describe('CartaoBackup (extra, decisão 22)', () => {
  it('sem backup registrado', () => {
    render(<CartaoBackup backup={null} />);
    expect(screen.getByRole('heading', { name: 'Backup diário' })).toBeTruthy();
    expect(screen.getByText('Nenhum backup registrado ainda.')).toBeTruthy();
  });

  it('OK mostra o texto com o tamanho no tom bom', () => {
    render(<CartaoBackup backup={{ texto: 'Último backup: 20/11/2026 05:30 (120,4 MB)', tom: 'bom', erro: null }} />);
    expect(screen.getByText('Último backup: 20/11/2026 05:30 (120,4 MB)').classList.contains('text-bom')).toBe(true);
  });

  it('FALHOU mostra o erro logo abaixo', () => {
    render(<CartaoBackup backup={{ texto: 'O último backup falhou em 20/11/2026 05:30.', tom: 'erro', erro: 'BACKUP_SENHA não definida.' }} />);
    expect(screen.getByText('O último backup falhou em 20/11/2026 05:30.').classList.contains('text-erro')).toBe(true);
    expect(screen.getByText('BACKUP_SENHA não definida.')).toBeTruthy();
  });

  it('interrompido usa o tom de erro', () => {
    render(<CartaoBackup backup={{ texto: 'Backup interrompido (começou em 20/11/2026 05:00).', tom: 'erro', erro: null }} />);
    expect(screen.getByText(/^Backup interrompido/).classList.contains('text-erro')).toBe(true);
  });
});
