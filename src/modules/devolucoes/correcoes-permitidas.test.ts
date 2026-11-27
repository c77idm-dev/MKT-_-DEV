import { describe, expect, it } from 'vitest';
import { STATUS_DEVOLUCAO, type StatusDevolucao } from './dominio';
import { correcoesPermitidas, motivoSemTroca, type DadosCorrecao, type UnidadeCorrecao } from './correcoes-permitidas';

function unidade(mudancas: Partial<UnidadeCorrecao> = {}): UnidadeCorrecao {
  return {
    id: 'u1',
    unidade: 1,
    sku: 'SKU-1',
    status: 'AGUARDANDO_NF',
    destino: 'BOM',
    motivo: null,
    observacao: null,
    produtoRecebidoSku: null,
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
    observacoes: null,
    notaAtiva: null,
    unidades: [unidade()],
    ...mudancas,
  };
}

function emCada(status: readonly StatusDevolucao[], campo: keyof ReturnType<typeof correcoesPermitidas>, extra: Partial<DadosCorrecao> = {}) {
  return STATUS_DEVOLUCAO.filter((s) => correcoesPermitidas(dados({ status: s, ...extra }))[campo]).sort();
}

describe('correcoesPermitidas (E29: cada correção só quando o status deixa)', () => {
  it('trocar o estoque: só em Aguardando NF e Concluída', () => {
    expect(emCada(STATUS_DEVOLUCAO, 'trocarEstoque')).toEqual(['AGUARDANDO_NF', 'CONCLUIDA']);
  });

  it('reabrir a conferência: só em Aguardando NF, sem NF ativa e sem unidade em lote', () => {
    expect(emCada(STATUS_DEVOLUCAO, 'reabrir')).toEqual(['AGUARDANDO_NF']);
    expect(correcoesPermitidas(dados({ notaAtiva: 'AUTORIZADA' })).reabrir).toBe(false);
    expect(correcoesPermitidas(dados({ notaAtiva: 'PROCESSANDO' })).reabrir).toBe(false);
    expect(correcoesPermitidas(dados({ unidades: [unidade({ loteCodigo: 'LOT-000001', loteStatus: 'ABERTO', status: 'EM_LOTE' })] })).reabrir).toBe(false);
  });

  it('desfazer a chegada: Aguardando conferência, Em conferência e Aguardando NF, menos a não identificada', () => {
    expect(emCada(STATUS_DEVOLUCAO, 'desfazer')).toEqual(['AGUARDANDO_CONFERENCIA', 'AGUARDANDO_NF', 'EM_CONFERENCIA']);
    expect(emCada(STATUS_DEVOLUCAO, 'desfazer', { naoIdentificada: true })).toEqual([]);
    expect(correcoesPermitidas(dados({ notaAtiva: 'AUTORIZADA' })).desfazer).toBe(false);
    expect(correcoesPermitidas(dados({ unidades: [unidade({ loteCodigo: 'LOT-000001', loteStatus: 'ABERTO', status: 'EM_LOTE' })] })).desfazer).toBe(false);
  });

  it('cancelar ou extraviar: nas 4 etapas antes da NF; em Aguardando NF, só sem NF ativa', () => {
    expect(emCada(STATUS_DEVOLUCAO, 'encerrar')).toEqual(['AGUARDANDO_CONFERENCIA', 'AGUARDANDO_NF', 'EM_CONFERENCIA', 'PENDENTE_CHEGADA']);
    expect(emCada(STATUS_DEVOLUCAO, 'encerrar', { notaAtiva: 'PROCESSANDO' })).toEqual(['AGUARDANDO_CONFERENCIA', 'EM_CONFERENCIA', 'PENDENTE_CHEGADA']);
  });

  it('apagar: em qualquer status, sem NF ativa e sem unidade em lote', () => {
    expect(emCada(STATUS_DEVOLUCAO, 'apagar')).toEqual([...STATUS_DEVOLUCAO].sort());
    expect(emCada(STATUS_DEVOLUCAO, 'apagar', { notaAtiva: 'AUTORIZADA' })).toEqual([]);
    expect(correcoesPermitidas(dados({ status: 'CONCLUIDA', unidades: [unidade({ status: 'ENVIADO', loteCodigo: 'LOT-1', loteStatus: 'ENVIADO' })] })).apagar).toBe(false);
  });

  it('o rastreio só se edita quando não veio do ML (origem diferente de API e sem devolução externa)', () => {
    expect(correcoesPermitidas(dados()).editarRastreio).toBe(true);
    expect(correcoesPermitidas(dados({ origem: 'PLANILHA' })).editarRastreio).toBe(true);
    expect(correcoesPermitidas(dados({ origem: 'API' })).editarRastreio).toBe(false);
    expect(correcoesPermitidas(dados({ devolucaoExternaId: '123' })).editarRastreio).toBe(false);
  });

  it('explica o que segura reabrir, desfazer e apagar', () => {
    expect(correcoesPermitidas(dados()).bloqueio).toBeNull();
    expect(correcoesPermitidas(dados({ notaAtiva: 'AUTORIZADA' })).bloqueio).toBe(
      'A NF de devolução está autorizada: reabrir, desfazer a chegada, cancelar e apagar ficam travados. O Fiscal cancela a NF antes.',
    );
    expect(correcoesPermitidas(dados({ notaAtiva: 'PROCESSANDO' })).bloqueio).toBe(
      'A NF de devolução está em processamento: espere o resultado antes de reabrir, desfazer a chegada, cancelar ou apagar.',
    );
    expect(
      correcoesPermitidas(dados({ status: 'CONCLUIDA', unidades: [unidade({ status: 'ENVIADO', loteCodigo: 'LOT-000009', loteStatus: 'ENVIADO' })] })).bloqueio,
    ).toBe('A unidade 1 está no lote LOT-000009: apagar fica travado enquanto ela estiver num lote.');
  });
});

