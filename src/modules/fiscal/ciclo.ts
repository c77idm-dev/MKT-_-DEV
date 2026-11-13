import { and, eq } from 'drizzle-orm';
import { ErroEmissorRecusou } from '@/conectores/nfe/erros';
import { obterEmissorNFe } from '@/conectores/nfe/registro';
import type { SituacaoNota } from '@/conectores/nfe/tipos';
import type { Db, DbOuTx } from '@/db/client';
import { devolucoes, itensDevolucao, notasFiscais } from '@/db/schema';
import { lerConfiguracao } from '@/modules/configuracoes/ler';
import { exigirTransicao } from '@/modules/devolucoes/transicoes';
import { exigirTransicaoItem } from '@/modules/devolucoes/transicoes-item';
import type { Fila } from '@/modules/fila/fila';
import { registrarEvento } from '@/modules/historico/eventos';
import { portaLotes } from '@/modules/lotes/porta';
import { caminhoBaseNfe, salvarArquivo } from './arquivos';
import { esperaAntesDaConsulta, LIMITE_CONSULTAS } from './consultas';
import { ErroFiscal } from './erros';
import { montarNotaParaEmissao, obterNota, type NotaFiscalLinha } from './notas';
import { exigirTransicaoNota } from './transicoes-nota';

type Autorizada = Extract<SituacaoNota, { situacao: 'AUTORIZADA' }>;

/** O XML do cancelamento fica ao lado do XML da nota (contrato §5.2). */
export function caminhoDoCancelamento(xmlCaminho: string): string {
  return xmlCaminho.replace(/\.xml$/, '-cancelamento.xml');
}

/** Manipulador de `nfe.emitir` (contrato §5.1): monta, envia e já faz a 1ª consulta. Idempotente. */
export async function processarEmissao(db: Db, fila: Fila, notaFiscalId: string, agora: Date): Promise<void> {
  const nota = await obterNota(db, notaFiscalId);
  if (!nota || nota.situacao !== 'PROCESSANDO') return;
  try {
    const dados = await montarNotaParaEmissao(db, nota, nota.referenciaEmissor);
    await obterEmissorNFe(nota.ambiente).emitir(dados);
  } catch (erro) {
    // Erro definitivo de negócio não lança: vira rejeição, com a mensagem (contrato §5.1).
    if (erro instanceof ErroFiscal || erro instanceof ErroEmissorRecusou) {
      await registrarRejeicao(db, notaFiscalId, { codigo: null, motivo: erro.message }, agora);
      return;
    }
    throw erro;
  }
  await processarConsulta(db, fila, notaFiscalId, 1, agora);
}

/** Manipulador de `nfe.consultar`: aplica o resultado ou reagenda com espera crescente (D12). */
export async function processarConsulta(db: Db, fila: Fila, notaFiscalId: string, consulta: number, agora: Date): Promise<void> {
  const nota = await obterNota(db, notaFiscalId);
  if (!nota) return;
  if (nota.situacao === 'CANCELADA') {
    await completarCancelamento(db, nota);
    return;
  }
  if (nota.situacao !== 'PROCESSANDO') return;
  const situacao = await obterEmissorNFe(nota.ambiente).consultar(nota.referenciaEmissor);
  switch (situacao.situacao) {
    case 'PROCESSANDO': {
      if (consulta >= LIMITE_CONSULTAS) {
        throw new Error(`A NF ${nota.referenciaEmissor} continua em processamento depois de ${LIMITE_CONSULTAS} consultas.`);
      }
      const proxima = consulta + 1;
      await fila.enviar(
        'nfe.consultar',
        { notaFiscalId, consulta: proxima },
        // Uma série de chaves por rodada de envio (contrato §10, E4): o reenvio da REJEITADA muda o atualizadaEm.
        { chaveUnica: `${notaFiscalId}:${nota.atualizadaEm.getTime()}:${proxima}`, iniciarEm: new Date(agora.getTime() + esperaAntesDaConsulta(proxima) * 1000) },
      );
      return;
    }
    case 'AUTORIZADA':
      await registrarAutorizacao(db, nota, situacao, agora);
      return;
    case 'REJEITADA':
      await registrarRejeicao(db, notaFiscalId, situacao, agora);
      return;
    default:
      throw new Error(`O emissor respondeu ${situacao.situacao} para a NF ${nota.referenciaEmissor}, que está em processamento.`);
  }
}

async function registrarAutorizacao(db: Db, nota: NotaFiscalLinha, s: Autorizada, agora: Date): Promise<void> {
  // Arquivos antes da transação: se o download falhar, a tarefa tenta de novo e nada muda no banco.
  const emissor = obterEmissorNFe(nota.ambiente);
  const [xml, danfe] = await Promise.all([emissor.baixar(s.urlXml), emissor.baixar(s.urlDanfe)]);
  const base = caminhoBaseNfe(nota.id, agora);
  await salvarArquivo(`${base}.xml`, xml, 'application/xml');
  await salvarArquivo(`${base}-danfe.pdf`, danfe, 'application/pdf');
  await db.transaction(async (tx) => {
    const atual = await obterNota(tx, nota.id, { travar: true });
    if (!atual || atual.situacao !== 'PROCESSANDO') return;
    exigirTransicaoNota({ de: 'PROCESSANDO', para: 'AUTORIZADA' });
    const serieConfigurada = (await lerConfiguracao(tx)).serieNfe ?? null;
    const serieDivergente = serieConfigurada !== null && Number(serieConfigurada) !== Number(s.serie);
    await tx
      .update(notasFiscais)
      .set({
        situacao: 'AUTORIZADA',
        chave: s.chave,
        numero: s.numero,
        serie: s.serie,
        xmlCaminho: `${base}.xml`,
        danfeCaminho: `${base}-danfe.pdf`,
        motivoRejeicao: null,
        autorizadaEm: agora,
        atualizadaEm: agora,
      })
      .where(eq(notasFiscais.id, nota.id));
    await registrarEvento(tx, {
      entidade: 'nota_fiscal',
      entidadeId: nota.id,
      acao: 'nf_autorizada',
      de: 'PROCESSANDO',
      para: 'AUTORIZADA',
      usuarioId: null,
      em: agora,
      // D12: o sistema confere a série que volta; diferente vira aviso (a nota continua válida).
      dados: { numero: s.numero, serie: s.serie, chave: s.chave, ...(serieDivergente ? { serieConfigurada } : {}) },
    });
    if (atual.tipo === 'DEVOLUCAO_VENDA' && atual.devolucaoId) await aplicarAutorizacaoDevolucao(tx, atual.devolucaoId, nota.id, s, agora);
    else if (atual.loteId) await portaLotes.aoAutorizarRemessa(tx, atual.loteId, nota.id, agora);
  });
}

