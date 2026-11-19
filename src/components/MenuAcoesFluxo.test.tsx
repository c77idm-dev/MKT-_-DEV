// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it } from 'vitest';
import { MenuAcoesFluxo, type AcaoFluxo } from './MenuAcoesFluxo';

// O jsdom não implementa o modal nativo: o mínimo para abrir e fechar (o navegador real é testado no e2e).
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.removeAttribute('open');
    this.dispatchEvent(new Event('close'));
  };
});

const TODAS: AcaoFluxo[] = [
  { href: '/fluxo/recebimento', quando: 'Chegou um pacote na bancada', rotulo: 'Receber pacote', icone: 'pacote', destaque: true },
  { href: '/fluxo/devolucoes/nova', quando: 'Vai chegar uma devolução', rotulo: 'Nova devolução', icone: 'mais' },
  { href: '/fluxo/retiradas-full', quando: 'Voltou do armazém do ML', rotulo: 'Retiradas do Full', icone: 'caminhao' },
  { href: '/fluxo/estoque-bom', quando: 'Ver o que volta para venda', rotulo: 'Planilha Volta ao armazém', icone: 'planilha' },
];

function abrir() {
  const gatilho = screen.getByRole('button', { name: 'O que você quer fazer?' });
  fireEvent.click(gatilho);
  return { gatilho, dialogo: screen.getByRole('dialog', { name: 'O que você quer fazer?' }) as HTMLDialogElement };
}

describe('MenuAcoesFluxo', () => {
  it('o botão abre o painel com as ações, cada uma com o "quando usar" e o destino', () => {
    render(<MenuAcoesFluxo acoes={TODAS} />);
    const { dialogo } = abrir();
    expect(dialogo.open).toBe(true);
    expect(screen.getAllByRole('link').map((l) => l.getAttribute('href'))).toEqual(TODAS.map((a) => a.href));
    for (const acao of TODAS) {
      const link = screen.getByRole('link', { name: acao.rotulo });
      const descricao = document.getElementById(link.getAttribute('aria-describedby') ?? '');
      expect(descricao?.textContent).toBe(acao.quando);
    }
  });

  it('mostra só as ações recebidas (o Fiscal não vê Receber pacote nem Nova devolução)', () => {
    render(<MenuAcoesFluxo acoes={TODAS.slice(2)} />);
    abrir();
    expect(screen.getAllByRole('link').map((l) => l.getAttribute('href'))).toEqual(['/fluxo/retiradas-full', '/fluxo/estoque-bom']);
    expect(screen.queryByRole('link', { name: 'Receber pacote' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Nova devolução' })).toBeNull();
  });

  it('"Fechar" fecha o painel e o foco volta ao botão', () => {
    render(<MenuAcoesFluxo acoes={TODAS} />);
    const { gatilho, dialogo } = abrir();
    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }));
    expect(dialogo.open).toBe(false);
    expect(document.activeElement).toBe(gatilho);
  });

  it('o toque fora do painel (no fundo) fecha; o toque dentro, não', () => {
    render(<MenuAcoesFluxo acoes={TODAS} />);
    const { dialogo } = abrir();
    fireEvent.click(screen.getByRole('heading', { name: 'O que você quer fazer?' }));
    expect(dialogo.open).toBe(true);
    fireEvent.click(dialogo);
    expect(dialogo.open).toBe(false);
  });
});
