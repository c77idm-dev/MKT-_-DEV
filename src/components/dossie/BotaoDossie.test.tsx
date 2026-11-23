// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BotaoDossie } from './BotaoDossie';

/** O jsdom não baixa arquivos: segura a navegação do link e guarda se o componente já tinha cancelado o toque. */
const cancelados: boolean[] = [];
function aoClicarNaJanela(evento: Event) {
  cancelados.push(evento.defaultPrevented);
  evento.preventDefault();
}
beforeEach(() => {
  cancelados.length = 0;
  window.addEventListener('click', aoClicarNaJanela);
});
afterEach(() => {
  window.removeEventListener('click', aoClicarNaJanela);
  cleanup();
  vi.useRealTimers();
  for (const c of document.cookie.split(';')) {
    const nome = c.split('=')[0].trim();
    if (nome) document.cookie = `${nome}=; Max-Age=0; Path=/`;
  }
});

const GERANDO = 'Gerando o PDF… pode levar até 1 minuto. O download começa sozinho.';

/** A marca que o toque pôs no link (?n=). */
function marcaDoLink(link: HTMLElement): string {
  const n = new URL(link.getAttribute('href')!, 'http://localhost').searchParams.get('n');
  expect(n).toMatch(/^[0-9a-f]{16}$/);
  return n!;
}

describe('BotaoDossie (extra)', () => {
  it('link comum para a rota do dossiê (sem o atributo download), com a dica ligada ao link', () => {
    render(<BotaoDossie codigo="DEV-000123" />);
    const link = screen.getByRole('link', { name: 'Baixar dossiê de provas (PDF)' });
    expect(link.getAttribute('href')).toBe('/api/devolucoes/DEV-000123/dossie');
    // Sem `download`: a sessão vencida leva à tela de login em vez de salvar o HTML dela como .pdf; o nome do arquivo
    // vem do Content-Disposition da rota.
    expect(link.hasAttribute('download')).toBe(false);
    const dica = document.getElementById(link.getAttribute('aria-describedby')!);
    expect(dica?.textContent).toBe('(extra) Tudo da devolução num arquivo só, para anexar na resposta ao ML.');
    expect(screen.getByRole('status').textContent).toBe('');
  });

  it('ao tocar: avisa que está gerando e segura toques repetidos até o PDF ficar pronto (cookie da marca)', () => {
    vi.useFakeTimers();
    render(<BotaoDossie codigo="DEV-000123" />);
    const link = screen.getByRole('link', { name: 'Baixar dossiê de provas (PDF)' });
    fireEvent.click(link);
    const marca = marcaDoLink(link);
    expect(link.getAttribute('href')).toBe(`/api/devolucoes/DEV-000123/dossie?n=${marca}`);
    expect(screen.getByRole('status').textContent).toBe(GERANDO);
    expect(link.getAttribute('aria-disabled')).toBe('true');
    // Passou dos antigos 10 s e o PDF ainda não ficou pronto: continua gerando e segurando o 2º toque.
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    fireEvent.click(link);
    expect(cancelados).toEqual([false, true]);
    expect(screen.getByRole('status').textContent).toBe(GERANDO);
    // A rota respondeu com o PDF e o cookie da marca: o aviso some, o cookie é apagado e o botão libera.
    document.cookie = `dossie_${marca}=1; Path=/`;
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(screen.getByRole('status').textContent).toBe('');
    expect(link.getAttribute('aria-disabled')).toBeNull();
    expect(document.cookie).not.toContain(`dossie_${marca}`);
    fireEvent.click(link);
    expect(cancelados).toEqual([false, true, false]);
    expect(marcaDoLink(link)).not.toBe(marca);
  });

  it('sem resposta em 2 minutos: libera o botão e diz para tocar de novo', () => {
    vi.useFakeTimers();
    render(<BotaoDossie codigo="DEV-000123" />);
    const link = screen.getByRole('link', { name: 'Baixar dossiê de provas (PDF)' });
    fireEvent.click(link);
    act(() => {
      vi.advanceTimersByTime(120_000);
    });
    expect(screen.getByRole('status').textContent).toBe('Se o download não começou, toque de novo.');
    expect(link.getAttribute('aria-disabled')).toBeNull();
    fireEvent.click(link);
    expect(cancelados).toEqual([false, false]);
    expect(screen.getByRole('status').textContent).toBe(GERANDO);
  });
});
