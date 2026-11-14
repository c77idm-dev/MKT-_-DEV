import { and, asc, eq, lte, ne } from 'drizzle-orm';
import { ErroML } from '@/conectores/marketplace/mercadolivre/cliente';
import { codigoErroML, logErroML } from '@/conectores/marketplace/mercadolivre/erros';
import { renovarTokens, type TokensML } from '@/conectores/marketplace/mercadolivre/oauth';
import type { DbOuTx } from '@/db/client';
import { contasMarketplace, usuarios } from '@/db/schema';
import { cifrar, decifrar } from '@/lib/cifra';
import { pode } from '@/modules/auth/permissoes';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import { registrarEvento } from '@/modules/historico/eventos';
import { chaveCriptografia, type ConfigML } from './config';
import type { SituacaoConta } from './dominio';

/** Renovação sob demanda: quando faltam menos de 5 min. A tarefa ml.renovar-token renova o que vence em menos de 2 h. */
export const MARGEM_TOKEN_MS = 5 * 60 * 1000;
export const MARGEM_RENOVACAO_PROGRAMADA_MS = 2 * 60 * 60 * 1000;

export class ErroContaML extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = 'ErroContaML';
  }
}

export class ErroContaReconectar extends ErroContaML {
  constructor() {
    super('O Mercado Livre recusou o acesso: conecte a conta de novo em Configurações › Mercado Livre.');
    this.name = 'ErroContaReconectar';
  }
}

export type ContaML = {
  id: string;
  sellerId: string;
  situacao: SituacaoConta;
  escopo: string | null;
  expiraEm: Date;
  ultimaSincronizacaoEm: Date | null;
  conectadaEm: Date;
  conectadaPorNome: string | null;
};

export async function obterContaML(db: DbOuTx): Promise<ContaML | null> {
  const [conta] = await db
    .select({
      id: contasMarketplace.id,
      sellerId: contasMarketplace.sellerId,
      situacao: contasMarketplace.situacao,
      escopo: contasMarketplace.escopo,
      expiraEm: contasMarketplace.expiraEm,
      ultimaSincronizacaoEm: contasMarketplace.ultimaSincronizacaoEm,
      conectadaEm: contasMarketplace.conectadaEm,
      conectadaPorNome: usuarios.nome,
    })
    .from(contasMarketplace)
    .leftJoin(usuarios, eq(usuarios.id, contasMarketplace.conectadaPor))
    .where(eq(contasMarketplace.canal, 'MERCADO_LIVRE'))
    .orderBy(asc(contasMarketplace.conectadaEm))
    .limit(1);
  return conta ?? null;
}

/** Spec §7.1: grava (ou atualiza) a conta com os tokens cifrados. Uma conta do ML por vez (decisão 6 do plano). */
export async function conectarConta(db: DbOuTx, tokens: TokensML, usuario: UsuarioSessao, config: ConfigML, agora: Date): Promise<{ contaId: string }> {
  if (!pode(usuario.perfil, 'administrar')) throw new ErroContaML('Só o Gestor conecta a conta do Mercado Livre.');
  const chave = chaveCriptografia(config);
  const sellerId = String(tokens.userId);
  return db.transaction(async (tx) => {
    const [outra] = await tx
      .select({ sellerId: contasMarketplace.sellerId })
      .from(contasMarketplace)
      .where(and(eq(contasMarketplace.canal, 'MERCADO_LIVRE'), ne(contasMarketplace.sellerId, sellerId)))
      .limit(1);
    if (outra) throw new ErroContaML(`Já existe outra conta do Mercado Livre conectada (vendedor ${outra.sellerId}). Desconecte-a antes.`);
    const valores = {
      accessToken: cifrar(tokens.accessToken, chave),
      refreshToken: cifrar(tokens.refreshToken, chave),
      expiraEm: new Date(tokens.expiraEm),
      situacao: 'ATIVA' as const,
      escopo: tokens.escopo || null,
      conectadaPor: usuario.id,
      conectadaEm: agora,
      atualizadaEm: agora,
    };
    const [conta] = await tx
      .insert(contasMarketplace)
      .values({ canal: 'MERCADO_LIVRE', sellerId, ...valores })
      .onConflictDoUpdate({ target: [contasMarketplace.canal, contasMarketplace.sellerId], set: valores })
      .returning({ id: contasMarketplace.id });
    await registrarEvento(tx, {
      entidade: 'conta_marketplace',
      entidadeId: conta.id,
      acao: 'ml_conta_conectada',
      usuarioId: usuario.id,
      dados: { sellerId },
      em: agora,
    });
    return { contaId: conta.id };
  });
}

/** Apaga a conta e os tokens (o ML não tem API de revogação para o app; decisão 6 do plano). */
export async function desconectarConta(db: DbOuTx, usuario: UsuarioSessao, agora: Date): Promise<boolean> {
  if (!pode(usuario.perfil, 'administrar')) throw new ErroContaML('Só o Gestor desconecta a conta do Mercado Livre.');
  return db.transaction(async (tx) => {
    const apagadas = await tx
      .delete(contasMarketplace)
      .where(eq(contasMarketplace.canal, 'MERCADO_LIVRE'))
      .returning({ id: contasMarketplace.id, sellerId: contasMarketplace.sellerId });
    for (const conta of apagadas) {
      await registrarEvento(tx, {
        entidade: 'conta_marketplace',
        entidadeId: conta.id,
        acao: 'ml_conta_desconectada',
        usuarioId: usuario.id,
        dados: { sellerId: conta.sellerId },
        em: agora,
      });
    }
    return apagadas.length > 0;
  });
}

