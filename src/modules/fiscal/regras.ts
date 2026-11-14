import { and, eq } from 'drizzle-orm';
import type { DbOuTx } from '@/db/client';
import { regrasFiscais } from '@/db/schema';
import { pode } from '@/modules/auth/permissoes';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import type { RegimeTributario } from '@/modules/configuracoes/dominio';
import { lerConfiguracao } from '@/modules/configuracoes/ler';
import { registrarEvento } from '@/modules/historico/eventos';
import {
  CSOSN,
  CST_ICMS,
  CST_PIS_COFINS,
  OPERACOES_FISCAIS,
  ROTULO_OPERACAO,
  ROTULO_REGIME,
  ROTULO_TIPO_NOTA,
  TIPOS_NOTA,
  type OperacaoFiscal,
  type TipoNota,
} from './dominio';
import { ErroFiscal } from './erros';

/** Spec §5.1 (RegraFiscal): por tipo de nota e operação, CFOP, CST/CSOSN, CST de PIS e COFINS e o modelo de informações. */
export type RegraFiscal = {
  tipoNota: TipoNota;
  operacao: OperacaoFiscal;
  cfop: string;
  icmsSituacaoTributaria: string;
  pisSituacaoTributaria: string;
  cofinsSituacaoTributaria: string;
  naturezaOperacao: string;
  informacoesComplementares: string | null;
};
export type RegraListada = RegraFiscal & { salva: boolean; atualizadoEm: Date | null };
/** Campos do formulário, como chegam (texto). */
export type EntradaRegra = { cfop: string; icms: string; pis: string; cofins: string; natureza: string; informacoes: string };

export const NATUREZA_MAXIMA = 60;
export const INFORMACOES_MAXIMAS = 2000;

type Sugestao = { cfop: string; csosn: string; cst: string; pisCofins: string; natureza: string };

/** Spec §8.3 (CFOP) mais CST/CSOSN e PIS/COFINS da pesquisa focus-nfe.md §2. Só preenchem o formulário: nada nasce gravado (D13). */
const SUGESTOES: Record<TipoNota, Record<OperacaoFiscal, Sugestao>> = {
  DEVOLUCAO_VENDA: {
    DENTRO_ESTADO: { cfop: '1202', csosn: '900', cst: '00', pisCofins: '98', natureza: 'Devolucao de venda' },
    FORA_ESTADO: { cfop: '2202', csosn: '900', cst: '00', pisCofins: '98', natureza: 'Devolucao de venda' },
  },
  REMESSA_CONSERTO: {
    DENTRO_ESTADO: { cfop: '5915', csosn: '400', cst: '41', pisCofins: '49', natureza: 'Remessa para conserto' },
    FORA_ESTADO: { cfop: '6915', csosn: '400', cst: '41', pisCofins: '49', natureza: 'Remessa para conserto' },
  },
  REMESSA_TROCA_GARANTIA: {
    DENTRO_ESTADO: { cfop: '5949', csosn: '400', cst: '41', pisCofins: '49', natureza: 'Remessa para troca ou garantia' },
    FORA_ESTADO: { cfop: '6949', csosn: '400', cst: '41', pisCofins: '49', natureza: 'Remessa para troca ou garantia' },
  },
};

/**
 * Modelo das informações complementares. Marcadores: {chaves} (NF de venda referenciadas), {devolucao} (código DEV),
 * {seriais} (S/N) e, nas remessas (Fase 5, spec §8.5), {lote}.
 */
const INFORMACOES_SUGERIDAS: Record<TipoNota, string> = {
  DEVOLUCAO_VENDA: 'Devolucao referente a NF-e {chaves}. Devolucao {devolucao}.',
  REMESSA_CONSERTO: 'Lote {lote}. S/N: {seriais}.',
  REMESSA_TROCA_GARANTIA: 'Lote {lote}. S/N: {seriais}.',
};

export function rotuloRegra(tipo: TipoNota, operacao: OperacaoFiscal): string {
  return `${ROTULO_TIPO_NOTA[tipo]}, ${ROTULO_OPERACAO[operacao]}`;
}

