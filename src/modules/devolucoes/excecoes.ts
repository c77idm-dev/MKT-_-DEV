import { and, eq, inArray, sql } from 'drizzle-orm';
import type { DbOuTx } from '@/db/client';
import { devolucoes, itensDevolucao, notasFiscais } from '@/db/schema';
import { ehUuid } from '@/lib/uuid';
import { devolucaoVisivel } from '@/modules/apagadas/filtro';
import { pode } from '@/modules/auth/permissoes';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import { idsDosProdutos } from '@/modules/catalogo/produtos';
import { registrarEvento } from '@/modules/historico/eventos';
import {
  chavePedido,
  codigosAtivosPorPedido,
  codigosNaoIdentificadosPorRastreio,
  expandirUnidades,
  mensagemLimiteUnidades,
  mensagemRastreioNaoIdentificado,
  validarNovaDevolucao,
  type EntradaNovaDevolucao,
} from './criar';
import { LIMITE_UNIDADES_DEVOLUCAO, type StatusDevolucao } from './dominio';
import { ErroDevolucao } from './erros';
import { exigirTransicao } from './transicoes';

const MENSAGEM_NOTA_ATIVA = {
  PROCESSANDO: 'A NF de devolução está em processamento: espere o resultado antes de corrigir.',
  AUTORIZADA: 'A devolução tem NF de devolução autorizada: o Fiscal cancela a NF antes.',
} as const;

/**
 * (extra, emenda E29) O que já saiu do sistema não volta: as correções do Gestor que mexem na conferência ou no status
 * recusam a devolução com NF de devolução autorizada (o Fiscal cancela antes) ou ainda em processamento (a autorização
 * mudaria a devolução por baixo da correção). A rejeitada não conta: ela só sai de novo em Aguardando NF.
 */
export async function exigirSemNotaAtiva(tx: DbOuTx, devolucaoId: string): Promise<void> {
  const [nota] = await tx
    .select({ situacao: notasFiscais.situacao })
    .from(notasFiscais)
    .where(and(eq(notasFiscais.devolucaoId, devolucaoId), inArray(notasFiscais.situacao, ['PROCESSANDO', 'AUTORIZADA'])))
    .limit(1);
  if (nota) throw new ErroDevolucao(MENSAGEM_NOTA_ATIVA[nota.situacao as keyof typeof MENSAGEM_NOTA_ATIVA]);
}

/** Onde o Gestor cancela ou marca como extraviada: antes da chegada (spec §5.2) e, desde a E29 (extra), antes da NF. */
const ENCERRAVEIS: readonly StatusDevolucao[] = ['PENDENTE_CHEGADA', 'AGUARDANDO_CONFERENCIA', 'EM_CONFERENCIA', 'AGUARDANDO_NF'];
const MENSAGEM_SO_GESTOR = 'Só o Gestor cancela ou marca como extraviada uma devolução.';

/**
 * Spec §5.2: Pendente de chegada → Cancelada ou Extraviada, por ação manual do Gestor, com motivo no histórico.
 * (extra, emenda E29) Vale também em Aguardando conferência, Em conferência e Aguardando NF (sem NF em processamento ou
 * autorizada), só para o Gestor, e solta a trava da conferência. O nome continua o da E24.
 * A devolução é lida com trava (FOR UPDATE): se dois Gestores agem ao mesmo tempo, só um vence e só um evento é gravado.
 */
export async function encerrarPendente(
  db: DbOuTx,
  id: string,
  para: 'CANCELADA' | 'EXTRAVIADA',
  motivoBruto: string,
  usuario: UsuarioSessao,
  agora: Date = new Date(),
): Promise<void> {
  exigirTransicao({ de: 'PENDENTE_CHEGADA', para, ator: usuario.perfil }, MENSAGEM_SO_GESTOR);
  const motivo = motivoBruto.trim();
  if (motivo.length < 3) throw new ErroDevolucao('Explique o motivo (pelo menos 3 letras).');
  if (motivo.length > 500) throw new ErroDevolucao('Motivo: no máximo 500 caracteres.');
  if (!ehUuid(id)) throw new ErroDevolucao('Devolução não encontrada.');
  await db.transaction(async (tx) => {
    const [d] = await tx
      .select({ status: devolucoes.status, conferenteId: devolucoes.conferenteId })
      .from(devolucoes)
      .where(and(eq(devolucoes.id, id), devolucaoVisivel))
      .for('update');
    if (!d) throw new ErroDevolucao('Devolução não encontrada.');
    if (!ENCERRAVEIS.includes(d.status)) {
      throw new ErroDevolucao(
        'Só dá para cancelar ou marcar como extraviada uma devolução antes da NF (Pendente de chegada, Aguardando conferência, Em conferência ou Aguardando NF).',
      );
    }
    exigirTransicao({ de: d.status, para, ator: usuario.perfil }, MENSAGEM_SO_GESTOR);
    if (d.status === 'AGUARDANDO_NF') await exigirSemNotaAtiva(tx, id);
    const soltarTrava = d.status === 'EM_CONFERENCIA';
    await tx
      .update(devolucoes)
      .set({ status: para, atualizadaEm: agora, ...(soltarTrava ? { conferenteId: null, conferenciaIniciadaEm: null } : {}) })
      .where(eq(devolucoes.id, id));
    await registrarEvento(tx, {
      entidade: 'devolucao',
      entidadeId: id,
      acao: para === 'CANCELADA' ? 'cancelada' : 'extraviada',
      de: d.status,
      para,
      usuarioId: usuario.id,
      dados: {
        motivo,
        antes: { status: d.status, ...(soltarTrava ? { conferenteId: d.conferenteId } : {}) },
        depois: { status: para, ...(soltarTrava ? { conferenteId: null } : {}) },
      },
      em: agora,
    });
  });
}

