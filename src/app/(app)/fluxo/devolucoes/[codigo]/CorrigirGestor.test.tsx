// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { TRAVA_TOQUE_DUPLO_MS } from '@/components/venda/useTravaToqueDuplo';
import type { Perfil } from '@/modules/auth/perfis';
import type { DadosCorrecao, UnidadeCorrecao } from '@/modules/devolucoes/correcoes-permitidas';
import type { StatusDevolucao } from '@/modules/devolucoes/dominio';
import type { EstadoAcaoGestor } from './acoes';
import { PainelCorrigir, type AcoesCorrigir } from './CorrigirGestor';

vi.mock('next/navigation', () => ({ useParams: () => ({ codigo: 'DEV-000437' }) }));

beforeAll(() => {
  Element.prototype.scrollIntoView = () => undefined;
});
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['performance'] });
});
afterEach(() => {
  vi.useRealTimers();
});

function unidade(mudancas: Partial<UnidadeCorrecao> = {}): UnidadeCorrecao {
  return {
    id: 'item-1',
    unidade: 1,
    sku: 'SKU-1',
    status: 'AGUARDANDO_NF',
    destino: 'BOM',
    motivo: null,
    observacao: null,
    produtoRecebidoSku: 'SKU-1',
    loteCodigo: null,
    loteStatus: null,
    ...mudancas,
  };
}

function dados(mudancas: Partial<DadosCorrecao> = {}): DadosCorrecao {
  return {
    status: 'AGUARDANDO_NF',
    naoIdentificada: false,
    origem: 'MANUAL',
    devolucaoExternaId: null,
    rastreio: 'BR123',
    observacoes: 'caixa amassada',
    notaAtiva: null,
    unidades: [unidade()],
    ...mudancas,
  };
}

function acoes(): { [K in keyof AcoesCorrigir]: ReturnType<typeof vi.fn<(a: EstadoAcaoGestor, d: FormData) => Promise<EstadoAcaoGestor>>> } {
  const nova = () => vi.fn(async (): Promise<EstadoAcaoGestor> => ({ erros: [] }));
  return { trocarEstoque: nova(), reabrir: nova(), desfazer: nova(), corrigirDados: nova(), apagar: nova(), encerrar: nova() };
}

function montar(d: DadosCorrecao, perfil: Perfil = 'GESTOR') {
  const a = acoes();
  const tela = render(<PainelCorrigir codigo="DEV-000437" perfil={perfil} dados={d} acoes={a} />);
  return { a, ...tela };
}

const TITULOS = ['Trocar estoque', 'Reabrir a conferência', 'Desfazer a chegada', 'Corrigir dados', 'Apagar', 'Cancelar ou marcar como extraviada'];

function titulosNaTela(): string[] {
  return TITULOS.filter((t) => screen.queryByRole('heading', { name: t }) !== null);
}

describe('PainelCorrigir: a seção "Corrigir (Gestor) (extra)" do detalhe (E29)', () => {
  it('só o Gestor vê a seção', () => {
    for (const perfil of ['OPERADOR', 'FISCAL'] as const) {
      const { container, unmount } = montar(dados(), perfil);
      expect(container.innerHTML).toBe('');
      unmount();
    }
  });

  it('fica recolhida, fechada por padrão, com o nome da seção', () => {
    const { container } = montar(dados());
    const bloco = container.querySelector('details');
    expect(bloco?.open).toBe(false);
    expect(bloco?.querySelector('summary')?.textContent).toBe('Corrigir (Gestor) (extra)');
  });

  it('cada correção aparece só quando o status deixa', () => {
    const casos: [StatusDevolucao, string[]][] = [
      ['PENDENTE_CHEGADA', ['Corrigir dados', 'Apagar', 'Cancelar ou marcar como extraviada']],
      ['NO_CD_MARKETPLACE', ['Corrigir dados', 'Apagar']],
      ['AGUARDANDO_CONFERENCIA', ['Desfazer a chegada', 'Corrigir dados', 'Apagar', 'Cancelar ou marcar como extraviada']],
      ['EM_CONFERENCIA', ['Desfazer a chegada', 'Corrigir dados', 'Apagar', 'Cancelar ou marcar como extraviada']],
      ['AGUARDANDO_NF', TITULOS],
      ['CONCLUIDA', ['Trocar estoque', 'Corrigir dados', 'Apagar']],
      ['CANCELADA', ['Corrigir dados', 'Apagar']],
      ['EXTRAVIADA', ['Corrigir dados', 'Apagar']],
    ];
    for (const [status, esperados] of casos) {
      const { unmount } = montar(dados({ status }));
      expect(titulosNaTela(), status).toEqual(esperados);
      unmount();
    }
  });

  it('com a NF autorizada: só trocar o estoque e corrigir os dados, e a seção diz por quê', () => {
    montar(dados({ status: 'CONCLUIDA', notaAtiva: 'AUTORIZADA' }));
    expect(titulosNaTela()).toEqual(['Trocar estoque', 'Corrigir dados']);
    expect(screen.getByText(/A NF de devolução está autorizada: reabrir, desfazer a chegada, cancelar e apagar ficam travados/)).toBeTruthy();
  });

  it('na não identificada não há desfazer a chegada (o caminho é apagar)', () => {
    montar(dados({ status: 'AGUARDANDO_CONFERENCIA', naoIdentificada: true }));
    expect(titulosNaTela()).toEqual(['Corrigir dados', 'Apagar', 'Cancelar ou marcar como extraviada']);
  });

  it('cancelar ou extraviar é o último bloco da seção (E24: o último da página)', () => {
    const { container } = montar(dados({ status: 'AGUARDANDO_NF' }));
    const blocos = container.querySelectorAll('details > div > *');
    expect(blocos[blocos.length - 1].querySelector('h3')?.textContent).toBe('Cancelar ou marcar como extraviada');
  });
});