describe('motivoSemTroca (a unidade que não troca de estoque e o porquê)', () => {
  it('troca a unidade com a conferência feita: Aguardando NF, disponível, sem fornecedor ou no lote Aberto', () => {
    expect(motivoSemTroca(unidade({ status: 'AGUARDANDO_NF' }))).toBeNull();
    expect(motivoSemTroca(unidade({ status: 'DISPONIVEL_VENDA' }))).toBeNull();
    expect(motivoSemTroca(unidade({ status: 'SEM_FORNECEDOR', destino: 'PROBLEMA', motivo: 'USADO' }))).toBeNull();
    expect(motivoSemTroca(unidade({ status: 'EM_LOTE', destino: 'PROBLEMA', motivo: 'USADO', loteCodigo: 'LOT-1', loteStatus: 'ABERTO' }))).toBeNull();
  });

  it('não troca a ausente, a pendente, a enviada, a resolvida e a que está num lote que não está mais Aberto', () => {
    expect(motivoSemTroca(unidade({ status: 'AUSENTE', destino: null, motivo: 'AUSENTE' }))).toBe('Ausente. Para mudar, reabra a conferência.');
    expect(motivoSemTroca(unidade({ status: 'PENDENTE', destino: null }))).toBe('A conferência desta unidade ainda não terminou.');
    expect(motivoSemTroca(unidade({ status: 'ENVIADO', loteCodigo: 'LOT-000002', loteStatus: 'ENVIADO' }))).toBe(
      'Já foi enviada ao fornecedor: o estoque dela não muda mais.',
    );
    expect(motivoSemTroca(unidade({ status: 'RESOLVIDO', loteCodigo: 'LOT-000002', loteStatus: 'FINALIZADO' }))).toBe(
      'Já foi resolvida com o fornecedor: o estoque dela não muda mais.',
    );
    expect(motivoSemTroca(unidade({ status: 'EM_LOTE', loteCodigo: 'LOT-000003', loteStatus: 'FECHADO' }))).toBe(
      'Está no lote LOT-000003 (Fechado): só dá para trocar enquanto o lote está Aberto.',
    );
  });
});
