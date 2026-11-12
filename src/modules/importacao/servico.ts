import { and, eq, lt } from 'drizzle-orm';
import type { DbOuTx } from '@/db/client';
import { importacoes, mapeamentosImportacao } from '@/db/schema';
import { ehUuid } from '@/lib/uuid';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import type { DefinicaoImportacao, LinhaPrevia } from './definicao';
import { aplicarMapeamento, camposFaltando, sanitizarMapeamento, sugerirMapeamento } from './mapeamento';
import type { Planilha } from './planilha';
import type { Mapeamento, ResumoImportacao, TipoImportacao } from './tipos';

export { TAMANHO_MAXIMO_BYTES } from './limites';
const UM_DIA_MS = 24 * 60 * 60 * 1000;

export class ErroImportacao extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = 'ErroImportacao';
  }
}

export type Importacao = typeof importacoes.$inferSelect;
export type Previa = { linhas: LinhaPrevia[]; validas: number; comErro: number; faltando: string[] };

/** Guarda a planilha lida até a confirmação. Aproveita para apagar envios abandonados há mais de 1 dia. */
export async function registrarUpload(
  db: DbOuTx,
  entrada: { tipo: TipoImportacao; nomeArquivo: string; planilha: Planilha; usuarioId: string },
  agora: Date = new Date(),
): Promise<string> {
  await db
    .delete(importacoes)
    .where(and(eq(importacoes.situacao, 'PENDENTE'), lt(importacoes.criadaEm, new Date(agora.getTime() - UM_DIA_MS))));
  const [criada] = await db
    .insert(importacoes)
    .values({
      tipo: entrada.tipo,
      nomeArquivo: entrada.nomeArquivo.slice(0, 200),
      cabecalhos: entrada.planilha.cabecalhos,
      linhas: entrada.planilha.linhas,
      linhaCabecalho: entrada.planilha.linhaCabecalho ?? 1,
      criadoPor: entrada.usuarioId,
      criadaEm: agora,
    })
    .returning({ id: importacoes.id });
  return criada.id;
}

export async function obterImportacao(db: DbOuTx, id: string, tipo: TipoImportacao): Promise<Importacao | null> {
  if (!ehUuid(id)) return null;
  const [imp] = await db
    .select()
    .from(importacoes)
    .where(and(eq(importacoes.id, id), eq(importacoes.tipo, tipo)));
  return imp ?? null;
}

export async function mapeamentoSalvo(db: DbOuTx, tipo: TipoImportacao): Promise<Mapeamento | null> {
  const [linha] = await db
    .select({ mapeamento: mapeamentosImportacao.mapeamento })
    .from(mapeamentosImportacao)
    .where(eq(mapeamentosImportacao.tipo, tipo));
  return linha?.mapeamento ?? null;
}

/** O mapeamento escolhido nesta importação; se ainda não houver, a sugestão (que usa o último mapeamento salvo do tipo). */
export async function mapeamentoEfetivo(db: DbOuTx, def: DefinicaoImportacao, imp: Importacao): Promise<Mapeamento> {
  if (imp.mapeamento) return sanitizarMapeamento(def.campos, imp.cabecalhos, imp.mapeamento);
  return sugerirMapeamento(def.campos, imp.cabecalhos, await mapeamentoSalvo(db, def.tipo));
}

export async function definirMapeamento(
  db: DbOuTx,
  def: DefinicaoImportacao,
  imp: Importacao,
  bruto: Record<string, unknown>,
): Promise<Mapeamento> {
  if (imp.situacao !== 'PENDENTE') throw new ErroImportacao('Esta importação já foi concluída.');
  const mapeamento = sanitizarMapeamento(def.campos, imp.cabecalhos, bruto);
  await db.update(importacoes).set({ mapeamento }).where(eq(importacoes.id, imp.id));
  return mapeamento;
}

export async function calcularPrevia(db: DbOuTx, def: DefinicaoImportacao, imp: Importacao, mapeamento: Mapeamento): Promise<Previa> {
  const faltando = camposFaltando(def.campos, mapeamento).map((c) => c.rotulo);
  if (faltando.length > 0) return { linhas: [], validas: 0, comErro: 0, faltando };
  const mapeadas = aplicarMapeamento({ cabecalhos: imp.cabecalhos, linhas: imp.linhas, linhaCabecalho: imp.linhaCabecalho }, def.campos, mapeamento);
  const linhas = await def.validar(db, mapeadas);
  const comErro = linhas.filter((l) => l.erros.length > 0).length;
  return { linhas, validas: linhas.length - comErro, comErro, faltando };
}

/**
 * Confirma com o mapeamento que a prévia mostrou: grava as linhas válidas numa transação,
 * marca a importação como concluída (só uma vez), descarta as linhas brutas e salva o mapeamento do tipo.
 */
export async function confirmarImportacao(
  db: DbOuTx,
  def: DefinicaoImportacao,
  imp: Importacao,
  bruto: Record<string, unknown>,
  usuario: UsuarioSessao,
  agora: Date = new Date(),
): Promise<ResumoImportacao> {
  if (imp.situacao !== 'PENDENTE') throw new ErroImportacao('Esta importação já foi concluída.');
  const mapeamento = sanitizarMapeamento(def.campos, imp.cabecalhos, bruto);
  const previa = await calcularPrevia(db, def, imp, mapeamento);
  if (previa.faltando.length > 0) throw new ErroImportacao(`Escolha a coluna de: ${previa.faltando.join(', ')}.`);
  if (previa.validas === 0) throw new ErroImportacao('Nenhuma linha está pronta para importar. Corrija a planilha e envie de novo.');
  const validas = previa.linhas.filter((l) => l.erros.length === 0);
  const linhasComErro = previa.linhas.filter((l) => l.erros.length > 0).map((l) => l.numeroLinha);

  return db.transaction(async (tx) => {
    const [travada] = await tx
      .update(importacoes)
      .set({ situacao: 'CONCLUIDA', concluidaEm: agora })
      .where(and(eq(importacoes.id, imp.id), eq(importacoes.situacao, 'PENDENTE')))
      .returning({ id: importacoes.id });
    if (!travada) throw new ErroImportacao('Esta importação já foi concluída.');
    const { criados, atualizados } = await def.aplicar(tx, validas, usuario);
    const resumo: ResumoImportacao = { criados, atualizados, ignorados: previa.comErro, linhasComErro: linhasComErro.slice(0, 200) };
    await tx.update(importacoes).set({ resumo, mapeamento, linhas: [] }).where(eq(importacoes.id, imp.id));
    await tx
      .insert(mapeamentosImportacao)
      .values({ tipo: def.tipo, mapeamento, atualizadoPor: usuario.id, atualizadoEm: agora })
      .onConflictDoUpdate({
        target: mapeamentosImportacao.tipo,
        set: { mapeamento, atualizadoPor: usuario.id, atualizadoEm: agora },
      });
    return resumo;
  });
}
