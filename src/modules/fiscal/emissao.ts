import { randomUUID } from 'node:crypto';
import { and, eq, ne } from 'drizzle-orm';
import { ErroEmissorRecusou } from '@/conectores/nfe/erros';
import { obterEmissorNFe } from '@/conectores/nfe/registro';
import type { Db } from '@/db/client';
import { ehViolacaoDeUnicidade } from '@/db/erros';
import { devolucoes, notasFiscais, notasVenda } from '@/db/schema';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import type { AmbienteNfe } from '@/modules/configuracoes/dominio';
import { ROTULO_STATUS } from '@/modules/devolucoes/dominio';
import { obterFila } from '@/modules/fila/fila';
import { registrarEvento } from '@/modules/historico/eventos';
import { lerConfiguracaoFiscal } from './configuracao';
import { referenciaDaNota } from './dominio';
import { ErroFiscal } from './erros';
import { buscarNotaVendaNoCanal } from './nota-venda';
import { exigirPodeEmitir, montarNotaParaEmissao, obterNota } from './notas';
import { exigirTransicaoNota } from './transicoes-nota';

/** Contrato §5.7. */
export type AlvoEmissao =
  | { tipo: 'DEVOLUCAO_VENDA'; devolucaoId: string }
  | { tipo: 'REMESSA_CONSERTO' | 'REMESSA_TROCA_GARANTIA'; loteId: string };

const MENSAGEM_NOTA_ATIVA = {
  PROCESSANDO: 'Esta devolução já tem NF de devolução em processamento.',
  AUTORIZADA: 'Esta devolução já tem NF de devolução autorizada.',
  REJEITADA: 'Esta devolução tem NF rejeitada: use "Corrigir e reenviar" no detalhe da devolução.',
} as const;

/** Falta do token do ambiente vira mensagem na tela, antes de criar a nota. */
function exigirEmissor(ambiente: AmbienteNfe): void {
  try {
    obterEmissorNFe(ambiente);
  } catch (erro) {
    if (erro instanceof ErroEmissorRecusou) throw new ErroFiscal(erro.message);
    throw erro;
  }
}

/** Contrato §5.8: devolução do ML ainda sem NF de venda → pede ao conector antes de montar. */
async function trazerNotaVendaDoCanal(db: Db, devolucaoId: string, usuario: UsuarioSessao): Promise<void> {
  const [existente] = await db.select({ id: notasVenda.id }).from(notasVenda).where(eq(notasVenda.devolucaoId, devolucaoId)).limit(1);
  if (!existente) await buscarNotaVendaNoCanal(db, devolucaoId, usuario);
}

/**
 * Contrato §5.7: valida tudo (montando a nota), cria a nota em PROCESSANDO e envia `nfe.emitir` na mesma transação.
 * Lança ErroFiscal com a mensagem para a tela.
 */
