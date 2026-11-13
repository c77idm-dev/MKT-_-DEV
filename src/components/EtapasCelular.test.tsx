// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ResumoDevolucao } from '@/modules/devolucoes/busca';
import { ETAPAS } from '@/modules/devolucoes/etapas';
import { EtapasCelular } from './EtapasCelular';

const CARTAO: ResumoDevolucao = {
  id: '1',
  codigo: 'DEV-000001',
  canal: 'AMAZON',
  status: 'AGUARDANDO_CONFERENCIA',
  rastreio: 'BR123',
  pedidos: ['AMZ-1'],
  produto: 'Fone Bluetooth',
  unidades: 1,
  naoIdentificada: false,
  criadaEm: new Date('2026-11-12T12:00:00Z'),
  recebidaEm: new Date('2026-11-12T13:00:00Z'),
  selos: [],
};

const COLUNAS = ETAPAS.map((e) => ({
  numero: e.numero,
  titulo: e.titulo,
  total: e.numero === 2 ? 1 : 0,
  cartoes: e.numero === 2 ? [CARTAO] : [],
  href: `/fluxo/etapa/${e.numero}`,
}));

describe('EtapasCelular', () => {
  it('seletor das 5 etapas com o nome do PDF e o total, e os cartões da etapa escolhida', () => {
    render(<EtapasCelular colunas={COLUNAS} selecionada={2} />);
    const nav = screen.getByRole('navigation', { name: 'Etapas' });
    const links = within(nav).getAllByRole('link');
    expect(links).toHaveLength(5);
    expect(links[1].getAttribute('aria-current')).toBe('page');
    expect(links[1].getAttribute('href')).toBe('/fluxo?etapa=2');
    expect(within(nav).getByRole('link', { name: 'Pedidos Chegados - Aguardando Conferência: 1 devolução' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: '2. Pedidos Chegados - Aguardando Conferência' })).toBeTruthy();
    expect(screen.getByRole('link', { name: /DEV-000001/ })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Ver lista: Pedidos Chegados - Aguardando Conferência' }).getAttribute('href')).toBe('/fluxo/etapa/2');
  });

  it('etapa sem devoluções', () => {
    render(<EtapasCelular colunas={COLUNAS} selecionada={3} />);
    expect(screen.getByText('Nenhuma devolução nesta etapa.')).toBeTruthy();
  });

  it('etapa com nota mostra a nota', () => {
    render(<EtapasCelular colunas={COLUNAS.map((c) => (c.numero === 5 ? { ...c, nota: 'Lotes chegam depois.' } : c))} selecionada={5} />);
    expect(screen.getByText('Lotes chegam depois.')).toBeTruthy();
    expect(screen.queryByText('Nenhuma devolução nesta etapa.')).toBeNull();
  });

  it('sem colunas, não renderiza nada (e não quebra)', () => {
    const { container } = render(<EtapasCelular colunas={[]} selecionada={1} />);
    expect(container.firstChild).toBeNull();
  });

  it('conteudoEtapa aparece no topo da etapa escolhida, antes dos cartões, e só nela', () => {
    const { rerender } = render(
      <EtapasCelular colunas={COLUNAS} selecionada={2} conteudoEtapa={{ 2: <nav aria-label="Extra da etapa 2">extra</nav> }} />,
    );
    const extra = screen.getByRole('navigation', { name: 'Extra da etapa 2' });
    const cartao = screen.getByRole('link', { name: /DEV-000001/ });
    // O extra vem antes do cartão na ordem do documento.
    expect(extra.compareDocumentPosition(cartao) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    rerender(<EtapasCelular colunas={COLUNAS} selecionada={3} conteudoEtapa={{ 2: <nav aria-label="Extra da etapa 2">extra</nav> }} />);
    expect(screen.queryByRole('navigation', { name: 'Extra da etapa 2' })).toBeNull();
  });
});