export function sugestaoDeRegra(tipo: TipoNota, operacao: OperacaoFiscal, regime: RegimeTributario): RegraFiscal {
  const s = SUGESTOES[tipo][operacao];
  return {
    tipoNota: tipo,
    operacao,
    cfop: s.cfop,
    icmsSituacaoTributaria: regime === 'SIMPLES' ? s.csosn : s.cst,
    pisSituacaoTributaria: s.pisCofins,
    cofinsSituacaoTributaria: s.pisCofins,
    naturezaOperacao: s.natureza,
    informacoesComplementares: INFORMACOES_SUGERIDAS[tipo],
  };
}

/** CFOP de entrada (devolução de venda) começa com 1 (dentro) ou 2 (fora); de saída (remessa), com 5 ou 6. */
export function primeiroDigitoCfop(tipo: TipoNota, operacao: OperacaoFiscal): string {
  const dentro = operacao === 'DENTRO_ESTADO';
  if (tipo === 'DEVOLUCAO_VENDA') return dentro ? '1' : '2';
  return dentro ? '5' : '6';
}

export function conferirIcmsComRegime(icms: string, regime: RegimeTributario): string | null {
  if (regime === 'SIMPLES') {
    return (CSOSN as readonly string[]).includes(icms) ? null : `No ${ROTULO_REGIME.SIMPLES} o ICMS usa CSOSN (${CSOSN.join(', ')}), não ${icms}.`;
  }
  return (CST_ICMS as readonly string[]).includes(icms) ? null : `No ${ROTULO_REGIME[regime]} o ICMS usa CST (${CST_ICMS.join(', ')}), não ${icms}.`;
}

export function validarRegra(
  tipo: TipoNota,
  operacao: OperacaoFiscal,
  e: EntradaRegra,
  regime: RegimeTributario,
): { dados: RegraFiscal | null; erros: string[] } {
  const erros: string[] = [];
  const cfop = e.cfop.replace(/\D/g, '');
  const digito = primeiroDigitoCfop(tipo, operacao);
  if (!/^\d{4}$/.test(cfop)) erros.push('CFOP: use 4 números');
  else if (!cfop.startsWith(digito)) erros.push(`O CFOP ${cfop} não serve para ${rotuloRegra(tipo, operacao)}: use um CFOP que começa com ${digito}`);
  const icms = e.icms.trim();
  const erroIcms = conferirIcmsComRegime(icms, regime);
  if (erroIcms) erros.push(erroIcms);
  const pis = e.pis.trim();
  const cofins = e.cofins.trim();
  if (!(CST_PIS_COFINS as readonly string[]).includes(pis)) erros.push(`CST do PIS inválido: ${pis || '(vazio)'}`);
  if (!(CST_PIS_COFINS as readonly string[]).includes(cofins)) erros.push(`CST do COFINS inválido: ${cofins || '(vazio)'}`);
  const natureza = e.natureza.trim().replace(/\s+/g, ' ');
  if (!natureza) erros.push('Informe a natureza da operação');
  else if (natureza.length > NATUREZA_MAXIMA) erros.push(`Natureza da operação: no máximo ${NATUREZA_MAXIMA} caracteres`);
  const informacoes = e.informacoes.trim();
  if (informacoes.length > INFORMACOES_MAXIMAS) erros.push(`Informações complementares: no máximo ${INFORMACOES_MAXIMAS} caracteres`);
  if (erros.length > 0) return { dados: null, erros };
  return {
    dados: {
      tipoNota: tipo,
      operacao,
      cfop,
      icmsSituacaoTributaria: icms,
      pisSituacaoTributaria: pis,
      cofinsSituacaoTributaria: cofins,
      naturezaOperacao: natureza,
      informacoesComplementares: informacoes || null,
    },
    erros: [],
  };
}

