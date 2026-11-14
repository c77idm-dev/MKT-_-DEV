import { asc, eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ErroEmissorIndisponivel } from '@/conectores/nfe/erros';
import { EmissorFalso } from '@/conectores/nfe/falso';
import { definirEmissorParaTestes } from '@/conectores/nfe/registro';
import type { SituacaoNota } from '@/conectores/nfe/tipos';
import { devolucoes, itensDevolucao, notasFiscais } from '@/db/schema';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import { definirFilaParaTestes, FilaMemoria } from '@/modules/fila/fila';
import { listarEventos } from '@/modules/historico/eventos';
import { portaLotes } from '@/modules/lotes/porta';
import { obterArmazenamento } from '@/modules/midia/armazenamento';
import { criarDbTeste, limparTabelas } from '../../../tests/helpers/db';
import { criarUsuarioTeste } from '../../../tests/helpers/fabricas';
import { configurarFiscalTeste, criarDevolucaoNoEstoqueTeste, inserirNotaVendaTeste } from '../../../tests/helpers/fabricas-fiscal';
import { rodarTarefasFiscais } from '../../../tests/helpers/fila-fiscal';
import { cancelarNota, solicitarEmissao } from './emissao';

const { db, sql } = criarDbTeste();
const AUTORIZADA_EM = new Date('2026-11-12T13:00:00Z');
const HORA = 60 * 60 * 1000;
const JUSTIFICATIVA = 'Cliente desistiu da devolução';
let gestor: UsuarioSessao;
let fiscal: UsuarioSessao;
let operador: UsuarioSessao;
let fila: FilaMemoria;

/** Falha ao baixar o XML do cancelamento enquanto `falhar` for true. */
class EmissorSemArquivoDeCancelamento extends EmissorFalso {
  falhar = true;
  override async baixar(url: string): Promise<Buffer> {
    if (this.falhar && url.includes('cancelamento')) throw new ErroEmissorIndisponivel('A Focus NFe não respondeu ao baixar o arquivo.');
    return super.baixar(url);
  }
}

beforeEach(async () => {
  await limparTabelas(sql);
  gestor = await criarUsuarioTeste(db, 'GESTOR');
  fiscal = await criarUsuarioTeste(db, 'FISCAL');
  operador = await criarUsuarioTeste(db, 'OPERADOR');
  await configurarFiscalTeste(db, gestor);
  fila = new FilaMemoria();
  definirFilaParaTestes(fila);
  definirEmissorParaTestes(new EmissorFalso());
});
afterEach(() => {
  vi.restoreAllMocks();
  definirFilaParaTestes(null);
  definirEmissorParaTestes(null);
});
afterAll(async () => {
  await sql.end();
});

async function devolucaoAutorizada() {
  const dev = await criarDevolucaoNoEstoqueTeste(db, gestor, {
    unidades: [{ sku: 'FONE-01', destino: 'BOM' }, { sku: 'FONE-01', destino: 'PROBLEMA' }, { sku: 'CABO-02', destino: 'AUSENTE' }],
  });
  await inserirNotaVendaTeste(db, dev.id, { itens: [{ codigo: 'FONE-01', quantidade: 2 }] });
  const { notaFiscalId } = await solicitarEmissao(db, { tipo: 'DEVOLUCAO_VENDA', devolucaoId: dev.id }, fiscal);
  await rodarTarefasFiscais(db, fila, AUTORIZADA_EM);
  return { dev, notaFiscalId };
}
async function notaDe(id: string) {
  const [nota] = await db.select().from(notasFiscais).where(eq(notasFiscais.id, id));
  return nota;
}