/**
 * Spec §5.2: depois que o pedido certo é descoberto, o Gestor liga o pacote não identificado a ele e a marca sai.
 * Preenche canal, pedido, reclamação, transportadora e (opcionalmente) os itens. "Juntar duas devoluções" fica para depois.
 * O UPDATE é condicional a `nao_identificada`: se dois Gestores identificam ao mesmo tempo, só um vence.
 */
export async function identificarDevolucao(
  db: DbOuTx,
  id: string,
  entrada: EntradaNovaDevolucao,
  usuario: UsuarioSessao,
  agora: Date = new Date(),
): Promise<void> {
  if (!pode(usuario.perfil, 'administrar')) throw new ErroDevolucao('Só o Gestor identifica um pacote não identificado.');
  if (!ehUuid(id)) throw new ErroDevolucao('Devolução não encontrada.');
  const { dados, erros } = validarNovaDevolucao(entrada, { exigirItens: false });
  if (!dados) throw new ErroDevolucao(erros.join('; '));
  // Conferência de pedido duplicado fora da transação: padrão aceito (PF7), a corrida é estreita e o Gestor revê.
  const outra = (await codigosAtivosPorPedido(db, [{ canal: dados.canal, pedido: dados.pedido }])).get(chavePedido(dados.canal, dados.pedido));
  if (outra) {
    throw new ErroDevolucao(`O pedido já tem a devolução ${outra}. Se ela ainda está pendente de chegada, cancele-a e tente de novo.`);
  }
  // Rastreio informado que já é de OUTRO pacote não identificado ativo: o próprio pacote não conta.
  if (dados.rastreio) {
    const outroPacote = (await codigosNaoIdentificadosPorRastreio(db, [dados.rastreio], id)).get(dados.rastreio);
    if (outroPacote) throw new ErroDevolucao(mensagemRastreioNaoIdentificado(outroPacote));
  }
  const unidades = expandirUnidades(dados.itens);
  const produtosPorSku = await idsDosProdutos(db, [...new Set(unidades)]);

  await db.transaction(async (tx) => {
    const [atualizada] = await tx
      .update(devolucoes)
      .set({
        canal: dados.canal,
        pedidosExternos: [dados.pedido],
        reclamacaoId: dados.reclamacaoId,
        transportadora: dados.transportadora,
        naoIdentificada: false,
        atualizadaEm: agora,
      })
      .where(and(eq(devolucoes.id, id), eq(devolucoes.naoIdentificada, true), devolucaoVisivel))
      .returning({ id: devolucoes.id });
    if (!atualizada) {
      const [existe] = await tx.select({ id: devolucoes.id }).from(devolucoes).where(and(eq(devolucoes.id, id), devolucaoVisivel)).limit(1);
      if (!existe) throw new ErroDevolucao('Devolução não encontrada.');
      throw new ErroDevolucao('Esta devolução já foi identificada.');
    }
    if (unidades.length > 0) {
      const [{ maior }] = await tx
        .select({ maior: sql<number>`coalesce(max(${itensDevolucao.unidade}), 0)::int` })
        .from(itensDevolucao)
        .where(eq(itensDevolucao.devolucaoId, id));
      if (maior + unidades.length > LIMITE_UNIDADES_DEVOLUCAO) throw new ErroDevolucao(mensagemLimiteUnidades(maior + unidades.length));
      await tx.insert(itensDevolucao).values(
        unidades.map((sku, i) => ({ devolucaoId: id, unidade: maior + i + 1, sku, produtoEsperadoId: produtosPorSku.get(sku) ?? null })),
      );
    }
    await registrarEvento(tx, {
      entidade: 'devolucao',
      entidadeId: id,
      acao: 'identificada',
      usuarioId: usuario.id,
      dados: { canal: dados.canal, pedido: dados.pedido, unidades: unidades.length },
      em: agora,
    });
  });
}
