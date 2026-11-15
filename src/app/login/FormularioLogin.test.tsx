// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { hydrateRoot, type Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { entrar } from './acoes';
import { FormularioLogin } from './FormularioLogin';

vi.mock('./acoes', () => ({ entrar: vi.fn(async () => ({ erro: null })) }));

const CHAVE = 'devolucoes:email-lembrado';

beforeEach(() => {
  localStorage.clear();
});

/** Raízes montadas à mão com hydrateRoot: desmontadas mesmo quando o teste falha. */
const desmontar: Array<() => void> = [];
afterEach(() => {
  while (desmontar.length) desmontar.pop()!();
});

describe('FormularioLogin: ver a senha e lembrar o e-mail (extra)', () => {
  it('Ver mostra o que foi digitado e Ocultar esconde de novo', () => {
    render(<FormularioLogin />);
    const senha = screen.getByLabelText('Senha') as HTMLInputElement;
    expect(senha.type).toBe('password');

    const botao = screen.getByRole('button', { name: 'Ver' });
    fireEvent.click(botao);
    expect(senha.type).toBe('text');
    expect(botao.getAttribute('aria-pressed')).toBe('true');
    expect(botao.textContent).toBe('Ocultar');

    fireEvent.click(botao);
    expect(senha.type).toBe('password');
    expect(botao.getAttribute('aria-pressed')).toBe('false');
  });

  it('com e-mail lembrado, preenche o campo e põe o foco na senha', async () => {
    localStorage.setItem(CHAVE, 'ana@empresa.com.br');
    render(<FormularioLogin />);
    const email = screen.getByLabelText('E-mail') as HTMLInputElement;
    const senha = screen.getByLabelText('Senha');
    await waitFor(() => {
      expect(email.value).toBe('ana@empresa.com.br');
      expect(document.activeElement).toBe(senha);
    });
  });

  /** Monta como no navegador: HTML do servidor, a pessoa mexe no campo, e só depois o React hidrata. */
  async function hidratarDepoisDe(mexer: (email: HTMLInputElement) => void) {
    const container = document.createElement('div');
    container.innerHTML = renderToString(<FormularioLogin />);
    document.body.appendChild(container);
    const email = container.querySelector<HTMLInputElement>('#email')!;
    const senha = container.querySelector<HTMLInputElement>('#senha')!;
    mexer(email);
    let raiz: Root | undefined;
    await act(async () => {
      raiz = hydrateRoot(container, <FormularioLogin />);
    });
    desmontar.push(() => {
      act(() => raiz!.unmount());
      container.remove();
    });
    return { email, senha };
  }

  it('não troca o e-mail que a pessoa digitou (ou o navegador preencheu) antes da hidratação, nem tira o foco', async () => {
    localStorage.setItem(CHAVE, 'ana@empresa.com.br');
    const { email } = await hidratarDepoisDe((campo) => {
      campo.value = 'bia@empresa.com.br';
      campo.focus();
    });
    expect(email.value).toBe('bia@empresa.com.br');
    expect(document.activeElement).toBe(email);
  });

  it('com o campo do e-mail vazio mas focado, preenche o lembrado e deixa o foco onde está', async () => {
    localStorage.setItem(CHAVE, 'ana@empresa.com.br');
    const { email } = await hidratarDepoisDe((campo) => campo.focus());
    expect(email.value).toBe('ana@empresa.com.br');
    expect(document.activeElement).toBe(email);
  });

  it('ao enviar com Lembrar de mim marcado, guarda o e-mail; desmarcado, apaga', () => {
    const { container } = render(<FormularioLogin />);
    const caixa = screen.getByRole('checkbox', { name: 'Lembrar de mim neste aparelho' }) as HTMLInputElement;
    expect(caixa.checked).toBe(true);

    fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'ana@empresa.com.br' } });
    fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'segredo-123' } });
    const form = container.querySelector('form')!;
    fireEvent.submit(form);
    expect(localStorage.getItem(CHAVE)).toBe('ana@empresa.com.br');

    fireEvent.click(caixa);
    expect(caixa.checked).toBe(false);
    fireEvent.submit(form);
    expect(localStorage.getItem(CHAVE)).toBeNull();
  });

  it('com senha errada, o erro aparece, o e-mail continua no campo e o foco volta para a senha (extra)', async () => {
    vi.mocked(entrar).mockResolvedValueOnce({ erro: 'E-mail ou senha incorretos.' });
    const { container } = render(<FormularioLogin />);
    const email = screen.getByLabelText('E-mail') as HTMLInputElement;
    const senha = screen.getByLabelText('Senha') as HTMLInputElement;
    const caixa = screen.getByRole('checkbox', { name: 'Lembrar de mim neste aparelho' }) as HTMLInputElement;
    fireEvent.change(email, { target: { value: 'ana@empresa.com.br' } });
    fireEvent.change(senha, { target: { value: 'errada' } });
    fireEvent.click(caixa);
    fireEvent.submit(container.querySelector('form')!);

    expect((await screen.findByRole('alert')).textContent).toBe('E-mail ou senha incorretos.');
    await waitFor(() => {
      expect(email.value).toBe('ana@empresa.com.br');
      expect(caixa.checked).toBe(false);
      expect(document.activeElement).toBe(senha);
    });
  });

  it('nenhum nome acessível novo contém "senha" ou "e-mail"', () => {
    render(<FormularioLogin />);
    // O e2e usa getByLabel('Senha'), getByLabel('E-mail') e o botão 'Entrar' sem `exact`: nada novo pode casar com eles.
    expect(screen.getAllByRole('button').length).toBeGreaterThan(1);
    expect(screen.queryAllByRole('button', { name: /senha|e-mail/i })).toHaveLength(0);
    expect(screen.getAllByRole('button', { name: /entrar/i })).toHaveLength(1);
    screen.getByRole('checkbox', { name: 'Lembrar de mim neste aparelho' });
    expect(screen.queryAllByRole('checkbox', { name: /e-mail|senha/i })).toHaveLength(0);
  });
});