/** Spec §6.4 e contrato §5.7: itens BOM → DISPONIVEL_VENDA, porta de lotes, devolução → CONCLUIDA. */
async function aplicarAutorizacaoDevolucao(tx: DbOuTx, devolucaoId: string, notaFiscalId: string, s: Autorizada, agora: Date): Promise<void> {
  const [d] = await tx.select({ status: devolucoes.status }).from(devolucoes).where(eq(devolucoes.id, devolucaoId)).for('update');
  if (!d) return;
  exigirTransicao({ de: d.status, para: 'CONCLUIDA', ator: 'SISTEMA' });
  const bons = await tx
    .select({ id: itensDevolucao.id })
    .from(itensDevolucao)
    .where(and(eq(itensDevolucao.devolucaoId, devolucaoId), eq(itensDevolucao.status, 'AGUARDANDO_NF'), eq(itensDevolucao.destino, 'BOM')));
  for (const item of bons) {
    exigirTransicaoItem({ de: 'AGUARDANDO_NF', para: 'DISPONIVEL_VENDA', ator: 'SISTEMA' });
    await tx.update(itensDevolucao).set({ status: 'DISPONIVEL_VENDA' }).where(eq(itensDevolucao.id, item.id));
    await registrarEvento(tx, {
      entidade: 'item',
      entidadeId: item.id,
      acao: 'item_status',
      de: 'AGUARDANDO_NF',
      para: 'DISPONIVEL_VENDA',
      usuarioId: null,
      em: agora,
      dados: { devolucaoId, notaFiscalId },
    });
  }
  // D11: até a Fase 5 a porta não faz nada e o item PROBLEMA continua em AGUARDANDO_NF.
  await portaLotes.alocarItensProblema(tx, devolucaoId, agora);
  await tx.update(devolucoes).set({ status: 'CONCLUIDA', concluidaEm: agora, atualizadaEm: agora }).where(eq(devolucoes.id, devolucaoId));
  await registrarEvento(tx, {
    entidade: 'devolucao',
    entidadeId: devolucaoId,
    acao: 'nf_autorizada',
    de: d.status,
    para: 'CONCLUIDA',
    usuarioId: null,
    em: agora,
    dados: { notaFiscalId, numero: s.numero, serie: s.serie },
  });
}

async function registrarRejeicao(db: Db, notaFiscalId: string, r: { codigo: string | null; motivo: string }, agora: Date): Promise<void> {
  await db.transaction(async (tx) => {
    const atual = await obterNota(tx, notaFiscalId, { travar: true });
    if (!atual || atual.situacao !== 'PROCESSANDO') return;
    exigirTransicaoNota({ de: 'PROCESSANDO', para: 'REJEITADA' });
    const motivo = (r.codigo ? `${r.codigo} - ${r.motivo}` : r.motivo).slice(0, 1000);
    await tx.update(notasFiscais).set({ situacao: 'REJEITADA', motivoRejeicao: motivo, atualizadaEm: agora }).where(eq(notasFiscais.id, notaFiscalId));
    await registrarEvento(tx, {
      entidade: 'nota_fiscal',
      entidadeId: notaFiscalId,
      acao: 'nf_rejeitada',
      de: 'PROCESSANDO',
      para: 'REJEITADA',
      usuarioId: null,
      em: agora,
      dados: { motivo },
    });
    if (atual.devolucaoId) {
      await registrarEvento(tx, { entidade: 'devolucao', entidadeId: atual.devolucaoId, acao: 'nf_rejeitada', usuarioId: null, em: agora, dados: { notaFiscalId, motivo } });
    }
  });
}

/** Decisão 9: quando o XML do cancelamento não veio na hora, a consulta busca depois. */
async function completarCancelamento(db: Db, nota: NotaFiscalLinha): Promise<void> {
  if (nota.xmlCancelamentoCaminho || !nota.xmlCaminho) return;
  const emissor = obterEmissorNFe(nota.ambiente);
  const situacao = await emissor.consultar(nota.referenciaEmissor);
  if (situacao.situacao !== 'CANCELADA' || !situacao.urlXmlCancelamento) {
    // Lança para a fila tentar de novo e, no limite, a tarefa ir para Falhas: sem o XML, o ZIP do período sai sem este cancelamento.
    throw new Error(`O XML do cancelamento da NF ${nota.referenciaEmissor} ainda não está disponível no emissor.`);
  }
  const caminho = caminhoDoCancelamento(nota.xmlCaminho);
  await salvarArquivo(caminho, await emissor.baixar(situacao.urlXmlCancelamento), 'application/xml');
  await db.update(notasFiscais).set({ xmlCancelamentoCaminho: caminho }).where(eq(notasFiscais.id, nota.id));
}
