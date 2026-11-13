import { randomUUID } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
import { obterConector } from '@/conectores/marketplace/registro';
import type { DbOuTx } from '@/db/client';
import { ehViolacaoDeUnicidade } from '@/db/erros';
import { devolucoes, notasFiscais, notasVenda } from '@/db/schema';
import { pode } from '@/modules/auth/permissoes';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import { formatarCnpj } from '@/modules/catalogo/documentos';
import { ROTULO_STATUS, type StatusDevolucao } from '@/modules/devolucoes/dominio';
import { registrarEvento } from '@/modules/historico/eventos';
import { obterArmazenamento } from '@/modules/midia/armazenamento';
import { caminhoNotaVenda, salvarArquivo } from './arquivos';
import { lerConfiguracaoFiscal } from './configuracao';
import type { OrigemNotaVenda } from './dominio';
import { ErroFiscal, ErroNotaVendaDuplicada } from './erros';
import { interpretarXmlNotaVenda } from './xml-nota-venda';

/** Devolução encerrada não muda mais a NF de venda. */
const ENCERRADAS: StatusDevolucao[] = ['CANCELADA', 'EXTRAVIADA', 'CONCLUIDA'];

function exigirFiscal(usuario: UsuarioSessao | null): void {
  if (usuario && !pode(usuario.perfil, 'gerir_fiscal')) throw new ErroFiscal('Só o Fiscal ou o Gestor mexem na NF de venda.');
}

/** NF de devolução em processamento ou autorizada: a NF de venda e a escolha dos itens ficam travadas. */
export async function temNotaEmAndamento(db: DbOuTx, devolucaoId: string): Promise<boolean> {
  const [nota] = await db
    .select({ id: notasFiscais.id })
    .from(notasFiscais)
    .where(and(eq(notasFiscais.devolucaoId, devolucaoId), inArray(notasFiscais.situacao, ['PROCESSANDO', 'AUTORIZADA'])))
    .limit(1);
  return nota !== undefined;
}

async function exigirPodeMexer(db: DbOuTx, devolucaoId: string): Promise<void> {
  const [d] = await db.select({ status: devolucoes.status }).from(devolucoes).where(eq(devolucoes.id, devolucaoId));
  if (!d) throw new ErroFiscal('Devolução não encontrada.');
  if (ENCERRADAS.includes(d.status)) throw new ErroFiscal(`A devolução está ${ROTULO_STATUS[d.status].toLowerCase()}: a NF de venda não muda mais.`);
  if (await temNotaEmAndamento(db, devolucaoId)) throw new ErroFiscal('Esta devolução já tem NF de devolução em processamento ou autorizada.');
}

/** Contrato §5.8: o mesmo caminho para a NF anexada pelo Fiscal e para a obtida do Mercado Livre. */
export async function registrarNotaVenda(
  db: DbOuTx,
  devolucaoId: string,
  xml: string,
  origem: OrigemNotaVenda,
  usuario: UsuarioSessao | null,
): Promise<{ notaVendaId: string; chave: string }> {
  exigirFiscal(usuario);
  const dados = interpretarXmlNotaVenda(xml);
  await exigirPodeMexer(db, devolucaoId);
  const { emitente } = await lerConfiguracaoFiscal(db);
  if (dados.cnpjEmitente !== emitente.cnpj) {
    throw new ErroFiscal(`Esta NF de venda foi emitida por outro CNPJ (${formatarCnpj(dados.cnpjEmitente)}): anexe a nota emitida pela empresa.`);
  }
  const [existente] = await db
    .select({ id: notasVenda.id })
    .from(notasVenda)
    .where(and(eq(notasVenda.devolucaoId, devolucaoId), eq(notasVenda.chave, dados.chave)));
  if (existente) throw new ErroNotaVendaDuplicada();

  const id = randomUUID();
  const caminho = caminhoNotaVenda(devolucaoId, id);
  await salvarArquivo(caminho, Buffer.from(xml, 'utf8'), 'application/xml');
  try {
    await db.transaction(async (tx) => {
      await tx.insert(notasVenda).values({
        id,
        devolucaoId,
        chave: dados.chave,
        origem,
        xmlCaminho: caminho,
        destinatario: dados.destinatario,
        itens: dados.itens,
        emitidaEm: dados.emitidaEm,
        anexadaPor: usuario?.id ?? null,
      });
      await registrarEvento(tx, {
        entidade: 'devolucao',
        entidadeId: devolucaoId,
        acao: origem === 'ANEXO' ? 'nota_venda_anexada' : 'nota_venda_obtida_ml',
        usuarioId: usuario?.id ?? null,
        dados: { notaVendaId: id, chave: dados.chave },
      });
    });
  } catch (erro) {
    await obterArmazenamento()
      .apagar(caminho)
      .catch(() => undefined);
    if (ehViolacaoDeUnicidade(erro)) throw new ErroNotaVendaDuplicada();
    throw erro;
  }
  return { notaVendaId: id, chave: dados.chave };
}

