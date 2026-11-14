import { randomUUID } from 'node:crypto';
import { asc, eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { definirConectorParaTestes } from '@/conectores/marketplace/registro';
import { ErroEmissorIndisponivel } from '@/conectores/nfe/erros';
import { EmissorFalso } from '@/conectores/nfe/falso';
import { definirEmissorParaTestes } from '@/conectores/nfe/registro';
import type { NotaParaEmissao, SituacaoNota } from '@/conectores/nfe/tipos';
import { devolucoes, itensDevolucao, notasFiscais, regrasFiscais } from '@/db/schema';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import { definirFilaParaTestes, FilaMemoria } from '@/modules/fila/fila';
import { listarEventos } from '@/modules/historico/eventos';
import { obterArmazenamento } from '@/modules/midia/armazenamento';
import { manipuladoresFiscal } from '@/worker/manipuladores/fiscal';
import { criarDbTeste, limparTabelas } from '../../../tests/helpers/db';
import { criarUsuarioTeste } from '../../../tests/helpers/fabricas';
import { configurarFiscalTeste, criarDevolucaoNoEstoqueTeste, inserirNotaVendaTeste, type UnidadeEstoqueTeste } from '../../../tests/helpers/fabricas-fiscal';
import { rodarTarefasFiscais } from '../../../tests/helpers/fila-fiscal';
import { xmlNotaVendaTeste } from '../../../tests/helpers/xml-nfe';
import { chaveValida } from './chave';
import { processarConsulta } from './ciclo';
import { LIMITE_CONSULTAS } from './consultas';
import { referenciaDaNota } from './dominio';
import { reenviarNota, solicitarEmissao } from './emissao';
import { salvarRegra, sugestaoDeRegra } from './regras';

const { db, sql } = criarDbTeste();
const AGORA = new Date('2026-11-12T13:00:00Z');
let gestor: UsuarioSessao;
let fiscal: UsuarioSessao;
let operador: UsuarioSessao;
let fila: FilaMemoria;
let emissor: EmissorEspiao;

/** O falso, guardando cada nota enviada (para conferir a montagem). */
class EmissorEspiao extends EmissorFalso {
  readonly enviadas: NotaParaEmissao[] = [];
  override async emitir(nota: NotaParaEmissao) {
    this.enviadas.push(nota);
    return super.emitir(nota);
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
  emissor = new EmissorEspiao();
  definirEmissorParaTestes(emissor);
});
afterEach(() => {
  definirFilaParaTestes(null);
  definirEmissorParaTestes(null);
  definirConectorParaTestes('MERCADO_LIVRE', null);
});
afterAll(async () => {
  await sql.end();
});

const UNIDADES_PADRAO: UnidadeEstoqueTeste[] = [
  { sku: 'FONE-01', destino: 'BOM', serial: 'SN-1' },
  { sku: 'FONE-01', destino: 'PROBLEMA' },
  { sku: 'CABO-02', destino: 'AUSENTE' },
];

async function devolucaoPronta(unidades: UnidadeEstoqueTeste[] = UNIDADES_PADRAO) {
  const dev = await criarDevolucaoNoEstoqueTeste(db, gestor, { unidades });
  const venda = await inserirNotaVendaTeste(db, dev.id, { itens: [{ codigo: 'FONE-01', quantidade: 2, valorUnitario: 100 }] });
  return { dev, venda };
}
async function notaDe(id: string) {
  const [nota] = await db.select().from(notasFiscais).where(eq(notasFiscais.id, id));
  return nota;
}
function pedir(devolucaoId: string, usuario: UsuarioSessao = fiscal) {
  return solicitarEmissao(db, { tipo: 'DEVOLUCAO_VENDA', devolucaoId }, usuario);
}

describe('emissão da NF de devolução (spec §6.4, §8.6; contrato §5.7)', () => {
  it('solicita, envia e autoriza na 2ª consulta: BOM disponível, PROBLEMA sem fornecedor (Fase 5), devolução concluída', async () => {
    const { dev, venda } = await devolucaoPronta();
    const { notaFiscalId } = await pedir(dev.id);
    expect(await notaDe(notaFiscalId)).toMatchObject({
      situacao: 'PROCESSANDO',
      tipo: 'DEVOLUCAO_VENDA',
      devolucaoId: dev.id,
      ambiente: 'HOMOLOGACAO',
      referenciaEmissor: referenciaDaNota(notaFiscalId),
      chavesReferenciadas: [venda.chave],
      emitidaPor: fiscal.id,
    });
    expect(fila.enviadas).toEqual([expect.objectContaining({ nome: 'nfe.emitir', dados: { notaFiscalId } })]);

    expect(await rodarTarefasFiscais(db, fila, AGORA)).toEqual(['nfe.emitir', 'nfe.consultar']);
    expect(fila.enviadas[1]).toMatchObject({
      nome: 'nfe.consultar',
      dados: { notaFiscalId, consulta: 2 },
      opcoes: { chaveUnica: expect.stringMatching(new RegExp(`^${notaFiscalId}:\\d+:2$`)), iniciarEm: new Date(AGORA.getTime() + 10_000) },
    });

    const nota = await notaDe(notaFiscalId);
    expect(nota).toMatchObject({
      situacao: 'AUTORIZADA',
      serie: '1',
      xmlCaminho: `nfe/2026/11/${notaFiscalId}.xml`,
      danfeCaminho: `nfe/2026/11/${notaFiscalId}-danfe.pdf`,
      autorizadaEm: AGORA,
      motivoRejeicao: null,
    });
    expect(chaveValida(nota.chave ?? '')).toBe(true);
    expect(await obterArmazenamento().existe(`nfe/2026/11/${notaFiscalId}.xml`)).toBe(true);
    expect(await obterArmazenamento().existe(`nfe/2026/11/${notaFiscalId}-danfe.pdf`)).toBe(true);

    const [d] = await db.select().from(devolucoes).where(eq(devolucoes.id, dev.id));
    expect(d).toMatchObject({ status: 'CONCLUIDA', concluidaEm: AGORA });
    const itens = await db
      .select({ status: itensDevolucao.status })
      .from(itensDevolucao)
      .where(eq(itensDevolucao.devolucaoId, dev.id))
      .orderBy(asc(itensDevolucao.unidade));
    expect(itens.map((i) => i.status)).toEqual(['DISPONIVEL_VENDA', 'SEM_FORNECEDOR', 'AUSENTE']);

    const eventos = await listarEventos(db, 'devolucao', dev.id);
    expect(eventos.map((e) => e.acao)).toEqual(expect.arrayContaining(['nf_solicitada', 'nf_autorizada']));
    expect(eventos.at(-1)).toMatchObject({ acao: 'nf_autorizada', de: 'AGUARDANDO_NF', para: 'CONCLUIDA', usuarioNome: null });
    expect((await listarEventos(db, 'nota_fiscal', notaFiscalId)).map((e) => [e.acao, e.de, e.para])).toEqual([
      ['nf_solicitada', null, 'PROCESSANDO'],
      ['nf_autorizada', 'PROCESSANDO', 'AUTORIZADA'],
    ]);
    expect(await listarEventos(db, 'item', dev.itens[0].id)).toEqual([
      expect.objectContaining({ acao: 'item_status', de: 'AGUARDANDO_NF', para: 'DISPONIVEL_VENDA' }),
    ]);
  });

  it('a nota enviada ao emissor é a de devolução, com a chave da venda e as unidades agrupadas', async () => {
    const { dev, venda } = await devolucaoPronta();
    await pedir(dev.id);
    await rodarTarefasFiscais(db, fila, AGORA);
    expect(emissor.enviadas).toHaveLength(1);
    expect(emissor.enviadas[0]).toMatchObject({
      referencia: expect.stringMatching(/^[0-9a-f]{32}$/),
      tipo: 'DEVOLUCAO_VENDA',
      finalidade: 'DEVOLUCAO',
      entrada: true,
      operacao: 'DENTRO_ESTADO',
      regime: 'SIMPLES',
      chavesReferenciadas: [venda.chave],
      itens: [{ codigo: 'FONE-01', quantidade: 2, cfop: '1202', valorUnitario: 100 }],
    });
  });

  it('recusa na hora, sem criar nota: Operador, sem regra (D13), sem NF de venda, fora de Aguardando NF, NF já ativa', async () => {
    const { dev } = await devolucaoPronta();
    await expect(pedir(dev.id, operador)).rejects.toThrow('Só o Fiscal ou o Gestor emitem, reenviam e cancelam NF.');
    await db.delete(regrasFiscais);
    await expect(pedir(dev.id)).rejects.toThrow('Falta a regra fiscal: Devolução de venda, dentro do estado');
    await configurarFiscalTeste(db, gestor);
    const semVenda = await criarDevolucaoNoEstoqueTeste(db, gestor, { unidades: [{ sku: 'A', destino: 'BOM' }] });
    await expect(pedir(semVenda.id)).rejects.toThrow('Falta a NF de venda: anexe o XML (baixado do Bitbrain) ou busque no Mercado Livre.');
    await db.update(devolucoes).set({ status: 'EM_CONFERENCIA' }).where(eq(devolucoes.id, semVenda.id));
    await expect(pedir(semVenda.id)).rejects.toThrow('A devolução está Em conferência: a NF de devolução só sai em Aguardando NF.');
    expect(await db.select().from(notasFiscais)).toEqual([]);
    expect(fila.enviadas).toEqual([]);

    await pedir(dev.id);
    await expect(pedir(dev.id)).rejects.toThrow('Esta devolução já tem NF de devolução em processamento.');
  });

  it('rejeição → corrigir a regra → "Corrigir e reenviar" com o mesmo ref → autorizada', async () => {
    await configurarFiscalTeste(db, gestor, { naturezas: { DENTRO_ESTADO: 'Devolucao de venda REJEITAR' } });
    const { dev } = await devolucaoPronta();
    const { notaFiscalId } = await pedir(dev.id);
    expect(await rodarTarefasFiscais(db, fila, AGORA)).toEqual(['nfe.emitir']);
    const motivo = '999 - Rejeição simulada: a natureza da operação contém REJEITAR';
    expect(await notaDe(notaFiscalId)).toMatchObject({ situacao: 'REJEITADA', motivoRejeicao: motivo });
    const [d] = await db.select({ status: devolucoes.status }).from(devolucoes).where(eq(devolucoes.id, dev.id));
    expect(d.status).toBe('AGUARDANDO_NF');
    expect((await listarEventos(db, 'devolucao', dev.id)).at(-1)).toMatchObject({ acao: 'nf_rejeitada', dados: { notaFiscalId, motivo } });
    await expect(pedir(dev.id)).rejects.toThrow('Esta devolução tem NF rejeitada: use "Corrigir e reenviar" no detalhe da devolução.');

    await salvarRegra(db, sugestaoDeRegra('DEVOLUCAO_VENDA', 'DENTRO_ESTADO', 'SIMPLES'), gestor);
    await reenviarNota(db, notaFiscalId, fiscal);
    expect(await notaDe(notaFiscalId)).toMatchObject({ situacao: 'PROCESSANDO', motivoRejeicao: null, referenciaEmissor: referenciaDaNota(notaFiscalId) });
    expect(await rodarTarefasFiscais(db, fila, AGORA)).toEqual(['nfe.emitir', 'nfe.consultar']);
    expect((await notaDe(notaFiscalId)).situacao).toBe('AUTORIZADA');
    expect((await listarEventos(db, 'nota_fiscal', notaFiscalId)).map((e) => e.acao)).toEqual(['nf_solicitada', 'nf_rejeitada', 'nf_reenviada', 'nf_autorizada']);
    await expect(reenviarNota(db, notaFiscalId, fiscal)).rejects.toThrow('Só uma NF rejeitada pode ser corrigida e reenviada.');
  });

  it('as consultas de cada rodada têm chaves próprias (E4): o reenvio não reaproveita as da rodada anterior', async () => {
    class EmissorRejeitaNaSegunda extends EmissorFalso {
      rodada1 = true;
      private chamadas = 0;
      override async consultar(referencia: string): Promise<SituacaoNota> {
        if (!this.rodada1) return super.consultar(referencia);
        this.chamadas += 1;
        return this.chamadas === 1 ? { situacao: 'PROCESSANDO' } : { situacao: 'REJEITADA', codigo: '999', motivo: 'Rejeição simulada' };
      }
    }
    const emissorRodadas = new EmissorRejeitaNaSegunda();
    definirEmissorParaTestes(emissorRodadas);
    const { dev } = await devolucaoPronta();
    const { notaFiscalId } = await pedir(dev.id);
    const solicitada = await notaDe(notaFiscalId);
    const chavesDasConsultas = () =>
      fila.enviadas.filter((t) => t.nome === 'nfe.consultar').map((t) => t.opcoes?.chaveUnica as string);

    await rodarTarefasFiscais(db, fila, AGORA);
    const rejeitada = await notaDe(notaFiscalId);
    expect(rejeitada.situacao).toBe('REJEITADA');
    const chavesAntes = chavesDasConsultas();
    expect(chavesAntes.length).toBeGreaterThan(0);

    emissorRodadas.rodada1 = false;
    await reenviarNota(db, notaFiscalId, fiscal);
    const reenviada = await notaDe(notaFiscalId);
    expect(reenviada.atualizadaEm.getTime()).not.toBe(rejeitada.atualizadaEm.getTime());
    await rodarTarefasFiscais(db, fila, AGORA);
    expect((await notaDe(notaFiscalId)).situacao).toBe('AUTORIZADA');
    const chavesDepois = chavesDasConsultas().filter((c) => !chavesAntes.includes(c));
    expect(chavesDepois.length).toBeGreaterThan(0);

    expect(chavesAntes.filter((c) => chavesDepois.includes(c))).toEqual([]);
    for (const c of chavesAntes) expect(c.startsWith(`${notaFiscalId}:${solicitada.atualizadaEm.getTime()}:`)).toBe(true);
    for (const c of chavesDepois) expect(c.startsWith(`${notaFiscalId}:${reenviada.atualizadaEm.getTime()}:`)).toBe(true);
  });

  it('se a montagem falhar no worker (regra apagada depois do pedido), a nota vira rejeitada com a mensagem', async () => {
    const { dev } = await devolucaoPronta();
    const { notaFiscalId } = await pedir(dev.id);
    await db.delete(regrasFiscais);
    await rodarTarefasFiscais(db, fila, AGORA);
    expect(await notaDe(notaFiscalId)).toMatchObject({ situacao: 'REJEITADA', motivoRejeicao: 'Falta a regra fiscal: Devolução de venda, dentro do estado' });
    expect(emissor.enviadas).toEqual([]);
  });

  it('manipuladores idempotentes: rodar de novo depois da autorização não muda nada; nota que não existe termina sem erro', async () => {
    const { dev } = await devolucaoPronta();
    const { notaFiscalId } = await pedir(dev.id);
    await rodarTarefasFiscais(db, fila, AGORA);
    const antes = await notaDe(notaFiscalId);
    const ctx = { db, fila, agora: AGORA, tentativa: 2 };
    await manipuladoresFiscal['nfe.emitir']?.({ notaFiscalId }, ctx);
    await manipuladoresFiscal['nfe.consultar']?.({ notaFiscalId, consulta: 2 }, ctx);
    expect(await notaDe(notaFiscalId)).toEqual(antes);
    await expect(manipuladoresFiscal['nfe.consultar']?.({ notaFiscalId: randomUUID(), consulta: 1 }, ctx)).resolves.toBeUndefined();
  });

  it('falha passageira do emissor lança (a fila tenta de novo) e a nota continua em processamento', async () => {
    class EmissorForaDoAr extends EmissorFalso {
      override async consultar(): Promise<SituacaoNota> {
        throw new ErroEmissorIndisponivel('A Focus NFe respondeu 503 (GET /v2/nfe/x).');
      }
    }
    definirEmissorParaTestes(new EmissorForaDoAr());
    const { dev } = await devolucaoPronta();
    const { notaFiscalId } = await pedir(dev.id);
    await expect(rodarTarefasFiscais(db, fila, AGORA)).rejects.toBeInstanceOf(ErroEmissorIndisponivel);
    expect((await notaDe(notaFiscalId)).situacao).toBe('PROCESSANDO');
  });

  it('enquanto processa, reagenda com espera crescente (D12) e, no limite, falha para ir a Falhas', async () => {
    class EmissorLento extends EmissorFalso {
      override async consultar(): Promise<SituacaoNota> {
        return { situacao: 'PROCESSANDO' };
      }
    }
    definirEmissorParaTestes(new EmissorLento());
    const { dev } = await devolucaoPronta();
    const { notaFiscalId } = await pedir(dev.id);
    await rodarTarefasFiscais(db, fila, AGORA, 7);
    const esperas = fila.enviadas
      .filter((t) => t.nome === 'nfe.consultar')
      .map((t) => (t.opcoes?.iniciarEm?.getTime() ?? 0) - AGORA.getTime());
    expect(esperas.slice(0, 6)).toEqual([10_000, 30_000, 60_000, 120_000, 300_000, 600_000]);
    await expect(processarConsulta(db, fila, notaFiscalId, LIMITE_CONSULTAS, AGORA)).rejects.toThrow(
      `continua em processamento depois de ${LIMITE_CONSULTAS} consultas`,
    );
  });

  it('série diferente da configurada fica registrada no histórico da nota (decisão 13)', async () => {
    await configurarFiscalTeste(db, gestor, { serie: '2' });
    const { dev } = await devolucaoPronta();
    const { notaFiscalId } = await pedir(dev.id);
    await rodarTarefasFiscais(db, fila, AGORA);
    expect((await listarEventos(db, 'nota_fiscal', notaFiscalId)).at(-1)?.dados).toMatchObject({ serie: '1', serieConfigurada: '2' });
  });

  it('devolução do ML sem NF de venda: o conector entrega a nota na hora de emitir (contrato §5.8)', async () => {
    const dev = await criarDevolucaoNoEstoqueTeste(db, gestor, { canal: 'MERCADO_LIVRE', pedido: 'ML-1', unidades: [{ sku: 'FONE-01', destino: 'BOM' }] });
    const { xml, chave } = xmlNotaVendaTeste({ itens: [{ codigo: 'FONE-01' }] });
    definirConectorParaTestes('MERCADO_LIVRE', {
      canal: 'MERCADO_LIVRE',
      listarAtualizadasDesde: () => {
        throw new Error('não usado neste teste');
      },
      obter: async () => {
        throw new Error('não usado neste teste');
      },
      enviarResultadoConferencia: async () => {
        throw new Error('não usado neste teste');
      },
      obterXmlNotaVenda: async () => xml,
    });
    const { notaFiscalId } = await pedir(dev.id);
    expect((await notaDe(notaFiscalId)).chavesReferenciadas).toEqual([chave]);
  });
});