describe('Trocar estoque, em cada unidade', () => {
  it('a unidade que não troca diz por quê; a que troca tem o formulário', () => {
    montar(
      dados({
        status: 'CONCLUIDA',
        unidades: [
          unidade({ id: 'i1', unidade: 1, status: 'DISPONIVEL_VENDA' }),
          unidade({ id: 'i2', unidade: 2, status: 'ENVIADO', destino: 'PROBLEMA', motivo: 'USADO', loteCodigo: 'LOT-000002', loteStatus: 'ENVIADO' }),
          unidade({ id: 'i3', unidade: 3, status: 'AUSENTE', destino: null, motivo: 'AUSENTE' }),
        ],
      }),
    );
    const u1 = screen.getByRole('form', { name: /Unidade 1/ });
    expect(within(u1).getByRole('button', { name: 'Trocar estoque' })).toBeTruthy();
    expect(screen.getByText('Já foi enviada ao fornecedor: o estoque dela não muda mais.')).toBeTruthy();
    expect(screen.getByText('Ausente. Para mudar, reabra a conferência.')).toBeTruthy();
    expect(screen.queryByRole('form', { name: /Unidade 2/ })).toBeNull();
  });

  it('Bom → Problema pede o motivo e manda a unidade, o destino e o motivo', async () => {
    const { a } = montar(dados({ status: 'CONCLUIDA', unidades: [unidade({ id: 'i1', status: 'DISPONIVEL_VENDA' })] }));
    const form = screen.getByRole('form', { name: /Unidade 1/ });
    expect(within(form).getByText(/Agora: Estoque Bom · Disponível para venda/)).toBeTruthy();
    const destino = within(form).getByLabelText('Novo estoque') as HTMLSelectElement;
    // Vem marcado o outro estoque: a troca.
    expect(destino.value).toBe('PROBLEMA');
    const motivo = within(form).getByLabelText('Motivo do Estoque Problema') as HTMLSelectElement;
    expect(motivo.required).toBe(true);
    expect([...motivo.options].map((o) => o.textContent)).not.toContain('Ausente');
    fireEvent.change(motivo, { target: { value: 'AVARIADO' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Trocar estoque' }));
    await vi.waitFor(() => expect(a.trocarEstoque).toHaveBeenCalledTimes(1));
    const enviado = a.trocarEstoque.mock.calls[0][1];
    expect([enviado.get('item'), enviado.get('destino'), enviado.get('motivo')]).toEqual(['i1', 'PROBLEMA', 'AVARIADO']);
  });

  it('Problema → Bom não mostra o motivo; a recusa do servidor aparece num alerta', async () => {
    const { a } = montar(dados({ unidades: [unidade({ id: 'i1', destino: 'PROBLEMA', motivo: 'USADO', status: 'EM_LOTE', loteCodigo: 'LOT-000007', loteStatus: 'ABERTO' })] }));
    a.trocarEstoque.mockResolvedValue({ erros: ['A unidade 1 acabou de mudar de lote. Tente de novo.'] });
    const form = screen.getByRole('form', { name: /Unidade 1/ });
    expect(within(form).getByText(/Agora: Estoque Problema · Usado · Em lote · LOT-000007/)).toBeTruthy();
    expect((within(form).getByLabelText('Novo estoque') as HTMLSelectElement).value).toBe('BOM');
    expect(within(form).queryByLabelText('Motivo do Estoque Problema')).toBeNull();
    fireEvent.click(within(form).getByRole('button', { name: 'Trocar estoque' }));
    await vi.waitFor(() => expect(within(form).getByRole('alert').textContent).toBe('A unidade 1 acabou de mudar de lote. Tente de novo.'));
  });
});

describe('as outras correções', () => {
  it('reabrir a conferência: um toque, sem apagar nada', async () => {
    const { a } = montar(dados());
    expect(screen.getByText(/Tudo o que foi preenchido fica/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Reabrir a conferência' }));
    await vi.waitFor(() => expect(a.reabrir).toHaveBeenCalledTimes(1));
  });

  it('desfazer a chegada e apagar pedem a confirmação, que diz o que será descartado', async () => {
    const { a } = montar(dados({ status: 'AGUARDANDO_CONFERENCIA' }));
    fireEvent.click(screen.getByRole('button', { name: 'Desfazer a chegada' }));
    expect(
      screen.getByText(
        'Tem certeza? A DEV-000437 volta para Pendente de chegada (ou No CD do marketplace, se a chegada veio de lá). Some a chegada (quem e quando), e são descartadas as fotos do pacote, a conferência feita e a contestação que ainda espera o Gestor.',
      ),
    ).toBeTruthy();
    vi.advanceTimersByTime(TRAVA_TOQUE_DUPLO_MS);
    fireEvent.click(screen.getByRole('button', { name: 'Sim, desfazer a chegada' }));
    await vi.waitFor(() => expect(a.desfazer).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole('button', { name: 'Apagar devolução' }));
    expect(
      screen.getByText(
        'Tem certeza? A DEV-000437 sai do quadro, das listas e da busca e vai para Apagadas. A contestação que ainda espera o Gestor sai junto; a já enviada ao ML continua lá.',
      ),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Sim, apagar devolução' }));
    // O toque duplo não vale.
    await new Promise((ok) => setTimeout(ok, 0));
    expect(a.apagar).not.toHaveBeenCalled();
  });

  it('corrigir dados: observações, rastreio e, por unidade conferida, o produto recebido e a observação', async () => {
    const { a } = montar(
      dados({
        unidades: [
          unidade({ id: 'i1', unidade: 1, observacao: 'ok' }),
          unidade({ id: 'i2', unidade: 2, status: 'EM_LOTE', destino: 'PROBLEMA', motivo: 'USADO', loteCodigo: 'LOT-000003', loteStatus: 'ABERTO' }),
          unidade({ id: 'i3', unidade: 3, status: 'AUSENTE', destino: null, motivo: 'AUSENTE', produtoRecebidoSku: null }),
        ],
      }),
    );
    const form = screen.getByRole('form', { name: 'Corrigir dados' });
    expect((within(form).getByLabelText('Observações') as HTMLTextAreaElement).value).toBe('caixa amassada');
    expect((within(form).getByLabelText('Código de rastreamento') as HTMLInputElement).value).toBe('BR123');
    const u1 = within(form).getByRole('group', { name: /Unidade 1/ });
    expect((within(u1).getByLabelText('SKU do produto recebido') as HTMLInputElement).value).toBe('SKU-1');
    const u2 = within(form).getByRole('group', { name: /Unidade 2/ });
    // No lote, o produto recebido não muda (o lote é do fornecedor dele).
    expect(within(u2).queryByLabelText('SKU do produto recebido')).toBeNull();
    expect(within(u2).getByText('No lote LOT-000003: o produto recebido não muda.')).toBeTruthy();
    // A ausente não tem o que corrigir.
    expect(within(form).queryByRole('group', { name: /Unidade 3/ })).toBeNull();

    fireEvent.change(within(u1).getByLabelText('Observação da unidade'), { target: { value: 'riscado' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Salvar correções' }));
    await vi.waitFor(() => expect(a.corrigirDados).toHaveBeenCalledTimes(1));
    const enviado = a.corrigirDados.mock.calls[0][1];
    expect(enviado.get('observacoes')).toBe('caixa amassada');
    expect(enviado.get('rastreio')).toBe('BR123');
    expect(enviado.getAll('item')).toEqual(['i1', 'i2']);
    expect([enviado.get('sku-i1'), enviado.get('obs-i1'), enviado.get('sku-i2')]).toEqual(['SKU-1', 'riscado', null]);
  });

  it('corrigir dados: o rastreio do ML não se edita', () => {
    montar(dados({ origem: 'API', devolucaoExternaId: '555' }));
    const form = screen.getByRole('form', { name: 'Corrigir dados' });
    expect(within(form).queryByLabelText('Código de rastreamento')).toBeNull();
    expect(within(form).getByText('O rastreio vem do Mercado Livre: a sincronização o atualiza.')).toBeTruthy();
  });
});
