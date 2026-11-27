import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  exigir: vi.fn(),
  revalidar: vi.fn(),
  redirecionar: vi.fn((url: string) => {
    throw new Error(`REDIRECT ${url}`);
  }),
  trocar: vi.fn(),
  reabrir: vi.fn(),
  desfazer: vi.fn(),
  corrigir: vi.fn(),
  apagar: vi.fn(),
  idsDosProdutos: vi.fn(),
}));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidar }));
vi.mock('next/navigation', () => ({ redirect: mocks.redirecionar }));
vi.mock('@/db', () => ({ obterDb: () => ({ db: true }) }));
vi.mock('@/modules/auth/servidor', () => ({ exigirPermissao: mocks.exigir }));
vi.mock('@/modules/devolucoes/correcoes', () => ({
  trocarDestinoItem: mocks.trocar,
  reabrirConferencia: mocks.reabrir,
  desfazerChegada: mocks.desfazer,
  corrigirDados: mocks.corrigir,
  apagarDevolucao: mocks.apagar,
}));
vi.mock('@/modules/catalogo/produtos', () => ({ idsDosProdutos: mocks.idsDosProdutos }));
vi.mock('@/modules/devolucoes/excecoes', () => ({ encerrarPendente: vi.fn(), identificarDevolucao: vi.fn() }));

import { ErroDevolucao } from '@/modules/devolucoes/erros';
import { apagarAcao, corrigirDadosAcao, desfazerChegadaAcao, reabrirConferenciaAcao, trocarEstoqueAcao } from './acoes';

const GESTOR = { id: 'g1', nome: 'Gestora', email: 'g@x', perfil: 'GESTOR' };
const ID = '11111111-1111-4111-8111-111111111111';
const ITEM = '22222222-2222-4222-8222-222222222222';
const VAZIO = { erros: [] as string[] };

function form(campos: Record<string, string | string[]>): FormData {
  const f = new FormData();
  for (const [nome, valor] of Object.entries(campos)) for (const v of [valor].flat()) f.append(nome, v);
  return f;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.exigir.mockResolvedValue(GESTOR);
});