/** (extra) Remove a NF de venda anexada por engano, enquanto não há NF de devolução em processamento ou autorizada. */
export async function removerNotaVenda(db: DbOuTx, devolucaoId: string, notaVendaId: string, usuario: UsuarioSessao): Promise<void> {
  exigirFiscal(usuario);
  await exigirPodeMexer(db, devolucaoId);
  const [nota] = await db
    .select({ id: notasVenda.id, chave: notasVenda.chave, xmlCaminho: notasVenda.xmlCaminho })
    .from(notasVenda)
    .where(and(eq(notasVenda.id, notaVendaId), eq(notasVenda.devolucaoId, devolucaoId)));
  if (!nota) throw new ErroFiscal('NF de venda não encontrada.');
  await db.transaction(async (tx) => {
    await tx.delete(notasVenda).where(eq(notasVenda.id, nota.id));
    await registrarEvento(tx, {
      entidade: 'devolucao',
      entidadeId: devolucaoId,
      acao: 'nota_venda_removida',
      usuarioId: usuario.id,
      dados: { notaVendaId: nota.id, chave: nota.chave },
    });
  });
  await obterArmazenamento()
    .apagar(nota.xmlCaminho)
    .catch(() => undefined);
}

/**
 * Contrato §5.8: na devolução do Mercado Livre, pede o XML de cada pedido ao conector. `consultou: false` quando não é do ML
 * ou não há conector (o registro devolve null até a Fase 3, ou sem conta ATIVA).
 */
export async function buscarNotaVendaNoCanal(
  db: DbOuTx,
  devolucaoId: string,
  usuario: UsuarioSessao | null,
): Promise<{ consultou: boolean; encontradas: number }> {
  exigirFiscal(usuario);
  const [d] = await db.select({ canal: devolucoes.canal, pedidos: devolucoes.pedidosExternos }).from(devolucoes).where(eq(devolucoes.id, devolucaoId));
  if (!d || d.canal !== 'MERCADO_LIVRE') return { consultou: false, encontradas: 0 };
  const conector = await obterConector(db, 'MERCADO_LIVRE');
  if (!conector) return { consultou: false, encontradas: 0 };
  let encontradas = 0;
  for (const pedido of d.pedidos) {
    let xml: string | null;
    try {
      xml = await conector.obterXmlNotaVenda(pedido);
    } catch {
      throw new ErroFiscal('Não foi possível consultar o Mercado Livre agora: tente de novo ou anexe o XML.');
    }
    if (!xml) continue;
    try {
      await registrarNotaVenda(db, devolucaoId, xml, 'MERCADO_LIVRE', usuario);
      encontradas += 1;
    } catch (erro) {
      if (erro instanceof ErroNotaVendaDuplicada) continue;
      throw erro;
    }
  }
  return { consultou: true, encontradas };
}