export async function solicitarEmissao(db: Db, alvo: AlvoEmissao, usuario: UsuarioSessao): Promise<{ notaFiscalId: string }> {
  exigirPodeEmitir(usuario);
  const config = await lerConfiguracaoFiscal(db);
  exigirEmissor(config.ambiente);
  if (alvo.tipo === 'DEVOLUCAO_VENDA') await trazerNotaVendaDoCanal(db, alvo.devolucaoId, usuario);
  const id = randomUUID();
  const referencia = referenciaDaNota(id);
  const destino =
    alvo.tipo === 'DEVOLUCAO_VENDA'
      ? { tipo: alvo.tipo, devolucaoId: alvo.devolucaoId, loteId: null }
      : { tipo: alvo.tipo, devolucaoId: null, loteId: alvo.loteId };
  try {
    return await db.transaction(async (tx) => {
      if (destino.devolucaoId) {
        const [d] = await tx.select({ status: devolucoes.status }).from(devolucoes).where(eq(devolucoes.id, destino.devolucaoId)).for('update');
        if (!d) throw new ErroFiscal('Devolução não encontrada.');
        if (d.status !== 'AGUARDANDO_NF') throw new ErroFiscal(`A devolução está ${ROTULO_STATUS[d.status]}: a NF de devolução só sai em Aguardando NF.`);
        const [ativa] = await tx
          .select({ situacao: notasFiscais.situacao })
          .from(notasFiscais)
          .where(and(eq(notasFiscais.devolucaoId, destino.devolucaoId), ne(notasFiscais.situacao, 'CANCELADA')));
        if (ativa && ativa.situacao !== 'CANCELADA') throw new ErroFiscal(MENSAGEM_NOTA_ATIVA[ativa.situacao]);
      }
      // Decisão 4: monta antes de gravar, para o Fiscal ver na hora o que falta.
      const nota = await montarNotaParaEmissao(tx, destino, referencia);
      exigirTransicaoNota({ de: null, para: 'PROCESSANDO' });
      await tx.insert(notasFiscais).values({
        id,
        ...destino,
        ambiente: config.ambiente,
        referenciaEmissor: referencia,
        chavesReferenciadas: nota.chavesReferenciadas,
        emitidaPor: usuario.id,
      });
      await registrarEvento(tx, {
        entidade: 'nota_fiscal',
        entidadeId: id,
        acao: 'nf_solicitada',
        de: null,
        para: 'PROCESSANDO',
        usuarioId: usuario.id,
        dados: { tipo: destino.tipo, ambiente: config.ambiente },
      });
      if (destino.devolucaoId) {
        await registrarEvento(tx, { entidade: 'devolucao', entidadeId: destino.devolucaoId, acao: 'nf_solicitada', usuarioId: usuario.id, dados: { notaFiscalId: id } });
      }
      await obterFila().enviar('nfe.emitir', { notaFiscalId: id }, { tx });
      return { notaFiscalId: id };
    });
  } catch (erro) {
    if (ehViolacaoDeUnicidade(erro)) throw new ErroFiscal(MENSAGEM_NOTA_ATIVA.PROCESSANDO);
    throw erro;
  }
}

/** Contrato §5.7 e spec §8.6: "corrigir e reenviar" (REJEITADA → PROCESSANDO), com o mesmo `ref` e o ambiente atual. */
export async function reenviarNota(db: Db, notaFiscalId: string, usuario: UsuarioSessao): Promise<void> {
  exigirPodeEmitir(usuario);
  const config = await lerConfiguracaoFiscal(db);
  exigirEmissor(config.ambiente);
  await db.transaction(async (tx) => {
    const nota = await obterNota(tx, notaFiscalId, { travar: true });
    if (!nota) throw new ErroFiscal('NF não encontrada.');
    if (nota.situacao !== 'REJEITADA') throw new ErroFiscal('Só uma NF rejeitada pode ser corrigida e reenviada.');
    exigirTransicaoNota({ de: 'REJEITADA', para: 'PROCESSANDO' });
    // Monta de novo: se a causa ainda está aí (regra, NF de venda, item sem par), o Fiscal vê agora.
    const montada = await montarNotaParaEmissao(tx, nota, nota.referenciaEmissor);
    const agora = new Date();
    await tx
      .update(notasFiscais)
      .set({ situacao: 'PROCESSANDO', motivoRejeicao: null, ambiente: config.ambiente, chavesReferenciadas: montada.chavesReferenciadas, atualizadaEm: agora })
      .where(eq(notasFiscais.id, notaFiscalId));
    await registrarEvento(tx, {
      entidade: 'nota_fiscal',
      entidadeId: notaFiscalId,
      acao: 'nf_reenviada',
      de: 'REJEITADA',
      para: 'PROCESSANDO',
      usuarioId: usuario.id,
      dados: { motivoAnterior: nota.motivoRejeicao },
    });
    if (nota.devolucaoId) {
      await registrarEvento(tx, { entidade: 'devolucao', entidadeId: nota.devolucaoId, acao: 'nf_reenviada', usuarioId: usuario.id, dados: { notaFiscalId } });
    }
    await obterFila().enviar('nfe.emitir', { notaFiscalId }, { tx });
  });
}

export { cancelarNota } from './cancelamento';