export type OpcoesToken = { config: ConfigML; fetchFn: typeof fetch; agora?: () => Date; margemMs?: number; recusado?: string };

type ResultadoRenovacao = { token: string } | { erro: 'reconectar' | 'sumiu' };

/**
 * Access token válido da conta (spec §7.1). Renova quando faltam menos de `margemMs`, ou quando o ML recusou
 * `recusado` (401). A renovação trava a linha da conta (SELECT ... FOR UPDATE): quem chega depois usa o token que a
 * primeira gravou. O refresh token é de uso único: sempre se grava o novo. `invalid_grant` → RECONECTAR.
 */
export async function tokenValido(db: DbOuTx, contaId: string, o: OpcoesToken): Promise<string> {
  const agora = o.agora ?? (() => new Date());
  const margem = o.margemMs ?? MARGEM_TOKEN_MS;
  const chave = chaveCriptografia(o.config);
  const precisaRenovar = (expiraEm: Date, atual: string) =>
    o.recusado !== undefined ? atual === o.recusado : expiraEm.getTime() - agora().getTime() <= margem;

  const [conta] = await db.select().from(contasMarketplace).where(eq(contasMarketplace.id, contaId));
  if (!conta) throw new ErroContaML('A conta do Mercado Livre não existe mais.');
  if (conta.situacao === 'RECONECTAR') throw new ErroContaReconectar();
  const atual = decifrar(conta.accessToken, chave);
  if (!precisaRenovar(conta.expiraEm, atual)) return atual;

  const resultado = await db.transaction(async (tx): Promise<ResultadoRenovacao> => {
    const [travada] = await tx.select().from(contasMarketplace).where(eq(contasMarketplace.id, contaId)).for('update');
    if (!travada) return { erro: 'sumiu' };
    if (travada.situacao === 'RECONECTAR') return { erro: 'reconectar' };
    const tokenTravado = decifrar(travada.accessToken, chave);
    if (!precisaRenovar(travada.expiraEm, tokenTravado)) return { token: tokenTravado };
    let novos: TokensML;
    try {
      novos = await renovarTokens({
        clientId: o.config.clientId,
        clientSecret: o.config.clientSecret,
        refreshToken: decifrar(travada.refreshToken, chave),
        fetchFn: o.fetchFn,
        agora: agora(),
      });
    } catch (erro) {
      if (!(erro instanceof ErroML) || codigoErroML(erro) !== 'invalid_grant') throw erro;
      logErroML('renovar token', erro, { contaId });
      // Grava o RECONECTAR e devolve (não lança aqui dentro: lançar desfaria a gravação).
      await tx.update(contasMarketplace).set({ situacao: 'RECONECTAR', atualizadaEm: agora() }).where(eq(contasMarketplace.id, contaId));
      await registrarEvento(tx, {
        entidade: 'conta_marketplace',
        entidadeId: contaId,
        acao: 'ml_conta_reconectar',
        usuarioId: null,
        dados: { motivo: 'invalid_grant' },
        em: agora(),
      });
      return { erro: 'reconectar' };
    }
    await tx
      .update(contasMarketplace)
      .set({
        accessToken: cifrar(novos.accessToken, chave),
        refreshToken: cifrar(novos.refreshToken, chave),
        expiraEm: new Date(novos.expiraEm),
        escopo: novos.escopo || travada.escopo,
        situacao: 'ATIVA',
        atualizadaEm: agora(),
      })
      .where(eq(contasMarketplace.id, contaId));
    return { token: novos.accessToken };
  });
  if ('token' in resultado) return resultado.token;
  if (resultado.erro === 'reconectar') throw new ErroContaReconectar();
  throw new ErroContaML('A conta do Mercado Livre não existe mais.');
}

/** Tarefa ml.renovar-token (a cada 5 h): renova as contas ATIVA que vencem em menos de 2 h. */
export async function renovarContasAVencer(
  db: DbOuTx,
  o: { config: ConfigML; fetchFn: typeof fetch; agora: Date },
): Promise<{ renovadas: number; reconectar: number }> {
  const limite = new Date(o.agora.getTime() + MARGEM_RENOVACAO_PROGRAMADA_MS);
  const contas = await db
    .select({ id: contasMarketplace.id })
    .from(contasMarketplace)
    .where(and(eq(contasMarketplace.canal, 'MERCADO_LIVRE'), eq(contasMarketplace.situacao, 'ATIVA'), lte(contasMarketplace.expiraEm, limite)));
  let renovadas = 0;
  let reconectar = 0;
  for (const conta of contas) {
    try {
      await tokenValido(db, conta.id, { config: o.config, fetchFn: o.fetchFn, agora: () => o.agora, margemMs: MARGEM_RENOVACAO_PROGRAMADA_MS });
      renovadas += 1;
    } catch (erro) {
      if (!(erro instanceof ErroContaReconectar)) throw erro;
      reconectar += 1;
    }
  }
  return { renovadas, reconectar };
}

/** Última varredura bem-sucedida (spec §11: alerta depois de 1 h). */
export async function marcarSincronizacao(db: DbOuTx, contaId: string, agora: Date): Promise<void> {
  await db.update(contasMarketplace).set({ ultimaSincronizacaoEm: agora }).where(eq(contasMarketplace.id, contaId));
}