describe('ações do "Corrigir (Gestor)" (E29): só o Gestor, e a recusa do servidor volta como erro', () => {
  it('toda ação exige administrar; sem a permissão (notFound) o serviço nem é chamado', async () => {
    mocks.exigir.mockRejectedValue(new Error('NEXT_NOT_FOUND'));
    await expect(trocarEstoqueAcao('DEV-000001', VAZIO, form({ item: ITEM, destino: 'BOM' }))).rejects.toThrow('NEXT_NOT_FOUND');
    await expect(reabrirConferenciaAcao(ID, 'DEV-000001')).rejects.toThrow('NEXT_NOT_FOUND');
    await expect(desfazerChegadaAcao(ID, 'DEV-000001')).rejects.toThrow('NEXT_NOT_FOUND');
    await expect(corrigirDadosAcao(ID, 'DEV-000001', VAZIO, form({ observacoes: 'x' }))).rejects.toThrow('NEXT_NOT_FOUND');
    await expect(apagarAcao(ID, 'DEV-000001')).rejects.toThrow('NEXT_NOT_FOUND');
    expect(mocks.exigir.mock.calls.map((c) => c[0])).toEqual(['administrar', 'administrar', 'administrar', 'administrar', 'administrar']);
    for (const servico of [mocks.trocar, mocks.reabrir, mocks.desfazer, mocks.corrigir, mocks.apagar]) expect(servico).not.toHaveBeenCalled();
  });

  it('código fora do formato: devolução não encontrada, sem chamar o serviço', async () => {
    expect(await reabrirConferenciaAcao(ID, '../x')).toEqual({ erros: ['Devolução não encontrada.'] });
    expect(await trocarEstoqueAcao('x', VAZIO, form({ item: ITEM, destino: 'BOM' }))).toEqual({ erros: ['Devolução não encontrada.'] });
    expect(mocks.reabrir).not.toHaveBeenCalled();
    expect(mocks.trocar).not.toHaveBeenCalled();
  });

  it('trocar estoque: manda a unidade, o destino e o motivo (só no Problema) e volta ao detalhe com a confirmação', async () => {
    mocks.trocar.mockResolvedValue({ aviso: null });
    await expect(trocarEstoqueAcao('DEV-000001', VAZIO, form({ item: ITEM, destino: 'PROBLEMA', motivo: 'AVARIADO' }))).rejects.toThrow(
      'REDIRECT /fluxo/devolucoes/DEV-000001?ok=estoque_trocado',
    );
    expect(mocks.trocar).toHaveBeenCalledWith({ db: true }, ITEM, 'PROBLEMA', 'AVARIADO', GESTOR);
    await expect(trocarEstoqueAcao('DEV-000001', VAZIO, form({ item: ITEM, destino: 'BOM', motivo: 'AVARIADO' }))).rejects.toThrow('REDIRECT');
    expect(mocks.trocar).toHaveBeenLastCalledWith({ db: true }, ITEM, 'BOM', null, GESTOR);
    expect(mocks.revalidar).toHaveBeenCalledWith('/fluxo', 'layout');
  });

  it('trocar estoque: o motivo fora da lista vai vazio (o serviço recusa), e o destino é obrigatório', async () => {
    mocks.trocar.mockRejectedValue(new ErroDevolucao('Escolha o motivo do Estoque Problema.'));
    expect(await trocarEstoqueAcao('DEV-000001', VAZIO, form({ item: ITEM, destino: 'PROBLEMA', motivo: 'XYZ' }))).toEqual({
      erros: ['Escolha o motivo do Estoque Problema.'],
    });
    expect(mocks.trocar).toHaveBeenCalledWith({ db: true }, ITEM, 'PROBLEMA', null, GESTOR);
    expect(await trocarEstoqueAcao('DEV-000001', VAZIO, form({ item: ITEM }))).toEqual({ erros: ['Escolha Estoque Bom ou Estoque Problema.'] });
  });

  it('o aviso do serviço vai pela chave na URL (nunca o texto)', async () => {
    mocks.reabrir.mockResolvedValue({ aviso: 'A contestação desta devolução já foi enviada ao Mercado Livre e continua lá.' });
    await expect(reabrirConferenciaAcao(ID, 'DEV-000001')).rejects.toThrow(
      'REDIRECT /fluxo/devolucoes/DEV-000001?ok=conferencia_reaberta&aviso=contestacao_enviada',
    );
    mocks.desfazer.mockResolvedValue({ aviso: null });
    await expect(desfazerChegadaAcao(ID, 'DEV-000001')).rejects.toThrow('REDIRECT /fluxo/devolucoes/DEV-000001?ok=chegada_desfeita');
  });

  it('a recusa do servidor volta como erro, e o erro inesperado sobe', async () => {
    mocks.desfazer.mockRejectedValue(new ErroDevolucao('O pacote não identificado não tem para onde voltar. Para tirá-lo da lista, apague-o.'));
    expect(await desfazerChegadaAcao(ID, 'DEV-000001')).toEqual({
      erros: ['O pacote não identificado não tem para onde voltar. Para tirá-lo da lista, apague-o.'],
    });
    mocks.reabrir.mockRejectedValue(new Error('banco caiu'));
    await expect(reabrirConferenciaAcao(ID, 'DEV-000001')).rejects.toThrow('banco caiu');
  });

  it('corrigir dados: observações, rastreio (só quando o campo veio) e cada unidade, com o SKU trocado pelo id do cadastro', async () => {
    mocks.idsDosProdutos.mockResolvedValue(new Map([['SKU-NOVO', 'p-novo']]));
    mocks.corrigir.mockResolvedValue({ aviso: null });
    await expect(
      corrigirDadosAcao(
        ID,
        'DEV-000001',
        VAZIO,
        form({ observacoes: 'caixa amassada', rastreio: 'br123', item: [ITEM, 'outro'], [`sku-${ITEM}`]: ' sku-novo ', [`obs-${ITEM}`]: 'riscado', 'obs-outro': '' }),
      ),
    ).rejects.toThrow('REDIRECT /fluxo/devolucoes/DEV-000001?ok=dados_corrigidos');
    expect(mocks.idsDosProdutos).toHaveBeenCalledWith({ db: true }, ['SKU-NOVO']);
    expect(mocks.corrigir).toHaveBeenCalledWith(
      { db: true },
      ID,
      {
        observacao: 'caixa amassada',
        rastreio: 'br123',
        itens: [
          { itemId: ITEM, produtoRecebidoId: 'p-novo', observacao: 'riscado' },
          { itemId: 'outro', observacao: '' },
        ],
      },
      GESTOR,
    );

    mocks.corrigir.mockClear();
    await expect(corrigirDadosAcao(ID, 'DEV-000001', VAZIO, form({ observacoes: 'só isso' }))).rejects.toThrow('REDIRECT');
    expect(mocks.corrigir).toHaveBeenCalledWith({ db: true }, ID, { observacao: 'só isso', itens: [] }, GESTOR);
  });

  it('corrigir dados: SKU fora do cadastro e "Nenhum dado mudou." ficam no formulário', async () => {
    mocks.idsDosProdutos.mockResolvedValue(new Map());
    expect(await corrigirDadosAcao(ID, 'DEV-000001', VAZIO, form({ item: ITEM, [`sku-${ITEM}`]: 'NAO-EXISTE' }))).toEqual({
      erros: ['O SKU NAO-EXISTE não está no cadastro de produtos.'],
    });
    expect(mocks.corrigir).not.toHaveBeenCalled();
    mocks.corrigir.mockResolvedValue({ aviso: 'Nenhum dado mudou.' });
    expect(await corrigirDadosAcao(ID, 'DEV-000001', VAZIO, form({ observacoes: '' }))).toEqual({ erros: ['Nenhum dado mudou.'] });
    expect(mocks.redirecionar).not.toHaveBeenCalled();
  });

  it('apagar: vai para o Fluxo com o aviso de Apagadas', async () => {
    mocks.apagar.mockResolvedValue({ aviso: null });
    await expect(apagarAcao(ID, 'DEV-000001')).rejects.toThrow('REDIRECT /fluxo?apagada=DEV-000001');
    expect(mocks.apagar).toHaveBeenCalledWith({ db: true }, ID, GESTOR);
    mocks.apagar.mockRejectedValue(new ErroDevolucao('A devolução tem NF de devolução autorizada: o Fiscal cancela a NF antes.'));
    expect(await apagarAcao(ID, 'DEV-000001')).toEqual({
      erros: ['A devolução tem NF de devolução autorizada: o Fiscal cancela a NF antes.'],
    });
  });
});