describe('cancelarNota (spec §8.6)', () => {
  it('em até 24 h: NF cancelada com o XML do cancelamento; itens e devolução voltam para Aguardando NF; uma NF nova pode sair', async () => {
    const { dev, notaFiscalId } = await devolucaoAutorizada();
    const quando = new Date(AUTORIZADA_EM.getTime() + 23 * HORA);
    await cancelarNota(db, notaFiscalId, '  Cliente   desistiu da devolução ', fiscal, quando);

    expect(await notaDe(notaFiscalId)).toMatchObject({
      situacao: 'CANCELADA',
      canceladaEm: quando,
      justificativaCancelamento: JUSTIFICATIVA,
      xmlCancelamentoCaminho: `nfe/2026/11/${notaFiscalId}-cancelamento.xml`,
    });
    expect(await obterArmazenamento().existe(`nfe/2026/11/${notaFiscalId}-cancelamento.xml`)).toBe(true);
    const [d] = await db.select().from(devolucoes).where(eq(devolucoes.id, dev.id));
    expect(d).toMatchObject({ status: 'AGUARDANDO_NF', concluidaEm: null });
    const itens = await db.select({ status: itensDevolucao.status }).from(itensDevolucao).where(eq(itensDevolucao.devolucaoId, dev.id)).orderBy(asc(itensDevolucao.unidade));
    expect(itens.map((i) => i.status)).toEqual(['AGUARDANDO_NF', 'AGUARDANDO_NF', 'AUSENTE']);
    expect((await listarEventos(db, 'devolucao', dev.id)).at(-1)).toMatchObject({
      acao: 'devolucao_reaberta',
      de: 'CONCLUIDA',
      para: 'AGUARDANDO_NF',
      usuarioNome: fiscal.nome,
      dados: { notaFiscalId, motivo: JUSTIFICATIVA },
    });
    expect((await listarEventos(db, 'nota_fiscal', notaFiscalId)).at(-1)).toMatchObject({ acao: 'nf_cancelada', de: 'AUTORIZADA', para: 'CANCELADA' });
    expect(fila.enviadas.some((t) => t.opcoes?.chaveUnica === `${notaFiscalId}:cancelamento`)).toBe(false);

    const { notaFiscalId: nova } = await solicitarEmissao(db, { tipo: 'DEVOLUCAO_VENDA', devolucaoId: dev.id }, fiscal);
    expect(nova).not.toBe(notaFiscalId);
  });

  it('recusa: justificativa curta, Operador, depois de 24 h, NF que não está autorizada', async () => {
    const { notaFiscalId } = await devolucaoAutorizada();
    const dentro = new Date(AUTORIZADA_EM.getTime() + HORA);
    await expect(cancelarNota(db, notaFiscalId, 'curta', fiscal, dentro)).rejects.toThrow('A justificativa precisa ter de 15 a 255 caracteres.');
    await expect(cancelarNota(db, notaFiscalId, JUSTIFICATIVA, operador, dentro)).rejects.toThrow('Só o Fiscal ou o Gestor emitem, reenviam e cancelam NF.');
    await expect(cancelarNota(db, notaFiscalId, JUSTIFICATIVA, fiscal, new Date(AUTORIZADA_EM.getTime() + 24 * HORA))).rejects.toThrow(
      'O prazo de cancelamento (24 horas depois da autorização) já passou. Fale com o contador sobre a nota de estorno.',
    );
    const outra = await criarDevolucaoNoEstoqueTeste(db, gestor, { unidades: [{ sku: 'FONE-01', destino: 'BOM' }] });
    await inserirNotaVendaTeste(db, outra.id, { numero: 202, itens: [{ codigo: 'FONE-01' }] });
    const { notaFiscalId: processando } = await solicitarEmissao(db, { tipo: 'DEVOLUCAO_VENDA', devolucaoId: outra.id }, fiscal);
    await expect(cancelarNota(db, processando, JUSTIFICATIVA, fiscal, dentro)).rejects.toThrow('Só uma NF autorizada pode ser cancelada.');
    expect((await notaDe(notaFiscalId)).situacao).toBe('AUTORIZADA');
  });

  it('a SEFAZ recusa: a nota continua autorizada e a devolução concluída', async () => {
    const { dev, notaFiscalId } = await devolucaoAutorizada();
    await expect(cancelarNota(db, notaFiscalId, 'Teste RECUSAR cancelamento', fiscal, AUTORIZADA_EM)).rejects.toThrow(
      'A SEFAZ recusou o cancelamento: Cancelamento recusado (simulação): a justificativa contém RECUSAR',
    );
    expect((await notaDe(notaFiscalId)).situacao).toBe('AUTORIZADA');
    const [d] = await db.select({ status: devolucoes.status }).from(devolucoes).where(eq(devolucoes.id, dev.id));
    expect(d.status).toBe('CONCLUIDA');
  });

  it('a porta de lotes pode impedir o cancelamento (Fase 5)', async () => {
    const { notaFiscalId } = await devolucaoAutorizada();
    vi.spyOn(portaLotes, 'motivoParaNaoCancelarDevolucao').mockResolvedValue('A unidade 2 está no lote LOT-000001, que já foi fechado.');
    await expect(cancelarNota(db, notaFiscalId, JUSTIFICATIVA, fiscal, AUTORIZADA_EM)).rejects.toThrow('A unidade 2 está no lote LOT-000001, que já foi fechado.');
    expect((await notaDe(notaFiscalId)).situacao).toBe('AUTORIZADA');
  });

  it('sem o XML do cancelamento na hora, a consulta busca depois (decisão 9)', async () => {
    const emissor = new EmissorSemArquivoDeCancelamento();
    definirEmissorParaTestes(emissor);
    const { notaFiscalId } = await devolucaoAutorizada();
    await cancelarNota(db, notaFiscalId, JUSTIFICATIVA, fiscal, AUTORIZADA_EM);
    expect(await notaDe(notaFiscalId)).toMatchObject({ situacao: 'CANCELADA', xmlCancelamentoCaminho: null });
    expect(fila.enviadas.some((t) => t.opcoes?.chaveUnica === `${notaFiscalId}:cancelamento`)).toBe(true);

    emissor.falhar = false;
    await rodarTarefasFiscais(db, fila, AUTORIZADA_EM);
    expect((await notaDe(notaFiscalId)).xmlCancelamentoCaminho).toBe(`nfe/2026/11/${notaFiscalId}-cancelamento.xml`);
  });

  it('se a consulta não devolve o XML do cancelamento, a tarefa falha (vai para Falhas) e o caminho continua nulo', async () => {
    class EmissorSemUrlDeCancelamento extends EmissorSemArquivoDeCancelamento {
      semUrl = false;
      override async consultar(referencia: string): Promise<SituacaoNota> {
        if (this.semUrl) return { situacao: 'CANCELADA', urlXmlCancelamento: null };
        return super.consultar(referencia);
      }
    }
    const emissor = new EmissorSemUrlDeCancelamento();
    definirEmissorParaTestes(emissor);
    const { notaFiscalId } = await devolucaoAutorizada();
    await cancelarNota(db, notaFiscalId, JUSTIFICATIVA, fiscal, AUTORIZADA_EM);
    emissor.semUrl = true;
    await expect(rodarTarefasFiscais(db, fila, AUTORIZADA_EM)).rejects.toThrow('O XML do cancelamento da NF');
    expect((await notaDe(notaFiscalId)).xmlCancelamentoCaminho).toBeNull();
  });
});