function paraRegra(linha: typeof regrasFiscais.$inferSelect): RegraFiscal {
  return {
    tipoNota: linha.tipoNota,
    operacao: linha.operacao,
    cfop: linha.cfop,
    icmsSituacaoTributaria: linha.icmsSituacaoTributaria,
    pisSituacaoTributaria: linha.pisSituacaoTributaria,
    cofinsSituacaoTributaria: linha.cofinsSituacaoTributaria,
    naturezaOperacao: linha.naturezaOperacao,
    informacoesComplementares: linha.informacoesComplementares,
  };
}

export async function salvarRegra(db: DbOuTx, regra: RegraFiscal, usuario: UsuarioSessao, agora: Date = new Date()): Promise<void> {
  if (!pode(usuario.perfil, 'administrar')) throw new ErroFiscal('Só o Gestor altera as regras fiscais.');
  const campos = {
    cfop: regra.cfop,
    icmsSituacaoTributaria: regra.icmsSituacaoTributaria,
    pisSituacaoTributaria: regra.pisSituacaoTributaria,
    cofinsSituacaoTributaria: regra.cofinsSituacaoTributaria,
    naturezaOperacao: regra.naturezaOperacao,
    informacoesComplementares: regra.informacoesComplementares,
    atualizadoPor: usuario.id,
    atualizadoEm: agora,
  };
  await db.transaction(async (tx) => {
    await tx
      .insert(regrasFiscais)
      .values({ tipoNota: regra.tipoNota, operacao: regra.operacao, ...campos })
      .onConflictDoUpdate({ target: [regrasFiscais.tipoNota, regrasFiscais.operacao], set: campos });
    await registrarEvento(tx, {
      entidade: 'configuracao',
      entidadeId: 'fiscal',
      acao: 'configuracao_alterada',
      usuarioId: usuario.id,
      dados: {
        secao: 'regra_fiscal',
        tipoNota: regra.tipoNota,
        operacao: regra.operacao,
        cfop: regra.cfop,
        icms: regra.icmsSituacaoTributaria,
        pis: regra.pisSituacaoTributaria,
        cofins: regra.cofinsSituacaoTributaria,
      },
    });
  });
}

/** As 6 combinações (3 tipos × 2 operações), salvas ou sugeridas (pelo regime atual; Simples enquanto não houver). */
export async function listarRegras(db: DbOuTx): Promise<{ regime: RegimeTributario | null; regras: RegraListada[] }> {
  const regime = (await lerConfiguracao(db)).regimeTributario ?? null;
  const salvas = await db.select().from(regrasFiscais);
  const regras = TIPOS_NOTA.flatMap((tipo) =>
    OPERACOES_FISCAIS.map((operacao): RegraListada => {
      const salva = salvas.find((r) => r.tipoNota === tipo && r.operacao === operacao);
      if (salva) return { ...paraRegra(salva), salva: true, atualizadoEm: salva.atualizadoEm };
      return { ...sugestaoDeRegra(tipo, operacao, regime ?? 'SIMPLES'), salva: false, atualizadoEm: null };
    }),
  );
  return { regime, regras };
}

/** Contrato §5.7: a regra salva da combinação, conferida com o regime (CSOSN × CST). Sem ela, a emissão é recusada (D13). */
export async function regraFiscal(db: DbOuTx, tipo: TipoNota, operacao: OperacaoFiscal): Promise<RegraFiscal> {
  const regime = (await lerConfiguracao(db)).regimeTributario;
  if (!regime) throw new ErroFiscal('Escolha o regime tributário em Configurações › Fiscal.');
  const [linha] = await db
    .select()
    .from(regrasFiscais)
    .where(and(eq(regrasFiscais.tipoNota, tipo), eq(regrasFiscais.operacao, operacao)));
  if (!linha) throw new ErroFiscal(`Falta a regra fiscal: ${rotuloRegra(tipo, operacao)}`);
  const regra = paraRegra(linha);
  const erro = conferirIcmsComRegime(regra.icmsSituacaoTributaria, regime);
  if (erro) throw new ErroFiscal(`Regra fiscal ${rotuloRegra(tipo, operacao)}: ${erro} Corrija em Configurações › Fiscal.`);
  return regra;
}
