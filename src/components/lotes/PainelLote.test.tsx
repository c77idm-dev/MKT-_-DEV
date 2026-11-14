// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { DetalheLote } from '@/modules/lotes/consultas';
import { PainelLote } from './PainelLote';

function detalhe(p: Partial<DetalheLote> = {}): DetalheLote {
  return {
    id: 'l1', codigo: 'LOT-000045', status: 'ABERTO', rotuloStatus: 'Aberto', tom: 'destaque', tipo: null, rotuloTipo: null,
    fornecedor: { razaoSocial: 'Peças Brasil Ltda', cnpj: '11.222.333/0001-81', uf: 'MG', contatoSac: null, emailSac: null },
    rastreioEnvio: null, datas: { criado: '14/11/2026 10:00', fechado: null, enviado: null, finalizado: null },
    unidades: [{ itemId: 'i1', devolucaoCodigo: 'DEV-000123', unidade: 2, sku: 'FONE-01', descricao: 'Fone', serial: 'SN-1', motivo: 'Avariado', observacao: null, status: 'EM_LOTE', rotuloStatus: 'Em lote', resultado: null }],
    nota: null, anteriores: [], editavel: true, destinos: [], outroAberto: null, temLista: false, historico: [],
    ...p,
  };
}

describe('PainelLote (decisão 23)', () => {
  it('o bloco some e a mensagem fica: "Fechar lote" sai quando o lote fecha, "Lote fechado." continua no topo', async () => {
    const acao = vi.fn(async () => ({ erros: [], ok: 'Lote fechado.' }));
    const { rerender, container } = render(<PainelLote detalhe={detalhe()} podeGerir links={null} acao={acao} />);
    fireEvent.click(screen.getByRole('radio', { name: 'Conserto' }));
    fireEvent.click(screen.getByRole('button', { name: 'Fechar lote' }));
    expect(await screen.findByText('Lote fechado.')).toBeTruthy();

    // O revalidatePath traz o lote fechado: o bloco "Fechar lote" sai da página.
    rerender(<PainelLote detalhe={detalhe({ status: 'FECHADO', rotuloStatus: 'Fechado', tipo: 'CONSERTO', rotuloTipo: 'Conserto' })} podeGerir links={null} acao={acao} />);
    expect(screen.queryByRole('region', { name: 'Fechar lote' })).toBeNull();
    expect(screen.getByText('Lote fechado.')).toBeTruthy();
    expect(container.querySelector('#retorno-lote')?.getAttribute('aria-live')).toBe('polite');
  });

  it('Unidades: link para as evidências e, editável, a caixa de mover com "Novo lote"', () => {
    render(<PainelLote detalhe={detalhe({ destinos: [{ valor: 'l2', rotulo: 'LOT-000046 (Fechado)' }] })} podeGerir links={null} acao={vi.fn()} />);
    expect(screen.getByRole('link', { name: /Ver evidências/ }).getAttribute('href')).toBe('/fluxo/devolucoes/DEV-000123#conferencia');
    expect(screen.getByRole('checkbox', { name: 'Mover unidade 2 da DEV-000123' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Novo lote' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'LOT-000046 (Fechado)' })).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Tipo do lote' })).toBeTruthy();
    for (const tipo of ['Conserto', 'Troca', 'Garantia']) expect((screen.getByRole('radio', { name: tipo }) as HTMLInputElement).checked).toBe(false);
  });

  it('sem gerir_fiscal: nenhuma ação', () => {
    render(<PainelLote detalhe={detalhe()} podeGerir={false} links={null} acao={vi.fn()} />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByRole('checkbox')).toBeNull();
  });
});

describe('PainelLote (Tarefa 12: remessa)', () => {
  it('FECHADO sem NF: "Emitir NF de Remessa" é a ação principal; "Reabrir lote" fica fora do rodapé', () => {
    render(<PainelLote detalhe={detalhe({ status: 'FECHADO', rotuloStatus: 'Fechado', tipo: 'CONSERTO', rotuloTipo: 'Conserto' })} podeGerir links={null} acao={vi.fn()} />);
    const nf = screen.getByRole('region', { name: 'NF de Remessa' });
    expect(within(nf).getByRole('button', { name: 'Emitir NF de Remessa' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Reabrir lote' })).toBeTruthy();
  });

  it('Registrar resultado: um seletor por unidade enviada com os resultados da spec', () => {
    const enviada = { ...detalhe().unidades[0], status: 'ENVIADO' as const, rotuloStatus: 'Enviado ao fornecedor' };
    render(<PainelLote detalhe={detalhe({ status: 'ENVIADO', rotuloStatus: 'Enviado', tipo: 'CONSERTO', rotuloTipo: 'Conserto', editavel: false, temLista: true, unidades: [enviada] })} podeGerir links={null} acao={vi.fn()} />);
    const seletor = screen.getByLabelText('Resultado do fornecedor (unidade 2 da DEV-000123)');
    expect([...seletor.querySelectorAll('option')].map((o) => o.textContent)).toEqual(['Escolha', 'Trocado', 'Consertado', 'Crédito', 'Descartado', 'Devolvido sem solução']);
    expect(screen.getByRole('link', { name: 'Baixar Excel' }).getAttribute('href')).toBe('/api/lotes/LOT-000045/lista-consolidada?formato=xlsx');
  });
});
